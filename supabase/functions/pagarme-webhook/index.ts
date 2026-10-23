/**
 * Edge Function: pagarme-webhook
 *
 * Recebe webhooks de UMA conta pagar.me (endereçada por `?account=<slug>`),
 * grava o evento bruto (idempotente) em `sales_events` e **roteia por tipo**:
 *
 *  1. LEDGER DE VENDAS (`classifyEvent` em `_shared/pagarme/events.ts`):
 *     cobrança, comprador, assinatura e o cronograma de recebíveis. Cobre também
 *     eventos que não são dinheiro (cobrança recusada = taxa de aprovação) e os
 *     que mudam dinheiro já pago (estorno/chargeback).
 *  2. ESTORNO -> FISCAL (`resolveRefundState` em `_shared/pagarme/refunds.ts`):
 *     o caminho de volta. Venda estornada marca as notas daquela cobrança e tira
 *     da fila a que ainda não foi emitida (`apply_charge_refund_to_jobs`).
 *  3. FISCAL — inalterado: apenas `charge.paid` explode em `invoice_jobs`
 *     (COM split -> uma nota por empresa-recebedor; SEM split -> uma da empresa
 *     dona). Essa invariante tem teste dedicado em `events.test.ts`.
 *
 * Wrapper fino: a lógica pura vive em `_shared/pagarme` (base do provedor) e
 * `_shared/nfse` (fiscal), ambas testadas por Vitest.
 *
 * Origem: cada conta tem segredo de webhook PRÓPRIO no Vault, lido via RPC
 * `get_pagarme_webhook_secret(slug)` (service_role). Sem conta/segredo -> rejeita.
 *
 * Idempotência:
 *   - `sales_events` (provider, event_id) único -> evento repetido é ignorado;
 *   - `invoice_jobs` (charge, recipient) único -> upsert ignoreDuplicates;
 *   - ledger: upsert por chave natural (conta × id do recurso).
 *
 * Falha no ledger NÃO derruba a emissão de nota, e vice-versa: os dois efeitos
 * são reportados separadamente na resposta.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { parseChargePaidWebhook } from "../_shared/nfse/parse.ts";
import {
  applySplitMeta,
  enrichEventAddress,
  loadContext,
  resolveAuthoritativeSplit,
  toRow,
} from "../_shared/nfse/pipeline.ts";
import { explodeChargePaid } from "../_shared/nfse/split.ts";
import type { NfseAmbiente, PagarmeAccount } from "../_shared/nfse/types.ts";
import { parseChargeRecord, parseCustomerRecord } from "../_shared/pagarme/charges.ts";
import { classifyEvent } from "../_shared/pagarme/events.ts";
import { resolveRefundState } from "../_shared/pagarme/refunds.ts";
import { parseSubscriptionRecord } from "../_shared/pagarme/subscriptions.ts";
import {
  loadLedgerContext,
  syncChargePayables,
  writeCharge,
  writeCustomer,
  writeCustomerRecord,
  writeSubscription,
} from "../_shared/pagarme/writer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Resolve a conta pagar.me pelo slug (?account=). Retorna null se inexistente/inativa. */
async function loadAccount(supabase: SupabaseClient, slug: string): Promise<PagarmeAccount | null> {
  const { data } = await supabase
    .from("pagarme_accounts")
    .select("id, slug, owner_company_id, organization_id, ambiente, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    slug: data.slug as string,
    ownerCompanyId: data.owner_company_id as string,
    organizationId: data.organization_id as string,
    ambiente: data.ambiente as NfseAmbiente,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // a conta de origem é endereçada pelo slug na URL (?account=<slug>)
  const url = new URL(req.url);
  const slug = url.searchParams.get("account") ?? "";
  const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (!slug) return json({ error: "missing_account" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // verificação de origem: segredo PRÓPRIO da conta (no Vault). Sem conta/segredo -> rejeita.
  const account = await loadAccount(supabase, slug);
  if (!account) return json({ error: "unknown_account" }, 404);

  const { data: expectedSecret } = await supabase.rpc("get_pagarme_webhook_secret", {
    p_slug: slug,
  });
  if (!expectedSecret || provided !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventId = typeof payload.id === "string" ? payload.id : "";
  const eventType = typeof payload.type === "string" ? payload.type : "";
  if (!eventId) return json({ error: "missing_event_id" }, 400);

  const data = (payload.data ?? {}) as Record<string, unknown>;

  // 1) ingest idempotente em sales_events (carimba a conta de origem)
  const { data: inserted, error: salesErr } = await supabase
    .from("sales_events")
    .upsert(
      {
        provider: "pagarme",
        pagarme_account_id: account.id,
        event_id: eventId,
        event_type: eventType,
        resource_id: typeof data.id === "string" ? data.id : null,
        payload,
      },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    )
    .select("id");

  if (salesErr) return json({ error: "sales_event_failed", detail: salesErr.message }, 500);
  if (!inserted || inserted.length === 0) {
    return json({ status: "duplicate_ignored", eventId });
  }

  // ---------------------------------------------------------------------------
  // 2) LEDGER DE VENDAS — roteado por tipo de evento
  // ---------------------------------------------------------------------------
  const action = classifyEvent(eventType);
  const ledger: Record<string, unknown> = {};

  if (action.upsertCharge || action.upsertCustomer || action.upsertSubscription) {
    // sandbox não entra no ledger (ver `loadLedgerContext`) — distinguido aqui
    // para não reportar como falha o que é decisão de projeto
    const ledgerCtx =
      account.ambiente === "producao"
        ? await loadLedgerContext(supabase, { accountId: account.id })
        : null;

    if (account.ambiente !== "producao") {
      ledger.skipped = "sandbox";
    } else if (!ledgerCtx) {
      ledger.error = "ledger_context_unavailable";
    } else {
      try {
        if (action.upsertCharge) {
          const charge = parseChargeRecord(data);
          if (charge) {
            await writeCharge(supabase, ledgerCtx, charge, inserted[0].id);
            if (action.upsertCustomer) await writeCustomer(supabase, ledgerCtx, charge);
            ledger.charge = charge.chargeId;

            if (action.syncPayables) {
              const result = await syncChargePayables(supabase, ledgerCtx, charge.chargeId);
              ledger.receivables = result.written;
              ledger.payablesStatus = result.status;
              // recebedor sem empresa mapeada = dinheiro fora do ledger:
              // reportado para aparecer no diagnóstico, nunca silenciado
              if (result.unmappedRecipients.length > 0) {
                ledger.unmappedRecipients = result.unmappedRecipients;
              }
            }
          }
        } else if (action.upsertCustomer) {
          // em `customer.*` o próprio `data` É o comprador
          const customer = parseCustomerRecord(data);
          if (customer) {
            await writeCustomerRecord(supabase, ledgerCtx, customer);
            ledger.customer = customer.customerId;
          }
        }

        if (action.upsertSubscription) {
          const subscription = parseSubscriptionRecord(data);
          if (subscription) {
            await writeSubscription(supabase, ledgerCtx, subscription);
            ledger.subscription = subscription.subscriptionId;
          }
        }
      } catch (err) {
        // o ledger é reconstruível pelo sync; não deixamos a falha dele impedir
        // a emissão da nota, que é irreversível e sensível a atraso
        ledger.error = err instanceof Error ? err.message : "ledger_write_failed";
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3) ESTORNO -> ESTEIRA FISCAL
  //
  // O caminho de volta do `charge.paid`: venda estornada não pode virar nota. Fica
  // FORA do bloco do ledger de propósito — vale para sandbox (onde a nota de teste
  // também não deve sair) e precisa rodar mesmo com o ledger indisponível, porque
  // emitir NFS-e é irreversível e desfazer custa cancelamento na prefeitura.
  // ---------------------------------------------------------------------------
  const refundState = resolveRefundState({
    eventType,
    chargeStatus: typeof data.status === "string" ? data.status : null,
  });
  if (refundState !== "none" && typeof data.id === "string") {
    const { data: touched, error: refundErr } = await supabase.rpc("apply_charge_refund_to_jobs", {
      p_charge_id: data.id,
      p_state: refundState,
    });
    ledger.refundState = refundState;
    if (refundErr) ledger.refundError = refundErr.message;
    else ledger.refundJobs = touched;
  }

  // ---------------------------------------------------------------------------
  // 4) FISCAL — só `charge.paid` emite nota (invariante coberta por teste)
  // ---------------------------------------------------------------------------
  if (!action.explodeFiscal) {
    await markProcessed(supabase, eventId);
    return json({ status: "processed", eventType, eventId, fiscal: "skipped", ledger });
  }

  const event = parseChargePaidWebhook(payload);
  if (!event) {
    await markProcessed(supabase, eventId, "not_charge_paid");
    return json({ status: "not_charge_paid", eventId, ledger });
  }

  // enriquece o endereço do tomador via ViaCEP (bairro/município/UF + IBGE) — o
  // resultado é "carimbado" em cep_info e usado pela derivação pura do endereço.
  const enrichedEvent = await enrichEventAddress(event);

  // split autoritativo via /payables (quando a conta tem secret key no Vault);
  // senão, cai no split[] do webhook.
  const { event: finalEvent, splitMeta } = await resolveAuthoritativeSplit(
    supabase,
    account,
    enrichedEvent,
  );

  // explode: COM split -> N jobs (recebedores da conta); SEM split -> 1 job da empresa dona
  const ctx = await loadContext(
    supabase,
    account,
    finalEvent.split.map((s) => s.recipientId),
  );
  const { jobs, skipped } = explodeChargePaid(finalEvent, ctx);

  if (jobs.length > 0) {
    // carimba o evento de origem (FK): o uuid já está em mãos do ingest acima
    const rows = jobs.map((j) => ({
      ...toRow(applySplitMeta(j, splitMeta)),
      sales_event_id: inserted[0].id,
    }));
    const { error: jobsErr } = await supabase.from("invoice_jobs").upsert(rows, {
      onConflict: "dedup_scope",
      ignoreDuplicates: true,
    });
    if (jobsErr) return json({ error: "invoice_jobs_failed", detail: jobsErr.message }, 500);
  }

  await markProcessed(supabase, eventId);
  return json({
    status: "processed",
    created: jobs.length,
    splitSource: splitMeta.splitSource,
    skipped,
    ledger,
  });
});

async function markProcessed(
  supabase: SupabaseClient,
  eventId: string,
  note?: string,
): Promise<void> {
  await supabase
    .from("sales_events")
    .update({ processed_at: new Date().toISOString(), process_error: note ?? null })
    .eq("provider", "pagarme")
    .eq("event_id", eventId);
}

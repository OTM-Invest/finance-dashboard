/**
 * Edge Function: crm-revenue-sync
 *
 * Traz do CRM os relatórios de comissão do BTG (um por arquivo importado) e o detalhe
 * por assessor × produto, e grava o espelho (`crm_commission_reports`/`_lines`). Não
 * abre lançamento nenhum: isso é decisão de pessoa, na tela `/receita`, conferida pelo
 * banco em `save_revenue_statement`. Ver docs/features/receita-por-area.md.
 *
 * Acionada por pg_cron (`crm_revenue_cron_invoke`, diário) ou pelo botão "Sincronizar
 * agora" (`request_crm_revenue_sync`), sempre com o segredo `x-sync-secret`.
 *
 * Wrapper fino: contrato, conferência e payload são puros (`_shared/revenue/*`, Vitest).
 *
 * Segurança:
 *   · no CRM, entra como o USUÁRIO DE SERVIÇO (perfil só com `financeiro.receita_btg`).
 *     URL, chave anon, e-mail e senha ficam no VAULT do financeiro (nomes em
 *     `VAULT_NAMES`), lidos por `crm_revenue_sync_config()` — só service role executa.
 *     Nunca no repositório, no env da function nem no log; nada de service role do CRM;
 *   · o segredo `x-sync-secret` também é o do Vault: o cron manda o mesmo valor que a
 *     function confere, sem cópia em outro lugar;
 *   · aqui, grava com service role, mas só pela RPC `crm_commission_sync_apply`, que
 *     confere de novo soma × total antes de escrever;
 *   · relatório que não fecha barra a sincronização INTEIRA — nada é gravado pela metade;
 *   · o erro gravado em `crm_sync_runs` é a mensagem da camada (contrato, conferência,
 *     HTTP), sem cabeçalho nem credencial.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { fetchCommission } from "../_shared/revenue/client.ts";
import { buildSyncPayload, readSyncConfig, resolveWindow } from "../_shared/revenue/sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Comparação em tempo constante — o segredo não vaza pelo tempo de resposta. */
function sameSecret(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: rawConfig, error: configError } = await db.rpc("crm_revenue_sync_config");
  if (configError) return json({ error: configError.message }, 500);
  const config = readSyncConfig(rawConfig);
  // Sem segredo no Vault, ninguém entra — nem para saber o que mais falta.
  if (!config.syncSecret) return json({ error: "Sincronização não configurada" }, 503);
  if (!sameSecret(req.headers.get("x-sync-secret") ?? "", config.syncSecret)) {
    return json({ error: "Não autorizado" }, 401);
  }

  let body: { from?: unknown; to?: unknown; requestedBy?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  let window: { from: string; to: string };
  try {
    window = resolveWindow(body, new Date());
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
  const requestedBy = typeof body.requestedBy === "string" ? body.requestedBy : null;

  // A organização é a das rotas: o CRM é de um escritório só.
  const { data: routes, error: routesError } = await db
    .from("btg_report_routes")
    .select("organization_id");
  if (routesError) return json({ error: routesError.message }, 500);
  const organizations = [...new Set((routes ?? []).map((r) => r.organization_id as string))];
  if (organizations.length === 0) {
    return json({ skipped: "Nenhuma empresa recebe relatório do BTG (rotas vazias)" });
  }
  if (organizations.length > 1) {
    return json(
      { error: "Rotas do BTG em mais de uma organização: o CRM é de um escritório só" },
      409,
    );
  }
  const organizationId = organizations[0];

  const { data: runId, error: runError } = await db.rpc("crm_sync_run_start", {
    p_organization_id: organizationId,
    p_from: window.from,
    p_to: window.to,
    p_requested_by: requestedBy,
  });
  if (runError) return json({ error: runError.message }, 500);

  const finish = (result: unknown, error: string | null) =>
    db.rpc("crm_sync_run_finish", { p_run_id: runId, p_result: result ?? {}, p_error: error });

  if (!config.ok) {
    const message = `Credencial do CRM incompleta no Vault — falta: ${config.missing.join(", ")}`;
    await finish({}, message);
    return json({ error: message }, 503);
  }

  try {
    const commission = await fetchCommission(fetch, config.crm, window.from, window.to);
    const payload = buildSyncPayload(commission);
    const { data: applied, error: applyError } = await db.rpc("crm_commission_sync_apply", {
      p_organization_id: organizationId,
      p_from: window.from,
      p_to: window.to,
      p_reports: payload.reports,
      p_lines: payload.lines,
    });
    if (applyError) throw new Error(applyError.message);

    const result = {
      ...(applied as Record<string, unknown>),
      reports: payload.reports.length,
      lines: payload.lines.length,
    };
    await finish(result, null);
    return json({ ok: true, window, result });
  } catch (error) {
    const message = errorMessage(error);
    await finish({}, message);
    return json({ error: message }, 502);
  }
});

/**
 * Edge Function: nfse-worker
 *
 * Drena a fila fiscal: reivindica jobs `queued` (RPC claim_nfse_jobs, com FOR
 * UPDATE SKIP LOCKED), monta o payload conforme o `document_type` do job
 * (NF-e via buildNfePayload / NFS-e via buildNfsePayload), lê o token do Focus
 * do Vault (RPC get_focus_token) e emite no endpoint do tipo (/v2/nfe ou
 * /v2/nfse) resolvido pelo registry. Dispatcher multi-documento.
 *
 * Acionada por pg_cron (agendado) ou manualmente (POST). Idempotente por job:
 * a `focus_ref` é única; reenviar com a mesma ref é seguro no Focus.
 *
 * Resultado (a `focus_ref` é idempotente, então em dúvida CONSULTAMOS o Focus):
 *   202/200/201  -> job 'processing_authorization' (aguarda webhook/reconcile)
 *   5xx          -> transitório: volta para 'queued' com backoff
 *   4xx          -> confirma no Focus (GET ref): se a nota existe, aplica o status
 *                   real (autorizado/erro); só marca 'rejected' com erro REAL no
 *                   corpo; corpo vazio => ambíguo => retry (nunca rejeita "no vácuo")
 *   exceção      -> volta para 'queued' com backoff (next_attempt_at)
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { focusEmitPath, focusQueryPath } from "../_shared/nfse/builder.ts";
import {
  applyFocusDocument,
  FOCUS_BASE,
  hasFocusError,
  shouldRecheckFiles,
  type FocusJobRef,
} from "../_shared/nfse/focus.ts";
import { buildNfsePayload } from "../_shared/nfse/payload.ts";
import { buildNfePayload, type NfeEmitenteEndereco } from "../_shared/nfse/payloadNfe.ts";
import type {
  FiscalDocumentType,
  NfeProductClassification,
  PagarmeAddress,
} from "../_shared/nfse/types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("NFSE_WORKER_SECRET") ?? "";
const MAX_ATTEMPTS = 5;
// jobs presos neste estado há mais que isto são reconsultados no Focus
const RECONCILE_STALE_MINUTES = 10;

interface InvoiceJobRow {
  id: string;
  company_id: string;
  document_type: FiscalDocumentType | null;
  ambiente: string;
  focus_ref: string;
  valor_servicos: number | string;
  tomador_documento: string | null;
  tomador_nome: string | null;
  tomador_email: string | null;
  tomador_endereco: PagarmeAddress | null;
  item_lista_servico: string | null;
  codigo_tributario_municipio: string | null;
  aliquota_iss: number | null;
  parametros: Record<string, unknown> | null;
  attempts: number;
  metadata: Record<string, unknown> | null;
}

interface FiscalSettingsRow {
  inscricao_municipal: string | null;
  municipio_ibge: string | null;
  optante_simples: boolean | null;
  codigo_opcao_simples_nacional: number | null;
  regime_tributario_simples_nacional: number | null;
  iss_retido: boolean | null;
  inscricao_estadual: string | null;
  regime_tributario: number | null;
  serie: string | null;
  emitente_endereco: Record<string, unknown> | null;
}

interface CompanyRow {
  cnpj: string | null;
  legal_name: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function backoffMinutes(attempts: number): number {
  // 1, 3, 9, 27... minutos (cap em ~3h)
  return Math.min(3 ** Math.max(attempts - 1, 0), 180);
}

function mapEmitenteEndereco(raw: Record<string, unknown> | null): NfeEmitenteEndereco {
  const e = raw ?? {};
  return {
    logradouro: (e.logradouro as string | null) ?? null,
    numero: (e.numero as string | null) ?? null,
    complemento: (e.complemento as string | null) ?? null,
    bairro: (e.bairro as string | null) ?? null,
    municipio: (e.municipio as string | null) ?? null,
    uf: (e.uf as string | null) ?? null,
    cep: (e.cep as string | null) ?? null,
  };
}

/**
 * Monta o payload do Focus conforme o tipo de documento do job, consumindo o
 * snapshot `parametros` (congelado na criação) + emitente/prestador das settings.
 */
function assemblePayload(
  documentType: FiscalDocumentType,
  job: InvoiceJobRow,
  company: CompanyRow | null,
  settings: FiscalSettingsRow | null,
  dataEmissao: string,
): Record<string, unknown> {
  const params = (job.parametros ?? {}) as Record<string, unknown>;

  if (documentType === "nfe") {
    return buildNfePayload({
      dataEmissao,
      serie: settings?.serie ?? null,
      emitente: {
        cnpj: company?.cnpj ?? "",
        nome: company?.legal_name ?? "",
        inscricaoEstadual: settings?.inscricao_estadual ?? null,
        regimeTributario: settings?.regime_tributario ?? 3,
        endereco: mapEmitenteEndereco(settings?.emitente_endereco ?? null),
      },
      destinatario: {
        documento: job.tomador_documento,
        nome: job.tomador_nome,
        email: job.tomador_email,
        endereco: job.tomador_endereco,
      },
      valorProdutos: Number(job.valor_servicos),
      classificacao: params as NfeProductClassification,
    });
  }

  // NFS-e — consome o snapshot `parametros` (fallback p/ colunas/settings)
  return buildNfsePayload({
    dataEmissao,
    prestador: {
      cnpj: company?.cnpj ?? "",
      inscricaoMunicipal: settings?.inscricao_municipal ?? null,
      municipioIbge: settings?.municipio_ibge ?? "3505708",
      optanteSimples:
        (params.optanteSimples as boolean | undefined) ?? settings?.optante_simples ?? null,
      codigoOpcaoSimplesNacional:
        (params.codigoOpcaoSimplesNacional as number | undefined) ??
        settings?.codigo_opcao_simples_nacional ??
        null,
      regimeTributarioSimplesNacional:
        (params.regimeTributarioSimplesNacional as number | undefined) ??
        settings?.regime_tributario_simples_nacional ??
        null,
    },
    tomador: {
      documento: job.tomador_documento,
      nome: job.tomador_nome,
      email: job.tomador_email,
      endereco: job.tomador_endereco,
    },
    servico: {
      valorServicos: Number(job.valor_servicos),
      itemListaServico: (params.itemListaServico as string | undefined) ?? job.item_lista_servico,
      codigoTributarioMunicipio:
        (params.codigoTributarioMunicipio as string | undefined) ?? job.codigo_tributario_municipio,
      aliquotaIss: (params.aliquotaIss as number | undefined) ?? job.aliquota_iss,
      discriminacao:
        (params.discriminacao as string | undefined) ??
        (job.metadata?.discriminacao as string | undefined) ??
        "Prestação de serviço",
    },
    issRetido: (params.issRetido as boolean | undefined) ?? settings?.iss_retido ?? false,
  });
}

/**
 * Consulta o documento no Focus por `ref` (GET no endpoint do tipo). Como a
 * `focus_ref` é idempotente, esta é a FONTE DA VERDADE: usada para confirmar se
 * uma resposta ruim do POST na verdade criou/autorizou a nota. Retorna o doc
 * (HTTP 200) ou null (404/erro — nota inexistente no Focus).
 */
async function queryFocusDoc(
  base: string,
  documentType: FiscalDocumentType,
  ref: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${base}${focusQueryPath(documentType, ref)}`, {
    headers: { Authorization: "Basic " + btoa(`${token}:`) },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function emitJob(
  supabase: SupabaseClient,
  job: InvoiceJobRow,
): Promise<{ id: string; http?: number; status: string }> {
  const [{ data: company }, { data: settings }, { data: token }] = await Promise.all([
    supabase.from("companies").select("cnpj, legal_name").eq("id", job.company_id).single(),
    supabase
      .from("fiscal_company_settings")
      .select(
        "inscricao_municipal, municipio_ibge, optante_simples, codigo_opcao_simples_nacional, regime_tributario_simples_nacional, iss_retido, inscricao_estadual, regime_tributario, serie, emitente_endereco",
      )
      .eq("company_id", job.company_id)
      .single(),
    supabase.rpc("get_focus_token", { p_company_id: job.company_id }),
  ]);

  if (!token) {
    await supabase
      .from("invoice_jobs")
      .update({ status: "rejected", mensagem_sefaz: "Token do Focus não configurado" })
      .eq("id", job.id);
    return { id: job.id, status: "rejected_no_token" };
  }

  // roteia por tipo de documento (NF-e produto × NFS-e serviço)
  const documentType: FiscalDocumentType = job.document_type ?? "nfse";
  // data de emissão carimbada no documento; persistida no job (emitida_em)
  const dataEmissao = new Date().toISOString();
  const payload = assemblePayload(
    documentType,
    job,
    company as CompanyRow | null,
    settings as FiscalSettingsRow | null,
    dataEmissao,
  );

  const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
  const res = await fetch(`${base}${focusEmitPath(documentType, job.focus_ref)}`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${token}:`),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const focusBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 200 || res.status === 201 || res.status === 202) {
    await supabase
      .from("invoice_jobs")
      .update({
        status: "processing_authorization",
        focus_status: (focusBody.status as string | undefined) ?? null,
        emitida_em: dataEmissao,
      })
      .eq("id", job.id);
    return { id: job.id, http: res.status, status: "processing_authorization" };
  }

  // 5xx: erro transitório do Focus -> relança para o retry com backoff (não rejeita)
  if (res.status >= 500) {
    throw new Error(`Focus ${res.status} ao emitir ref ${job.focus_ref}`);
  }

  // 4xx: pode ser rejeição REAL ou uma resposta enganosa (a nota pode ter sido
  // criada/autorizada mesmo assim — visto em produção: nº 17 autorizado, mas o
  // POST voltou não-2xx). Como a ref é idempotente, confirmamos no Focus antes de
  // marcar terminal.
  const jobRef: FocusJobRef = {
    id: job.id,
    company_id: job.company_id,
    ambiente: job.ambiente,
    focus_ref: job.focus_ref,
    // `claim_nfse_jobs` devolve a linha inteira, então o metadata vem junto e o
    // carimbo de arquivo faltando pode ser mesclado já na emissão
    metadata: (job.metadata ?? null) as Record<string, unknown> | null,
  };
  const confirmed = await queryFocusDoc(base, documentType, job.focus_ref, token);
  if (confirmed) {
    const applied = await applyFocusDocument(supabase, jobRef, confirmed, token);
    // a nota existe no Focus -> foi emitida; carimba a data uma única vez
    await supabase
      .from("invoice_jobs")
      .update({ emitida_em: dataEmissao })
      .eq("id", job.id)
      .is("emitida_em", null);
    return { id: job.id, http: res.status, status: applied ?? "processing_authorization" };
  }

  // Focus não tem a nota (404). Só rejeita se houver ERRO REAL no corpo do POST;
  // corpo vazio => resposta ambígua => relança para retry (nunca rejeita "no vácuo").
  if (hasFocusError(focusBody)) {
    await supabase
      .from("invoice_jobs")
      .update({
        status: "rejected",
        focus_status: (focusBody.status as string | undefined) ?? null,
        mensagem_sefaz: (focusBody.mensagem as string | undefined) ?? null,
        erros: focusBody,
      })
      .eq("id", job.id);
    return { id: job.id, http: res.status, status: "rejected" };
  }

  throw new Error(`resposta ambígua do Focus (HTTP ${res.status}, sem corpo de erro)`);
}

/**
 * Reconciliação: reconsulta o Focus (GET por ref, fonte da verdade) e reaplica o
 * status. Cobre dois casos:
 *   1. jobs presos em `processing_authorization`/`submitting` (webhook não chegou);
 *   2. jobs marcados `rejected` SEM erro real (focus_status null + erros vazio) —
 *      a "rejeição falsa" que este fix passou a evitar; aqui curamos as antigas
 *      (a nota pode estar autorizada no Focus mesmo constando rejeitada aqui).
 * O GET só altera quando o Focus devolve a nota (200); 404 mantém o job como está.
 */
async function reconcile(supabase: SupabaseClient): Promise<{ checked: number; updated: number }> {
  const cutoff = new Date(Date.now() - RECONCILE_STALE_MINUTES * 60_000).toISOString();
  const cols = "id, company_id, document_type, ambiente, focus_ref, metadata";

  const [{ data: stale }, { data: rejectedCandidates }] = await Promise.all([
    supabase
      .from("invoice_jobs")
      .select(cols)
      .in("status", ["processing_authorization", "submitting", "cancelling"])
      .lt("updated_at", cutoff)
      .limit(50),
    // candidatos a "rejeição falsa": rejeitados sem status do Focus. O corpo de
    // erro é filtrado em JS (hasFocusError) — jsonb vazio via PostgREST é frágil.
    supabase
      .from("invoice_jobs")
      .select(`${cols}, erros`)
      .eq("status", "rejected")
      .is("focus_status", null)
      .limit(100),
  ]);

  // só cura os que NÃO têm erro real capturado (o resto é rejeição legítima)
  const falseRejects = (rejectedCandidates ?? []).filter(
    (j) => !hasFocusError((j as { erros?: Record<string, unknown> | null }).erros),
  );

  const jobs = [...(stale ?? []), ...falseRejects];

  let updated = 0;
  for (const job of jobs as (FocusJobRef & {
    document_type: FiscalDocumentType | null;
  })[]) {
    const { data: token } = await supabase.rpc("get_focus_token", { p_company_id: job.company_id });
    if (typeof token !== "string" || token.length === 0) continue;

    const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
    const path = focusQueryPath(job.document_type ?? "nfse", job.focus_ref);
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: "Basic " + btoa(`${token}:`) },
    });
    if (!res.ok) continue;
    const doc = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const next = await applyFocusDocument(supabase, job, doc, token);
    if (next) updated += 1;
  }

  return { checked: jobs.length, updated };
}

/** Teto por rodada: a varredura é oportunista e divide a janela com o reconcile. */
const MISSING_FILES_BATCH = 25;

/**
 * Notas AUTORIZADAS sem PDF (ou sem XML): reconsulta o Focus e tenta de novo.
 *
 * Por que existe: 314 NFS-e da RCO Tecnologia ficaram autorizadas com XML e sem
 * DANFSe, e não havia caminho de recuperação — o `reconcile` só olha nota presa
 * em trânsito, e uma nota autorizada não volta a ser consultada nunca mais. O
 * arquivo faltando é invisível até alguém tentar baixar.
 *
 * Na NFS-e municipal o PDF pode ser gerado pela prefeitura DEPOIS da
 * autorização, então reconsultar é a única forma de saber — e por isso
 * `shouldRecheckFiles` dá uma janela em vez de desistir na primeira tentativa.
 * Quando o Focus continuar sem oferecer o caminho, o motivo fica carimbado no
 * job (`metadata.fileCheck`), que é o diagnóstico que faltava.
 */
async function reconcileMissingFiles(
  supabase: SupabaseClient,
): Promise<{ checked: number; recovered: number; motivos: Record<string, number> }> {
  const { data } = await supabase
    .from("invoice_jobs")
    .select("id, company_id, document_type, ambiente, focus_ref, metadata")
    .eq("status", "authorized")
    .is("danfse_path", null)
    .not("focus_ref", "is", null)
    .order("updated_at", { ascending: true })
    .limit(MISSING_FILES_BATCH * 4);

  const candidatos = (
    (data ?? []) as (FocusJobRef & {
      document_type: FiscalDocumentType | null;
    })[]
  )
    .filter((j) => shouldRecheckFiles(j.metadata))
    .slice(0, MISSING_FILES_BATCH);

  let recovered = 0;
  const motivos: Record<string, number> = {};

  for (const job of candidatos) {
    const { data: token } = await supabase.rpc("get_focus_token", { p_company_id: job.company_id });
    if (typeof token !== "string" || token.length === 0) {
      motivos.sem_token = (motivos.sem_token ?? 0) + 1;
      continue;
    }

    const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
    const path = focusQueryPath(job.document_type ?? "nfse", job.focus_ref);
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: "Basic " + btoa(`${token}:`) },
    });
    if (!res.ok) {
      motivos[`consulta_http_${res.status}`] = (motivos[`consulta_http_${res.status}`] ?? 0) + 1;
      continue;
    }

    const doc = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // o próprio applyFocusDocument baixa o que houver e carimba o que faltar
    await applyFocusDocument(supabase, job, doc, token);

    const { data: depois } = await supabase
      .from("invoice_jobs")
      .select("danfse_path, metadata")
      .eq("id", job.id)
      .maybeSingle();

    if (depois?.danfse_path) {
      recovered += 1;
    } else {
      const motivo = ((depois?.metadata as { fileCheck?: { danfse?: string } } | null)?.fileCheck
        ?.danfse ?? "desconhecido") as string;
      motivos[motivo] = (motivos[motivo] ?? 0) + 1;
    }
  }

  return { checked: candidatos.length, recovered, motivos };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const provided = req.headers.get("x-worker-secret") ?? url.searchParams.get("secret") ?? "";
  if (WORKER_SECRET && provided !== WORKER_SECRET) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // modo reconcile: reconsulta jobs presos (acionado por pg_cron) e, na mesma
  // passada, varre nota autorizada com arquivo faltando. Juntos de propósito:
  // os dois são "pergunte ao Focus o que você não sabe", e assim a recuperação
  // do PDF não precisa de cron próprio.
  if (url.searchParams.get("mode") === "reconcile") {
    const result = await reconcile(supabase);
    const files = await reconcileMissingFiles(supabase);
    return json({ mode: "reconcile", ...result, files });
  }

  // modo files: só a varredura de arquivo faltando, para acionar na mão durante
  // um backfill sem esperar a janela do cron
  if (url.searchParams.get("mode") === "files") {
    return json({ mode: "files", ...(await reconcileMissingFiles(supabase)) });
  }

  // modo padrão: drena a fila
  const { data: jobs, error } = await supabase.rpc("claim_nfse_jobs", { p_limit: 20 });
  if (error) return json({ error: "claim_failed", detail: error.message }, 500);

  const results: Array<{ id: string; http?: number; status: string }> = [];
  for (const job of (jobs ?? []) as InvoiceJobRow[]) {
    try {
      results.push(await emitJob(supabase, job));
    } catch (e) {
      const attempts = job.attempts ?? 1;
      const next = new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();
      const terminal = attempts >= MAX_ATTEMPTS;
      await supabase
        .from("invoice_jobs")
        .update({
          status: terminal ? "failed" : "queued",
          next_attempt_at: terminal ? null : next,
          erros: { worker_error: String(e) },
        })
        .eq("id", job.id);
      results.push({ id: job.id, status: terminal ? "failed" : "retry_scheduled" });
    }
  }

  return json({ claimed: (jobs ?? []).length, results });
});

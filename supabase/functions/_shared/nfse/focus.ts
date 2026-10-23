/**
 * Aplicação do documento do Focus (recebido por webhook OU obtido por consulta)
 * a um `invoice_jobs`. Fonte ÚNICA da verdade de "status do Focus → job",
 * usada pela `focus-webhook` e pela reconciliação do `nfse-worker`.
 *
 * `mapFocusStatus` é pura (testável por Vitest). `applyFocusDocument` recebe o
 * client Supabase por parâmetro (import type-only, sem dep em runtime no Vitest).
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const FOCUS_BASE: Record<string, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

const BUCKET = "nfse-files";

/** Focus status -> invoice_job_status. null = não altera o status do job. */
export function mapFocusStatus(focusStatus: string | null): string | null {
  switch (focusStatus) {
    case "processando_autorizacao":
      return "processing_authorization";
    case "autorizado":
      return "authorized";
    case "erro_autorizacao":
      return "rejected";
    case "cancelado":
      return "cancelled";
    default:
      return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * true quando o corpo do Focus traz um erro REAL (não vazio). É a base para
 * decidir se uma resposta não-2xx do POST é uma rejeição legítima — um corpo
 * vazio (`{}`) NÃO é rejeição (pode ser timeout/dedup e a nota existir no Focus).
 */
export function hasFocusError(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return false;
  const erros = body.erros;
  const hasErros = Array.isArray(erros)
    ? erros.length > 0
    : erros != null && typeof erros === "object"
      ? Object.keys(erros as Record<string, unknown>).length > 0
      : false;
  return hasErros || typeof body.codigo === "string" || typeof body.mensagem === "string";
}

/**
 * Resultado da cópia de um arquivo do Focus para o Storage.
 *
 * Existe porque a versão anterior devolvia `string | null`, e `null` significava
 * três coisas diferentes: o Focus não deu o caminho, o download falhou, ou o
 * upload falhou. O efeito disso apareceu em produção: 314 NFS-e da RCO sem PDF,
 * e nada no banco para distinguir "o Focus não gera DANFSe para este município"
 * de "o download quebrou". Sem o motivo gravado, não há diagnóstico possível —
 * só adivinhação.
 */
export type FileOutcome = { ok: true; path: string } | { ok: false; reason: string };

/** Motivo quando o documento do Focus nem traz o caminho do arquivo. */
export const REASON_NO_PATH = "caminho_ausente_no_focus";

async function downloadToStorage(
  supabase: SupabaseClient,
  base: string,
  token: string,
  caminho: string,
  destPath: string,
  contentType: string,
): Promise<FileOutcome> {
  const url = caminho.startsWith("http") ? caminho : `${base}${caminho}`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Authorization: `Basic ${btoa(`${token}:`)}` } });
  } catch (e) {
    return { ok: false, reason: `rede: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!resp.ok) return { ok: false, reason: `http_${resp.status}` };

  const bytes = new Uint8Array(await resp.arrayBuffer());
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(destPath, bytes, { contentType, upsert: true });
  return error ? { ok: false, reason: `storage: ${error.message}` } : { ok: true, path: destPath };
}

export interface FocusJobRef {
  id: string;
  company_id: string;
  ambiente: string;
  focus_ref: string;
  /** Opcional: quando vem, o carimbo de `fileCheck` é mesclado nele. */
  metadata?: Record<string, unknown> | null;
}

/** O que se sabe sobre os arquivos de uma nota autorizada. */
export interface FileCheck {
  at: string;
  xml?: string;
  danfse?: string;
}

/**
 * Monta o carimbo de diagnóstico dos arquivos. `null` quando os dois vieram —
 * nota completa não precisa de carimbo.
 *
 * Puro: é o pedaço testável da decisão. Ver `FileOutcome` para o motivo de isto
 * existir.
 */
export function buildFileCheck(
  xmlReason: string | null,
  danfseReason: string | null,
  now: Date = new Date(),
): FileCheck | null {
  if (!xmlReason && !danfseReason) return null;
  return {
    at: now.toISOString(),
    ...(xmlReason ? { xml: xmlReason } : {}),
    ...(danfseReason ? { danfse: danfseReason } : {}),
  };
}

/**
 * Vale reconsultar o Focus por causa de arquivo faltando?
 *
 * `true` quando nunca se checou, ou quando a última checagem é mais velha que a
 * janela — o PDF da NFS-e municipal pode aparecer depois que a prefeitura o
 * gera, então "não tinha" não é resposta definitiva. Sem essa janela, a varredura
 * reconsultaria as mesmas notas a cada 5 minutos para sempre.
 */
export function shouldRecheckFiles(
  metadata: Record<string, unknown> | null | undefined,
  windowHours = 24,
  now: Date = new Date(),
): boolean {
  const check = (metadata ?? {}).fileCheck as { at?: unknown } | undefined;
  const at = typeof check?.at === "string" ? Date.parse(check.at) : NaN;
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= windowHours * 3_600_000;
}

/**
 * Aplica o documento `doc` (JSON do Focus) ao job: atualiza status/numero/chave/
 * mensagem/erros e, em `autorizado`, baixa XML/DANFSe para o Storage.
 * Retorna o novo status do job (ou null se não mudou).
 */
export async function applyFocusDocument(
  supabase: SupabaseClient,
  job: FocusJobRef,
  doc: Record<string, unknown>,
  token: string | null,
): Promise<string | null> {
  const focusStatus = asString(doc.status);
  const nextStatus = mapFocusStatus(focusStatus);
  let xmlReason: string | null = null;
  let danfseReason: string | null = null;

  const update: Record<string, unknown> = {
    focus_status: focusStatus,
    mensagem_sefaz: asString(doc.mensagem_sefaz),
    erros: doc.erros ?? null,
  };
  if (nextStatus) update.status = nextStatus;
  if (asString(doc.numero)) update.numero_nfse = asString(doc.numero);
  // série real usada pelo Focus/SEFAZ (pode diferir do que enviamos)
  if (asString(doc.serie)) update.serie = asString(doc.serie);
  // protocolo de autorização (a contabilidade precisa)
  if (asString(doc.protocolo)) update.protocolo = asString(doc.protocolo);
  // chave de acesso: NF-e usa `chave_nfe` (prefixo "NFe"), NFS-e `chave_nfse`/
  // `codigo_verificacao`. Guardamos só os dígitos da chave (sem o prefixo).
  const chaveRaw =
    asString(doc.chave_nfse) ?? asString(doc.chave_nfe) ?? asString(doc.codigo_verificacao);
  if (chaveRaw) update.chave_nfse = chaveRaw.replace(/^NFe/u, "");

  if (focusStatus === "autorizado" && token) {
    const base = FOCUS_BASE[job.ambiente] ?? FOCUS_BASE.homologacao;
    const xmlPath = asString(doc.caminho_xml_nota_fiscal);
    const danfsePath = asString(doc.caminho_danfse) ?? asString(doc.caminho_danfe);

    if (xmlPath) {
      const r = await downloadToStorage(
        supabase,
        base,
        token,
        xmlPath,
        `${job.company_id}/${job.focus_ref}.xml`,
        "application/xml",
      );
      if (r.ok) update.xml_path = r.path;
      else xmlReason = r.reason;
    } else {
      xmlReason = REASON_NO_PATH;
    }

    if (danfsePath) {
      const r = await downloadToStorage(
        supabase,
        base,
        token,
        danfsePath,
        `${job.company_id}/${job.focus_ref}.pdf`,
        "application/pdf",
      );
      if (r.ok) update.danfse_path = r.path;
      else danfseReason = r.reason;
    } else {
      danfseReason = REASON_NO_PATH;
    }

    // carimba POR QUE um arquivo não veio. Só quando falta algo: nota completa
    // não carrega ruído, e quem varre depois (`mode=files`) lê isto para decidir
    // se vale reconsultar o Focus ou se já se sabe que não há PDF.
    const fileCheck = buildFileCheck(xmlReason, danfseReason);
    // `undefined` = o chamador NÃO trouxe a coluna. Gravar aqui substituiria o
    // metadata inteiro do job por `{fileCheck}`, apagando splitSource, revisão
    // de tomador e o marcador de estorno. `null` é diferente: é metadata vazio
    // de verdade, e pode receber o carimbo.
    if (fileCheck && job.metadata !== undefined) {
      update.metadata = { ...(job.metadata ?? {}), fileCheck };
    }
  }

  await supabase.from("invoice_jobs").update(update).eq("id", job.id);
  return nextStatus;
}

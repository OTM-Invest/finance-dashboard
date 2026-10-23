/**
 * Edge Function: focus-webhook
 *
 * Recebe o webhook de status do Focus NFe (POST com o JSON do documento),
 * grava o evento bruto (idempotente) em `focus_events` e aplica o status ao
 * `invoice_jobs` correspondente (casado por `focus_ref` = `ref`) via a lógica
 * compartilhada `applyFocusDocument` (mesma usada na reconciliação do worker).
 *
 * Em `autorizado`: baixa XML/DANFSe → Storage `nfse-files/<company>/<ref>.{xml,pdf}`.
 * Origem verificada por segredo (FOCUS_WEBHOOK_SECRET). Idempotente por hash.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { applyFocusDocument } from "../_shared/nfse/focus.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("FOCUS_WEBHOOK_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function markProcessed(
  supabase: SupabaseClient,
  dedupKey: string,
  note?: string,
): Promise<void> {
  await supabase
    .from("focus_events")
    .update({ processed_at: new Date().toISOString(), process_error: note ?? null })
    .eq("dedup_key", dedupKey);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const ref = asString(payload.ref);
  const focusStatus = asString(payload.status);
  if (!ref) return json({ error: "missing_ref" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1) ingest idempotente em focus_events (dedup por hash do payload)
  const dedupKey = await sha256Hex(JSON.stringify(payload));
  const { data: inserted, error: evErr } = await supabase
    .from("focus_events")
    .upsert(
      { focus_ref: ref, status: focusStatus, payload, dedup_key: dedupKey },
      { onConflict: "dedup_key", ignoreDuplicates: true },
    )
    .select("id");
  if (evErr) return json({ error: "focus_event_failed", detail: evErr.message }, 500);
  if (!inserted || inserted.length === 0) {
    return json({ status: "duplicate_ignored", ref });
  }

  // 2) localizar o job pela ref
  const { data: job } = await supabase
    .from("invoice_jobs")
    .select("id, company_id, ambiente, status, metadata")
    .eq("focus_ref", ref)
    .maybeSingle();
  if (!job) {
    await markProcessed(supabase, dedupKey, "job_not_found");
    return json({ status: "job_not_found", ref });
  }

  // token só é necessário para baixar XML/DANFSe quando autorizado
  let token: string | null = null;
  if (focusStatus === "autorizado") {
    const { data } = await supabase.rpc("get_focus_token", { p_company_id: job.company_id });
    token = typeof data === "string" ? data : null;
  }

  const nextStatus = await applyFocusDocument(
    supabase,
    {
      id: job.id as string,
      company_id: job.company_id as string,
      ambiente: job.ambiente as string,
      focus_ref: ref,
      metadata: (job.metadata ?? null) as Record<string, unknown> | null,
    },
    payload,
    token,
  );

  await markProcessed(supabase, dedupKey);
  return json({ status: "processed", ref, jobStatus: nextStatus ?? (job.status as string) });
});

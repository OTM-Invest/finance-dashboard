/**
 * Edge Function: dash-cost-export
 *
 * Entrega ao RCO Dash (staff) o gasto mensal dos fornecedores da plataforma, para a
 * margem por cliente. `GET ?from=AAAA-MM-DD&to=AAAA-MM-DD` com
 * `Authorization: Bearer <DASH_EXPORT_KEY>`.
 *
 * O filtro é do banco (`dash_cost_export` só devolve o que está em `dash_cost_vendors`):
 * esta função só autentica, valida o período e repassa. Só leitura.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { DashExportError, isAuthorized, parsePeriod } from "../_shared/dash-export/request.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPORT_KEY = Deno.env.get("DASH_EXPORT_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!EXPORT_KEY) return json({ error: "not_configured" }, 503);
  if (!(await isAuthorized(req.headers.get("authorization"), EXPORT_KEY))) {
    return json({ error: "unauthorized" }, 401);
  }

  let period: { from: string; to: string };
  try {
    period = parsePeriod(new URL(req.url).searchParams);
  } catch (e) {
    if (e instanceof DashExportError) return json({ error: e.code }, e.status);
    throw e;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("dash_cost_export", {
    p_from: period.from,
    p_to: period.to,
  });
  if (error) {
    console.error("dash_cost_export", error.message);
    return json({ error: "export_failed" }, 500);
  }

  return json({ generated_at: new Date().toISOString(), ...period, rows: data ?? [] });
});

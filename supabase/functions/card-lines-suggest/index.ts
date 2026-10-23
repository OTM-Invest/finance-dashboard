/**
 * Edge Function: card-lines-suggest
 *
 * Sugere, por IA, o item do plano gerencial das compras de uma fatura de cartão que
 * nenhuma regra classificou. Grava como SUGESTÃO (`classification_status = 'suggested'`):
 * não conta na visão gerencial até alguém aceitar na tela (plano §7.3).
 *
 * Wrapper fino: o pedido e a leitura da resposta são puros (`_shared/cards/suggest.ts`,
 * testados por Vitest); aqui ficam autenticação, leitura e a chamada à API.
 *
 * Segurança:
 *   · toda leitura e escrita é com o JWT de quem chamou (verify_jwt = true) — passa pela
 *     RLS da fatura e pela permissão de escrita da empresa; nada de service role;
 *   · só compras ainda `unclassified` são tocadas: a sugestão nunca sobrescreve regra nem
 *     decisão de pessoa;
 *   · a chave da Anthropic vem de secret (`ANTHROPIC_API_KEY`), nunca do cliente;
 *   · vai para a API só descrição, valor e moeda das compras, o nome da empresa e o
 *     plano gerencial — nada de portador, cartão ou PDF.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  buildSuggestionRequest,
  parseSuggestions,
  type SuggestionLine,
  type SuggestionOption,
} from "../_shared/cards/suggest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-opus-5-5";
const MAX_LINES = 200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Não autenticado" }, 401);
  if (!ANTHROPIC_API_KEY) {
    return json({ error: "Sugestão por IA não configurada (ANTHROPIC_API_KEY)" }, 503);
  }

  let statementId: string;
  try {
    const body = (await req.json()) as { statementId?: unknown };
    if (typeof body.statementId !== "string") throw new Error();
    statementId = body.statementId;
  } catch {
    return json({ error: "Informe statementId" }, 400);
  }

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: statement, error: statementError } = await db
    .from("card_statements")
    .select("id, company_id, company:companies(trade_name)")
    .eq("id", statementId)
    .maybeSingle();
  if (statementError) return json({ error: statementError.message }, 500);
  if (!statement) return json({ error: "Fatura não encontrada" }, 404);

  // Antes de pagar pela chamada à IA: quem só visualiza não grava a sugestão.
  const { data: canWrite, error: writeError } = await db.rpc("has_company_write_access", {
    p_company_id: statement.company_id,
  });
  if (writeError) return json({ error: writeError.message }, 500);
  if (canWrite !== true) return json({ error: "Sem permissão para classificar esta fatura" }, 403);

  const { data: lineRows, error: linesError } = await db
    .from("card_statement_lines")
    .select("id, description, amount, iof_amount, currency")
    .eq("statement_id", statementId)
    .eq("classification_status", "unclassified")
    .order("amount", { ascending: false })
    .limit(MAX_LINES);
  if (linesError) return json({ error: linesError.message }, 500);
  if (!lineRows || lineRows.length === 0) return json({ suggested: 0 });

  const { data: accounts, error: accountsError } = await db
    .from("management_accounts")
    .select("id, parent_id, name, kind, requires_detail, is_active")
    .eq("is_active", true)
    .in("kind", ["expense", "financial"]);
  if (accountsError) return json({ error: accountsError.message }, 500);

  // Grupo transitório ("A detalhar") não é resposta: é justamente de onde a compra sai.
  const groups = new Map(
    (accounts ?? [])
      .filter((a) => a.parent_id === null && !a.requires_detail)
      .map((a) => [a.id, a.name]),
  );
  const options: SuggestionOption[] = (accounts ?? [])
    .filter((a) => a.parent_id !== null && groups.has(a.parent_id))
    .map((a) => ({ id: a.id, label: `${groups.get(a.parent_id)} · ${a.name}` }));

  const lines: SuggestionLine[] = lineRows.map((l) => ({
    id: l.id,
    description: l.description,
    amountCents: Math.round((Number(l.amount) + Number(l.iof_amount)) * 100),
    currency: l.currency,
  }));

  const company = statement.company as unknown as { trade_name: string } | null;
  const request = buildSuggestionRequest({
    companyName: company?.trade_name ?? "",
    lines,
    options,
  });

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Classificação curta e repetitiva: esforço baixo basta.
      output_config: { effort: "low", format: { type: "json_schema", schema: request.schema } },
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Limite de uso da IA atingido; tente de novo em instantes" }, 429);
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `IA indisponível (${err.status ?? "?"})` }, 502);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return json({ error: "A IA recusou classificar estas compras", suggested: 0 }, 422);
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Resposta da IA fora do formato" }, 502);
  }

  const suggestions = parseSuggestions(
    parsed,
    new Set(lines.map((l) => l.id)),
    new Set(options.map((o) => o.id)),
  );

  // Em lotes paralelos: uma fatura grande tem dezenas de compras, e uma por vez chegaria
  // perto do limite de tempo da função.
  const BATCH = 20;
  let suggested = 0;
  for (let i = 0; i < suggestions.length; i += BATCH) {
    const results = await Promise.all(
      suggestions.slice(i, i + BATCH).map((s) =>
        db
          .from("card_statement_lines")
          .update({
            management_account_id: s.managementAccountId,
            classification_status: "suggested",
            classification_source: "ai",
            ai_confidence: s.confidence,
            suggestion_reason: s.reason || null,
          })
          .eq("id", s.lineId)
          .eq("classification_status", "unclassified")
          .select("id"),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return json({ error: failed.error.message, suggested }, 500);
    suggested += results.reduce((n, r) => n + (r.data?.length ?? 0), 0);
  }

  return json({ suggested, considered: lines.length });
});

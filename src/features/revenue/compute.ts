/**
 * Regras da receita por área.
 *
 * A implementação vive em `supabase/functions/_shared/revenue/` porque a sincronização
 * com o CRM (Edge Function) e uma tool de MCP futura precisam da mesma regra, e o runtime
 * do Deno não importa de `src/`. A tela e a sincronização não podem discordar sobre o
 * total de um relatório.
 */
import type { ReportKind } from "../../../supabase/functions/_shared/revenue/contract.ts";

export * from "../../../supabase/functions/_shared/revenue/breakdown.ts";
export * from "../../../supabase/functions/_shared/revenue/match.ts";
export {
  CRM_BUCKET_ADVISOR_CODE,
  REPORT_KINDS,
  type ReportKind,
} from "../../../supabase/functions/_shared/revenue/contract.ts";
export { toCents } from "../../../supabase/functions/_shared/revenue/conference.ts";
export { suggestEmployee } from "../../../supabase/functions/_shared/revenue/advisors.ts";

export const KIND_LABELS: Record<ReportKind, string> = {
  pj1: "PJ1",
  pj2: "PJ2",
  finder: "Finder",
};

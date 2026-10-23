/**
 * Regras da Central de Gastos.
 *
 * A implementação vive em `supabase/functions/_shared/management/breakdown.ts` porque a
 * tool de MCP `management_breakdown` precisa da mesma regra, e o runtime do Deno não
 * importa de `src/`. A tela e a IA não podem discordar sobre quanto se gastou com IA.
 */
export * from "../../../supabase/functions/_shared/management/breakdown.ts";

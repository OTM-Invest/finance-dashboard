/**
 * Contrato do modelo de balanço gerencial.
 *
 * O modelo é a lista ordenada de linhas do relatório. Ele é persistido como jsonb
 * em `balance_report_models.lines` e validado aqui na fronteira — o banco só
 * garante que é um array (ver a migration do balanço).
 *
 * Três tipos de linha:
 *   `filter`  — soma de uma medida sobre a camada gerencial: os lançamentos cujo item do
 *               plano gerencial, área e natureza casam com alguma das cláusulas (o "item");
 *   `formula` — combinação com sinal de outras linhas (o "subitem calculado");
 *   `ratio`   — divisão de duas linhas, exibida em %.
 *
 * Até a migration …_areas_e_balanco_gerencial a linha somava centros de custo
 * (`cost_centers`). O centro virou área e o "o que é" passou a sair da conta; os modelos
 * gravados foram reescritos para `filter` na própria migration.
 */
import { z } from "zod";

export const BALANCE_MEASURES = ["revenue", "expense", "net"] as const;
export type BalanceMeasure = (typeof BALANCE_MEASURES)[number];

export const MEASURE_LABELS: Record<BalanceMeasure, string> = {
  revenue: "Entradas",
  expense: "Saídas",
  net: "Entradas − saídas",
};

export const MEASURE_HINTS: Record<BalanceMeasure, string> = {
  revenue: "Só o que entrou. Use em linha de receita.",
  expense: "Só o que saiu, como número positivo. Use em linha de custo, para a fórmula subtrair.",
  net: "Entradas menos saídas. Use quando o centro tem os dois lados (estorno, devolução).",
};

const lineId = z.string().min(1).max(64);

const lineBase = {
  id: lineId,
  label: z.string().trim().min(1, "Nome obrigatório").max(60),
  /** Linha de destaque (Ebitda, Lucro Líquido) — peso visual maior na matriz. */
  emphasis: z.boolean(),
};

export const BALANCE_NATURES = ["opex", "capex"] as const;
export type BalanceNature = (typeof BALANCE_NATURES)[number];

/**
 * Uma cláusula casa um lançamento quando as três condições valem juntas. Lançamento sem
 * item gerencial (transferência, conta patrimonial) nunca casa — vai para o "Não
 * classificado", onde soma zero.
 */
export const balanceClauseSchema = z.object({
  /** Grupos ou itens do plano gerencial. Vazio = qualquer item. */
  managementAccountIds: z.array(z.string().uuid()),
  /** Áreas. `null` = qualquer área, inclusive nenhuma. */
  areaIds: z.array(z.string().uuid()).nullable(),
  /** Com `areaIds` preenchido, casa também o lançamento sem área. */
  includeNoArea: z.boolean(),
  /** `null` = qualquer natureza (e o que não tem natureza: receita, tributo…). */
  nature: z.enum(BALANCE_NATURES).nullable(),
});

export const filterLineSchema = z.object({
  ...lineBase,
  kind: z.literal("filter"),
  measure: z.enum(BALANCE_MEASURES),
  /** A linha soma o lançamento que casa com QUALQUER cláusula — uma vez só. */
  clauses: z.array(balanceClauseSchema),
});

export const formulaTermSchema = z.object({
  lineId,
  sign: z.union([z.literal(1), z.literal(-1)]),
});

export const formulaLineSchema = z.object({
  ...lineBase,
  kind: z.literal("formula"),
  terms: z.array(formulaTermSchema),
});

export const ratioLineSchema = z.object({
  ...lineBase,
  kind: z.literal("ratio"),
  numeratorLineId: lineId,
  denominatorLineId: lineId,
});

export const balanceLineSchema = z.discriminatedUnion("kind", [
  filterLineSchema,
  formulaLineSchema,
  ratioLineSchema,
]);

export const balanceLinesSchema = z.array(balanceLineSchema);

export type BalanceClause = z.infer<typeof balanceClauseSchema>;
export type FilterLine = z.infer<typeof filterLineSchema>;
export type FormulaLine = z.infer<typeof formulaLineSchema>;
export type RatioLine = z.infer<typeof ratioLineSchema>;
export type BalanceLine = z.infer<typeof balanceLineSchema>;
export type FormulaTerm = z.infer<typeof formulaTermSchema>;

export const LINE_KIND_LABELS: Record<BalanceLine["kind"], string> = {
  filter: "Plano gerencial",
  formula: "Fórmula",
  ratio: "Percentual",
};

/**
 * Lê o jsonb do banco. Um modelo corrompido não pode derrubar a tela: descarta a
 * linha inválida e segue com o resto, que é sempre melhor que uma tela em branco.
 */
export function parseBalanceLines(raw: unknown): BalanceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: BalanceLine[] = [];
  for (const item of raw) {
    const parsed = balanceLineSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function newLineId(): string {
  return crypto.randomUUID();
}

/** Cláusula vazia: qualquer item, qualquer área, qualquer natureza. */
export function emptyClause(): BalanceClause {
  return { managementAccountIds: [], areaIds: null, includeNoArea: false, nature: null };
}

/**
 * Modelo inicial: uma linha por grupo do plano gerencial, na ordem do plano.
 *
 * Deliberadamente não tenta montar Ebitda/Lucro — a composição dessas linhas é decisão
 * contábil de quem monta o relatório, e errar em silêncio no palpite é pior que deixar o
 * usuário montar.
 */
export function linesFromManagementGroups(
  groups: readonly { id: string; name: string }[],
): BalanceLine[] {
  return groups.map((group) => ({
    id: newLineId(),
    label: group.name,
    kind: "filter" as const,
    measure: "net" as const,
    clauses: [{ ...emptyClause(), managementAccountIds: [group.id] }],
    emphasis: false,
  }));
}

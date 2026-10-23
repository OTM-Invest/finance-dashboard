/**
 * Cálculo da matriz do balanço gerencial — funções puras, sem banco.
 *
 * Entra a série mensal crua (mês × item gerencial × área × natureza) e o modelo de
 * linhas; sai a matriz pronta para a tabela. O cálculo fica aqui, e não no SQL, para as
 * fórmulas serem testáveis sem subir Postgres.
 */
import { eachMonthOfInterval, parseISO, startOfMonth } from "date-fns";

import { isoDate } from "@/lib/dates";

import type {
  BalanceClause,
  BalanceLine,
  BalanceMeasure,
  BalanceNature,
  FilterLine,
} from "./schema";

/** O que identifica um pedaço da série: item, grupo, área e natureza. */
export interface SeriesKey {
  managementAccountId: string | null;
  managementGroupId: string | null;
  areaId: string | null;
  nature: BalanceNature | null;
}

export interface MonthlySeriesRow extends SeriesKey {
  /** Primeiro dia do mês, YYYY-MM-DD. */
  month: string;
  revenue: number;
  expense: number;
}

/**
 * Chave mandada ao banco para listar os lançamentos de uma célula: item, área,
 * natureza e o lado do dinheiro (`null` = os dois). O grupo não vai — ele é função do
 * item.
 */
export interface DrilldownKey {
  m: string | null;
  a: string | null;
  n: BalanceNature | null;
  d: "inflow" | "outflow" | null;
}

/**
 * Como chegar nos lançamentos por trás de uma linha: as chaves exatas que ela soma no
 * período. Linha calculada (fórmula, percentual) não tem lançamento próprio — ela nasce
 * de outras linhas —, então o drilldown dela é `null`.
 */
export interface BalanceDrilldown {
  kind: "filter" | "unclassified";
  keys: DrilldownKey[];
  /** Medida da linha; `null` no "Não classificado", que é por lado. */
  measure: BalanceMeasure | null;
}

export interface BalanceMatrixLine {
  id: string;
  label: string;
  kind: BalanceLine["kind"] | "unclassified";
  emphasis: boolean;
  format: "currency" | "percent";
  /** Um valor por mês do eixo. `null` = indefinido (divisão por zero, fórmula quebrada). */
  values: (number | null)[];
  /**
   * Variação contra o mês anterior, alinhada com `values` — o primeiro mês é
   * sempre `null` porque não tem anterior. A unidade depende do formato da linha
   * (ver `deltaUnit`).
   */
  deltas: (number | null)[];
  /**
   * `percent` para linha de dinheiro (variação % sobre o mês anterior);
   * `points` para linha que já é percentual, onde a variação é em pontos
   * percentuais — margem de 10% para 20% é +10 p.p., não +100%.
   */
  deltaUnit: "percent" | "points";
  /** Total do período — recalculado do agregado, não somado dos meses (ver abaixo). */
  total: number | null;
  /** `null` quando a linha é calculada e não tem lançamento próprio. */
  drilldown: BalanceDrilldown | null;
}

export interface BalanceMatrix {
  /** Eixo de meses (primeiro dia de cada mês), sempre completo no período. */
  months: string[];
  lines: BalanceMatrixLine[];
}

const UNCLASSIFIED_ID = "__unclassified__";
export const UNCLASSIFIED_LABEL = "Não classificado";

/** Centavo — abaixo disso é ruído de float, não dinheiro. */
const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Eixo de meses do período, inclusive os meses sem nenhum lançamento. */
export function monthAxis(from: string, to: string): string[] {
  if (!from || !to) return [];
  const start = startOfMonth(parseISO(from));
  const end = startOfMonth(parseISO(to));
  if (end < start) return [];
  return eachMonthOfInterval({ start, end }).map((d) => isoDate(d));
}

interface Bucket {
  key: SeriesKey;
  revenue: number;
  expense: number;
}

function measureOf(bucket: Bucket, measure: BalanceMeasure): number {
  if (measure === "revenue") return bucket.revenue;
  if (measure === "expense") return bucket.expense;
  return bucket.revenue - bucket.expense;
}

function keyString(key: SeriesKey): string {
  return `${key.managementAccountId ?? "-"}|${key.areaId ?? "-"}|${key.nature ?? "-"}`;
}

/** Agrupa a série por chave (o mês já foi separado antes). */
function bucketsByKey(rows: readonly MonthlySeriesRow[]): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const id = keyString(row);
    const current = map.get(id);
    if (current) {
      current.revenue += row.revenue;
      current.expense += row.expense;
    } else {
      map.set(id, {
        key: {
          managementAccountId: row.managementAccountId,
          managementGroupId: row.managementGroupId,
          areaId: row.areaId,
          nature: row.nature,
        },
        revenue: row.revenue,
        expense: row.expense,
      });
    }
  }
  return map;
}

/**
 * A regra de que lançamento uma cláusula pega — UMA implementação, usada pelo cálculo,
 * pela cobertura do "Não classificado" e pelas chaves do drilldown.
 *
 * Sem item gerencial não casa nunca: transferência e conta patrimonial não são resultado.
 */
export function clauseMatches(clause: BalanceClause, key: SeriesKey): boolean {
  if (key.managementAccountId == null) return false;
  if (
    clause.managementAccountIds.length > 0 &&
    !clause.managementAccountIds.includes(key.managementAccountId) &&
    (key.managementGroupId == null || !clause.managementAccountIds.includes(key.managementGroupId))
  ) {
    return false;
  }
  if (clause.areaIds !== null) {
    const areaOk = key.areaId == null ? clause.includeNoArea : clause.areaIds.includes(key.areaId);
    if (!areaOk) return false;
  }
  return clause.nature === null || clause.nature === key.nature;
}

/** A linha pega o pedaço se QUALQUER cláusula pegar — e o soma uma vez só. */
export function lineMatches(line: FilterLine, key: SeriesKey): boolean {
  return line.clauses.some((clause) => clauseMatches(clause, key));
}

/**
 * Ordem de avaliação das linhas.
 *
 * `formula` e `ratio` apontam para outras linhas, então a ordem do modelo não
 * basta — uma fórmula pode referenciar uma linha declarada depois dela. DFS com
 * marcação de "em visita" resolve a ordem e, de quebra, detecta ciclo
 * (Ebitda = Lucro, Lucro = Ebitda) e referência para linha inexistente.
 */
export function evaluationOrder(lines: readonly BalanceLine[]): {
  order: string[];
  broken: Set<string>;
} {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const order: string[] = [];
  const broken = new Set<string>();
  const done = new Set<string>();
  const visiting = new Set<string>();

  const depsOf = (line: BalanceLine): string[] => {
    if (line.kind === "formula") return line.terms.map((t) => t.lineId);
    if (line.kind === "ratio") return [line.numeratorLineId, line.denominatorLineId];
    return [];
  };

  function visit(id: string): boolean {
    if (done.has(id)) return !broken.has(id);
    if (visiting.has(id)) return false; // ciclo
    const line = byId.get(id);
    if (!line) return false; // referência para linha que não existe

    visiting.add(id);
    let ok = true;
    for (const dep of depsOf(line)) {
      if (!visit(dep)) ok = false;
    }
    visiting.delete(id);

    done.add(id);
    if (!ok) broken.add(id);
    order.push(id);
    return ok;
  }

  for (const line of lines) visit(line.id);
  return { order, broken };
}

/** Avalia todas as linhas sobre um único conjunto de buckets (um mês ou o total). */
function evaluate(
  lines: readonly BalanceLine[],
  order: readonly string[],
  broken: ReadonlySet<string>,
  buckets: Map<string, Bucket>,
): Map<string, number | null> {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const values = new Map<string, number | null>();

  for (const id of order) {
    const line = byId.get(id);
    if (!line || broken.has(id)) {
      values.set(id, null);
      continue;
    }

    if (line.kind === "filter") {
      let sum = 0;
      for (const bucket of buckets.values()) {
        if (lineMatches(line, bucket.key)) sum += measureOf(bucket, line.measure);
      }
      values.set(id, round2(sum));
      continue;
    }

    if (line.kind === "formula") {
      let sum = 0;
      let defined = true;
      for (const term of line.terms) {
        const value = values.get(term.lineId);
        if (value == null) {
          defined = false;
          break;
        }
        sum += term.sign * value;
      }
      values.set(id, defined ? round2(sum) : null);
      continue;
    }

    const numerator = values.get(line.numeratorLineId);
    const denominator = values.get(line.denominatorLineId);
    const defined = numerator != null && denominator != null && Math.abs(denominator) >= EPSILON;
    values.set(id, defined ? (numerator / denominator) * 100 : null);
  }

  return values;
}

/**
 * Se um pedaço da série está coberto pelo modelo, por lado.
 *
 * A cobertura é por medida: uma linha com medida `expense` conta só as saídas daquele
 * pedaço. Se ele tiver uma entrada (um estorno, por exemplo), ela não aparece em lugar
 * nenhum — e é justamente isso que a linha "Não classificado" precisa capturar para o
 * relatório fechar com a empresa.
 */
function coverageOf(
  lines: readonly BalanceLine[],
  key: SeriesKey,
): { revenue: boolean; expense: boolean } {
  let revenue = false;
  let expense = false;
  for (const line of lines) {
    if (line.kind !== "filter" || !lineMatches(line, key)) continue;
    if (line.measure === "revenue" || line.measure === "net") revenue = true;
    if (line.measure === "expense" || line.measure === "net") expense = true;
  }
  return { revenue, expense };
}

/** Sobra de dinheiro que nenhuma linha do modelo captura, em regime líquido. */
function unclassifiedOf(lines: readonly BalanceLine[], buckets: Map<string, Bucket>): number {
  let sum = 0;
  for (const bucket of buckets.values()) {
    const covered = coverageOf(lines, bucket.key);
    if (!covered.revenue) sum += bucket.revenue;
    if (!covered.expense) sum -= bucket.expense;
  }
  return round2(sum);
}

function drilldownKey(key: SeriesKey, d: DrilldownKey["d"]): DrilldownKey {
  return { m: key.managementAccountId, a: key.areaId, n: key.nature, d };
}

function directionOf(measure: BalanceMeasure): DrilldownKey["d"] {
  if (measure === "revenue") return "inflow";
  if (measure === "expense") return "outflow";
  return null;
}

/** As chaves que a linha soma no período — o que a gaveta de lançamentos consulta. */
function filterDrilldown(line: FilterLine, buckets: Map<string, Bucket>): BalanceDrilldown {
  const d = directionOf(line.measure);
  const keys = [...buckets.values()]
    .filter((bucket) => lineMatches(line, bucket.key))
    .map((bucket) => drilldownKey(bucket.key, d));
  return { kind: "filter", keys, measure: line.measure };
}

/** As chaves do "Não classificado": cada lado que nenhuma linha cobre. */
function unclassifiedDrilldown(
  lines: readonly BalanceLine[],
  buckets: Map<string, Bucket>,
): BalanceDrilldown {
  const keys: DrilldownKey[] = [];
  for (const bucket of buckets.values()) {
    const covered = coverageOf(lines, bucket.key);
    if (covered.revenue && covered.expense) continue;
    if (!covered.revenue && !covered.expense) keys.push(drilldownKey(bucket.key, null));
    else if (!covered.revenue) keys.push(drilldownKey(bucket.key, "inflow"));
    else keys.push(drilldownKey(bucket.key, "outflow"));
  }
  return { kind: "unclassified", keys, measure: null };
}

/**
 * Variação mês a mês de uma série.
 *
 * Linha de dinheiro varia em porcentagem sobre o mês anterior; linha que já é
 * percentual varia em pontos percentuais, porque "a margem subiu 100%" não quer
 * dizer nada — subiu de 10% para 20% são +10 p.p.
 *
 * A base é o **módulo** do mês anterior: de −100 para −50 é +50%, e não −50%. Sem
 * isso o sinal se inverte justamente nas linhas de resultado negativo, que são as
 * que mais importam ler.
 *
 * Variar a partir de zero não tem porcentagem definida, então vira `null` em vez
 * de infinito.
 */
export function monthOverMonth(
  values: readonly (number | null)[],
  format: "currency" | "percent",
): (number | null)[] {
  return values.map((current, index) => {
    if (index === 0) return null;
    const previous = values[index - 1];
    if (current == null || previous == null) return null;
    if (format === "percent") return current - previous;
    if (Math.abs(previous) < EPSILON) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  });
}

export interface BuildMatrixInput {
  from: string;
  to: string;
  series: readonly MonthlySeriesRow[];
  lines: readonly BalanceLine[];
}

export function buildBalanceMatrix({ from, to, series, lines }: BuildMatrixInput): BalanceMatrix {
  const months = monthAxis(from, to);
  const { order, broken } = evaluationOrder(lines);

  const rowsByMonth = new Map<string, MonthlySeriesRow[]>();
  for (const row of series) {
    const bucket = rowsByMonth.get(row.month);
    if (bucket) bucket.push(row);
    else rowsByMonth.set(row.month, [row]);
  }

  const perMonth = months.map((month) => {
    const rows = rowsByMonth.get(month) ?? [];
    return evaluate(lines, order, broken, bucketsByKey(rows));
  });

  // O total do período é recalculado sobre o agregado, e não somado dos meses.
  // Para soma e fórmula dá no mesmo (são lineares); para percentual não: a margem
  // do ano é lucro_do_ano ÷ receita_do_ano, nunca a soma das margens mensais.
  const periodBuckets = bucketsByKey(series);
  const totals = evaluate(lines, order, broken, periodBuckets);

  const matrixLines: BalanceMatrixLine[] = lines.map((line) => {
    const format = line.kind === "ratio" ? "percent" : "currency";
    const values = perMonth.map((monthValues) => monthValues.get(line.id) ?? null);
    return {
      id: line.id,
      label: line.label,
      kind: line.kind,
      emphasis: line.emphasis,
      format,
      values,
      deltas: monthOverMonth(values, format),
      deltaUnit: format === "percent" ? "points" : "percent",
      total: totals.get(line.id) ?? null,
      drilldown: line.kind === "filter" ? filterDrilldown(line, periodBuckets) : null,
    };
  });

  const unclassifiedTotal = unclassifiedOf(lines, periodBuckets);
  if (Math.abs(unclassifiedTotal) >= EPSILON) {
    const values = months.map((month) =>
      unclassifiedOf(lines, bucketsByKey(rowsByMonth.get(month) ?? [])),
    );
    matrixLines.push({
      id: UNCLASSIFIED_ID,
      label: UNCLASSIFIED_LABEL,
      kind: "unclassified",
      emphasis: false,
      format: "currency",
      values,
      deltas: monthOverMonth(values, "currency"),
      deltaUnit: "percent",
      total: unclassifiedTotal,
      drilldown: unclassifiedDrilldown(lines, periodBuckets),
    });
  }

  return { months, lines: matrixLines };
}

export interface ModelIssues {
  /** Linhas com ciclo ou referência para linha inexistente. */
  brokenLineIds: string[];
  /**
   * Linhas que pegam o mesmo pedaço da série — o dinheiro entra duas vezes no total. Só
   * conta o que tem movimento no período: sobreposição que não soma nada não é aviso.
   */
  overlappingLineIds: string[];
  /** Linhas que apontam para item gerencial ou área que não existe mais. */
  unknownReferenceLineIds: string[];
}

/** Problemas do modelo que valem aviso na UI (nenhum impede o relatório de rodar). */
export function analyzeModel(
  lines: readonly BalanceLine[],
  series: readonly MonthlySeriesRow[],
  known: { managementAccountIds: readonly string[]; areaIds: readonly string[] },
): ModelIssues {
  const { broken } = evaluationOrder(lines);
  const filterLines = lines.filter((l): l is FilterLine => l.kind === "filter");
  const knownManagement = new Set(known.managementAccountIds);
  const knownAreas = new Set(known.areaIds);

  const overlapping = new Set<string>();
  for (const bucket of bucketsByKey(series).values()) {
    const hits = filterLines.filter((line) => lineMatches(line, bucket.key));
    if (hits.length > 1) for (const hit of hits) overlapping.add(hit.id);
  }

  const unknown = filterLines
    .filter((line) =>
      line.clauses.some(
        (c) =>
          c.managementAccountIds.some((id) => !knownManagement.has(id)) ||
          (c.areaIds ?? []).some((id) => !knownAreas.has(id)),
      ),
    )
    .map((line) => line.id);

  return {
    brokenLineIds: [...broken],
    overlappingLineIds: [...overlapping],
    unknownReferenceLineIds: unknown,
  };
}

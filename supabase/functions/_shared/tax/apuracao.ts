/**
 * Apuração de tributo — a aritmética que transforma receita em imposto devido.
 *
 * **Esta é a única implementação.** A tela (`src/features/taxes/apuracao.ts`)
 * reexporta daqui, e as tools de MCP usam a mesma função. Não é preciosismo: o número
 * que sai daqui é o que se paga à Receita. Duas implementações seria questão de tempo
 * até a IA e o dashboard discordarem sobre o imposto devido.
 *
 * O que ela substitui, e os erros que corrige em relação às planilhas:
 *
 *  1. **Presunção em faixas com piso.** A planilha da OTM aplica a presunção base
 *     sobre R$ 1.250.000 FIXOS (`B13 = B9*32%`) em vez de `min(receita; 1.250.000)`, e
 *     multiplica um excedente NEGATIVO quando a receita fica abaixo do limite. No meio
 *     do trimestre isso subestima o imposto; com receita zero produz IRPJ de
 *     −R$ 16.000. Aqui a faixa é medida por interseção com a receita, sempre ≥ 0.
 *
 *  2. **Adicional com piso zero.** A planilha calcula `LP − 60.000` sem `max(0; …)`.
 *
 *  3. **Ordem das deduções.** Nos demonstrativos de PIS/COFINS, "valor a recolher"
 *     saiu de `retenção − outras deduções` em vez de `devido − retenção − deduções`.
 *     O saldo final acertava por acidente, porque "outras deduções" estava zero.
 *     Aqui existe uma fórmula só, e o crédito que sobra não desaparece: vira
 *     `creditCarryforward`.
 *
 * Sem dependências de propósito: roda no app (Vite), no Deno e no Worker.
 */

export type PresumptionClass =
  | "revenda_mercadoria"
  | "industria"
  | "servico_geral"
  | "servico_transporte"
  | "servico_hospitalar"
  | "combustivel_revenda"
  | "financeiro_exterior"
  | "outras";

export type LineKind =
  | "revenue"
  | "revenue_return"
  | "retention"
  | "deduction"
  | "addition"
  | "carryforward";

export type PeriodKind = "monthly" | "quarterly" | "annual";

export type AllowanceMode = "excess" | "full_when_exceeded";

export type BaseDateBasis = "accrual" | "cash";

export interface PresumptionTier {
  presumption_class: PresumptionClass;
  /** Início da faixa, medido sobre a receita da PRÓPRIA classe no período. */
  threshold_from: number;
  /** Fim da faixa (exclusivo). `null` = sem teto. */
  threshold_to: number | null;
  rate: number;
}

export interface TaxRule {
  id: string;
  rate: number;
  uses_presumption: boolean;
  default_presumption_class: PresumptionClass | null;
  surtax_rate: number | null;
  surtax_monthly_allowance: number | null;
  base_allowance: number | null;
  base_allowance_per_payee: boolean;
  /**
   * `excess` tributa só o que passa da franquia; `full_when_exceeded` tributa o valor
   * todo de quem passou. A planilha da OTM admite as duas leituras ("10% sobre
   * R$ 442.580, sócios acima de R$ 49.999,99") e a diferença é grande — então é
   * configuração, não escolha implícita do código.
   */
  base_allowance_mode: AllowanceMode;
  deducts_retentions: boolean;
  presumptions: PresumptionTier[];
}

export interface InputLine {
  id?: string;
  line_kind: LineKind;
  description: string;
  document_ref?: string | null;
  reference_date?: string | null;
  presumption_class?: PresumptionClass | null;
  amount: number;
  payee?: string | null;
  transaction_id?: string | null;
  account_id?: string | null;
  sort_order?: number;
}

export interface AssessmentInputs {
  company_id: string;
  kind: string;
  period_kind: PeriodKind;
  period_start: string;
  period_end: string;
  months_in_period: number;
  due_date: string;
  /** Qual data do lançamento delimitou o período: competência ou caixa. */
  base_date_basis?: BaseDateBasis;
  /**
   * Receita que o MESMO período traria pela OUTRA data-base.
   *
   * Existe porque errar a data-base desloca a base em um mês inteiro sem nada parecer
   * quebrado. Medido na OTM Assessoria: o IRPJ do 3t2026 dá R$ 681.872,60 por
   * competência e R$ 1.543.003,86 por caixa — e é o segundo que bate com a
   * contabilidade. Divergência grande entre as duas vira aviso.
   */
  gross_revenue_alt_basis?: number;
  /**
   * A data-base já foi conferida contra o demonstrativo da contabilidade?
   *
   * Enquanto `false`, divergência entre as duas datas vira aviso. Depois de conferida,
   * divergir é a configuração CORRETA — na OTM Assessoria as duas datas divergem
   * sempre, e um aviso que dispara toda apuração estraga os avisos que importam.
   */
  base_date_basis_confirmed?: boolean;
  rule: TaxRule;
  gathered_lines: InputLine[];
  manual_lines: InputLine[];
}

export interface ComputedLine extends InputLine {
  presumption_rate: number | null;
  base_amount: number;
  is_manual: boolean;
  sort_order: number;
}

export interface ClassBreakdown {
  presumption_class: PresumptionClass;
  revenue: number;
  base: number;
  /** Média ponderada das faixas aplicadas — o que a linha exibe. */
  effective_rate: number;
}

export interface AssessmentResult {
  company_id: string;
  kind: string;
  rule_id: string;
  period_start: string;
  period_end: string;
  due_date: string;

  gross_revenue: number;
  taxable_base: number;
  rate: number;
  tax_amount: number;
  surtax_base: number;
  surtax_amount: number;
  retentions: number;
  deductions: number;
  additions: number;
  amount_due: number;
  /** Crédito que sobrou quando as deduções passam do devido. Nunca some em silêncio. */
  credit_carryforward: number;

  lines: ComputedLine[];
  classes: ClassBreakdown[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Aritmética inteira
//
// Dinheiro em CENTAVOS e alíquota em MICRO (1e-6), como inteiros, para que
// `base = valor × alíquota` seja exato. O produto vive em micro-centavos.
// ---------------------------------------------------------------------------

const RATE_SCALE = 1_000_000;
/** Além disso o produto centavos × micro sai do inteiro seguro do IEEE-754. */
const MAX_SAFE_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / RATE_SCALE);

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

function toMicroRate(rate: number): number {
  return Math.round(rate * RATE_SCALE);
}

/** Arredonda meio para longe do zero — o mesmo critério do `round()` do Postgres. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** `centavos × alíquota`, em micro-centavos exatos. */
function applyRateMicro(cents: number, microRate: number): number {
  if (Math.abs(cents) > MAX_SAFE_CENTS) {
    throw new RangeError(
      `Valor de R$ ${fromCents(cents)} passa do limite de precisão exata da apuração.`,
    );
  }
  return cents * microRate;
}

function microToCents(micro: number): number {
  return roundHalfAwayFromZero(micro / RATE_SCALE);
}

/**
 * Distribui centavos por resto maior.
 *
 * Arredondar cada linha e somar dá resultado diferente de arredondar a soma — com 100
 * notas a diferença chega a meio real. Um demonstrativo cujas linhas não fecham com o
 * próprio total é o tipo de coisa que um contador devolve, então o total manda e a
 * sobra de centavos vai para as linhas de maior resto (método do resto maior, que
 * espalha em vez de concentrar o desvio numa linha só).
 */
function allocateToTotal(microValues: number[], targetCents: number): number[] {
  const floors = microValues.map((m) => {
    const c = m / RATE_SCALE;
    return c < 0 ? -Math.floor(-c) : Math.floor(c);
  });
  const allocated = floors.reduce((a, b) => a + b, 0);
  let residue = targetCents - allocated;
  if (residue === 0) return floors;

  const step = residue > 0 ? 1 : -1;
  const order = microValues
    .map((m, i) => {
      const c = m / RATE_SCALE;
      const frac = c - (c < 0 ? -Math.floor(-c) : Math.floor(c));
      return { i, frac: Math.abs(frac) };
    })
    .sort((a, b) => b.frac - a.frac);

  const out = [...floors];
  let k = 0;
  while (residue !== 0 && order.length > 0) {
    out[order[k % order.length].i] += step;
    residue -= step;
    k += 1;
    // Guarda: com resíduo maior que o nº de linhas, mais de uma volta é normal; o que
    // não pode é laço infinito por lista vazia (já coberto) ou resíduo fracionário.
    if (k > order.length * Math.abs(targetCents === 0 ? 1 : 2) + order.length + 2) break;
  }
  return out;
}

/**
 * Base presumida de uma classe: soma das interseções da receita com cada faixa.
 *
 * `receita = 1.543.003,86` com faixas [0; 1.250.000) a 32% e [1.250.000; ∞) a 35,2%
 * dá `1.250.000 × 32% + 293.003,86 × 35,2%`. Receita abaixo do limite usa só a
 * primeira faixa — que é justamente o que a planilha não faz.
 */
function presumedBaseMicro(
  revenueCents: number,
  tiers: PresumptionTier[],
  warnings: string[],
  cls: PresumptionClass,
): number {
  // Receita negativa na classe (devolução maior que a venda) não gera lucro presumido
  // negativo: a base é zero e o excesso fica registrado como aviso, não some.
  if (revenueCents <= 0) {
    if (revenueCents < 0) {
      warnings.push(
        `A classe "${cls}" ficou com receita negativa (R$ ${fromCents(revenueCents).toFixed(2)}) ` +
          `— base presumida tratada como zero. Confira se a devolução pertence a este período.`,
      );
    }
    return 0;
  }

  const sorted = [...tiers].sort((a, b) => a.threshold_from - b.threshold_from);
  if (sorted.length === 0) {
    warnings.push(`Nenhuma faixa de presunção cadastrada para a classe "${cls}".`);
    return 0;
  }
  if (toCents(sorted[0].threshold_from) !== 0) {
    warnings.push(
      `A primeira faixa da classe "${cls}" começa em R$ ${sorted[0].threshold_from.toFixed(2)} ` +
        `e não em zero — a receita abaixo disso ficaria sem presunção.`,
    );
  }

  let micro = 0;
  let cursor = 0;
  for (const tier of sorted) {
    const from = toCents(tier.threshold_from);
    const to = tier.threshold_to === null ? revenueCents : toCents(tier.threshold_to);
    if (from > cursor) {
      warnings.push(
        `Buraco entre faixas da classe "${cls}": nada cobre de ` +
          `R$ ${fromCents(cursor).toFixed(2)} a R$ ${fromCents(from).toFixed(2)}.`,
      );
    }
    const lo = Math.max(from, 0);
    const hi = Math.min(to, revenueCents);
    if (hi > lo) micro += applyRateMicro(hi - lo, toMicroRate(tier.rate));
    cursor = Math.max(cursor, Math.min(to, revenueCents));
    if (cursor >= revenueCents) break;
  }

  if (cursor < revenueCents) {
    warnings.push(
      `As faixas da classe "${cls}" cobrem só até R$ ${fromCents(cursor).toFixed(2)}, ` +
        `mas a receita foi R$ ${fromCents(revenueCents).toFixed(2)}.`,
    );
  }

  return micro;
}

function sumCents(lines: InputLine[]): number {
  return lines.reduce((acc, l) => acc + toCents(l.amount), 0);
}

export function computeAssessment(inputs: AssessmentInputs): AssessmentResult {
  const { rule } = inputs;
  const warnings: string[] = [];

  // O DAS do Simples tem alíquota EFETIVA PROGRESSIVA — sai de
  // `(RBT12 × nominal − dedução) / RBT12`, com a faixa dependendo da receita
  // acumulada dos 12 meses anteriores. Este motor faz `base × alíquota fixa`, então o
  // número sairia errado. A UI não oferece `das_simples` (ver `APURAVEIS`), mas uma
  // regra inserida direto por SQL chegaria aqui — e número contábil errado em
  // silêncio é o pior defeito possível.
  if (inputs.kind === "das_simples") {
    warnings.push(
      "O DAS do Simples tem alíquota efetiva progressiva (depende do RBT12) e este " +
        "cálculo aplica alíquota fixa — o valor está ERRADO. Apure o DAS pela aba de " +
        "obrigações, que usa a tabela do Anexo III.",
    );
  }

  const gathered: ComputedLine[] = inputs.gathered_lines.map((l, i) => ({
    ...l,
    is_manual: false,
    sort_order: l.sort_order ?? i,
    presumption_rate: null,
    base_amount: 0,
  }));
  const manual: ComputedLine[] = inputs.manual_lines.map((l, i) => ({
    ...l,
    is_manual: true,
    sort_order: l.sort_order ?? i,
    presumption_rate: null,
    base_amount: 0,
  }));
  const all = [...gathered, ...manual];

  const baseLines = all.filter(
    (l) => l.line_kind === "revenue" || l.line_kind === "revenue_return",
  );
  const grossCents = sumCents(baseLines);

  // Data-base errada não parece defeito: o número sai bonito, só do mês trocado. Este
  // aviso é o que faz a divergência aparecer antes de virar imposto pago errado.
  //
  // A comparação é só entre LANÇAMENTOS: a outra data-base é calculada sobre eles, e a
  // receita digitada à mão não tem data de caixa nem de competência. Incluí-la acusaria
  // divergência que não existe.
  if (inputs.gross_revenue_alt_basis !== undefined && !inputs.base_date_basis_confirmed) {
    const gatheredCents = sumCents(baseLines.filter((l) => !l.is_manual));
    const altCents = toCents(inputs.gross_revenue_alt_basis);
    const maior = Math.max(Math.abs(gatheredCents), Math.abs(altCents));
    if (maior > 0 && Math.abs(altCents - gatheredCents) > maior / 100) {
      const atual = inputs.base_date_basis === "cash" ? "caixa" : "competência";
      const outra = inputs.base_date_basis === "cash" ? "competência" : "caixa";
      warnings.push(
        `A base está sendo apurada por ${atual} (R$ ${fromCents(gatheredCents).toFixed(2)}); ` +
          `por ${outra} o mesmo período daria R$ ${fromCents(altCents).toFixed(2)}. ` +
          `Confira contra o demonstrativo da contabilidade qual das duas é a competência ` +
          `fiscal e marque a data-base como conferida na regra — este aviso é de uma vez só.`,
      );
    }
  }

  // ----- Base de cálculo -----
  const classes: ClassBreakdown[] = [];
  let baseCents: number;

  if (rule.uses_presumption) {
    if (!rule.default_presumption_class) {
      throw new Error("Regra com presunção precisa de classe padrão.");
    }
    const fallback = rule.default_presumption_class;
    const unclassified = baseLines.filter((l) => !l.presumption_class).length;
    if (unclassified > 0) {
      warnings.push(
        `${unclassified} lançamento(s) sem classe de presunção no plano de contas — ` +
          `entraram como "${fallback}". Classifique a conta em /settings para não presumir errado.`,
      );
    }

    const byClass = new Map<PresumptionClass, ComputedLine[]>();
    for (const line of baseLines) {
      const cls = line.presumption_class ?? fallback;
      const bucket = byClass.get(cls);
      if (bucket) bucket.push(line);
      else byClass.set(cls, [line]);
    }

    baseCents = 0;
    for (const [cls, lines] of byClass) {
      const revenueCents = sumCents(lines);
      const tiers = rule.presumptions.filter((p) => p.presumption_class === cls);
      const classBaseMicro = presumedBaseMicro(revenueCents, tiers, warnings, cls);
      const classBaseCents = microToCents(classBaseMicro);

      // Alíquota efetiva da classe: é o que faz sentido exibir por linha quando há
      // faixa, porque nenhuma faixa isolada descreve o conjunto.
      const effective = revenueCents === 0 ? 0 : classBaseMicro / RATE_SCALE / revenueCents;
      const perLineMicro = lines.map((l) =>
        applyRateMicro(toCents(l.amount), toMicroRate(effective)),
      );
      const perLineCents = allocateToTotal(perLineMicro, classBaseCents);
      lines.forEach((l, i) => {
        l.presumption_rate = Number(effective.toFixed(6));
        l.base_amount = fromCents(perLineCents[i]);
      });

      classes.push({
        presumption_class: cls,
        revenue: fromCents(revenueCents),
        base: fromCents(classBaseCents),
        effective_rate: Number(effective.toFixed(6)),
      });
      baseCents += classBaseCents;
    }
  } else {
    // Sem presunção a base É a receita (ISS, PIS, COFINS, IRRF de dividendos).
    for (const line of baseLines) {
      line.presumption_rate = null;
      line.base_amount = line.amount;
    }
    baseCents = grossCents;
    if (baseCents < 0) {
      warnings.push(
        `A receita do período ficou negativa (R$ ${fromCents(baseCents).toFixed(2)}) ` +
          `— base tratada como zero.`,
      );
      baseCents = 0;
    }
  }

  // ----- Franquia da base (IRRF de dividendos) -----
  if (rule.base_allowance !== null) {
    const allowanceCents = toCents(rule.base_allowance);
    const mode = rule.base_allowance_mode;
    const taxablePortion = (total: number): number => {
      if (total <= allowanceCents) return 0;
      return mode === "full_when_exceeded" ? total : total - allowanceCents;
    };

    if (rule.base_allowance_per_payee) {
      if (rule.uses_presumption) {
        warnings.push(
          "Franquia por beneficiário combinada com presunção não é uma configuração " +
            "prevista — confira a regra do tributo.",
        );
      }
      const byPayee = new Map<string, number>();
      for (const line of baseLines) {
        const key = line.payee ?? "(não identificado)";
        byPayee.set(key, (byPayee.get(key) ?? 0) + toCents(line.amount));
      }
      if (byPayee.has("(não identificado)")) {
        warnings.push(
          "Há distribuição sem sócio identificado (lançamento sem contraparte). A " +
            "franquia é POR beneficiário, então o valor foi somado num grupo só — " +
            "vincule a contraparte para a franquia sair certa.",
        );
      }
      baseCents = 0;
      for (const total of byPayee.values()) baseCents += taxablePortion(total);
    } else {
      baseCents = taxablePortion(baseCents);
    }
  }

  // ----- Tributo -----
  const taxCents = microToCents(applyRateMicro(baseCents, toMicroRate(rule.rate)));

  // ----- Adicional (IRPJ: 10% acima de R$ 20.000 por mês de período) -----
  let surtaxBaseCents = 0;
  let surtaxCents = 0;
  if (rule.surtax_rate !== null && rule.surtax_monthly_allowance !== null) {
    const allowance = toCents(rule.surtax_monthly_allowance) * inputs.months_in_period;
    surtaxBaseCents = Math.max(baseCents - allowance, 0);
    surtaxCents = microToCents(applyRateMicro(surtaxBaseCents, toMicroRate(rule.surtax_rate)));
  }

  // ----- Retenções, deduções, acréscimos -----
  const retentionLines = all.filter((l) => l.line_kind === "retention");
  let retentionCents = Math.abs(sumCents(retentionLines));
  if (!rule.deducts_retentions && retentionCents > 0) {
    warnings.push(
      `Há R$ ${fromCents(retentionCents).toFixed(2)} de retenção lançada, mas a regra ` +
        `deste tributo não permite deduzir retenção — o valor foi ignorado no saldo.`,
    );
    retentionCents = 0;
  }

  const carryCents = sumCents(all.filter((l) => l.line_kind === "carryforward"));
  const deductionCents =
    Math.abs(sumCents(all.filter((l) => l.line_kind === "deduction"))) + Math.max(-carryCents, 0);
  const additionCents =
    Math.abs(sumCents(all.filter((l) => l.line_kind === "addition"))) + Math.max(carryCents, 0);

  for (const line of all) {
    if (line.line_kind !== "revenue" && line.line_kind !== "revenue_return") {
      line.base_amount = 0;
      line.presumption_rate = null;
    }
  }

  // ----- Saldo devedor: uma fórmula só, na ordem certa, com piso zero -----
  const rawDue = taxCents + surtaxCents + additionCents - retentionCents - deductionCents;
  const dueCents = Math.max(rawDue, 0);
  const creditCents = Math.max(-rawDue, 0);
  if (creditCents > 0) {
    warnings.push(
      `As deduções passaram do tributo devido em R$ ${fromCents(creditCents).toFixed(2)}. ` +
        `O saldo a pagar é zero e o crédito fica registrado para o período seguinte.`,
    );
  }

  return {
    company_id: inputs.company_id,
    kind: inputs.kind,
    rule_id: rule.id,
    period_start: inputs.period_start,
    period_end: inputs.period_end,
    due_date: inputs.due_date,

    gross_revenue: fromCents(grossCents),
    taxable_base: fromCents(baseCents),
    rate: rule.rate,
    tax_amount: fromCents(taxCents),
    surtax_base: fromCents(surtaxBaseCents),
    surtax_amount: fromCents(surtaxCents),
    retentions: fromCents(retentionCents),
    deductions: fromCents(deductionCents),
    additions: fromCents(additionCents),
    amount_due: fromCents(dueCents),
    credit_carryforward: fromCents(creditCents),

    lines: all.map((l, i) => ({ ...l, sort_order: l.sort_order ?? i })),
    classes: classes.sort((a, b) => b.revenue - a.revenue),
    warnings,
  };
}

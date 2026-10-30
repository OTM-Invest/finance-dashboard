import { describe, expect, it } from "vitest";

import {
  computeAssessment,
  type AssessmentInputs,
  type InputLine,
  type PresumptionClass,
  type TaxRule,
} from "./apuracao.ts";
import {
  JCE_2T2026_DEVOLUCOES,
  JCE_2T2026_EXTERIOR,
  JCE_2T2026_SAIDAS,
  JCE_2T2026_SERVICOS,
  type DocFixture,
} from "./fixtures.jce-2t2026.ts";

/**
 * Regressão contra as quatro planilhas que esta apuração substitui.
 *
 * Cada `it` cita o número que a planilha produz. Quando a planilha está CERTA, o teste
 * exige o mesmo centavo. Quando está ERRADA, o teste fixa o número correto e explica a
 * divergência — é o registro de por que a ferramenta discorda da planilha, e o que
 * impede alguém "consertar" o motor de volta para o erro.
 */

const RULE_BASE: TaxRule = {
  id: "00000000-0000-0000-0000-0000000000ff",
  rate: 0,
  uses_presumption: false,
  default_presumption_class: null,
  surtax_rate: null,
  surtax_monthly_allowance: null,
  base_allowance: null,
  base_allowance_per_payee: false,
  base_allowance_mode: "excess",
  deducts_retentions: false,
  presumptions: [],
};

function rule(over: Partial<TaxRule>): TaxRule {
  return { ...RULE_BASE, ...over };
}

function revenue(
  description: string,
  amount: number,
  presumption_class?: PresumptionClass,
): InputLine {
  return { line_kind: "revenue", description, amount, presumption_class };
}

function fromDocs(docs: DocFixture[], cls: PresumptionClass): InputLine[] {
  return docs.map((d) => ({
    line_kind: d.amount < 0 ? ("revenue_return" as const) : ("revenue" as const),
    description: d.doc,
    document_ref: d.doc,
    reference_date: d.date,
    amount: d.amount,
    presumption_class: cls,
  }));
}

function inputs(over: Partial<AssessmentInputs> & { rule: TaxRule }): AssessmentInputs {
  return {
    company_id: "00000000-0000-0000-0000-0000000000aa",
    kind: "custom",
    period_kind: "monthly",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    months_in_period: 1,
    due_date: "2026-09-25",
    gathered_lines: [],
    manual_lines: [],
    ...over,
  };
}

// Presunção da OTM Assessoria: serviço a 32% até R$ 1.250.000/trimestre e 35,2% no
// excedente (regra do contador, confirmada pelo dono do repo).
const OTM_TIERS = [
  {
    presumption_class: "servico_geral" as const,
    threshold_from: 0,
    threshold_to: 1_250_000,
    rate: 0.32,
  },
  {
    presumption_class: "servico_geral" as const,
    threshold_from: 1_250_000,
    threshold_to: null,
    rate: 0.352,
  },
];

const OTM_IRPJ = rule({
  rate: 0.15,
  uses_presumption: true,
  default_presumption_class: "servico_geral",
  surtax_rate: 0.1,
  surtax_monthly_allowance: 20_000,
  deducts_retentions: true,
  presumptions: OTM_TIERS,
});

const OTM_CSLL = rule({
  rate: 0.09,
  uses_presumption: true,
  default_presumption_class: "servico_geral",
  deducts_retentions: false,
  presumptions: OTM_TIERS,
});

const OTM_3T_RECEITA: InputLine[] = [
  revenue("Faturamento julho/2026", 861_131.26, "servico_geral"),
  revenue("Faturamento agosto/2026", 681_872.6, "servico_geral"),
  // Setembro ficou em branco na planilha.
];

const trimestre = { period_kind: "quarterly" as const, months_in_period: 3 };

describe("OTM Assessoria · IRPJ/CSLL 3t2026 (calculo IRPJ-CSLL Otm assessor.xlsx)", () => {
  it("reproduz o lucro presumido da planilha: R$ 503.137,36", () => {
    const r = computeAssessment(
      inputs({ ...trimestre, kind: "darf_irpj", rule: OTM_IRPJ, gathered_lines: OTM_3T_RECEITA }),
    );

    expect(r.gross_revenue).toBe(1_543_003.86); // B8
    expect(r.taxable_base).toBe(503_137.36); // B15 = 503137.3587
  });

  it("reproduz IRPJ, adicional e saldo devedor da planilha", () => {
    const retencao: InputLine[] = [
      // B11 — IRRF de 1,5% retido nas notas do BTG Pactual.
      { line_kind: "retention", description: "IRRF retido (NF BTG Pactual)", amount: 23_145.06 },
    ];
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: OTM_IRPJ,
        gathered_lines: OTM_3T_RECEITA,
        manual_lines: retencao,
      }),
    );

    expect(r.tax_amount).toBe(75_470.6); // B17 = 75470.6038
    expect(r.surtax_base).toBe(443_137.36); // B18 = 443137.3587
    expect(r.surtax_amount).toBe(44_313.74); // B19 = 44313.7359
    expect(r.retentions).toBe(23_145.06);
    expect(r.amount_due).toBe(96_639.28); // B20 = 96639.2818
  });

  it("reproduz a CSLL da planilha: R$ 45.282,36", () => {
    const r = computeAssessment(
      inputs({ ...trimestre, kind: "darf_csll", rule: OTM_CSLL, gathered_lines: OTM_3T_RECEITA }),
    );

    expect(r.taxable_base).toBe(503_137.36); // B25
    expect(r.amount_due).toBe(45_282.36); // B27 = 45282.3623
  });

  it("DIVERGE da planilha: trimestre sem receita dá zero, não IRPJ negativo", () => {
    // A aba `4t2026` calcula a presunção base sobre R$ 1.250.000 FIXOS
    // (`B13 = B9*32%`) e multiplica um excedente negativo, chegando a
    // IRPJ = −R$ 16.000,00 e CSLL = −R$ 3.600,00 com receita zero.
    const irpj = computeAssessment(
      inputs({ ...trimestre, kind: "darf_irpj", rule: OTM_IRPJ, gathered_lines: [] }),
    );
    const csll = computeAssessment(
      inputs({ ...trimestre, kind: "darf_csll", rule: OTM_CSLL, gathered_lines: [] }),
    );

    expect(irpj.taxable_base).toBe(0);
    expect(irpj.tax_amount).toBe(0);
    expect(irpj.surtax_amount).toBe(0);
    expect(irpj.amount_due).toBe(0);
    expect(csll.amount_due).toBe(0);
  });

  it("DIVERGE da planilha: trimestre parcial não é subestimado", () => {
    // Com só o primeiro mês lançado (R$ 500.000), a planilha calcula
    // 400.000 + (−750.000 × 35,2%) = R$ 136.000 de lucro presumido, e chega a
    // IRPJ de R$ 20.500 e CSLL de R$ 12.240. O correto é presumir só a faixa
    // alcançada: 500.000 × 32% = R$ 160.000.
    const receita = [revenue("Faturamento outubro/2026", 500_000, "servico_geral")];
    const retencao: InputLine[] = [
      { line_kind: "retention", description: "IRRF retido", amount: 7_500 },
    ];

    const irpj = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: OTM_IRPJ,
        gathered_lines: receita,
        manual_lines: retencao,
      }),
    );
    const csll = computeAssessment(
      inputs({ ...trimestre, kind: "darf_csll", rule: OTM_CSLL, gathered_lines: receita }),
    );

    expect(irpj.taxable_base).toBe(160_000);
    expect(irpj.tax_amount).toBe(24_000);
    expect(irpj.surtax_amount).toBe(10_000);
    expect(irpj.amount_due).toBe(26_500); // planilha: 20.500 (R$ 6.000 a menos)
    expect(csll.amount_due).toBe(14_400); // planilha: 12.240 (R$ 2.160 a menos)
  });
});

describe("OTM Assessoria · ISS 09/2026 (calculo iss-pis-cofins Otm assessor.xlsx)", () => {
  it("reproduz o ISS de Barueri: 2% sobre R$ 681.872,60", () => {
    const r = computeAssessment(
      inputs({
        kind: "iss",
        rule: rule({ rate: 0.02 }),
        gathered_lines: [revenue("Faturamento agosto/2026", 681_872.6)],
      }),
    );

    expect(r.taxable_base).toBe(681_872.6);
    expect(r.amount_due).toBe(13_637.45); // E6 = 13637.452
  });
});

describe("OTM Assessoria · IRRF sobre distribuição de lucros", () => {
  const socios: InputLine[] = [
    {
      line_kind: "revenue",
      description: "Distribuição de lucros",
      amount: 250_000,
      payee: "Sócio A",
    },
    {
      line_kind: "revenue",
      description: "Distribuição de lucros",
      amount: 192_580,
      payee: "Sócio B",
    },
  ];

  it("modo `full_when_exceeded` reproduz a planilha: R$ 44.258,00", () => {
    // A planilha aplica 10% sobre os R$ 442.580,00 inteiros (E9 = 44258), com a
    // observação "sócios acima de R$ 49.999,99".
    const r = computeAssessment(
      inputs({
        kind: "irrf_dividendos",
        rule: rule({
          rate: 0.1,
          base_allowance: 49_999.99,
          base_allowance_per_payee: true,
          base_allowance_mode: "full_when_exceeded",
        }),
        gathered_lines: socios,
      }),
    );

    expect(r.taxable_base).toBe(442_580);
    expect(r.amount_due).toBe(44_258);
  });

  it("modo `excess` tributa só o que passa da franquia, por sócio", () => {
    const r = computeAssessment(
      inputs({
        kind: "irrf_dividendos",
        rule: rule({
          rate: 0.1,
          base_allowance: 49_999.99,
          base_allowance_per_payee: true,
          base_allowance_mode: "excess",
        }),
        gathered_lines: socios,
      }),
    );

    expect(r.taxable_base).toBe(342_580.02);
    expect(r.amount_due).toBe(34_258);
  });

  it("franquia por sócio ignora quem ficou abaixo do limite", () => {
    const r = computeAssessment(
      inputs({
        kind: "irrf_dividendos",
        rule: rule({
          rate: 0.1,
          base_allowance: 49_999.99,
          base_allowance_per_payee: true,
          base_allowance_mode: "full_when_exceeded",
        }),
        gathered_lines: [
          { line_kind: "revenue", description: "Lucros", amount: 60_000, payee: "Sócio A" },
          { line_kind: "revenue", description: "Lucros", amount: 10_000, payee: "Sócio B" },
        ],
      }),
    );

    expect(r.taxable_base).toBe(60_000);
    expect(r.amount_due).toBe(6_000);
  });

  it("avisa quando a distribuição não tem sócio identificado", () => {
    const r = computeAssessment(
      inputs({
        kind: "irrf_dividendos",
        rule: rule({ rate: 0.1, base_allowance: 49_999.99, base_allowance_per_payee: true }),
        gathered_lines: [{ line_kind: "revenue", description: "Lucros", amount: 80_000 }],
      }),
    );

    expect(r.warnings.some((w) => w.includes("sem sócio identificado"))).toBe(true);
  });
});

describe("JCE · IRPJ/CSLL 2t2026 (calculo_IRPJ_CSLL_ jce.xlsx)", () => {
  // Receita mista: 100 NF-e de mercadoria, 1 devolução, 3 NFS-e de serviço e ganho no
  // exterior — cada grupo com sua presunção.
  const receita: InputLine[] = [
    ...fromDocs(JCE_2T2026_SAIDAS, "revenda_mercadoria"),
    ...fromDocs(JCE_2T2026_DEVOLUCOES, "revenda_mercadoria"),
    ...fromDocs(JCE_2T2026_SERVICOS, "servico_geral"),
    ...fromDocs(JCE_2T2026_EXTERIOR, "financeiro_exterior"),
  ];

  const tiers = (mercadoria: number) => [
    {
      presumption_class: "revenda_mercadoria" as const,
      threshold_from: 0,
      threshold_to: null,
      rate: mercadoria,
    },
    {
      presumption_class: "servico_geral" as const,
      threshold_from: 0,
      threshold_to: null,
      rate: 0.32,
    },
    {
      presumption_class: "financeiro_exterior" as const,
      threshold_from: 0,
      threshold_to: null,
      rate: 1,
    },
  ];

  it("a fixture bate com os totais da planilha", () => {
    const soma = (xs: DocFixture[]) => Number(xs.reduce((a, x) => a + x.amount, 0).toFixed(2));
    expect(JCE_2T2026_SAIDAS).toHaveLength(100);
    expect(soma(JCE_2T2026_SAIDAS)).toBe(23_953.4); // C106
    expect(soma(JCE_2T2026_DEVOLUCOES)).toBe(-2_254.53); // C110
    expect(soma(JCE_2T2026_SERVICOS)).toBe(33_173.24); // C116
    expect(soma(JCE_2T2026_EXTERIOR)).toBe(2_033.7); // C120
  });

  it("reproduz o IRPJ: base R$ 14.385,05 e saldo devedor R$ 1.700,20", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        kind: "darf_irpj",
        rule: rule({
          rate: 0.15,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          surtax_rate: 0.1,
          surtax_monthly_allowance: 20_000,
          deducts_retentions: true,
          presumptions: tiers(0.08),
        }),
        gathered_lines: receita,
        manual_lines: [
          { line_kind: "retention", description: "IRPJ retido na fonte", amount: 457.56 }, // E128
        ],
      }),
    );

    expect(r.gross_revenue).toBe(56_905.81); // C122
    expect(r.taxable_base).toBe(14_385.05); // E122 = 14385.0464
    expect(r.tax_amount).toBe(2_157.76); // E126 = 2157.75696
    expect(r.surtax_amount).toBe(0); // base abaixo dos R$ 60.000 do trimestre
    expect(r.amount_due).toBe(1_700.2); // E130 = 1700.19696
  });

  it("reproduz a CSLL: base R$ 15.253,00 e saldo devedor R$ 1.372,77", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        period_start: "2026-04-01",
        period_end: "2026-06-30",
        kind: "darf_csll",
        rule: rule({
          rate: 0.09,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          presumptions: tiers(0.12), // CSLL presume 12% na mercadoria, contra 8% do IRPJ
        }),
        gathered_lines: receita,
      }),
    );

    expect(r.taxable_base).toBe(15_253); // E122 = 15253.0012
    expect(r.amount_due).toBe(1_372.77); // E129 = 1372.7701
  });

  it("presume cada classe com a sua alíquota, e a devolução na classe da venda", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: rule({
          rate: 0.15,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          presumptions: tiers(0.08),
        }),
        gathered_lines: receita,
      }),
    );

    const byClass = new Map(r.classes.map((c) => [c.presumption_class, c]));
    // Saídas menos devolução: 23.953,40 − 2.254,53 = 21.698,87, a 8%.
    expect(byClass.get("revenda_mercadoria")?.revenue).toBe(21_698.87);
    expect(byClass.get("revenda_mercadoria")?.base).toBe(1_735.91); // E106+E110 = 1735.9096
    expect(byClass.get("servico_geral")?.base).toBe(10_615.44); // E116 = 10615.4368
    expect(byClass.get("financeiro_exterior")?.base).toBe(2_033.7); // E120
  });

  it("com 105 linhas, a soma das linhas fecha exatamente com a base total", () => {
    // É a invariante que o `save_tax_assessment` confere no banco: um demonstrativo
    // cujas linhas não somam o próprio total é rejeitado. Arredondar cada linha e
    // somar difere de arredondar a soma, por isso a distribuição por resto maior.
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: rule({
          rate: 0.15,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          presumptions: tiers(0.08),
        }),
        gathered_lines: receita,
      }),
    );

    const somaLinhas = r.lines
      .filter((l) => l.line_kind === "revenue" || l.line_kind === "revenue_return")
      .reduce((acc, l) => acc + Math.round(l.base_amount * 100), 0);

    expect(r.lines).toHaveLength(105);
    expect(somaLinhas).toBe(Math.round(r.taxable_base * 100));
  });
});

describe("JCE · PIS/COFINS 08/2026 (calculo PIS_COFINS_jce.xlsx)", () => {
  const receita: InputLine[] = [
    revenue("Hotmart", 6_000),
    revenue("Myprofit", 12_772.97),
    revenue("plataforma Finance Dash", 201_928.8),
  ];

  it("reproduz o PIS cumulativo: R$ 1.434,56 devido, R$ 1.351,54 a pagar", () => {
    const r = computeAssessment(
      inputs({
        kind: "darf_pis",
        rule: rule({ rate: 0.0065, deducts_retentions: true }),
        gathered_lines: receita,
        manual_lines: [
          { line_kind: "retention", description: "PIS retido (NF Myprofit)", amount: 83.02 },
        ],
      }),
    );

    expect(r.taxable_base).toBe(220_701.77); // I13
    expect(r.tax_amount).toBe(1_434.56); // K13 = 1434.5615
    expect(r.amount_due).toBe(1_351.54); // I56 = 1351.5415
  });

  it("reproduz a COFINS cumulativa: R$ 6.621,05 devido, R$ 6.237,87 a pagar", () => {
    const r = computeAssessment(
      inputs({
        kind: "darf_cofins",
        rule: rule({ rate: 0.03, deducts_retentions: true }),
        gathered_lines: receita,
        manual_lines: [
          { line_kind: "retention", description: "COFINS retida (NF Myprofit)", amount: 383.18 },
        ],
      }),
    );

    expect(r.tax_amount).toBe(6_621.05); // K31 = 6621.0531
    expect(r.amount_due).toBe(6_237.87); // I81 = 6237.8731
  });

  it("DIVERGE da planilha: 'outras deduções' entra subtraindo, não somando", () => {
    // No demonstrativo, `I51 = I49 - I50` faz "contribuição a recolher" sair de
    // `retenção − outras deduções` em vez de `devido − retenção − deduções`. Com
    // "outras deduções" em zero o saldo final acerta por acidente; com R$ 500 a
    // planilha chegaria a R$ 1.851,54 — R$ 1.000 acima do correto.
    const r = computeAssessment(
      inputs({
        kind: "darf_pis",
        rule: rule({ rate: 0.0065, deducts_retentions: true }),
        gathered_lines: receita,
        manual_lines: [
          { line_kind: "retention", description: "PIS retido", amount: 83.02 },
          { line_kind: "deduction", description: "Outras deduções do período", amount: 500 },
        ],
      }),
    );

    expect(r.deductions).toBe(500);
    expect(r.amount_due).toBe(851.54);
  });

  it("crédito que sobra não desaparece: vira saldo para o período seguinte", () => {
    const r = computeAssessment(
      inputs({
        kind: "darf_pis",
        rule: rule({ rate: 0.0065, deducts_retentions: true }),
        gathered_lines: receita,
        manual_lines: [
          { line_kind: "retention", description: "PIS retido a maior", amount: 2_000 },
        ],
      }),
    );

    expect(r.amount_due).toBe(0);
    expect(r.credit_carryforward).toBe(565.44); // 2.000,00 − 1.434,56
    expect(r.warnings.some((w) => w.includes("crédito"))).toBe(true);
  });
});

describe("guardas do motor", () => {
  it("ignora retenção quando a regra não permite deduzir, e avisa", () => {
    const r = computeAssessment(
      inputs({
        kind: "irrf_dividendos",
        rule: rule({ rate: 0.1, deducts_retentions: false }),
        gathered_lines: [revenue("Lucros", 100_000)],
        manual_lines: [{ line_kind: "retention", description: "Retenção indevida", amount: 900 }],
      }),
    );

    expect(r.retentions).toBe(0);
    expect(r.amount_due).toBe(10_000);
    expect(r.warnings.some((w) => w.includes("não permite deduzir retenção"))).toBe(true);
  });

  it("avisa quando a receita cai em conta sem classe de presunção", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: rule({
          rate: 0.15,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          presumptions: OTM_TIERS,
        }),
        gathered_lines: [revenue("Receita sem classe", 100_000)],
      }),
    );

    expect(r.taxable_base).toBe(32_000);
    expect(r.warnings.some((w) => w.includes("sem classe de presunção"))).toBe(true);
  });

  it("devolução maior que a venda na classe não gera presunção negativa", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: rule({
          rate: 0.15,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          presumptions: OTM_TIERS,
        }),
        gathered_lines: [
          revenue("Venda", 10_000, "servico_geral"),
          {
            line_kind: "revenue_return",
            description: "Devolução",
            amount: -15_000,
            presumption_class: "servico_geral",
          },
        ],
      }),
    );

    expect(r.taxable_base).toBe(0);
    expect(r.amount_due).toBe(0);
    expect(r.warnings.some((w) => w.includes("receita negativa"))).toBe(true);
  });

  it("avisa quando as faixas de presunção deixam buraco", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: rule({
          rate: 0.15,
          uses_presumption: true,
          default_presumption_class: "servico_geral",
          presumptions: [
            {
              presumption_class: "servico_geral",
              threshold_from: 100_000,
              threshold_to: null,
              rate: 0.32,
            },
          ],
        }),
        gathered_lines: [revenue("Receita", 500_000, "servico_geral")],
      }),
    );

    expect(r.warnings.some((w) => w.includes("não em zero"))).toBe(true);
  });

  it("adicional usa a franquia por mês do período, não um valor fixo", () => {
    // R$ 20.000/mês: R$ 60.000 no trimestre, R$ 20.000 no mês. Empresa que apura
    // mensalmente não pode ganhar a franquia trimestral.
    const receita = [revenue("Receita", 1_000_000, "servico_geral")];
    const regra = rule({
      rate: 0.15,
      uses_presumption: true,
      default_presumption_class: "servico_geral",
      surtax_rate: 0.1,
      surtax_monthly_allowance: 20_000,
      presumptions: OTM_TIERS,
    });

    const mensal = computeAssessment(
      inputs({ kind: "darf_irpj", rule: regra, gathered_lines: receita, months_in_period: 1 }),
    );
    const trimestral = computeAssessment(
      inputs({ ...trimestre, kind: "darf_irpj", rule: regra, gathered_lines: receita }),
    );

    expect(mensal.surtax_base).toBe(300_000); // 320.000 − 20.000
    expect(trimestral.surtax_base).toBe(260_000); // 320.000 − 60.000
  });
});

describe("DAS do Simples não é apurável por alíquota fixa", () => {
  it("avisa em alto e bom som que o número está errado", () => {
    // Duas das quatro empresas do grupo são Simples, então isto não é hipótese: é o
    // caminho que alguém tentaria primeiro. A alíquota do DAS é progressiva sobre o
    // RBT12 e este motor não sabe calculá-la.
    const r = computeAssessment(
      inputs({
        kind: "das_simples",
        rule: rule({ rate: 0.06 }),
        gathered_lines: [revenue("Faturamento do mês", 100_000)],
      }),
    );

    expect(r.warnings.some((w) => w.includes("ERRADO"))).toBe(true);
  });
});

describe("data-base da apuração", () => {
  // Regressão do defeito medido na produção: a base da OTM Assessoria por competência
  // dá R$ 681.872,60 no 3t2026, e por caixa dá R$ 1.543.003,86 — que é o número da
  // planilha. Errar a data-base desloca a base em um mês inteiro sem nada parecer
  // quebrado, então a divergência tem de aparecer.
  it("avisa quando a outra data-base daria número muito diferente", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: OTM_IRPJ,
        gathered_lines: [revenue("Comissão ref julho/2026", 681_872.6, "servico_geral")],
        base_date_basis: "accrual",
        gross_revenue_alt_basis: 1_543_003.86,
      }),
    );

    expect(r.gross_revenue).toBe(681_872.6);
    const aviso = r.warnings.find((w) => w.includes("data-base") || w.includes("competência"));
    expect(aviso).toContain("1543003.86");
  });

  it("para de avisar depois de a data-base ser conferida", () => {
    // Na OTM as duas datas divergem SEMPRE (accrual = mês da comissão, caixa = mês
    // seguinte). Sem este corte o aviso dispararia em toda apuração, das 6 regras,
    // todo mês — e aviso que sempre dispara estraga os avisos que importam.
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: OTM_IRPJ,
        gathered_lines: [revenue("Comissão", 681_872.6, "servico_geral")],
        base_date_basis: "cash",
        gross_revenue_alt_basis: 1_543_003.86,
        base_date_basis_confirmed: true,
      }),
    );

    expect(r.warnings).toHaveLength(0);
  });

  it("não avisa quando as duas bases coincidem", () => {
    const r = computeAssessment(
      inputs({
        kind: "iss",
        rule: rule({ rate: 0.02 }),
        gathered_lines: [revenue("Faturamento", 100_000)],
        base_date_basis: "cash",
        gross_revenue_alt_basis: 100_000,
      }),
    );

    expect(r.warnings).toHaveLength(0);
  });

  it("tolera diferença de arredondamento sem virar ruído mensal", () => {
    const r = computeAssessment(
      inputs({
        kind: "iss",
        rule: rule({ rate: 0.02 }),
        gathered_lines: [revenue("Faturamento", 100_000)],
        base_date_basis: "cash",
        gross_revenue_alt_basis: 100_500, // 0,5% de diferença
      }),
    );

    expect(r.warnings).toHaveLength(0);
  });
});

describe("receita digitada à mão", () => {
  // Receita que não está nos lançamentos (nota emitida por fora, faturamento que a
  // contabilidade informou) entra como linha manual e sobrevive ao recálculo.
  it("soma na base e presume pela classe escolhida", () => {
    const r = computeAssessment(
      inputs({
        ...trimestre,
        kind: "darf_irpj",
        rule: OTM_IRPJ,
        gathered_lines: [revenue("Comissão", 300_000, "servico_geral")],
        manual_lines: [
          revenue("Faturamento informado pela contabilidade", 200_000, "servico_geral"),
        ],
      }),
    );

    expect(r.gross_revenue).toBe(500_000);
    // 32% de R$ 500.000, tudo dentro da 1ª faixa
    expect(r.taxable_base).toBe(160_000);
    expect(r.lines.find((l) => l.is_manual)?.base_amount).toBe(64_000);
  });

  it("devolução digitada reduz a base", () => {
    const r = computeAssessment(
      inputs({
        kind: "iss",
        rule: rule({ rate: 0.02 }),
        gathered_lines: [revenue("Faturamento", 100_000)],
        manual_lines: [
          { line_kind: "revenue_return", description: "Nota cancelada", amount: -10_000 },
        ],
      }),
    );

    expect(r.taxable_base).toBe(90_000);
    expect(r.tax_amount).toBe(1_800);
  });

  it("não dispara o aviso de data-base — a outra data só existe para lançamento", () => {
    // `gross_revenue_alt_basis` é a soma dos LANÇAMENTOS pela outra data. Comparar com
    // uma base que inclui receita digitada acusaria divergência que não existe.
    const r = computeAssessment(
      inputs({
        kind: "iss",
        rule: rule({ rate: 0.02 }),
        gathered_lines: [revenue("Faturamento", 100_000)],
        manual_lines: [revenue("Nota emitida por fora", 50_000)],
        base_date_basis: "cash",
        gross_revenue_alt_basis: 100_000,
      }),
    );

    expect(r.gross_revenue).toBe(150_000);
    expect(r.warnings).toHaveLength(0);
  });
});

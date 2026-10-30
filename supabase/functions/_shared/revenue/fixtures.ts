/**
 * Respostas das RPCs do CRM no formato real (PostgREST), com valores fictícios. O PJ1
 * tem dois arquivos no mesmo mês (contas B2B diferentes) e três linhas de 0,335 cuja
 * soma arredondada (1,01) difere da soma das arredondadas (1,02) — o caso que quebra
 * quem arredonda cedo.
 */

const PJ1_A = "11111111-0000-4000-8000-000000000001";
const PJ1_B = "11111111-0000-4000-8000-000000000002";
const FINDER = "11111111-0000-4000-8000-000000000003";

export const REPORT_IDS = { PJ1_A, PJ1_B, FINDER } as const;

export const reportsResponse = [
  {
    report_id: PJ1_A,
    kind: "pj1",
    reference_month: "2026-09-01",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    file_key: "pj1-conta-a",
    file_name: "comissao_pj1_a.xlsx",
    row_count: 120,
    total_commission: 1101.01,
    paid_amount: null,
    paid_diff: null,
    imported_at: "2026-10-06T12:54:00+00:00",
  },
  {
    report_id: PJ1_B,
    kind: "pj1",
    reference_month: "2026-09-01",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    file_key: "pj1-conta-b",
    file_name: "comissao_pj1_b.xlsx",
    row_count: 4,
    total_commission: 50,
    paid_amount: null,
    paid_diff: null,
    imported_at: "2026-10-06T13:10:00+00:00",
  },
  {
    report_id: FINDER,
    kind: "finder",
    reference_month: "2026-07-01",
    period_start: "2026-07-01",
    period_end: "2026-08-31",
    file_key: "finder-jul-ago",
    file_name: null,
    row_count: 30,
    total_commission: 300.5,
    paid_amount: null,
    paid_diff: null,
    imported_at: null,
  },
];

function line(
  reportId: string,
  kind: string,
  month: string,
  code: string,
  name: string,
  category: string,
  product: string,
  type: string,
  commission: number,
) {
  return {
    report_id: reportId,
    kind,
    reference_month: month,
    file_key: "x",
    advisor_code: code,
    advisor_name: name,
    advisor_active: true,
    category,
    product,
    type,
    commission,
    revenue: commission * 2,
    net_revenue: commission * 1.8,
    row_count: 10,
  };
}

export const linesResponse = [
  line(
    PJ1_A,
    "pj1",
    "2026-09-01",
    "1267653",
    "Marcio Roberto San Juam",
    "RENDA VARIAVEL",
    "BOLSA",
    "Corretagem",
    1200.004,
  ),
  line(
    PJ1_A,
    "pj1",
    "2026-09-01",
    "57253873",
    "Kaio Vinicius Candido A|lves",
    "FEE DE PLATAFORMA",
    "DESCONTO USO MÍNIMO",
    "Desconto Uso Minimo",
    -100.004,
  ),
  line(
    PJ1_A,
    "pj1",
    "2026-09-01",
    "57253873",
    "Kaio Vinicius Candido A|lves",
    "FUNDOS",
    "AÇÕES",
    "Taxa Adm.",
    0.335,
  ),
  line(
    PJ1_A,
    "pj1",
    "2026-09-01",
    "57253873",
    "Kaio Vinicius Candido A|lves",
    "FUNDOS",
    "MULTIMERCADOS",
    "Taxa Adm.",
    0.335,
  ),
  line(
    PJ1_A,
    "pj1",
    "2026-09-01",
    "57253873",
    "Kaio Vinicius Candido A|lves",
    "FUNDOS",
    "RENDA FIXA",
    "Taxa Adm.",
    0.335,
  ),
  line(
    PJ1_B,
    "pj1",
    "2026-09-01",
    "8430950",
    "Gabriel Noffs Dalla",
    "RENDA FIXA",
    "CDB",
    "Spread",
    50,
  ),
  line(
    FINDER,
    "finder",
    "2026-07-01",
    "1056306",
    "Leandro Ghiraldini Otero",
    "SEGURO",
    "VIDA",
    "Seguros",
    171.5,
  ),
  line(
    FINDER,
    "finder",
    "2026-07-01",
    "20966228",
    "Yasmin Martins De Souza",
    "PREVIDENCIA",
    "PREVIDENCIA INTERNA",
    "Previdência BTG",
    129,
  ),
];

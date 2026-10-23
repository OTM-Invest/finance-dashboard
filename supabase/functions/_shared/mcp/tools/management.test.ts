import { describe, expect, it } from "vitest";

import { fakeDataSource } from "../fixtures.ts";
import { managementBreakdown } from "./management.ts";

const RCO = "11111111-2222-3333-4444-555555555555";
const JIMMY = "11111111-2222-3333-4444-666666666666";
const ORG = "99999999-8888-7777-6666-555555555555";
const periodo = { from: "2026-07-01", to: "2026-09-30" };

/* eslint-disable @typescript-eslint/no-explicit-any -- asserção sobre payload dinâmico da tool */
const dados = (r: { dados: unknown }) => r.dados as any;

const plano = [
  { id: "g-tec", code: "tecnologia", name: "Tecnologia", parent_id: null },
  { id: "i-ia", code: "tecnologia.ia", name: "Inteligência artificial", parent_id: "g-tec" },
  { id: "g-det", code: "a_detalhar", name: "A detalhar", parent_id: null },
  { id: "i-cartao", code: "a_detalhar.cartao", name: "Fatura de cartão", parent_id: "g-det" },
];

function linha(p: Record<string, unknown>) {
  return {
    company_id: RCO,
    management_account_id: "i-ia",
    management_group_id: "g-tec",
    cost_center_id: null,
    nature: "opex",
    source: "card",
    requires_detail: false,
    vendor_key: null,
    vendor_name: null,
    currency: "BRL",
    outflow: "0",
    inflow: "0",
    amount_usd: null,
    iof_amount: "0",
    line_count: 1,
    months: ["2026-09-01"],
    ...p,
  };
}

const rows = [
  linha({ outflow: "300.00" }),
  linha({ outflow: "50.00", inflow: "10.00" }),
  linha({
    management_account_id: "i-cartao",
    management_group_id: "g-det",
    requires_detail: true,
    outflow: "160.00",
  }),
];

const ds = (rpcRows: unknown[] = rows) =>
  fakeDataSource({
    rpc: { management_breakdown_multi: rpcRows },
    query: {
      management_accounts: plano,
      cost_centers: [{ id: "a-tec", name: "Tecnologia" }],
      companies: [
        { id: RCO, organization_id: ORG },
        { id: JIMMY, organization_id: ORG },
      ],
    },
  });

describe("management_breakdown", () => {
  it("abre o gasto por grupo, com estorno reduzindo e participação", async () => {
    const r = await managementBreakdown.run({ company_id: RCO, ...periodo }, ds());

    expect(dados(r).total).toBe(500);
    expect(dados(r).linhas).toEqual([
      expect.objectContaining({
        nome: "Tecnologia",
        codigo: "tecnologia",
        total: 340,
        participacao_pct: 68,
      }),
      expect.objectContaining({ nome: "A detalhar", total: 160, participacao_pct: 32 }),
    ]);
  });

  it("mede a cobertura e avisa o que ainda está a detalhar", async () => {
    const r = await managementBreakdown.run({ company_id: RCO, ...periodo }, ds());

    expect(dados(r).cobertura).toEqual({
      classificado_pct: 68,
      a_detalhar: 160,
      a_detalhar_cartao: 160,
    });
    expect(r.meta.avisos?.join(" ")).toMatch(/A detalhar/);
  });

  it("consolidado manda a lista de empresas visíveis para a RPC", async () => {
    const d = ds();
    await managementBreakdown.run({ organization_id: ORG, ...periodo }, d);

    expect(d.rpcCalls[0].args).toMatchObject({
      p_company_ids: [RCO, JIMMY],
      p_basis: "accrual",
      p_by_vendor: false,
      p_codes: null,
    });
  });

  it("por fornecedor pede o fornecedor e diz em quantas empresas aparece", async () => {
    const d = ds([
      linha({ vendor_key: "ANTHROPIC", vendor_name: "Anthropic", outflow: "100" }),
      linha({
        company_id: JIMMY,
        vendor_key: "ANTHROPIC",
        vendor_name: "Anthropic",
        outflow: "50",
      }),
    ]);
    const r = await managementBreakdown.run({ company_id: RCO, ...periodo, por: "fornecedor" }, d);

    expect(d.rpcCalls[0].args.p_by_vendor).toBe(true);
    expect(dados(r).linhas[0]).toMatchObject({ fornecedor: "Anthropic", total: 150, empresas: 2 });
  });

  it("por área usa o nome da área e marca o sem área", async () => {
    const r = await managementBreakdown.run(
      { company_id: RCO, ...periodo, por: "area" },
      ds([linha({ cost_center_id: "a-tec", outflow: "10" }), linha({ outflow: "5" })]),
    );
    expect(dados(r).linhas.map((l: any) => l.area)).toEqual(["Tecnologia", "Sem área"]);
  });

  it("repassa códigos e regime de caixa", async () => {
    const d = ds();
    await managementBreakdown.run(
      { company_id: RCO, ...periodo, regime: "caixa", codigos: ["tecnologia.ia"] },
      d,
    );
    expect(d.rpcCalls[0].args).toMatchObject({ p_basis: "cash", p_codes: ["tecnologia.ia"] });
  });

  it("recusa código fora do plano, listando os grupos", async () => {
    await expect(
      managementBreakdown.run({ company_id: RCO, ...periodo, codigos: ["ia"] }, ds()),
    ).rejects.toThrow(/fora do plano.*tecnologia/);
  });

  it("recusa códigos em formato inválido", async () => {
    await expect(
      managementBreakdown.run({ company_id: RCO, ...periodo, codigos: "tecnologia" }, ds()),
    ).rejects.toThrow(/codigos/);
  });

  it("soma o que passa do top em 'outros'", async () => {
    const r = await managementBreakdown.run({ company_id: RCO, ...periodo, top: 1 }, ds());
    expect(dados(r).linhas).toHaveLength(1);
    expect(dados(r).outros).toMatchObject({ linhas: 1, total: 160 });
  });

  it("avisa quando a RPC bateu no teto de linhas", async () => {
    const muitas = Array.from({ length: 1000 }, () => linha({ outflow: "1" }));
    const r = await managementBreakdown.run({ company_id: RCO, ...periodo }, ds(muitas));
    expect(r.meta.avisos?.join(" ")).toMatch(/truncado/);
  });

  it("exige escopo e período", async () => {
    await expect(managementBreakdown.run(periodo, ds())).rejects.toThrow(/list_companies/);
    await expect(managementBreakdown.run({ company_id: RCO }, ds())).rejects.toThrow(/from/);
  });
});

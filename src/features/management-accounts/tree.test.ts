import { describe, expect, it } from "vitest";

import {
  buildManagementTree,
  nextItemCode,
  slugifyCodePart,
  type ManagementAccountRow,
  type MasterAccountRow,
} from "./tree";

function account(
  partial: Partial<ManagementAccountRow> & { id: string; code: string },
): ManagementAccountRow {
  return {
    parent_id: null,
    name: partial.code,
    kind: "expense",
    nature: "opex",
    requires_detail: false,
    sort_order: 0,
    is_active: true,
    ...partial,
  };
}

function master(id: string, code: string, target: string | null, sortOrder = 0): MasterAccountRow {
  return { id, code, name: `Conta ${code}`, sort_order: sortOrder, management_account_id: target };
}

const PLAN: ManagementAccountRow[] = [
  account({ id: "g-tec", code: "tecnologia", sort_order: 400 }),
  account({ id: "g-pes", code: "pessoas", sort_order: 300 }),
  account({ id: "i-soft", code: "tecnologia.software", parent_id: "g-tec", sort_order: 403 }),
  account({ id: "i-ia", code: "tecnologia.ia", parent_id: "g-tec", sort_order: 401 }),
  account({ id: "i-sal", code: "pessoas.salario_fixo", parent_id: "g-pes", sort_order: 301 }),
];

describe("buildManagementTree", () => {
  it("ordena grupos e itens pelo sort_order, não pela ordem de chegada", () => {
    const { groups } = buildManagementTree(PLAN, []);

    expect(groups.map((g) => g.group.code)).toEqual(["pessoas", "tecnologia"]);
    expect(groups[1]?.items.map((i) => i.account.code)).toEqual([
      "tecnologia.ia",
      "tecnologia.software",
    ]);
  });

  it("pendura cada conta no item para onde ela aponta e soma por grupo", () => {
    const masters = [
      master("m1", "6.1.01", "i-sal", 611),
      master("m2", "4.01", "i-sal", 410),
      master("m3", "6.2.08", "i-soft", 628),
    ];

    const { groups, orphanAccounts } = buildManagementTree(PLAN, masters);

    const pessoas = groups.find((g) => g.group.code === "pessoas");
    expect(pessoas?.mappedCount).toBe(2);
    expect(pessoas?.items[0]?.mappedAccounts.map((m) => m.code)).toEqual(["4.01", "6.1.01"]);
    expect(groups.find((g) => g.group.code === "tecnologia")?.mappedCount).toBe(1);
    expect(orphanAccounts).toEqual([]);
  });

  it("devolve como órfã a conta sem item ou apontando para grupo/id desconhecido", () => {
    const masters = [
      master("m1", "6.2.99", null),
      master("m2", "6.2.98", "g-tec"),
      master("m3", "6.2.97", "nao-existe"),
    ];

    const { groups, orphanAccounts } = buildManagementTree(PLAN, masters);

    expect(orphanAccounts.map((m) => m.code).sort()).toEqual(["6.2.97", "6.2.98", "6.2.99"]);
    expect(groups.every((g) => g.mappedCount === 0)).toBe(true);
  });

  it("mostra grupo sem itens em vez de escondê-lo", () => {
    const { groups } = buildManagementTree([account({ id: "g-x", code: "outros" })], []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual([]);
  });
});

describe("slugifyCodePart", () => {
  it("tira acento, baixa a caixa e troca o resto por _", () => {
    expect(slugifyCodePart("Inteligência Artificial")).toBe("inteligencia_artificial");
    expect(slugifyCodePart("  PJ & prestadores!  ")).toBe("pj_prestadores");
  });

  it("não devolve vazio para nome só de símbolos", () => {
    expect(slugifyCodePart("—")).toBe("item");
  });
});

describe("nextItemCode", () => {
  it("prefixa com o código do grupo", () => {
    expect(nextItemCode("tecnologia", "Segurança", new Set())).toBe("tecnologia.seguranca");
  });

  it("acrescenta sufixo quando o código já existe", () => {
    const existing = new Set(["tecnologia.seguranca", "tecnologia.seguranca_2"]);

    expect(nextItemCode("tecnologia", "Segurança", existing)).toBe("tecnologia.seguranca_3");
  });
});

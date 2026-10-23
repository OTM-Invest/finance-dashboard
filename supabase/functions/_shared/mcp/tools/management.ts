/**
 * Gasto pelo plano gerencial — a mesma leitura da Central de Gastos (`/gastos`).
 *
 * Responde "quanto gastamos com IA no trimestre?", "quanto custa a área de Tecnologia?",
 * "quais fornecedores pesam mais?" com o número da tela: a fonte é a RPC
 * `management_breakdown_multi` (camada `v_management_lines`, a mesma do Balanço) e as
 * contas saem de `_shared/management/breakdown.ts`, que a tela reexporta.
 *
 * Duas coisas que precisam ir na proveniência, porque mudam a leitura do número:
 *
 * 1. **Fatura de cartão conferida entra pelas compras.** Sem fatura importada, o cartão
 *    inteiro aparece em "A detalhar" — o gasto existe, mas ainda não está no item certo.
 *    A cobertura diz quanto do total está nessa situação.
 * 2. **Sugestão de IA não conta.** Compra só sai de "A detalhar" com regra ou aceite.
 */
import {
  coverageOf,
  parseBreakdownRow,
  spendBy,
  summarizeVendors,
  totalSpend,
  type BreakdownRpcRow,
} from "../../management/breakdown.ts";
import { resolverEscopo } from "../escopo.ts";
import { brl } from "../format.ts";
import {
  asObject,
  McpParamError,
  optionalEnum,
  optionalLimit,
  REGIMES,
  requireEscopo,
  requirePeriodo,
} from "../params.ts";
import { avisoTruncamento, proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, Regime, ToolResponse } from "../types.ts";

export const TOP_PADRAO = 15;
export const TOP_MAX = 50;
/** `max_rows` do PostgREST: a RPC devolve no máximo isto por chamada. */
export const LIMITE_LINHAS = 1000;
const MAX_CODIGOS = 20;

type Por = "grupo" | "item" | "area" | "fornecedor";
const POR: readonly Por[] = ["grupo", "item", "area", "fornecedor"] as const;

interface PlanoRow {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
}

interface AreaRow {
  id: string;
  name: string;
}

function lerCodigos(p: Record<string, unknown>): string[] | undefined {
  const value = p.codigos;
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_CODIGOS ||
    !value.every((c) => typeof c === "string" && /^[a-z_]+(\.[a-z0-9_]+)?$/.test(c))
  ) {
    throw new McpParamError(
      `Parâmetro "codigos", quando informado, é uma lista de 1 a ${MAX_CODIGOS} códigos do plano ` +
        'gerencial, como "tecnologia" (grupo) ou "tecnologia.ia" (item).',
    );
  }
  return [...new Set(value as string[])];
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

export const managementBreakdown: McpTool = {
  name: "management_breakdown",
  title: "Gasto pelo plano gerencial (Central de Gastos)",
  description:
    "Quanto se GASTOU num período pelo plano gerencial — o que o gasto é (Pessoas, Tecnologia, " +
    "Marketing, Ocupação, Equipamentos…) —, por área (time) ou por fornecedor, de uma empresa " +
    "(company_id) ou do grupo (organization_id). Mesmo número da tela Central de Gastos. Use para " +
    "'quanto gastamos com IA no trimestre', 'quanto custa a área de Tecnologia', 'quais fornecedores " +
    "pesam mais', 'qual assinatura é paga por duas empresas'. Recorte por códigos do plano " +
    "(ex.: ['tecnologia'] ou ['tecnologia.ia']). Compras de fatura de cartão conferida entram " +
    "detalhadas; o que ainda não foi classificado aparece em 'A detalhar' e é medido na cobertura. " +
    "Só gasto: receita, tributo sobre receita, resultado financeiro e distribuição ficam fora.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      organization_id: {
        type: "string",
        description: "UUID da organização, para o consolidado do grupo. Alternativa a company_id.",
      },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      regime: {
        type: "string",
        enum: ["competencia", "caixa"],
        description: "competencia (padrão) ou caixa.",
      },
      por: {
        type: "string",
        enum: ["grupo", "item", "area", "fornecedor"],
        description:
          "Como abrir o total. grupo (padrão): Pessoas, Tecnologia…; item: Inteligência artificial, " +
          "Infraestrutura…; area: o time que gasta; fornecedor: nome da regra ou contraparte, com em " +
          "quantas empresas aparece.",
      },
      codigos: {
        type: "array",
        items: { type: "string" },
        description:
          'Recorte por código do plano gerencial: grupo ("tecnologia") ou item ("tecnologia.ia"). ' +
          "Sem recorte, todo o gasto.",
      },
      top: {
        type: "number",
        description: `Quantas linhas detalhar. Padrão ${TOP_PADRAO}, teto ${TOP_MAX}.`,
      },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const escopo = await resolverEscopo(ds, requireEscopo(p));
    const periodo = requirePeriodo(p);
    const regime = optionalEnum<Regime>(p, "regime", REGIMES, "competencia");
    const por = optionalEnum<Por>(p, "por", POR, "grupo");
    const codigos = lerCodigos(p);
    const top = optionalLimit(p, "top", TOP_PADRAO, TOP_MAX);

    const plano = await ds.query<PlanoRow>({
      table: "management_accounts",
      columns: "id,code,name,parent_id",
      filters: [],
      order: { column: "sort_order", ascending: true },
      limit: 500,
    });
    if (codigos) {
      const conhecidos = new Set(plano.map((a) => a.code));
      const desconhecidos = codigos.filter((c) => !conhecidos.has(c));
      if (desconhecidos.length > 0) {
        const grupos = [...new Set(plano.filter((a) => !a.parent_id).map((a) => a.code))];
        throw new McpParamError(
          `Código(s) fora do plano gerencial: ${desconhecidos.join(", ")}. ` +
            `Grupos existentes: ${grupos.join(", ")}. Item é grupo.item (ex.: tecnologia.ia).`,
        );
      }
    }

    const brutas = await ds.rpc<BreakdownRpcRow>("management_breakdown_multi", {
      p_from: periodo.from,
      p_to: periodo.to,
      p_basis: regime === "caixa" ? "cash" : "accrual",
      p_company_ids: escopo.companyIds,
      p_by_vendor: por === "fornecedor",
      p_codes: codigos ?? null,
    });
    const rows = brutas.map(parseBreakdownRow);
    const total = totalSpend(rows);
    const cobertura = coverageOf(rows);
    const nomeConta = new Map(plano.map((a) => [a.id, a]));

    let linhas: Record<string, unknown>[];
    if (por === "fornecedor") {
      linhas = summarizeVendors(rows).map((v) => ({
        fornecedor: v.name,
        total: v.total,
        total_fmt: brl(v.total),
        participacao_pct: pct(v.total, total),
        empresas: v.companyIds.length,
        company_ids: v.companyIds,
        meses_com_gasto: v.months.length,
        usd: v.usd,
      }));
    } else {
      let nomeArea = new Map<string, string>();
      if (por === "area") {
        const areas = await ds.query<AreaRow>({
          table: "cost_centers",
          columns: "id,name",
          filters: [],
          limit: 500,
        });
        nomeArea = new Map(areas.map((a) => [a.id, a.name]));
      }
      const chave = (r: (typeof rows)[number]) =>
        por === "grupo" ? r.managementGroupId : por === "item" ? r.managementAccountId : r.areaId;
      linhas = [...spendBy(rows, chave).entries()]
        .map(([id, valor]) => {
          const conta = id ? nomeConta.get(id) : undefined;
          const nome =
            por === "area"
              ? id
                ? (nomeArea.get(id) ?? "Área removida")
                : "Sem área"
              : (conta?.name ?? "Sem grupo");
          return {
            ...(por === "area" ? { area: nome } : { nome, codigo: conta?.code ?? null }),
            total: valor,
            total_fmt: brl(valor),
            participacao_pct: pct(valor, total),
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    const detalhadas = linhas.slice(0, top);
    const resto =
      Math.round(linhas.slice(top).reduce((s, l) => s + (l.total as number), 0) * 100) / 100;

    const avisos = [...avisoTruncamento(brutas.length, LIMITE_LINHAS), ...escopo.avisos];
    if (cobertura.pending > 0) {
      avisos.push(
        `${brl(cobertura.pending)} (${pct(cobertura.pending, total)}% do gasto) ainda estão em "A detalhar"` +
          (cobertura.pendingCard > 0
            ? `, dos quais ${brl(cobertura.pendingCard)} são compras de cartão sem classificação confirmada`
            : "") +
          ". Esse valor existe, mas não está no grupo/item real — não conclua que um grupo gastou pouco " +
          "sem considerar essa parcela.",
      );
    }

    return {
      dados: {
        linhas: detalhadas,
        ...(resto !== 0
          ? { outros: { linhas: linhas.length - top, total: resto, total_fmt: brl(resto) } }
          : {}),
        total,
        total_fmt: brl(total),
        cobertura: {
          classificado_pct: cobertura.confirmedPct,
          a_detalhar: cobertura.pending,
          a_detalhar_cartao: cobertura.pendingCard,
        },
      },
      meta: proveniencia({
        fonte: "RPC management_breakdown_multi (camada v_management_lines)",
        escopo: escopo.rotulo,
        periodo: periodo.rotulo,
        regime,
        linhas: detalhadas.length,
        como_calculado:
          "Gasto = saídas − entradas (estorno reduz) dos itens de natureza despesa do plano gerencial. " +
          "O item sai da conta contábil pelo mapa do plano; fatura de cartão conferida é substituída " +
          "pelas compras, e compra só conta no item escolhido com regra ou confirmação humana — senão " +
          "fica em 'A detalhar'. Mesma fonte e mesma regra da tela Central de Gastos e do Balanço." +
          (codigos ? ` Recorte pelos códigos: ${codigos.join(", ")}.` : ""),
        avisos,
      }),
    };
  },
};

/**
 * Análise por centro de custo e por contraparte — as duas dimensões pelas quais
 * "por que o resultado caiu" costuma ser respondido.
 *
 * As duas RPCs desta camada têm uma característica que precisa ser dita alto:
 * **elas NÃO excluem transferência entre contas**. `search_transactions` exclui por
 * padrão, porque mover dinheiro entre contas da mesma empresa não é receita nem
 * despesa. Aqui não há filtro, então uma TED interna aparece como receita num lado e
 * despesa no outro. É a mesma conta que o dashboard mostra, e por isso é preservada —
 * mas vai na proveniência, porque a IA precisa saber antes de dizer "a receita do
 * centro X foi Y".
 *
 * E elas discordam entre si no status, o que também vai declarado:
 * `cost_center_analysis` inclui `pending` (competência de verdade);
 * `counterparty_analysis` não inclui.
 */
import { brl, toNumber } from "../format.ts";
import {
  asObject,
  optionalBoolean,
  optionalEnum,
  optionalLimit,
  requirePeriodo,
  requireUuid,
} from "../params.ts";
import { proveniencia } from "../provenance.ts";
import type { McpDataSource, McpTool, ToolResponse } from "../types.ts";

export const CONTRAPARTES_PADRAO = 20;
export const CONTRAPARTES_MAX = 100;

/** Regime aceito por `cost_center_monthly_series` (enum `accounting_basis`). */
type Base = "competencia" | "caixa";
const BASES: readonly Base[] = ["competencia", "caixa"] as const;
const BASE_SQL: Record<Base, "accrual" | "cash"> = { competencia: "accrual", caixa: "cash" };

type TipoContraparte = "todas" | "customer" | "supplier" | "employee" | "partner" | "government";
const TIPOS: readonly TipoContraparte[] = [
  "todas",
  "customer",
  "supplier",
  "employee",
  "partner",
  "government",
] as const;

interface CentroRow {
  cost_center_id: string | null;
  cost_center_name: string;
  revenue: string | number | null;
  expense: string | number | null;
  net: string | number | null;
  margin_pct: string | number | null;
  transaction_count: number;
}

interface CentroMesRow {
  month: string;
  cost_center_id: string | null;
  cost_center_name: string;
  revenue: string | number | null;
  expense: string | number | null;
  transaction_count: number;
}

interface ContraparteRow {
  counterparty_id: string;
  counterparty_name: string;
  counterparty_kind: string;
  total_inflow: string | number | null;
  total_outflow: string | number | null;
  net: string | number | null;
  transaction_count: number;
  avg_ticket: string | number | null;
  last_movement: string | null;
}

const AVISO_TRANSFERENCIA =
  "Esta análise INCLUI transferência entre contas da mesma empresa, ao contrário de search_transactions, " +
  "que a exclui por padrão. Uma TED interna aparece como entrada de um lado e saída do outro, inflando " +
  "receita e despesa sem alterar o líquido. Considere isso antes de citar receita por dimensão.";

export const costCenterAnalysis: McpTool = {
  name: "cost_center_analysis",
  title: "Análise por área (centro de custo)",
  description:
    "Receita, despesa, resultado e margem por ÁREA (o time: Assessores, Tecnologia, Diretoria… — " +
    "tecnicamente centro de custo) de uma empresa num período, com série " +
    "mensal opcional. Use para 'qual área dá prejuízo', 'qual centro de custo cresceu mais', " +
    "'como está o balanço gerencial'. " +
    "Lançamento sem centro de custo aparece agrupado como 'Sem centro de custo' e entra nos totais. " +
    "Valores em módulo (receita e despesa positivas); o resultado é receita menos despesa.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      regime: {
        type: "string",
        enum: ["competencia", "caixa"],
        description:
          "Só afeta a série mensal. competencia (padrão) ou caixa. O total do período é sempre competência.",
      },
      incluir_serie_mensal: {
        type: "boolean",
        description: "Padrão: false. true acrescenta a evolução mês a mês por centro de custo.",
      },
    },
    required: ["company_id", "from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const companyId = requireUuid(
      p,
      "company_id",
      'Use a tool "list_companies" para descobrir o id.',
    );
    const periodo = requirePeriodo(p);
    const regime = optionalEnum<Base>(p, "regime", BASES, "competencia");
    const incluirSerie = optionalBoolean(p, "incluir_serie_mensal", false);

    const [totais, serie] = await Promise.all([
      ds.rpc<CentroRow>("cost_center_analysis", {
        p_company_id: companyId,
        p_from: periodo.from,
        p_to: periodo.to,
      }),
      incluirSerie
        ? ds.rpc<CentroMesRow>("cost_center_monthly_series", {
            p_company_id: companyId,
            p_from: periodo.from,
            p_to: periodo.to,
            p_basis: BASE_SQL[regime],
          })
        : Promise.resolve([] as CentroMesRow[]),
    ]);

    const centros = totais.map((r) => ({
      cost_center_id: r.cost_center_id,
      centro_de_custo: r.cost_center_name,
      receita: toNumber(r.revenue),
      despesa: toNumber(r.expense),
      resultado: toNumber(r.net),
      resultado_fmt: brl(r.net),
      margem_pct: r.margin_pct === null ? null : Math.round(toNumber(r.margin_pct) * 10) / 10,
      lancamentos: r.transaction_count,
    }));

    const consolidado = centros.reduce(
      (acc, c) => ({
        receita: Math.round((acc.receita + c.receita) * 100) / 100,
        despesa: Math.round((acc.despesa + c.despesa) * 100) / 100,
        resultado: Math.round((acc.resultado + c.resultado) * 100) / 100,
      }),
      { receita: 0, despesa: 0, resultado: 0 },
    );

    return {
      dados: {
        centros_de_custo: centros,
        total: { ...consolidado, resultado_fmt: brl(consolidado.resultado) },
        ...(incluirSerie
          ? {
              serie_mensal: serie.map((r) => ({
                mes: r.month.slice(0, 7),
                cost_center_id: r.cost_center_id,
                centro_de_custo: r.cost_center_name,
                receita: toNumber(r.revenue),
                despesa: toNumber(r.expense),
                resultado: Math.round((toNumber(r.revenue) - toNumber(r.expense)) * 100) / 100,
                lancamentos: r.transaction_count,
              })),
            }
          : {}),
      },
      meta: proveniencia({
        fonte: incluirSerie
          ? "RPCs cost_center_analysis + cost_center_monthly_series"
          : "RPC cost_center_analysis",
        escopo: `empresa ${companyId}`,
        periodo: periodo.rotulo,
        regime: "competencia",
        linhas: centros.length,
        como_calculado:
          "Total do período: lançamentos datados por accrual_date com status settled, reconciled e pending " +
          "(competência), somados em módulo por centro de custo — receita = entradas, despesa = saídas, " +
          "resultado = receita - despesa. margem_pct = resultado / receita, null quando não há receita. " +
          (incluirSerie
            ? `A série mensal usa o regime pedido (${regime}); o total do período é sempre competência, ` +
              "então os dois podem não fechar quando o regime escolhido é caixa. "
            : ""),
        avisos: [AVISO_TRANSFERENCIA],
      }),
    };
  },
};

export const counterpartyAnalysis: McpTool = {
  name: "counterparty_analysis",
  title: "Análise por cliente ou fornecedor",
  description:
    "Maiores contrapartes de uma empresa num período: quanto entrou, quanto saiu, líquido, número de " +
    "lançamentos, ticket médio e último movimento. Use para 'meus cinco maiores clientes', " +
    "'concentração de receita', 'quanto pago a este fornecedor', 'quem parou de comprar'. " +
    "Ordenado por volume movimentado (entradas + saídas). " +
    "Só considera lançamento COM contraparte informada — lançamento sem contraparte não aparece e " +
    "não entra nos totais.",
  inputSchema: {
    type: "object",
    properties: {
      company_id: { type: "string", description: "UUID da empresa. Use list_companies." },
      from: { type: "string", description: "Início do período, AAAA-MM-DD." },
      to: { type: "string", description: "Fim do período, AAAA-MM-DD." },
      tipo: {
        type: "string",
        enum: [...TIPOS],
        description:
          "Filtra pelo tipo cadastrado da contraparte: todas (padrão), customer, supplier, employee, partner, government.",
      },
      limite: {
        type: "number",
        description: `Quantas contrapartes retornar. Padrão ${CONTRAPARTES_PADRAO}, teto ${CONTRAPARTES_MAX}.`,
      },
    },
    required: ["company_id", "from", "to"],
    additionalProperties: false,
  },

  async run(params: unknown, ds: McpDataSource): Promise<ToolResponse> {
    const p = asObject(params);
    const companyId = requireUuid(
      p,
      "company_id",
      'Use a tool "list_companies" para descobrir o id.',
    );
    const periodo = requirePeriodo(p);
    const tipo = optionalEnum<TipoContraparte>(p, "tipo", TIPOS, "todas");
    const limite = optionalLimit(p, "limite", CONTRAPARTES_PADRAO, CONTRAPARTES_MAX);

    const rows = await ds.rpc<ContraparteRow>("counterparty_analysis", {
      p_company_id: companyId,
      p_from: periodo.from,
      p_to: periodo.to,
      // A RPC espera 'all' como curinga; o parâmetro da tool é em português.
      p_kind: tipo === "todas" ? "all" : tipo,
      p_limit: limite,
    });

    const contrapartes = rows.map((r) => ({
      counterparty_id: r.counterparty_id,
      contraparte: r.counterparty_name,
      tipo: r.counterparty_kind,
      entradas: toNumber(r.total_inflow),
      saidas: toNumber(r.total_outflow),
      liquido: toNumber(r.net),
      liquido_fmt: brl(r.net),
      lancamentos: r.transaction_count,
      ticket_medio: toNumber(r.avg_ticket),
      ultimo_movimento: r.last_movement,
    }));

    const volumeTotal = contrapartes.reduce(
      (s, c) => Math.round((s + c.entradas + c.saidas) * 100) / 100,
      0,
    );
    const entradasTotal = contrapartes.reduce(
      (s, c) => Math.round((s + c.entradas) * 100) / 100,
      0,
    );

    // Concentração: a pergunta "quanto do faturamento depende dos cinco maiores"
    // aparece com nome próprio na motivação do projeto. Calculada aqui, sobre as
    // ENTRADAS, que é o que "depender de cliente" significa.
    const porEntrada = [...contrapartes].sort((a, b) => b.entradas - a.entradas);
    const concentracao = (n: number) => {
      if (entradasTotal === 0) return null;
      const topN = porEntrada.slice(0, n).reduce((s, c) => s + c.entradas, 0);
      return Math.round((topN / entradasTotal) * 1000) / 10;
    };

    return {
      dados: {
        contrapartes,
        volume_total: volumeTotal,
        volume_total_fmt: brl(volumeTotal),
        entradas_total: entradasTotal,
        entradas_total_fmt: brl(entradasTotal),
        concentracao_de_entradas: {
          top_1_pct: concentracao(1),
          top_3_pct: concentracao(3),
          top_5_pct: concentracao(5),
        },
      },
      meta: proveniencia({
        fonte: "RPC counterparty_analysis",
        escopo: `empresa ${companyId}`,
        periodo: periodo.rotulo,
        linhas: contrapartes.length,
        como_calculado:
          "Lançamentos datados por accrual_date, com status settled e reconciled, agrupados por " +
          "contraparte. entradas e saidas em módulo; liquido = entradas - saidas. " +
          "ticket_medio = (entradas + saidas) / número de lançamentos. " +
          `Ordenado por volume movimentado, limitado às ${limite} maiores. ` +
          "concentracao_de_entradas é a fatia das ENTRADAS que vem das N maiores contrapartes, calculada " +
          "sobre as contrapartes retornadas.",
        avisos: [
          AVISO_TRANSFERENCIA,
          "Não inclui lançamento com status pending, ao contrário de cost_center_analysis e de get_dre em " +
            "competência.",
          ...(rows.length >= limite
            ? [
                `Resultado limitado às ${limite} maiores contrapartes: os percentuais de concentração usam ` +
                  "esse recorte como denominador e portanto SUPERESTIMAM a concentração real. Aumente o " +
                  "limite antes de afirmar dependência de cliente.",
              ]
            : []),
        ],
      }),
    };
  },
};

# Receita por área — plano

> Estado: **fases 3 a 6 implementadas** (exceto a tool de MCP e o campo na tela de
> colaboradores) — o que mudou de rota está em
> [`receita-por-area.md`](receita-por-area.md) §2, que é o documento de estado. Este
> arquivo é o plano original, de 2026-10-26, mantido como histórico do "porquê".
>
> Escrito a partir de leituras nos dois bancos: Finance Dashboard
> (`vbeevkjenvgvnattzszt`) e CRM (`jstpwopotsnmbesvmakg`), e do importador do CRM
> (`otm-invest-crm`, `src/features/data-import/components/revenue-total-processor.ts`).
> Escopo: a receita do BTG, que cai em **duas empresas**. A OTM Assessoria recebe o
> relatório PJ1; a OTM Corretora recebe o PJ2 e o "finder".

## 1. Objetivo

Hoje o financeiro sabe **quanto** o BTG pagou por mês, mas não **de onde** veio. O gasto
já se abre por área (folha com a área do colaborador, compras de cartão por item). A
receita, não. O que queremos responder:

- quanto cada área gerou de receita (Bankers, Mesa Digital, Agility Sales, Onboarding…);
- de qual produto (corretagem de bolsa, aluguel, conta virada, fee fixo, estruturadas,
  renda fixa, câmbio…);
- e, com as duas pontas abertas, **a margem de cada área**: receita da área − custo dela.

## 2. O que existe hoje

### 2.1 No financeiro

Três lançamentos por mês na conta `1.01 Venda de Serviços`, contraparte BTG Pactual, com
`accrual_date` = mês de referência e `cash_date` = dia do pagamento (mês seguinte):

| Empresa        | Lançamento                 | Ex.: set/26 | Pago em |
| -------------- | -------------------------- | ----------: | ------- |
| OTM Assessoria | "comissão ref setembro"    |  856.542,19 | 07/10   |
| OTM Corretora  | "comissão ref setembro"    |   32.845,23 | 07/10   |
| OTM Corretora  | "comissão ref set. finder" |    3.680,67 | 13/10   |

### 2.2 No CRM

A tabela `revenues` (5 milhões de linhas) é o relatório de comissão do BTG, linha a
linha:

| Coluna                          | O que é                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `revenue_date`                  | dia da receita                                                      |
| `account`                       | conta do cliente no BTG                                             |
| `advisor_code`                  | **código do assessor no BTG**                                       |
| `category` / `product` / `type` | de onde veio (ex.: `RENDA VARIAVEL` / `BOLSA` / `Corretagem`)       |
| `revenue_value`                 | receita bruta gerada no BTG                                         |
| `commission_value`              | **o que cabe ao escritório** (inclui descontos e perdas, negativos) |
| `processed_at`                  | quando a linha foi importada                                        |

Ela é alimentada **à mão**: alguém sobe o arquivo do BTG na tela de importação do CRM, e
o importador faz `upsert` em `revenues`. Cada arquivo vira um **lote**, com o mesmo
`processed_at` para todas as linhas.

O CRM já separa PJ1 de PJ2, **por categoria**, em `get_pj1_monthly_revenue`,
`get_pj2_monthly_revenue` e `get_monthly_revenue`:

- **PJ2**: `CAMBIO`, `CONTA VIRADA`, `CREDITO ESTRUTURADO`, `FEE TRANSACIONAL`,
  `FEE TRANSACIONAL PME`;
- **PJ1**: todo o resto.

`advisors` liga `code` ao nome e a um `position` (`banker`, `digital`, `sales`, `admin`,
`tecnology`), que lembra nossas áreas mas não é igual a elas.

### 2.3 Fecha — desde que se some por relatório, não por data

Somando `commission_value` **pela data** (`revenue_date` no mês), o CRM fica sempre acima
da Assessoria, em 3,6% a 6,9%. A diferença era a Corretora: somando as duas empresas, a
distância cai para menos de 1% (set/26: R$ 893.068,09 no financeiro × R$ 892.266,85 no
CRM).

Essa última diferença vem de linhas **datadas fora do mês do relatório**:

- o desconto de uso mínimo (`FEE DE PLATAFORMA`) do relatório de setembro vem datado
  de 01/10;
- o finder (`SEGURO` + `PREVIDENCIA`) chega num arquivo separado, cerca de uma semana
  depois, com linhas de dois meses.

Somar **por lote**, ou seja, por arquivo importado, reproduz o que foi pago:

| Ref.   | Relatório | Lote no CRM | CRM (lote) | Financeiro | Diferença |
| ------ | --------- | ----------- | ---------: | ---------: | --------: |
| jun/26 | PJ2       | 07/07       |  37.649,45 |  37.649,45 |  **0,00** |
| jul/26 | finder    | 11/08       |   3.879,36 |   3.879,36 |  **0,00** |
| mai/26 | PJ1       | 05/06       | 660.404,69 | 660.419,35 |    −14,66 |
| jun/26 | PJ1       | 07/07       | 861.116,92 | 861.131,26 |    −14,34 |
| jul/26 | PJ1 + PJ2 | 10/08       | 724.664,44 | 724.686,39 |    −21,95 |
| ago/26 | PJ1 + PJ2 | 04/09       | 849.455,21 | 849.463,82 |     −8,61 |

Nos lotes de PJ1 descontei a linha de telefonia (`CUSTOS`, −R$ 972), que foi
**reimportada em 22/10** e por isso saiu do lote original. É um sintoma do problema
abaixo.

Em jul e ago, PJ1 e PJ2 erram em sentidos opostos e por quase o mesmo valor (+320,92 /
−342,87 e +261,43 / −270,04). Ou seja, algum produto está no PJ errado na regra por
categoria do CRM. O candidato é `SALDO REMUNERADO TRANSACIONAL` (336,59 em jul, 269,94 em
ago), mas jun não confirma. **Precisa ser conferido com o arquivo do BTG.**

### 2.4 Por que não dá para puxar "do jeito que está"

O CRM não guarda **de qual relatório** veio cada linha. Hoje isso só se reconstrói:

- **por `processed_at`**, que muda quando alguém reimporta (todo o mês de março foi
  reimportado em 22/10, e a telefonia de vários meses também);
- **pela regra de categoria**, que erra por algumas centenas de reais por mês;
- **pela data**, que joga ajustes no mês errado.

Juntar as três heurísticas no financeiro seria a gambiarra. Além disso, o `upsert` do
importador usa como chave `account, revenue_date, asset, commission_value`. Duas linhas
legítimas iguais viram uma só, e uma linha corrigida pelo BTG (valor novo) **não
substitui** a antiga: entra ao lado dela.

## 3. Arquitetura proposta

### 3.1 No CRM: dar identidade ao relatório (pré-requisito)

Uma tabela `btg_commission_reports`: `id`, `reference_month`, `kind`
(`pj1` | `pj2` | `finder`), arquivo, quem subiu, quando, total de `commission_value`.
`revenues` ganha `report_id`.

- Na importação, quem sobe escolhe o mês e o tipo. O arquivo do BTG já vem separado por
  PJ, então é uma escolha, não uma classificação.
- **Reimportar o mesmo relatório substitui as linhas dele** (apaga por `report_id` e
  insere), em vez de `upsert` pela chave de quatro colunas. Isso resolve as duplicatas e
  as correções que entram ao lado.
- **Backfill de 2026** pelos lotes de `processed_at`, conferido mês a mês contra os
  lançamentos do financeiro (§2.3). O que não fechar, reimporta do arquivo original.

Com isso, a regra "PJ2 = estas categorias" deixa de ser necessária: o relatório diz de
quem é.

### 3.2 Leitura pelo financeiro

- **RPC no CRM `finance_commission_report(p_from, p_to)`**, `security definer`, que
  devolve **por relatório** o agregado `report_id, reference_month, kind, advisor_code,
category, product, type, commission, revenue, rows`. São cerca de mil linhas por
  relatório, sem conta nem nome de cliente (LGPD).
- **Papel `finance_reader`** no CRM, com `execute` só nessa função. O financeiro chama
  com um JWT desse papel guardado no Vault. **Nada de service role do CRM no
  financeiro.**
- **Edge Function `crm-revenue-sync`** no financeiro (pg_cron diário + botão "Sincronizar
  agora"). Ela grava `crm_commission_snapshot` e é idempotente: se o relatório no CRM
  mudar (reimportação), o snapshot é substituído e a conferência refeita.

### 3.3 No financeiro: abrir o lançamento, como a fatura de cartão

Cada um dos três lançamentos mensais (PJ1 → Assessoria, PJ2 e finder → Corretora) é
casado com o relatório correspondente e **aberto em linhas** (assessor × produto). É o
mesmo mecanismo de `card_statements` / `card_statement_lines`, já em produção:

| Tabela                    | Papel                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `revenue_statements`      | um por lançamento: `transaction_id`, `crm_report_id`, total do relatório, total do lançamento, `status` |
| `revenue_statement_lines` | `employee_id` (pelo código BTG), `management_account_id` (pela categoria), `amount numeric(18,2)`       |

- **Conferência no banco** (`save_revenue_statement`, como `save_card_statement`): as
  linhas fecham com o lançamento. Com a identidade de relatório, a diferença esperada é
  zero ou de centavos. Acima de uma tolerância pequena (decisão D1), o statement fica em
  `needs_review` e **não** entra no Balanço.
- **`v_management_lines` ganha um ramo `source = 'revenue'`**: statement conferido troca o
  lançamento único pelas linhas. A camada continua sem criar nem sumir com dinheiro
  (`management_reconciliation` segue dando zero).
- **Área = área atual do colaborador**, lida na hora (`employees.cost_center_id`), a
  mesma regra aplicada à folha. Assim, receita e custo de um time usam o mesmo mapa.

**Quem é quem: `employees.btg_advisor_code`.** O nome não serve para ligar os sistemas:
"Humberto Ataliao Prado" × "Humberto Atalião Vilas Boas Correa Do Prado", "Kaio Vinicius
Candido A|lves" × "…Alves", "San Juan" × "San Juam". Código sem colaborador cai em
"Sem área", visível como pendência.

**O que a receita é: categoria → item gerencial.** O grupo Receitas do plano gerencial
ganha itens (Corretagem bolsa, BMF, Aluguel, Conta virada, Fee fixo, Estruturadas, Renda
fixa, Câmbio, Fundos, Seguros e previdência, Outras). Uma tabela
`revenue_category_map (category, product, type) → management_account_id` faz o de-para,
com tela. Combinação nova do BTG cai em "Outras" com aviso.

**Descontos e perdas** (`FEE DE PLATAFORMA`, `ERRO OPERACIONAL`, `CUSTOS`) ficam como
"Deduções BTG" dentro de Receitas, porque o BTG desconta antes de pagar (decisão D3).

## 4. Fases

| Fase                      | Onde       | O que                                                                                                          | Pronto quando                                                                              |
| ------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **1. Relatório com nome** | CRM        | `btg_commission_reports`, `report_id` em `revenues`, importação que substitui por relatório, backfill de 2026  | Para cada mês de 2026, PJ1 = lançamento da Assessoria e PJ2/finder = Corretora, ao centavo |
| **2. Leitura**            | CRM        | RPC agregada + papel `finance_reader`                                                                          | O financeiro lê um relatório com o JWT do papel e nada mais                                |
| **3. Mapas**              | Financeiro | `employees.btg_advisor_code` (com coluna na tela), itens de receita no plano gerencial, `revenue_category_map` | Todos os códigos de 2026 ligados a colaborador; nenhuma categoria em "Outras"              |
| **4. Sincronização**      | Financeiro | `crm_commission_snapshot`, Edge Function, cron, Vault, botão                                                   | Snapshot igual ao CRM, relatório a relatório (assert)                                      |
| **5. Abertura**           | Financeiro | `revenue_statements`/`lines`, `save_revenue_statement`, ramo novo em `v_management_lines`                      | `management_reconciliation` = 0; linha do Balanço casa uma vez só (assert)                 |
| **6. Telas**              | Financeiro | Receita por área / produto / assessor; margem por área no Balanço; tool de MCP                                 | Margem por área em `/reports` → Balanço                                                    |

A fase 3 não depende de nada e pode começar já. As fases 1 e 2 são no repositório do CRM.

**Plano B, se a fase 1 não andar:** reimportar os arquivos do BTG direto no financeiro
(uma tela de upload por lançamento, como `/faturas`). A abertura (fase 5) é a mesma; muda
só de onde vêm as linhas. Como você pediu, o caminho preferido é puxar do CRM.

## 5. Decisões em aberto

| #   | Pergunta                                                                    | Recomendação                                                                                   |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | Tolerância para conferir o statement (relatório × lançamento)               | Centavos, com o relatório identificado. Acima disso fica `needs_review` e não entra no Balanço |
| D2  | Receita de quem mudou de time: área atual ou da época?                      | Área atual, a mesma regra da folha                                                             |
| D3  | Erro operacional e custos cobrados pelo BTG: dedução de receita ou despesa? | Dedução de receita; confirmar com a contabilidade                                              |
| D4  | Medida: `commission_value` ou `revenue_value`?                              | `commission_value` no Balanço (é o que vira nota); `revenue_value` só como indicador comercial |
| D5  | `SALDO REMUNERADO TRANSACIONAL` (e outros) é PJ1 ou PJ2?                    | Some com a fase 1: quem diz é o arquivo, não a regra de categoria                              |

## 6. Riscos

- **Reimportação no CRM**: hoje ela muda `processed_at` e pode duplicar linhas. Depois da
  fase 1, reimportar substitui o relatório inteiro e o financeiro reabre a conferência.
  Nada muda em silêncio.
- **Acoplamento entre projetos**: a função do CRM é versionada nos dois lados; mudança de
  formato faz a sincronização falhar alto (Zod na fronteira), sem gravar errado.
- **Volume**: só o agregado atravessa. Nunca trazer `revenues` cru.
- **Fora do escopo**: Jimmy e RCO têm receita de pagar.me, que já tem detalhamento
  próprio (`/vendas`).

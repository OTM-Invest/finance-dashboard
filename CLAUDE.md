# CLAUDE.md — Finance Dashboard · OTM Group

Contexto e convenções deste projeto para agentes de IA e devs. Leia antes de mexer no código.

## O que é

Dashboard financeiro consolidado do **grupo OTM** (Holding, Assessoria, Corretora, RCO Tecnologia).
Substitui a planilha de DRE: imputa receita, despesas e folha; gera **DRE, fluxo de caixa, KPIs e visão consolidada** multi-empresa. Em evolução: **emissão de NFS-e** a partir de vendas do pagar.me (ver `docs/integrations/`).

## Stack

| Camada   | Tecnologia                                                      |
| -------- | --------------------------------------------------------------- |
| Build    | Vite 6 + React 19 + TypeScript · **bun** (runtime/pm)           |
| Routing  | React Router v7 (SPA)                                           |
| Styling  | Tailwind CSS v4 + tokens próprios (direção "Bento Financeiro")  |
| UI       | shadcn-style primitives + Radix UI + Lucide                     |
| State    | TanStack Query (server) · nuqs (URL) · Zustand (client, futuro) |
| Forms    | React Hook Form + Zod                                           |
| Tabelas  | TanStack Table · Charts: Recharts                               |
| Dinheiro | Dinero.js (operações) + `numeric(18,2)` no Postgres             |
| Datas    | date-fns + ptBR                                                 |
| Backend  | **Supabase** (Postgres 17 + Auth + RLS + Storage) · `sa-east-1` |
| Deploy   | **Cloudflare Pages** (estático)                                 |

Projeto Supabase: `vbeevkjenvgvnattzszt` ("Finance Dashboard").

## Comandos

```sh
bun run dev            # Vite dev server
bun run build          # tsc -b && vite build
bun run preflight      # typecheck + lint + format:check + test  (rode antes de PR)
bun run test:run       # vitest (uma vez)
bun run lint:fix       # eslint --fix
# Banco (Supabase) — ver docs/database/migrations.md
bun run db:start       # stack local (Docker)
bun run db:reset       # recria banco local do zero (aplica todas as migrations + seed)
bun run db:new <nome>  # nova migration vazia
bun run db:push        # aplica migrations pendentes no remoto (só após PR)
bun run db:types:local # regenera src/types/database.ts do banco local
```

## Estrutura

```
src/
├── components/
│   ├── ui/            # primitives shadcn-style (Radix)
│   └── layout/        # AppShell, Sidebar, Topbar, CompanySwitcher
├── features/          # domínio: cada feature tem api.ts, hooks.ts, schema.ts, components/
│   ├── companies/ transactions/ bills/ taxes/ recurring/ employees/ ...
├── lib/               # supabase client, queryClient, money, dates, format, cn
├── routes/            # páginas de rota
├── styles/            # tokens.css + globals.css (Tailwind v4 @theme inline)
└── types/             # database.ts (gerado do Supabase — NÃO editar à mão)
supabase/
├── migrations/        # fonte da verdade do schema (versionado)
├── functions/         # Edge Functions (Deno) — webhooks/orquestração
│   └── _shared/       # código puro compartilhado entre functions (Deno)
└── config.toml
docs/
├── database/migrations.md             # workflow de migrations
└── integrations/                      # NFS-e (Focus × pagar.me): arquitetura + plano
```

**Organização por feature, não por tipo de arquivo.** Arquivos pequenos e coesos (200–400 linhas; máx. 800).

## Banco de dados & migrations

> Detalhes completos em [`docs/database/migrations.md`](docs/database/migrations.md).

- **Fonte da verdade = arquivos em `supabase/migrations/`.** Toda mudança de schema é uma migration revisada em PR.
- **Nunca** alterar o schema direto pelo dashboard/SQL editor do remoto sem migration (causa drift).
- **Sempre** testar com `bun run db:reset` (local, do zero) antes de `bun run db:push`.
- Migrations são **imutáveis** após aplicadas/mergeadas — corrija com uma nova, nunca editando uma antiga.
- **Dados de demo/negócio NÃO vão em migration** → `supabase/seed.sql` (local). Migration = schema + dados de referência agnósticos de ambiente.
- Regenerar `src/types/database.ts` no mesmo PR da migration.

### Convenções de schema (siga os padrões existentes)

- snake_case; PK `uuid default gen_random_uuid()`; `created_at`/`updated_at timestamptz`; `metadata jsonb default '{}'`.
- Dinheiro: **`numeric(18,2)`** (nunca float). No app, Dinero.js.
- Enums Postgres para estados de domínio (ex.: `transaction_status`, `invoice_job_status`).
- Trigger de timestamp: `create trigger trg_<t>_updated before update on <t> for each row execute function set_updated_at();`
- Auditoria: `create trigger trg_audit_<t> after insert or update or delete on <t> for each row execute function audit_record();` (grava em `audit_log`, usa `auth.uid()`).

### RLS (obrigatório desde o primeiro dia em toda tabela nova)

Helpers existentes: `is_super_admin()`, `has_company_access(uuid)`, `is_financial_user()`.

⚠️ **View nova sobre tabela com RLS precisa de `with (security_invoker = true)`.**
Sem isso a view roda com os privilégios do DONO (`postgres`), que também é dono das
tabelas e **bypassa a RLS** — `transactions` não tem `force row level security`. O
resultado é uma view que devolve todas as empresas para qualquer usuário logado.

Não é hipótese: `v_bills` e `v_bills_aging` nasceram assim e ficaram **15 meses** em
produção furando a RLS. Um `viewer` com acesso a 1 de 4 empresas via 4 empresas e 2821
títulos pela view, contra 1 empresa e 800 linhas pela tabela. A tela `/bills` mostrava
título, contraparte e valor de empresa alheia sempre que o switcher estava em "todas as
empresas", porque o filtro de empresa era só client-side. Corrigido em
`…_v_bills_security_invoker`.

Como conferir depois de criar view:

```sql
select relname, reloptions from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v';
-- toda linha deve mostrar {security_invoker=true}
```

`security_invoker` exige que `authenticated` tenha `select` nas tabelas de base (ver
§Grants em `mcp-insights-system.md`): se a view devolver "permission denied" num banco
reconstruído das migrations, é grant faltando, não a policy.

⚠️ **Policy de SELECT de tabela cuja UI insere com `.select()` NÃO pode consultar a
própria tabela.** `supabase.from(t).insert(...).select()` gera `INSERT ... RETURNING`, e o
Postgres aplica a policy de **SELECT** à linha nova. Se essa policy chamar uma função
`stable` que lê a própria tabela, a função vê o snapshot do início do statement — onde a
linha em inserção ainda não existe — e o INSERT é recusado com

```
new row violates row-level security policy for table "<t>"
```

sem citar policy nenhuma (o RETURNING não atribui nome), inclusive para super admin, e com
todos os termos da policy de INSERT verdadeiros. Foi o que aconteceu em `company_groups`:
a policy de SELECT consultava `visible_company_group_ids()`, que lia `company_groups`.
Corrigido em `…_grupos_visibilidade_sem_autorreferencia` invertendo o conjunto — a função
passou a calcular o que está **oculto**, lendo só a tabela de membros.

Note também que erro de policy **restritiva** vem com o nome dela na mensagem
(`… policy "oauth_sem_escrita_ins" for table …`) e o de permissiva/RETURNING vem sem: é o
sinal mais rápido para saber onde olhar.

⚠️ **No caminho de LEITURA, nunca chame `has_company_access(company_id)` direto na
policy.** Ela é `security definer` → o Postgres não faz inlining, e como o argumento
depende da linha, a função roda **uma vez por linha varrida**. Numa tabela de 47k
linhas isso custou 12s onde a mesma agregação sem RLS custava 43ms — e o
`statement_timeout` do papel `authenticated` é de **8s**. Pior: o custo estimado
inflado ultrapassa `jit_above_cost`, e o JIT ainda soma ~2s de compilação.

Padrão para tabela company-scoped (SELECT) — subquery não-correlacionada, que o
planner resolve como InitPlan + hash semi-join, O(1) por linha:

```sql
alter table public.<t> enable row level security;

create policy "<t>_sel" on public.<t>
  for select to authenticated
  using (
    (select public.can_view_module('<modulo>'))
    and (
      (select public.is_super_admin())
      or company_id in (
           select ca.company_id from public.company_access ca
           where ca.user_id = (select auth.uid())
         )
    )
  );
```

Regras que valem para qualquer policy nova:

- todo predicado **sem dependência de linha** vai dentro de `(select …)` — vira
  InitPlan, avaliado uma vez (vale para `is_super_admin()`, `can_view_module()`,
  `current_user_role()`, `is_financial_user()`, `auth.uid()`);
- predicado **com dependência de linha** vira `coluna in (subquery)`, nunca chamada
  de função — a subquery não-correlacionada é hasheada uma vez;
- escopo via tabela pai (ex.: `pagarme_account_id` → dono da conexão) segue a mesma
  forma: `fk in (select … from pai where …)`.

Referência: migration `…_rls_initplan_optimization`, que converteu as 33 policies de
SELECT e mediu 5.743ms → 22ms com equivalência de linhas conferida por usuário.

⚠️ **Toda tabela nova com RLS precisa também do trio restritivo que impede escrita
por token de OAuth** (`oauth_sem_escrita_ins|upd|del`), porque o OAuth Server do
Supabase ainda não tem escopos e o token do cliente de IA carrega todos os
privilégios do usuário. O predicado é `(select auth.jwt() ->> 'client_id') is null`
— claim que só existe em token emitido por OAuth. Ver
`…_mcp_oauth_sem_escrita`; a única exceção é `mcp_query_log`.

- Acesso é por `company_access` (usuário ↔ empresa). Super admin bypassa.
- Tabelas de ingest/segredo: política restrita a `is_super_admin()`; escrita pelas Edge Functions usa **service role** (bypassa RLS).

## Edge Functions (Deno)

Webhooks e orquestração server-side (ex.: esteira NFS-e) vivem em `supabase/functions/` (runtime Deno).

- **Importação restrita:** uma function só importa de dentro de `supabase/functions/` — **não** de `src/` (o runtime não monta `src`). Código puro compartilhado vai em `supabase/functions/_shared/` (Deno-puro, imports com extensão `.ts` explícita).
- **Dependência externa usa o especificador `npm:` direto** (ex.: `from "npm:@supabase/supabase-js@2"`), inclusive em `import type`. O CLI ≥2.x **não** usa um `deno.json` compartilhado em `supabase/functions/` no deploy — bare specifier (`from "@supabase/supabase-js"`) quebra o bundling com `Relative import path ... not prefixed with / or ./ or ../`.
- O código em `_shared/` é validado por **Vitest** (testes rodam de qualquer pasta) e pelo **Deno** (no deploy); **não** pelo `tsc` do app (que cobre só `src/`).
- Segredos só via `Deno.env` (Vault/secrets) — nunca hardcoded. Webhooks **verificam origem** (segredo na URL/header) e são **idempotentes** (dedup por id do evento).
- Testar local: `supabase functions serve <nome> --no-verify-jwt` + POST de fixture.

## Padrões de código

- **Imutabilidade:** crie objetos novos, não mute existentes.
- **KISS / YAGNI / DRY.** Simplicidade sobre esperteza; não abstraia antes da hora.
- Validação em fronteiras com **Zod**; trate erros explicitamente (nada de erro engolido).
- Naming: `camelCase` (vars/fns), `PascalCase` (componentes/tipos), `UPPER_SNAKE_CASE` (constantes), hooks com prefixo `use`.
- Server state via **TanStack Query** (não duplicar em store client). Estado compartilhável (filtros, paginação, aba) na **URL** via nuqs.
- Frontend **só** fala com o Supabase via anon key + RLS. **Nunca** colocar segredo (pagar.me/Focus/service role) no front.

## Testes

- **Vitest.** TDD quando fizer sentido; AAA (Arrange-Act-Assert); nomes descritivos do comportamento.
- Alvo de cobertura: **80%+** em lógica/utilitários/hooks.
- Para a esteira NFS-e: testes de integração com **fixtures** (sem chamar terceiros) são a primeira linha (ver plano, Camada 0).

## Git & PR

- **Conventional commits**: `feat|fix|refactor|docs|test|chore|perf|ci(escopo): descrição`.
- **Sem atribuição/co-author** nas mensagens de commit (preferência do dono do repo).
- Uma branch por mudança coesa; PR com squash merge; `main` protegida (CI "Quality gates" obrigatório).
- Husky + lint-staged rodam prettier/eslint nos arquivos staged no commit. Rode `bun run preflight` antes de abrir PR.

## Segurança

- Segredos em **Supabase Vault** (ou env do servidor), nunca no código/front.
- Validar entrada; queries parametrizadas; RLS em tudo; mensagens de erro sem vazar dado sensível.
- LGPD: guardar só o PII necessário (ex.: snapshot mínimo do tomador na NFS-e).

## ⚠️ Não faça

- **Não fazer deploy** — o Cloudflare Pages é operado pelo dono do repo.
- **Não** aplicar migration direto no remoto sem testar local + PR.
- **Não** editar `src/types/database.ts` à mão (é gerado).
- **Não** colocar dado de seed em migration nem segredo no frontend.
- **Não** mutar dados de migrations já aplicadas.

## Apuração de impostos

`/taxes` tem **duas abas**: `Apuração` (calcular o devido) e `Obrigações` (pagar). As
planilhas de cálculo do contador foram absorvidas em três camadas — parâmetro
(`tax_rules` + `tax_rule_presumptions`), demonstrativo (`tax_assessment_lines`) e
apuração (`tax_assessments`). `tax_obligations` continua sendo o **pagamento**, agora
com `assessment_id`.

⚠️ **A aritmética do tributo tem UMA implementação:**
`supabase/functions/_shared/tax/apuracao.ts`. A tela reexporta de
`src/features/taxes/apuracao.ts`. O SQL faz **calendário e colheita** (vencimento
depende de feriado, base depende de lançamento sob RLS); o TS faz **presunção,
adicional, franquia, retenção e saldo devedor**; o SQL **grava conferindo coerência** e
recalcula o vencimento por conta própria, ignorando o do cliente. Não duplique a regra:
o número que sai daí é o que se paga à Receita.

⚠️ **Linha de demonstrativo tem duas naturezas.** `is_manual = false` vem de lançamento
e é **regenerada** a cada recálculo; `is_manual = true` (retenção sofrida, outras
deduções, saldo anterior) **sobrevive**. Tratar as duas igual apagaria a retenção
digitada e o imposto subiria em silêncio.

⚠️ **Não existe apuração consolidada.** A regra é de UMA empresa (alíquota, presunção,
vencimento mudam entre elas). Somar o IRPJ de quatro empresas sob um rótulo só é o pior
defeito possível aqui.

⚠️ **A base sai dos LANÇAMENTOS** (`transactions` em contas de receita), não dos
documentos fiscais — nos estados `pending|settled|reconciled`. A classe de presunção
mora em `chart_of_accounts.presumption_class`.

⚠️ **A DATA que delimita o período é parâmetro da regra** (`base_date_basis`:
`accrual` ou `cash`), nunca constante. Na OTM Assessoria o `accrual_date` é o mês a que
a comissão SE REFERE e a competência fiscal é a da nota, que cai no `cash_date`: por
competência o IRPJ do 3t2026 dá R$ 681.872,60, por caixa dá R$ 1.543.003,86 — e é o
segundo que bate com a contabilidade. Toda apuração compara com a outra data
(`gross_revenue_alt_basis`) e **avisa se divergir mais de 1%**, porque data-base errada
não parece defeito: o número sai bonito, só do mês trocado.

⚠️ **DAS do Simples não é apurável por este motor** — alíquota efetiva progressiva
sobre o RBT12, contra `base × alíquota fixa` daqui. Fora de `APURAVEIS`; continua
saindo por `generate_tax_obligations` + `calculate_simples_anexo_iii`.

⚠️ **Vencimento é ajustado para dia útil**, com direção por tributo (DARF/ISS
antecipam, DAS posterga) e feriado nacional/estadual/municipal em `tax_holidays`. Cinco
datas são conferidas por `assert` **dentro da migration** — `db:reset` falha se a
aritmética ou o calendário mudarem.

> 📘 **Referência técnica completa:**
> [`docs/features/apuracao-de-impostos.md`](docs/features/apuracao-de-impostos.md) —
> modelo, banco, RLS, calendário, arredondamento, as divergências encontradas nas
> planilhas (com os valores) e o que ficou em aberto para a contabilidade.

## Plano gerencial, áreas & Central de Gastos

Em construção por fases. **Estado, o que falta e mudanças de rota:**
[`docs/features/central-de-gastos.md`](docs/features/central-de-gastos.md) — leia
primeiro. Histórico das decisões:
[`docs/features/central-de-gastos-plan.md`](docs/features/central-de-gastos-plan.md).
Feitas: **Fase 0** (plano gerencial + mapa conta → item, `/settings/management-plan`) e
**Fase 1** (centro de custo vira área; Balanço por filtro sobre o plano gerencial) e
**Fase 2** (fatura de cartão aberta em compras, `/faturas`) e **Fase 3** (regras de
classificação e sugestão por IA).

⚠️ **Centro de custo É ÁREA.** `cost_centers` responde só "para qual time é o gasto"
(Assessores, Apoio, Diretoria, Tecnologia…). "O que o gasto é" (receita, imposto, capex,
distribuição) NÃO volta a ser centro: sai da conta, pelo plano gerencial. A tabela manteve
o nome técnico; na UI é "Área".

⚠️ **O item gerencial sai da CONTA, não do lançamento.** O mapa mora em
`chart_of_accounts_master.management_account_id` (vale para todas as empresas);
`chart_of_accounts.management_account_id` é exceção de uma empresa; conta sem nenhum dos
dois cai no item padrão do tipo (`default_management_account_code`). A regra efetiva tem
UMA implementação: `v_account_management_map`. Conta aponta para ITEM, nunca para grupo,
de tipo compatível (`management_kind_accepts`).

⚠️ **Opex/capex é do item, com exceção no lançamento** (`transactions.nature_override`).
É o que guarda o "isto foi investimento" que antes só existia no centro CAPEX.

⚠️ **O Balanço soma FILTROS** (`kind: "filter"`): item/grupo × área × natureza, sobre
`v_management_lines`. A regra de que linha soma o quê tem uma implementação só —
`clauseMatches`/`lineMatches` em `balance/compute.ts`; o banco só filtra pelas chaves
exatas que o cliente manda (`management_line_transactions`). Não reimplemente o casamento
em SQL de produção.

⚠️ **Uuid de área vive dentro de jsonb** — `balance_report_models.lines[].clauses[].areaIds`.
`merge_cost_centers` remapeia; qualquer outra operação que mova ou apague área precisa
fazer o mesmo, senão a linha soma zero em silêncio.

⚠️ **Fatura de cartão detalhada não é lançamento.** As compras vivem em
`card_statement_lines`, penduradas no lançamento da fatura (`card_statements.transaction_id`).
Só fatura `reconciled` — linhas fecham com o total, os subtotais por cartão e o valor do
lançamento, conferidos pelo BANCO em `save_card_statement` — troca o lançamento pelas
compras em `v_management_lines`. Valor de linha não se edita (trigger); para corrigir,
apaga e reimporta. Leitor e validador têm uma implementação: `_shared/cards/`.

⚠️ **Sugestão de IA não conta.** Compra de cartão com `classification_status = 'suggested'`
aparece na tela mas soma como "Fatura de cartão" em `v_management_lines` até alguém
aceitar. Regra (`classification_rules`) é decisão humana e conta como confirmada. A Edge
Function `card-lines-suggest` lê e grava com o JWT de quem chamou.

## Escopo de empresa & grupos de agregação

O seletor superior tem **três** formas de escopo, não duas: uma empresa, `Consolidado`
(todas as operacionais) e **grupo de agregação** — um recorte nomeado e compartilhado
(ex.: "OTM sem Jimmy"). O contrato único é `companyIds` do `useCompanyScope()`:
`null` = sem recorte (limita a RLS), array = exatamente estas empresas.

⚠️ **Não existe `isConsolidated`.** Use `isMultiCompany` ("é mais de uma empresa?") ou
`scopeKind` (`company` | `consolidated` | `group`). O booleano foi removido de propósito:
com três formas, ele faria cada tela adivinhar de que lado o grupo cai, e o erro
silencioso — 4 empresas somadas sob o rótulo de um recorte de 2 — é o pior defeito
possível num sistema contábil.

⚠️ **Recorte vazio nunca vira "todas as empresas".** Hook novo que aceite `companyIds`
precisa de `enabled: companyIds === null || companyIds.length > 0`. Um grupo ainda
carregando expõe `[]`; tratá-lo como `null` mostraria o total do grupo inteiro sob o
rótulo do recorte.

RPC nova que agregue empresa segue o padrão `p_company_ids uuid[] default null`
(`null` = comportamento anterior), `security invoker`. Quando já existir a versão de uma
empresa, a implementação passa a ser a multi e a de uma empresa vira **wrapper** dela —
o número do grupo e o da empresa não podem divergir.

⚠️ **A central de custos é GLOBAL.** `cost_centers` não tem `company_id`: é uma lista da
organização, usada por qualquer empresa (`…_central_de_custos_global`). Logo
`cost_center_id` já é identidade compartilhada e agregação por centro de custo é o próprio
`group by` — não existe casamento por nome. Duplicata se resolve fundindo, via
`merge_cost_centers`, que é **permanente**: repõe lançamentos, recorrências,
colaboradores, mapeamentos de folha e as linhas do balanço no centro escolhido e apaga os
outros.

⚠️ **Uuid de centro de custo (área) também vive dentro de jsonb.** `balance_report_models.lines`
guarda `clauses[].areaIds` (era `costCenterIds` até a Fase 1); qualquer remap ou fusão que
esqueça esse jsonb deixa linha de balanço apontando para área apagada, somando zero em
silêncio.

> 📘 **Referência técnica completa:**
> [`docs/features/grupos-de-agregacao.md`](docs/features/grupos-de-agregacao.md) —
> modelo, banco, RLS tudo-ou-nada, RPCs, relatórios consolidados, fusão de centros de
> custo, balanço por escopo, comportamento por tela e invariantes.

## Integração NFS-e (pagar.me × Focus)

Emissão de NFS-e municipal (Barueri) a partir das vendas do pagar.me, com **split** e
**multi-conta** (`1 charge.paid → N NFS-e`). Arquitetura Supabase-nativa (Edge Functions +
fila por status na `invoice_jobs` + pg_cron + Vault + Storage); gestão pela UI em `/nfse`.

> 📘 **Referência técnica completa (leia primeiro):**
> [`docs/integrations/nfse-system.md`](docs/integrations/nfse-system.md) — arquitetura,
> banco, RPCs, Edge Functions, automação, segurança, frontend, decisões e como continuar.
> Snapshot curto em [`NFSE_STATUS.md`](NFSE_STATUS.md). APIs: `focusnfe.md`, `pagarme.md`.

**Estado:** sistema de notas funcional ponta a ponta (ingest → emite via cron → retorno
por webhook **ou** reconcile → XML/DANFSe no Storage), gerido pela UI. Remoto sincronizado.
Pendências (não bloqueiam): UI de revisão de endereço, go-live de produção.

⚠️ **Venda estornada não vira nota.** A esteira é de mão dupla desde
`…_nfse_guardrail_estorno`: estorno marca `invoice_jobs.refund_state` e tira da fila o que
ainda não foi emitido (total → `voided`; parcial/chargeback → retido para decisão humana,
com motivo escrito). A guarda está em TRÊS camadas — trigger no banco, RPC
`approve_invoice_jobs` e `claim_nfse_jobs` — porque emitir NFS-e é irreversível e desfazer
custa cancelamento na prefeitura.

⚠️ **O sinal de estorno é o par (evento, status da cobrança), NUNCA o valor.**
`charge.refunded` → `canceled` = total; `charge.partial_canceled` → segue `paid` = parcial;
`charge.chargedback` = chargeback. `pagarme_charges.refunded_amount` é agregado de payables
e chega atrasado ou nunca (R$ 34 mil de diferença em produção) — usá-lo como gate deixaria
passar nota de venda estornada. Regra única em `_shared/pagarme/refunds.ts`, com teste.

⚠️ **`voided` ≠ `cancelled`.** `voided` é a nota descartada antes de existir; `cancelled` é
nota autorizada e cancelada na prefeitura — ato definitivo, com justificativa de 15–255
caracteres e reflexo na apuração do ISS. Confundir os dois falseia obrigação acessória.

⚠️ **Chargeback não é estorno.** O serviço foi prestado e o cliente contestou: é perda, não
desfazimento da venda, e a nota pode continuar devida. Por isso ele retém a nota em vez de
descartá-la — a decisão é da contabilidade, não da automação.

## MCP de Insights — conversar com o financeiro por IA

Servidor **MCP somente-leitura** que expõe o financeiro a qualquer IA (claude.ai,
ChatGPT, Claude Code) em linguagem natural, autenticado pelo login de cada pessoa via
o OAuth 2.1 Server do Supabase. Núcleo em `supabase/functions/_shared/mcp/`,
transportes em `scripts/mcp-stdio.ts` (local) e `workers/mcp/` (Cloudflare Worker).

**22 tools**, do contexto (`list_companies`, `list_dimensions`) ao panorama composto
(`monthly_briefing`), passando por resultado, caixa e bancos, títulos, análise por
dimensão, vendas, fiscal, notas e folha — com `sql_query` como última saída. O catálogo
e a ORDEM dele são fixados por teste em `registry.test.ts`: tool nova é decisão
revisada, não import solto.

⚠️ **O `tsc` do app cobre só `src/`.** O código de `supabase/functions/_shared/` é
checado por `tsconfig.functions.json`, que entra no `bun run typecheck` — sem ele, erro
de tipo nas Edge Functions só apareceria no deploy (o Vitest transpila com esbuild e
apaga os tipos sem conferir).

> 📘 **Referência técnica completa (leia primeiro):**
> [`docs/integrations/mcp-insights-system.md`](docs/integrations/mcp-insights-system.md) —
> arquitetura, banco, núcleo, transportes, segurança, decisões e como operar.
> O plano (com a cronologia das decisões) está em
> [`mcp-insights-plan.md`](docs/integrations/mcp-insights-plan.md); a configuração das
> plataformas, em [`mcp-go-live.md`](docs/integrations/mcp-go-live.md).

**Invariantes que não podem ser violadas:**

- **Nenhuma tool de escrita, nunca** — nem "só para marcar como conciliado".
- **O servidor nunca usa service role no caminho de dados.** Toda leitura é com o JWT
  do usuário e passa pela RLS.
- **Token de OAuth não escreve** — policies restritivas com
  `(select auth.jwt() ->> 'client_id') is null`. Tabela nova precisa do trio.
- **Número contábil vem de RPC revisada**, não de SQL gerado por modelo. O `sql_query`
  é exploração, dentro do schema `mcp_api`.
- **Regra de negócio tem uma implementação só.** `dre-totais.ts` vive em `_shared/` e a
  tela reexporta de lá — a IA e o dashboard não podem discordar sobre o lucro.

## Integração pagar.me — vendas e recebíveis no financeiro

A **mesma conexão pagar.me** alimenta dois consumidores: a emissão de nota (acima) e o
dashboard de vendas + a automação da receita nos lançamentos. Substitui o processo em que
um mês inteiro de vendas entrava como um lançamento único no dia da TED (pico de caixa,
receita líquida disfarçada de bruta, R$ 2,5M de recebíveis invisíveis).

> 📘 **Referência técnica completa (leia primeiro):**
> [`docs/integrations/pagarme-system.md`](docs/integrations/pagarme-system.md) — arquitetura,
> banco, a projeção, Edge Functions, decisões D1–D5, estado do remoto e como continuar.
> Plano e checklist de go-live: [`pagarme-sales-plan.md`](docs/integrations/pagarme-sales-plan.md).
> Contrato real da API: [`pagarme-api-contract.md`](docs/integrations/pagarme-api-contract.md).

**Invariantes que não podem ser violadas:**

- **Só `charge.paid` emite nota fiscal** (`explodeFiscal`) — tem teste dedicado.
- **Ingerir venda nunca escreve em `transactions`.** A única ponte é
  `pagarme_project_ledger`, explícita e desligável (`pagarme_ledger_settings.enabled`).
- **Sandbox não entra no ledger financeiro** (gate em `loadLedgerContext`).
- A projeção **nunca** toca lançamento humano (`pagarme_projection_key is null`) nem
  conciliado.

**Onde fica o quê na UI:** configuração em `/integracoes`, dado da empresa em
`/companies`, operação em `/nfse`, análise em `/vendas`.

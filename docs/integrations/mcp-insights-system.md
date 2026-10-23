# MCP de Insights — Referência Técnica

> **Propósito deste documento:** dar a uma pessoa (ou IA) que assuma o projeto o
> contexto completo do servidor MCP somente-leitura que expõe o financeiro do grupo a
> qualquer IA em linguagem natural. É a fonte de verdade técnica.
>
> Documentos irmãos:
>
> - [`mcp-insights-plan.md`](mcp-insights-plan.md) — o plano, com as decisões em ordem
>   cronológica e o registro das validações feitas durante a construção.
> - [`mcp-go-live.md`](mcp-go-live.md) — o que configurar no Supabase e no Cloudflare.
> - [`pagarme-system.md`](pagarme-system.md) e [`nfse-system.md`](nfse-system.md) — os
>   dois maiores produtores do dado que o MCP lê.
>
> **Última atualização:** 31/08/2026. **Estado:** no ar, em uso, com 23 tools (`management_breakdown` entrou com a Central de Gastos, 23/10/2026).

---

## 1. O que o sistema faz

Expõe o financeiro do grupo OTM a clientes de IA (claude.ai, ChatGPT, Claude Code) em
linguagem natural, **somente leitura**, autenticado pelo login de cada pessoa.

Não substitui o dashboard. O dashboard responde as perguntas que alguém previu ao
desenhar a tela; o MCP responde a cauda longa — "por que o caixa da Assessoria caiu 18%
em julho?", "quais centros de custo cresceram acima da receita?", "quanto do MRR depende
dos cinco maiores clientes?". Cada uma dessas custava abrir três telas e cruzar no
Excel, ou uma migration nova se virasse recorrente.

### O problema que o desenho resolve

O caminho óbvio — plugar o MCP oficial do Supabase — falha por três motivos, e cada um
deles moldou uma parte deste sistema:

1. **Ele autentica como admin e bypassa a RLS.** Todo o modelo de permissão de três
   eixos (empresa × papel × módulo) deixaria de existir no instante em que a IA entrasse.
2. **Ele produz número plausível e errado.** Um LLM escrevendo SQL contra `transactions`
   soma `amount` sem sinal, ignora `status`, confunde `accrual_date` com `cash_date` e
   conta transferência entre contas como receita.
3. **Ele tem ferramentas de escrita.** Num sistema contábil isso não deveria estar a um
   prompt de distância.

O ativo deste sistema não é acesso ao banco. É **a garantia de que o número que a IA
cita é o mesmo número da tela**.

---

## 2. Glossário

| Termo            | Significado                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **tool**         | uma pergunta de negócio exposta ao modelo (`get_dre`, `get_cashflow`…). Não é uma tabela.                         |
| **proveniência** | metadados que viajam em toda resposta: empresa, período, regime, status incluídos, e como o número foi calculado. |
| **jaula**        | o schema `mcp_api` mais a função `run_query`: onde o SQL exploratório pode andar.                                 |
| **conector**     | um cliente OAuth registrado no nosso authorization server (o claude.ai é um).                                     |
| **client_id**    | claim presente só em token emitido por OAuth. Distingue "a pessoa, no app" de "uma IA agindo em nome dela".       |
| **blindagem**    | as policies restritivas que impedem token de OAuth de escrever.                                                   |
| **regime**       | competência (datado por `accrual_date`, inclui pendente) ou caixa (`cash_date`, só liquidado).                    |

---

## 3. Arquitetura ponta a ponta

```
  claude.ai · ChatGPT · Claude Code · agentes próprios
        │
        │  MCP sobre Streamable HTTP + OAuth 2.1 (PKCE, DCR)
        ▼
  ┌──────────────────────────────────────────────────────┐
  │  Worker `finance-mcp`  ·  mcp.jimmycarvalho.com.br    │
  │                                                       │
  │  /.well-known/oauth-protected-resource  (público)     │
  │  401 + WWW-Authenticate quando falta token            │
  │  valida o JWT por JWKS (ES256, chave pública)         │
  │                                                       │
  │  ── casca fina: nenhuma semântica vive aqui ──        │
  └──────────────────────────────────────────────────────┘
        │
        │  supabase/functions/_shared/mcp/  (núcleo, agnóstico de transporte)
        │  23 tools · adapter · proveniência · jaula de SQL
        ▼
     PostgREST com o **JWT do usuário** (anon key). Nunca service role.
        │
        ▼
     Postgres 17 + RLS (company_access × papel × visible_modules)
```

O authorization server é o **próprio Supabase Auth** (OAuth 2.1 Server nativo, em beta
público). Nós não escrevemos servidor OAuth: só a tela de consentimento, que é uma rota
do SPA.

Fluxo de uma pergunta, do zero:

1. Cliente MCP faz `POST` sem token → **401** com
   `WWW-Authenticate: Bearer resource_metadata="…"`.
2. Lê `/.well-known/oauth-protected-resource` → descobre o authorization server.
3. Registra-se sozinho (DCR) no Supabase.
4. Manda a pessoa para `/auth/v1/oauth/authorize`, que redireciona para
   `https://finance.jimmycarvalho.com.br/oauth/consent?authorization_id=…`.
5. A pessoa aprova na nossa tela; o Supabase emite o token (com `client_id`).
6. `initialize` → `tools/list` → `tools/call`, todos com o token; cada chamada vira uma
   linha em `mcp_query_log`.

---

## 4. Banco de dados

Cinco migrations, todas em `supabase/migrations/`:

| Migration                         | O que faz                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `…_mcp_api_schema_e_sandbox_sql`  | schema `mcp_api`, views, `mask_cpf`, `run_query`, `mcp_run_query`, `mcp_query_log` |
| `…_mcp_oauth_sem_escrita`         | as policies restritivas que impedem escrita por token de OAuth                     |
| `…_mcp_clients`                   | tabela de conectores + `client_id` no log                                          |
| `…_mcp_clients_lista_de_bloqueio` | inverte o significado da tabela (só comentários)                                   |
| `…_v_bills_security_invoker`      | corrige a RLS de `v_bills` e `v_bills_aging` (§5.2)                                |

### 4.1 Schema `mcp_api`

Só views `security_invoker = true` — a RLS do usuário continua valendo — mais duas
funções. As views **carregam a semântica em coluna**, que é o que tira do modelo a
chance de reinventar a regra contábil:

| View               | Colunas que importam                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empresas`         | `company_id`, `organization_id`, `nome`, `cnpj`, `regime_tributario`                                                                                      |
| `contas`           | `codigo`, `conta`, `tipo`, `secao_dre`, `totalizadora`, `abaixo_da_linha`                                                                                 |
| `centros_de_custo` | `cost_center_id`, `nome`, `ativo`                                                                                                                         |
| `contrapartes`     | `nome`, `tipo`, `documento` (CPF mascarado, CNPJ preservado)                                                                                              |
| `transacoes`       | `valor` **já com sinal**, `entra_em_competencia`, `entra_em_caixa`, `e_transferencia`, `e_projecao_pagarme`, além de conta/centro/contraparte já juntados |

`mcp_api.mask_cpf(text)` — CPF vira `***.456.789-**`; CNPJ passa formatado. É a mesma
regra do `format.ts` do núcleo, reescrita em SQL porque o SQL livre não passa por lá.

`mcp_api.run_query(p_sql text, p_limit int)` — o SELECT livre. **Quatro paredes**, e
nenhuma delas é "o servidor promete que só lê":

1. **Schema separado.** `search_path = mcp_api, pg_temp`. `select * from transactions`
   não resolve; `select * from transacoes` sim.
2. **`security_invoker`** nas views: a RLS do usuário decide as linhas.
3. **Função `STABLE`.** O executor do Postgres recusa qualquer statement que modifique
   dados dentro de função não-volátil, inclusive por `EXECUTE` dinâmico.
4. **Validação de texto:** uma instrução, sem `;`, sem comentário, começando por
   `SELECT`/`WITH`, sem outro schema, sem `pg_*`, com `LIMIT` imposto por fora (teto 1000) e `statement_timeout` de 5s.

`public.mcp_run_query(...)` é a porta: o PostgREST não expõe `mcp_api`, e não vamos
abrir — as views existem para o SQL de dentro da jaula, não para consulta direta.

### 4.2 Tabelas

**`mcp_query_log`** — trilha de uso. `user_id`, `client_id`, `tool`, `params jsonb`,
`row_count`, `duration_ms`, `error`, `created_at`. Guarda **parâmetro, nunca conteúdo de
linha**: responde "o que a IA olhou?" sem criar uma segunda cópia do financeiro. RLS:
cada um lê o próprio rastro, super admin lê tudo, ninguém edita.

**`mcp_clients`** — **lista de BLOQUEIO** de conectores. O servidor consulta a cada
requisição e barra com 403 apenas o `client_id` cadastrado com `ativo = false`. Conector
ausente da tabela **passa** (§9, D6). As colunas `company_ids` e `modules` existem mas
ainda não são impostas.

### 4.3 A blindagem de escrita

O OAuth Server do Supabase ainda não tem escopos: o token emitido ao claude.ai é um JWT
de sessão com **todos os privilégios do usuário, escrita inclusive**. Um token vazado
escreveria via PostgREST sem passar pelo nosso servidor.

A trava usa a claim `client_id`, que um login normal do app não carrega:

```sql
-- policy RESTRICTIVE, uma por comando, em toda tabela com RLS
using ((select auth.jwt() ->> 'client_id') is null)
```

Restritiva, e não edição das ~92 policies de escrita existentes: é aditiva, não arrisca
quebrar leitura, e vale também para super admin — o token de IA dele também não escreve.
Em produção são **123 policies** (3 comandos × 41 tabelas; `mcp_query_log` é a exceção
deliberada, porque log que o agente não escreve não é log).

**A recusa não é simétrica:** `INSERT` falha alto (42501, citando a policy pelo nome);
`UPDATE` e `DELETE` simplesmente não alcançam linha nenhuma e retornam vazio — semântica
normal de RLS, em que o `USING` esconde a linha em vez de recusar a operação.

⚠️ **Tabela nova com RLS precisa do mesmo trio.** Está na convenção do CLAUDE.md.

### 4.4 Grants

`security_invoker` exige privilégio do invocador nas tabelas-base. A migration concede
`select` a `authenticated` em `transactions`, `chart_of_accounts`, `companies`,
`cost_centers`, `counterparties` e `company_access` — esta última porque a subquery da
policy de `transactions` a lê como invocador. No remoto são no-op (o privilégio já vem
do default legado); num banco reconstruído das migrations, são o que faz as views
funcionarem. Ver §12.

---

## 5. O núcleo (`supabase/functions/_shared/mcp/`)

Deno-puro, testado por Vitest, **agnóstico de transporte**: o mesmo código roda no
stdio local e no Worker. Duas ideias sustentam o desenho.

**O núcleo não conhece o Supabase.** As tools falam com `McpDataSource`, uma interface
mínima. O adapter que a implementa é o único ponto que importa o client.

**A consulta é declarativa, não encadeada.** `TableQuery` só expressa colunas, filtros,
ordem e um teto de linhas. Uma tool não tem como montar consulta fora desse contrato — a
forma do tipo _é_ parte da contenção. O adapter recusa `*` na lista de colunas (coluna
nova não vaza por acidente) e limite acima de 2000.

### As tools

**23 tools.** A ordem da tabela é a ordem do catálogo em `registry.ts`, e ela é
funcional: a maioria dos clientes MCP apresenta o catálogo ao modelo nessa sequência, que
funciona como roteiro — descoberta primeiro (sem `company_id` nada mais roda), depois
resultado, caixa, títulos, análise, domínio, e o SQL livre por último, porque é a saída de
emergência e não o primeiro recurso. `registry.test.ts` fixa a lista **e** a ordem.

| Tool                       | Responde                                                                    | Fonte                                                                |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `list_companies`           | quais empresas você enxerga, com os ids                                     | tabela `companies`                                                   |
| `list_dimensions`          | plano de contas, centros de custo, contrapartes, bancos, contas pgm         | tabelas de cadastro + `pagarme_gateway_accounts`                     |
| `monthly_briefing`         | panorama de um mês inteiro numa chamada                                     | composta (DRE + caixa + saldo + aging)                               |
| `get_dre`                  | DRE por empresa ou consolidada, nos dois regimes                            | RPCs `dre_by_company` / `dre_consolidated`                           |
| `compare_periods`          | dois períodos lado a lado, com variação por linha                           | `dre_by_company`, duas chamadas                                      |
| `get_kpis`                 | margens, resultado e geração de caixa mês a mês, num ano                    | `kpi_dashboard` / `kpi_dashboard_consolidated`                       |
| `expense_breakdown`        | maiores contas de despesa, com "Outros"                                     | RPC `expense_breakdown`                                              |
| `management_breakdown`     | gasto pelo plano gerencial — grupo, item, área ou fornecedor, com cobertura | RPC `management_breakdown_multi` + `_shared/management/breakdown.ts` |
| `get_cashflow`             | entradas, saídas e líquido realizados, por dia ou mês                       | RPC `cashflow_daily`                                                 |
| `get_bank_balances`        | saldo por conta bancária numa data                                          | RPC `bank_balances_multi`                                            |
| `get_account_ledger`       | extrato de uma conta com saldo corrente                                     | `bank_account_period` + `bank_account_ledger`                        |
| `forecast_cashflow`        | previsão de entradas, saídas e saldo futuro                                 | `forecast_cashflow_daily` + `forecast_pagarme_inflow`                |
| `get_aging`                | títulos em aberto por faixa de vencimento                                   | view `v_bills_aging`                                                 |
| `list_open_bills`          | a lista dos títulos em aberto, com filtros                                  | view `v_bills`                                                       |
| `cost_center_analysis`     | receita, despesa e margem por centro de custo                               | `cost_center_analysis` + `cost_center_monthly_series`                |
| `counterparty_analysis`    | maiores clientes/fornecedores e concentração                                | RPC `counterparty_analysis`                                          |
| `get_sales`                | vendas do pagar.me em 5 visões (resumo/série/quebra/clientes/recorr.)       | RPCs `sales_*`                                                       |
| `get_receivables_schedule` | curva de recebíveis por mês de liquidação                                   | RPC `receivables_schedule`                                           |
| `list_tax_obligations`     | impostos e obrigações, com situação                                         | tabela `tax_obligations`                                             |
| `nfse_status`              | estado da esteira de NFS-e e as falhas                                      | tabela `invoice_jobs`                                                |
| `payroll_summary`          | custo da folha por mês de referência (agregado)                             | tabela `payroll_runs`                                                |
| `search_transactions`      | lançamentos, agregados por conta ou detalhados                              | tabela `transactions`                                                |
| `sql_query`                | SELECT livre nas views de `mcp_api`                                         | `mcp_run_query`                                                      |

Três regras valem para todas:

1. **Toda resposta carrega proveniência** — empresa, período, regime, `status_incluidos`,
   moeda e uma frase de como foi calculado. É o que permite auditar a conclusão da IA sem
   abrir o dashboard.
2. **Nenhum parâmetro implícito.** Sem empresa e sem período a tool não responde:
   pergunta, com uma mensagem escrita para o modelo se corrigir sozinho.
3. **Agregado por padrão.** Devolver 500 linhas para o modelo somar é caro e convida ao
   erro de aritmética.

**Nenhuma tool nova exigiu migration.** As ~20 RPCs que elas embrulham já eram
`security invoker` e já tinham `grant execute` para `authenticated` — resultado da
migration `permissions_rpcs_security_invoker`. A única mudança de banco do lote foi
corrigir a RLS de `v_bills`/`v_bills_aging` (§5.2), que duas tools leem.

#### 5.1 As divergências entre fontes, e por que elas viajam na proveniência

O risco de um catálogo grande não é a tool errada — é **duas tools certas que discordam**,
e a IA escolhendo uma sem avisar. As fontes do dashboard não concordam entre si, e cada
desacordo está escrito no `avisos` da resposta:

| Divergência                                                                                      | Onde aparece                              |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Saldo bancário conta só `settled`; fluxo de caixa conta `settled` + `reconciled`**             | `get_bank_balances`, `get_account_ledger` |
| **KPIs não incluem `pending`; a DRE em competência inclui**                                      | `get_kpis`                                |
| **`expense_breakdown` exclui a holding sempre**, mesmo quando ela é a empresa pedida             | `expense_breakdown`                       |
| **`cost_center_analysis` inclui `pending`; `counterparty_analysis` não**                         | as duas                                   |
| **As duas análises INCLUEM transferência entre contas**; `search_transactions` exclui por padrão | as duas                                   |
| **`forecast_pagarme_inflow` é SUBCONJUNTO das entradas esperadas**, não parcela adicional        | `forecast_cashflow`                       |
| **A abertura da previsão ignora `initial_balance_date`**, que o saldo bancário respeita          | `forecast_cashflow`                       |
| **Folha não `posted` não está na DRE**                                                           | `payroll_summary`                         |
| **"Cliente novo" é relativo ao início do ledger do pagar.me**, não à história real               | `get_sales` visão clientes                |
| **Nota de homologação não tem valor fiscal**                                                     | `nfse_status`                             |

A divergência `settled`/`reconciled` é hoje **latente**: o remoto não tem nenhuma linha
`reconciled` nem `pending` (conferido em 31/08/2026). Ela está documentada porque no dia
em que a conciliação passar a ser usada, saldo e fluxo vão discordar exatamente pelo
volume conciliado — e ninguém vai lembrar por quê.

#### 5.2 O bug de RLS que o lote destapou

`get_aging` e `list_open_bills` leem `v_bills` e `v_bills_aging`. Ao conferir as fontes,
descobriu-se que as duas views foram criadas **sem `security_invoker`** em
`20260514194441_ap_ar_views_and_rpcs` — `v_transactions` havia sido corrigida em
`15_fix_security_advisors`, e as de títulos vieram depois e ficaram de fora.

Como o dono é `postgres`, dono também de `transactions`, e a tabela não tem
`force row level security`, a view rodava a consulta de base com os privilégios do dono e
**a RLS não se aplicava**. Medido no remoto, impersonando um `viewer` com acesso a 1 de 4
empresas:

| Fonte           | Empresas | Linhas |
| --------------- | -------- | ------ |
| `transactions`  | 1        | 800    |
| `v_bills`       | **4**    | 2821   |
| `v_bills_aging` | **4**    | 18     |

Não era um problema do MCP: `fetchBills` e `fetchAging` (`src/features/bills/api.ts`) só
filtram `company_id` quando há empresa selecionada, então a tela `/bills` com o switcher
em "todas as empresas" exibia título, contraparte e valor de empresa alheia. Bastavam
login no app e a anon key. Ficou assim ~15 meses.

Corrigido em `…_v_bills_security_invoker` (duas linhas de `alter view`). Verificação com
controle, no banco local reconstruído das migrations: com a correção, um uid sem
`company_access` vê **0** títulos; desligando `security_invoker` na mesma transação, vê
**487**. Custo medido no remoto: 3,4ms para a agregação com RLS, contra o
`statement_timeout` de 8s do papel `authenticated`. A regra foi para o CLAUDE.md, na
convenção de RLS.

### `dre-totais.ts` — uma implementação só

As linhas totalizadoras da DRE ("(=) Venda Líquida", "(=) Resultado") **não têm valor no
banco**: a RPC devolve zero nelas, e quem monta o número é a regra de hierarquia e saldo
corrente. A primeira versão da tool devolvia "lucro líquido: R$ 0,00" com toda a
convicção.

A regra vive em `_shared/mcp/dre-totais.ts` e **a tela reexporta de lá**
(`src/features/dre/compute.ts`). A direção do compartilhamento é essa porque o runtime
do Deno não importa de `src/`. Duas cópias significaria a IA e o dashboard discordando
sobre o lucro — que é exatamente o que este projeto existe para impedir.

---

## 6. Transportes

### `scripts/mcp-stdio.ts` — local

Aparece como servidor MCP em qualquer cliente que fale stdio (Claude Code, Desktop,
Cursor). Autentica com e-mail e senha do próprio usuário, via variáveis de ambiente
definidas no cliente MCP. Login **preguiçoso**: `tools/list` funciona sem tocar na rede,
e falha de credencial volta como erro de tool, não como processo morto. Todo log vai
para stderr, porque stdout é o canal JSON-RPC.

### `workers/mcp/` — remoto (Cloudflare Worker `finance-mcp`)

Casca fina sobre `_shared/mcp/http.ts`, que é uma função `Request → Response`. O Worker
resolve só o que é do ambiente: verificar o token por JWKS e criar um client que age como
o usuário.

**O Worker não tem segredo nenhum.** URL e anon key são públicas, a verificação usa chave
pública. Não existe service role neste caminho. Se o Worker vazar inteiro, não vaza
credencial.

Duas decisões que evitam classes inteiras de bug:

- **`MCP_RESOURCE_URL` é opcional.** Sem ela, o Worker usa a origem da própria
  requisição — literalmente o endereço pelo qual o cliente chegou. Uma URL configurada
  que não bate com o host real faz a descoberta anunciar um recurso diferente do
  acessado, e a autenticação falha com mensagem que não ajuda ninguém.
- **`client_id` é exigido.** Um token de sessão comum do app é recusado, ainda que
  válido: este endpoint está na internet e só deve aceitar token nascido do fluxo de
  consentimento.

Por que Worker e não Edge Function: o cliente MCP lê
`/.well-known/oauth-protected-resource` na **raiz** do host, que numa Edge Function não
é nossa.

---

## 7. Frontend — a tela de consentimento

Rota `/oauth/consent` (`src/routes/oauth.consent.tsx`), fora do AppShell mas protegida
por login.

O `scope` que o Supabase entrega é `openid email profile` — não diz nada sobre dado
financeiro. Exibir aquilo cru seria consentimento de fachada. A tela mostra o escopo
**real**, montado a partir de `company_access` e `visible_modules`, resumido em uma frase
antes da lista:

> Este aplicativo poderá LER, em seu nome, os dados de 2 empresas, nos módulos Financeiro
> e Impostos. Não poderá criar, alterar nem apagar nada.

A montagem dessa frase é função pura testada (`src/features/mcp/consent.ts`), não markup.

---

## 8. Segurança: onde cada garantia é imposta

Nenhuma delas depende de disciplina no código do servidor.

| Garantia                      | Imposta em                                                      |
| ----------------------------- | --------------------------------------------------------------- |
| A IA não escreve              | 123 policies `RESTRICTIVE` com `client_id is null`              |
| A IA não vê mais que a pessoa | RLS existente, com o JWT do usuário — nunca service role        |
| O SQL livre não escapa        | schema `mcp_api` + `search_path` sem `public` + função `STABLE` |
| Nenhum segredo no servidor    | o Worker só usa chave pública                                   |
| Semântica contábil            | tools sobre RPCs revisadas; views com a regra em coluna         |
| Rastreabilidade               | `mcp_query_log`, com usuário, conector, parâmetros e latência   |
| Revogar um conector           | `mcp_clients.ativo = false`, efeito imediato                    |

**Invariantes que não podem ser violadas** (também no CLAUDE.md):

1. Nenhuma tool de escrita, nunca — nem "só para marcar como conciliado".
2. O servidor nunca usa service role no caminho de dados.
3. Token de OAuth não escreve.
4. Número contábil vem de RPC revisada, não de SQL gerado por modelo.
5. Regra de negócio tem uma implementação só.

**LGPD.** CPF mascarado em toda saída; CNPJ preservado (dado público de pessoa jurídica,
e é ele que identifica o fornecedor numa análise). Folha entra pelo módulo `payroll`, que
a RLS já governa. O log guarda parâmetros, não linhas.

---

## 9. Decisões (e por quê)

| #      | Decisão                                             | Por quê                                                                        |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| **D1** | Connector remoto para sócios e contador             | era o objetivo; define OAuth por usuário em vez de token de serviço            |
| **D2** | Híbrido: tools semânticas + SQL só-leitura          | número contábil vem de RPC revisada; exploração livre acontece numa jaula      |
| **D3** | Escopo total, incluindo folha e fiscal              | decisão do dono; LGPD vira requisito, não nota de rodapé                       |
| **D4** | Authorization server nativo do Supabase             | descoberto num spike: elimina escrever um AS, que é a classe de bug mais cara  |
| **D5** | Host = Cloudflare Worker                            | a descoberta RFC 9728 exige a raiz do host, que numa Edge Function não é nossa |
| **D6** | `mcp_clients` é lista de bloqueio, não de permissão | ver abaixo                                                                     |

### D6 em detalhe — a inversão que o go-live obrigou

`mcp_clients` nasceu como lista de **permitidos**: só o `client_id` cadastrado podia usar
o servidor. Não sobrevive ao registro dinâmico, que é obrigatório para o claude.ai se
conectar: quatro tentativas de conexão, em cinco minutos, geraram quatro `client_id`
distintos. Autorizar um id é autorizar algo que morre na tentativa seguinte — a lista
nunca fica satisfeita e o conector nunca conecta.

A proteção também era menor do que parecia. Registrar um cliente, sozinho, não dá acesso
a nada: para obter um token ainda são necessárias as credenciais da pessoa e o
consentimento explícito dela.

O que valia preservar era **revogar** na hora, e uma lista de bloqueio faz isso igual sem
brigar com o protocolo. Quem está em uso de fato aparece em `mcp_query_log.client_id`.

**Falha ao consultar a lista deixa passar.** Fechar a porta por indisponibilidade de uma
checagem secundária seria trocar uma proteção pequena por uma indisponibilidade grande.

---

## 10. Como rodar e operar

### Local

```sh
bun run db:reset          # aplica as 4 migrations do zero
bun run mcp:stdio         # servidor local, para Claude Code/Desktop
bun run mcp:worker:dev    # o Worker, contra o Supabase local (.dev.vars)
```

Para o fluxo OAuth local, `[auth.oauth_server]` já está habilitado no `config.toml`, com
`authorization_url_path = "/oauth/consent"`.

⚠️ O documento de metadados do AS, na forma com caminho inserido da RFC 8414, dá **404 no
Kong local** e **200 no hospedado**. É limitação do stack de desenvolvimento, não do
projeto.

### Remoto

Deploy e configuração de plataforma: [`mcp-go-live.md`](mcp-go-live.md).

Operação do dia a dia:

```sql
-- o que andaram perguntando
select tool, count(*), round(avg(duration_ms)) as ms, max(created_at)
from public.mcp_query_log group by tool order by 2 desc;

-- quais conectores estão em uso de fato
select client_id, count(*), max(created_at)
from public.mcp_query_log group by client_id order by 3 desc;

-- revogar um conector
insert into public.mcp_clients (client_id, nome, ativo)
values ('<id>', 'Claude', false);
```

Erros de tool no log são o sinal mais útil do sistema: mostram o que o modelo tentou e a
tool recusou. O primeiro que apareceu em produção foi uma janela de 2434 dias contra o
teto de 1096 — o modelo leu a mensagem e refez a consulta em partes, quatro segundos
depois.

---

## 11. Estado do remoto (`vbeevkjenvgvnattzszt`)

Verificado em 31/08/2026:

- schema `mcp_api`, `mcp_clients` e `mcp_query_log` aplicados;
- **123** policies de blindagem (3 × 41 tabelas);
- OAuth 2.1 Server ligado, com `registration_endpoint` (registro dinâmico ativo);
- descoberta RFC 8414 respondendo nas duas formas;
- `mcp.jimmycarvalho.com.br` servindo o MCP; `finance.jimmycarvalho.com.br` servindo o
  dashboard, ambos por Worker com domínio próprio;
- conector do claude.ai conectado e em uso, latência de 209–443ms por chamada;
- as ~20 RPCs que o catálogo novo embrulha conferidas uma a uma: todas `security invoker`,
  `stable` e com `execute` para `authenticated`;
- **a migration `…_v_bills_security_invoker` ainda NÃO foi aplicada no remoto** — assim
  como `…_mcp_clients_lista_de_bloqueio`, que ficou pendente do PR anterior. Enquanto o
  push não acontecer, as duas views seguem furando a RLS em produção (§5.2).

---

## 12. Pendências conhecidas (não bloqueiam o funcionamento)

- **Escopo por conector** — `mcp_clients.company_ids` e `.modules` existem mas não são
  impostos: um conector enxerga o que o usuário enxerga. Impor exige policy restritiva de
  SELECT em toda tabela company-scoped, com o cuidado de InitPlan da convenção.
- **Cobertura do escopo total (D3) no SQL exploratório** — as views de `mcp_api` cobrem o
  núcleo financeiro; vendas, fiscal, folha, bancos e títulos agora têm **tool dedicada**,
  mas continuam fora das views, então o `sql_query` não os alcança. Só importa para
  cruzamento incomum que nenhuma tool cubra.
- **Catálogo** — entregue (§5). Fora dele, de propósito: `monthly_briefing` só aceita uma
  empresa (as RPCs de caixa e previsão são por empresa, e um consolidado exigiria N
  chamadas de cada com agregação de saldo e aging no servidor — mais superfície para
  divergir da tela do que valor); e `resources`/`prompts` do MCP (glossário, prompts
  prontos) seguem no plano.
- **Agregação em memória** — o modo agregado do `search_transactions` soma no servidor,
  sobre no máximo 2000 linhas, com aviso quando trunca. Deveria ser agregação no banco.
  Mesmo caso em `nfse_status` (agrega até 2000 jobs) e em `get_receivables_schedule`
  consolidado (uma chamada de RPC por empresa, somadas no servidor).
- **Retenção do log** — `mcp_query_log` cresce sem política de expurgo.
- **Drift de privilégios** — um banco reconstruído só das migrations sobe com
  `authenticated` sem `select` na maioria das tabelas; o remoto tem os privilégios por
  herança de quando o projeto foi criado, e nenhuma migration os reproduz. Esta feature
  concede o mínimo do próprio recorte; o resto continua aberto.
- **Beta** — o OAuth 2.1 Server do Supabase está em beta público, sem ETA de GA e sem
  escopos granulares. A blindagem por `client_id` existe justamente porque escopos não
  existem.

---

## 13. Mapa de arquivos

```
supabase/functions/_shared/mcp/     núcleo agnóstico de transporte
├── types.ts          McpDataSource, TableQuery, proveniência
├── params.ts         validação sem default silencioso
├── provenance.ts     status por regime + explicação
├── format.ts         BRL determinístico, mascaramento
├── escopo.ts         company_id | organization_id -> lista de empresas (RLS-filtrada)
├── dre-totais.ts     regra dos totalizadores (a tela reexporta daqui)
├── dre-fonte.ts      carregar DRE + aplicar totalizadores (3 tools compartilham)
├── clientes.ts       decisão sobre o conector (lista de bloqueio)
├── datasource.ts     adapter do Supabase — último portão antes do banco
├── http.ts           servidor MCP sobre HTTP, Request → Response
├── registry.ts       catálogo e ORDEM dele; o transporte só conhece este arquivo
├── fixtures.ts       fake de McpDataSource para os testes
└── tools/            companies · dimensions · briefing · dre · comparison · kpis ·
                      expenses · cashflow · banks · forecast · bills · analysis ·
                      sales · taxes · nfse · payroll · transactions · sql

tsconfig.functions.json             checagem de tipos de _shared/ (entra no typecheck)

scripts/mcp-stdio.ts                transporte stdio (local)
workers/mcp/                        Worker `finance-mcp` (remoto)
├── src/index.ts                    entrypoint: JWKS + client do usuário
├── src/auth.ts                     verificação de token
└── wrangler.jsonc                  config — NUNCA na raiz do repo

workers/app/wrangler.jsonc          Worker `finance-dashboard` (o SPA)
src/routes/oauth.consent.tsx        tela de consentimento
src/features/mcp/consent.ts         o que o acesso concede, em português
supabase/migrations/*mcp*           4 migrations
supabase/migrations/*v_bills_security_invoker*   a correção de RLS (§5.2)
```

---

## 14. Histórico (PRs)

| PR                                                             | O que entrou                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [#69](https://github.com/GiovanniPB/finance-dashboard/pull/69) | núcleo, stdio, jaula de SQL, blindagem, consentimento, Worker, dashboard saindo do Pages |
| [#70](https://github.com/GiovanniPB/finance-dashboard/pull/70) | `_redirects` rejeitado pelo Workers; variáveis de produção do MCP                        |
| [#71](https://github.com/GiovanniPB/finance-dashboard/pull/71) | nome do Worker alinhado com a conta; comandos do Workers Builds                          |
| [#72](https://github.com/GiovanniPB/finance-dashboard/pull/72) | descoberta RFC 8414 confirmada no hospedado                                              |
| [#73](https://github.com/GiovanniPB/finance-dashboard/pull/73) | `mcp_clients` vira lista de bloqueio                                                     |
| [#74](https://github.com/GiovanniPB/finance-dashboard/pull/74) | esta referência técnica                                                                  |
| _(esta branch)_                                                | catálogo de 5 → 22 tools; correção da RLS de `v_bills`; typecheck de `_shared/`          |

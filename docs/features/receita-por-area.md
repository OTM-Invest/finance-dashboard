# Receita por área — estado, decisões e o que falta

> **Leia isto primeiro** ao continuar o trabalho. Atualizado em 2026-10-27.
>
> - Branch: `claude/receita-por-area-68d684`. **Nada aplicado no remoto**: a migration
>   `20261027140000_receita_por_area.sql` passou em `db:reset` local, com os `assert`
>   dela e o teste `supabase/tests/receita_por_area.sql` (45 cenários).
> - Plano original e o "porquê": [`receita-por-area-plan.md`](receita-por-area-plan.md).
>   Contrato do CRM: `otm-invest-crm/docs/btg-commission-reports-plan.md` §9.

## 1. O que é

A receita do BTG entra no financeiro como **um lançamento por relatório por mês** (conta
`1.01`, contraparte BTG Pactual): PJ1 na OTM Assessoria, PJ2 e finder na OTM Corretora. O
CRM tem o relatório linha a linha. Esta frente abre o lançamento em **assessor × produto**,
como a fatura de cartão abre em compras, e atribui cada linha à **área atual do
colaborador** do código do assessor. Com receita e custo abertos por área, a **margem por
área** se monta no Balanço.

```
CRM (jstpwopotsnmbesvmakg)                       Financeiro (vbeevkjenvgvnattzszt)
finance_commission_report[_lines]  ──login──▶  crm-revenue-sync (Edge Function, cron diário)
  (usuário de serviço, só                         │  confere Σ linhas = total, por relatório
   financeiro.receita_btg)                        ▼
                                          crm_commission_reports / _lines   (espelho)
                                                  │  pessoa escolhe: lançamento ↔ relatórios
                                                  ▼
                                          save_revenue_statement            (banco refaz a conta)
                                                  ▼
                                          revenue_statement_lines ─▶ v_revenue_lines (item + área na leitura)
                                                  ▼
                                          v_management_lines, ramo 'revenue'  ─▶ Balanço, /receita
```

## 2. Mudanças de rota (e por quê)

| #   | Plano (`receita-por-area-plan.md`)                          | O que mudou                                                                                                                                                          | Por quê                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Papel `finance_reader` no CRM com JWT no Vault              | **Usuário de serviço do CRM** (perfil só com `financeiro.receita_btg`), login por senha; credencial nos secrets da Edge Function                                     | O CRM decidiu por permissão de catálogo, não papel de banco (um sistema de acesso só). Aprovado pelo dono em 27/10/2026. O usuário ainda **não existe**.                                                                         |
| 2   | Lançamento ↔ relatório, 1:1                                 | Lançamento ↔ **conjunto** de relatórios do mesmo tipo (`revenue_statement_reports`)                                                                                  | O CRM ganhou identidade por ARQUIVO: um mês de PJ1 pode vir em vários arquivos (contas B2B), e um finder pode cobrir dois meses.                                                                                                 |
| 3   | Tolerância de centavos; acima disso `needs_review` e fora   | **Linha explícita "Diferença relatório × nota"**, sem área, gravada pelo banco; o statement só entra no Balanço depois que alguém **aceita** a diferença por escrito | Decisão D1 do dono (27/10). Há resíduos reais (abr/26 −7.868). A linha faz fechar ao centavo sem esconder o resíduo; o aceite fica auditado.                                                                                     |
| 4   | `revenue_statement_lines` com `employee_id` e item gravados | Linha guarda **o que o CRM disse** (código, categoria, produto); item e área saem **na leitura** (`v_revenue_lines`)                                                 | D2: área ATUAL do colaborador, igual à folha — mudar alguém de área move a receita dele, também nos meses passados. O item segue o de-para vigente.                                                                              |
| 5   | Área lida de `employees` na view                            | Por `btg_advisor_areas()` (`security definer`, devolve só código → colaborador → área)                                                                               | `employees` é do módulo `payroll` na RLS. Com a view `security invoker` juntando `employees`, quem não vê folha veria a receita sem área — e o Balanço daria um número por pessoa.                                               |
| 6   | Arredondar ao gravar                                        | **Maior resto, por relatório**: cada linha truncada no centavo, os centavos que faltam vão às de maior resto                                                         | A comissão vem sem arredondar; arredondar linha a linha erra 88 de 146 relatórios em até 9 centavos. Σ linhas = total do relatório EXATO, nenhuma linha a mais de 1 centavo do cru.                                              |
| 7   | Combinação nova cai em "Outras" com aviso                   | Mantido: cai em **"BTG · Outras receitas"** e `v_revenue_lines.is_unmapped` marca; a aba De-para lista no topo                                                       | —                                                                                                                                                                                                                                |
| 8   | Campo do código BTG na tela de colaboradores                | Ligação feita na aba **Assessores** de `/receita` (código do CRM → colaborador, com sugestão pelo nome); o campo no cadastro do colaborador fica para PR seguinte    | A branch `feat/colaborador-area`, sem commit na checkout principal, mexe nos mesmos arquivos (`EmployeeDrawer`, `schema`, `payroll.employees`). Mergear ela primeiro evita conflito.                                             |
| 9   | Zod na fronteira                                            | Validação explícita em `_shared/revenue/contract.ts`, que falha alto com o caminho do campo                                                                          | `_shared/` não usa Zod: o Vitest não resolve especificador `npm:` em runtime. Mesmo efeito: formato que mudar no CRM barra a sincronização, sem gravar nada.                                                                     |
| 10  | Rota PJ → empresa fixa no código                            | Tabela `btg_report_routes` (`pj1`/`pj2`/`finder` → empresa), configurada na aba Sincronização                                                                        | É dado da organização, não do schema. Sem rota, a sincronização não grava o relatório e diz por quê.                                                                                                                             |
| 11  | Código 1056306 como qualquer outro                          | **Recusado** em `employees.btg_advisor_code`; a receita dele fica "sem área", com aviso próprio na tela                                                              | É o balde do importador do CRM para assessor desconhecido (no finder, até 57% do mês) e também um assessor real (Leandro). Ligá-lo daria a ele a receita sem dono. Só se separa quando a F3 do CRM preencher `advisor_code_raw`. |

## 3. O que existe

### Banco — `20261027140000_receita_por_area.sql`

- **Plano gerencial**: 17 itens `receitas.btg_*` no grupo Receitas (`seed_btg_revenue_items`,
  com trigger para organização nova), entre eles `btg_deducoes` (D3) e `btg_diferenca` (D1).
- **De-para** `revenue_category_map` (categoria × produto, produto nulo = curinga), 32
  regras iniciais com as combinações do BTG de out/2025 a set/2026 lidas no CRM. Item tem de
  ser de receita e não pode ser `btg_diferenca`.
- **Código do assessor**: `employees.btg_advisor_code` (único na organização, 1056306
  recusado) e `btg_advisor_areas()`.
- **Rotas** `btg_report_routes` (só admin escreve; rota com relatório gravado não muda de
  empresa).
- **Espelho** `crm_commission_reports` (id = `report_id` do CRM, `content_hash`,
  `removed_at`) e `crm_commission_report_lines` (comissão sem escala); `crm_sync_runs`.
  Escrita só por `crm_commission_sync_apply` (service role), que confere de novo Σ linhas =
  total antes de gravar e marca `removed_at` no relatório da janela que sumiu do CRM.
- **Statement** `revenue_statements` / `_reports` / `_lines`; escrita só por RPC:
  - `save_revenue_statement(tx, report_ids[], replace)` — o cliente manda só a escolha;
    confere empresa, tipo único, relatório não usado nem removido, lançamento de entrada em
    item de receita; grava linhas por maior resto e, se precisar, a linha de diferença;
    `reconciled` só com diferença zero;
  - `accept_revenue_statement_difference(id, nota ≥ 10)` — só se nada mudou desde a montagem;
  - `delete_revenue_statement(id)`;
  - gatilhos: lançamento que muda (valor, sinal, conta, empresa) ou relatório que muda/some
    no CRM devolvem o statement a `needs_review` e apagam o aceite.
- **Leitura**: `v_revenue_lines` (item e área resolvidos), ramo `revenue` em
  `v_management_lines`, `revenue_breakdown_multi`, `pending_revenue_transactions`,
  `crm_advisor_codes`.
- **Sincronização**: `crm_revenue_cron_invoke` (Vault: `crm_revenue_sync_url`,
  `crm_revenue_sync_secret`; ausentes = no-op), cron `crm-revenue-sync` às 9h40,
  `request_crm_revenue_sync` (botão; admin/editor de empresa com rota).
- **Conferência na migration**: itens e de-para completos em toda organização;
  `management_reconciliation` = 0 no banco inteiro.

### Regras — `supabase/functions/_shared/revenue/`

| Arquivo         | O que faz                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `contract.ts`   | Valida as respostas das duas RPCs do CRM; `CRM_BUCKET_ADVISOR_CODE`.                                                   |
| `conference.ts` | Soma em decimal exato (bigint 10⁻¹⁰), arredonda como o `round` do Postgres; confere relatório × linhas.                |
| `client.ts`     | Login do usuário de serviço e RPC paginada com `count=exact` (o `max_rows` corta sem erro); 42501 vira mensagem clara. |
| `sync.ts`       | Janela padrão (6 meses), conferência que barra tudo, payload do banco.                                                 |
| `match.ts`      | Sugestão lançamento ↔ grupo de relatórios (empresa × tipo × mês; finder cobre o período; menor diferença, ≤ 2%).       |
| `advisors.ts`   | Sugestão colaborador ← nome do CRM (primeiro nome + sobrenome, 1 letra de tolerância).                                 |
| `breakdown.ts`  | Totais, por área, por item, por assessor (balde marcado).                                                              |

A tela reexporta de `src/features/revenue/compute.ts`.

### Edge Function — `crm-revenue-sync`

`verify_jwt = false`, origem pelo segredo `x-sync-secret` (comparação em tempo constante).
Secrets: `CRM_SUPABASE_URL`, `CRM_SUPABASE_ANON_KEY`, `CRM_SYNC_EMAIL`,
`CRM_SYNC_PASSWORD`, `CRM_SYNC_SECRET`. Testada localmente ponta a ponta contra um CRM
falso com as fixtures: login, paginação de 3 em 3, idempotência (2ª rodada `unchanged`),
período inválido e senha errada (erro gravado sem a senha).

### Tela — `/receita` (menu "Receita por área")

Abas: **Por área**, **Por produto**, **Assessores** (receita por código + ligar código →
colaborador), **Conferência** (relatórios sem lançamento com a sugestão; abertos, com
aceite da diferença, "montar de novo" e "desfazer"), **De-para**, **Sincronização** (rotas,
botão, execuções). Segue o seletor de empresa/consolidado/grupo, o `PeriodPicker` e o
regime (`?regime=`).

### Margem por área no Balanço

Já funciona com o que existe: num modelo do Balanço (`/reports` → Balanço), uma linha de
filtro **grupo Receitas × área X, medida líquido** e outra de custo da mesma área; uma
linha de fórmula subtrai. A medida tem de ser **líquido**: desconto do BTG é saída em item
de receita.

## 4. Invariantes (não quebre)

1. **O contábil não muda.** DRE, caixa e apuração leem `transactions`; o lançamento do BTG
   continua um só em `1.01`.
2. **A camada não cria nem some com dinheiro**: Σ linhas do statement = lançamento, sempre
   (o próprio `save_revenue_statement` aborta se não); `management_reconciliation` = 0.
3. **Só `reconciled` abre**, e só com diferença zero ou aceita por escrito.
4. **O cliente manda a escolha, o banco faz a conta.** Nenhuma escrita direta nas tabelas
   do statement nem do espelho.
5. **Liga por código, nunca por nome.** O nome só sugere.
6. **1056306 nunca vira receita de alguém.**
7. **Uma implementação por regra**: item/área → `v_revenue_lines`; arredondamento →
   `save_revenue_statement`; conferência de relatório → `conference.ts` (e de novo no banco).

## 5. Como testar

```sh
bun run db:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/receita_por_area.sql
bun run preflight
```

Ponta a ponta da sincronização (local): suba um servidor que responda
`/auth/v1/token` e `/rest/v1/rpc/finance_commission_report[_lines]` com as fixtures de
`_shared/revenue/fixtures.ts`, aponte `CRM_SUPABASE_URL` para
`http://host.docker.internal:<porta>` num env file e rode
`supabase functions serve crm-revenue-sync --env-file <arquivo>`.

## 6. O que falta

### 6.1 Go-live (com o dono)

1. **No CRM**: criar o perfil com só `financeiro.receita_btg` e o usuário de serviço nele.
   A senha vai direto para os secrets do financeiro, sem passar por repositório ou chat.
2. **No financeiro**: `supabase secrets set CRM_SUPABASE_URL=… CRM_SUPABASE_ANON_KEY=…
CRM_SYNC_EMAIL=… CRM_SYNC_PASSWORD=… CRM_SYNC_SECRET=…`; no Vault,
   `crm_revenue_sync_url` e `crm_revenue_sync_secret` (= `CRM_SYNC_SECRET`).
3. `bun run db:push` (depois do PR) e publicar `crm-revenue-sync`.
4. Aba Sincronização: conferir as rotas (PJ1 → Assessoria; PJ2 e finder → Corretora) e
   "Sincronizar agora" com o período de 2026.
5. Aba Assessores: confirmar a ligação código → colaborador (tabela em §7).
6. Aba Conferência: abrir os lançamentos de 2026; aceitar (ou investigar) os resíduos
   conhecidos — jan/26 +3.885, fev/26 +3.938, abr/26 −7.868, set/26 +3.045.
7. Montar no Balanço o modelo de margem por área.

### 6.2 Pendências

- **Campo "Código BTG" no cadastro do colaborador** (coluna na lista + campo no drawer) —
  depois do merge de `feat/colaborador-area`.
- **Tool de MCP** `revenue_breakdown` (fase 6 do plano), lendo `_shared/revenue/breakdown.ts`;
  entra no catálogo fixado por `registry.test.ts`.
- **Gaveta de lançamentos** do Balanço já lista as linhas `revenue` (por `source_id`), mas a
  tela `/receita` não abre os lançamentos de uma célula.
- **Balde 1056306**: separar quando a F3 do CRM subir e `advisor_code_raw` vier preenchido —
  pedir ao CRM que o exponha nas RPCs.
- Template de modelo "Margem por área" no Balanço (hoje se monta à mão).

## 7. Decisões levadas ao dono

| #   | Pergunta                                                         | Estado                                                                                  |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D1  | Relatório × nota divergente                                      | **Decidido** (27/10): linha explícita de diferença, sem área, aceita por escrito.       |
| D2  | Receita de quem mudou de time: área atual ou da época?           | Implementado como **área atual** (recomendação); confirmar.                             |
| D3  | Erro operacional e custos do BTG: dedução de receita ou despesa? | Implementado como **dedução** (`receitas.btg_deducoes`); confirmar com a contabilidade. |
| D4  | Medida: `commission` ou `revenue`?                               | Implementado: **comissão** no Balanço; `revenue` guardada, só indicador.                |
| D5  | `SALDO REMUNERADO TRANSACIONAL` é PJ1 ou PJ2?                    | Resolvido pelo CRM: quem diz é o arquivo (`kind`), não a categoria.                     |
| —   | Autenticação                                                     | **Decidido** (27/10): usuário de serviço. Falta criar perfil e usuário no CRM.          |
| —   | Ligação código → colaborador                                     | Sugestão abaixo, a confirmar na aba Assessores.                                         |

Códigos com receita em 2026 e a área atual de cada um (levantamento da sessão de origem):

| Código   | Assessor                           | Área atual    | Observação                                    |
| -------- | ---------------------------------- | ------------- | --------------------------------------------- |
| 1267653  | Marcio San Juan                    | Mesa Digital  |                                               |
| 57253873 | Kaio Vinicius                      | Agility Sales |                                               |
| 8430950  | Gabriel Noffs Dalla                | Bankers       |                                               |
| 20966228 | Yasmin Martins de Souza            | Onboarding    |                                               |
| 994500   | Adriane Ferreira Santos            | Bankers       |                                               |
| 9218194  | Enrico Plenas Martini              | Bankers       |                                               |
| 431103   | Giuliano Castanharo Rosseto        | Bankers       |                                               |
| 5482965  | Eduardo Frederico de Souza Freitas | Bankers       |                                               |
| 6212302  | Iggo Cesar Malcher Fonseca         | Bankers       |                                               |
| 15078342 | Humberto Ataliao Prado             | Bankers       |                                               |
| 1056306  | Leandro Ghiraldini Otero           | Apoio         | **Não liga**: é o balde do CRM; fica sem área |
| 6003096  | Rafael Guiraldini Otero            | Onboarding    |                                               |
| 1504416  | Enzo Barros Pruano                 | Tecnologia    |                                               |
| 3800935  | Giovanni Pignoli Barcelini         | —             | sem área no cadastro: a receita fica sem área |
| 20214892 | Henrique Botelho Ximenes           | ?             | colaborador a confirmar                       |
| 22370699 | Guilherme Opusculo Faria           | Agility Sales |                                               |

Não há seed em migration: ligação é dado de produção. A aba Assessores sugere o
colaborador pelo nome e uma pessoa confirma.

## 8. Próxima sessão — por onde começar

1. Ler este documento, o `CLAUDE.md` (seção "Receita por área") e
   `supabase/migrations/20261027140000_receita_por_area.sql`.
2. `bun run db:reset` e o teste de banco (§5).
3. Go-live (6.1) com o dono; depois as pendências (6.2).

# pagar.me — Vendas e Recebíveis no Financeiro (Referência Técnica)

> **Propósito deste documento:** dar a uma pessoa (ou IA) que assuma o projeto o
> contexto completo da integração **profunda** com o pagar.me — dashboard de vendas
> e automação da receita nos lançamentos, DRE e "A Receber". É a fonte de verdade
> técnica.
>
> Documentos irmãos:
>
> - [`pagarme-sales-plan.md`](pagarme-sales-plan.md) — o plano, com o diagnóstico do
>   processo manual, as decisões contábeis D1–D5 e o checklist de go-live (§7).
> - [`pagarme-api-contract.md`](pagarme-api-contract.md) — o que a API do pagar.me
>   **de fato** devolve (sondado em produção), com as divergências contra a doc.
> - [`nfse-system.md`](nfse-system.md) — a esteira fiscal, que compartilha a mesma
>   conexão pagar.me e o mesmo webhook.
>
> **Última atualização:** 14/08/2026.

---

## 1. O que o sistema faz

Duas coisas, a partir da mesma fonte:

1. **Dashboard de vendas** (`/vendas`) — GMV, ticket médio, taxa de aprovação,
   composição por método/parcelas/plano/bandeira, novos × recorrentes, MRR/churn e o
   **cronograma de recebíveis** (o que já foi creditado e o que está contratado).

2. **Automação da receita no financeiro** — os recebíveis do pagar.me viram
   lançamentos: receita bruta, taxa de adquirência, antecipação e estorno, na
   carteira do gateway; e as parcelas futuras aparecem em **A Receber** e no
   forecast. O saque para o banco passa a ser **transferência**, não receita.

### O problema que isso resolve

Antes: um mês inteiro de vendas entrava como **um** lançamento de receita, na data
em que a TED do pagar.me caía (R$ 21k–152k). Três erros de uma vez:

- **caixa em serrote** — o mês recebia um pico artificial no dia do saque;
- **receita líquida disfarçada de bruta** — a taxa de adquirência não existia na DRE;
- **R$ 2,5 milhões de recebíveis contratados invisíveis** — vender em 12x não
  aparecia em lugar nenhum.

---

## 2. Glossário

| Termo                   | Significado                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| **conexão**             | uma conta pagar.me (`pagarme_accounts`). Compartilhada com a esteira fiscal.             |
| **recebedor**           | `re_…`/`rp_…` do split, mapeado a uma empresa em `pagarme_recipient_map`.                |
| **payable/recebível**   | uma parcela a receber (`pagarme_receivables`). Uma venda em 12x gera 12.                 |
| **carteira do gateway** | conta `bank_accounts` tipo `payment_gateway` — onde o dinheiro está antes do saque.      |
| **projeção**            | `pagarme_project_ledger` — converte recebíveis em lançamentos. A ponte entre os mundos.  |
| **corte (cutover)**     | data a partir da qual a projeção lança. Antes dela, o histórico manual continua valendo. |
| **lote**                | `pagarme_sync_runs` — carga histórica retomável por cursor de página.                    |

---

## 3. Arquitetura ponta a ponta

```
┌── pagar.me ── webhook (charge.*, subscription.*, customer.*)
│                     │  pagarme-webhook  (mesma function da NFS-e; roteia por tipo)
│                     │  · grava sales_events (dedup)
│                     │  · LEDGER: upsert de charge/cliente/assinatura + cronograma
│                     │  · FISCAL: só charge.paid explode invoice_jobs   ← invariante
│                     ▼
│              pagarme_charges · pagarme_customers · pagarme_subscriptions
│              pagarme_receivables  ◄── o cronograma: 1 linha por parcela
│                     ▲
└── pagarme-sync ─────┘  (pg_cron)
      · settlements (1h)     /balance/operations → marca recebível como pago
      · maturity   (1×/dia)  /payables?charge_id= → antecipação e estorno
      · subscriptions (1×/dia) status/cancelamento (MRR, churn)
      · backfill   (2 min)   drena pagarme_sync_runs → histórico

                      pagarme_receivables
                            │
                            │   ⇩ ÚNICA ponte para o financeiro
                            │   pagarme_project_ledger(empresa, de, até [, conexão])
                            ▼
                      transactions  (pagarme_projection_key ≠ null)
                            │
        ┌───────────────────┼──────────────────┬──────────────────┐
        ▼                   ▼                  ▼                  ▼
   v_bills            dre_by_company     forecast_*        pagarme_reconcile_month
  (A Receber)        (competência/caixa)  (fluxo 90d)     + pagarme_reconcile_payout
                                                          (a TED vira transferência)
```

**O ponto mais importante da arquitetura:** o ledger de vendas e o financeiro são
**separados**. Ingerir venda nunca escreve em `transactions`. A única coisa que
escreve é `pagarme_project_ledger`, chamada explicitamente e desligável por
`pagarme_ledger_settings.enabled`. Isso permite carregar anos de histórico sem risco
nenhum para a contabilidade, conferir, e só então ligar.

---

## 4. Banco de dados

### 4.1 Enums (aditivos)

- `data_module += 'sales'` — módulo de permissão do dashboard.
- `bank_account_type += 'payment_gateway'` — a carteira do gateway.

> Em migration **separada** (`pagarme_sales_enums`): Postgres não permite usar um
> label novo de enum na mesma transação que o cria.

### 4.2 Tabelas (todas com RLS)

| Tabela                    | Escopo RLS                               | Papel                                                      |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `pagarme_customers`       | empresa **dona**                         | compradores (PII mínima). Dado comercial, não financeiro.  |
| `pagarme_charges`         | empresa dona                             | a venda: valor, parcelas, método, bandeira, status, plano. |
| `pagarme_subscriptions`   | empresa dona                             | assinaturas + MRR derivado do ciclo.                       |
| `pagarme_receivables`     | **empresa** (`company_id` = quem recebe) | o cronograma. O coração.                                   |
| `pagarme_payouts`         | empresa                                  | saques conciliados (gateway → banco).                      |
| `pagarme_sync_runs`       | empresa dona                             | lotes de carga histórica.                                  |
| `pagarme_ledger_settings` | empresa                                  | para onde a projeção lança + corte + kill-switch.          |

**Dois escopos de RLS de propósito:** recebível e saque são **dinheiro** (pertencem a
quem recebe o split — a RCO vê os dela dentro da conta da Jimmy); cliente, cobrança e
assinatura são **dado comercial + PII** (pertencem a quem vendeu).

Detalhes de `pagarme_receivables` que importam:

- `net_amount` e `settled_on` são **colunas geradas** (`stored`) — não escreva nelas.
- `first_seen_payment_date` é congelada por trigger BEFORE: comparar com
  `expected_payment_date` é como se detecta **antecipação** sem campo extra.
- `sale_accrual_at` = data do pagamento da venda → é a **competência** (D2).

### 4.3 RPCs

| RPC                                                                            | Papel                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `pagarme_setup_gateway_account`                                                | configura a carteira de (conexão × empresa). Adota conta existente ou cria.    |
| `pagarme_project_ledger`                                                       | **a projeção.** Idempotente, por (empresa × conexão).                          |
| `pagarme_reconcile_payout`                                                     | registra o saque como transferência gateway → banco (chama `create_transfer`). |
| `pagarme_reconcile_month`                                                      | liquidado × lançado × sacado. `divergencia_*` deve ser zero.                   |
| `pagarme_start_backfill`                                                       | enfileira um lote histórico (só produção).                                     |
| `pagarme_resume_sync_run`                                                      | retoma lote do cursor onde parou.                                              |
| `claim_pagarme_sync_run`                                                       | claim atômico (`FOR UPDATE SKIP LOCKED`) — só `service_role`.                  |
| `pagarme_charges_needing_maturity_sync`                                        | quais cobranças reconsultar no sweep diário.                                   |
| `pagarme_active_sync_accounts`                                                 | conexões elegíveis: ativas, com chave, **em produção**.                        |
| `pagarme_cron_status`                                                          | agendamento + último resultado (super admin).                                  |
| `sales_overview` / `_timeseries` / `_breakdown` / `_customers` / `_recurrence` | análise (`security invoker`).                                                  |
| `receivables_schedule`                                                         | cronograma por mês.                                                            |
| `forecast_pagarme_inflow`                                                      | série diária dos recebíveis já projetados.                                     |
| `pagarme_receivables_of_transaction`                                           | as parcelas que compõem um lançamento agregado.                                |
| `pagarme_gateway_accounts`                                                     | carteiras de uma empresa (visão da conciliação).                               |

### 4.4 Views

- `v_bills` — ganhou `pagarme_projection_key`, que é o discriminador de origem no A Receber.
- `v_pagarme_ledger_health` — furos acionáveis (6 tipos). **Ledger saudável = zero linhas.**

### 4.5 A projeção, em detalhe

`pagarme_project_ledger(empresa, de, até [, conexão])`:

1. Percorre as `pagarme_ledger_settings` **habilitadas** da empresa — uma por conexão.
2. Recorta os recebíveis por `expected_payment_date` entre `max(de, corte)` e `até`.
3. **Agrega** por `(tipo × dia de liquidação × mês de competência × liquidado?)`.
4. Faz upsert em `transactions` pela chave determinística:

   ```
   pagarme:<empresa>:<conexão>:<tipo>:<liquidação>:<AAAA-MM>[:pending]
   ```

5. Amarra recebível → lançamento (`pagarme_receivables.transaction_id`).
6. Apaga grupos que deixaram de existir — **escopado pelo prefixo da conexão**.

Por que agregado (D3): 4.628 parcelas viram ~500–750 lançamentos/ano em vez de
4.628. O mês de competência entra na chave porque um mesmo dia de liquidação recebe
parcelas de vendas de meses distintos, e a DRE bucketiza por mês. O `accrual_date` do
lançamento é a **última data de venda real do grupo** — nada inventado.

Por que "liquidado?" entra na chave: um grupo não pode misturar parcela paga com
pendente, senão `status`/`cash_date` do lançamento seriam ambíguos.

O que gera, na carteira do gateway:

| Tipo        | Direção | Conta  | Significado                              |
| ----------- | ------- | ------ | ---------------------------------------- |
| receita     | entrada | `1.01` | **bruta** (D1)                           |
| taxa        | saída   | `7.09` | MDR — o custo real de receber por cartão |
| antecipação | saída   | `7.10` | só quando a data é puxada para frente    |
| estorno     | saída   | `2.09` | dedução de receita (D5)                  |

Datas de cada lançamento — é isto que faz as telas conversarem:

- `accrual_date` = data da venda → **competência**
- `due_date` = data de liquidação → é o que faz aparecer em **A Receber** e no forecast
- `cash_date` = data de liquidação, **só se já liquidou** → coluna **caixa** da DRE
- `status` = `pending` (a caminho) | `settled` (creditado)

**Nunca toca lançamento humano** (`pagarme_projection_key is null`) nem conciliado
(`status = 'reconciled'`) — divergência deve aparecer no relatório, não ser
sobrescrita em silêncio.

---

## 5. Edge Functions

### `pagarme-webhook` (compartilhada com a NFS-e)

Roteador por tipo de evento. Duas responsabilidades independentes, com falhas
isoladas: uma exceção no ledger **não** impede a emissão de nota, e vice-versa.

**Invariante crítica, com teste dedicado:** `explodeFiscal` é verdadeiro **somente**
para `charge.paid`. Nenhum evento novo pode disparar emissão fiscal.

Sandbox não entra no ledger — o gate está em `loadLedgerContext` (chokepoint único de
escrita), e a resposta reporta `ledger.skipped = "sandbox"`.

### `pagarme-sync` (cron)

Quatro modos (`?mode=`), todos retomáveis e idempotentes:

| Modo            | Cron          | Papel                                                                     |
| --------------- | ------------- | ------------------------------------------------------------------------- |
| `settlements`   | `7 * * * *`   | **via primária** de realização: `/balance/operations` (pagina de verdade) |
| `maturity`      | `20 9 * * *`  | rede de segurança: `/payables?charge_id=` das parcelas vencidas           |
| `subscriptions` | `35 9 * * *`  | status/cancelamento (MRR, churn)                                          |
| `backfill`      | `*/2 * * * *` | drena `pagarme_sync_runs` (no-op sem lote)                                |

Orçamentos por invocação (o Edge Runtime tem limite de tempo): 3 páginas de
liquidação, 40 cobranças de maturidade, 4 páginas de assinatura, 2 páginas de
backfill. `MAX_RUN_ATTEMPTS = 8` conta **reivindicações sem progresso** — o tick que
avança zera o contador.

### `_shared/pagarme/` (Deno puro, testado por Vitest)

`time` (timestamps e data em São Paulo) · `money` (centavos → string decimal) ·
`payables` · `charges` · `subscriptions` · `events` (roteador) · `ledger` (mapeamento
puro) · `api` (HTTP) · `writer` (escrita) · `fixtures` (formas reais, pseudonimizadas).

> `_shared/nfse/payables.ts` **delega** a este parser base — a direção da dependência
> é fiscal → base, nunca o contrário.

---

## 6. Frontend

| Rota                 | Papel                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| `/vendas`            | dashboard (só leitura). Dois escopos: venda por conexão, dinheiro por empresa. |
| `/integracoes`       | índice das integrações com o estado real de cada uma.                          |
| `/integracoes/:slug` | **toda** a config de uma conexão, na ordem de ativação.                        |
| `/integracoes/nova`  | criação.                                                                       |
| `/webhooks`          | cobertura de eventos, estado do pg_cron, fila de eventos.                      |
| `/companies`         | lista das empresas, com o estado fiscal de cada uma no card.                   |
| `/companies/:id`     | cadastro **e** configuração fiscal da empresa, na mesma página.                |
| `/bills`             | A Receber com filtro de origem e detalhe das parcelas (só leitura).            |
| `/forecast`          | série separada dos recebíveis pagar.me sobre as entradas.                      |
| `/reconciliation`    | fecha o mês e registra o saque como transferência.                             |

Organização por dono do dado: **configuração** em Integrações, **dado da empresa** em
Empresas, **operação** em NFS-e, **análise** em Vendas.

Features: `src/features/sales/` (dados e componentes de análise) ·
`src/features/integrations/` (config, carga, projeção, webhooks).

> **Dívida conhecida:** a conexão pagar.me (CRUD, recebedores, segredos) continua em
> `src/features/nfse/api.ts`, onde nasceu com a esteira fiscal. Hoje serve notas **e**
> vendas, então o nome está errado. Mover é refactor de import em ~40 arquivos.

### 6.1 Desempenho: por que o /vendas estourava (e o que resolveu)

Quando o backfill passou de ~1.200 para **7.623 vendas / 47.130 recebíveis**, o
`/vendas` passou a demorar muito e às vezes falhar. Medido em produção com um
usuário `editor` de 4 empresas:

| Consulta                  | Antes     | Buffers |
| ------------------------- | --------- | ------- |
| `receivables_schedule`    | 12.460 ms | 344.105 |
| `sales_overview`          | 6.484 ms  | 149.322 |
| `sales_recurrence`        | 6.285 ms  | 225.316 |
| `sales_customers`         | 2.969 ms  | 73.545  |
| `v_pagarme_ledger_health` | 48.424 ms | 1,3 M   |

Como `authenticated` tem `statement_timeout = 8s`, isso não era só lentidão: era
erro. **O volume não era o problema** — a mesma agregação sobre as mesmas 42.618
linhas rodava em **43 ms** sem RLS.

A causa era o predicado das policies, não a query nem os índices:
`has_company_access(company_id)` é `security definer`, então o Postgres não faz
inlining; e como o argumento depende da linha, ela executava **uma vez por linha
varrida**, cada execução rodando ainda `is_super_admin()` e um `exists` em
`company_access`. O custo estimado inflado ainda passava de `jit_above_cost`, e o
JIT somava ~1,9s de compilação por cima (a health view caía de 1.949 ms para 67 ms
só com `jit = off`).

A correção (migration `…_rls_initplan_optimization`) reescreve o predicado em forma
de conjunto — `(select …)` para o que não depende da linha, `coluna in (subquery)`
para o que depende — o que o planner resolve como InitPlan + hash semi-join. Mesmo
`count`: **5.743 ms → 22 ms**. A equivalência do conjunto de linhas foi conferida
usuário a usuário sobre os dados reais (0 diferenças nos dois sentidos), inclusive
nos usuários que enxergam subconjuntos distintos (2.516 / 5.108 / 7.624 vendas).

O padrão vale para o app inteiro, não só para vendas — ver a seção de RLS no
`CLAUDE.md` antes de escrever policy nova.

---

## 7. Decisões (e por quê)

| #      | Decisão                                          | Por quê                                                                                     |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **D1** | receita **bruta** + taxa como despesa financeira | a taxa é custo real de receber; embutida no líquido, ela não existe na DRE.                 |
| **D2** | competência **integral na data da venda**        | a venda foi ganha quando aconteceu; parcelamento é financiamento, não receita futura.       |
| **D3** | lançamento **agregado** por dia de liquidação    | por parcela seriam ~10k linhas/ano; agregado são ~500–750, sem perder competência.          |
| **D4** | **corte em 01/09/2026**                          | o histórico até o corte já está representado pelos lançamentos manuais.                     |
| **D5** | estorno/chargeback no **período corrente**       | reabrir mês fechado por estorno é pior que reconhecer a dedução onde ela aparece.           |
| —      | competência da DRE inclui `pending`              | sem isso a coluna "competência" era caixa datado por `accrual_date`, e D2 não se cumpriria. |
| —      | sandbox fora do ledger                           | ledger financeiro é fonte de verdade; venda de teste não pode virar recebível.              |
| —      | projeção por (empresa × conexão)                 | a RCO recebe na conta dela **e** dentro da da Jimmy, com carteira própria em cada uma.      |
| —      | carteira **adotada**, não criada                 | as contas "Pagar-me" já carregam o histórico manual; o corte é a fronteira entre os dois.   |
| —      | saque via **extrato bancário**, não API          | `GET /transfers` do pagar.me é bloqueado por allowlist de IP; a TED já está no extrato.     |

---

## 8. Descobertas sobre a API (validadas em produção)

Detalhe completo em [`pagarme-api-contract.md`](pagarme-api-contract.md). O essencial:

1. **A premissa do projeto se confirma:** `payment_date` vem preenchida em payable
   **não liquidado** — o cronograma de 12x é conhecido no ato da venda. Sem isso, não
   haveria projeção possível.
2. `/payables?charge_id=` é a fonte confiável; o `/payables` **global tem paginação
   quebrada** — por isso existe o sweep de maturidade em vez de uma varredura.
3. `/balance/operations` pagina de verdade e traz o payable liquidado em
   `movement_object` — é a via primária de realização.
4. `/charges` capa em **30 itens** por página, mesmo pedindo mais.
5. `GET /transfers` responde 401 por allowlist de IP.
6. Ids chegam como número **ou** string, dependendo do endpoint.
7. Os dois modelos de receita do grupo são assimétricos: a Jimmy vende **assinatura**,
   a RCO vende **pedido parcelado** (sem objeto assinatura). `sales_recurrence`
   devolve as duas famílias de métrica com `has_subscriptions` dizendo qual vale.

---

## 9. Segurança

- Segredos só no **Vault**: secret key da API e segredo de webhook por conexão,
  `pagarme_sync_url` / `pagarme_sync_secret` para o cron. Tabelas guardam a referência.
- O front nunca usa service role. RPCs `SECURITY DEFINER` autorizam internamente por
  `has_company_write_access`.
- Webhooks verificam origem (segredo próprio por conexão) e são idempotentes
  (`sales_events` único por `provider,event_id`).
- Ao sondar a API por `pg_net`, consulte **apenas** `net._http_response` —
  `net.http_request_queue` guarda o header com o segredo.
- LGPD: `pagarme_customers` guarda o mínimo (nome, e-mail, documento) e é escopada à
  empresa dona.

---

## 10. Como rodar e operar

### Local

```sh
bun run db:start && bun run db:reset     # stack + migrations + seed
bun run test:run                         # 565 testes
supabase functions serve pagarme-sync --no-verify-jwt
bun run dev
```

O cron local é **no-op** por design (sem `pagarme_sync_url` no Vault). Para exercitar
a projeção sem API, insira `pagarme_receivables` à mão e chame
`pagarme_project_ledger` — é o que os scripts de verificação fazem.

### Remoto (ordem de ativação)

O checklist completo está em [`pagarme-sales-plan.md` §7](pagarme-sales-plan.md).
Resumo:

1. `PAGARME_SYNC_SECRET` nas secrets + `pagarme_sync_url`/`pagarme_sync_secret` no
   Vault. **Sem isso os quatro crons rodam sem fazer nada** — modo de falha
   silenciosa desta integração, hoje visível em `/webhooks`.
2. Carga histórica por conexão em `/integracoes/:slug`.
3. Assinar os eventos no painel do pagar.me (a tela `/webhooks` mostra o que falta).
4. Carteira do gateway por (conexão × empresa) — **adotando** a conta "Pagar-me".
5. Conferir: `v_pagarme_ledger_health` vazia + `divergencia_*` zero no mês fechado.
6. Ligar a projeção e rodar a janela (corte → +3 anos).
7. A partir do corte, a TED entra por Conciliação → "Registrar saque".

---

## 11. Estado do remoto (`vbeevkjenvgvnattzszt`)

Snapshot de 12/08/2026, fim da sessão:

- ✅ Migrations aplicadas até `pagarme_resume_sync_run`; `pagarme-sync` e
  `pagarme-webhook` deployadas com a correção do contador de tentativas.
- ✅ Crons agendados **e chamando**. Segredos do sync no Vault.
- ✅ `pagarme_recipient_map` completo nas duas conexões de produção (a RCO aparece na
  conta dela **e** na da Jimmy).
- ✅ Carga histórica andando: em 14/08 o remoto tem **7.623 vendas, 47.130
  recebíveis, 3.216 clientes, 126 assinaturas** (era 1.200/13.945 em 12/08).
- ✅ Config órfã removida pela UI.
- ⛔ `db push` de `dre_competencia_inclui_pendente` (a última migration).
- ⛔ Um lote antigo em `failed` (cursor 17) — vítima do bug já corrigido; pode ser
  retomado ou ignorado, já que o lote novo cobre a mesma janela.
- ⛔ Duas carteiras vazias criadas por engano sob a Jimmy
  (`pagar.me — jimmy-carvalho-produ-o`, `pagar.me — rco-tecnologia-produ-o`,
  0 lançamentos) — apagar em Contas depois de apontar as configs para as contas
  "Pagar-me" que já existem.
- ⛔ A RCO ainda não tem configuração de write-back.
- ⛔ Projeção desligada (esperado — liga-se depois de conferir).
- ✅ Eventos de estorno assinados e chegando desde 13/08/2026 (conferido em 23/10/2026:
  94 `charge.refunded`, 13 `charge.chargedback`, 9 `charge.partial_canceled`). A versão
  anterior desta linha dizia que nunca havia chegado nenhum — estava velha, e foi com
  base nela que a esteira fiscal seguiu sem tratar estorno.
- ⛔ `refunded_amount` na venda está SUBESTIMADO: é escrito só por `syncChargePayables`,
  e `runBalanceOperations` grava recebível de estorno sem recalcular o agregado. Em
  23/10/2026: R$ 136.466,76 de payables `refund`/`chargeback` contra R$ 102.180,64
  somados no campo, com 195 vendas zeradas apesar de terem payable. O KPI "Estornos e
  chargebacks" de `/vendas` mostra o número menor. **Não use esse campo como sinal de
  estorno** — o guardrail fiscal usa (evento, status), ver `_shared/pagarme/refunds.ts`.

---

## 12. Pendências conhecidas

1. **`scheduled` na competência da DRE** — ficou de fora da correção: são 246
   ocorrências futuras de recorrência (previsão, não fato), e 28 delas têm competência
   no passado somando R$ 83.603,13. Incluí-las mexeria em meses fechados; é decisão de
   política contábil.
2. **Alertas de lote/cron travado** — hoje o aviso é passivo, dentro da tela. Não há
   notificação ativa.
3. **`features/nfse` deveria virar `features/pagarme`** (ver §6).
4. **Go-live de produção** dos eventos de webhook e da projeção ligada.

---

## 13. Mapa de arquivos

```
supabase/
├── migrations/
│   ├── …_pagarme_sales_enums                        (data_module += sales, bank_account_type += payment_gateway)
│   ├── …_pagarme_sales_ledger                       (6 tabelas + RLS + triggers)
│   ├── …_pagarme_sync_rpcs_and_cron                 (claim, maturity, backfill, 4 agendamentos)
│   ├── …_pagarme_financial_writeback                (contas 7.09/7.10/2.09, settings, PROJEÇÃO)
│   ├── …_pagarme_payout_reconciliation_and_health   (saque como transferência, health, reconcile do mês)
│   ├── …_pagarme_sales_analytics                    (6 RPCs de análise, security invoker)
│   ├── …_pagarme_receivables_ui_support             (v_bills + chave, parcelas do lançamento, forecast)
│   ├── …_pagarme_golive_hardening                   (só produção, projeção por conexão, carteira adotada)
│   ├── …_pagarme_resume_sync_run                    (retomar lote + status do cron)
│   └── …_dre_competencia_inclui_pendente            (competência ≠ caixa)
├── functions/
│   ├── pagarme-webhook/index.ts   (roteador: ledger + fiscal, falhas isoladas)
│   ├── pagarme-sync/index.ts      (settlements | maturity | subscriptions | backfill)
│   └── _shared/pagarme/           time money payables charges subscriptions events ledger api writer fixtures (+ *.test.ts)
src/features/sales/          api hooks useSalesFilters + components (KPIs, evolução, cronograma,
│                            recorrência, health, detalhe de parcelas, conciliação)
│   └── components/breakdown/ um card por dimensão, cada um com o gráfico que ela pede:
│                            rosca (meio de pagamento, bandeira) · barra ordenada 1x…12x
│                            (parcelamento) · ranking horizontal (plano, split por empresa).
│                            labels.ts guarda rótulo e ordenação (puro, testado).
src/features/integrations/   api hooks events + components (ConnectionForm, RecipientsSection,
│                            WebhookEndpointCard, BackfillCard, ProjectionSettingsCard)
src/routes/                  vendas · integracoes · integracoes.detail · webhooks · companies.detail
docs/integrations/           pagarme-system.md (este) · pagarme-sales-plan.md · pagarme-api-contract.md
```

---

## 14. Histórico (branch `feat/pagarme-vendas-recebiveis`)

| Commit    | Conteúdo                                                            |
| --------- | ------------------------------------------------------------------- |
| `5cd9296` | Fase 0+1 — contrato da API validado + schema do ledger              |
| `7ee04bf` | Fase 2 — webhook roteador + `pagarme-sync` + cron + backfill        |
| `65d680b` | Fase 3 — write-back financeiro (a projeção) e o fim do spike        |
| `ba03fde` | Fase 5 — dashboard de vendas                                        |
| `3ee4145` | Fase 4 — recebíveis no A Receber, no forecast e na conciliação      |
| `5fb5372` | operação da esteira + 3 correções encontradas contra os dados reais |
| `2e64922` | reorganização: Integrações e Webhooks; fiscal para Empresas         |
| `76ba271` | configuração de write-back órfã fica visível                        |
| `3e07666` | DRE: competência inclui `pending`                                   |

**Nota de sequenciamento:** o dashboard (só leitura) veio **antes** do write-back
contábil de propósito — entrega valor sem risco de corromper a DRE, e deixa as
decisões D1–D5 amadurecerem com dados reais na mão.

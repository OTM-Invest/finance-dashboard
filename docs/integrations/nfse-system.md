# NFS-e (pagar.me × Focus NFe) — Referência Técnica do Sistema

> **Propósito deste documento:** dar a uma pessoa (ou IA) que assuma o projeto o
> **contexto completo** da integração NFS-e — arquitetura, banco, Edge Functions,
> automação, segurança, frontend, decisões e como continuar. É a fonte de verdade
> técnica; o [`NFSE_STATUS.md`](../../NFSE_STATUS.md) (raiz) é o snapshot curto de
> "onde estamos".
>
> **Última atualização:** 28/08/2026.

---

## 1. O que o sistema faz

Emite **NFS-e municipal (Barueri)** automaticamente a partir das vendas do
**pagar.me**, distribuindo as notas conforme o **split** entre as empresas do
grupo, com suporte a **múltiplas contas pagar.me**.

Regra central: **`1 charge.paid → N NFS-e`** — uma nota por empresa-recebedora do
split; ou **1 nota da empresa dona** da conta quando a cobrança não tem split.

A emissão é feita pelo **Focus NFe** (que guarda o certificado A1 e assina — nunca
assinamos localmente). Toda a orquestração é **Supabase-nativa** (Postgres + Edge
Functions + pg_cron + Vault + Storage). O frontend (React) é a camada de gestão.

---

## 2. Glossário

| Termo         | Significado                                                                |
| ------------- | -------------------------------------------------------------------------- |
| **conexão**   | uma conta pagar.me (`pagarme_accounts`). Tem slug, empresa dona e segredo. |
| **recebedor** | `re_…`/`rp_…` do split do pagar.me, mapeado a uma empresa.                 |
| **job**       | `invoice_jobs` — uma NFS-e pretendida (unidade de trabalho da fila).       |
| **focus_ref** | referência única enviada ao Focus (`ref`), casa o retorno ao job.          |
| **drain**     | tick do cron que drena a fila `queued` e emite.                            |
| **reconcile** | tick do cron que reconsulta jobs presos (fallback do webhook do Focus).    |

---

## 3. Arquitetura ponta a ponta

```
┌─ pagar.me ──── charge.paid (POST ?account=<slug>&secret=…)
│                         │
│                         ▼
│        Edge Function  pagarme-webhook   (verify_jwt=false)
│          · valida o segredo DA CONTA (Vault, via get_pagarme_webhook_secret)
│          · grava sales_events (idempotente por event_id)
│          · explodeChargePaid: split → N invoice_jobs  (ou 1 da empresa dona)
│                         │
│                         ▼
│                  invoice_jobs  (fila por status)
│                         │  status='queued'  (automatic) ou 'pending_review' (manual/incompleto)
│                         ▼
│   pg_cron "nfse-drain" (1 min) ─► Edge Function nfse-worker  (verify_jwt=false)
│          · claim_nfse_jobs (FOR UPDATE SKIP LOCKED)
│          · buildNfsePayload (aninhado) + token do Vault (get_focus_token)
│          · POST /v2/nfse?ref=focus_ref  ──► Focus NFe (Barueri)
│                         │
│             202/200/201 │ → status 'processing_authorization'
│             422/erro    │ → status 'rejected' (mensagem_sefaz/erros)
│                         ▼
│   Focus NFe ── webhook status (POST ?secret=FOCUS_WEBHOOK_SECRET)
│                         ▼
│        Edge Function  focus-webhook   (verify_jwt=false)
│          · grava focus_events (idempotente por hash)
│          · applyFocusDocument: atualiza job (authorized/rejected/cancelled),
│            em 'autorizado' baixa XML/DANFSe → Storage nfse-files/<company>/<ref>
│                         ▲
│   pg_cron "nfse-reconcile" (5 min) ─► nfse-worker?mode=reconcile
│          · jobs presos em processing_authorization/submitting > 10 min
│          · GET /v2/nfse/{ref} no Focus → applyFocusDocument (mesma lógica)
│
└─ Frontend /nfse  ── lê/gerencia tudo via anon key + RLS (TanStack Query)
```

**Ponto-chave de robustez:** o retorno tem **dois caminhos** que convergem na
mesma função (`applyFocusDocument`): o **webhook** (instantâneo) e o **reconcile**
(rede de segurança a cada 5 min). Se o webhook do Focus não estiver configurado ou
falhar, o reconcile resolve.

---

## 4. Banco de dados

Fonte da verdade: `supabase/migrations/`. Migrations NFS-e (em ordem):

| Migration                          | Conteúdo                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `…_nfse_schema`                    | 6 tabelas + 4 enums + RLS + triggers (timestamp/audit)                                  |
| `…_nfse_invoice_jobs_unique_plain` | índice único pleno (charge×recipient) p/ upsert idempotente                             |
| `…_nfse_worker_rpcs`               | `claim_nfse_jobs`, `get_focus_token`                                                    |
| `…_nfse_pagarme_accounts`          | tabela `pagarme_accounts` + FKs + `get_pagarme_webhook_secret`                          |
| `…_nfse_secret_rpcs`               | slug automático (trigger) + `rotate_account_webhook_secret` + `set_company_focus_token` |
| `…_nfse_storage_bucket`            | bucket `nfse-files` + RLS de leitura                                                    |
| `…_nfse_pgcron`                    | `nfse_cron_invoke` + agendamentos drain/reconcile                                       |

### 4.1 Enums

- `nfse_ambiente`: `homologacao` | `producao`
- `nfse_padrao`: `municipal` | `nacional` (usamos municipal)
- `nfse_emission_mode`: `manual` | `automatic`
- `invoice_job_status`: `pending_review` → `approved` → `queued` → `submitting` →
  `processing_authorization` → `authorized` | `rejected` | `cancelling` |
  `cancelled` | `failed`

### 4.2 Tabelas (todas com RLS)

**`pagarme_accounts`** — uma conexão pagar.me.
`id`, `organization_id`, `slug` (único, **auto** do label via trigger; default `''`),
`label`, `owner_company_id` (empresa dona; fallback p/ cobrança sem split),
`webhook_secret_ref` (nome do segredo no Vault), `ambiente`, `active`, `metadata`,
timestamps, `created_by`. RLS: `has_company_access(owner_company_id)`. Auditada.

**`fiscal_company_settings`** — config fiscal 1:1 com `companies`.
`company_id` (único), `ambiente`, `nfse_padrao`, `emission_mode`, `enabled`
(kill-switch), `focus_token_ref` (Vault), `inscricao_municipal`,
`municipio_ibge` (default `3505708` = Barueri), `item_lista_servico` (LC116),
`codigo_tributario_municipio`, `aliquota_iss` (`numeric(5,4)` — fração),
`iss_retido`, `optante_simples`, `metadata`, timestamps. RLS: `has_company_access(company_id)`.

**`pagarme_recipient_map`** — recebedor do split → empresa.
`pagarme_account_id` (FK), `pagarme_recipient_id`, `company_id`, `ambiente`,
`active`. Único por **(account_id, recipient_id)**. RLS company-scoped.

**`service_catalog`** — classificação fiscal por empresa/plano (que o pagar.me não dá).
`company_id`, `pagarme_plan_id`, `pagarme_item_code`, `descricao`,
`item_lista_servico`, `codigo_tributario_municipio`, `aliquota_iss`, `cnae`,
`active`. RLS company-scoped. (Hoje a esteira usa principalmente `fiscal_company_settings`;
`service_catalog` permite override por plano — ver `resolveService` no `split.ts`.)

**`sales_events`** — ingest bruto dos webhooks pagar.me (idempotente).
`provider`, `pagarme_account_id`, `event_id`, `event_type`, `resource_id`,
`payload` (jsonb), `received_at`, `processed_at`, `process_error`.
Único `(provider, event_id)`. RLS: **só super admin** (PII no payload).

**`invoice_jobs`** — a NFS-e pretendida (unidade de fila e de UI).
`organization_id`, `company_id`, `pagarme_account_id`, `sales_event_id`,
`pagarme_charge_id`, `pagarme_recipient_id` (null em cobrança sem split),
`focus_ref` (único, alfanumérico s/ hífen), `ambiente`, `status`,
`valor_servicos` (`numeric(18,2)`), datas da venda no pagar.me
(`charge_created_at` = a compra, `paid_at` = o pagamento que gera a nota —
normalizadas para UTC no parse, ver `pagarmeTimestamp`), snapshot do tomador
(`tomador_documento/nome/email/endereco`), classificação resolvida
(`item_lista_servico/codigo_tributario_municipio/aliquota_iss`), resultado Focus
(`focus_status/chave_nfse/numero_nfse/xml_path/danfse_path/mensagem_sefaz/erros`),
controle de fila (`attempts/next_attempt_at/last_attempt_at`), aprovação
(`approved_by/approved_at`), `transaction_id` (write-back — **não usado ainda**),
`metadata`, timestamps. Único `(pagarme_charge_id, pagarme_recipient_id)`. RLS
company-scoped. Auditada. Índices p/ fila e por charge/sales_event/account.

**`focus_events`** — ingest bruto dos webhooks Focus (idempotente).
`focus_ref`, `status`, `payload`, `dedup_key` (único = hash do payload),
`received_at`, `processed_at`, `process_error`. RLS: **só super admin**.

### 4.3 RPCs (todas `SECURITY DEFINER`, `search_path=public`)

| RPC                                              | Quem executa                 | O que faz                                                                                |
| ------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `claim_nfse_jobs(p_limit int)`                   | `service_role`               | reivindica jobs `queued` → `submitting` (FOR UPDATE SKIP LOCKED), `attempts++`           |
| `get_focus_token(p_company_id uuid)`             | `service_role`               | lê o token do Focus da empresa no Vault (via `focus_token_ref`)                          |
| `get_pagarme_webhook_secret(p_slug)`             | `service_role`               | lê o segredo de webhook da conta no Vault                                                |
| `rotate_account_webhook_secret(p_account_id)`    | `authenticated`              | gera segredo, grava no Vault, retorna **1×** (autoriza por `has_company_access` do dono) |
| `set_company_focus_token(p_company_id, p_token)` | `authenticated`              | grava o token do Focus no Vault + ref (autoriza por `has_company_access`)                |
| `nfse_set_account_slug()`                        | trigger                      | gera `slug` único do `label` no insert de `pagarme_accounts`                             |
| `nfse_cron_invoke(p_mode)`                       | cron (revogada de anon/auth) | `net.http_post` para o `nfse-worker` (drain/reconcile), lendo URL+segredo do Vault       |

**Modelo de autorização do front:** o frontend (anon key) **não** acessa o Vault.
As RPCs `rotate_account_webhook_secret` e `set_company_focus_token` são `SECURITY
DEFINER`, concedidas a `authenticated`, e **autorizam internamente** via
`has_company_access(auth.uid())` antes de tocar o Vault. As RPCs sensíveis de
leitura (`get_*`) são só `service_role` (usadas pelas Edge Functions).

---

## 5. Edge Functions (`supabase/functions/`, Deno)

Todas com `verify_jwt = false` (chamadas por terceiros/cron, sem JWT) e
protegidas por **segredo compartilhado** na URL/header. Config em `config.toml`.

### `pagarme-webhook`

- **Rota/uso:** pagar.me → `POST /functions/v1/pagarme-webhook?account=<slug>&secret=…`
- **Auth:** resolve a conta pelo slug, valida o segredo **da conta** (`get_pagarme_webhook_secret`).
- **Fluxo:** grava `sales_events` (idempotente) → carimba `pagarme_account_id` →
  `parseChargePaidWebhook` → `loadContext` (recebedores da conta + settings + services) →
  `explodeChargePaid` → upsert `invoice_jobs` (ignoreDuplicates).
- **Env:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto).

### `nfse-worker`

- **Rota/uso:** acionada por pg_cron (drain e `?mode=reconcile`) ou manual. Header `x-worker-secret`.
- **Drain:** `claim_nfse_jobs` → para cada job: monta payload + token do Vault →
  `POST /v2/nfse?ref=` no Focus → atualiza status. Exceções: backoff
  (`next_attempt_at`, 1/3/9/27… min) até `MAX_ATTEMPTS=5` → `failed`.
- **Reconcile:** jobs presos em `processing_authorization`/`submitting`/`cancelling`
  há >10 min → `GET /v2/nfse/{ref}` → `applyFocusDocument`. `cancelling` entra aqui
  porque um cancelamento de resposta ambígua tem de ser resolvido consultando o
  Focus, nunca por palpite local.
- **Env:** `NFSE_WORKER_SECRET` (+ auto).

### `focus-webhook`

- **Rota/uso:** Focus → `POST /functions/v1/focus-webhook?secret=FOCUS_WEBHOOK_SECRET`.
- **Fluxo:** grava `focus_events` (idempotente por hash) → casa job por `focus_ref`
  → `applyFocusDocument` (status + download XML/DANFSe em `autorizado`).
- **Env:** `FOCUS_WEBHOOK_SECRET` (+ auto).

### `nfse-cancel`

- **Rota/uso:** UI/operador → `POST /functions/v1/nfse-cancel` com JWT. `verify_jwt=true`
  e a function ainda exige `role = super_admin`.
- **Corpo:** `{ jobIds: string[], justificativa: string, dryRun?: boolean }`.
  `dryRun` é o **default**: só executa quem manda `dryRun: false` explicitamente.
- **Fluxo:** valida (NFS-e, `authorized`, tem `focus_ref`, justificativa 15–255) →
  `DELETE /v2/nfse/{ref}` com `{justificativa}` → `applyFocusDocument` aplica o
  status. Ambiguidade (5xx, corpo ilegível, rede caiu) → job vai a `cancelling`
  e o reconcile decide. Teto de 25 notas por chamada.
- **Por que existe:** as 21 NFS-e duplicadas emitidas em produção pelo bug da chave
  de idempotência por recebedor (migration 20260819141651). O sistema sabia
  observar cancelamento, não pedir.
- **Cuidado:** cancelamento é definitivo e algumas prefeituras não aceitam por
  webservice. Fora do mês de competência costuma exigir retificação — decisão
  contábil, não técnica.

### `_shared/nfse/` (código puro/Deno, testado por Vitest)

| Módulo        | Responsabilidade                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`    | tipos de domínio (`ChargePaidEvent`, `PagarmeAccount`, `InvoiceJobDraft`, …)                                                                      |
| `document.ts` | validação/normalização CPF/CNPJ                                                                                                                   |
| `parse.ts`    | webhook bruto do pagar.me → `ChargePaidEvent` (split aninhado, subscriptionId)                                                                    |
| `split.ts`    | `allocateShares` (maior-resto), `resolveTomador` (+gate de endereço), `explodeChargePaid`                                                         |
| `cancel.ts`   | cancelamento: validação da justificativa, caminho e leitura da resposta do Focus                                                                  |
| `address.ts`  | **endereço híbrido**: deriva logradouro/numero/bairro de `line_1` + completude; aplica a correção manual (`nfse_override`) com precedência máxima |
| `payload.ts`  | `buildNfsePayload` — corpo **aninhado** (prestador/tomador/servico) p/ o Focus                                                                    |
| `focus.ts`    | `mapFocusStatus` (puro) + `applyFocusDocument` (status→job + download) — fonte única                                                              |
| `fixtures.ts` | fixtures de teste (sem PII real)                                                                                                                  |

> **Restrição importante:** Edge Functions só importam de dentro de
> `supabase/functions/`. Código compartilhado vive em `_shared/` (Deno-puro,
> imports com extensão `.ts`). NÃO importar de `src/`. O `_shared` é validado por
> Vitest (de qualquer pasta) e pelo Deno no deploy — **não** pelo `tsc` do app.

---

## 5.1 Guardrail de estorno — o caminho de volta

A esteira nasceu de mão única (`charge.paid` → nota) e nenhum evento de estorno tocava
`invoice_jobs`. Em produção, antes da correção (23/10/2026):

- **63 NFS-e autorizadas** de cobranças estornadas — R$ 111.530,00. Em **19** delas
  (R$ 24.309,60) o estorno já estava no banco quando alguém aprovou a nota;
- **134 jobs em `pending_review`** de venda estornada — R$ 188.814,00 que um "selecionar
  todas" emitiria de uma vez.

O caso evitável é o comum, porque a OTM dá **7 dias de garantia** e espera o prazo antes
de emitir: o estorno tende a chegar _antes_ da emissão.

### Como o estado é decidido

| evento                    | status resultante | `refund_state` | o que acontece com a nota na fila |
| ------------------------- | ----------------- | -------------- | --------------------------------- |
| `charge.refunded`         | `canceled`        | `full`         | `voided` — descartada             |
| `charge.partial_canceled` | segue `paid`      | `partial`      | volta a `pending_review`, retida  |
| `charge.chargedback`      | `chargedback`     | `chargeback`   | volta a `pending_review`, retida  |

⚠️ **Nunca pelo valor.** `pagarme_charges.refunded_amount` é agregado dos payables e
chega atrasado ou nunca — 34 das 93 cobranças com `charge.refunded` apareceriam como
"parcial". A regra pura está em `_shared/pagarme/refunds.ts` (testada) e é a mesma que o
SQL usa no backfill.

### Onde a guarda mora (três camadas)

1. **`apply_charge_refund_to_jobs`** (service_role) — chamada pelo `pagarme-webhook` em
   tempo real e por `writeCharge` em todo ingest (sync/backfill), que é a rede para
   webhook perdido: `canceled`/`chargedback` vêm no próprio objeto da venda. Marca o job
   e tira da fila o que ainda não saiu. Só escala — nunca rebaixa o estado.
2. **`trg_invoice_jobs_guard_refund`** — trigger que recusa qualquer transição para
   `approved`/`queued`/`submitting` com estorno não liberado. Cobre os caminhos laterais
   (retry de nota rejeitada, revisão de tomador com reenvio, script de correção).
3. **`claim_nfse_jobs`** — o worker reconfere no último metro, fechando a janela entre
   aprovar e postar no Focus.

Mais `approve_invoice_jobs` (RPC `security invoker` que substituiu o `update` direto da
tela) devolvendo `approved`/`blocked`, para a interface dizer quantas ficaram e por quê.

### As duas saídas de uma nota retida

- `release_invoice_job_for_emission(id, motivo)` — "a nota é devida mesmo assim" (o caso
  do chargeback: serviço prestado, cliente contestou). Libera e enfileira no mesmo ato.
- `void_invoice_job(id, motivo)` — descarta. Só antes do Focus: nota autorizada se
  cancela na prefeitura (`nfse-cancel`), não aqui.

Ambas exigem motivo de 10+ caracteres, gravado em `metadata` com autor e horário.

⚠️ **`voided` ≠ `cancelled`** — a primeira nunca existiu na prefeitura; a segunda é
obrigação acessória com reflexo no ISS. A tela mostra "Descartada" e "Cancelada".

**Fora do escopo desta correção** (decisão caso a caso, não automação): as 63 notas já
autorizadas com estorno. Dentro da competência cabe cancelamento; fora, substituição ou
dedução de receita — ver as naturezas em `REFUND_STATE_META`.

---

## 6. Automação (pg_cron + pg_net)

- `nfse-drain` — `* * * * *` (1 min): `select nfse_cron_invoke('drain')`.
- `nfse-reconcile` — `*/5 * * * *` (5 min): `select nfse_cron_invoke('reconcile')`.
- `nfse_cron_invoke` lê do Vault `nfse_worker_url` e `nfse_worker_secret` e faz
  `net.http_post`. **Sem esses segredos → no-op seguro** (ex.: ambiente local).

---

## 7. Storage

- Bucket **privado** `nfse-files`. A `focus-webhook`/reconcile sobem
  `nfse-files/<company_id>/<focus_ref>.{xml,pdf}` (service role).
- RLS de leitura: `has_company_access((storage.foldername(name))[1]::uuid)` —
  o usuário só lê arquivos da empresa a que tem acesso. Download na UI via
  `createSignedUrl` (60s).

---

## 8. Segurança & segredos

**Variáveis de ambiente das Functions** (`supabase secrets set`):
`NFSE_WORKER_SECRET`, `FOCUS_WEBHOOK_SECRET`. (`PAGARME_WEBHOOK_SECRET` global é
**legado/sem uso** — o webhook do pagar.me usa segredo por conta no Vault.)
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

**Vault** (nunca em coluna/repo/log):

| Segredo (nome)                 | Conteúdo                     | Quem grava                      |
| ------------------------------ | ---------------------------- | ------------------------------- |
| `pagarme_webhook_<account_id>` | segredo do webhook da conta  | `rotate_account_webhook_secret` |
| `focus_token_<company_id>`     | token do Focus da empresa    | `set_company_focus_token`       |
| `nfse_worker_url`              | URL pública do `nfse-worker` | operador (uma vez, no remoto)   |
| `nfse_worker_secret`           | = `NFSE_WORKER_SECRET`       | operador (uma vez, no remoto)   |

**Princípios:** RLS em todas as tabelas; ingest bruto (`sales_events`/`focus_events`)
só super admin; escrita das Functions via service role (bypassa RLS); webhooks
verificam origem e são idempotentes; o front nunca vê service role nem segredo
(exceto a URL de webhook revelada **1×** ao criar/rotacionar a conexão).

> ⚠️ Tokens/segredos trocados em chat durante o desenvolvimento devem ser
> **regerados para produção**.

---

## 9. Frontend (`src/features/nfse/`, rota `/nfse`)

Item na sidebar (`FileText`). Página com 4 abas (estado na URL via nuqs):

- **Notas** (`InvoiceJobsPanel`) — fila `invoice_jobs`: filtros na URL via nuqs
  (status agrupado, ambiente, origem, conexão, busca livre e período sobre a data
  escolhida — pagamento, compra, fila ou emissão, que também ordena a lista e
  nomeia a 1ª coluna),
  detalhe (`InvoiceJobDrawer`: tomador, fiscal, resultado Focus), **aprovar**
  (`pending_review`→`queued`), **reemitir** (`rejected/failed`→`queued`), **revisar o
  tomador** (`TomadorReviewForm`: documento, nome, e-mail e endereço estruturado, com
  busca por CEP no ViaCEP e ação "salvar e reemitir") e baixar XML/DANFSe.
  **Exportar** (`export.ts`) leva TODAS as notas do filtro (não só a página, via
  `fetchAllInvoiceJobs`) em `.xlsx`, `.csv` (`;` + BOM) ou "pacote contábil"
  (ZIP com a planilha + XML/DANFSe das autorizadas). A planilha tem o bloco
  fiscal (datas, série/número, chave, protocolo, valor numérico) e o bloco do
  **tomador**: nome, documento, e-mail e o endereço **derivado** por
  `deriveTomadorEndereco` — o mesmo que a nota leva (correção manual > ViaCEP >
  parse do `line_1`), para a planilha não discordar do documento fiscal. O
  número do logradouro sai como `Número (endereço)` porque `Número` já é o da
  nota. Contém PII do tomador: é arquivo para a contabilidade, não para
  compartilhar solto.
- **Conexões pagar.me** (`ConnectionsPanel`) — CRUD de `pagarme_accounts`
  (`ConnectionDrawer`); a **URL do webhook é gerada e revelada 1×** (+ rotacionar);
  recebedores por conta (`RecipientsSheet`).
- **Configuração fiscal** (`FiscalSettingsPanel`) — por empresa (`FiscalSettingsDrawer`):
  ambiente, modo, kill-switch, IM, LC116, ISS%, Simples; **token do Focus em campo
  seguro** → Vault via RPC.
- **Webhooks** (`WebhooksPanel`) — log de debug `sales_events`/`focus_events`
  (`WebhookEventDrawer`: payload bruto + erro). Só admin (RLS).

Camadas: `api.ts` (queries/RPCs), `hooks.ts` (TanStack Query + invalidação),
`schema.ts` (Zod), `constants.ts` (metadados/URL do webhook). Sem service role no
front; tudo via anon key + RLS.

---

## 10. Fluxos end-to-end

**A) Cobrança com split (conta da Jimmy: Jimmy + RCO)**
charge.paid → 2 jobs (Jimmy e RCO), cada um com sua fatia → fila → emissão → 2 NFS-e.

**B) Cobrança sem split (conta da RCO, exclusiva)**
charge.paid sem `split[]` → 1 job da **empresa dona** (RCO), valor cheio.

**C) Tomador com endereço incompleto**
`address.ts` não consegue derivar numero/bairro/IBGE → `resolveTomador` marca
incompleto → job nasce `pending_review` (não emite endereço furado). O operador
abre a nota em `/nfse`, usa **Revisar** para completar os campos (o CEP puxa o
resto do ViaCEP, inclusive o IBGE) e **salva e reemite**. A correção fica em
`tomador_endereco.nfse_override` e vence a derivação automática na emissão.

**D) Erro de autorização**
Focus retorna `erro_autorizacao` → job `rejected` com `mensagem_sefaz`/`erros`
(visível na aba Notas) → operador corrige config e **reemite**.

**E) Webhook do Focus não chega**
`reconcile` (5 min) reconsulta `GET /v2/nfse/{ref}` e finaliza o job.

---

## 11. Decisões de design (e porquês)

- **Multi-conta pagar.me** (`pagarme_accounts`): o grupo usa contas distintas (RCO e
  Jimmy); a RCO é recebedora dentro da conta da Jimmy **e** tem conta própria.
  Cobrança sem split → empresa dona da conta.
- **Fila por status (sem pgmq):** `status='queued'` + `FOR UPDATE SKIP LOCKED` é
  suficiente e simples; sem dependência extra.
- **Segredos 100% pela UI (RPCs SECURITY DEFINER):** o front não pode tocar o Vault;
  as RPCs autorizam pelo usuário e escrevem. Evita SQL/Vault manual.
- **Slug automático** do nome (trigger), estável (não muda em updates → URL do
  webhook não quebra).
- **Endereço híbrido:** pagar.me não dá endereço estruturado; derivamos o possível e,
  se incompleto, mandamos para revisão (em vez de emitir errado).
- **Correção manual como CAMADA, não sobrescrita** (`tomador_endereco.nfse_override`):
  o payload original do pagar.me fica intacto ao lado da correção — dá para auditar
  o que veio do gateway e o que uma pessoa consertou. Precedência na emissão:
  correção manual > ViaCEP > parse de `line_1`. Campos não preenchidos seguem
  derivados. Quem revisou e o que mudou vai em `metadata.tomadorRevisao`.
- **IBGE é obrigatório no gate** (`REQUIRED_FIELDS` em `address.ts`): Barueri rejeita
  sem `codigo_municipio`, e ele só vem do ViaCEP ou da revisão manual. Antes disso o
  endereço passava por "completo" sem IBGE, o job nascia `queued` e só descobria o
  furo na rejeição do Focus.
- **Idempotência em camadas:** `sales_events(event_id)`, `invoice_jobs(charge,recipient)`,
  `focus_events(dedup_key)`.
- **Retorno com dois caminhos convergentes** (webhook + reconcile) via
  `applyFocusDocument`.
- **Write-back financeiro adiado** (decisão do dono): foco em o sistema de notas
  funcionar redondo; vincular a `transactions` fica para depois.

---

## 12. Como rodar e operar

### Local

```sh
bun run db:start && bun run db:reset                                   # stack + migrations
psql "$LOCAL_DB" -f docs/integrations/sql/nfse-fase2-local-setup.sql   # 2 contas + recebedores + settings
bun run test:run                                                       # testes do _shared
supabase functions serve pagarme-webhook --no-verify-jwt
supabase functions serve nfse-worker --no-verify-jwt
supabase functions serve focus-webhook --no-verify-jwt
bun run dev                                                            # UI em /nfse
```

### Remoto (ordem de go-live)

1. `bun run db:push` (aplica migrations).
2. `supabase functions deploy pagarme-webhook nfse-worker focus-webhook`.
3. `supabase secrets set NFSE_WORKER_SECRET=… FOCUS_WEBHOOK_SECRET=…`.
4. Vault (pg_cron): `nfse_worker_url` (= URL da function) e `nfse_worker_secret` (= env).
5. Pela **UI**: criar conexões (URL do webhook revelada 1×), recebedores, config
   fiscal + token do Focus.
6. Registrar webhooks: **pagar.me** → `pagarme-webhook?account=<slug>&secret=…`
   (por conta); **Focus** → `focus-webhook?secret=…` (por empresa/token; opcional —
   reconcile cobre).
7. Produção: regenerar segredos/tokens, virar `ambiente=producao`.

---

## 13. Como estender

- **Nova empresa:** cadastrá-la em `companies`; depois, na UI, config fiscal + token,
  e mapear seu recebedor na conexão.
- **Nova conta pagar.me:** UI → Conexões → Nova conexão (slug/URL automáticos).
- **Novo campo no payload do Focus:** `_shared/nfse/payload.ts` (+ teste).
- **Novo status do Focus:** `_shared/nfse/focus.ts` (`mapFocusStatus`).
- **Regras de classificação por plano:** `service_catalog` + `resolveService` no `split.ts`.

---

## 14. Pendências conhecidas (não bloqueiam o funcionamento)

1. **Write-back financeiro:** `invoice_jobs.transaction_id` existe mas não é populado.
2. **Cancelamento de NF-e:** não implementado (contrato próprio e prazo de 24h
   após a emissão). NFS-e já cancela — ver `nfse-cancel`.
3. **Produção:** registrar webhooks definitivos + tokens de produção.
4. **`PAGARME_WEBHOOK_SECRET` legado:** pode ser removido das secrets (sem uso).
5. **Revisão em lote:** a correção do tomador é uma nota por vez; se um lote inteiro
   cair por CEP não resolvido, hoje se corrige uma a uma.

---

## 15. Mapa de arquivos

```
supabase/
├── migrations/  …_nfse_schema, …_nfse_invoice_jobs_unique_plain, …_nfse_worker_rpcs,
│                …_nfse_pagarme_accounts, …_nfse_secret_rpcs, …_nfse_storage_bucket, …_nfse_pgcron
├── functions/
│   ├── pagarme-webhook/index.ts
│   ├── nfse-worker/index.ts        (drain + reconcile)
│   ├── focus-webhook/index.ts
│   └── _shared/nfse/  types, document, parse, split, address, payload, focus, fixtures (+ *.test.ts)
└── config.toml      ([functions.*] verify_jwt=false)
src/features/nfse/
├── api.ts hooks.ts schema.ts constants.ts
├── tomador.ts (espelho da derivação p/ a UI) · cep.ts (ViaCEP sob demanda)
├── export.ts (planilha/CSV/ZIP contábil — fiscal + tomador com endereço derivado)
└── components/  Connections{Panel,Drawer}, RecipientsSheet, FiscalSettings{Panel,Drawer},
                 InvoiceJobs{Panel}, InvoiceJobDrawer, TomadorReviewForm, Webhooks{Panel},
                 WebhookEventDrawer, FieldToggle
src/routes/nfse.tsx · src/components/layout/Sidebar.tsx (item NFS-e)
docs/integrations/  nfse-system.md (este) · nfse-pagarme-architecture.md · nfse-implementation-plan.md · sql/nfse-fase2-local-setup.sql
NFSE_STATUS.md (raiz, snapshot) · focusnfe.md · pagarme.md (refs de API)
```

---

## 16. Histórico (PRs)

#27–#29 fundação/split/`pagarme-webhook`/parser real · #30 `nfse-worker` · #31 status ·
#32 `verify_jwt=false` · #33 multi-conta · #34 UI 4a · #35 segredos pela UI ·
#36 UI fila (4b) · #37 `focus-webhook`+Storage+endereço híbrido · #38 pg_cron+reconcile ·
#39 UI webhooks (4c).

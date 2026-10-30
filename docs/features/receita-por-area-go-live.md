# Receita por área — go-live, passo a passo

> Para o dono do repositório. Cada passo diz **o que fazer**, **como conferir** e **como
> voltar atrás**. Nada aqui é feito por agente: os passos 2 a 5 mexem no remoto e
> precisam do seu OK, e a credencial do CRM não passa por chat nem por repositório.
> Contexto: [`receita-por-area.md`](receita-por-area.md).

## Ordem e por quê

| #   | Passo                                    | Onde                   | Por que nesta ordem                                                                   |
| --- | ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| 1   | Mergear o PR #86                         | GitHub                 | `db:push` só depois de PR (regra do repo).                                            |
| 2   | `db:push`                                | Supabase do financeiro | A function chama RPCs que a migration cria.                                           |
| 3   | Publicar `crm-revenue-sync`              | Supabase do financeiro | O cron e o botão chamam a URL dela.                                                   |
| 4   | Perfil e usuário de serviço              | CRM                    | A credencial tem de existir antes de ir para o Vault.                                 |
| 5   | Seis segredos no Vault                   | Supabase do financeiro | Com o Vault completo, o cron das 9h40 já roda sozinho — por isso vem depois de 2 a 4. |
| 6   | Rotas: que empresa recebe cada relatório | Tela `/receita`        | Sem rota, a sincronização não grava nada (e diz isso).                                |
| 7   | Primeira sincronização, com conferência  | SQL editor + tela      | Traz 2026 inteiro e confere contra o CRM, relatório a relatório.                      |
| 8   | Ligar código → colaborador               | Tela `/receita`        | Antes de abrir lançamentos, senão a receita aparece "sem área".                       |
| 9   | Abrir os lançamentos de 2026             | Tela `/receita`        | Só aqui a receita entra no Balanço.                                                   |
| 10  | Margem por área no Balanço               | Tela `/reports`        | —                                                                                     |

## 1. Mergear o PR

CI "Quality gates" verde. Squash merge.

## 2. `db:push`

```bash
git switch main && git pull
supabase migration list
```

Conferir que a única migration pendente no remoto é `20261027140000_receita_por_area`.
Se aparecer outra, pare e descubra de onde veio.

```bash
bun run db:push
```

A migration se confere sozinha: aborta (e nada fica aplicado) se os itens de receita ou o
de-para saírem incompletos, ou se a camada gerencial deixar de fechar com os lançamentos.

**Conferir** (SQL editor):

```sql
select count(*) from management_accounts where code like 'receitas.btg\_%';   -- 17 × organizações
select count(*) from revenue_category_map;                                     -- 32 × organizações
select jobname, schedule from cron.job where jobname = 'crm-revenue-sync';     -- 40 9 * * *
```

**Voltar atrás:** a migration só acrescenta (tabelas, colunas, funções, um ramo na view).
Sem statement aberto, a camada gerencial dá exatamente o mesmo número de antes. Para
desligar o cron: `select cron.unschedule('crm-revenue-sync');`.

## 3. Publicar a Edge Function

```bash
supabase functions deploy crm-revenue-sync
```

`verify_jwt = false` já está no `supabase/config.toml` (quem entra é conferido pelo
segredo `x-sync-secret`). **A function não usa nenhuma variável de ambiente própria**:
tudo vem do Vault (passo 5).

**Conferir:** chamar sem o segredo devolve `503 Sincronização não configurada` (Vault
ainda vazio) — e depois do passo 5, `401 Não autorizado`.

## 4. No CRM: perfil e usuário de serviço

Feito pela sessão do CRM, com o seu OK de 27/10/2026. O que precisa existir:

- um **perfil** que tenha **só** a chave `financeiro.receita_btg`;
- um **usuário** nesse perfil, com e-mail e senha próprios (não reaproveite conta de pessoa);
- a **URL** do Supabase do CRM e a **chave anon** (publishable) dele.

A senha é gerada e copiada **direto** para o Vault do financeiro no passo 5 — não vai para
chat, issue, repositório ou gerenciador de tarefas.

## 5. Seis segredos no Vault do financeiro

No SQL editor do **financeiro** (`vbeevkjenvgvnattzszt`). Digite os valores na hora; não
salve a consulta com eles.

```sql
-- 1) URL da function (é o que o cron chama)
select vault.create_secret('https://vbeevkjenvgvnattzszt.supabase.co/functions/v1/crm-revenue-sync',
                           'crm_revenue_sync_url');

-- 2) Segredo entre o cron e a function — gerado aqui dentro, não aparece em lugar nenhum
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'crm_revenue_sync_secret');

-- 3–6) O CRM e o usuário de serviço
select vault.create_secret('<URL do CRM, https://….supabase.co>', 'crm_supabase_url');
select vault.create_secret('<chave anon do CRM>',                 'crm_supabase_anon_key');
select vault.create_secret('<e-mail do usuário de serviço>',      'crm_sync_email');
select vault.create_secret('<senha do usuário de serviço>',       'crm_sync_password');
```

**Conferir** (mostra só os nomes):

```sql
select name from vault.secrets where name like 'crm\_%' order by name;   -- 6 linhas
```

Para trocar um valor depois (ex.: senha nova):
`select vault.update_secret((select id from vault.secrets where name = 'crm_sync_password'), '<nova>');`

## 6. Rotas

Tela `/receita` → aba **Sincronização** → "Que empresa recebe cada relatório":

| Tipo   | Empresa        |
| ------ | -------------- |
| PJ1    | OTM Assessoria |
| PJ2    | OTM Corretora  |
| Finder | OTM Corretora  |

Só admin edita. Depois que um tipo tem relatório gravado, a rota dele não muda mais.

## 7. Primeira sincronização, com conferência

O botão "Sincronizar agora" traz os últimos seis meses. Para a primeira carga, peça 2026
inteiro (e o fim de 2025, se quiser o histórico) no SQL editor:

```sql
select public.crm_revenue_cron_invoke('2025-10-01', '2026-10-01');
```

Acompanhe na aba Sincronização (atualiza sozinha enquanto roda) ou:

```sql
select status, period_from, period_to, result, error
from crm_sync_runs order by started_at desc limit 3;
```

**Erros esperados e o que significam:**

| Mensagem                                                             | O que fazer                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Credencial do CRM incompleta no Vault — falta: …`                   | Criar os nomes listados (passo 5).                               |
| `Login do usuário de serviço no CRM falhou: …`                       | Conferir e-mail/senha no Vault e se o usuário está ativo no CRM. |
| `o usuário de serviço do CRM não tem a chave financeiro.receita_btg` | Dar a chave ao perfil no CRM (tela de Perfis).                   |
| `Relatório do CRM não fecha — nada foi gravado. …`                   | Um relatório do CRM tem linhas ≠ total: avisar a sessão do CRM.  |
| `Contrato do CRM mudou: …`                                           | O formato da RPC mudou do lado de lá: avisar a sessão do CRM.    |

**Conferência contra o CRM.** No financeiro:

```sql
select kind, reference_month, count(*) as arquivos, sum(total_commission) as total
from crm_commission_reports where removed_at is null
group by 1, 2 order by 2, 1;
```

e no CRM, a mesma pergunta:

```sql
select kind, reference_month, count(*) as arquivos, round(sum(total_commission), 2) as total
from btg_commission_reports
where reference_month between '2025-10-01' and '2026-10-01'
group by 1, 2 order by 2, 1;
```

As duas listas têm de ser **iguais linha a linha**. E, no financeiro, cada relatório soma
as linhas dele ao centavo:

```sql
select r.file_key, r.total_commission, round(sum(l.commission), 2) as linhas
from crm_commission_reports r join crm_commission_report_lines l on l.report_id = r.id
group by r.id having round(sum(l.commission), 2) <> r.total_commission;   -- 0 linhas
```

## 8. Ligar código → colaborador

Aba **Assessores**, quadro "Código BTG → colaborador". Para cada código, a tela sugere o
colaborador pelo nome ("Ligar a …?"); confirme ou escolha na lista. A tabela sugerida está
em [`receita-por-area.md`](receita-por-area.md) §7. O **1056306** não se liga (é o balde do
CRM). Ligar código exige acesso à folha.

## 9. Abrir os lançamentos de 2026

Aba **Conferência**. Cada grupo de relatórios (empresa × tipo × mês) vem com o lançamento
sugerido e a diferença. "Abrir lançamento":

- **fecha ao centavo** → entra no Balanço na hora;
- **com diferença** → fica fora do Balanço até alguém escrever por que e clicar "Aceitar a
  diferença como linha própria". Resíduos já conhecidos: jan/26 +3.885, fev/26 +3.938,
  abr/26 −7.868, set/26 +3.045.

**Conferir** que a camada continua fechando (tem de voltar zero linhas):

```sql
select * from management_reconciliation('2025-10-01', '2026-12-31', 'accrual',
  (select array_agg(id) from companies)) where difference <> 0;
```

**Voltar atrás:** "Desfazer abertura" no card do lançamento — as linhas saem e o
lançamento volta inteiro ao Balanço.

## 10. Margem por área no Balanço

`/reports` → Balanço → editar o modelo. Para cada área:

1. linha de filtro **"Receita <área>"**: item = grupo **Receitas**, área = <área>,
   medida **líquido** (desconto do BTG é saída em item de receita);
2. linha de filtro **"Custo <área>"**: os grupos de gasto, área = <área>, medida gasto;
3. linha de fórmula **"Margem <área>"** = Receita − Custo (e, se quiser, uma de
   percentual Margem ÷ Receita).

A receita sem área (código sem colaborador, o balde 1056306 e a diferença relatório ×
nota) não entra em nenhuma linha filtrada por área. Para ela aparecer, inclua uma linha
"Receita sem área" (grupo Receitas, só "sem área") ou mantenha a linha de receita total
sem filtro de área — senão o Balanço a mostra no "Não classificado".

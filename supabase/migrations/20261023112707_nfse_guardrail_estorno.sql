-- Guardrail de estorno na esteira de NFS-e (2/2): marcador, guardas e backfill.
--
-- O PROBLEMA
-- ----------
-- A esteira nasceu de mão única: `charge.paid` vira `invoice_jobs`, e o caminho de
-- volta não existia. Nenhum evento de estorno tocava a nota. Em produção (23/10/2026):
--
--   · 63 NFS-e AUTORIZADAS de cobranças estornadas — R$ 111.530,00;
--     dessas, 19 (R$ 24.309,60) foram aprovadas DEPOIS de o estorno já estar no banco,
--     e teriam sido barradas por esta migration;
--   · 134 jobs em `pending_review` de venda já estornada — R$ 188.814,00 que um
--     "selecionar todas" emitiria de uma vez.
--
-- Agrava: a OTM dá 7 dias de garantia, então o estorno costuma chegar ANTES da emissão
-- (espera-se o prazo para emitir). O caso comum é exatamente o evitável.
--
-- O DESENHO
-- ---------
-- O estado de estorno é materializado NA PRÓPRIA NOTA (`invoice_jobs.refund_state`), e
-- não lido por join com `pagarme_charges`. Três razões:
--
--   1. RLS por módulo: quem enxerga `nfse` pode não enxergar `sales`. Um left join sob
--      `security_invoker` devolveria NULL para esse usuário, e NULL viraria "sem
--      estorno" — exatamente o silêncio que esta feature existe para eliminar.
--   2. `claim_nfse_jobs` roda como service_role num caminho quente; coluna local é
--      filtro de índice, join é trabalho por linha.
--   3. A marcação passa pelo `audit_record()` que já existe na tabela: fica a trilha de
--      quando o sistema soube do estorno e o que fez com a nota.
--
-- ⚠️ O SINAL NÃO É O VALOR. `pagarme_charges.refunded_amount` é agregado dos payables e
-- chega atrasado ou nunca (em produção, R$ 136.466,76 de payables de estorno contra
-- R$ 102.180,64 somados no campo, e 195 vendas com ele zerado apesar de terem payable).
-- A classificação lê só (evento, status) — ver `_shared/pagarme/refunds.ts`, que tem a
-- mesma tabela e é testado por Vitest.

-- ---------------------------------------------------------------------------
-- 1) O marcador na nota.
--
-- `refund_released_at` é a decisão humana registrada: "eu vi o estorno e quero emitir
-- assim mesmo". Sem ela, parcial e chargeback ficam retidos para sempre — o que é o
-- comportamento desejado, porque a decisão é contábil, não técnica.
-- ---------------------------------------------------------------------------
alter table public.invoice_jobs
  add column if not exists refund_state public.invoice_refund_state not null default 'none',
  add column if not exists refund_detected_at timestamptz,
  add column if not exists refund_released_at timestamptz,
  add column if not exists refund_released_by uuid references auth.users(id);

comment on column public.invoice_jobs.refund_state is
  'Estado do dinheiro da venda que originou a nota. Deriva de (evento, status da cobrança), nunca do valor estornado. Só escala.';
comment on column public.invoice_jobs.refund_released_at is
  'Quando um humano decidiu emitir mesmo com estorno. Enquanto nulo, parcial/chargeback não entram na fila.';

create index if not exists idx_invoice_jobs_refund
  on public.invoice_jobs (refund_state)
  where refund_state <> 'none';

-- A severidade é a ORDEM DE DECLARAÇÃO do enum (none < partial < full < chargeback), o
-- que deixa `greatest()` ser a regra de escalonamento. Se alguém reordenar o tipo, o
-- `db:reset` para aqui em vez de rebaixar estorno em silêncio.
do $$
begin
  assert 'partial'::public.invoice_refund_state > 'none'::public.invoice_refund_state;
  assert 'full'::public.invoice_refund_state > 'partial'::public.invoice_refund_state;
  assert 'chargeback'::public.invoice_refund_state > 'full'::public.invoice_refund_state;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Marcar as notas de uma cobrança estornada.
--
-- Chamada pelas Edge Functions (service_role) a cada sinal de estorno: pelo webhook em
-- tempo real e pelo sync/backfill ao reler a cobrança — o segundo é a rede para webhook
-- perdido, porque `canceled`/`chargedback` vêm no próprio objeto da venda.
--
-- O que faz com o job depende de ONDE ele está:
--   · ainda na fila (`pending_review`/`approved`/`queued`) + estorno TOTAL -> `voided`;
--   · ainda na fila + parcial/chargeback -> volta a `pending_review` (sai da fila) e
--     fica retido até alguém liberar;
--   · já no Focus (`submitting` em diante) -> só marca. A nota existe; desfazê-la é
--     cancelamento na prefeitura, que é `nfse-cancel` e exige justificativa.
--   · já liberado por um humano -> só marca. A decisão dele prevalece.
--
-- Idempotente: sem escalonamento de estado, não escreve.
-- ---------------------------------------------------------------------------
create or replace function public.apply_charge_refund_to_jobs(
  p_charge_id text,
  p_state public.invoice_refund_state
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_touched integer;
begin
  if p_charge_id is null or p_state = 'none' then
    return 0;
  end if;

  with alvo as (
    select j.id, greatest(j.refund_state, p_state) as novo_estado, j.status as status_anterior
    from public.invoice_jobs j
    where j.pagarme_charge_id = p_charge_id
      and greatest(j.refund_state, p_state) <> j.refund_state
  )
  update public.invoice_jobs j
  set refund_state = a.novo_estado,
      refund_detected_at = coalesce(j.refund_detected_at, now()),
      status = case
        -- decisão humana registrada prevalece sobre a automação
        when j.refund_released_at is not null then j.status
        when j.status in ('pending_review', 'approved', 'queued') and a.novo_estado = 'full'
          then 'voided'::public.invoice_job_status
        when j.status in ('approved', 'queued')
          then 'pending_review'::public.invoice_job_status
        else j.status
      end,
      metadata = j.metadata || jsonb_build_object(
        'refund',
        jsonb_build_object(
          'state', a.novo_estado,
          'detectedAt', now(),
          'statusAnterior', a.status_anterior
        )
      )
  from alvo a
  where j.id = a.id;

  get diagnostics v_touched = row_count;
  return v_touched;
end;
$$;

revoke all on function public.apply_charge_refund_to_jobs(text, public.invoice_refund_state)
  from public, anon, authenticated;
grant execute on function public.apply_charge_refund_to_jobs(text, public.invoice_refund_state)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3) Guarda no banco: nota estornada não entra na fila de emissão.
--
-- Existe mesmo com a RPC de aprovação abaixo fazendo a mesma checagem, porque a tela
-- não é o único caminho até `queued`: há o retry de nota rejeitada, o `db:reset` de
-- alguém, um script de correção. Emitir NFS-e é irreversível e sai do sistema — a
-- última linha de defesa fica no banco.
-- ---------------------------------------------------------------------------
create or replace function public.nfse_guard_refund_before_queue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('approved', 'queued', 'submitting')
     and old.status not in ('approved', 'queued', 'submitting')
     and new.refund_state <> 'none'
     and new.refund_released_at is null
  then
    raise exception
      'nota de venda estornada não pode ser emitida (job %, estorno %)',
      new.id, new.refund_state
      using errcode = 'check_violation',
            hint = 'libere com release_invoice_job_for_emission() ou descarte com void_invoice_job()';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoice_jobs_guard_refund on public.invoice_jobs;
create trigger trg_invoice_jobs_guard_refund
  before update on public.invoice_jobs
  for each row execute function public.nfse_guard_refund_before_queue();

-- ---------------------------------------------------------------------------
-- 4) `claim_nfse_jobs` — o worker também confere.
--
-- O estorno pode chegar DEPOIS da aprovação e antes de o worker postar no Focus: a
-- marcação acima tira o job da fila, mas um worker concorrente pode já tê-lo lido. O
-- predicado aqui fecha a janela.
--
-- O resto é idêntico à versão de `20260616191225_nfse_worker_rpcs`.
-- ---------------------------------------------------------------------------
create or replace function public.claim_nfse_jobs(p_limit int default 10)
returns setof public.invoice_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoice_jobs j
  set status = 'submitting',
      last_attempt_at = now(),
      attempts = attempts + 1
  where j.id in (
    select id
    from public.invoice_jobs
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
      -- venda estornada não vira nota, nem no último metro
      and (refund_state = 'none' or refund_released_at is not null)
    order by created_at
    for update skip locked
    limit greatest(p_limit, 0)
  )
  returning j.*;
end;
$$;

revoke all on function public.claim_nfse_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_nfse_jobs(int) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Aprovação pela tela, agora como RPC.
--
-- Era um `update` direto do cliente (`pending_review -> queued`), que não tinha como
-- distinguir "pulei a nota estornada" de "falhei". A RPC devolve a contagem dos dois
-- lados para a tela poder dizer o que não foi.
--
-- `security invoker`: a RLS de `invoice_jobs` continua valendo (escrita exige
-- `has_company_write_access`), então ninguém aprova nota de empresa alheia por aqui.
-- ---------------------------------------------------------------------------
create or replace function public.approve_invoice_jobs(p_ids uuid[])
returns table (approved integer, blocked integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_approved integer;
  v_blocked integer;
begin
  select count(*) into v_blocked
  from public.invoice_jobs
  where id = any(p_ids)
    and status = 'pending_review'
    and refund_state <> 'none'
    and refund_released_at is null;

  with aprovadas as (
    update public.invoice_jobs
    set status = 'queued',
        approved_by = auth.uid(),
        approved_at = now()
    where id = any(p_ids)
      and status = 'pending_review'
      and (refund_state = 'none' or refund_released_at is not null)
    returning 1
  )
  select count(*) into v_approved from aprovadas;

  return query select v_approved, v_blocked;
end;
$$;

revoke all on function public.approve_invoice_jobs(uuid[]) from public, anon;
grant execute on function public.approve_invoice_jobs(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) As duas saídas de uma nota retida.
--
-- `release` é "eu vi o estorno e a nota é devida mesmo assim" — o caso do chargeback,
-- onde o serviço foi prestado. `void` é "esta nota não deve existir". Ambas exigem
-- motivo escrito: daqui a seis meses, a pergunta do contador vai ser por quê.
-- ---------------------------------------------------------------------------
create or replace function public.release_invoice_job_for_emission(p_id uuid, p_motivo text)
returns public.invoice_job_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_motivo text := trim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
  v_status public.invoice_job_status;
begin
  if length(v_motivo) < 10 then
    raise exception 'motivo obrigatório (mínimo 10 caracteres)' using errcode = 'check_violation';
  end if;

  update public.invoice_jobs
  set refund_released_at = now(),
      refund_released_by = auth.uid(),
      -- liberar é a decisão de emitir: a nota vai à fila no mesmo ato
      status = case when status = 'pending_review' then 'queued'::public.invoice_job_status
                    else status end,
      approved_by = case when status = 'pending_review' then auth.uid() else approved_by end,
      approved_at = case when status = 'pending_review' then now() else approved_at end,
      metadata = metadata || jsonb_build_object(
        'refundRelease',
        jsonb_build_object('motivo', v_motivo, 'em', now(), 'por', auth.uid())
      )
  where id = p_id
    and status in ('pending_review', 'rejected', 'failed')
  returning status into v_status;

  if v_status is null then
    raise exception 'nota % não está em estado liberável', p_id using errcode = 'check_violation';
  end if;
  return v_status;
end;
$$;

create or replace function public.void_invoice_job(p_id uuid, p_motivo text)
returns public.invoice_job_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_motivo text := trim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
  v_status public.invoice_job_status;
begin
  if length(v_motivo) < 10 then
    raise exception 'motivo obrigatório (mínimo 10 caracteres)' using errcode = 'check_violation';
  end if;

  update public.invoice_jobs
  set status = 'voided',
      metadata = metadata || jsonb_build_object(
        'void',
        jsonb_build_object('motivo', v_motivo, 'em', now(), 'por', auth.uid(),
                           'statusAnterior', status)
      )
  where id = p_id
    -- nota que já saiu para o Focus não é descartada: ou existe na prefeitura (e aí é
    -- `nfse-cancel`), ou o reconcile ainda vai dizer o que houve
    and status in ('pending_review', 'approved', 'queued', 'rejected', 'failed')
  returning status into v_status;

  if v_status is null then
    raise exception 'nota % não pode ser descartada neste estado', p_id
      using errcode = 'check_violation',
            hint = 'nota autorizada se cancela na prefeitura (nfse-cancel), não aqui';
  end if;
  return v_status;
end;
$$;

revoke all on function public.release_invoice_job_for_emission(uuid, text) from public, anon;
revoke all on function public.void_invoice_job(uuid, text) from public, anon;
grant execute on function public.release_invoice_job_for_emission(uuid, text) to authenticated;
grant execute on function public.void_invoice_job(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) O clone de homologação → produção carrega o marcador.
--
-- `reemit_authorized_to_producao` copia as notas autorizadas de homologação para
-- produção. Sem levar o estorno junto, o clone nasceria limpo e a nota de uma venda
-- estornada entraria na fila DE PRODUÇÃO por um caminho lateral — exatamente o furo
-- que esta migration fecha na porta da frente.
--
-- Idêntica à versão de `20260819141651`, mais as duas colunas.
-- ---------------------------------------------------------------------------
create or replace function public.reemit_authorized_to_producao(p_account_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.invoice_jobs (
    organization_id, company_id, document_type, pagarme_account_id,
    pagarme_charge_id, pagarme_recipient_id, ambiente, status,
    valor_servicos, tomador_documento, tomador_nome, tomador_email, tomador_endereco,
    item_lista_servico, codigo_tributario_municipio, aliquota_iss, parametros, metadata,
    charge_created_at, paid_at, sales_event_id,
    refund_state, refund_detected_at
  )
  select
    src.organization_id, src.company_id, src.document_type, src.pagarme_account_id,
    src.pagarme_charge_id, src.pagarme_recipient_id,
    'producao'::nfse_ambiente, 'pending_review'::invoice_job_status,
    src.valor_servicos, src.tomador_documento, src.tomador_nome, src.tomador_email,
    src.tomador_endereco, src.item_lista_servico, src.codigo_tributario_municipio,
    src.aliquota_iss, src.parametros,
    (coalesce(src.metadata, '{}'::jsonb) - 'backfillRunId')
      || jsonb_build_object('reemittedFromJobId', src.id::text),
    src.charge_created_at, src.paid_at, src.sales_event_id,
    -- a liberação NÃO é copiada de propósito: quem decidiu emitir a nota de
    -- homologação não decidiu nada sobre a de produção
    src.refund_state, src.refund_detected_at
  from public.invoice_jobs src
  where src.pagarme_account_id = p_account_id
    and src.ambiente = 'homologacao'
    and src.status = 'authorized'
  on conflict (dedup_scope) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reemit_authorized_to_producao(uuid) from public, anon;
grant execute on function public.reemit_authorized_to_producao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Backfill: o passivo que já está no banco.
--
-- Reconstrói o marcador de todo job cuja venda tem sinal de estorno, usando as duas
-- fontes: o status atual da cobrança e os eventos brutos em `sales_events`. Em banco
-- recriado do zero (`db:reset`) não há o que casar e isto é no-op.
--
-- Em produção, no momento da escrita: 134 jobs em `pending_review` (R$ 188.814,00), dos
-- quais os de estorno total viram `voided` e o resto fica retido; mais os já
-- autorizados, que só recebem o marcador — esses são decisão caso a caso (cancelar na
-- prefeitura, substituir ou tratar como dedução de receita), não automação.
-- ---------------------------------------------------------------------------
do $$
declare
  v_marcados integer;
  v_descartados integer;
begin
  with sinal as (
    select j.id,
           greatest(
             case c.status
               when 'chargedback' then 'chargeback'::public.invoice_refund_state
               when 'canceled'    then 'full'::public.invoice_refund_state
               else 'none'::public.invoice_refund_state
             end,
             coalesce((
               select max(case e.event_type
                 when 'charge.chargedback'      then 'chargeback'::public.invoice_refund_state
                 when 'charge.refunded'         then 'full'::public.invoice_refund_state
                 when 'charge.partial_canceled' then 'partial'::public.invoice_refund_state
               end)
               from public.sales_events e
               where e.resource_id = j.pagarme_charge_id
                 and e.event_type in
                     ('charge.refunded', 'charge.chargedback', 'charge.partial_canceled')
             ), 'none'::public.invoice_refund_state),
             -- terceiro sinal, para o histórico: os eventos só foram assinados em
             -- 13/08/2026, e um estorno parcial anterior não deixou evento nem mexeu no
             -- status — mas deixou payable negativo. Sempre `partial` (o mais fraco):
             -- sem evento não dá para saber se foi total, e `partial` RETÉM em vez de
             -- descartar. Em produção são 6 notas na fila que os dois sinais acima
             -- perdem, de R$ 22,60 a R$ 2.673,00.
             case when exists (
               select 1 from public.pagarme_receivables r
               where r.pagarme_charge_id = j.pagarme_charge_id
                 and r.type in ('refund', 'chargeback')
             ) then 'partial'::public.invoice_refund_state
             else 'none'::public.invoice_refund_state end
           ) as estado,
           (
             select min(e.received_at)
             from public.sales_events e
             where e.resource_id = j.pagarme_charge_id
               and e.event_type in
                   ('charge.refunded', 'charge.chargedback', 'charge.partial_canceled')
           ) as detectado_em,
           j.status as status_anterior
    from public.invoice_jobs j
    join public.pagarme_charges c on c.pagarme_charge_id = j.pagarme_charge_id
    where j.refund_state = 'none'
  ),
  marcados as (
    update public.invoice_jobs j
    set refund_state = s.estado,
        refund_detected_at = coalesce(s.detectado_em, now()),
        status = case
          when j.status in ('pending_review', 'approved', 'queued') and s.estado = 'full'
            then 'voided'::public.invoice_job_status
          when j.status in ('approved', 'queued')
            then 'pending_review'::public.invoice_job_status
          else j.status
        end,
        metadata = j.metadata || jsonb_build_object(
          'refund',
          jsonb_build_object(
            'state', s.estado,
            'detectedAt', coalesce(s.detectado_em, now()),
            'statusAnterior', s.status_anterior,
            'origem', 'backfill_20261023'
          )
        )
    from sinal s
    where j.id = s.id and s.estado <> 'none'
    returning j.status
  )
  select count(*), count(*) filter (where status = 'voided') into v_marcados, v_descartados
  from marcados;

  raise notice 'guardrail de estorno: % notas marcadas, % descartadas', v_marcados, v_descartados;
end $$;

-- A invariante que o guardrail inteiro existe para sustentar. Vale vazia em banco novo
-- e tem de valer depois do backfill em produção.
do $$
begin
  assert not exists (
    select 1 from public.invoice_jobs
    where status in ('approved', 'queued', 'submitting', 'processing_authorization')
      and refund_state <> 'none'
      and refund_released_at is null
  ), 'guardrail de estorno: sobrou nota de venda estornada na fila de emissão';
end $$;

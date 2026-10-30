-- Descarte manual de NFS-e, em lote.
--
-- `void_invoice_job` nasceu com o guardrail de estorno (`…_nfse_guardrail_estorno`) e a
-- tela só o oferecia para nota RETIDA. Mas há nota que não deve existir sem estorno
-- nenhum — venda duplicada, cortesia, teste em produção, cobrança que a contabilidade
-- emite por fora — e a fila de revisão acumula milhares delas. Uma a uma não dá.
--
-- `void_invoice_jobs` é a implementação; `void_invoice_job` passa a ser wrapper dela, para
-- o descarte de uma nota e o de um lote não divergirem nos estados aceitos nem no que
-- gravam no metadata.
--
-- Mesmas regras de antes:
--   · motivo obrigatório (≥ 10 caracteres), gravado com autor, horário e status anterior;
--   · só antes do Focus (`pending_review|approved|queued|rejected|failed`): nota que já
--     saiu ou existe na prefeitura se cancela por `nfse-cancel`, não aqui;
--   · `security invoker`: a RLS de escrita de `invoice_jobs` continua valendo, e o trio
--     `oauth_sem_escrita_*` impede que token de OAuth descarte.

create or replace function public.void_invoice_jobs(p_ids uuid[], p_motivo text)
returns table (voided integer, skipped integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_motivo text := trim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
  v_ids uuid[] := array(select distinct unnest(coalesce(p_ids, '{}'::uuid[])));
  v_voided integer;
begin
  if length(v_motivo) < 10 then
    raise exception 'motivo obrigatório (mínimo 10 caracteres)' using errcode = 'check_violation';
  end if;

  with descartadas as (
    update public.invoice_jobs
    set status = 'voided',
        metadata = metadata || jsonb_build_object(
          'void',
          jsonb_build_object('motivo', v_motivo, 'em', now(), 'por', auth.uid(),
                             'statusAnterior', status)
        )
    where id = any(v_ids)
      and status in ('pending_review', 'approved', 'queued', 'rejected', 'failed')
    returning 1
  )
  select count(*) into v_voided from descartadas;

  -- o que não foi descartado (já no Focus, já descartado, sem acesso) volta como número:
  -- a tela diz quantas ficaram em vez de fingir que o lote inteiro saiu
  return query select v_voided, cardinality(v_ids) - v_voided;
end;
$$;

revoke all on function public.void_invoice_jobs(uuid[], text) from public, anon;
grant execute on function public.void_invoice_jobs(uuid[], text) to authenticated;

create or replace function public.void_invoice_job(p_id uuid, p_motivo text)
returns public.invoice_job_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_voided integer;
begin
  select r.voided into v_voided from public.void_invoice_jobs(array[p_id], p_motivo) r;

  if v_voided = 0 then
    raise exception 'nota % não pode ser descartada neste estado', p_id
      using errcode = 'check_violation',
            hint = 'nota autorizada se cancela na prefeitura (nfse-cancel), não aqui';
  end if;
  return 'voided'::public.invoice_job_status;
end;
$$;

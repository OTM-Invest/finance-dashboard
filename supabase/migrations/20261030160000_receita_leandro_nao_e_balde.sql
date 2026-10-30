-- =============================================================================
-- Receita por área: 1056306 volta a ser o Leandro
--
-- `…_receita_por_area` recusava o código 1056306 em `employees.btg_advisor_code`. No
-- CRM ele é o código do Leandro e TAMBÉM o padrão do importador para linha sem assessor
-- conhecido, e até a F3 de lá não havia como separar as duas coisas: ligar o código a
-- ele daria ao Leandro a receita sem dono.
--
-- Agora o CRM separa. Com `revenues.advisor_code_raw` preenchido pela reimportação de
-- 30/10/2026, `finance_commission_report_lines` devolve 1056306 só quando o arquivo do
-- BTG diz 1056306, e a linha sem dono sai como `SEM_CODIGO` (CRM,
-- `…_finance_lines_separa_balde`). Medido em produção, sob o 1056306: R$ 2.092.103,38
-- do Leandro, R$ 312.005,55 sem código e −R$ 13.347,49 de códigos fora do cadastro.
--
-- O 1056306 passa a ser um código como qualquer outro. `SEM_CODIGO` não precisa de
-- recusa própria: a coluna só aceita dígitos.
-- =============================================================================

create or replace function public.employees_btg_advisor_code_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.btg_advisor_code is null or new.deleted_at is not null then
    return new;
  end if;
  select organization_id into v_org from companies where id = new.company_id;
  -- Duas gravações simultâneas do mesmo código passariam as duas pela conferência.
  perform pg_advisory_xact_lock(hashtext('btg_advisor_code|' || v_org || '|' || new.btg_advisor_code));
  if exists (
    select 1
    from employees e
    join companies c on c.id = e.company_id
    where e.btg_advisor_code = new.btg_advisor_code
      and e.deleted_at is null
      and e.id <> new.id
      and c.organization_id = v_org
  ) then
    raise exception 'O código BTG % já está ligado a outro colaborador', new.btg_advisor_code
      using errcode = '23505';
  end if;
  return new;
end;
$$;

comment on column public.employees.btg_advisor_code is
  'Código do assessor no BTG. Liga a receita do relatório de comissão (CRM) ao colaborador e, por ele, à área atual. Único na organização. Só dígitos: a linha sem assessor vem do CRM como SEM_CODIGO e fica sem área.';

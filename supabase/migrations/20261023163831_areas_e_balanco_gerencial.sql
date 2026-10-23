-- =============================================================================
-- Fase 1 da Central de Gastos — centro de custo vira ÁREA, Balanço lê o plano gerencial
--
-- O PROBLEMA. O centro de custo respondia duas perguntas ao mesmo tempo: "para quem é o
-- gasto" (Assessores, Área de Apoio, Diretoria + TI) e "o que ele é" (Receitas, OPEX,
-- CAPEX, Impostos, Distribuição, Rendimentos). A segunda já está na conta contábil, e
-- redigitá-la a cada lançamento produziu divergência que chegava ao Balanço: a mesma
-- conta `9.03 IRRF sobre Bônus` metade em Impostos (dentro do Lucro) e metade em
-- Distribuição (fora), `6.2.27 Móveis` em OPEX e em CAPEX, publicidade abatendo receita.
--
-- O MODELO. A partir daqui:
--   · `cost_centers` significa ÁREA — Assessores, Apoio, Diretoria, Tecnologia,
--     Marketing, Comercial, Geral. Os centros de natureza são desativados;
--   · "o que é" sai do plano gerencial (`management_accounts`, Fase 0), pela conta;
--   · opex/capex é atributo do item, com exceção por lançamento em
--     `transactions.nature_override` — é onde sobrevive a decisão "isto foi CAPEX" que
--     hoje só existia no centro CAPEX;
--   · o Balanço deixa de somar centro e passa a somar FILTROS sobre essa camada
--     (`kind: "filter"` em balance/schema.ts). Os 6 modelos são reescritos no lugar.
--
-- O QUE MUDA NO NÚMERO. Só o que o plano decidiu (docs/features/central-de-gastos-plan.md
-- §2.2 e §12): IRRF s/ bônus vai para Distribuição; móveis vão para CAPEX; tarifas para o
-- resultado financeiro; publicidade e IPTU deixam de estar em Receitas/Impostos; "Receitas
-- Jimmy" deixa o "Não classificado"; Diretoria + TI se separa em Diretoria, Tecnologia e
-- Apoio (pelo cargo de cada colaborador). Nenhum lançamento muda de valor, conta, data ou
-- empresa.
--
-- A REDE DE SEGURANÇA. `cost_center_migration_log` guarda o centro anterior de cada
-- registro tocado — dá para auditar e desfazer. E a migration se confere: nenhum
-- lançamento que uma linha do Balanço contava antes pode ficar sem linha depois, e nenhum
-- pode cair em duas (§8).
-- =============================================================================

-- =============================================================================
-- 1) Natureza por lançamento
-- =============================================================================
alter table public.transactions
  add column nature_override public.expense_nature;

comment on column public.transactions.nature_override is
  'Opex/capex deste lançamento quando difere da natureza do item gerencial da conta (ex.: manutenção que foi investimento). NULL = segue o item. Só tem efeito em gasto.';

-- =============================================================================
-- 2) Log da reorganização
-- =============================================================================
create table public.cost_center_migration_log (
  id                  uuid primary key default gen_random_uuid(),
  entity              text not null check (entity in (
                        'transaction', 'recurring_template', 'employee', 'payroll_account_mapping'
                      )),
  entity_id           uuid not null,
  old_cost_center_id  uuid,
  new_cost_center_id  uuid,
  nature_override     public.expense_nature,
  migrated_at         timestamptz not null default now()
);

create index idx_cc_migration_log_entity on public.cost_center_migration_log(entity, entity_id);

comment on table public.cost_center_migration_log is
  'Centro de custo ANTERIOR de cada registro tocado pela reorganização centro → área (…_areas_e_balanco_gerencial). Trilha de auditoria e caminho de volta.';

alter table public.cost_center_migration_log enable row level security;

create policy cost_center_migration_log_sel on public.cost_center_migration_log
  for select to authenticated
  using ((select public.is_super_admin()));

create policy oauth_sem_escrita_ins on public.cost_center_migration_log
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.cost_center_migration_log
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.cost_center_migration_log
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

grant select on public.cost_center_migration_log to authenticated;

-- =============================================================================
-- 3) Camada gerencial: um lançamento por linha, com item, grupo, natureza e área
--
-- A natureza só existe em gasto: um `nature_override` esquecido num lançamento de
-- receita não vira "receita capex". `security_invoker`: a view nasce sobre
-- `transactions` e não pode furar a RLS dela.
-- =============================================================================
create view public.v_management_lines with (security_invoker = true) as
select
  t.id                     as transaction_id,
  t.company_id,
  t.account_id,
  t.accrual_date,
  t.cash_date,
  t.status,
  t.direction,
  t.amount,
  t.description,
  t.document_ref,
  t.counterparty_id,
  t.cost_center_id,
  m.management_account_id,
  m.management_group_id,
  m.management_kind,
  case when m.management_kind = 'expense' then coalesce(t.nature_override, m.nature) end
                           as nature
from public.transactions t
left join public.v_account_management_map m on m.account_id = t.account_id
where t.deleted_at is null;

comment on view public.v_management_lines is
  'Lançamentos ativos com o item do plano gerencial, o grupo, a natureza efetiva (override → item) e a área. Base do Balanço e da Central de Gastos.';

grant select on public.v_management_lines to authenticated;

-- =============================================================================
-- 4) Série mensal do Balanço
--
-- Mesma população de `cost_center_monthly_series_multi` (mesmos status e datas por
-- regime, transferência incluída — ela soma zero no "Não classificado"); muda só a
-- chave do agrupamento. A regra de que linha do Balanço soma o quê fica no cliente
-- (balance/compute.ts), testável sem banco.
-- =============================================================================
create or replace function public.management_monthly_series_multi(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null
)
returns table (
  month                  date,
  management_account_id  uuid,
  management_group_id    uuid,
  cost_center_id         uuid,
  nature                 public.expense_nature,
  revenue                numeric,
  expense                numeric,
  transaction_count      int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc(
      'month',
      case when p_basis = 'cash' then v.cash_date else v.accrual_date end
    )::date as month,
    v.management_account_id,
    v.management_group_id,
    v.cost_center_id,
    v.nature,
    sum(case when v.direction = 'inflow'  then v.amount else 0 end) as revenue,
    sum(case when v.direction = 'outflow' then v.amount else 0 end) as expense,
    count(*)::int as transaction_count
  from public.v_management_lines v
  where v.company_id = any(
          coalesce(
            p_company_ids,
            (select array_agg(c.id) from public.companies c where c.is_holding = false)
          )
        )
    and case
          when p_basis = 'cash'
            then v.status in ('settled', 'reconciled')
             and v.cash_date between p_from and p_to
          else v.status in ('settled', 'reconciled', 'pending')
             and v.accrual_date between p_from and p_to
        end
  group by 1, 2, 3, 4, 5;
$$;

comment on function public.management_monthly_series_multi(date, date, public.accounting_basis, uuid[]) is
  'Série mensal por (item gerencial, área, natureza). Fonte do Balanço gerencial. p_company_ids null = todas as empresas não-holding visíveis.';

-- =============================================================================
-- 5) Lançamentos por trás de uma célula do Balanço
--
-- O cliente já sabe, pela série, exatamente quais chaves (item, área, natureza) a linha
-- soma, e de que lado do dinheiro (`d`: a medida da linha, ou o lado não coberto no
-- "Não classificado") — e manda essas chaves. Assim o filtro "que linha soma o quê" tem UMA
-- implementação (compute.ts), e a gaveta soma o número da célula clicada por construção.
-- =============================================================================
create or replace function public.management_line_transactions(
  p_from date,
  p_to date,
  p_basis public.accounting_basis,
  p_keys jsonb,
  p_company_ids uuid[] default null,
  p_limit int default 500
)
returns table (
  id                 uuid,
  accrual_date       date,
  cash_date          date,
  description        text,
  amount             numeric,
  direction          public.transaction_direction,
  status             public.transaction_status,
  document_ref       text,
  account_code       text,
  account_name       text,
  cost_center_id     uuid,
  cost_center_name   text,
  counterparty_name  text,
  total_count        bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with keys as (
    select distinct k.m, k.a, k.n, k.d
    from jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb))
      as k(m uuid, a uuid, n public.expense_nature, d public.transaction_direction)
  ),
  matched as (
    select v.*
    from public.v_management_lines v
    join keys k
      on v.management_account_id is not distinct from k.m
     and v.cost_center_id        is not distinct from k.a
     and v.nature                is not distinct from k.n
     and (k.d is null or v.direction = k.d)
    where v.company_id = any(
            coalesce(
              p_company_ids,
              (select array_agg(c.id) from public.companies c where c.is_holding = false)
            )
          )
      and case
            when p_basis = 'cash'
              then v.status in ('settled', 'reconciled')
               and v.cash_date between p_from and p_to
            else v.status in ('settled', 'reconciled', 'pending')
               and v.accrual_date between p_from and p_to
          end
  )
  select
    x.transaction_id, x.accrual_date, x.cash_date, x.description, x.amount, x.direction,
    x.status, x.document_ref, a.code, a.name, x.cost_center_id, cc.name, cp.name,
    count(*) over ()
  from matched x
  join public.chart_of_accounts a on a.id = x.account_id
  left join public.cost_centers cc on cc.id = x.cost_center_id
  left join public.counterparties cp on cp.id = x.counterparty_id
  order by
    case when p_basis = 'cash' then x.cash_date else x.accrual_date end desc,
    x.amount desc
  limit greatest(1, least(coalesce(p_limit, 500), 2000));
$$;

comment on function public.management_line_transactions(date, date, public.accounting_basis, jsonb, uuid[], int) is
  'Lançamentos das chaves (item, área, natureza, direção) de uma linha do Balanço. p_keys = [{m, a, n, d}], d nulo = as duas direções; total_count conta tudo, mesmo acima do limite.';

-- =============================================================================
-- 6) Reorganização centro → área (por organização, idempotente)
--
-- Por nome, e não por id: os centros de produção e os do seed local são outros, e o
-- que não existe numa base simplesmente não é tocado.
--
-- Diretoria + TI vira Diretoria; quem é de tecnologia ou do escritório sai para
-- Tecnologia/Apoio pelo CARGO do colaborador (decisão do dono, plano §11.1). O cargo vem
-- do item de folha e, no lançamento pago fora da folha, do colaborador com o mesmo nome
-- da contraparte na mesma empresa.
--
-- `app.recurring_propagating`: mudar o centro de um lançamento gerado por recorrência o
-- marcaria como editado à mão e cortaria a propagação futura. O modelo da recorrência é
-- reorganizado junto, então aqui não é edição.
-- =============================================================================
create or replace function public.restructure_cost_centers_into_areas(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
  v_diretoria uuid;
  v_tecnologia uuid;
  v_apoio uuid;
  v_nature_centers uuid[];
  v_capex uuid;
  v_moved_people int := 0;
  v_cleared int := 0;
begin
  perform set_config('app.recurring_propagating', 'on', true);

  -- 6.1) Nomes das áreas: renomeia o que já é área, cria o que falta.
  update cost_centers set name = 'Apoio'
  where organization_id = p_organization_id and lower(btrim(name)) = 'área de apoio'
    and not exists (select 1 from cost_centers x where x.organization_id = p_organization_id
                    and x.is_active and lower(btrim(x.name)) = 'apoio');

  update cost_centers set name = 'Diretoria'
  where organization_id = p_organization_id and lower(btrim(name)) = 'diretoria + ti'
    and not exists (select 1 from cost_centers x where x.organization_id = p_organization_id
                    and x.is_active and lower(btrim(x.name)) = 'diretoria');

  foreach v_area in array array['Assessores', 'Apoio', 'Diretoria', 'Tecnologia', 'Marketing', 'Comercial', 'Geral']
  loop
    insert into cost_centers (organization_id, name, description, is_active)
    select p_organization_id, v_area, 'Área', true
    where not exists (select 1 from cost_centers x where x.organization_id = p_organization_id
                      and x.is_active and lower(btrim(x.name)) = lower(v_area));
  end loop;

  select id into v_diretoria from cost_centers
  where organization_id = p_organization_id and is_active and name = 'Diretoria';
  select id into v_tecnologia from cost_centers
  where organization_id = p_organization_id and is_active and name = 'Tecnologia';
  select id into v_apoio from cost_centers
  where organization_id = p_organization_id and is_active and name = 'Apoio';

  -- 6.2) Diretoria → Tecnologia/Apoio pelo cargo.
  create temporary table _area_by_role as
  with people as (
    select
      t.id as transaction_id,
      coalesce(
        pe.role,
        (select e.role from employees e
         where e.company_id = t.company_id
           and lower(btrim(e.full_name)) = lower(btrim(cp.name))
         limit 1)
      ) as role
    from transactions t
    left join payroll_items pi on pi.id = t.payroll_item_id
    left join employees pe on pe.id = pi.employee_id
    left join counterparties cp on cp.id = t.counterparty_id
    where t.cost_center_id = v_diretoria
  )
  select transaction_id,
         case
           when role ilike '%colaborador ti%' or role ilike '%gestor ti%' then v_tecnologia
           when role ilike '%gestor escrit%' then v_apoio
         end as area_id
  from people;

  insert into cost_center_migration_log (entity, entity_id, old_cost_center_id, new_cost_center_id)
  select 'transaction', r.transaction_id, v_diretoria, r.area_id
  from _area_by_role r where r.area_id is not null;

  update transactions t set cost_center_id = r.area_id
  from _area_by_role r
  where r.transaction_id = t.id and r.area_id is not null;
  get diagnostics v_moved_people = row_count;

  insert into cost_center_migration_log (entity, entity_id, old_cost_center_id, new_cost_center_id)
  select 'employee', e.id, v_diretoria,
         case when e.role ilike '%colaborador ti%' or e.role ilike '%gestor ti%' then v_tecnologia
              else v_apoio end
  from employees e
  where e.cost_center_id = v_diretoria
    and (e.role ilike '%colaborador ti%' or e.role ilike '%gestor ti%' or e.role ilike '%gestor escrit%');

  update employees e
  set cost_center_id = case
        when e.role ilike '%colaborador ti%' or e.role ilike '%gestor ti%' then v_tecnologia
        else v_apoio
      end
  where e.cost_center_id = v_diretoria
    and (e.role ilike '%colaborador ti%' or e.role ilike '%gestor ti%' or e.role ilike '%gestor escrit%');

  -- 6.3) Centros de natureza saem: a resposta deles já está no plano gerencial. CAPEX é
  -- a exceção que precisa sobreviver — vira `nature_override` no lançamento.
  select array_agg(id) into v_nature_centers
  from cost_centers
  where organization_id = p_organization_id
    and lower(btrim(name)) in (
      'opex', 'capex', 'impostos', 'rco impostos', 'distribuição de lucros', 'receitas',
      'receitas jimmy', 'rendimento de aplicações financeiras', 'rendimento aplicações',
      'transferência entre contas'
    );

  select id into v_capex from cost_centers
  where organization_id = p_organization_id and lower(btrim(name)) = 'capex'
  order by is_active desc limit 1;

  if v_nature_centers is not null then
    insert into cost_center_migration_log (entity, entity_id, old_cost_center_id, nature_override)
    select 'transaction', t.id, t.cost_center_id,
           case when t.cost_center_id = v_capex then 'capex'::public.expense_nature end
    from transactions t
    where t.cost_center_id = any(v_nature_centers);

    update transactions t
    set cost_center_id = null,
        nature_override = case when t.cost_center_id = v_capex then 'capex' else t.nature_override end
    where t.cost_center_id = any(v_nature_centers);
    get diagnostics v_cleared = row_count;

    insert into cost_center_migration_log (entity, entity_id, old_cost_center_id)
    select 'recurring_template', r.id, r.cost_center_id
    from recurring_templates r where r.cost_center_id = any(v_nature_centers);
    update recurring_templates set cost_center_id = null where cost_center_id = any(v_nature_centers);

    insert into cost_center_migration_log (entity, entity_id, old_cost_center_id)
    select 'employee', e.id, e.cost_center_id
    from employees e where e.cost_center_id = any(v_nature_centers);
    update employees set cost_center_id = null where cost_center_id = any(v_nature_centers);

    insert into cost_center_migration_log (entity, entity_id, old_cost_center_id)
    select 'payroll_account_mapping', p.id, p.cost_center_id
    from payroll_account_mappings p where p.cost_center_id = any(v_nature_centers);
    update payroll_account_mappings set cost_center_id = null
    where cost_center_id = any(v_nature_centers);

    update cost_centers set is_active = false
    where id = any(v_nature_centers) and is_active;
  end if;

  drop table _area_by_role;

  return jsonb_build_object(
    'pessoas_reclassificadas', v_moved_people,
    'lancamentos_sem_centro_de_natureza', v_cleared
  );
end;
$$;

revoke all on function public.restructure_cost_centers_into_areas(uuid) from public, anon, authenticated;

-- =============================================================================
-- 7) Reescrita de um modelo do Balanço: linhas de centro → linhas de filtro
--
-- Tradução por NOME do centro (a mesma lista do §6). Centro de área vira "Pessoas
-- daquela área"; Diretoria + TI vira duas linhas (Diretoria e Tecnologia); e área com
-- gente no escopo do modelo, mas sem linha, ganha uma — senão o custo daquelas pessoas
-- cairia em "Não classificado" (o caso do gestor de escritório na OTM Assessoria). Toda
-- linha nova entra nas fórmulas que já somavam as outras áreas, com o mesmo sinal.
--
-- Cláusula de filtro (balance/schema.ts):
--   { managementAccountIds: uuid[], areaIds: uuid[] | null, includeNoArea, nature }
-- =============================================================================
create or replace function public._clause(
  p_management_ids uuid[],
  p_area_ids uuid[],
  p_include_no_area boolean,
  p_nature text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'managementAccountIds', to_jsonb(coalesce(p_management_ids, '{}'::uuid[])),
    'areaIds', case when p_area_ids is null then 'null'::jsonb else to_jsonb(p_area_ids) end,
    'includeNoArea', coalesce(p_include_no_area, false),
    'nature', case when p_nature is null then 'null'::jsonb else to_jsonb(p_nature) end
  )
$$;

create or replace function public.rewrite_balance_model_lines(
  p_lines jsonb,
  p_organization_id uuid,
  p_company_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g_receitas uuid; g_tributos uuid; g_distribuicao uuid; g_financeiro uuid; g_pessoas uuid;
  v_opex_groups uuid[];
  v_diretoria uuid; v_tecnologia uuid;
  v_out jsonb := '[]'::jsonb;
  v_line jsonb;
  v_clauses jsonb;
  v_cc uuid;
  v_name text;
  v_split_from text;             -- id da linha que gerou a de Tecnologia
  v_split_id text;
  v_area_line_ids text[] := '{}';
  v_area_ids_with_line uuid[] := '{}';
  v_new_area_lines jsonb := '[]'::jsonb;
  v_area record;
  v_last_area_pos int := -1;
  v_pos int := 0;
  v_result jsonb := '[]'::jsonb;
  v_patches jsonb := '[]'::jsonb;   -- [{from: lineId, to: lineId}] para as fórmulas
  v_new_id text;
begin
  select id into g_receitas     from management_accounts where organization_id = p_organization_id and code = 'receitas';
  select id into g_tributos     from management_accounts where organization_id = p_organization_id and code = 'tributos';
  select id into g_distribuicao from management_accounts where organization_id = p_organization_id and code = 'distribuicao';
  select id into g_financeiro   from management_accounts where organization_id = p_organization_id and code = 'financeiro';
  select id into g_pessoas      from management_accounts where organization_id = p_organization_id and code = 'pessoas';
  select array_agg(id order by sort_order) into v_opex_groups
  from management_accounts
  where organization_id = p_organization_id and parent_id is null
    and kind = 'expense' and code <> 'pessoas';

  select id into v_diretoria  from cost_centers where organization_id = p_organization_id and is_active and name = 'Diretoria';
  select id into v_tecnologia from cost_centers where organization_id = p_organization_id and is_active and name = 'Tecnologia';

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if v_line ->> 'kind' <> 'cost_centers' then
      v_out := v_out || jsonb_build_array(v_line);
      continue;
    end if;

    v_clauses := '[]'::jsonb;
    v_split_from := null;

    for v_cc in select (jsonb_array_elements_text(v_line -> 'costCenterIds'))::uuid
    loop
      select lower(btrim(name)) into v_name from cost_centers where id = v_cc;

      if v_name in ('receitas', 'receitas jimmy') then
        v_clauses := v_clauses || jsonb_build_array(public._clause(array[g_receitas], null, false, null));
      elsif v_name in ('impostos', 'rco impostos') then
        v_clauses := v_clauses || jsonb_build_array(public._clause(array[g_tributos], null, false, null));
      elsif v_name = 'distribuição de lucros' then
        v_clauses := v_clauses || jsonb_build_array(public._clause(array[g_distribuicao], null, false, null));
      elsif v_name in ('rendimento de aplicações financeiras', 'rendimento aplicações') then
        v_clauses := v_clauses || jsonb_build_array(public._clause(array[g_financeiro], null, false, null));
      elsif v_name = 'opex' then
        -- Todo gasto opex fora de Pessoas, mais o de Pessoas que não tem área — era o que
        -- o centro OPEX somava (VA, VT, encargos lançados sem time).
        v_clauses := v_clauses
          || jsonb_build_array(public._clause(v_opex_groups, null, false, 'opex'))
          || jsonb_build_array(public._clause(array[g_pessoas], '{}'::uuid[], true, 'opex'));
      elsif v_name = 'capex' then
        v_clauses := v_clauses || jsonb_build_array(public._clause('{}'::uuid[], null, false, 'capex'));
      elsif v_name = 'transferência entre contas' then
        null;  -- transferência não é resultado; soma zero no "Não classificado"
      elsif v_cc = v_diretoria then
        v_clauses := v_clauses || jsonb_build_array(public._clause(array[g_pessoas], array[v_diretoria], false, 'opex'));
        v_area_ids_with_line := v_area_ids_with_line || v_cc;
        v_split_from := v_line ->> 'id';
      elsif v_name is null then
        raise exception 'Linha "%" referencia centro inexistente %', v_line ->> 'label', v_cc;
      else
        -- Qualquer outro centro é área.
        v_clauses := v_clauses || jsonb_build_array(public._clause(array[g_pessoas], array[v_cc], false, 'opex'));
        v_area_ids_with_line := v_area_ids_with_line || v_cc;
      end if;
    end loop;

    v_line := jsonb_build_object(
      'id', v_line -> 'id',
      'label', case when v_split_from is not null and lower(btrim(v_line ->> 'label')) = 'diretoria + ti'
                    then to_jsonb('Diretoria'::text) else v_line -> 'label' end,
      'emphasis', coalesce(v_line -> 'emphasis', 'false'::jsonb),
      'kind', 'filter',
      'measure', coalesce(v_line -> 'measure', '"net"'::jsonb),
      'clauses', v_clauses
    );
    v_out := v_out || jsonb_build_array(v_line);

    -- A linha de área é a que soma só Pessoas de áreas definidas.
    if jsonb_array_length(v_clauses) > 0 and not exists (
      select 1 from jsonb_array_elements(v_clauses) c
      where c -> 'areaIds' = 'null'::jsonb
         or jsonb_array_length(c -> 'areaIds') = 0
         or c -> 'managementAccountIds' <> jsonb_build_array(g_pessoas)
    ) then
      v_area_line_ids := v_area_line_ids || (v_line ->> 'id');
    end if;

    if v_split_from is not null and v_tecnologia is not null
       and not (v_tecnologia = any(v_area_ids_with_line)) then
      v_split_id := gen_random_uuid()::text;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'id', v_split_id,
        'label', 'Tecnologia',
        'emphasis', false,
        'kind', 'filter',
        'measure', coalesce(v_line -> 'measure', '"net"'::jsonb),
        'clauses', jsonb_build_array(public._clause(array[g_pessoas], array[v_tecnologia], false, 'opex'))
      ));
      v_patches := v_patches || jsonb_build_array(jsonb_build_object('from', v_split_from, 'to', v_split_id));
      v_area_line_ids := v_area_line_ids || v_split_id;
      v_area_ids_with_line := v_area_ids_with_line || v_tecnologia;
    end if;
  end loop;

  -- Áreas com gente no escopo e sem linha no modelo ganham linha.
  if array_length(v_area_line_ids, 1) > 0 then
    for v_area in
      select distinct cc.id, cc.name
      from transactions t
      join v_account_management_map m on m.account_id = t.account_id
      join cost_centers cc on cc.id = t.cost_center_id
      where t.deleted_at is null
        and t.company_id = any(p_company_ids)
        and m.management_group_id = g_pessoas
        and cc.is_active
        and cc.id <> all(v_area_ids_with_line)
      order by cc.name
    loop
      v_new_id := gen_random_uuid()::text;
      v_new_area_lines := v_new_area_lines || jsonb_build_array(jsonb_build_object(
        'id', v_new_id,
        'label', v_area.name,
        'emphasis', false,
        'kind', 'filter',
        'measure', 'net',
        'clauses', jsonb_build_array(public._clause(array[g_pessoas], array[v_area.id], false, 'opex'))
      ));
      -- De TODA linha de área: uma fórmula que soma só Diretoria também tem de somar a nova.
      v_patches := v_patches || (
        select jsonb_agg(jsonb_build_object('from', src, 'to', v_new_id))
        from unnest(v_area_line_ids) src
      );
    end loop;

    -- Entram logo depois da última linha de área.
    for v_pos in 0 .. jsonb_array_length(v_out) - 1 loop
      if (v_out -> v_pos ->> 'id') = any(v_area_line_ids) then
        v_last_area_pos := v_pos;
      end if;
    end loop;

    for v_pos in 0 .. jsonb_array_length(v_out) - 1 loop
      v_result := v_result || jsonb_build_array(v_out -> v_pos);
      if v_pos = v_last_area_pos then
        v_result := v_result || v_new_area_lines;
      end if;
    end loop;
    v_out := v_result;
  end if;

  -- Fórmula que somava a linha de origem passa a somar também a nova, com o mesmo sinal.
  select coalesce(jsonb_agg(
           case
             when l ->> 'kind' = 'formula' then
               jsonb_set(l, '{terms}', (l -> 'terms') || coalesce((
                 -- Uma vez por linha nova, mesmo que a fórmula some várias linhas de área.
                 select jsonb_agg(jsonb_build_object('lineId', x.to_id, 'sign', x.sign) order by x.pord)
                 from (
                   select distinct on (p ->> 'to') p ->> 'to' as to_id, t -> 'sign' as sign, pord
                   from jsonb_array_elements(l -> 'terms') t
                   join jsonb_array_elements(v_patches) with ordinality as pp(p, pord)
                     on p ->> 'from' = t ->> 'lineId'
                   where not exists (
                     select 1 from jsonb_array_elements(l -> 'terms') t2
                     where t2 ->> 'lineId' = p ->> 'to')
                   order by p ->> 'to', pord
                 ) x
               ), '[]'::jsonb))
             else l
           end
           order by ord), '[]'::jsonb)
    into v_out
  from jsonb_array_elements(v_out) with ordinality as x(l, ord);

  return v_out;
end;
$$;

revoke all on function public.rewrite_balance_model_lines(jsonb, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public._clause(uuid[], uuid[], boolean, text) from public, anon, authenticated;

-- =============================================================================
-- 8) Aplica — com a cobertura conferida antes e depois
--
-- `_line_matches` é uma SEGUNDA implementação, só desta migration, da regra de
-- compute.ts: uma conferência independente vale mais do que reusar a mesma lógica.
-- Ela é apagada no fim.
-- =============================================================================
create or replace function public._line_matches(
  p_line jsonb,
  p_management_id uuid,
  p_group_id uuid,
  p_area_id uuid,
  p_nature public.expense_nature
)
returns boolean
language sql
immutable
as $$
  select p_management_id is not null and exists (
    select 1 from jsonb_array_elements(p_line -> 'clauses') c
    where (jsonb_array_length(c -> 'managementAccountIds') = 0
           or c -> 'managementAccountIds' ? p_management_id::text
           or c -> 'managementAccountIds' ? p_group_id::text)
      and (c -> 'areaIds' = 'null'::jsonb
           or (p_area_id is null and (c ->> 'includeNoArea')::boolean)
           or (p_area_id is not null and c -> 'areaIds' ? p_area_id::text))
      and (c -> 'nature' = 'null'::jsonb or c ->> 'nature' = p_nature::text)
  )
$$;

-- Escopo de empresas de cada modelo: a própria, as do grupo, ou o consolidado.
create temporary table _model_scope as
select
  b.id as model_id,
  b.organization_id,
  case
    when b.company_id is not null then array[b.company_id]
    when b.company_group_id is not null then (
      select array_agg(gm.company_id) from public.company_group_members gm
      where gm.group_id = b.company_group_id)
    else (
      select array_agg(c.id) from public.companies c
      where c.organization_id = b.organization_id and not c.is_holding)
  end as company_ids
from public.balance_report_models b;

-- Antes: que lançamento cada modelo contava (centro numa linha de centro).
create temporary table _covered_before as
select distinct s.model_id, t.id as transaction_id
from _model_scope s
join public.balance_report_models b on b.id = s.model_id
cross join lateral jsonb_array_elements(b.lines) l
cross join lateral jsonb_array_elements_text(l -> 'costCenterIds') cc
join public.transactions t
  on t.cost_center_id = cc::uuid
 and t.company_id = any(s.company_ids)
 and t.deleted_at is null
where l ->> 'kind' = 'cost_centers';

do $$
declare
  o record;
  v_summary jsonb;
begin
  for o in select id from public.organizations loop
    v_summary := public.restructure_cost_centers_into_areas(o.id);
    raise notice 'organização %: %', o.id, v_summary;
  end loop;
end $$;

update public.balance_report_models b
set lines = public.rewrite_balance_model_lines(b.lines, s.organization_id, s.company_ids)
from _model_scope s
where s.model_id = b.id;

do $$
declare
  v_bad int;
  v_detail text;
begin
  -- Nenhuma linha de centro sobrou.
  select count(*) into v_bad
  from public.balance_report_models b, jsonb_array_elements(b.lines) l
  where l ->> 'kind' = 'cost_centers';
  assert v_bad = 0, format('%s linha(s) de centro de custo sobraram nos modelos', v_bad);

  -- Nenhum lançamento ficou num centro de natureza.
  select count(*) into v_bad
  from public.transactions t
  join public.cost_centers cc on cc.id = t.cost_center_id
  where lower(btrim(cc.name)) in (
    'opex', 'capex', 'impostos', 'rco impostos', 'distribuição de lucros', 'receitas',
    'receitas jimmy', 'rendimento de aplicações financeiras', 'rendimento aplicações',
    'transferência entre contas');
  assert v_bad = 0, format('%s lançamento(s) ainda em centro de natureza', v_bad);

  -- As conferências rodam sobre as CHAVES distintas (empresa, item, área, natureza), não
  -- lançamento a lançamento: dá o mesmo resultado e evita milhões de avaliações de jsonb.
  create temporary table _keys as
  select v.company_id, v.management_account_id, v.management_group_id, v.cost_center_id,
         v.nature, count(*) as n
  from public.v_management_lines v
  group by 1, 2, 3, 4, 5;

  -- Ninguém é contado duas vezes: um lançamento cai em no máximo UMA linha de filtro.
  select coalesce(sum(x.n), 0), string_agg(distinct x.model_id::text, ', ') into v_bad, v_detail
  from (
    select s.model_id, k.n
    from _model_scope s
    join public.balance_report_models b on b.id = s.model_id
    cross join lateral jsonb_array_elements(b.lines) l
    join _keys k on k.company_id = any(s.company_ids)
    where l ->> 'kind' = 'filter'
      and public._line_matches(l, k.management_account_id, k.management_group_id,
                               k.cost_center_id, k.nature)
    group by s.model_id, k.company_id, k.management_account_id, k.cost_center_id, k.nature, k.n
    having count(*) > 1
  ) x;
  assert v_bad = 0, format('%s lançamento(s) contados em duas linhas (modelos %s)', v_bad, v_detail);

  -- Ninguém some: o que o modelo contava antes, continua contando — salvo transferência,
  -- que não é resultado e nunca deveria ter tido linha.
  select coalesce(sum(x.n), 0), string_agg(distinct x.model_id::text, ', ') into v_bad, v_detail
  from (
    select cb.model_id, v.management_account_id, v.management_group_id, v.cost_center_id,
           v.nature, count(*) as n
    from _covered_before cb
    join public.v_management_lines v on v.transaction_id = cb.transaction_id
    where v.management_account_id is not null
    group by 1, 2, 3, 4, 5
  ) x
  join public.balance_report_models b on b.id = x.model_id
  where not exists (
    select 1 from jsonb_array_elements(b.lines) l
    where l ->> 'kind' = 'filter'
      and public._line_matches(l, x.management_account_id, x.management_group_id,
                               x.cost_center_id, x.nature)
  );
  assert v_bad = 0, format('%s lançamento(s) contados antes ficaram sem linha (modelos %s)', v_bad, v_detail);

  -- O log cobre cada lançamento que mudou de centro.
  select count(*) into v_bad
  from public.transactions t
  where exists (select 1 from public.cost_center_migration_log g
                where g.entity = 'transaction' and g.entity_id = t.id)
    and t.cost_center_id is distinct from (
      select g.new_cost_center_id from public.cost_center_migration_log g
      where g.entity = 'transaction' and g.entity_id = t.id
      order by g.migrated_at desc limit 1);
  assert v_bad = 0, format('%s lançamento(s) com centro diferente do registrado no log', v_bad);

  drop table _keys;
end $$;

drop table _covered_before;
drop table _model_scope;
drop function public._line_matches(jsonb, uuid, uuid, uuid, public.expense_nature);

-- =============================================================================
-- 9) Fundir áreas continua levando o Balanço junto
--
-- O uuid da área mora agora em `clauses[].areaIds` das linhas de filtro, não mais em
-- `costCenterIds`. Sem este remapeamento, fundir "Apoio" com "Área de Apoio" deixaria a
-- linha de Apoio apontando para área apagada e somando zero em silêncio — a mesma
-- armadilha que a migration da central global documentou para o jsonb antigo.
--
-- De carona, `app.recurring_propagating`: repor a área nos lançamentos de uma
-- recorrência não é edição manual (o modelo da recorrência é reposto junto), e sem isso
-- a fusão cortava a propagação futura deles.
-- =============================================================================
create or replace function public.merge_cost_centers(
  p_source_ids uuid[],
  p_target_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_sources uuid[];
  v_moved int := 0;
  v_count int;
begin
  if not (public.is_super_admin() or public.current_user_role() in ('admin', 'editor')) then
    raise exception 'Sem permissão para fundir áreas'
      using errcode = '42501';
  end if;

  select organization_id into v_org from public.cost_centers where id = p_target_id;
  if v_org is null then
    raise exception 'Área de destino não encontrada' using errcode = 'P0002';
  end if;

  select array_agg(cc.id) into v_sources
  from public.cost_centers cc
  where cc.id = any(p_source_ids)
    and cc.id <> p_target_id
    and cc.organization_id = v_org;

  if v_sources is null or cardinality(v_sources) = 0 then
    return 0;
  end if;

  if cardinality(v_sources) <> cardinality(array_remove(p_source_ids, p_target_id)) then
    raise exception 'Área de origem inválida ou de outra organização' using errcode = '22023';
  end if;

  perform set_config('app.recurring_propagating', 'on', true);

  update public.transactions
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);
  get diagnostics v_count = row_count;
  v_moved := v_moved + v_count;

  update public.recurring_templates
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);

  update public.employees
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);

  update public.payroll_account_mappings
  set cost_center_id = p_target_id
  where cost_center_id = any(v_sources);

  update public.balance_report_models b
  set lines = coalesce(
    (
      select jsonb_agg(
               case
                 when arr.line ->> 'kind' = 'filter' then
                   jsonb_set(arr.line, '{clauses}', coalesce((
                     select jsonb_agg(
                              case
                                when jsonb_typeof(c -> 'areaIds') = 'array' then
                                  jsonb_set(c, '{areaIds}', coalesce((
                                    select jsonb_agg(distinct
                                      case when elem = any(select unnest(v_sources)::text)
                                           then p_target_id::text else elem end)
                                    from jsonb_array_elements_text(c -> 'areaIds') elem
                                  ), '[]'::jsonb))
                                else c
                              end
                              order by cord)
                     from jsonb_array_elements(arr.line -> 'clauses') with ordinality as cl(c, cord)
                   ), '[]'::jsonb))
                 else arr.line
               end
               order by arr.ord
             )
      from jsonb_array_elements(b.lines) with ordinality as arr(line, ord)
    ),
    '[]'::jsonb
  )
  where b.organization_id = v_org
    and jsonb_array_length(b.lines) > 0;

  delete from public.cost_centers where id = any(v_sources);

  return v_moved;
end;
$$;

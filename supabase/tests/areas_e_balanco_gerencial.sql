-- Reorganização centro → área e reescrita do Balanço (migration 20261023163831).
--
-- O seed local não tem a estrutura de produção (OPEX, CAPEX, Diretoria + TI…), então a
-- migration não tem o que reorganizar no `db:reset`. Aqui uma organização de teste é
-- montada com essa estrutura e os dois passos (`restructure_cost_centers_into_areas` e
-- `rewrite_balance_model_lines`) rodam sobre ela. Cada caso decidido no plano
-- (docs/features/central-de-gastos-plan.md §2.2 e §12) tem um lançamento e um valor
-- esperado na linha para onde ele deve ir.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/areas_e_balanco_gerencial.sql
--
-- Roda em transação e termina em rollback.
\set ON_ERROR_STOP on

begin;

create temp table resultado (n serial, cenario text, obtido text);

create or replace function pg_temp.check(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is not distinct from p_want then
    insert into resultado (cenario, obtido) values (p_label, p_got::text);
  else
    raise exception 'FALHOU % → obtido %, esperado %', p_label, p_got, p_want;
  end if;
end $$;

-- Mesma regra de balance/compute.ts (`lineMatchesRow`), para somar a linha em SQL.
create or replace function pg_temp.matches(
  p_line jsonb, p_m uuid, p_g uuid, p_a uuid, p_n public.expense_nature
) returns boolean language sql immutable as $$
  select p_m is not null and exists (
    select 1 from jsonb_array_elements(p_line -> 'clauses') c
    where (jsonb_array_length(c -> 'managementAccountIds') = 0
           or c -> 'managementAccountIds' ? p_m::text
           or c -> 'managementAccountIds' ? p_g::text)
      and (c -> 'areaIds' = 'null'::jsonb
           or (p_a is null and (c ->> 'includeNoArea')::boolean)
           or (p_a is not null and c -> 'areaIds' ? p_a::text))
      and (c -> 'nature' = 'null'::jsonb or c ->> 'nature' = p_n::text)
  )
$$;

do $$
declare
  v_org uuid := gen_random_uuid();
  v_company uuid := gen_random_uuid();
  v_lines jsonb;
  v_model uuid;
  cc record;
  acc record;
  v_cc jsonb := '{}'::jsonb;
  v_acc jsonb := '{}'::jsonb;
  v_cp jsonb := '{}'::jsonb;
  v_summary jsonb;
  v_terms text;
  v_value numeric;
  v_line jsonb;
  esperado constant text[][] := array[
    ['Receitas',         '1050'],   -- inclui "Receitas Jimmy", antes não classificado
    ['OPEX',             '-210'],   -- aluguel + benefício sem área; sem móveis, sem tarifa
    ['CAPEX',            '-110'],   -- móveis (pelo item) + manutenção que era CAPEX (override)
    ['Assessores',       '-300'],
    ['Diretoria',        '-60'],    -- o sócio assessor
    ['Tecnologia',       '-90'],    -- o colaborador de TI
    ['Apoio',            '-200'],   -- a Área de Apoio + o gestor de escritório
    ['Impostos',         '-100'],   -- sem o IRRF sobre bônus
    ['Distribuição',     '-430'],   -- com o IRRF sobre bônus
    ['Rendimentos',      '20']      -- rendimento − tarifa
  ];
  i int;
begin
  insert into organizations (id, name) values (v_org, 'Org Teste Áreas');

  -- Plano mestre mínimo, cada conta já com o item que a migration do plano daria.
  for acc in
    select * from (values
      ('1.01',   'Venda de Serviços',        'revenue',           'gross_revenue',         'receitas.servicos'),
      ('2.02',   'ISS',                      'revenue_deduction', 'revenue_deductions',    'tributos.iss'),
      ('4.01',   'Custo Fixo',               'cogs',              'cogs',                  'pessoas.salario_fixo'),
      ('6.1.06', 'Vale Alimentação',         'personnel_expense', 'fixed_costs_personnel', 'pessoas.beneficios'),
      ('6.2.06', 'Aluguel',                  'operating_expense', 'fixed_costs_utilities', 'ocupacao.aluguel'),
      ('6.2.15', 'Manutenção e Reparos',     'operating_expense', 'fixed_costs_utilities', 'ocupacao.manutencao'),
      ('6.2.27', 'Diversos - Móveis',        'operating_expense', 'fixed_costs_utilities', 'equipamentos.mobiliario'),
      ('7.01',   'Rendimento',               'financial_income',  'financial_result',      'financeiro.rendimentos'),
      ('7.04',   'Tarifas Bancárias',        'financial_expense', 'financial_result',      'financeiro.tarifas'),
      ('9.01',   'Dividendos',               'dividend',          'capital_movements',     'distribuicao.dividendos'),
      ('9.03',   'IRRF sobre Bônus',         'partner_bonus',     'capital_movements',     'distribuicao.irrf_bonus'),
      ('9.08',   'Transferência',            'capital_movement',  'capital_movements',     null)
    ) as a(code, name, kind, sec, mcode)
  loop
    insert into chart_of_accounts_master
      (organization_id, code, name, kind, dre_section, is_summary, below_the_line, sign_hint, sort_order,
       management_account_id)
    values (v_org, acc.code, acc.name, acc.kind::account_kind, acc.sec::dre_section, false,
            acc.kind in ('dividend', 'partner_bonus', 'capital_movement'), '-', 0,
            (select id from management_accounts where organization_id = v_org and code = acc.mcode));
  end loop;

  -- A empresa nasce com o plano de contas copiado do mestre (trigger).
  insert into companies (id, organization_id, legal_name, trade_name)
  values (v_company, v_org, 'Empresa Teste Áreas LTDA', 'Empresa Teste');

  for acc in select id, code from chart_of_accounts where company_id = v_company loop
    v_acc := v_acc || jsonb_build_object(acc.code, acc.id);
  end loop;

  -- Os centros como estão em produção.
  for cc in
    select unnest(array[
      'Receitas', 'Receitas Jimmy', 'OPEX', 'CAPEX', 'Impostos', 'Distribuição de Lucros',
      'Rendimento de Aplicações Financeiras', 'Assessores', 'Área de Apoio', 'Diretoria + TI',
      'Transferência entre Contas'
    ]) as name
  loop
    insert into cost_centers (organization_id, name, is_active) values (v_org, cc.name, true);
    v_cc := v_cc || jsonb_build_object(cc.name,
      (select id from cost_centers where organization_id = v_org and name = cc.name));
  end loop;

  -- Três pessoas em Diretoria + TI, com os cargos de produção.
  insert into employees (company_id, full_name, role, base_salary, hire_date, cost_center_id, employee_kind)
  values
    (v_company, 'Dev Teste',    'Colaborador TI  - PJ',              1, '2025-01-01', (v_cc ->> 'Diretoria + TI')::uuid, 'pj'),
    (v_company, 'Gestor Teste', 'Area de Apoio - Gestor escritório', 1, '2025-01-01', (v_cc ->> 'Diretoria + TI')::uuid, 'partner'),
    (v_company, 'Socio Teste',  'Assessor',                          1, '2025-01-01', (v_cc ->> 'Diretoria + TI')::uuid, 'partner');

  for cc in select unnest(array['Dev Teste', 'Gestor Teste', 'Socio Teste', 'Fornecedor']) as name loop
    insert into counterparties (organization_id, name, kind) values (v_org, cc.name, 'supplier');
    v_cp := v_cp || jsonb_build_object(cc.name,
      (select id from counterparties where organization_id = v_org and name = cc.name));
  end loop;

  -- Um lançamento por caso. (centro, conta, direção, valor, contraparte)
  insert into transactions
    (company_id, account_id, cost_center_id, counterparty_id, amount, direction, status,
     accrual_date, cash_date, description)
  select v_company, (v_acc ->> x.code)::uuid, (v_cc ->> x.centro)::uuid,
         (v_cp ->> coalesce(x.cp, 'Fornecedor'))::uuid, x.valor,
         x.dir::transaction_direction, 'settled', '2026-03-10', '2026-03-10', x.descr
  from (values
    ('Receitas',                              '1.01',   'inflow',  1000, null,           'receita'),
    ('Receitas Jimmy',                        '1.01',   'inflow',    50, null,           'receita de centro duplicado'),
    ('Impostos',                              '2.02',   'outflow',  100, null,           'iss'),
    ('Impostos',                              '9.03',   'outflow',   30, null,           'irrf sobre bônus em Impostos'),
    ('OPEX',                                  '6.2.06', 'outflow',  200, null,           'aluguel'),
    ('OPEX',                                  '6.2.27', 'outflow',   40, null,           'móveis em OPEX'),
    ('OPEX',                                  '6.1.06', 'outflow',   10, null,           'vale alimentação sem time'),
    ('OPEX',                                  '7.04',   'outflow',    5, null,           'tarifa em OPEX'),
    ('CAPEX',                                 '6.2.15', 'outflow',   70, null,           'manutenção que foi investimento'),
    ('Assessores',                            '4.01',   'outflow',  300, null,           'assessores'),
    ('Área de Apoio',                         '4.01',   'outflow',  120, null,           'apoio'),
    ('Diretoria + TI',                        '4.01',   'outflow',   90, 'Dev Teste',    'dev'),
    ('Diretoria + TI',                        '4.01',   'outflow',   80, 'Gestor Teste', 'gestor de escritório'),
    ('Diretoria + TI',                        '4.01',   'outflow',   60, 'Socio Teste',  'sócio assessor'),
    ('Distribuição de Lucros',                '9.01',   'outflow',  400, null,           'dividendos'),
    ('Rendimento de Aplicações Financeiras',  '7.01',   'inflow',    25, null,           'rendimento'),
    ('Transferência entre Contas',            '9.08',   'outflow',  500, null,           'transferência saída'),
    ('Transferência entre Contas',            '9.08',   'inflow',   500, null,           'transferência entrada')
  ) as x(centro, code, dir, valor, cp, descr);

  -- O modelo como o da OTM Assessoria: sem linha de Área de Apoio.
  v_lines := jsonb_build_array(
    jsonb_build_object('id', 'rec',  'label', 'Receitas',       'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'Receitas')),
    jsonb_build_object('id', 'opex', 'label', 'OPEX',           'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'OPEX')),
    jsonb_build_object('id', 'cap',  'label', 'CAPEX',          'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'CAPEX')),
    jsonb_build_object('id', 'ass',  'label', 'Assessores',     'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'Assessores')),
    jsonb_build_object('id', 'dti',  'label', 'Diretoria + TI', 'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'Diretoria + TI')),
    jsonb_build_object('id', 'imp',  'label', 'Impostos',       'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'Impostos')),
    jsonb_build_object('id', 'luc',  'label', 'Lucro líquido',  'kind', 'formula', 'emphasis', true, 'terms', jsonb_build_array(
      jsonb_build_object('lineId', 'rec', 'sign', 1), jsonb_build_object('lineId', 'opex', 'sign', 1),
      jsonb_build_object('lineId', 'cap', 'sign', 1), jsonb_build_object('lineId', 'ass', 'sign', 1),
      jsonb_build_object('lineId', 'dti', 'sign', 1), jsonb_build_object('lineId', 'imp', 'sign', 1))),
    jsonb_build_object('id', 'ebt',  'label', 'EBITDA',         'kind', 'formula', 'emphasis', true, 'terms', jsonb_build_array(
      jsonb_build_object('lineId', 'rec', 'sign', 1), jsonb_build_object('lineId', 'opex', 'sign', 1),
      jsonb_build_object('lineId', 'ass', 'sign', 1), jsonb_build_object('lineId', 'dti', 'sign', 1))),
    jsonb_build_object('id', 'cdir', 'label', 'Custo da diretoria', 'kind', 'formula', 'emphasis', false, 'terms', jsonb_build_array(
      jsonb_build_object('lineId', 'dti', 'sign', 1))),
    jsonb_build_object('id', 'dis',  'label', 'Distribuição',   'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'Distribuição de Lucros')),
    jsonb_build_object('id', 'ren',  'label', 'Rendimentos',    'kind', 'cost_centers', 'measure', 'net', 'emphasis', false, 'costCenterIds', jsonb_build_array(v_cc -> 'Rendimento de Aplicações Financeiras'))
  );

  -- ---------------------------------------------------------------------------
  v_summary := public.restructure_cost_centers_into_areas(v_org);
  perform pg_temp.check('pessoas de Diretoria + TI reclassificadas', (v_summary ->> 'pessoas_reclassificadas')::int, 2);
  perform pg_temp.check('lançamentos tirados de centro de natureza', (v_summary ->> 'lancamentos_sem_centro_de_natureza')::int, 13);

  v_summary := public.restructure_cost_centers_into_areas(v_org);
  perform pg_temp.check('reaplicar não move ninguém', (v_summary ->> 'pessoas_reclassificadas')::int, 0);

  perform pg_temp.check('CAPEX vira override no lançamento',
    (select nature_override::text from transactions where company_id = v_company and description = 'manutenção que foi investimento'),
    'capex');
  perform pg_temp.check('colaborador de TI vai para Tecnologia',
    (select k.name from employees e join cost_centers k on k.id = e.cost_center_id where e.full_name = 'Dev Teste'),
    'Tecnologia');
  perform pg_temp.check('sócio assessor fica em Diretoria',
    (select k.name from employees e join cost_centers k on k.id = e.cost_center_id where e.full_name = 'Socio Teste'),
    'Diretoria');
  perform pg_temp.check('centro OPEX desativado',
    (select is_active from cost_centers where organization_id = v_org and name = 'OPEX'), false);
  perform pg_temp.check('log cobre todo lançamento tocado',
    (select count(*)::int from cost_center_migration_log g join transactions t on t.id = g.entity_id
     where g.entity = 'transaction' and t.company_id = v_company), 15);

  v_lines := public.rewrite_balance_model_lines(v_lines, v_org, array[v_company]);

  perform pg_temp.check('nenhuma linha de centro sobra',
    (select count(*)::int from jsonb_array_elements(v_lines) l where l ->> 'kind' = 'cost_centers'), 0);
  perform pg_temp.check('ordem das linhas',
    (select string_agg(l ->> 'label', ' | ' order by o) from jsonb_array_elements(v_lines) with ordinality x(l, o)),
    'Receitas | OPEX | CAPEX | Assessores | Diretoria | Tecnologia | Apoio | Impostos | Lucro líquido | EBITDA | Custo da diretoria | Distribuição | Rendimentos');

  -- Cada linha de filtro somada sobre a camada gerencial.
  for i in 1 .. array_length(esperado, 1) loop
    select l into v_line from jsonb_array_elements(v_lines) l where l ->> 'label' = esperado[i][1];
    select coalesce(sum(case when v.direction = 'inflow' then v.amount else -v.amount end), 0)
      into v_value
    from v_management_lines v
    where v.company_id = v_company
      and pg_temp.matches(v_line, v.management_account_id, v.management_group_id, v.cost_center_id, v.nature);
    perform pg_temp.check('linha ' || esperado[i][1], v_value, esperado[i][2]::numeric);
  end loop;

  -- Nada contado duas vezes; só a transferência sem linha.
  perform pg_temp.check('nenhum lançamento em duas linhas',
    (select count(*)::int from (
       select v.transaction_id from v_management_lines v, jsonb_array_elements(v_lines) l
       where v.company_id = v_company and l ->> 'kind' = 'filter'
         and pg_temp.matches(l, v.management_account_id, v.management_group_id, v.cost_center_id, v.nature)
       group by 1 having count(*) > 1) d), 0);
  perform pg_temp.check('sem linha só a transferência',
    (select string_agg(v.description, ', ' order by v.description) from v_management_lines v
     where v.company_id = v_company and not exists (
       select 1 from jsonb_array_elements(v_lines) l
       where l ->> 'kind' = 'filter'
         and pg_temp.matches(l, v.management_account_id, v.management_group_id, v.cost_center_id, v.nature))),
    'transferência entrada, transferência saída');

  -- As linhas novas entram nas fórmulas que já somavam as áreas.
  select string_agg(coalesce((select l2 ->> 'label' from jsonb_array_elements(v_lines) l2 where l2 ->> 'id' = t ->> 'lineId'), '?'), ',' order by o)
    into v_terms
  from jsonb_array_elements(v_lines) l, jsonb_array_elements(l -> 'terms') with ordinality x(t, o)
  where l ->> 'label' = 'EBITDA';
  perform pg_temp.check('EBITDA soma Tecnologia e Apoio', v_terms,
    'Receitas,OPEX,Assessores,Diretoria,Tecnologia,Apoio');

  -- Fórmula que soma só Diretoria (não a primeira linha de área) também recebe as novas.
  select string_agg(coalesce((select l2 ->> 'label' from jsonb_array_elements(v_lines) l2 where l2 ->> 'id' = t ->> 'lineId'), '?'), ',' order by o)
    into v_terms
  from jsonb_array_elements(v_lines) l, jsonb_array_elements(l -> 'terms') with ordinality x(t, o)
  where l ->> 'label' = 'Custo da diretoria';
  perform pg_temp.check('fórmula só de Diretoria soma as áreas novas', v_terms,
    'Diretoria,Tecnologia,Apoio');

  -- Fundir áreas leva o Balanço junto: a linha de Apoio passa a apontar para Diretoria.
  insert into auth.users (id, email, instance_id, aud, role)
  values ('22222222-2222-2222-2222-222222222222', 'super@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('22222222-2222-2222-2222-222222222222', 'Super', 'super@teste.local', 'super_admin')
  on conflict (id) do update set role = 'super_admin';
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

  insert into balance_report_models (organization_id, company_id, lines)
  values (v_org, v_company, v_lines)
  returning id into v_model;

  perform public.merge_cost_centers(
    array[(select id from cost_centers where organization_id = v_org and name = 'Apoio')],
    (select id from cost_centers where organization_id = v_org and name = 'Diretoria'));

  perform pg_temp.check('fusão repõe a área dentro das cláusulas do Balanço',
    (select (l -> 'clauses' -> 0 -> 'areaIds' ->> 0)::uuid
     from balance_report_models b, jsonb_array_elements(b.lines) l
     where b.id = v_model and l ->> 'label' = 'Apoio'),
    (select id from cost_centers where organization_id = v_org and name = 'Diretoria'));

  -- E a série do Balanço soma o mesmo que a camada.
  perform pg_temp.check('série mensal fecha com a camada',
    (select sum(revenue - expense) from management_monthly_series_multi('2026-03-01', '2026-03-31', 'accrual', array[v_company])),
    (select sum(case when direction = 'inflow' then amount else -amount end) from v_management_lines where company_id = v_company));
end $$;

select n, cenario, obtido from resultado order by n;

rollback;

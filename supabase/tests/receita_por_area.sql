-- Receita por área (migration 20261027140000).
--
-- Grava um relatório do BTG no espelho, abre o lançamento de receita com ele e confere
-- as promessas do desenho (docs/features/receita-por-area.md):
--   · o espelho só aceita relatório cujas linhas cruas somam o total;
--   · as linhas do statement somam o total do relatório AO CENTAVO (maior resto), mesmo
--     quando arredondar linha a linha não somaria;
--   · statement conferido SUBSTITUI o lançamento na camada gerencial, com o mesmo líquido;
--   · item pelo de-para, área pela área ATUAL do colaborador do código; linha sem assessor (SEM_CODIGO) e
--     código sem colaborador ficam sem área;
--   · relatório × nota divergente grava a linha de diferença e só conta depois de aceita;
--   · lançamento ou relatório que muda depois volta o statement para conferência.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/receita_por_area.sql
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

create or replace function pg_temp.raises(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  execute 'reset role';
  return 'não recusou';
exception when others then
  return 'recusou';
end $$;

-- Líquido de um lançamento na camada gerencial.
create or replace function pg_temp.layer_net(p_tx uuid) returns numeric language sql as $$
  select sum(case when direction = 'inflow' then amount else -amount end)
  from v_management_lines where transaction_id = p_tx
$$;

do $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_assessoria uuid := '00000000-0000-0000-0000-000000000011';
  v_corretora uuid := '00000000-0000-0000-0000-000000000012';
  v_report uuid := 'a0000000-0000-0000-0000-000000000001';
  v_report_pj2 uuid := 'a0000000-0000-0000-0000-000000000002';
  v_area_a uuid;
  v_area_b uuid;
  v_account uuid;
  v_account_corretora uuid;
  v_tx uuid;
  v_tx_other uuid;
  v_tx_pj2 uuid;
  v_statement uuid;
  v_marcio uuid;
  v_reports jsonb;
  v_lines jsonb;
  v_result jsonb;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values ('44444444-4444-4444-4444-444444444444', 'receita@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('44444444-4444-4444-4444-444444444444', 'Receita', 'receita@teste.local', 'super_admin')
  on conflict (id) do update set role = 'super_admin';
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

  -- Um editor só da Corretora, sem módulo de folha: não enxerga o Marcio da Assessoria.
  insert into auth.users (id, email, instance_id, aud, role)
  values ('55555555-5555-5555-5555-555555555555', 'editor@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role, visible_modules)
  values ('55555555-5555-5555-5555-555555555555', 'Editor', 'editor@teste.local', 'editor', array['financials']::data_module[])
  on conflict (id) do update set role = 'editor', visible_modules = array['financials']::data_module[];
  insert into company_access (user_id, company_id) values ('55555555-5555-5555-5555-555555555555', v_corretora);

  select id into v_area_a from cost_centers where organization_id = v_org and is_active order by name limit 1;
  select id into v_area_b from cost_centers where organization_id = v_org and is_active order by name offset 1 limit 1;
  select id into v_account from chart_of_accounts where company_id = v_assessoria and code = '1.01';
  select id into v_account_corretora from chart_of_accounts where company_id = v_corretora and code = '1.01';

  -- Colaboradores ligados pelo código.
  insert into employees (company_id, cost_center_id, full_name, base_salary, hire_date, btg_advisor_code)
  values (v_assessoria, v_area_a, 'Marcio Teste', 0, '2020-01-01', '1267653')
  returning id into v_marcio;
  insert into employees (company_id, cost_center_id, full_name, base_salary, hire_date, btg_advisor_code)
  values (v_assessoria, v_area_b, 'Kaio Teste', 0, '2020-01-01', '57253873');

  -- 1056306 é o Leandro: o CRM manda a linha sem dono como SEM_CODIGO, e esse rótulo
  -- não cabe na coluna (só dígitos).
  perform pg_temp.check('código 1056306 (Leandro) é aceito',
    pg_temp.raises(format(
      'insert into employees (company_id, full_name, base_salary, hire_date, btg_advisor_code) values (%L, %L, 0, %L, %L)',
      v_assessoria, 'Leandro Teste', '2020-01-01', '1056306')), 'não recusou');
  perform pg_temp.check('SEM_CODIGO não se liga a colaborador',
    pg_temp.raises(format(
      'insert into employees (company_id, full_name, base_salary, hire_date, btg_advisor_code) values (%L, %L, 0, %L, %L)',
      v_assessoria, 'Ninguém', '2020-01-01', 'SEM_CODIGO')), 'recusou');
  perform pg_temp.check('código repetido na organização é recusado',
    pg_temp.raises(format(
      'insert into employees (company_id, full_name, base_salary, hire_date, btg_advisor_code) values (%L, %L, 0, %L, %L)',
      v_corretora, 'Outro', '2020-01-01', '1267653')), 'recusou');

  perform pg_temp.check('código repetido em empresa que quem grava não vê é recusado',
    pg_temp.raises(format(
      'set local role authenticated; set local request.jwt.claims = %L; insert into employees (company_id, full_name, base_salary, hire_date, btg_advisor_code) values (%L, %L, 0, %L, %L)',
      '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', v_corretora, 'Duplicado', '2020-01-01', '1267653')),
    'recusou');
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

  -- Relatório PJ1 de set/2026. 3 × 0,335 = 1,005 → 1,01, mas linha a linha daria 1,02
  -- (0,34 × 3); o total é 98,01.
  v_reports := jsonb_build_array(jsonb_build_object(
    'id', v_report, 'kind', 'pj1', 'reference_month', '2026-09-01', 'period_start', '2026-09-01',
    'period_end', '2026-09-30', 'file_key', 'pj1-set', 'file_name', 'pj1.xlsx', 'row_count', 9,
    'total_commission', 98.01, 'imported_at', '2026-10-06T12:54:00Z'));
  v_lines := jsonb_build_array(
    jsonb_build_object('report_id', v_report, 'advisor_code', '1267653', 'advisor_name', 'Marcio CRM', 'advisor_active', true,
      'category', 'RENDA VARIAVEL', 'product', 'BOLSA', 'type', 'Corretagem', 'commission', 100.004, 'revenue', 200, 'net_revenue', 180, 'row_count', 3),
    jsonb_build_object('report_id', v_report, 'advisor_code', '57253873', 'advisor_name', 'Kaio CRM', 'advisor_active', true,
      'category', 'FEE DE PLATAFORMA', 'product', 'DESCONTO USO MÍNIMO', 'type', 'Desconto Uso Minimo', 'commission', -10.002, 'revenue', 0, 'net_revenue', 0, 'row_count', 1),
    jsonb_build_object('report_id', v_report, 'advisor_code', '57253873', 'advisor_name', 'Kaio CRM', 'advisor_active', true,
      'category', 'FUNDOS', 'product', 'AÇÕES', 'type', 'Taxa Adm.', 'commission', 0.335, 'revenue', 1, 'net_revenue', 1, 'row_count', 1),
    jsonb_build_object('report_id', v_report, 'advisor_code', '57253873', 'advisor_name', 'Kaio CRM', 'advisor_active', true,
      'category', 'FUNDOS', 'product', 'MULTIMERCADOS', 'type', 'Taxa Adm.', 'commission', 0.335, 'revenue', 1, 'net_revenue', 1, 'row_count', 1),
    jsonb_build_object('report_id', v_report, 'advisor_code', '57253873', 'advisor_name', 'Kaio CRM', 'advisor_active', true,
      'category', 'FUNDOS', 'product', 'RENDA FIXA', 'type', 'Taxa Adm.', 'commission', 0.335, 'revenue', 1, 'net_revenue', 1, 'row_count', 1),
    jsonb_build_object('report_id', v_report, 'advisor_code', 'SEM_CODIGO', 'advisor_name', 'Sem assessor CRM', 'advisor_active', null,
      'category', 'RENDA VARIAVEL', 'product', 'BOLSA', 'type', 'Corretagem', 'commission', 5.003, 'revenue', 10, 'net_revenue', 9, 'row_count', 1),
    jsonb_build_object('report_id', v_report, 'advisor_code', '99999', 'advisor_name', 'Sem cadastro', 'advisor_active', false,
      'category', 'CATEGORIA NOVA', 'product', 'X', 'type', 'Y', 'commission', 2.001, 'revenue', 2, 'net_revenue', 2, 'row_count', 1));

  perform pg_temp.check('espelho recusa relatório cujas linhas não somam o total',
    pg_temp.raises(format('select crm_commission_sync_apply(%L, %L, %L, %L::jsonb, %L::jsonb)',
      v_org, '2026-09-01', '2026-09-01', jsonb_set(v_reports, '{0,total_commission}', '98.02'), v_lines)),
    'recusou');

  v_result := crm_commission_sync_apply(v_org, '2026-09-01', '2026-09-01', v_reports, v_lines);
  perform pg_temp.check('espelho grava o relatório novo', v_result ->> 'created', '1');
  v_result := crm_commission_sync_apply(v_org, '2026-09-01', '2026-09-01', v_reports, v_lines);
  perform pg_temp.check('ressincronizar igual não mexe', v_result ->> 'unchanged', '1');
  perform pg_temp.check('relatório cai na empresa da rota (pj1 → Assessoria)',
    (select company_id from crm_commission_reports where id = v_report), v_assessoria);

  -- Um PJ2 do mesmo mês, para a Corretora.
  perform crm_commission_sync_apply(v_org, '2026-09-01', '2026-09-01',
    v_reports || jsonb_build_array(jsonb_build_object(
      'id', v_report_pj2, 'kind', 'pj2', 'reference_month', '2026-09-01', 'period_start', null,
      'period_end', null, 'file_key', 'pj2-set', 'file_name', null, 'row_count', 1,
      'total_commission', 50.00, 'imported_at', null)),
    v_lines || jsonb_build_array(jsonb_build_object('report_id', v_report_pj2, 'advisor_code', '1267653',
      'advisor_name', 'Marcio CRM', 'advisor_active', true, 'category', 'CONTA VIRADA', 'product', 'CONTA VIRADA',
      'type', 'Juros', 'commission', 50, 'revenue', 50, 'net_revenue', 50, 'row_count', 1)));

  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (v_assessoria, v_account, 98.01, 'inflow', 'settled', '2026-09-01', '2026-10-07', 'comissão ref setembro')
  returning id into v_tx;
  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (v_assessoria, v_account, 10.00, 'inflow', 'settled', '2026-09-01', '2026-10-07', 'outra receita')
  returning id into v_tx_other;
  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (v_corretora, v_account_corretora, 50.00, 'inflow', 'settled', '2026-09-01', '2026-10-07', 'comissão ref setembro')
  returning id into v_tx_pj2;

  perform pg_temp.check('pendente aparece antes de abrir',
    (select count(*)::int from pending_revenue_transactions(array[v_assessoria]) where id = v_tx), 1);
  perform pg_temp.check('relatório de outra empresa é recusado',
    pg_temp.raises(format('select save_revenue_statement(%L, %L::uuid[])', v_tx, array[v_report_pj2])), 'recusou');
  perform pg_temp.check('relatórios de tipos diferentes são recusados',
    pg_temp.raises(format('select save_revenue_statement(%L, %L::uuid[])', v_tx_pj2, array[v_report, v_report_pj2])), 'recusou');

  -- Abre e fecha ao centavo.
  v_result := save_revenue_statement(v_tx, array[v_report]);
  v_statement := (v_result ->> 'id')::uuid;
  perform pg_temp.check('relatório que soma o lançamento fica reconciled', v_result ->> 'status', 'reconciled');
  perform pg_temp.check('linhas somam o total do relatório ao centavo',
    (select sum(amount) from revenue_statement_lines where statement_id = v_statement), 98.01);
  perform pg_temp.check('maior resto: as três de 0,335 viram 0,34 + 0,34 + 0,33',
    (select string_agg(amount::text, ',' order by amount desc, product) from revenue_statement_lines
     where statement_id = v_statement and category = 'FUNDOS'), '0.34,0.34,0.33');
  perform pg_temp.check('mesmo relatório não abre outro lançamento',
    pg_temp.raises(format('select save_revenue_statement(%L, %L::uuid[])', v_tx_other, array[v_report])), 'recusou');
  perform pg_temp.check('aberto sai dos pendentes',
    (select count(*)::int from pending_revenue_transactions(array[v_assessoria]) where id = v_tx), 0);

  -- A camada troca o lançamento pelas linhas, com o mesmo líquido.
  perform pg_temp.check('só as linhas representam o lançamento',
    (select string_agg(distinct source, ',') from v_management_lines where transaction_id = v_tx), 'revenue');
  perform pg_temp.check('líquido na camada = lançamento', pg_temp.layer_net(v_tx), 98.01);
  perform pg_temp.check('bolsa do Marcio cai no item e na área dele',
    (select ma.code || '@' || (v.cost_center_id = v_area_a)::text from v_management_lines v
     join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and v.description like 'Marcio CRM%'), 'receitas.btg_bolsa@true');
  perform pg_temp.check('desconto do BTG é saída em Deduções',
    (select ma.code || ':' || v.direction::text || ':' || v.amount from v_management_lines v
     join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and v.description like '%FEE DE PLATAFORMA%'), 'receitas.btg_deducoes:outflow:10.00');
  perform pg_temp.check('linha sem assessor (SEM_CODIGO) fica sem área',
    (select cost_center_id from v_management_lines where transaction_id = v_tx and description like 'Sem assessor CRM%'),
    null::uuid);
  perform pg_temp.check('combinação sem regra cai em Outras e é marcada',
    (select ma.code || ':' || r.is_unmapped from v_revenue_lines r join management_accounts ma on ma.id = r.management_account_id
     where r.statement_id = v_statement and r.category = 'CATEGORIA NOVA'), 'receitas.btg_outras:true');
  perform pg_temp.check('camada continua fechando com os lançamentos',
    (select count(*)::int from management_reconciliation('2026-09-01', '2026-09-30', 'accrual', array[v_assessoria])
     where difference <> 0), 0);
  perform pg_temp.check('quebra por área soma o mesmo que a camada',
    (select sum(amount) from revenue_breakdown_multi('2026-09-01', '2026-09-30', 'accrual', array[v_assessoria])), 98.01);
  perform pg_temp.check('Balanço: receita da área do Marcio no item bolsa',
    (select sum(revenue - expense) from management_monthly_series_multi('2026-09-01', '2026-09-30', 'accrual', array[v_assessoria]) s
     join management_accounts ma on ma.id = s.management_account_id
     where ma.code = 'receitas.btg_bolsa' and s.cost_center_id = v_area_a), 100.00);

  -- Área é a ATUAL: mudar o colaborador de área move a receita na hora.
  update employees set cost_center_id = v_area_b where id = v_marcio;
  perform pg_temp.check('mudar a área do colaborador move a receita',
    (select cost_center_id = v_area_b from v_management_lines where transaction_id = v_tx and description like 'Marcio CRM%'), true);

  -- Escrita direta não é concedida.
  perform pg_temp.check('usuário não marca statement como conferido direto',
    pg_temp.raises(format('set local role authenticated; update revenue_statements set status = %L where id = %L', 'reconciled', v_statement)),
    'recusou');
  perform pg_temp.check('usuário não insere linha direto',
    pg_temp.raises(format('set local role authenticated; insert into revenue_statement_lines (statement_id, company_id, line_kind, amount) values (%L, %L, %L, 1)', v_statement, v_assessoria, 'difference')),
    'recusou');

  -- D1: relatório × nota divergente. O lançamento pago foi 100,00.
  update transactions set amount = 100.00 where id = v_tx;
  perform pg_temp.check('mudar o lançamento reabre o statement',
    (select status::text from revenue_statements where id = v_statement), 'needs_review');
  perform pg_temp.check('e o lançamento volta inteiro',
    (select string_agg(source, ',') from v_management_lines where transaction_id = v_tx), 'ledger');

  v_result := save_revenue_statement(v_tx, array[v_report], p_replace => true);
  v_statement := (v_result ->> 'id')::uuid;
  perform pg_temp.check('diferença fica needs_review', v_result ->> 'status', 'needs_review');
  perform pg_temp.check('linha de diferença faz fechar',
    (select amount from revenue_statement_lines where statement_id = v_statement and line_kind = 'difference'), 1.99);
  perform pg_temp.check('não conferido não abre', pg_temp.layer_net(v_tx), 100.00);
  update transactions set direction = 'outflow' where id = v_tx;
  perform pg_temp.check('aceite recusado se o lançamento virou saída',
    pg_temp.raises(format('select accept_revenue_statement_difference(%L, %L)', v_statement, 'Nota emitida com o valor pago')),
    'recusou');
  update transactions set direction = 'inflow' where id = v_tx;
  perform pg_temp.check('aceitar exige justificativa',
    pg_temp.raises(format('select accept_revenue_statement_difference(%L, %L)', v_statement, 'ok')), 'recusou');
  perform accept_revenue_statement_difference(v_statement, 'Nota emitida com o valor pago pelo BTG');
  perform pg_temp.check('aceita, entra no Balanço',
    (select string_agg(distinct source, ',') from v_management_lines where transaction_id = v_tx), 'revenue');
  perform pg_temp.check('com o líquido do lançamento', pg_temp.layer_net(v_tx), 100.00);
  perform pg_temp.check('diferença sem área, no item próprio',
    (select ma.code || ':' || coalesce(v.cost_center_id::text, 'sem área') from v_management_lines v
     join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and v.description = 'Diferença relatório × nota'), 'receitas.btg_diferenca:sem área');

  -- O CRM reimportou o relatório: o statement volta para conferência.
  perform crm_commission_sync_apply(v_org, '2026-09-01', '2026-09-01',
    jsonb_set(v_reports, '{0,total_commission}', '98.02'),
    jsonb_set(v_lines, '{6,commission}', '2.011'));
  perform pg_temp.check('relatório que mudou no CRM reabre o statement',
    (select status::text || ':' || (difference_accepted_at is null)::text from revenue_statements where id = v_statement),
    'needs_review:true');
  perform pg_temp.check('aceite antigo não vale com relatório mudado',
    pg_temp.raises(format('select accept_revenue_statement_difference(%L, %L)', v_statement, 'Nota emitida com o valor pago')),
    'recusou');

  perform pg_temp.check('CRM vazio numa janela com relatórios não apaga nada',
    pg_temp.raises(format('select crm_commission_sync_apply(%L, %L, %L, %L::jsonb, %L::jsonb)',
      v_org, '2026-09-01', '2026-09-01', '[]', '[]')), 'recusou');

  -- Relatório que some do CRM na janela sincronizada é marcado (veio o PJ2, não o PJ1).
  perform crm_commission_sync_apply(v_org, '2026-09-01', '2026-09-01',
    jsonb_build_array(jsonb_build_object(
      'id', v_report_pj2, 'kind', 'pj2', 'reference_month', '2026-09-01', 'period_start', null,
      'period_end', null, 'file_key', 'pj2-set', 'file_name', null, 'row_count', 1,
      'total_commission', 50.00, 'imported_at', null)),
    jsonb_build_array(jsonb_build_object('report_id', v_report_pj2, 'advisor_code', '1267653',
      'advisor_name', 'Marcio CRM', 'advisor_active', true, 'category', 'CONTA VIRADA', 'product', 'CONTA VIRADA',
      'type', 'Juros', 'commission', 50, 'revenue', 50, 'net_revenue', 50, 'row_count', 1)));
  perform pg_temp.check('relatório que sumiu do CRM é marcado removed',
    (select removed_at is not null from crm_commission_reports where id = v_report), true);
  perform pg_temp.check('relatório removido não monta statement',
    pg_temp.raises(format('select save_revenue_statement(%L, %L::uuid[], true)', v_tx, array[v_report])), 'recusou');

  -- Desfazer devolve o lançamento inteiro.
  perform delete_revenue_statement(v_statement);
  perform pg_temp.check('apagar o statement devolve o lançamento',
    (select string_agg(source, ',') from v_management_lines where transaction_id = v_tx), 'ledger');

  perform pg_temp.check('saída não recebe relatório',
    pg_temp.raises(format('update transactions set direction = %L where id = %L; select save_revenue_statement(%L, %L::uuid[])',
      'outflow', v_tx_pj2, v_tx_pj2, array[v_report_pj2])), 'recusou');
end $$;

select n, cenario, obtido from resultado order by n;

rollback;

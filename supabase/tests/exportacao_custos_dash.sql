-- Exportação de custos para o RCO Dash (migration 20261030170000).
--
-- Confere que só sai o que está na lista:
--   · fornecedor da lista na empresa da lista sai, por mês, em centavos, com IOF;
--   · o mesmo fornecedor em outra empresa (fora da lista) não sai;
--   · fornecedor fora da lista não sai, nem gasto sem fornecedor;
--   · estorno reduz; mês sem gasto não aparece;
--   · período inválido ou longo demais é recusado;
--   · usuário logado não executa a função nem lê a lista (só service role / super admin).
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/exportacao_custos_dash.sql
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

create or replace function pg_temp.line(
  p_descr text, p_cents int, p_kind text default 'purchase', p_iof_cents int default 0
) returns jsonb language sql as $$
  select jsonb_build_object(
    'cardLast4', '8101', 'purchaseDate', '2026-08-10', 'description', p_descr, 'kind', p_kind,
    'amountCents', p_cents, 'currency', 'BRL', 'amountOriginalCents', null, 'fxRate', null,
    'iofCents', p_iof_cents, 'installmentN', null, 'installmentTotal', null);
$$;

-- Lança a fatura (6.2.28) e grava as compras.
create or replace function pg_temp.fatura(p_company uuid, p_month date, p_lines jsonb)
returns uuid language plpgsql as $$
declare
  v_total int;
  v_tx uuid;
begin
  select sum(case when l ->> 'kind' = 'refund' then -1 else 1 end
             * ((l ->> 'amountCents')::int + (l ->> 'iofCents')::int))
  into v_total from jsonb_array_elements(p_lines) l;

  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (p_company, (select id from chart_of_accounts where company_id = p_company and code = '6.2.28'),
          v_total / 100.0, 'outflow', 'settled', p_month, p_month + 40, 'fatura exportação')
  returning id into v_tx;

  return (public.save_card_statement(v_tx, jsonb_build_object(
    'issuer', 'c6', 'closingDate', (p_month + 23)::text, 'dueDate', (p_month + 30)::text,
    'totalCents', v_total, 'summary', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'cards', jsonb_build_array(jsonb_build_object(
      'last4', '8101', 'holderName', 'ANA TESTE', 'kind', 'physical', 'subtotalCents', v_total)),
    'lines', p_lines)) ->> 'id')::uuid;
end $$;

do $$
declare
  v_rco uuid := '00000000-0000-0000-0000-000000000013';
  v_assessoria uuid := '00000000-0000-0000-0000-000000000011';
  v_outra uuid := '00000000-0000-0000-0000-000000000014';
  v_err text;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values ('66666666-6666-6666-6666-666666666666', 'export@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('66666666-6666-6666-6666-666666666666', 'Export', 'export@teste.local', 'super_admin')
  on conflict (id) do update set role = 'super_admin';
  perform set_config('request.jwt.claims',
    '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);

  perform pg_temp.check('a lista da migration entrou para as empresas que existem',
    (select count(*)::int from dash_cost_vendors where company_id in (v_rco, v_assessoria)), 14);

  -- RCO: Anthropic (na lista) em agosto e setembro, com estorno em setembro; padaria (fora).
  perform pg_temp.fatura(v_rco, '2026-08-01', jsonb_build_array(
    pg_temp.line('ANTHROPIC* CLAUDE TEAM', 5000, 'purchase', 191),
    pg_temp.line('PADARIA TESTE', 2000)));
  perform pg_temp.fatura(v_rco, '2026-09-01', jsonb_build_array(
    pg_temp.line('ANTHROPIC* API', 8000),
    pg_temp.line('ANTHROPIC* API ESTORNO', 1000, 'refund')));
  -- Assessoria: GitHub (na lista) e Anthropic (fora da lista nesta empresa).
  perform pg_temp.fatura(v_assessoria, '2026-08-01', jsonb_build_array(
    pg_temp.line('GITHUB, INC.', 4000),
    pg_temp.line('ANTHROPIC* API', 9900)));
  -- Outra empresa, fora da lista inteira.
  perform pg_temp.fatura(v_outra, '2026-08-01', jsonb_build_array(
    pg_temp.line('ANTHROPIC* API', 7700)));

  perform pg_temp.check('Anthropic da RCO em agosto, com IOF, em centavos',
    (select amount_cents from dash_cost_export('2026-08-01', '2026-09-30')
     where month = '2026-08-01' and company_name = 'RCO Tecnologia' and vendor_key = 'ANTHROPIC'), 5191::bigint);
  perform pg_temp.check('estorno reduz o mês',
    (select amount_cents from dash_cost_export('2026-08-01', '2026-09-30')
     where month = '2026-09-01' and vendor_key = 'ANTHROPIC'), 7000::bigint);
  perform pg_temp.check('item gerencial e área vão junto',
    (select string_agg(distinct item_code || '|' || area, ',') from dash_cost_export('2026-08-01', '2026-09-30')
     where vendor_key = 'ANTHROPIC'), 'tecnologia.ia|plataforma');
  perform pg_temp.check('GitHub da Assessoria sai',
    (select amount_cents from dash_cost_export('2026-08-01', '2026-09-30')
     where vendor_key = 'GITHUB'), 4000::bigint);
  perform pg_temp.check('Anthropic só da empresa da lista',
    (select string_agg(distinct company_name, ',') from dash_cost_export('2026-08-01', '2026-09-30')
     where vendor_key = 'ANTHROPIC'), 'RCO Tecnologia');
  perform pg_temp.check('nada de fornecedor fora da lista',
    (select count(*)::int from dash_cost_export('2026-08-01', '2026-09-30') e
     where not exists (select 1 from dash_cost_vendors v join companies c on c.id = v.company_id
                       where v.vendor_key = e.vendor_key and c.trade_name = e.company_name)), 0);
  perform pg_temp.check('mês sem gasto não aparece',
    (select count(*)::int from dash_cost_export('2026-10-01', '2026-10-31')), 0);
  perform pg_temp.check('início no meio do mês corta o que veio antes (faturas de 01/08)',
    (select count(*)::int from dash_cost_export('2026-08-15', '2026-09-30') where month = '2026-08-01'), 0);

  begin
    perform dash_cost_export('2026-09-30', '2026-08-01');
    v_err := 'sem erro';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.check('período invertido é recusado', v_err, 'período inválido');

  begin
    perform dash_cost_export('2024-01-01', '2026-02-01');
    v_err := 'sem erro';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.check('mais de 24 meses é recusado', v_err, 'período maior que 24 meses');
end $$;

-- Permissões: usuário logado comum não executa nem lê a lista.
do $$
begin
  perform pg_temp.check('authenticated não executa a exportação',
    has_function_privilege('authenticated', 'public.dash_cost_export(date, date)', 'execute'), false);
  perform pg_temp.check('anon não executa a exportação',
    has_function_privilege('anon', 'public.dash_cost_export(date, date)', 'execute'), false);
  perform pg_temp.check('service_role executa a exportação',
    has_function_privilege('service_role', 'public.dash_cost_export(date, date)', 'execute'), true);
  perform pg_temp.check('anon não lê a lista',
    has_table_privilege('anon', 'public.dash_cost_vendors', 'select'), false);
end $$;

insert into auth.users (id, email, instance_id, aud, role)
values ('77777777-7777-7777-7777-777777777777', 'leitor@teste.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into profiles (id, full_name, email, role)
values ('77777777-7777-7777-7777-777777777777', 'Leitor', 'leitor@teste.local', 'admin')
on conflict (id) do update set role = 'admin';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
select set_config('teste.lista_visivel', (select count(*) from public.dash_cost_vendors)::text, true);
reset role;
select pg_temp.check('admin que não é super admin não vê a lista',
  current_setting('teste.lista_visivel')::int, 0);

select n, cenario, obtido from resultado order by n;

rollback;

-- Central de Gastos (migration 20261023192736).
--
-- Duas empresas com faturas conferidas e a mesma assinatura (Anthropic) — o caso que a
-- tela existe para mostrar — e confere as leituras da `/gastos` e da tool de MCP:
--   · fornecedor sai do nome da regra e casa entre empresas; os meses vêm junto;
--   · USD e IOF somam pelo sinal da compra; estorno reduz;
--   · compra sem classificação conta como "a detalhar";
--   · sem fornecedor e com recorte por código, o total não muda de regra;
--   · só gasto (natureza expense), nunca holding no escopo padrão;
--   · cartão: total, estorno, não classificado, parcelas a vencer;
--   · conferência camada × lançamentos dá zero;
--   · RLS: quem só vê uma empresa só soma ela.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/central_de_gastos.sql
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
  p_last4 text, p_descr text, p_cents int, p_kind text default 'purchase',
  p_usd_cents int default null, p_iof_cents int default 0,
  p_n int default null, p_total int default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'cardLast4', p_last4, 'purchaseDate', '2026-08-10', 'description', p_descr, 'kind', p_kind,
    'amountCents', p_cents, 'currency', case when p_usd_cents is null then 'BRL' else 'USD' end,
    'amountOriginalCents', p_usd_cents, 'fxRate', case when p_usd_cents is null then null else 5.45 end,
    'iofCents', p_iof_cents, 'installmentN', p_n, 'installmentTotal', p_total);
$$;

-- Lança a fatura (6.2.28) e grava as compras; devolve o id da fatura.
create or replace function pg_temp.fatura(
  p_company uuid, p_month date, p_last4 text, p_holder text, p_lines jsonb
) returns uuid language plpgsql as $$
declare
  v_total int;
  v_tx uuid;
begin
  select sum(case when l ->> 'kind' = 'refund' then -1 else 1 end
             * ((l ->> 'amountCents')::int + (l ->> 'iofCents')::int))
  into v_total from jsonb_array_elements(p_lines) l;

  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (p_company, (select id from chart_of_accounts where company_id = p_company and code = '6.2.28'),
          v_total / 100.0, 'outflow', 'settled', p_month, p_month + 40, 'fatura central')
  returning id into v_tx;

  return (public.save_card_statement(v_tx, jsonb_build_object(
    'issuer', 'c6', 'closingDate', (p_month + 23)::text, 'dueDate', (p_month + 30)::text,
    'totalCents', v_total, 'summary', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'cards', jsonb_build_array(jsonb_build_object(
      'last4', p_last4, 'holderName', p_holder, 'kind', 'physical', 'subtotalCents', v_total)),
    'lines', p_lines)) ->> 'id')::uuid;
end $$;

do $$
declare
  v_rco uuid := '00000000-0000-0000-0000-000000000013';
  v_jimmy uuid := '00000000-0000-0000-0000-000000000014';
  v_both uuid[] := array['00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000014']::uuid[];
  v_ago uuid;
  v_set uuid;
  v_jim uuid;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values ('66666666-6666-6666-6666-666666666666', 'central@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('66666666-6666-6666-6666-666666666666', 'Central', 'central@teste.local', 'super_admin')
  on conflict (id) do update set role = 'super_admin';
  perform set_config('request.jwt.claims',
    '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);

  -- RCO: Anthropic em dólar em agosto e setembro; em setembro também uma compra
  -- parcelada, uma sem regra e um estorno.
  v_ago := pg_temp.fatura(v_rco, '2026-08-01', '8101', 'ANA TESTE', jsonb_build_array(
    pg_temp.line('8101', 'ANTHROPIC* CLAUDE TEAM', 5450, 'purchase', 1000, 191)));
  v_set := pg_temp.fatura(v_rco, '2026-09-01', '8101', 'ANA TESTE', jsonb_build_array(
    pg_temp.line('8101', 'ANTHROPIC* CLAUDE TEAM', 5450, 'purchase', 1000, 191),
    pg_temp.line('8101', 'LOJA TESTE PARCELADA', 30000, 'purchase', null, 0, 2, 5),
    pg_temp.line('8101', 'PADARIA TESTE', 2000),
    pg_temp.line('8101', 'ESTORNO PADARIA TESTE', 1000, 'refund')));
  -- Jimmy: a mesma assinatura, em reais.
  v_jim := pg_temp.fatura(v_jimmy, '2026-09-01', '8201', 'BRUNO TESTE', jsonb_build_array(
    pg_temp.line('8201', 'ANTHROPIC* API', 10000)));

  perform pg_temp.check('as três faturas conferem',
    (select string_agg(distinct status::text, ',') from card_statements where id in (v_ago, v_set, v_jim)),
    'reconciled');

  -- Fornecedor: o nome da regra, casando entre empresas.
  perform pg_temp.check('Anthropic aparece nas duas empresas',
    (select count(distinct company_id)::int
     from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', v_both)
     where vendor_key = 'ANTHROPIC'), 2);
  perform pg_temp.check('nome do fornecedor é o da regra',
    (select string_agg(distinct vendor_name, ',')
     from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', v_both)
     where vendor_key = 'ANTHROPIC'), 'Anthropic');
  perform pg_temp.check('meses em que a assinatura apareceu',
    (select months::text from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', array[v_rco])
     where vendor_key = 'ANTHROPIC'), '{2026-08-01,2026-09-01}');
  perform pg_temp.check('Anthropic da RCO: total com IOF, USD e IOF',
    (select outflow || '|' || amount_usd || '|' || iof_amount || '|' || currency
     from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', array[v_rco])
     where vendor_key = 'ANTHROPIC'), '112.82|20.00|3.82|USD');
  perform pg_temp.check('compra sem regra usa a descrição',
    (select count(*)::int from management_breakdown_multi('2026-09-01', '2026-09-30', 'accrual', array[v_rco])
     where vendor_key = 'PADARIA TESTE'), 1);

  -- A detalhar: compra sem classificação, estorno incluído.
  perform pg_temp.check('a detalhar da fatura de setembro',
    (select sum(outflow - inflow) from management_breakdown_multi('2026-09-01', '2026-09-30', 'accrual', array[v_rco])
     where source = 'card' and requires_detail), 310.00);
  perform pg_temp.check('classificada não é a detalhar',
    (select bool_or(requires_detail) from management_breakdown_multi('2026-09-01', '2026-09-30', 'accrual', array[v_rco])
     where vendor_key = 'ANTHROPIC'), false);

  -- Sem fornecedor e com recorte: mesma regra, mesmo total.
  perform pg_temp.check('sem fornecedor o total é o mesmo',
    (select sum(outflow - inflow) from management_breakdown_multi('2025-01-01', '2026-12-31', 'accrual', null, false))
    = (select sum(outflow - inflow) from management_breakdown_multi('2025-01-01', '2026-12-31', 'accrual', null, true)),
    true);
  perform pg_temp.check('sem fornecedor não devolve fornecedor',
    (select count(*)::int from management_breakdown_multi('2025-01-01', '2026-12-31', 'accrual', null, false)
     where vendor_key is not null), 0);
  perform pg_temp.check('recorte pelo grupo tecnologia',
    (select sum(outflow - inflow) from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', v_both, true, array['tecnologia'])
     where source = 'card'), 212.82);
  perform pg_temp.check('recorte pelo item tecnologia.ia',
    (select sum(outflow - inflow) from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', v_both, true, array['tecnologia.ia'])
     where source = 'card'), 212.82);

  -- Só gasto, nunca holding no escopo padrão.
  perform pg_temp.check('só itens de gasto',
    (select count(*)::int from management_breakdown_multi('2025-01-01', '2026-12-31') b
     join management_accounts ma on ma.id = b.management_account_id
     where ma.kind <> 'expense'), 0);
  perform pg_temp.check('escopo padrão não inclui a holding',
    (select count(*)::int from management_breakdown_multi('2025-01-01', '2026-12-31') b
     join companies c on c.id = b.company_id where c.is_holding), 0);
  perform pg_temp.check('regime de caixa desloca a fatura para o pagamento',
    (select count(*)::int from management_breakdown_multi('2026-08-01', '2026-08-31', 'cash', array[v_rco])
     where vendor_key = 'ANTHROPIC'), 0);

  -- Cartão.
  perform pg_temp.check('cartão da RCO: faturas, total, estorno, USD, IOF',
    (select statement_count || '|' || outflow || '|' || inflow || '|' || amount_usd || '|' || iof_amount
     from management_card_summary('2026-08-01', '2026-09-30', 'accrual', array[v_rco])),
    '2|432.82|10.00|20.00|3.82');
  perform pg_temp.check('cartão da RCO: não classificado e parcelas a vencer',
    (select unconfirmed_amount || '|' || future_installments || '|' || holder_name || '|' || last_closing_date
     from management_card_summary('2026-08-01', '2026-09-30', 'accrual', array[v_rco])),
    '310.00|900.00|ANA TESTE|2026-09-24');
  perform pg_temp.check('o total do cartão fecha com a origem cartão da Central',
    (select sum(outflow - inflow) from management_card_summary('2026-08-01', '2026-09-30', 'accrual', v_both))
    = (select sum(outflow - inflow) from management_breakdown_multi('2026-08-01', '2026-09-30', 'accrual', v_both)
       where source = 'card'),
    true);

  update card_statements set status = 'needs_review' where id = v_jim;
  perform pg_temp.check('fatura não conferida não entra no cartão',
    (select count(*)::int from management_card_summary('2026-08-01', '2026-09-30', 'accrual', array[v_jimmy])), 0);
  update card_statements set status = 'reconciled' where id = v_jim;

  -- Conferência.
  perform pg_temp.check('conferência tem linhas',
    (select count(*)::int > 0 from management_reconciliation('2026-08-01', '2026-09-30', 'accrual', v_both)), true);
  perform pg_temp.check('camada fecha com os lançamentos, competência',
    (select count(*)::int from management_reconciliation('2025-01-01', '2026-12-31', 'accrual', null)
     where difference <> 0), 0);
  perform pg_temp.check('camada fecha com os lançamentos, caixa',
    (select count(*)::int from management_reconciliation('2025-01-01', '2026-12-31', 'cash', null)
     where difference <> 0), 0);
  perform pg_temp.check('estorno de cartão muda o bruto, não o líquido',
    (select layer_inflow - ledger_inflow from management_reconciliation('2026-09-01', '2026-09-30', 'accrual', array[v_rco])),
    10.00);

  -- RLS: quem só vê a Jimmy só soma a Jimmy.
  insert into auth.users (id, email, instance_id, aud, role)
  values ('77777777-7777-7777-7777-777777777777', 'leitor@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('77777777-7777-7777-7777-777777777777', 'Leitor', 'leitor@teste.local', 'viewer')
  on conflict (id) do update set role = 'viewer';
  insert into company_access (user_id, company_id) values ('77777777-7777-7777-7777-777777777777', v_jimmy);
  perform set_config('request.jwt.claims',
    '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
  declare
    v_companies text;
    v_cards text;
  begin
    set local role authenticated;
    select string_agg(distinct company_id::text, ',') into v_companies
    from management_breakdown_multi('2025-01-01', '2026-12-31');
    select string_agg(distinct company_id::text, ',') into v_cards
    from management_card_summary('2025-01-01', '2026-12-31');
    reset role;
    perform pg_temp.check('leitor de uma empresa só vê ela na Central', v_companies, v_jimmy::text);
    perform pg_temp.check('nem nos cartões', v_cards, v_jimmy::text);
  end;
end $$;

select * from resultado order by n;

rollback;

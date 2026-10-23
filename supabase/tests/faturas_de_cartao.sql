-- Fatura de cartão detalhada (migration 20261023183502).
--
-- Grava uma fatura pequena no lançamento de cartão e confere as promessas do desenho
-- (docs/features/central-de-gastos-plan.md §2 e §7):
--   · o banco refaz a conta — fatura que não fecha fica `needs_review` e não abre;
--   · fatura conferida SUBSTITUI o lançamento na camada gerencial, com o mesmo total;
--   · compra sem classificação herda "Fatura de cartão" — detalhar não muda total;
--   · classificar move o valor de item, sem mudar o total;
--   · valor de linha não se edita; compra não cai em item de receita.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/faturas_de_cartao.sql
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
  -- O comando pode ter trocado de papel (`set local role`): volta antes de seguir.
  execute 'reset role';
  return 'não recusou';
exception when others then
  return 'recusou';
end $$;

do $$
declare
  v_company uuid := '00000000-0000-0000-0000-000000000013';
  v_card_account uuid;
  v_rent_account uuid;
  v_tx uuid;
  v_tx_wrong uuid;
  v_statement uuid;
  v_ia uuid;
  v_payload jsonb;
begin
  -- Um super admin, para o `has_company_write_access` da gravação.
  insert into auth.users (id, email, instance_id, aud, role)
  values ('33333333-3333-3333-3333-333333333333', 'fatura@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('33333333-3333-3333-3333-333333333333', 'Fatura', 'fatura@teste.local', 'super_admin')
  on conflict (id) do update set role = 'super_admin';
  perform set_config('request.jwt.claims',
    '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

  select id into v_card_account from chart_of_accounts where company_id = v_company and code = '6.2.28';
  select id into v_rent_account from chart_of_accounts where company_id = v_company and code = '6.2.06';
  select id into v_ia from management_accounts where code = 'tecnologia.ia' limit 1;

  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (v_company, v_card_account, 86.00, 'outflow', 'settled', '2026-09-01', '2026-10-01', 'fatura de teste')
  returning id into v_tx;
  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (v_company, v_rent_account, 86.00, 'outflow', 'settled', '2026-09-01', '2026-10-01', 'aluguel')
  returning id into v_tx_wrong;

  -- 60 de compra nacional + 30 em dólar com 1 de IOF − 5 de estorno = 86.
  v_payload := jsonb_build_object(
    'issuer', 'c6', 'closingDate', '2026-09-24', 'dueDate', '2026-10-01', 'totalCents', 8600,
    'summary', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'cards', jsonb_build_array(
      jsonb_build_object('last4', '9001', 'holderName', 'EMPRESA TESTE', 'kind', 'virtual', 'subtotalCents', 5500),
      jsonb_build_object('last4', '9002', 'holderName', 'PORTADOR TESTE', 'kind', 'physical', 'subtotalCents', 3100)),
    'lines', jsonb_build_array(
      jsonb_build_object('cardLast4', '9001', 'purchaseDate', '2026-09-10', 'description', 'PADARIA', 'kind', 'purchase',
        'amountCents', 6000, 'currency', 'BRL', 'amountOriginalCents', null, 'fxRate', null, 'iofCents', 0,
        'installmentN', null, 'installmentTotal', null),
      jsonb_build_object('cardLast4', '9001', 'purchaseDate', '2026-09-11', 'description', 'ESTORNO PADARIA', 'kind', 'refund',
        'amountCents', 500, 'currency', 'BRL', 'amountOriginalCents', null, 'fxRate', null, 'iofCents', 0,
        'installmentN', null, 'installmentTotal', null),
      jsonb_build_object('cardLast4', '9002', 'purchaseDate', '2026-09-12', 'description', 'ANTHROPIC', 'kind', 'purchase',
        'amountCents', 3000, 'currency', 'USD', 'amountOriginalCents', 550, 'fxRate', 5.45, 'iofCents', 100,
        'installmentN', null, 'installmentTotal', null)));

  perform pg_temp.check('lançamento que não é de cartão é recusado',
    pg_temp.raises(format('select public.save_card_statement(%L, %L::jsonb)', v_tx_wrong, v_payload)), 'recusou');

  -- Fatura que não bate com o lançamento: grava, mas fica para conferência e não abre.
  v_statement := (public.save_card_statement(v_tx, jsonb_set(v_payload, '{totalCents}', '9000')) ->> 'id')::uuid;
  perform pg_temp.check('total divergente fica needs_review',
    (select status::text from card_statements where id = v_statement), 'needs_review');
  perform pg_temp.check('fatura não conferida não abre o lançamento',
    (select string_agg(source, ',') from v_management_lines where transaction_id = v_tx), 'ledger');

  perform pg_temp.check('reimportar sem p_replace é recusado',
    pg_temp.raises(format('select public.save_card_statement(%L, %L::jsonb)', v_tx, v_payload)), 'recusou');

  v_statement := (public.save_card_statement(v_tx, v_payload, p_replace => true) ->> 'id')::uuid;
  perform pg_temp.check('fatura que fecha fica reconciled',
    (select status::text from card_statements where id = v_statement), 'reconciled');
  perform pg_temp.check('reimportar substitui a anterior',
    (select count(*)::int from card_statements where transaction_id = v_tx), 1);
  perform pg_temp.check('conferências gravadas pelo banco',
    (select string_agg((c ->> 'code') || '=' || (c ->> 'ok'), ',' order by c ->> 'code')
     from card_statements s, jsonb_array_elements(s.validation) c where s.id = v_statement),
    'card:9001=true,card:9002=true,ledger=true,total=true');
  perform pg_temp.check('cartões criados a partir da fatura',
    (select string_agg(last4 || ':' || kind, ',' order by last4) from payment_cards where company_id = v_company),
    '9001:virtual,9002:physical');

  -- A camada troca o lançamento pelas compras, com o mesmo total.
  perform pg_temp.check('só as compras representam a fatura',
    (select string_agg(distinct source, ',') from v_management_lines where transaction_id = v_tx), 'card');
  perform pg_temp.check('compras somam o lançamento',
    (select sum(case when direction = 'inflow' then amount else -amount end) from v_management_lines where transaction_id = v_tx),
    -86.00);
  perform pg_temp.check('compra sem classificação herda Fatura de cartão',
    (select count(distinct management_account_id)::int from v_management_lines v
     join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and ma.code = 'a_detalhar.cartao'), 1);
  perform pg_temp.check('a compra em dólar soma o IOF',
    (select amount from v_management_lines where transaction_id = v_tx and description = 'ANTHROPIC'), 31.00);

  -- Classificar move de item, sem mudar total.
  update card_statement_lines set management_account_id = v_ia, classification_status = 'confirmed'
  where statement_id = v_statement and description = 'ANTHROPIC';
  perform pg_temp.check('classificada vai para o item escolhido',
    (select ma.code from v_management_lines v join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and v.description = 'ANTHROPIC'), 'tecnologia.ia');
  perform pg_temp.check('confirmar grava quem e quando',
    (select confirmed_by is not null and confirmed_at is not null from card_statement_lines
     where statement_id = v_statement and description = 'ANTHROPIC'), true);
  perform pg_temp.check('série do Balanço não muda de total',
    (select sum(revenue - expense) from management_monthly_series_multi('2026-09-01', '2026-09-30', 'accrual', array[v_company])
     where management_account_id is not null) is not null, true);
  perform pg_temp.check('total do lançamento na camada continua 86',
    (select sum(case when direction = 'inflow' then amount else -amount end) from v_management_lines where transaction_id = v_tx),
    -86.00);

  -- Travas.
  perform pg_temp.check('valor de linha não se edita',
    pg_temp.raises(format('update card_statement_lines set amount = 1 where statement_id = %L', v_statement)), 'recusou');
  perform pg_temp.check('compra não cai em item de receita',
    pg_temp.raises(format(
      'update card_statement_lines set management_account_id = (select id from management_accounts where code = %L limit 1) where statement_id = %L',
      'receitas.servicos', v_statement)), 'recusou');
  perform pg_temp.check('compra não cai em grupo',
    pg_temp.raises(format(
      'update card_statement_lines set management_account_id = (select id from management_accounts where code = %L limit 1) where statement_id = %L',
      'tecnologia', v_statement)), 'recusou');

  -- A gaveta lista a compra pelo id da linha, não do lançamento.
  perform pg_temp.check('gaveta devolve a compra como linha própria',
    (select count(distinct id)::int from management_line_transactions(
       '2026-09-01', '2026-09-30', 'accrual',
       (select jsonb_agg(jsonb_build_object('m', management_account_id, 'a', cost_center_id, 'n', nature, 'd', null))
        from v_management_lines where transaction_id = v_tx),
       array[v_company])), 3);

  -- Escrita direta nas tabelas da fatura não é concedida — só a classificação.
  perform pg_temp.check('usuário não marca fatura como conferida direto',
    pg_temp.raises(format('set local role authenticated; update card_statements set status = %L where id = %L', 'reconciled', v_statement)),
    'recusou');
  perform pg_temp.check('usuário não insere compra direto',
    pg_temp.raises(format('set local role authenticated; insert into card_statement_lines (statement_id, company_id, card_id, sort_order, purchase_date, description, line_kind, amount) select %L, company_id, card_id, 99, purchase_date, %L, %L, 1 from card_statement_lines where statement_id = %L limit 1', v_statement, 'X', 'purchase', v_statement)),
    'recusou');

  perform pg_temp.check('classificar continua liberado para quem escreve na empresa',
    pg_temp.raises(format('set local role authenticated; update card_statement_lines set cost_center_id = null where statement_id = %L', v_statement)),
    'não recusou');

  -- Resumo impresso que não bate também segura a fatura.
  perform pg_temp.check('resumo divergente fica needs_review',
    public.save_card_statement(v_tx, jsonb_set(v_payload, '{summary}', '{"domesticCents": 1}'::jsonb), p_replace => true) ->> 'status',
    'needs_review');
  v_statement := (public.save_card_statement(v_tx, v_payload, p_replace => true) ->> 'id')::uuid;

  -- Lançamento-pai editado depois de conferido: a fatura volta para conferência.
  update transactions set amount = 90 where id = v_tx;
  perform pg_temp.check('mudar o valor do lançamento reabre a fatura',
    (select status::text from card_statements where id = v_statement), 'needs_review');
  perform pg_temp.check('e o lançamento volta inteiro',
    (select string_agg(source, ',') from v_management_lines where transaction_id = v_tx), 'ledger');
  update transactions set amount = 86 where id = v_tx;

  -- Lista de pendentes exclui o já detalhado.
  perform pg_temp.check('detalhado não aparece como pendente',
    (select count(*)::int from pending_card_invoice_transactions(array[v_company]) where id = v_tx), 0);

  -- Apagar a fatura devolve o lançamento inteiro.
  perform public.delete_card_statement(v_statement);
  perform pg_temp.check('apagar a fatura devolve o lançamento',
    (select string_agg(source, ',') from v_management_lines where transaction_id = v_tx), 'ledger');
end $$;

select n, cenario, obtido from resultado order by n;

rollback;

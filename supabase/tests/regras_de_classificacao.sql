-- Regras de classificação de compra de cartão (migration 20261023185538).
--
-- Grava uma fatura com fornecedores reais das faturas de set/2026 e confere:
--   · a regra classifica ao gravar, e conta como confirmada;
--   · a regra da empresa vence a geral; o padrão mais longo vence o mais curto;
--   · a regra vence a sugestão da IA, mas não a decisão de uma pessoa;
--   · sugestão da IA NÃO entra na visão gerencial até ser aceita.
--
--   bun run db:reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/regras_de_classificacao.sql
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

create or replace function pg_temp.item_of(p_statement uuid, p_description text) returns text
language sql as $$
  select ma.code from card_statement_lines l
  left join management_accounts ma on ma.id = l.management_account_id
  where l.statement_id = p_statement and l.description = p_description
$$;

do $$
declare
  v_company uuid := '00000000-0000-0000-0000-000000000013';
  v_org uuid;
  v_tx uuid;
  v_statement uuid;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_total int := 0;
  d record;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values ('44444444-4444-4444-4444-444444444444', 'regras@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('44444444-4444-4444-4444-444444444444', 'Regras', 'regras@teste.local', 'super_admin')
  on conflict (id) do update set role = 'super_admin';
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

  select organization_id into v_org from companies where id = v_company;

  -- Regra da empresa: aqui o AWS é Ocupação (só para provar que vence a geral).
  insert into classification_rules (organization_id, company_id, name, match_kind, pattern, management_account_id)
  values (v_org, v_company, 'AWS desta empresa', 'prefix', 'amazon aws',
          (select id from management_accounts where organization_id = v_org and code = 'ocupacao.telecom'));
  -- Padrão mais longo vence: "OPENAI CHATGPT" vai para software, OPENAI genérico para IA.
  insert into classification_rules (organization_id, name, match_kind, pattern, management_account_id)
  values (v_org, 'ChatGPT', 'prefix', 'OPENAI *CHATGPT',
          (select id from management_accounts where organization_id = v_org and code = 'tecnologia.software'));

  for d in select * from (values
    ('FACEBK* DZRJ55AZV4', 36548),
    ('METAPAY*9SEJN8J7F4', 8538),
    ('ANTHROPIC* CLAUDE TEAM SA', 4082),
    ('OPENAI *CHATGPT SUBSCR SA', 299122),
    ('AMAZON AWS SERVICOS BR', 99810),
    ('DL*GOOGLE WHATSA', 5500),
    ('LATITUDE.SH', 439800),
    ('MP *7CLUB', 23161)
  ) as x(descr, cents)
  loop
    v_lines := v_lines || jsonb_build_object(
      'cardLast4', '7001', 'purchaseDate', '2026-09-10', 'description', d.descr, 'kind', 'purchase',
      'amountCents', d.cents, 'currency', 'BRL', 'amountOriginalCents', null, 'fxRate', null,
      'iofCents', 0, 'installmentN', null, 'installmentTotal', null);
    v_total := v_total + d.cents;
  end loop;

  insert into transactions (company_id, account_id, amount, direction, status, accrual_date, cash_date, description)
  values (v_company, (select id from chart_of_accounts where company_id = v_company and code = '6.2.28'),
          v_total / 100.0, 'outflow', 'settled', '2026-09-01', '2026-10-01', 'fatura regras')
  returning id into v_tx;

  v_statement := (public.save_card_statement(v_tx, jsonb_build_object(
    'issuer', 'c6', 'closingDate', '2026-09-24', 'dueDate', '2026-10-01', 'totalCents', v_total,
    'summary', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'cards', jsonb_build_array(jsonb_build_object('last4', '7001', 'holderName', 'TESTE', 'kind', 'virtual', 'subtotalCents', v_total)),
    'lines', v_lines)) ->> 'id')::uuid;

  perform pg_temp.check('fatura conferida', (select status::text from card_statements where id = v_statement), 'reconciled');

  -- Regras aplicadas ao gravar.
  perform pg_temp.check('FACEBK → mídia paga', pg_temp.item_of(v_statement, 'FACEBK* DZRJ55AZV4'), 'marketing.midia');
  perform pg_temp.check('METAPAY → mídia paga', pg_temp.item_of(v_statement, 'METAPAY*9SEJN8J7F4'), 'marketing.midia');
  perform pg_temp.check('ANTHROPIC → IA', pg_temp.item_of(v_statement, 'ANTHROPIC* CLAUDE TEAM SA'), 'tecnologia.ia');
  perform pg_temp.check('padrão mais longo vence', pg_temp.item_of(v_statement, 'OPENAI *CHATGPT SUBSCR SA'), 'tecnologia.software');
  perform pg_temp.check('regra da empresa vence a geral', pg_temp.item_of(v_statement, 'AMAZON AWS SERVICOS BR'), 'ocupacao.telecom');
  perform pg_temp.check('contains acha no meio', pg_temp.item_of(v_statement, 'DL*GOOGLE WHATSA'), 'tecnologia.software');
  perform pg_temp.check('pontuação não atrapalha', pg_temp.item_of(v_statement, 'LATITUDE.SH'), 'tecnologia.infra');
  perform pg_temp.check('sem regra fica a classificar', pg_temp.item_of(v_statement, 'MP *7CLUB'), null::text);
  perform pg_temp.check('regra conta como confirmada e diz qual foi',
    (select classification_status::text || ':' || classification_source::text || ':' || (rule_id is not null)::text
     from card_statement_lines where statement_id = v_statement and description = 'FACEBK* DZRJ55AZV4'),
    'confirmed:rule:true');
  perform pg_temp.check('regra põe a área',
    (select cc.name from card_statement_lines l join cost_centers cc on cc.id = l.cost_center_id
     where l.statement_id = v_statement and l.description = 'FACEBK* DZRJ55AZV4'), 'Marketing');

  -- Sugestão da IA não conta até ser aceita.
  update card_statement_lines
  set management_account_id = (select id from management_accounts where organization_id = v_org and code = 'pessoas.eventos'),
      classification_status = 'suggested', classification_source = 'ai', ai_confidence = 0.6,
      suggestion_reason = 'clube de benefícios'
  where statement_id = v_statement and description = 'MP *7CLUB';
  perform pg_temp.check('sugestão não entra na visão gerencial',
    (select ma.code from v_management_lines v join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and v.description = 'MP *7CLUB'), 'a_detalhar.cartao');

  update card_statement_lines set classification_status = 'confirmed'
  where statement_id = v_statement and description = 'MP *7CLUB';
  perform pg_temp.check('aceita, a sugestão passa a contar',
    (select ma.code from v_management_lines v join management_accounts ma on ma.id = v.management_account_id
     where v.transaction_id = v_tx and v.description = 'MP *7CLUB'), 'pessoas.eventos');

  -- Nova regra reaplicada: vence sugestão, respeita decisão de pessoa.
  update card_statement_lines set classification_status = 'suggested'
  where statement_id = v_statement and description = 'MP *7CLUB';
  update card_statement_lines
  set management_account_id = (select id from management_accounts where organization_id = v_org and code = 'marketing.conteudo'),
      classification_status = 'confirmed', classification_source = 'human', rule_id = null
  where statement_id = v_statement and description = 'METAPAY*9SEJN8J7F4';
  insert into classification_rules (organization_id, name, match_kind, pattern, management_account_id)
  values (v_org, '7Club', 'contains', '7CLUB',
          (select id from management_accounts where organization_id = v_org and code = 'pessoas.beneficios')),
         (v_org, 'Meta (teste)', 'prefix', 'METAPAY 9SEJN',
          (select id from management_accounts where organization_id = v_org and code = 'outros.nao_identificado'));
  perform pg_temp.check('reaplicar classifica quem estava sugerido',
    public.apply_classification_rules(v_statement), 1);
  perform pg_temp.check('regra vence a sugestão', pg_temp.item_of(v_statement, 'MP *7CLUB'), 'pessoas.beneficios');
  perform pg_temp.check('decisão de pessoa não é sobrescrita', pg_temp.item_of(v_statement, 'METAPAY*9SEJN8J7F4'), 'marketing.conteudo');

  -- Limpar à mão é decisão: reaplicar não desfaz. E o rastro de regra some.
  update card_statement_lines
  set management_account_id = null, classification_status = 'unclassified', classification_source = 'human'
  where statement_id = v_statement and description = 'FACEBK* DZRJ55AZV4';
  perform public.apply_classification_rules(v_statement);
  perform pg_temp.check('reaplicar respeita quem limpou à mão', pg_temp.item_of(v_statement, 'FACEBK* DZRJ55AZV4'), null::text);
  perform pg_temp.check('decisão humana não guarda rule_id',
    (select rule_id is null from card_statement_lines where statement_id = v_statement and description = 'FACEBK* DZRJ55AZV4'), true);

  -- Lançador de uma empresa não cria regra que alcance outra.
  insert into auth.users (id, email, instance_id, aud, role)
  values ('55555555-5555-5555-5555-555555555555', 'lancador@teste.local',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into profiles (id, full_name, email, role)
  values ('55555555-5555-5555-5555-555555555555', 'Lançador', 'lancador@teste.local', 'editor')
  on conflict (id) do update set role = 'editor';
  insert into company_access (user_id, company_id) values ('55555555-5555-5555-5555-555555555555', v_company);
  perform set_config('request.jwt.claims',
    '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
  declare
    v_other uuid := (select id from companies where organization_id = v_org and id <> v_company and not is_holding limit 1);
    v_item uuid := (select id from management_accounts where organization_id = v_org and code = 'tecnologia.ia');
    v_result text;
  begin
    begin
      set local role authenticated;
      insert into classification_rules (organization_id, company_id, name, match_kind, pattern, management_account_id)
      values (v_org, v_company, 'Própria', 'prefix', 'PROPRIA TESTE', v_item);
      v_result := 'aceitou';
      reset role;
    exception when others then reset role; v_result := 'recusou';
    end;
    perform pg_temp.check('lançador cria regra da própria empresa', v_result, 'aceitou');
    begin
      set local role authenticated;
      insert into classification_rules (organization_id, company_id, name, match_kind, pattern, management_account_id)
      values (v_org, v_other, 'Alheia', 'prefix', 'ALHEIA TESTE', v_item);
      v_result := 'aceitou';
      reset role;
    exception when others then reset role; v_result := 'recusou';
    end;
    perform pg_temp.check('lançador não cria regra de outra empresa', v_result, 'recusou');
    begin
      set local role authenticated;
      insert into classification_rules (organization_id, company_id, name, match_kind, pattern, management_account_id)
      values (v_org, null, 'Geral', 'prefix', 'GERAL TESTE', v_item);
      v_result := 'aceitou';
      reset role;
    exception when others then reset role; v_result := 'recusou';
    end;
    perform pg_temp.check('lançador não cria regra para todas as empresas', v_result, 'recusou');
  end;
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

  -- Total continua o do lançamento, qualquer que seja a classificação.
  perform pg_temp.check('a fatura continua somando o lançamento',
    (select sum(case when direction = 'inflow' then amount else -amount end) from v_management_lines where transaction_id = v_tx),
    -(v_total / 100.0));

  -- Coerência da regra.
  begin
    insert into classification_rules (organization_id, name, match_kind, pattern, management_account_id)
    values (v_org, 'Receita', 'prefix', 'XYZW',
            (select id from management_accounts where organization_id = v_org and code = 'receitas.servicos'));
    raise exception 'FALHOU regra para item de receita foi aceita';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    insert into resultado (cenario, obtido) values ('regra não aponta para receita', 'recusou');
  end;
end $$;

select n, cenario, obtido from resultado order by n;

rollback;

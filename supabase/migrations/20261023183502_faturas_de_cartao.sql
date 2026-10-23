-- =============================================================================
-- Fase 2 da Central de Gastos — a fatura de cartão aberta em linhas
--
-- A fatura continua sendo UM lançamento na conta `6.2.28 Cartão` (item gerencial
-- "A detalhar · Fatura de cartão"): DRE, caixa, apuração e conciliação não mudam. O
-- detalhe é um sub-razão gerencial pendurado nele — `card_statements` (a fatura) e
-- `card_statement_lines` (as compras). Ver docs/features/central-de-gastos-plan.md §7 e §9.
--
-- A REGRA QUE NÃO PODE QUEBRAR. A fatura só substitui o lançamento na camada gerencial
-- (`v_management_lines`) se as linhas fecharem com o total impresso, com o subtotal de
-- cada cartão e com o valor do lançamento. Quem decide isso é o BANCO, ao gravar
-- (`save_card_statement`), refazendo a conta — o cliente manda o que leu, não o veredito.
-- Fatura que não fecha fica `needs_review` e a camada continua mostrando o lançamento
-- inteiro. Nunca parcialmente.
--
-- Linha ainda sem classificação herda o item do lançamento-pai (a própria "Fatura de
-- cartão"): detalhar uma fatura não muda nenhum total até alguém classificar as compras.
-- =============================================================================

-- =============================================================================
-- 1) Tipos
-- =============================================================================
create type public.card_statement_status as enum ('needs_review', 'reconciled');
create type public.card_line_kind as enum ('purchase', 'fee', 'interest', 'refund');
create type public.card_line_classification as enum ('unclassified', 'suggested', 'confirmed');
create type public.card_classification_source as enum ('rule', 'ai', 'human');

-- =============================================================================
-- 2) Cartões
-- =============================================================================
create table public.payment_cards (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  issuer       text not null check (issuer in ('c6')),
  last4        text not null check (last4 ~ '^\d{4}$'),
  kind         text not null check (kind in ('virtual', 'physical')),
  holder_name  text not null,
  is_active    boolean not null default true,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint payment_cards_uniq unique (company_id, issuer, last4)
);

comment on table public.payment_cards is
  'Cartões de crédito da empresa, por emissor e final. Nasce da leitura da fatura: o portador é o nome impresso nela.';

-- =============================================================================
-- 3) Faturas
-- =============================================================================
create table public.card_statements (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  -- O lançamento da fatura no financeiro. Uma fatura detalha um lançamento, e só um.
  transaction_id  uuid not null unique references public.transactions(id) on delete cascade,
  issuer          text not null check (issuer in ('c6')),
  closing_date    date not null,
  due_date        date not null,
  total_amount    numeric(18,2) not null check (total_amount >= 0),
  summary         jsonb not null default '{}'::jsonb,
  -- Conferências refeitas pelo banco ao gravar — é este veredito que vale.
  validation      jsonb not null default '[]'::jsonb,
  warnings        jsonb not null default '[]'::jsonb,
  status          public.card_statement_status not null,
  parser          text not null check (parser in ('text', 'vision')),
  parser_version  text not null,
  file_sha256     text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  attachment_id   uuid references public.attachments(id) on delete set null,
  created_by      uuid references auth.users(id),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint card_statements_period_uniq unique (company_id, issuer, closing_date),
  constraint card_statements_file_uniq unique (company_id, file_sha256)
);

create index idx_card_statements_company on public.card_statements(company_id, closing_date desc);

comment on table public.card_statements is
  'Fatura de cartão lida e conferida, pendurada no lançamento da fatura. reconciled = as linhas fecham com o total, os subtotais e o lançamento; só então ela abre o lançamento na visão gerencial.';

-- =============================================================================
-- 4) Linhas da fatura
-- =============================================================================
create table public.card_statement_lines (
  id                      uuid primary key default gen_random_uuid(),
  statement_id            uuid not null references public.card_statements(id) on delete cascade,
  -- Cópia da empresa da fatura, para a RLS ser a mesma de qualquer tabela da empresa
  -- (trigger garante que bate).
  company_id              uuid not null references public.companies(id) on delete cascade,
  card_id                 uuid not null references public.payment_cards(id) on delete restrict,
  sort_order              int not null,
  purchase_date           date not null,
  description             text not null,
  line_kind               public.card_line_kind not null,
  -- Em reais, sem o IOF; sempre positivo — o estorno é dito pelo `line_kind`.
  amount                  numeric(18,2) not null check (amount >= 0),
  currency                text not null default 'BRL' check (currency in ('BRL', 'USD')),
  amount_original         numeric(18,2),
  fx_rate                 numeric(12,6),
  iof_amount              numeric(18,2) not null default 0 check (iof_amount >= 0),
  installment_n           int check (installment_n > 0),
  installment_total       int check (installment_total > 0),
  -- Classificação gerencial (Fase 3 sugere; aqui é manual).
  counterparty_id         uuid references public.counterparties(id) on delete set null,
  management_account_id   uuid references public.management_accounts(id) on delete restrict,
  nature_override         public.expense_nature,
  cost_center_id          uuid references public.cost_centers(id) on delete set null,
  beneficiary_company_id  uuid references public.companies(id) on delete set null,
  classification_status   public.card_line_classification not null default 'unclassified',
  classification_source   public.card_classification_source,
  confirmed_by            uuid references auth.users(id),
  confirmed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint card_lines_installment_ck check (
    (installment_n is null) = (installment_total is null)
    and (installment_n is null or installment_n <= installment_total)
  )
);

create index idx_card_lines_statement on public.card_statement_lines(statement_id, sort_order);
create index idx_card_lines_company on public.card_statement_lines(company_id);
create index idx_card_lines_management on public.card_statement_lines(management_account_id);

comment on table public.card_statement_lines is
  'Compras de uma fatura de cartão. Linha sem item gerencial herda o do lançamento-pai ("Fatura de cartão"), então detalhar não muda total nenhum até a compra ser classificada.';

-- Coerência da linha com a fatura e com o plano gerencial. Item de compra de cartão é
-- gasto (ou financeiro: IOF, juros); receita ou distribuição aqui seria erro de clique
-- que trocaria o sinal da linha no Balanço.
create or replace function public.card_statement_lines_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_company uuid;
  v_target public.management_accounts%rowtype;
begin
  select company_id into v_company from card_statements where id = new.statement_id;
  if new.company_id is distinct from v_company then
    raise exception 'Linha de fatura precisa ser da mesma empresa da fatura';
  end if;
  if not exists (select 1 from payment_cards where id = new.card_id and company_id = v_company) then
    raise exception 'Cartão da linha não é da empresa da fatura';
  end if;

  if new.management_account_id is not null then
    select * into v_target from management_accounts where id = new.management_account_id;
    if v_target.parent_id is null then
      raise exception 'Linha aponta para item do plano gerencial, não para o grupo "%"', v_target.name;
    end if;
    if v_target.kind not in ('expense', 'financial') then
      raise exception 'Compra de cartão não pode cair em "%" (%)', v_target.name, v_target.kind;
    end if;
    if v_target.organization_id <> (select organization_id from companies where id = new.company_id) then
      raise exception 'Item do plano gerencial é de outra organização';
    end if;
  end if;

  if new.cost_center_id is not null and not exists (
    select 1 from cost_centers cc join companies c on c.organization_id = cc.organization_id
    where cc.id = new.cost_center_id and c.id = new.company_id
  ) then
    raise exception 'Área é de outra organização';
  end if;
  if new.beneficiary_company_id is not null and not exists (
    select 1 from companies b join companies c on c.organization_id = b.organization_id
    where b.id = new.beneficiary_company_id and c.id = new.company_id
  ) then
    raise exception 'Empresa beneficiária é de outra organização';
  end if;

  -- Confirmar é ato de alguém: quem e quando ficam gravados.
  if new.classification_status = 'confirmed'
     and (tg_op = 'INSERT' or old.classification_status is distinct from 'confirmed') then
    new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.classification_status <> 'confirmed' then
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;

  return new;
end;
$$;

create trigger trg_card_lines_check
  before insert or update on public.card_statement_lines
  for each row execute function public.card_statement_lines_check();

-- Uma vez conferida, a fatura não muda de número por baixo: valor, IOF, tipo e cartão
-- da linha ficam travados. Classificar (item, área, natureza, fornecedor) é livre.
create or replace function public.card_statement_lines_lock_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.amount, new.iof_amount, new.line_kind, new.card_id, new.statement_id, new.company_id)
     is distinct from
     (old.amount, old.iof_amount, old.line_kind, old.card_id, old.statement_id, old.company_id) then
    raise exception 'Valor de linha de fatura não se edita: apague a fatura e importe de novo';
  end if;
  return new;
end;
$$;

create trigger trg_card_lines_lock_amounts
  before update on public.card_statement_lines
  for each row execute function public.card_statement_lines_lock_amounts();

-- =============================================================================
-- 5) Timestamps e auditoria
-- =============================================================================
create trigger trg_payment_cards_updated before update on public.payment_cards
  for each row execute function set_updated_at();
create trigger trg_card_statements_updated before update on public.card_statements
  for each row execute function set_updated_at();
create trigger trg_card_lines_updated before update on public.card_statement_lines
  for each row execute function set_updated_at();

create trigger trg_audit_payment_cards after insert or update or delete on public.payment_cards
  for each row execute function audit_record();
create trigger trg_audit_card_statements after insert or update or delete on public.card_statements
  for each row execute function audit_record();
create trigger trg_audit_card_statement_lines after insert or update or delete on public.card_statement_lines
  for each row execute function audit_record();

-- =============================================================================
-- 6) RLS — o padrão de tabela da empresa (CLAUDE.md §RLS)
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['payment_cards', 'card_statements', 'card_statement_lines']
  loop
    execute format('alter table public.%1$I enable row level security', t);
    execute format($f$
      create policy %1$s_sel on public.%1$I
        for select to authenticated
        using (
          (select public.can_view_module('financials'))
          and (
            (select public.is_super_admin())
            or company_id in (
                 select ca.company_id from public.company_access ca
                 where ca.user_id = (select auth.uid())
               )
          )
        );
      create policy %1$s_ins on public.%1$I
        for insert to authenticated
        with check (public.has_company_write_access(company_id));
      create policy %1$s_upd on public.%1$I
        for update to authenticated
        using (public.has_company_write_access(company_id))
        with check (public.has_company_write_access(company_id));
      create policy %1$s_del on public.%1$I
        for delete to authenticated
        using (public.has_company_write_access(company_id));

      create policy oauth_sem_escrita_ins on public.%1$I
        as restrictive for insert to authenticated
        with check ((select auth.jwt() ->> 'client_id') is null);
      create policy oauth_sem_escrita_upd on public.%1$I
        as restrictive for update to authenticated
        using ((select auth.jwt() ->> 'client_id') is null)
        with check ((select auth.jwt() ->> 'client_id') is null);
      create policy oauth_sem_escrita_del on public.%1$I
        as restrictive for delete to authenticated
        using ((select auth.jwt() ->> 'client_id') is null);
    $f$, t);
    -- O Supabase concede tudo a `anon` e `authenticated` em tabela nova (default
    -- privileges): não conceder não basta, é preciso revogar.
    execute format('revoke all on public.%1$I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%1$I from authenticated', t);
    execute format('grant select on public.%1$I to authenticated', t);
  end loop;
end $$;

-- Escrita direta NÃO é concedida, salvo a classificação das linhas. Gravar e apagar
-- fatura são RPCs (`save_card_statement`, `delete_card_statement`): com INSERT/UPDATE
-- liberados, quem pode escrever na empresa marcaria como `reconciled` uma fatura que não
-- fecha, ou poria e tiraria compras de uma fatura conferida — e o Balanço somaria a
-- diferença em silêncio. As policies de escrita acima continuam valendo para a coluna
-- liberada e como segunda trava.
grant update (
  management_account_id, cost_center_id, nature_override, counterparty_id,
  beneficiary_company_id, classification_status, classification_source
) on public.card_statement_lines to authenticated;

-- =============================================================================
-- 7) Gravar uma fatura lida — conferindo no banco
--
-- O payload é o `ParsedStatement` de supabase/functions/_shared/cards/types.ts, em
-- centavos. O banco refaz as três conferências que importam (total, cartão,
-- lançamento, resumo) e decide o status; a lista de conferências do cliente vai só para
-- exibição. `security definer` porque escrita direta nas tabelas da fatura não é
-- concedida (§6): a permissão de escrever na empresa é conferida explicitamente.
--
-- Reimportar: com `p_replace`, a fatura anterior do lançamento é apagada junto com as
-- linhas (e a classificação delas) — é a única forma de mudar um valor de linha.
-- =============================================================================
create or replace function public.save_card_statement(
  p_transaction_id uuid,
  p_statement jsonb,
  p_parser text default 'text',
  p_parser_version text default 'c6-text-1',
  p_file_sha256 text default null,
  p_attachment_id uuid default null,
  p_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary_key text;
  v_summary_label text;
  v_summary_expected bigint;
  v_summary_got bigint;
  v_tx record;
  v_statement_id uuid;
  v_total_cents bigint;
  v_lines_cents bigint;
  v_checks jsonb := '[]'::jsonb;
  v_ok boolean := true;
  v_card jsonb;
  v_card_sum bigint;
  v_line jsonb;
  v_card_id uuid;
  v_ord int := 0;
begin
  select t.id, t.company_id, t.amount, t.direction, m.management_code
    into v_tx
  from transactions t
  join v_account_management_map m on m.account_id = t.account_id
  where t.id = p_transaction_id and t.deleted_at is null;

  if not found then
    raise exception 'Lançamento da fatura não encontrado' using errcode = 'P0002';
  end if;
  if v_tx.direction <> 'outflow' or v_tx.management_code <> 'a_detalhar.cartao' then
    raise exception 'Só um lançamento de saída na conta de cartão (Fatura de cartão) recebe detalhamento'
      using errcode = '22023';
  end if;
  if not public.has_company_write_access(v_tx.company_id) then
    raise exception 'Sem permissão para escrever nesta empresa' using errcode = '42501';
  end if;
  -- `security definer` passa por cima das policies restritivas de OAuth: a trava vai aqui.
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'Token de OAuth não escreve' using errcode = '42501';
  end if;

  if exists (select 1 from card_statements where transaction_id = p_transaction_id) then
    if not p_replace then
      raise exception 'Este lançamento já tem fatura detalhada' using errcode = '23505';
    end if;
    delete from card_statements where transaction_id = p_transaction_id;
  end if;

  -- As conferências, refeitas aqui.
  v_total_cents := (p_statement ->> 'totalCents')::bigint;
  select coalesce(sum(
           case when l ->> 'kind' = 'refund' then -1 else 1 end
           * ((l ->> 'amountCents')::bigint + coalesce((l ->> 'iofCents')::bigint, 0))
         ), 0)
    into v_lines_cents
  from jsonb_array_elements(p_statement -> 'lines') l;

  v_checks := v_checks || jsonb_build_object(
    'code', 'total', 'label', 'Linhas somam o total da fatura',
    'expectedCents', v_total_cents, 'gotCents', v_lines_cents, 'ok', v_total_cents = v_lines_cents);
  v_ok := v_ok and v_total_cents = v_lines_cents;

  for v_card in select value from jsonb_array_elements(p_statement -> 'cards')
  loop
    continue when v_card -> 'subtotalCents' = 'null'::jsonb;
    select coalesce(sum(
             case when l ->> 'kind' = 'refund' then -1 else 1 end
             * ((l ->> 'amountCents')::bigint + coalesce((l ->> 'iofCents')::bigint, 0))
           ), 0)
      into v_card_sum
    from jsonb_array_elements(p_statement -> 'lines') l
    where l ->> 'cardLast4' = v_card ->> 'last4';

    v_checks := v_checks || jsonb_build_object(
      'code', 'card:' || (v_card ->> 'last4'),
      'label', 'Cartão final ' || (v_card ->> 'last4') || ' soma o subtotal impresso',
      'expectedCents', (v_card ->> 'subtotalCents')::bigint, 'gotCents', v_card_sum,
      'ok', (v_card ->> 'subtotalCents')::bigint = v_card_sum);
    v_ok := v_ok and (v_card ->> 'subtotalCents')::bigint = v_card_sum;
  end loop;

  v_checks := v_checks || jsonb_build_object(
    'code', 'ledger', 'label', 'Fatura bate com o lançamento no financeiro',
    'expectedCents', round(v_tx.amount * 100)::bigint, 'gotCents', v_total_cents,
    'ok', round(v_tx.amount * 100)::bigint = v_total_cents);
  v_ok := v_ok and round(v_tx.amount * 100)::bigint = v_total_cents;

  -- O resumo impresso (nacionais, internacionais, IOF), quando a fatura traz. É o que
  -- pega a compra lida com moeda trocada, que mantém o total mas muda a natureza.
  for v_summary_key, v_summary_label in
    select * from (values
      ('domesticCents', 'Compras nacionais'),
      ('internationalCents', 'Compras internacionais'),
      ('iofCents', 'IOF de compras internacionais')
    ) as x(k, l)
  loop
    continue when coalesce(p_statement -> 'summary' -> v_summary_key, 'null'::jsonb) = 'null'::jsonb;
    v_summary_expected := (p_statement -> 'summary' ->> v_summary_key)::bigint;
    select coalesce(sum(
             case
               when v_summary_key = 'iofCents' then
                 coalesce((l ->> 'iofCents')::bigint, 0)
                 + case when l ->> 'kind' = 'fee' and l ->> 'description' like 'IOF %'
                        then (l ->> 'amountCents')::bigint else 0 end
               when l ->> 'kind' in ('purchase', 'refund')
                    and (l ->> 'currency') = case when v_summary_key = 'domesticCents' then 'BRL' else 'USD' end
                 then case when l ->> 'kind' = 'refund' then -1 else 1 end * (l ->> 'amountCents')::bigint
               else 0
             end), 0)
      into v_summary_got
    from jsonb_array_elements(p_statement -> 'lines') l;

    v_checks := v_checks || jsonb_build_object(
      'code', case v_summary_key when 'domesticCents' then 'domestic'
                                 when 'internationalCents' then 'international' else 'iof' end,
      'label', v_summary_label, 'expectedCents', v_summary_expected, 'gotCents', v_summary_got,
      'ok', v_summary_expected = v_summary_got);
    v_ok := v_ok and v_summary_expected = v_summary_got;
  end loop;

  insert into card_statements (
    company_id, transaction_id, issuer, closing_date, due_date, total_amount, summary,
    validation, warnings, status, parser, parser_version, file_sha256, attachment_id, created_by
  ) values (
    v_tx.company_id, p_transaction_id, p_statement ->> 'issuer',
    (p_statement ->> 'closingDate')::date, (p_statement ->> 'dueDate')::date,
    v_total_cents / 100.0, coalesce(p_statement -> 'summary', '{}'::jsonb),
    v_checks, coalesce(p_statement -> 'warnings', '[]'::jsonb),
    case when v_ok then 'reconciled' else 'needs_review' end::card_statement_status,
    p_parser, p_parser_version, p_file_sha256, p_attachment_id, auth.uid()
  )
  returning id into v_statement_id;

  for v_card in select value from jsonb_array_elements(p_statement -> 'cards')
  loop
    insert into payment_cards (company_id, issuer, last4, kind, holder_name)
    values (v_tx.company_id, p_statement ->> 'issuer', v_card ->> 'last4', v_card ->> 'kind',
            v_card ->> 'holderName')
    on conflict (company_id, issuer, last4)
      do update set holder_name = excluded.holder_name, kind = excluded.kind;
  end loop;

  for v_line in select value from jsonb_array_elements(p_statement -> 'lines')
  loop
    v_ord := v_ord + 1;
    select id into v_card_id from payment_cards
    where company_id = v_tx.company_id and issuer = p_statement ->> 'issuer'
      and last4 = v_line ->> 'cardLast4';
    if v_card_id is null then
      raise exception 'Linha do cartão final % sem cartão na fatura', v_line ->> 'cardLast4';
    end if;

    insert into card_statement_lines (
      statement_id, company_id, card_id, sort_order, purchase_date, description, line_kind,
      amount, currency, amount_original, fx_rate, iof_amount, installment_n, installment_total
    ) values (
      v_statement_id, v_tx.company_id, v_card_id, v_ord, (v_line ->> 'purchaseDate')::date,
      v_line ->> 'description', (v_line ->> 'kind')::card_line_kind,
      (v_line ->> 'amountCents')::bigint / 100.0, v_line ->> 'currency',
      (v_line ->> 'amountOriginalCents')::bigint / 100.0, (v_line ->> 'fxRate')::numeric,
      coalesce((v_line ->> 'iofCents')::bigint, 0) / 100.0,
      (v_line ->> 'installmentN')::int, (v_line ->> 'installmentTotal')::int
    );
  end loop;

  return jsonb_build_object(
    'id', v_statement_id,
    'status', case when v_ok then 'reconciled' else 'needs_review' end
  );
end;
$$;

revoke all on function public.save_card_statement(uuid, jsonb, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.save_card_statement(uuid, jsonb, text, text, text, uuid, boolean) to authenticated;

-- Apagar o detalhamento: as compras e a classificação vão embora, o lançamento fica.
create or replace function public.delete_card_statement(p_statement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'Token de OAuth não escreve' using errcode = '42501';
  end if;
  select company_id into v_company from card_statements where id = p_statement_id;
  if v_company is null or not public.has_company_write_access(v_company) then
    raise exception 'Fatura não encontrada ou sem permissão' using errcode = '42501';
  end if;
  delete from card_statements where id = p_statement_id;
end;
$$;

revoke all on function public.delete_card_statement(uuid) from public, anon;
grant execute on function public.delete_card_statement(uuid) to authenticated;

-- O lançamento-pai mudou de valor, sinal ou conta depois de conferido: as compras
-- deixariam de somar o lançamento e a visão gerencial divergiria do DRE em silêncio.
-- A fatura volta para conferência (e o lançamento volta a aparecer inteiro).
create or replace function public.card_statement_parent_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update card_statements s
  set status = 'needs_review',
      validation = s.validation || jsonb_build_array(jsonb_build_object(
        'code', 'ledger_changed',
        'label', 'O lançamento da fatura mudou depois da conferência — reimporte',
        'expectedCents', round(new.amount * 100)::bigint,
        'gotCents', round(s.total_amount * 100)::bigint,
        'ok', false))
  where s.transaction_id = new.id
    and s.status = 'reconciled';
  return new;
end;
$$;

create trigger trg_tx_card_statement_parent_changed
  after update of amount, direction, account_id, company_id on public.transactions
  for each row
  when ((old.amount, old.direction, old.account_id, old.company_id)
        is distinct from (new.amount, new.direction, new.account_id, new.company_id))
  execute function public.card_statement_parent_changed();

-- Lançamentos de fatura de cartão ainda sem detalhamento, para a tela de importação. A
-- exclusão dos já detalhados é aqui, antes do limite — no cliente, um limite aplicado
-- antes do filtro escondia as faturas mais antigas.
create or replace function public.pending_card_invoice_transactions(
  p_company_ids uuid[] default null,
  p_limit int default 60
)
returns table (
  id uuid, company_id uuid, accrual_date date, cash_date date, amount numeric, description text
)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, t.company_id, t.accrual_date, t.cash_date, t.amount, t.description
  from public.transactions t
  join public.v_account_management_map m on m.account_id = t.account_id
  where m.management_code = 'a_detalhar.cartao'
    and t.direction = 'outflow'
    and t.status in ('settled', 'reconciled', 'pending')
    and t.deleted_at is null
    and (p_company_ids is null or t.company_id = any(p_company_ids))
    and not exists (select 1 from public.card_statements s where s.transaction_id = t.id)
  order by t.accrual_date desc
  limit greatest(1, least(coalesce(p_limit, 60), 500));
$$;

comment on function public.save_card_statement(uuid, jsonb, text, text, text, uuid, boolean) is
  'Grava a fatura lida (ParsedStatement em centavos) no lançamento da fatura, refazendo as conferências no banco. reconciled só se total, subtotais, resumo e lançamento baterem. Devolve {id, status}.';

-- =============================================================================
-- 8) A camada gerencial abre a fatura conferida
--
-- O lançamento da fatura `reconciled` sai, as linhas dela entram — com a data, o status e
-- a empresa do lançamento-pai (é a competência que bate com o DRE). Linha sem item herda
-- o do pai. `source`/`source_id` dizem de onde veio a linha, para a gaveta do Balanço.
-- =============================================================================
create or replace view public.v_management_lines with (security_invoker = true) as
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
                           as nature,
  'ledger'::text           as source,
  t.id                     as source_id
from public.transactions t
left join public.v_account_management_map m on m.account_id = t.account_id
where t.deleted_at is null
  and not exists (
    select 1 from public.card_statements s
    where s.transaction_id = t.id and s.status = 'reconciled'
  )
union all
select
  t.id,
  t.company_id,
  t.account_id,
  t.accrual_date,
  t.cash_date,
  t.status,
  case when l.line_kind = 'refund' then 'inflow' else 'outflow' end::public.transaction_direction,
  (l.amount + l.iof_amount)::numeric(18,2),
  l.description,
  null::text,
  coalesce(l.counterparty_id, t.counterparty_id),
  coalesce(l.cost_center_id, t.cost_center_id),
  coalesce(l.management_account_id, m.management_account_id),
  case when l.management_account_id is null then m.management_group_id else ma.parent_id end,
  coalesce(ma.kind, m.management_kind),
  case
    when coalesce(ma.kind, m.management_kind) = 'expense'
      then coalesce(l.nature_override, ma.nature, m.nature)
  end,
  'card'::text,
  l.id
from public.card_statement_lines l
join public.card_statements s on s.id = l.statement_id and s.status = 'reconciled'
join public.transactions t on t.id = s.transaction_id and t.deleted_at is null
left join public.v_account_management_map m on m.account_id = t.account_id
left join public.management_accounts ma on ma.id = l.management_account_id;

comment on view public.v_management_lines is
  'Lançamentos ativos — com a fatura de cartão conferida aberta em compras — com item do plano gerencial, grupo, natureza efetiva e área. Base do Balanço e da Central de Gastos.';

-- A gaveta do Balanço lista linha de fatura como lançamento próprio: o id passa a ser o
-- `source_id`, e `source` diz se é lançamento ou compra de cartão.
drop function public.management_line_transactions(date, date, public.accounting_basis, jsonb, uuid[], int);

create function public.management_line_transactions(
  p_from date,
  p_to date,
  p_basis public.accounting_basis,
  p_keys jsonb,
  p_company_ids uuid[] default null,
  p_limit int default 500
)
returns table (
  id                 uuid,
  transaction_id     uuid,
  source             text,
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
    x.source_id, x.transaction_id, x.source, x.accrual_date, x.cash_date, x.description,
    x.amount, x.direction, x.status, x.document_ref, a.code, a.name, x.cost_center_id,
    cc.name, cp.name, count(*) over ()
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
  'Lançamentos (e compras de fatura conferida) das chaves (item, área, natureza, direção) de uma linha do Balanço. id = source_id; total_count conta tudo, mesmo acima do limite.';

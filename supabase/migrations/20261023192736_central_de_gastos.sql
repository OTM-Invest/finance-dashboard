-- =============================================================================
-- Central de Gastos (Fase 5) — as leituras da tela `/gastos` e da tool de MCP
-- `management_breakdown`.
--
-- Nada novo é gravado: as três funções leem `v_management_lines`, a mesma camada do
-- Balanço, com a mesma população (status e data por regime) de
-- `management_monthly_series_multi`. Todas `security invoker`, no padrão
-- `p_company_ids uuid[] default null` (null = empresas não-holding visíveis).
--
--   1) management_breakdown_multi  — gasto agregado por empresa × item × área ×
--      natureza × origem × fornecedor × moeda, com os meses em que apareceu.
--   2) management_card_summary     — gasto por cartão (portador), USD, IOF e parcelas
--      a vencer.
--   3) management_reconciliation   — camada gerencial × lançamentos, por empresa/mês.
--      Tem que dar zero: a camada reclassifica, nunca cria nem some com dinheiro.
--
-- O que a tela faz com as linhas (panorama, recorrência, duplicadas entre empresas)
-- tem UMA implementação: `supabase/functions/_shared/management/breakdown.ts`,
-- reexportada pelo app e usada pelo MCP.
-- =============================================================================

-- =============================================================================
-- 1) Gasto agregado
--
-- Só item de natureza `expense` (inclui "A detalhar", que é gasto ainda não aberto).
-- Receita, tributo, resultado financeiro e distribuição não são gasto.
--
-- Fornecedor: na compra de cartão, o nome da regra que a classificou ("Meta Ads"), senão
-- a contraparte, senão a descrição normalizada; no lançamento, a contraparte. A chave
-- é o nome em maiúsculas — é o que deixa ver o mesmo fornecedor em duas empresas
-- (contraparte é cadastro de cada empresa, uuid não casa entre elas).
--
-- `p_by_vendor = false` devolve fornecedor nulo: o agregado fica pequeno, para
-- comparação de períodos e para o MCP (que lê no máximo 1000 linhas por chamada).
-- `p_codes` recorta por código de item OU de grupo (`tecnologia`, `tecnologia.ia`).
-- =============================================================================
create or replace function public.management_breakdown_multi(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null,
  p_by_vendor boolean default true,
  p_codes text[] default null
)
returns table (
  company_id             uuid,
  management_account_id  uuid,
  management_group_id    uuid,
  cost_center_id         uuid,
  nature                 public.expense_nature,
  source                 text,
  requires_detail        boolean,
  vendor_key             text,
  vendor_name            text,
  currency               text,
  outflow                numeric,
  inflow                 numeric,
  amount_usd             numeric,
  iof_amount             numeric,
  line_count             int,
  months                 date[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      v.company_id,
      v.management_account_id,
      v.management_group_id,
      v.cost_center_id,
      v.nature,
      v.source,
      v.direction,
      v.amount,
      (ma.requires_detail or coalesce(mg.requires_detail, false)) as requires_detail,
      case when p_by_vendor then
        nullif(btrim(coalesce(
          r.name,
          cp.name,
          case when v.source = 'card' then public.normalize_card_description(l.description) end
        )), '')
      end as vname,
      coalesce(l.currency, 'BRL') as currency,
      case when l.currency = 'USD' then l.amount_original end as amount_usd,
      coalesce(l.iof_amount, 0) as iof_amount,
      date_trunc(
        'month',
        case when p_basis = 'cash' then v.cash_date else v.accrual_date end
      )::date as month
    from public.v_management_lines v
    join public.management_accounts ma on ma.id = v.management_account_id
    left join public.management_accounts mg on mg.id = v.management_group_id
    left join public.card_statement_lines l on v.source = 'card' and l.id = v.source_id
    left join public.classification_rules r on r.id = l.rule_id
    left join public.counterparties cp on cp.id = v.counterparty_id
    where v.management_kind = 'expense'
      and v.company_id = any(
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
      and (p_codes is null or ma.code = any(p_codes) or mg.code = any(p_codes))
  )
  select
    b.company_id,
    b.management_account_id,
    b.management_group_id,
    b.cost_center_id,
    b.nature,
    b.source,
    b.requires_detail,
    upper(b.vname) as vendor_key,
    min(b.vname) as vendor_name,
    b.currency,
    sum(case when b.direction = 'outflow' then b.amount else 0 end) as outflow,
    sum(case when b.direction = 'inflow'  then b.amount else 0 end) as inflow,
    sum(case when b.direction = 'inflow' then -b.amount_usd else b.amount_usd end) as amount_usd,
    sum(case when b.direction = 'inflow' then -b.iof_amount else b.iof_amount end) as iof_amount,
    count(*)::int as line_count,
    array_agg(distinct b.month order by b.month) as months
  from base b
  group by b.company_id, b.management_account_id, b.management_group_id, b.cost_center_id,
           b.nature, b.source, b.requires_detail, upper(b.vname), b.currency;
$$;

comment on function public.management_breakdown_multi(date, date, public.accounting_basis, uuid[], boolean, text[]) is
  'Gasto gerencial (itens de natureza expense) por empresa × item × área × natureza × origem × fornecedor × moeda, com os meses em que apareceu. Fonte da Central de Gastos e da tool management_breakdown. p_company_ids null = empresas não-holding visíveis; p_by_vendor false = sem fornecedor; p_codes = códigos de item ou grupo.';

revoke all on function public.management_breakdown_multi(date, date, public.accounting_basis, uuid[], boolean, text[]) from public, anon;
grant execute on function public.management_breakdown_multi(date, date, public.accounting_basis, uuid[], boolean, text[]) to authenticated;

-- =============================================================================
-- 2) Gasto por cartão
--
-- Só fatura conferida (`reconciled`) — é a única cujas compras contam na camada. A data
-- é a do lançamento da fatura, pelo mesmo regime da Central: o total por cartão fecha
-- com o que a Central mostra na origem "cartão".
--
-- Parcelas a vencer: da fatura mais recente do cartão no período, o que falta das
-- compras parceladas (valor × parcelas restantes). Não soma faturas antigas, que já
-- tiveram a parcela seguinte cobrada na fatura seguinte.
-- =============================================================================
create or replace function public.management_card_summary(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null
)
returns table (
  company_id            uuid,
  card_id               uuid,
  last4                 text,
  holder_name           text,
  kind                  text,
  statement_count       int,
  outflow               numeric,
  inflow                numeric,
  amount_usd            numeric,
  iof_amount            numeric,
  unconfirmed_amount    numeric,
  future_installments   numeric,
  last_closing_date     date
)
language sql
stable
security invoker
set search_path = public
as $$
  with lines as (
    select l.*, s.closing_date,
           max(s.closing_date) over (partition by l.card_id) as last_closing
    from public.card_statement_lines l
    join public.card_statements s on s.id = l.statement_id and s.status = 'reconciled'
    join public.transactions t on t.id = s.transaction_id and t.deleted_at is null
    where l.company_id = any(
            coalesce(
              p_company_ids,
              (select array_agg(c.id) from public.companies c where c.is_holding = false)
            )
          )
      and case
            when p_basis = 'cash'
              then t.status in ('settled', 'reconciled')
               and t.cash_date between p_from and p_to
            else t.status in ('settled', 'reconciled', 'pending')
               and t.accrual_date between p_from and p_to
          end
  )
  select
    x.company_id,
    x.card_id,
    pc.last4,
    pc.holder_name,
    pc.kind,
    count(distinct x.statement_id)::int,
    sum(case when x.line_kind = 'refund' then 0 else x.amount + x.iof_amount end),
    sum(case when x.line_kind = 'refund' then x.amount + x.iof_amount else 0 end),
    sum(case when x.currency <> 'USD' then 0
             when x.line_kind = 'refund' then -x.amount_original
             else x.amount_original end),
    sum(case when x.line_kind = 'refund' then -x.iof_amount else x.iof_amount end),
    sum(case when x.classification_status = 'confirmed' then 0
             when x.line_kind = 'refund' then -(x.amount + x.iof_amount)
             else x.amount + x.iof_amount end),
    sum(case when x.closing_date = x.last_closing
              and x.line_kind <> 'refund'
              and x.installment_total > x.installment_n
             then x.amount * (x.installment_total - x.installment_n)
             else 0 end),
    max(x.closing_date)
  from lines x
  join public.payment_cards pc on pc.id = x.card_id
  group by x.company_id, x.card_id, pc.last4, pc.holder_name, pc.kind;
$$;

comment on function public.management_card_summary(date, date, public.accounting_basis, uuid[]) is
  'Gasto por cartão nas faturas conferidas do período (data do lançamento da fatura, pelo regime): total, estornos, USD, IOF, ainda não classificado e parcelas a vencer da última fatura.';

revoke all on function public.management_card_summary(date, date, public.accounting_basis, uuid[]) from public, anon;
grant execute on function public.management_card_summary(date, date, public.accounting_basis, uuid[]) to authenticated;

-- =============================================================================
-- 3) Conferência: camada gerencial × lançamentos
--
-- Por empresa e mês, o líquido (entradas − saídas) da camada tem que ser o dos
-- lançamentos. Os lados brutos podem diferir (o estorno de uma compra vira entrada na
-- camada e só reduz a saída no lançamento da fatura); o líquido, não. Diferença ≠ 0 é
-- defeito — a tela avisa.
-- =============================================================================
create or replace function public.management_reconciliation(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null
)
returns table (
  company_id      uuid,
  month           date,
  ledger_inflow   numeric,
  ledger_outflow  numeric,
  layer_inflow    numeric,
  layer_outflow   numeric,
  difference      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with scope as (
    select coalesce(
      p_company_ids,
      (select array_agg(c.id) from public.companies c where c.is_holding = false)
    ) as ids
  ),
  ledger as (
    select
      t.company_id,
      date_trunc('month', case when p_basis = 'cash' then t.cash_date else t.accrual_date end)::date as month,
      sum(case when t.direction = 'inflow'  then t.amount else 0 end) as inflow,
      sum(case when t.direction = 'outflow' then t.amount else 0 end) as outflow
    from public.transactions t, scope
    where t.deleted_at is null
      and t.company_id = any(scope.ids)
      and case
            when p_basis = 'cash'
              then t.status in ('settled', 'reconciled')
               and t.cash_date between p_from and p_to
            else t.status in ('settled', 'reconciled', 'pending')
               and t.accrual_date between p_from and p_to
          end
    group by 1, 2
  ),
  layer as (
    select
      v.company_id,
      date_trunc('month', case when p_basis = 'cash' then v.cash_date else v.accrual_date end)::date as month,
      sum(case when v.direction = 'inflow'  then v.amount else 0 end) as inflow,
      sum(case when v.direction = 'outflow' then v.amount else 0 end) as outflow
    from public.v_management_lines v, scope
    where v.company_id = any(scope.ids)
      and case
            when p_basis = 'cash'
              then v.status in ('settled', 'reconciled')
               and v.cash_date between p_from and p_to
            else v.status in ('settled', 'reconciled', 'pending')
               and v.accrual_date between p_from and p_to
          end
    group by 1, 2
  )
  select
    coalesce(l.company_id, g.company_id),
    coalesce(l.month, g.month),
    coalesce(l.inflow, 0),
    coalesce(l.outflow, 0),
    coalesce(g.inflow, 0),
    coalesce(g.outflow, 0),
    (coalesce(g.inflow, 0) - coalesce(g.outflow, 0)) - (coalesce(l.inflow, 0) - coalesce(l.outflow, 0))
  from ledger l
  full join layer g on g.company_id = l.company_id and g.month = l.month;
$$;

comment on function public.management_reconciliation(date, date, public.accounting_basis, uuid[]) is
  'Conferência da camada gerencial: por empresa e mês, líquido de v_management_lines × líquido dos lançamentos. difference tem que ser zero.';

revoke all on function public.management_reconciliation(date, date, public.accounting_basis, uuid[]) from public, anon;
grant execute on function public.management_reconciliation(date, date, public.accounting_basis, uuid[]) to authenticated;

-- =============================================================================
-- 4) A migration se confere: no banco inteiro, a camada fecha com os lançamentos.
-- =============================================================================
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
  from public.management_reconciliation(
    '1900-01-01', '2999-12-31', 'accrual',
    (select array_agg(id) from public.companies)
  ) r
  where r.difference <> 0;
  assert v_bad = 0, format('%s empresa/mês em que a camada gerencial não fecha com os lançamentos', v_bad);
end $$;

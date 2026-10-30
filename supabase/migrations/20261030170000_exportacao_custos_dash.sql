-- =============================================================================
-- Exportação de custos para o RCO Dash (staff)
--
-- O staff do RCO Dash calcula a margem por cliente e precisa do custo real da
-- plataforma (servidor, IA, dados de mercado, open finance…). Esses gastos vivem aqui,
-- espalhados entre empresas do grupo: a RCO Tecnologia paga a maior parte, mas a OTM
-- Assessoria paga GitHub/Supabase/Resend e a Jimmy paga Pluggy, Partnr, B3.
--
-- O filtro roda AQUI, não no Dash: só sai o que está na lista `dash_cost_vendors`
-- (empresa + fornecedor), somado por mês. Nada de lançamento a lançamento, descrição,
-- contraparte ou gasto de outra empresa que não esteja na lista.
--
--   1) dash_cost_vendors   — a lista (empresa × chave de fornecedor × área).
--   2) dash_cost_export    — o gasto mensal dos fornecedores da lista, lido de
--      `management_breakdown_multi` (a mesma regra de fornecedor da Central de Gastos).
--
-- Quem chama é a Edge Function `dash-cost-export` (service role, chave própria).
-- =============================================================================

-- =============================================================================
-- 1) A lista
--
-- `vendor_key` é a chave de fornecedor da Central (nome em maiúsculas: regra da compra
-- de cartão › contraparte › descrição normalizada). Por empresa, porque o mesmo
-- fornecedor pode ser nosso numa empresa e não na outra (Anthropic da RCO entra, a da
-- Jimmy ainda não).
-- =============================================================================
create table public.dash_cost_vendors (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  vendor_key  text not null check (vendor_key = upper(btrim(vendor_key)) and vendor_key <> ''),
  area        text not null default 'plataforma'
              check (area in ('plataforma', 'research', 'administrativo')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, vendor_key)
);

comment on table public.dash_cost_vendors is
  'Fornecedores cujo gasto mensal é exportado para o staff do RCO Dash (dash_cost_export). Empresa + chave de fornecedor da Central de Gastos.';

create trigger trg_dash_cost_vendors_updated before update on public.dash_cost_vendors
  for each row execute function set_updated_at();
create trigger trg_audit_dash_cost_vendors after insert or update or delete on public.dash_cost_vendors
  for each row execute function audit_record();

alter table public.dash_cost_vendors enable row level security;

create policy dash_cost_vendors_sel on public.dash_cost_vendors
  for select to authenticated
  using ((select public.is_super_admin()));
create policy dash_cost_vendors_all on public.dash_cost_vendors
  for all to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create policy oauth_sem_escrita_ins on public.dash_cost_vendors
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.dash_cost_vendors
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.dash_cost_vendors
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

revoke all on public.dash_cost_vendors from anon;
revoke truncate, references, trigger on public.dash_cost_vendors from authenticated;
grant select, insert, update, delete on public.dash_cost_vendors to authenticated;

-- Lista combinada em 27/10/2026: só a plataforma do Dash. Research (Bloomberg, Apimec)
-- e administrativo ficam fora; OpenAI e Anthropic pagos pela Jimmy ficam fora até
-- alguém separar o que é do Dash. Empresa que não existe no banco (local) é ignorada.
insert into public.dash_cost_vendors (company_id, vendor_key)
select c.id, v.vendor_key
from (values
  ('00000000-0000-0000-0000-000000000013'::uuid, 'AMAZON WEB SERVICES'),
  ('00000000-0000-0000-0000-000000000013', 'ANTHROPIC'),
  ('00000000-0000-0000-0000-000000000013', 'CEDRO SISTEMAS E TECNOLOGIA'),
  ('00000000-0000-0000-0000-000000000013', 'CLOUDFLARE'),
  ('00000000-0000-0000-0000-000000000013', 'FINANCIAL MODELING PREP'),
  ('00000000-0000-0000-0000-000000000013', 'GOOGLE CLOUD'),
  ('00000000-0000-0000-0000-000000000013', 'LATITUDE.SH'),
  ('00000000-0000-0000-0000-000000000013', 'OPENAI'),
  ('00000000-0000-0000-0000-000000000013', 'SENTRY'),
  ('00000000-0000-0000-0000-000000000013', 'SUPABASE'),
  ('00000000-0000-0000-0000-000000000011', 'COOLIFY'),
  ('00000000-0000-0000-0000-000000000011', 'GITHUB'),
  ('00000000-0000-0000-0000-000000000011', 'RESEND'),
  ('00000000-0000-0000-0000-000000000011', 'SUPABASE'),
  ('2914e0d3-b4f8-4fa3-96ef-9f3da750562b', 'B3 SA BRASIL BOLSA BALCAO'),
  ('2914e0d3-b4f8-4fa3-96ef-9f3da750562b', 'OPENROUTER'),
  ('2914e0d3-b4f8-4fa3-96ef-9f3da750562b', 'PANDA VIDEO'),
  ('2914e0d3-b4f8-4fa3-96ef-9f3da750562b', 'PARTNR APLICATIVO DE DADOS FINANCEIROS E CONTÁBEIS'),
  ('2914e0d3-b4f8-4fa3-96ef-9f3da750562b', 'PLUGGY BRASIL')
) as v (company_id, vendor_key)
join public.companies c on c.id = v.company_id
on conflict (company_id, vendor_key) do nothing;

-- =============================================================================
-- 2) O gasto mensal
--
-- Regime de competência (o mesmo padrão da Central): settled + reconciled + pending,
-- datado por `accrual_date`. Um `management_breakdown_multi` por mês, porque ele agrega
-- o período inteiro; o recorte por empresa vem da lista, e o join por
-- (empresa, chave) descarta todo o resto antes de sair.
--
-- Valor = saída − entrada (estorno reduz), em centavos. O item gerencial vai junto
-- (`tecnologia.ia`, `tecnologia.infra`…) para o staff separar IA de servidor.
--
-- `security definer` porque quem chama é a service role, sem usuário; execução só para
-- ela. Janela limitada a 24 meses.
-- =============================================================================
create or replace function public.dash_cost_export(p_from date, p_to date)
returns table (
  month          date,
  company_name   text,
  vendor_key     text,
  vendor_name    text,
  area           text,
  item_code      text,
  item_name      text,
  amount_cents   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'período inválido' using errcode = '22023';
  end if;
  if p_to > (p_from + interval '24 months')::date then
    raise exception 'período maior que 24 meses' using errcode = '22023';
  end if;

  return query
  with months as (
    select m::date as m_from,
           least((m + interval '1 month')::date - 1, p_to) as m_to
    from generate_series(date_trunc('month', p_from), p_to, interval '1 month') as m
  ),
  scope as (
    select array_agg(distinct v.company_id) as ids from public.dash_cost_vendors v
  )
  select
    mo.m_from,
    c.trade_name,
    b.vendor_key,
    min(b.vendor_name),
    v.area,
    ma.code,
    min(ma.name),
    round(sum(b.outflow - b.inflow) * 100)::bigint
  from months mo
  cross join scope s
  cross join lateral public.management_breakdown_multi(
    greatest(mo.m_from, p_from), mo.m_to, 'accrual', s.ids, true, null
  ) b
  join public.dash_cost_vendors v
    on v.company_id = b.company_id and v.vendor_key = b.vendor_key
  join public.companies c on c.id = b.company_id
  join public.management_accounts ma on ma.id = b.management_account_id
  where s.ids is not null
  group by mo.m_from, c.trade_name, b.vendor_key, v.area, ma.code
  having sum(b.outflow - b.inflow) <> 0;
end;
$$;

comment on function public.dash_cost_export(date, date) is
  'Gasto mensal (competência, centavos) dos fornecedores de dash_cost_vendors, para o staff do RCO Dash. Só service role.';

revoke all on function public.dash_cost_export(date, date) from public, anon, authenticated;
grant execute on function public.dash_cost_export(date, date) to service_role;

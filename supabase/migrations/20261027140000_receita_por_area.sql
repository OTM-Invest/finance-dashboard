-- =============================================================================
-- Receita por área — o lançamento mensal do BTG aberto em assessor × produto
--
-- Hoje a receita do BTG entra como UM lançamento por relatório por mês (conta `1.01`,
-- contraparte BTG Pactual): PJ1 na OTM Assessoria, PJ2 e finder na OTM Corretora. O CRM
-- (`otm-invest-crm`) tem o relatório linha a linha, com identidade de arquivo
-- (`btg_commission_reports`) e duas RPCs de leitura (`finance_commission_report` e
-- `finance_commission_report_lines`). Esta migration traz esse detalhe para o financeiro e
-- o pendura no lançamento, como a fatura de cartão faz com as compras
-- (`…_faturas_de_cartao.sql`). Ver docs/features/receita-por-area.md.
--
-- Cinco peças:
--   1) itens de receita do BTG no plano gerencial e o de-para categoria × produto → item;
--   2) `employees.btg_advisor_code` — o assessor do BTG é ligado ao colaborador PELO
--      CÓDIGO, nunca pelo nome; a área é a área ATUAL do colaborador, lida na hora;
--   3) espelho dos relatórios do CRM (`crm_commission_reports`/`_lines`), gravado só pela
--      Edge Function `crm-revenue-sync` com o usuário de serviço do CRM;
--   4) o statement: um lançamento ↔ um CONJUNTO de relatórios do mesmo tipo (um mês de PJ1
--      pode vir em vários arquivos), conferido pelo BANCO em `save_revenue_statement`;
--   5) o ramo `revenue` de `v_management_lines`: statement conferido troca o lançamento
--      pelas linhas, com o mesmo líquido. `management_reconciliation` continua zero.
--
-- A REGRA QUE NÃO PODE QUEBRAR. O statement só substitui o lançamento se for
-- `reconciled`: as linhas somam o lançamento AO CENTAVO. Quando o relatório não bate com
-- o pago (abr/26: −7.868), o banco grava uma linha explícita "Diferença relatório × nota",
-- sem área, que faz fechar — e o statement fica `needs_review` até uma pessoa aceitar a
-- diferença com uma justificativa (decisão D1 do dono, 27/10/2026). Nunca parcialmente.
-- =============================================================================

-- =============================================================================
-- 1) Itens de receita do BTG no plano gerencial
--
-- Template igual para qualquer organização, como o resto do plano; em função própria
-- (e trigger) para organização criada depois também nascer com eles. Idempotente.
-- `receitas.btg_deducoes` guarda o que o BTG desconta antes de pagar (fee de plataforma,
-- erro operacional, custos) — decisão D3: dedução de receita, a confirmar com a
-- contabilidade. `receitas.btg_diferenca` é a linha da D1.
-- =============================================================================
create or replace function public.seed_btg_revenue_items(p_organization_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
  v_inserted int := 0;
  v_count int;
  r record;
begin
  select id into v_group from management_accounts
  where organization_id = p_organization_id and code = 'receitas';
  if v_group is null then
    return 0;
  end if;

  for r in
    select * from (values
      ('receitas.btg_bolsa',               'BTG · Corretagem de bolsa',               110),
      ('receitas.btg_bmf',                 'BTG · Corretagem BMF',                    111),
      ('receitas.btg_aluguel',             'BTG · Aluguel de ações',                  112),
      ('receitas.btg_rv_outras',           'BTG · Ofertas e outros de renda variável', 113),
      ('receitas.btg_estruturadas',        'BTG · Operações estruturadas',            114),
      ('receitas.btg_fee_fixo',            'BTG · Fee fixo',                          115),
      ('receitas.btg_renda_fixa',          'BTG · Renda fixa',                        116),
      ('receitas.btg_fundos',              'BTG · Fundos',                            117),
      ('receitas.btg_saldo_remunerado',    'BTG · Saldo remunerado',                  118),
      ('receitas.btg_cripto',              'BTG · Criptomoedas',                      119),
      ('receitas.btg_previdencia_seguros', 'BTG · Previdência e seguros',             120),
      ('receitas.btg_conta_virada',        'BTG · Conta virada',                      121),
      ('receitas.btg_cambio',              'BTG · Câmbio',                            122),
      ('receitas.btg_banking',             'BTG · Cartão, crédito e PME',             123),
      ('receitas.btg_outras',              'BTG · Outras receitas',                   124),
      ('receitas.btg_deducoes',            'BTG · Deduções (fee de plataforma, erro, custos)', 125),
      ('receitas.btg_diferenca',           'BTG · Diferença relatório × nota',        126)
    ) as x(code, name, sort_order)
  loop
    insert into management_accounts (organization_id, parent_id, code, name, kind, sort_order)
    values (p_organization_id, v_group, r.code, r.name, 'revenue', r.sort_order)
    on conflict (organization_id, code) do nothing;
    get diagnostics v_count = row_count;
    v_inserted := v_inserted + v_count;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.seed_btg_revenue_items(uuid) from public, anon, authenticated;

-- =============================================================================
-- 2) De-para: categoria × produto do BTG → item gerencial
--
-- `product` nulo é curinga da categoria; o par exato ganha do curinga. Combinação que
-- nenhuma regra pega cai em "BTG · Outras receitas" — e a tela de conferência avisa.
-- =============================================================================
create table public.revenue_category_map (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  category               text not null check (length(btrim(category)) > 0),
  product                text check (product is null or length(btrim(product)) > 0),
  management_account_id  uuid not null references public.management_accounts(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index uq_revenue_category_map
  on public.revenue_category_map (organization_id, category, coalesce(product, ''));

comment on table public.revenue_category_map is
  'De-para da receita do BTG: categoria × produto (produto nulo = curinga) → item de receita do plano gerencial. O par exato ganha do curinga; sem regra cai em receitas.btg_outras.';

create or replace function public.revenue_category_map_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item public.management_accounts%rowtype;
begin
  select * into v_item from management_accounts where id = new.management_account_id;
  if v_item.parent_id is null then
    raise exception 'De-para aponta para item do plano gerencial, não para o grupo "%"', v_item.name;
  end if;
  if v_item.kind <> 'revenue' then
    raise exception 'Receita do BTG só cai em item de receita, não em "%" (%)', v_item.name, v_item.kind;
  end if;
  if v_item.organization_id <> new.organization_id then
    raise exception 'Item do plano gerencial é de outra organização';
  end if;
  if v_item.code = 'receitas.btg_diferenca' then
    raise exception '"%" é reservado para a diferença relatório × nota', v_item.name;
  end if;
  return new;
end;
$$;

create trigger trg_revenue_category_map_check
  before insert or update on public.revenue_category_map
  for each row execute function public.revenue_category_map_check();

create trigger trg_revenue_category_map_updated before update on public.revenue_category_map
  for each row execute function set_updated_at();

-- Regras iniciais: as combinações do BTG de out/2025 a set/2026 (lidas no CRM em
-- 27/10/2026). Dado de referência — o vocabulário do BTG, igual para qualquer ambiente.
create or replace function public.seed_revenue_category_map(p_organization_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into revenue_category_map (organization_id, category, product, management_account_id)
  select p_organization_id, r.category, r.product, ma.id
  from (values
    ('RENDA VARIAVEL',                  'BOLSA',           'receitas.btg_bolsa'),
    ('RENDA VARIAVEL',                  'BMF',             'receitas.btg_bmf'),
    ('RENDA VARIAVEL',                  'ALUGUEL',         'receitas.btg_aluguel'),
    ('RENDA VARIAVEL',                  'FEE FIXO',        'receitas.btg_fee_fixo'),
    ('RENDA VARIAVEL',                  null,              'receitas.btg_rv_outras'),
    ('OPERACOES ESTRUTURADAS',          null,              'receitas.btg_estruturadas'),
    ('RENDA FIXA',                      'FEE FIXO',        'receitas.btg_fee_fixo'),
    ('RENDA FIXA',                      null,              'receitas.btg_renda_fixa'),
    ('RENDA FIXA - COE BTG',            null,              'receitas.btg_renda_fixa'),
    ('RENDA FIXA - OFERTAS',            null,              'receitas.btg_renda_fixa'),
    ('RENDA FIXA - PASSIVO RF',         null,              'receitas.btg_renda_fixa'),
    ('RENDA FIXA - PRIMARIO BTG',       null,              'receitas.btg_renda_fixa'),
    ('RENDA FIXA - PRIMARIO TERCEIROS', null,              'receitas.btg_renda_fixa'),
    ('FUNDOS',                          'FEE FIXO',        'receitas.btg_fee_fixo'),
    ('FUNDOS',                          null,              'receitas.btg_fundos'),
    ('AJUSTE MINIMO',                   null,              'receitas.btg_fee_fixo'),
    ('PREVIDÊNCIA EXTERNA',             null,              'receitas.btg_fee_fixo'),
    ('PREVIDÊNCIA INTERNA',             null,              'receitas.btg_fee_fixo'),
    ('SALDO REMUNERADO',                'FEE FIXO',        'receitas.btg_fee_fixo'),
    ('SALDO REMUNERADO',                null,              'receitas.btg_saldo_remunerado'),
    ('CRIPTOMOEDA',                     null,              'receitas.btg_cripto'),
    ('PREVIDENCIA',                     null,              'receitas.btg_previdencia_seguros'),
    ('SEGURO',                          null,              'receitas.btg_previdencia_seguros'),
    ('CONTA VIRADA',                    null,              'receitas.btg_conta_virada'),
    ('CAMBIO',                          'ENCARGO',         'receitas.btg_deducoes'),
    ('CAMBIO',                          null,              'receitas.btg_cambio'),
    ('FEE TRANSACIONAL',                null,              'receitas.btg_banking'),
    ('FEE TRANSACIONAL PME',            null,              'receitas.btg_banking'),
    ('CREDITO ESTRUTURADO',             null,              'receitas.btg_banking'),
    ('FEE DE PLATAFORMA',               null,              'receitas.btg_deducoes'),
    ('ERRO OPERACIONAL',                null,              'receitas.btg_deducoes'),
    ('CUSTOS',                          null,              'receitas.btg_deducoes')
  ) as r(category, product, item)
  join management_accounts ma on ma.organization_id = p_organization_id and ma.code = r.item
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.seed_revenue_category_map(uuid) from public, anon, authenticated;

create or replace function public.organizations_seed_btg_revenue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_btg_revenue_items(new.id);
  perform public.seed_revenue_category_map(new.id);
  return new;
end;
$$;

-- O nome ordena DEPOIS de `trg_organizations_seed_management_plan` (gatilhos do mesmo
-- evento rodam em ordem alfabética): o grupo "Receitas" já existe quando este roda.
create trigger trg_organizations_seed_mp_btg_revenue
  after insert on public.organizations
  for each row execute function public.organizations_seed_btg_revenue();

select public.seed_btg_revenue_items(o.id) from public.organizations o;
select public.seed_revenue_category_map(o.id) from public.organizations o;

create trigger trg_audit_revenue_category_map
  after insert or update or delete on public.revenue_category_map
  for each row execute function audit_record();

-- RLS — mesmo desenho do plano gerencial: leitura para quem vê alguma empresa da
-- organização (expõe nomes, nunca valor); escrita para admin/editor.
alter table public.revenue_category_map enable row level security;

create policy revenue_category_map_sel on public.revenue_category_map
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or organization_id in (
           select c.organization_id
           from public.company_access ca
           join public.companies c on c.id = ca.company_id
           where ca.user_id = (select auth.uid())
         )
    )
  );

create policy revenue_category_map_ins on public.revenue_category_map
  for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) in ('admin', 'editor')
      and organization_id in (
            select c.organization_id
            from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  );

create policy revenue_category_map_upd on public.revenue_category_map
  for update to authenticated
  using (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) in ('admin', 'editor')
      and organization_id in (
            select c.organization_id
            from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) in ('admin', 'editor')
      and organization_id in (
            select c.organization_id
            from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  );

create policy revenue_category_map_del on public.revenue_category_map
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or (
      (select public.current_user_role()) in ('admin', 'editor')
      and organization_id in (
            select c.organization_id
            from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  );

create policy oauth_sem_escrita_ins on public.revenue_category_map
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.revenue_category_map
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.revenue_category_map
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

revoke all on public.revenue_category_map from anon;
revoke truncate, references, trigger on public.revenue_category_map from authenticated;
grant select, insert, update, delete on public.revenue_category_map to authenticated;

-- =============================================================================
-- 3) O assessor do BTG é um colaborador — pelo código
--
-- Os nomes divergem entre CRM e financeiro ("San Juan" × "San Juam", "Ataliao Prado" ×
-- "Atalião Vilas Boas Correa Do Prado"): a ligação é o código do assessor no BTG.
-- Único na organização (o colaborador é cadastro de uma empresa, a área é da
-- organização). O código 1056306 é recusado: é para onde o importador do CRM manda o
-- código desconhecido (`DEFAULT_ADVISOR_CODE`), e ligá-lo a alguém daria a essa pessoa
-- a receita sem dono — no finder, até 57% do mês. Ele fica "sem área", à vista.
-- =============================================================================
alter table public.employees add column btg_advisor_code text
  check (btg_advisor_code is null or btg_advisor_code ~ '^[0-9]{3,12}$');

comment on column public.employees.btg_advisor_code is
  'Código do assessor no BTG. Liga a receita do relatório de comissão (CRM) ao colaborador e, por ele, à área atual. Único na organização; 1056306 (balde do CRM) é recusado.';

create or replace function public.employees_btg_advisor_code_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.btg_advisor_code is null or new.deleted_at is not null then
    return new;
  end if;
  select organization_id into v_org from companies where id = new.company_id;
  -- Duas gravações simultâneas do mesmo código passariam as duas pela conferência.
  perform pg_advisory_xact_lock(hashtext('btg_advisor_code|' || v_org || '|' || new.btg_advisor_code));
  if new.btg_advisor_code = '1056306' then
    raise exception 'O código 1056306 é o balde do CRM para assessor desconhecido — a receita dele fica sem área, não vai para um colaborador'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from employees e
    join companies c on c.id = e.company_id
    where e.btg_advisor_code = new.btg_advisor_code
      and e.deleted_at is null
      and e.id <> new.id
      and c.organization_id = v_org
  ) then
    raise exception 'O código BTG % já está ligado a outro colaborador', new.btg_advisor_code
      using errcode = '23505';
  end if;
  return new;
end;
$$;

-- `security definer`: quem grava colaborador NÃO necessariamente vê os da organização
-- inteira (a leitura exige o módulo de folha e acesso a cada empresa). Sob a RLS de quem
-- grava, o código repetido em outra empresa passaria — e a receita sairia em dobro.
create trigger trg_employees_btg_advisor_code
  before insert or update of btg_advisor_code, company_id, deleted_at on public.employees
  for each row execute function public.employees_btg_advisor_code_check();

create index idx_employees_btg_advisor_code on public.employees(btg_advisor_code)
  where btg_advisor_code is not null and deleted_at is null;

-- Código → colaborador → área ATUAL, para a camada gerencial.
--
-- `employees` é do módulo `payroll` na RLS. A camada gerencial é `security invoker`: se
-- juntasse `employees` direto, quem não vê folha veria a receita SEM área e o Balanço
-- daria um número por pessoa. Esta função devolve só código, nome e área — o que o
-- relatório do CRM já traz — para as organizações que quem chama enxerga. Em FROM, ela
-- roda uma vez por consulta, não por linha.
create or replace function public.btg_advisor_areas()
returns table (
  organization_id  uuid,
  advisor_code     text,
  employee_id      uuid,
  employee_name    text,
  cost_center_id   uuid
)
language sql
stable
security definer
set search_path = public
as $$
  -- `distinct on`: um código, uma linha, sempre. O gatilho já recusa código repetido; isto
  -- garante que, se um escapar, a junção da camada não multiplique dinheiro.
  select distinct on (c.organization_id, e.btg_advisor_code)
    c.organization_id, e.btg_advisor_code, e.id, e.full_name, e.cost_center_id
  from employees e
  join companies c on c.id = e.company_id
  where e.btg_advisor_code is not null
    and e.deleted_at is null
    and (
      public.is_super_admin()
      or c.organization_id in (
           select c2.organization_id
           from company_access ca
           join companies c2 on c2.id = ca.company_id
           where ca.user_id = auth.uid()
         )
    )
  order by c.organization_id, e.btg_advisor_code, e.created_at, e.id;
$$;

revoke all on function public.btg_advisor_areas() from public, anon;
grant execute on function public.btg_advisor_areas() to authenticated;

-- =============================================================================
-- 4) Que tipo de relatório cai em que empresa
--
-- PJ1 → OTM Assessoria; PJ2 e finder → OTM Corretora. É dado da organização, não do
-- schema: fica em tabela (configurada na tela, `supabase/seed.sql` no local). Sem rota, a
-- sincronização não grava o relatório e diz por quê.
-- =============================================================================
create type public.btg_report_kind as enum ('pj1', 'pj2', 'finder');

create table public.btg_report_routes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             public.btg_report_kind not null,
  company_id       uuid not null references public.companies(id) on delete restrict,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint btg_report_routes_uniq unique (organization_id, kind)
);

comment on table public.btg_report_routes is
  'Empresa que recebe cada tipo de relatório de comissão do BTG (pj1, pj2, finder).';

create or replace function public.btg_report_routes_check()
returns trigger
language plpgsql
security definer  -- a trava lê relatórios que quem grava a rota pode não enxergar
set search_path = public
as $$
begin
  if not exists (
    select 1 from companies where id = new.company_id and organization_id = new.organization_id
  ) then
    raise exception 'Empresa é de outra organização';
  end if;
  -- Trocar a empresa de um tipo com relatório já detalhado moveria a receita de empresa.
  if tg_op = 'UPDATE' and new.company_id <> old.company_id and exists (
    select 1 from crm_commission_reports r
    where r.organization_id = new.organization_id and r.kind = new.kind
      and r.company_id = old.company_id
  ) then
    raise exception 'Já há relatórios % gravados na empresa atual: a rota não muda', new.kind;
  end if;
  return new;
end;
$$;

create trigger trg_btg_report_routes_updated before update on public.btg_report_routes
  for each row execute function set_updated_at();
create trigger trg_audit_btg_report_routes
  after insert or update or delete on public.btg_report_routes
  for each row execute function audit_record();

alter table public.btg_report_routes enable row level security;

create policy btg_report_routes_sel on public.btg_report_routes
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or organization_id in (
           select c.organization_id
           from public.company_access ca
           join public.companies c on c.id = ca.company_id
           where ca.user_id = (select auth.uid())
         )
    )
  );

-- Rota decide em que empresa a receita entra: só admin (não editor).
create policy btg_report_routes_ins on public.btg_report_routes
  for insert to authenticated
  with check (
    (select public.is_super_admin())
    or ((select public.current_user_role()) = 'admin' and public.has_company_access(company_id))
  );
create policy btg_report_routes_upd on public.btg_report_routes
  for update to authenticated
  using (
    (select public.is_super_admin())
    or ((select public.current_user_role()) = 'admin' and public.has_company_access(company_id))
  )
  with check (
    (select public.is_super_admin())
    or ((select public.current_user_role()) = 'admin' and public.has_company_access(company_id))
  );
create policy btg_report_routes_del on public.btg_report_routes
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or ((select public.current_user_role()) = 'admin' and public.has_company_access(company_id))
  );

create policy oauth_sem_escrita_ins on public.btg_report_routes
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.btg_report_routes
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.btg_report_routes
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

revoke all on public.btg_report_routes from anon;
revoke truncate, references, trigger on public.btg_report_routes from authenticated;
grant select, insert, update, delete on public.btg_report_routes to authenticated;

-- =============================================================================
-- 5) Espelho dos relatórios do CRM
--
-- Um registro por ARQUIVO importado no CRM (o `report_id` de lá é a chave daqui). As
-- linhas vêm no grão relatório × assessor × categoria × produto × tipo, com a comissão
-- SEM arredondar — só a soma do relatório se arredonda (arredondar grupo a grupo erra
-- 88 de 146 relatórios em até 9 centavos). Nenhum dado de cliente atravessa.
--
-- Escrita só pela Edge Function (service role) via `crm_commission_sync_apply`. O que o
-- CRM reimportar muda o `content_hash`; relatório que sumiu do CRM ganha `removed_at`.
-- Nos dois casos o statement que o usava volta para conferência (§7).
-- =============================================================================
create table public.crm_commission_reports (
  id                uuid primary key,  -- report_id do CRM
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete restrict,
  kind              public.btg_report_kind not null,
  reference_month   date not null check (extract(day from reference_month) = 1),
  period_start      date,
  period_end        date,
  file_key          text not null,
  file_name         text,
  row_count         int not null check (row_count >= 0),
  -- O total do relatório no CRM, a duas casas. A sincronização confere que a soma das
  -- linhas (crua) arredondada dá exatamente isto, antes de gravar.
  total_commission  numeric(18,2) not null,
  imported_at       timestamptz,
  content_hash      text not null,
  removed_at        timestamptz,
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_crm_reports_company_month on public.crm_commission_reports(company_id, reference_month desc);

comment on table public.crm_commission_reports is
  'Espelho de btg_commission_reports do CRM: um registro por arquivo do BTG importado. Gravado só pela Edge Function crm-revenue-sync.';

create table public.crm_commission_report_lines (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.crm_commission_reports(id) on delete cascade,
  company_id       uuid not null references public.companies(id) on delete restrict,
  advisor_code     text not null,
  advisor_name     text,
  advisor_active   boolean,
  category         text not null,
  product          text not null,
  type             text not null,
  -- Sem escala: é a soma crua do CRM. Arredondar aqui quebraria o total.
  commission       numeric not null,
  revenue          numeric,
  net_revenue      numeric,
  row_count        int not null check (row_count >= 0),
  constraint crm_report_lines_uniq unique (report_id, advisor_code, category, product, type)
);

create index idx_crm_report_lines_company on public.crm_commission_report_lines(company_id);

comment on table public.crm_commission_report_lines is
  'Detalhe do relatório de comissão do CRM: relatório × assessor × categoria × produto × tipo, comissão sem arredondar.';

create trigger trg_crm_reports_updated before update on public.crm_commission_reports
  for each row execute function set_updated_at();

create table public.crm_sync_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  status           text not null check (status in ('running', 'succeeded', 'failed')),
  period_from      date,
  period_to        date,
  -- Contagens e avisos (rota faltando, relatório que mudou).
  result           jsonb not null default '{}'::jsonb,
  error            text,
  requested_by     uuid references auth.users(id),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create index idx_crm_sync_runs_org on public.crm_sync_runs(organization_id, started_at desc);

comment on table public.crm_sync_runs is
  'Execuções da sincronização com o CRM (crm-revenue-sync): quando, quanto, e o erro sem segredo.';

-- RLS: espelho e linhas são da empresa; execuções, da organização. Ninguém escreve
-- com o JWT do usuário — só a Edge Function, com service role.
do $$
declare
  t text;
begin
  foreach t in array array['crm_commission_reports', 'crm_commission_report_lines']
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
    execute format('revoke all on public.%1$I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%1$I from authenticated', t);
    execute format('grant select on public.%1$I to authenticated', t);
  end loop;
end $$;

alter table public.crm_sync_runs enable row level security;
create policy crm_sync_runs_sel on public.crm_sync_runs
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or organization_id in (
           select c.organization_id
           from public.company_access ca
           join public.companies c on c.id = ca.company_id
           where ca.user_id = (select auth.uid())
         )
    )
  );
create policy oauth_sem_escrita_ins on public.crm_sync_runs
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.crm_sync_runs
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.crm_sync_runs
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);
revoke all on public.crm_sync_runs from anon;
revoke insert, update, delete, truncate, references, trigger on public.crm_sync_runs from authenticated;
grant select on public.crm_sync_runs to authenticated;

-- Gravar o que a Edge Function leu do CRM — um relatório de cada vez, atômico.
--
-- `p_reports`: [{ id, kind, reference_month, period_start, period_end, file_key,
-- file_name, row_count, total_commission, imported_at }]; `p_lines`: as linhas, com
-- `report_id`. O que já foi conferido do lado TS (soma × total) é conferido de novo
-- aqui — o banco não confia no cliente, nem quando o cliente é a própria function.
-- Relatório da janela [p_from, p_to] que não veio é marcado `removed_at`.
create or replace function public.crm_commission_sync_apply(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_reports jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_company uuid;
  v_hash text;
  v_old_hash text;
  v_sum numeric;
  v_created int := 0;
  v_changed int := 0;
  v_unchanged int := 0;
  v_unrouted text[] := '{}';
  v_removed int := 0;
  v_seen uuid[] := '{}';
begin
  -- CRM que responde vazio para uma janela que já tem relatório é falha de leitura
  -- (permissão, filtro), não "o BTG apagou tudo": sem esta trava, todo statement da
  -- janela sairia do Balanço e perderia o aceite da diferença.
  if jsonb_array_length(coalesce(p_reports, '[]'::jsonb)) = 0 and exists (
    select 1 from crm_commission_reports
    where organization_id = p_organization_id
      and reference_month between p_from and p_to
      and removed_at is null
  ) then
    raise exception 'O CRM não devolveu nenhum relatório para %..%, que já tem relatórios gravados — nada foi alterado',
      p_from, p_to using errcode = '22000';
  end if;

  for r in select value from jsonb_array_elements(coalesce(p_reports, '[]'::jsonb))
  loop
    select company_id into v_company
    from btg_report_routes
    where organization_id = p_organization_id and kind = (r ->> 'kind')::btg_report_kind;
    if v_company is null then
      v_unrouted := v_unrouted || (r ->> 'kind');
      continue;
    end if;
    v_seen := v_seen || (r ->> 'id')::uuid;

    -- A conferência do contrato: soma crua das linhas, arredondada, = total.
    select coalesce(sum((l ->> 'commission')::numeric), 0) into v_sum
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
    where l ->> 'report_id' = r ->> 'id';
    if round(v_sum, 2) <> (r ->> 'total_commission')::numeric(18,2) then
      raise exception 'Relatório % (% %): linhas somam % e o total diz %',
        r ->> 'file_key', r ->> 'kind', r ->> 'reference_month', round(v_sum, 2), r ->> 'total_commission'
        using errcode = '22000';
    end if;

    -- Identidade do conteúdo: as linhas em ordem total, com a comissão exata.
    select md5(coalesce(string_agg(
             concat_ws('|', l ->> 'advisor_code', l ->> 'category', l ->> 'product', l ->> 'type',
                       ((l ->> 'commission')::numeric)::text, l ->> 'row_count'),
             E'\n' order by l ->> 'advisor_code', l ->> 'category', l ->> 'product', l ->> 'type'), '')
             || '#' || (r ->> 'total_commission'))
      into v_hash
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
    where l ->> 'report_id' = r ->> 'id';

    select content_hash into v_old_hash from crm_commission_reports where id = (r ->> 'id')::uuid;

    insert into crm_commission_reports (
      id, organization_id, company_id, kind, reference_month, period_start, period_end,
      file_key, file_name, row_count, total_commission, imported_at, content_hash, removed_at, synced_at
    ) values (
      (r ->> 'id')::uuid, p_organization_id, v_company, (r ->> 'kind')::btg_report_kind,
      (r ->> 'reference_month')::date, (r ->> 'period_start')::date, (r ->> 'period_end')::date,
      r ->> 'file_key', r ->> 'file_name', (r ->> 'row_count')::int,
      (r ->> 'total_commission')::numeric(18,2), (r ->> 'imported_at')::timestamptz, v_hash, null, now()
    )
    on conflict (id) do update set
      kind = excluded.kind, reference_month = excluded.reference_month,
      period_start = excluded.period_start, period_end = excluded.period_end,
      file_key = excluded.file_key, file_name = excluded.file_name, row_count = excluded.row_count,
      total_commission = excluded.total_commission, imported_at = excluded.imported_at,
      content_hash = excluded.content_hash, removed_at = null, synced_at = now();

    if v_old_hash is null or v_old_hash <> v_hash then
      delete from crm_commission_report_lines where report_id = (r ->> 'id')::uuid;
      insert into crm_commission_report_lines (
        report_id, company_id, advisor_code, advisor_name, advisor_active, category, product, type,
        commission, revenue, net_revenue, row_count
      )
      select (r ->> 'id')::uuid, v_company, l ->> 'advisor_code', l ->> 'advisor_name',
             (l ->> 'advisor_active')::boolean, l ->> 'category', l ->> 'product', l ->> 'type',
             (l ->> 'commission')::numeric, (l ->> 'revenue')::numeric, (l ->> 'net_revenue')::numeric,
             (l ->> 'row_count')::int
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
      where l ->> 'report_id' = r ->> 'id';
      if v_old_hash is null then v_created := v_created + 1; else v_changed := v_changed + 1; end if;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  update crm_commission_reports
  set removed_at = now()
  where organization_id = p_organization_id
    and reference_month between p_from and p_to
    and removed_at is null
    and not (id = any(v_seen))
    and kind in (select kind from btg_report_routes where organization_id = p_organization_id);
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'created', v_created, 'changed', v_changed, 'unchanged', v_unchanged,
    'removed', v_removed,
    'unrouted', (select coalesce(jsonb_agg(distinct k), '[]'::jsonb) from unnest(v_unrouted) k)
  );
end;
$$;

revoke all on function public.crm_commission_sync_apply(uuid, date, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crm_commission_sync_apply(uuid, date, date, jsonb, jsonb) to service_role;

-- =============================================================================
-- 6) O statement: um lançamento aberto por um conjunto de relatórios
-- =============================================================================
create type public.revenue_statement_status as enum ('needs_review', 'reconciled');
create type public.revenue_line_kind as enum ('detail', 'difference');

create table public.revenue_statements (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  -- O lançamento da receita. Um statement abre um lançamento, e só um.
  transaction_id          uuid not null unique references public.transactions(id) on delete cascade,
  kind                    public.btg_report_kind not null,
  report_total            numeric(18,2) not null,
  ledger_amount           numeric(18,2) not null,
  difference              numeric(18,2) generated always as (ledger_amount - report_total) stored,
  status                  public.revenue_statement_status not null,
  -- Conferências refeitas pelo banco — é este veredito que vale.
  validation              jsonb not null default '[]'::jsonb,
  -- D1: a diferença relatório × nota só conta depois que alguém a aceita, por escrito.
  difference_note         text,
  difference_accepted_by  uuid references auth.users(id),
  difference_accepted_at  timestamptz,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_revenue_statements_company on public.revenue_statements(company_id);

comment on table public.revenue_statements is
  'Lançamento de receita do BTG aberto pelos relatórios do CRM. reconciled = as linhas somam o lançamento ao centavo e, se houver diferença relatório × nota, alguém a aceitou. Só então abre na visão gerencial.';

create table public.revenue_statement_reports (
  statement_id  uuid not null references public.revenue_statements(id) on delete cascade,
  -- Um relatório abre no máximo um lançamento (unique): sem isso o mesmo arquivo podia
  -- ser somado em dois meses.
  report_id     uuid not null unique references public.crm_commission_reports(id) on delete restrict,
  company_id    uuid not null references public.companies(id) on delete cascade,
  -- O conteúdo do relatório quando o statement foi montado. Se o CRM reimportar, o
  -- espelho muda de hash e o statement volta para conferência.
  content_hash  text not null,
  primary key (statement_id, report_id)
);

create table public.revenue_statement_lines (
  id             uuid primary key default gen_random_uuid(),
  statement_id   uuid not null references public.revenue_statements(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  line_kind      public.revenue_line_kind not null,
  report_id      uuid references public.crm_commission_reports(id) on delete restrict,
  advisor_code   text,
  advisor_name   text,
  category       text,
  product        text,
  type           text,
  -- Com sinal: desconto do BTG é negativo. Somadas, as linhas dão o lançamento.
  amount         numeric(18,2) not null,
  revenue        numeric(18,2),
  row_count      int,
  constraint revenue_lines_kind_ck check (
    (line_kind = 'detail') = (report_id is not null and advisor_code is not null and category is not null)
  )
);

create index idx_revenue_lines_statement on public.revenue_statement_lines(statement_id);
create index idx_revenue_lines_company on public.revenue_statement_lines(company_id);

comment on table public.revenue_statement_lines is
  'Linhas do statement de receita: assessor × categoria × produto × tipo (centavos distribuídos pelo maior resto, por relatório) e, se houver, a diferença relatório × nota. Área e item NÃO são gravados: saem na leitura (v_revenue_lines).';

create trigger trg_revenue_statements_updated before update on public.revenue_statements
  for each row execute function set_updated_at();
create trigger trg_audit_revenue_statements after insert or update or delete on public.revenue_statements
  for each row execute function audit_record();

do $$
declare
  t text;
begin
  foreach t in array array['revenue_statements', 'revenue_statement_reports', 'revenue_statement_lines']
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
    -- Escrita só pelas RPCs abaixo: com INSERT/UPDATE liberados, quem escreve na empresa
    -- marcaria como conferido um statement que não fecha.
    execute format('revoke all on public.%1$I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%1$I from authenticated', t);
    execute format('grant select on public.%1$I to authenticated', t);
  end loop;
end $$;

-- =============================================================================
-- 7) Montar, aceitar e desfazer — conferindo no banco
-- =============================================================================

-- Monta o statement de um lançamento com os relatórios escolhidos. O cliente manda só
-- a ESCOLHA (lançamento + relatórios); os números saem do espelho, aqui dentro.
--
-- Arredondamento: por relatório, cada linha é truncada no centavo (floor) e os centavos
-- que faltam para o total do relatório vão para as linhas de maior resto (maior resto,
-- desempate pela chave). Assim Σ linhas = total do relatório EXATO, e nenhuma linha
-- se afasta mais de 1 centavo do valor cru.
create or replace function public.save_revenue_statement(
  p_transaction_id uuid,
  p_report_ids uuid[],
  p_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_kinds text[];
  v_statement_id uuid;
  v_total numeric(18,2);
  v_ledger_cents bigint;
  v_total_cents bigint;
  v_checks jsonb := '[]'::jsonb;
  v_status public.revenue_statement_status;
begin
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'Token de OAuth não escreve' using errcode = '42501';
  end if;

  select t.id, t.company_id, t.amount, t.direction, m.management_kind
    into v_tx
  from transactions t
  left join v_account_management_map m on m.account_id = t.account_id
  where t.id = p_transaction_id and t.deleted_at is null;

  if not found then
    raise exception 'Lançamento não encontrado' using errcode = 'P0002';
  end if;
  if not public.has_company_write_access(v_tx.company_id) then
    raise exception 'Sem permissão para escrever nesta empresa' using errcode = '42501';
  end if;
  if v_tx.direction <> 'inflow' or v_tx.management_kind is distinct from 'revenue' then
    raise exception 'Só um lançamento de entrada em conta de receita recebe o relatório do BTG'
      using errcode = '22023';
  end if;
  if coalesce(cardinality(p_report_ids), 0) = 0 then
    raise exception 'Escolha ao menos um relatório' using errcode = '22023';
  end if;

  -- Os relatórios: existem, são da empresa do lançamento, não sumiram do CRM, são de
  -- UM tipo só, e não abrem outro lançamento.
  if (select count(*) from crm_commission_reports where id = any(p_report_ids)) <> cardinality(p_report_ids) then
    raise exception 'Relatório não encontrado no espelho do CRM' using errcode = 'P0002';
  end if;
  if exists (select 1 from crm_commission_reports where id = any(p_report_ids)
             and (company_id <> v_tx.company_id or removed_at is not null)) then
    raise exception 'Relatório é de outra empresa ou não existe mais no CRM' using errcode = '22023';
  end if;
  select array_agg(distinct kind::text) into v_kinds from crm_commission_reports where id = any(p_report_ids);
  if cardinality(v_kinds) <> 1 then
    raise exception 'Um lançamento é aberto por relatórios de um tipo só (veio %)', v_kinds using errcode = '22023';
  end if;
  if exists (
    select 1 from revenue_statement_reports sr
    join revenue_statements s on s.id = sr.statement_id
    where sr.report_id = any(p_report_ids) and s.transaction_id <> p_transaction_id
  ) then
    raise exception 'Relatório já abre outro lançamento' using errcode = '23505';
  end if;

  if exists (select 1 from revenue_statements where transaction_id = p_transaction_id) then
    if not p_replace then
      raise exception 'Este lançamento já foi aberto' using errcode = '23505';
    end if;
    delete from revenue_statements where transaction_id = p_transaction_id;
  end if;

  select sum(total_commission) into v_total from crm_commission_reports where id = any(p_report_ids);
  v_total_cents := round(v_total * 100)::bigint;
  v_ledger_cents := round(v_tx.amount * 100)::bigint;

  -- Conferências. As de relatório sempre passam (o espelho só grava relatório que
  -- fecha); ficam aqui para a tela mostrar de onde veio cada parcela.
  select v_checks || coalesce(jsonb_agg(jsonb_build_object(
           'code', 'report:' || r.id,
           'label', upper(r.kind::text) || ' ' || to_char(r.reference_month, 'MM/YYYY') || ' · ' || r.file_key,
           'expectedCents', round(r.total_commission * 100)::bigint,
           'gotCents', (select round(coalesce(sum(l.commission), 0) * 100)::bigint
                        from crm_commission_report_lines l where l.report_id = r.id),
           'ok', round(r.total_commission * 100)::bigint
                 = (select round(coalesce(sum(l.commission), 0) * 100)::bigint
                    from crm_commission_report_lines l where l.report_id = r.id))
         order by r.reference_month, r.file_key), '[]'::jsonb)
    into v_checks
  from crm_commission_reports r where r.id = any(p_report_ids);

  v_checks := v_checks || jsonb_build_object(
    'code', 'ledger', 'label', 'Relatórios somam o lançamento',
    'expectedCents', v_ledger_cents, 'gotCents', v_total_cents, 'ok', v_ledger_cents = v_total_cents);

  v_status := case
    when not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'ok')::boolean)
      then 'reconciled'
    else 'needs_review'
  end;

  insert into revenue_statements (
    company_id, transaction_id, kind, report_total, ledger_amount, status, validation, created_by
  ) values (
    v_tx.company_id, p_transaction_id, v_kinds[1]::btg_report_kind, v_total, v_tx.amount,
    v_status, v_checks, auth.uid()
  )
  returning id into v_statement_id;

  insert into revenue_statement_reports (statement_id, report_id, company_id, content_hash)
  select v_statement_id, r.id, r.company_id, r.content_hash
  from crm_commission_reports r where r.id = any(p_report_ids);

  insert into revenue_statement_lines (
    statement_id, company_id, line_kind, report_id, advisor_code, advisor_name,
    category, product, type, amount, revenue, row_count
  )
  with raw as (
    select l.report_id, l.advisor_code, l.advisor_name, l.category, l.product, l.type,
           l.commission, l.revenue, l.row_count,
           floor(l.commission * 100)::bigint as floor_cents,
           l.commission * 100 - floor(l.commission * 100) as remainder
    from crm_commission_report_lines l
    where l.report_id = any(p_report_ids)
  ),
  per_report as (
    select r.id as report_id,
           round(r.total_commission * 100)::bigint
             - coalesce((select sum(floor_cents) from raw where raw.report_id = r.id), 0) as missing
    from crm_commission_reports r where r.id = any(p_report_ids)
  ),
  ranked as (
    select raw.*,
           row_number() over (
             partition by raw.report_id
             order by raw.remainder desc, raw.advisor_code, raw.category, raw.product, raw.type
           ) as rk
    from raw
  )
  select v_statement_id, v_tx.company_id, 'detail', k.report_id, k.advisor_code, k.advisor_name,
         k.category, k.product, k.type,
         (k.floor_cents + case when k.rk <= p.missing then 1 else 0 end) / 100.0,
         round(k.revenue, 2), k.row_count
  from ranked k
  join per_report p on p.report_id = k.report_id
  where k.floor_cents + case when k.rk <= p.missing then 1 else 0 end <> 0;

  if v_ledger_cents <> v_total_cents then
    insert into revenue_statement_lines (statement_id, company_id, line_kind, amount)
    values (v_statement_id, v_tx.company_id, 'difference', (v_ledger_cents - v_total_cents) / 100.0);
  end if;

  -- O próprio statement se confere: as linhas somam o lançamento, sempre.
  if (select sum(amount) from revenue_statement_lines where statement_id = v_statement_id)
     is distinct from v_tx.amount then
    raise exception 'Linhas do statement não somam o lançamento — defeito, nada foi gravado';
  end if;

  return jsonb_build_object(
    'id', v_statement_id, 'status', v_status, 'difference', (v_ledger_cents - v_total_cents) / 100.0
  );
end;
$$;

revoke all on function public.save_revenue_statement(uuid, uuid[], boolean) from public, anon;
grant execute on function public.save_revenue_statement(uuid, uuid[], boolean) to authenticated;

comment on function public.save_revenue_statement(uuid, uuid[], boolean) is
  'Abre o lançamento de receita pelos relatórios do CRM escolhidos, refazendo a conta no banco. reconciled só se os relatórios somarem o lançamento ao centavo; senão grava a linha de diferença e fica needs_review até accept_revenue_statement_difference. Devolve {id, status, difference}.';

-- D1: aceitar a diferença relatório × nota. Só vale enquanto nada mais mudou — o
-- lançamento continua com o valor da montagem e os relatórios com o mesmo conteúdo.
create or replace function public.accept_revenue_statement_difference(
  p_statement_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.revenue_statements%rowtype;
  v_tx_amount numeric(18,2);
begin
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'Token de OAuth não escreve' using errcode = '42501';
  end if;
  select * into v_s from revenue_statements where id = p_statement_id;
  if v_s.id is null or not public.has_company_write_access(v_s.company_id) then
    raise exception 'Statement não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'Explique a diferença (ao menos 10 caracteres)' using errcode = '22023';
  end if;
  if v_s.difference = 0 then
    raise exception 'Não há diferença a aceitar' using errcode = '22023';
  end if;

  select t.amount into v_tx_amount
  from transactions t
  join v_account_management_map m on m.account_id = t.account_id
  where t.id = v_s.transaction_id and t.deleted_at is null
    and t.company_id = v_s.company_id
    and t.direction = 'inflow'
    and m.management_kind = 'revenue';
  if v_tx_amount is distinct from v_s.ledger_amount then
    raise exception 'O lançamento mudou depois da montagem — monte de novo' using errcode = '22023';
  end if;
  if exists (
    select 1 from revenue_statement_reports sr
    join crm_commission_reports r on r.id = sr.report_id
    where sr.statement_id = p_statement_id
      and (r.content_hash <> sr.content_hash or r.removed_at is not null)
  ) then
    raise exception 'Um relatório mudou no CRM depois da montagem — monte de novo' using errcode = '22023';
  end if;

  update revenue_statements
  set status = 'reconciled',
      difference_note = btrim(p_note),
      difference_accepted_by = auth.uid(),
      difference_accepted_at = now()
  where id = p_statement_id;
end;
$$;

revoke all on function public.accept_revenue_statement_difference(uuid, text) from public, anon;
grant execute on function public.accept_revenue_statement_difference(uuid, text) to authenticated;

-- Desfazer: as linhas vão embora, o lançamento fica.
create or replace function public.delete_revenue_statement(p_statement_id uuid)
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
  select company_id into v_company from revenue_statements where id = p_statement_id;
  if v_company is null or not public.has_company_write_access(v_company) then
    raise exception 'Statement não encontrado ou sem permissão' using errcode = '42501';
  end if;
  delete from revenue_statements where id = p_statement_id;
end;
$$;

revoke all on function public.delete_revenue_statement(uuid) from public, anon;
grant execute on function public.delete_revenue_statement(uuid) to authenticated;

-- O lançamento mudou depois de conferido: as linhas deixariam de somá-lo e a camada
-- divergiria dos lançamentos em silêncio. Volta para conferência (e o lançamento volta
-- inteiro), perdendo o aceite da diferença.
create or replace function public.revenue_statement_parent_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update revenue_statements s
  set status = 'needs_review',
      difference_note = null, difference_accepted_by = null, difference_accepted_at = null,
      validation = s.validation || jsonb_build_array(jsonb_build_object(
        'code', 'ledger_changed',
        'label', 'O lançamento mudou depois da conferência — monte de novo',
        'expectedCents', round(new.amount * 100)::bigint,
        'gotCents', round(s.ledger_amount * 100)::bigint,
        'ok', false))
  where s.transaction_id = new.id
    and s.status = 'reconciled';
  return new;
end;
$$;

create trigger trg_tx_revenue_statement_parent_changed
  after update of amount, direction, account_id, company_id on public.transactions
  for each row
  when ((old.amount, old.direction, old.account_id, old.company_id)
        is distinct from (new.amount, new.direction, new.account_id, new.company_id))
  execute function public.revenue_statement_parent_changed();

-- O CRM reimportou (ou apagou) um relatório usado: o statement continua com as linhas
-- que tinha, mas sai do Balanço até alguém montar de novo. Nada muda em silêncio.
create or replace function public.revenue_statement_report_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update revenue_statements s
  set status = 'needs_review',
      difference_note = null, difference_accepted_by = null, difference_accepted_at = null,
      validation = s.validation || jsonb_build_array(jsonb_build_object(
        'code', 'crm_changed',
        'label', case when new.removed_at is not null
                      then 'O relatório ' || new.file_key || ' sumiu do CRM — monte de novo'
                      else 'O relatório ' || new.file_key || ' mudou no CRM — monte de novo' end,
        'expectedCents', round(new.total_commission * 100)::bigint,
        'gotCents', null,
        'ok', false))
  from revenue_statement_reports sr
  where sr.statement_id = s.id
    and sr.report_id = new.id
    and (sr.content_hash <> new.content_hash or new.removed_at is not null)
    and s.status = 'reconciled';
  return new;
end;
$$;

create trigger trg_crm_report_revenue_statement_changed
  after update of content_hash, removed_at on public.crm_commission_reports
  for each row
  when ((old.content_hash, old.removed_at) is distinct from (new.content_hash, new.removed_at))
  execute function public.revenue_statement_report_changed();

-- Agora que o espelho existe, a rota pode conferir relatório gravado.
create trigger trg_btg_report_routes_check
  before insert or update on public.btg_report_routes
  for each row execute function public.btg_report_routes_check();

-- =============================================================================
-- 8) Leitura: a linha de receita com item e área resolvidos na hora
--
-- UMA implementação de "de que item e de que área é esta receita", usada pela camada
-- gerencial e pela tela. Item: par exato categoria × produto › curinga da categoria ›
-- "BTG · Outras receitas"; a diferença vai sempre para "BTG · Diferença relatório ×
-- nota". Área: a área ATUAL do colaborador com aquele código (D2); sem colaborador, ou
-- no balde 1056306, fica nula — "sem área", à vista.
-- =============================================================================
create or replace view public.v_revenue_lines with (security_invoker = true) as
select
  l.id,
  l.statement_id,
  l.company_id,
  l.line_kind,
  l.report_id,
  l.advisor_code,
  l.advisor_name,
  l.category,
  l.product,
  l.type,
  l.amount,
  l.revenue,
  l.row_count,
  a.employee_id,
  a.employee_name,
  a.cost_center_id,
  case
    when l.line_kind = 'difference' then dif.id
    else coalesce(rule.management_account_id, outras.id)
  end as management_account_id,
  (l.line_kind = 'detail' and rule.management_account_id is null) as is_unmapped
from public.revenue_statement_lines l
join public.companies c on c.id = l.company_id
left join public.btg_advisor_areas() a
  on l.line_kind = 'detail'
 and a.organization_id = c.organization_id
 and a.advisor_code = l.advisor_code
left join lateral (
  select m.management_account_id
  from public.revenue_category_map m
  where l.line_kind = 'detail'
    and m.organization_id = c.organization_id
    and m.category = l.category
    and (m.product is null or m.product = l.product)
  order by m.product is null
  limit 1
) rule on true
left join public.management_accounts outras
  on outras.organization_id = c.organization_id and outras.code = 'receitas.btg_outras'
left join public.management_accounts dif
  on dif.organization_id = c.organization_id and dif.code = 'receitas.btg_diferenca';

comment on view public.v_revenue_lines is
  'Linha de receita do BTG com item gerencial (de-para categoria × produto) e área (área atual do colaborador do código BTG) resolvidos na leitura. Base do ramo revenue de v_management_lines e da tela /receita.';

revoke all on public.v_revenue_lines from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_revenue_lines from authenticated;
grant select on public.v_revenue_lines to authenticated;

-- =============================================================================
-- 9) A camada gerencial abre a receita conferida
--
-- Mesmo desenho da fatura: o lançamento com statement `reconciled` sai, as linhas
-- entram com a data, o status e a empresa do lançamento. Linha negativa (desconto do
-- BTG) vira saída num item de receita — o líquido é o do lançamento.
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
  and not exists (
    select 1 from public.revenue_statements s
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
  coalesce(ma.id, m.management_account_id),
  case when ma.id is null then m.management_group_id else ma.parent_id end,
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
left join public.management_accounts ma
  on ma.id = l.management_account_id and l.classification_status = 'confirmed'
union all
select
  t.id,
  t.company_id,
  t.account_id,
  t.accrual_date,
  t.cash_date,
  t.status,
  case when r.amount < 0 then 'outflow' else 'inflow' end::public.transaction_direction,
  abs(r.amount)::numeric(18,2),
  case
    when r.line_kind = 'difference' then 'Diferença relatório × nota'
    else coalesce(r.advisor_name, r.advisor_code) || ' · ' || r.category || ' / ' || r.product
  end,
  null::text,
  t.counterparty_id,
  r.cost_center_id,
  r.management_account_id,
  ma.parent_id,
  ma.kind,
  null::public.expense_nature,
  'revenue'::text,
  r.id
from public.v_revenue_lines r
join public.revenue_statements s on s.id = r.statement_id and s.status = 'reconciled'
join public.transactions t on t.id = s.transaction_id and t.deleted_at is null
left join public.management_accounts ma on ma.id = r.management_account_id;

comment on view public.v_management_lines is
  'Lançamentos ativos — com a fatura de cartão conferida aberta em compras e a receita do BTG conferida aberta em assessor × produto — com item do plano gerencial, grupo, natureza efetiva e área. Base do Balanço e da Central de Gastos.';

-- =============================================================================
-- 10) Leituras da tela /receita
-- =============================================================================

-- Lançamentos de receita que ainda podem ser abertos: entrada em conta de receita, de
-- empresa que recebe relatório do BTG, sem statement. Exclusão antes do limite.
create or replace function public.pending_revenue_transactions(
  p_company_ids uuid[] default null,
  p_from date default null,
  p_limit int default 200
)
returns table (
  id uuid, company_id uuid, accrual_date date, cash_date date, amount numeric,
  description text, counterparty_name text, status public.transaction_status
)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id, t.company_id, t.accrual_date, t.cash_date, t.amount, t.description, cp.name, t.status
  from public.transactions t
  join public.v_account_management_map m on m.account_id = t.account_id
  left join public.counterparties cp on cp.id = t.counterparty_id
  where m.management_kind = 'revenue'
    and t.direction = 'inflow'
    and t.status in ('settled', 'reconciled', 'pending')
    and t.deleted_at is null
    and t.company_id in (select company_id from public.btg_report_routes)
    and (p_company_ids is null or t.company_id = any(p_company_ids))
    and (p_from is null or t.accrual_date >= p_from)
    and not exists (select 1 from public.revenue_statements s where s.transaction_id = t.id)
  order by t.accrual_date desc, t.amount desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.pending_revenue_transactions(uuid[], date, int) from public, anon;
grant execute on function public.pending_revenue_transactions(uuid[], date, int) to authenticated;

-- Receita aberta no período, agregada por empresa × item × área × assessor. Só statement
-- `reconciled` (o que está no Balanço), na mesma população e data por regime da camada.
create or replace function public.revenue_breakdown_multi(
  p_from date,
  p_to date,
  p_basis public.accounting_basis default 'accrual',
  p_company_ids uuid[] default null
)
returns table (
  company_id             uuid,
  management_account_id  uuid,
  cost_center_id         uuid,
  advisor_code           text,
  advisor_name           text,
  employee_id            uuid,
  employee_name          text,
  line_kind              public.revenue_line_kind,
  amount                 numeric,
  revenue                numeric,
  months                 date[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.company_id, r.management_account_id, r.cost_center_id, r.advisor_code,
    max(r.advisor_name), r.employee_id, max(r.employee_name), r.line_kind,
    sum(r.amount), sum(r.revenue),
    array_agg(distinct date_trunc('month', case when p_basis = 'cash' then t.cash_date else t.accrual_date end)::date)
  from public.v_revenue_lines r
  join public.revenue_statements s on s.id = r.statement_id and s.status = 'reconciled'
  join public.transactions t on t.id = s.transaction_id and t.deleted_at is null
  where r.company_id = any(
          coalesce(p_company_ids, (select array_agg(c.id) from public.companies c where c.is_holding = false))
        )
    and case
          when p_basis = 'cash'
            then t.status in ('settled', 'reconciled') and t.cash_date between p_from and p_to
          else t.status in ('settled', 'reconciled', 'pending') and t.accrual_date between p_from and p_to
        end
  group by r.company_id, r.management_account_id, r.cost_center_id, r.advisor_code,
           r.employee_id, r.line_kind;
$$;

-- Códigos de assessor que aparecem nos relatórios do CRM desde `p_from`, com quanto
-- produziram e o último mês — a lista que a tela usa para ligar código → colaborador.
create or replace function public.crm_advisor_codes(
  p_company_ids uuid[] default null,
  p_from date default null
)
returns table (
  advisor_code     text,
  advisor_name     text,
  advisor_active   boolean,
  commission       numeric,
  last_month       date,
  report_count     int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.advisor_code,
    (array_agg(l.advisor_name order by r.reference_month desc))[1],
    bool_or(l.advisor_active),
    round(sum(l.commission), 2),
    max(r.reference_month),
    count(distinct r.id)::int
  from public.crm_commission_report_lines l
  join public.crm_commission_reports r on r.id = l.report_id and r.removed_at is null
  where (p_company_ids is null or l.company_id = any(p_company_ids))
    and (p_from is null or r.reference_month >= p_from)
  group by l.advisor_code;
$$;

revoke all on function public.crm_advisor_codes(uuid[], date) from public, anon;
grant execute on function public.crm_advisor_codes(uuid[], date) to authenticated;

revoke all on function public.revenue_breakdown_multi(date, date, public.accounting_basis, uuid[]) from public, anon;
grant execute on function public.revenue_breakdown_multi(date, date, public.accounting_basis, uuid[]) to authenticated;

comment on function public.revenue_breakdown_multi(date, date, public.accounting_basis, uuid[]) is
  'Receita do BTG conferida, agregada por empresa × item × área × assessor no período. Mesma população e data da camada gerencial: soma o mesmo que o Balanço.';

-- =============================================================================
-- 11) Sincronização: cron diário e o botão "Sincronizar agora"
--
-- Mesmo desenho de `pagarme_cron_invoke`: URL e segredo no Vault, ausentes = no-op
-- (local). As credenciais do usuário de serviço do CRM ficam nos secrets da Edge
-- Function, nunca aqui.
--   `crm_revenue_sync_url`    = https://<ref>.supabase.co/functions/v1/crm-revenue-sync
--   `crm_revenue_sync_secret` = mesmo valor de CRM_SYNC_SECRET (env da function)
-- =============================================================================
create or replace function public.crm_revenue_cron_invoke(
  p_from date default null,
  p_to date default null,
  p_requested_by uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'crm_revenue_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'crm_revenue_sync_secret';
  if v_url is null or v_secret is null then
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('from', p_from, 'to', p_to, 'requestedBy', p_requested_by)
  );
  return true;
end;
$$;

revoke all on function public.crm_revenue_cron_invoke(date, date, uuid) from public, anon, authenticated;

-- O botão: admin/editor de alguma empresa que recebe relatório. Devolve false se a
-- sincronização não estiver configurada neste ambiente.
create or replace function public.request_crm_revenue_sync(p_from date default null, p_to date default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'Token de OAuth não escreve' using errcode = '42501';
  end if;
  if not exists (
    select 1 from btg_report_routes r where public.has_company_write_access(r.company_id)
  ) then
    raise exception 'Sem permissão para sincronizar a receita do BTG' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Período invertido' using errcode = '22007';
  end if;
  -- Uma de cada vez: duas gravando o mesmo relatório colidiriam nas linhas.
  if exists (
    select 1 from crm_sync_runs
    where status = 'running' and started_at > now() - interval '10 minutes'
  ) then
    raise exception 'Já há uma sincronização em andamento' using errcode = '55P03';
  end if;
  return public.crm_revenue_cron_invoke(p_from, p_to, auth.uid());
end;
$$;

revoke all on function public.request_crm_revenue_sync(date, date) from public, anon;
grant execute on function public.request_crm_revenue_sync(date, date) to authenticated;

-- Execuções: a function abre e fecha a sua (service role).
create or replace function public.crm_sync_run_start(
  p_organization_id uuid, p_from date, p_to date, p_requested_by uuid default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into crm_sync_runs (organization_id, status, period_from, period_to, requested_by)
  values (p_organization_id, 'running', p_from, p_to, p_requested_by)
  returning id;
$$;

create or replace function public.crm_sync_run_finish(p_run_id uuid, p_result jsonb, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update crm_sync_runs
  set status = case when p_error is null then 'succeeded' else 'failed' end,
      result = coalesce(p_result, '{}'::jsonb), error = p_error, finished_at = now()
  where id = p_run_id;
$$;

revoke all on function public.crm_sync_run_start(uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.crm_sync_run_finish(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.crm_sync_run_start(uuid, date, date, uuid) to service_role;
grant execute on function public.crm_sync_run_finish(uuid, jsonb, text) to service_role;

select cron.unschedule('crm-revenue-sync')
where exists (select 1 from cron.job where jobname = 'crm-revenue-sync');

-- Diário, de manhã: o CRM importa o relatório à mão, poucas vezes por mês.
select cron.schedule(
  'crm-revenue-sync', '40 9 * * *',
  $$select public.crm_revenue_cron_invoke()$$
);

-- =============================================================================
-- 12) A migration se confere
-- =============================================================================
do $$
declare
  v_bad int;
begin
  -- Toda organização tem os 17 itens de receita do BTG e o de-para inicial.
  select count(*) into v_bad
  from public.organizations o
  where (select count(*) from public.management_accounts ma
         where ma.organization_id = o.id and ma.code like 'receitas.btg\_%') <> 17
     or (select count(*) from public.revenue_category_map m where m.organization_id = o.id) <> 32;
  assert v_bad = 0, format('itens de receita do BTG ou de-para incompletos em %s organização(ões)', v_bad);

  -- A camada continua fechando com os lançamentos.
  select count(*) into v_bad
  from public.management_reconciliation(
    '1900-01-01', '2999-12-31', 'accrual',
    (select array_agg(id) from public.companies)
  ) r
  where r.difference <> 0;
  assert v_bad = 0, format('%s empresa/mês em que a camada gerencial não fecha com os lançamentos', v_bad);
end $$;

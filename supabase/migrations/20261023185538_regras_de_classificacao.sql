-- =============================================================================
-- Fase 3 da Central de Gastos — classificar compra de cartão sem digitar compra por compra
--
-- Três camadas, nesta ordem (docs/features/central-de-gastos-plan.md §7.3):
--   1. REGRA: "descrição começa com FACEBK → Marketing · Mídia paga, área Marketing".
--      Escrita por uma pessoa, aplicada sozinha a toda fatura importada. Compra
--      classificada por regra conta como confirmada — a regra É a decisão humana.
--   2. MEMÓRIA: confirmar uma compra na tela oferece "criar regra para as próximas".
--   3. IA: só para o que nenhuma regra pegou, e só como SUGESTÃO (`suggested`). Sugestão
--      não entra na visão gerencial até alguém aceitar — o número do Balanço nunca sai de
--      um palpite.
--
-- O universo de fornecedores no cartão é pequeno e repetitivo (as três faturas de
-- set/2026 têm ~25): em poucos meses a regra cobre quase tudo e a IA vira exceção.
-- =============================================================================

-- =============================================================================
-- 1) Descrição normalizada — a chave em que a regra casa
--
-- Maiúsculas, sem acento por troca simples, e tudo que não é letra ou dígito vira um
-- espaço: "FACEBK *WX5UF4JFL4" e "FACEBK* DZRJ55AZV4" viram "FACEBK WX5UF4JFL4" e
-- "FACEBK DZRJ55AZV4" — ambos começam com "FACEBK".
-- =============================================================================
create or replace function public.normalize_card_description(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(upper(coalesce(p_text, '')),
              'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
              'AAAAAEEEEIIIIOOOOOUUUUC'),
    '[^A-Z0-9]+', ' ', 'g'))
$$;

-- =============================================================================
-- 2) Regras
-- =============================================================================
create table public.classification_rules (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  -- Regra de UMA empresa (o AWS da OTM é de uma área, o da RCO de outra). Nula = todas.
  company_id              uuid references public.companies(id) on delete cascade,
  -- Nome do fornecedor como a pessoa o reconhece ("Meta Ads"), não como o banco o imprime.
  name                    text not null check (length(btrim(name)) between 2 and 80),
  match_kind              text not null check (match_kind in ('prefix', 'contains')),
  -- Gravado normalizado (trigger): é comparado com `normalize_card_description`.
  pattern                 text not null check (length(pattern) >= 3),
  priority                int not null default 100,
  management_account_id   uuid not null references public.management_accounts(id) on delete restrict,
  cost_center_id          uuid references public.cost_centers(id) on delete set null,
  beneficiary_company_id  uuid references public.companies(id) on delete set null,
  counterparty_id         uuid references public.counterparties(id) on delete set null,
  is_active               boolean not null default true,
  created_from_line_id    uuid,
  created_by              uuid references auth.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index uq_classification_rules_active
  on public.classification_rules (organization_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), match_kind, pattern)
  where is_active;
create index idx_classification_rules_org on public.classification_rules(organization_id) where is_active;

comment on table public.classification_rules is
  'Regra de classificação de compra de cartão: descrição normalizada → item gerencial (+ área, beneficiária, fornecedor). Compra classificada por regra conta como confirmada.';

-- Regra coerente: padrão normalizado; item de gasto/financeiro da organização; área,
-- empresa e beneficiária da mesma organização.
create or replace function public.classification_rules_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_item public.management_accounts%rowtype;
begin
  new.pattern := public.normalize_card_description(new.pattern);
  if length(new.pattern) < 3 then
    raise exception 'Padrão da regra precisa de ao menos 3 letras ou dígitos';
  end if;

  select * into v_item from management_accounts where id = new.management_account_id;
  if v_item.organization_id <> new.organization_id then
    raise exception 'Item do plano gerencial é de outra organização';
  end if;
  if v_item.parent_id is null then
    raise exception 'Regra aponta para item do plano gerencial, não para o grupo "%"', v_item.name;
  end if;
  if v_item.kind not in ('expense', 'financial') then
    raise exception 'Compra de cartão não pode cair em "%" (%)', v_item.name, v_item.kind;
  end if;

  if new.company_id is not null and not exists (
    select 1 from companies where id = new.company_id and organization_id = new.organization_id) then
    raise exception 'Empresa da regra é de outra organização';
  end if;
  if new.beneficiary_company_id is not null and not exists (
    select 1 from companies where id = new.beneficiary_company_id and organization_id = new.organization_id) then
    raise exception 'Empresa beneficiária é de outra organização';
  end if;
  if new.cost_center_id is not null and not exists (
    select 1 from cost_centers where id = new.cost_center_id and organization_id = new.organization_id) then
    raise exception 'Área é de outra organização';
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger trg_classification_rules_check
  before insert or update on public.classification_rules
  for each row execute function public.classification_rules_check();

create trigger trg_classification_rules_updated before update on public.classification_rules
  for each row execute function set_updated_at();
create trigger trg_audit_classification_rules
  after insert or update or delete on public.classification_rules
  for each row execute function audit_record();

-- RLS por organização, como o plano gerencial: lê quem tem acesso a alguma empresa da
-- organização; escreve admin/editor.
alter table public.classification_rules enable row level security;

create policy classification_rules_sel on public.classification_rules
  for select to authenticated
  using (
    (select public.can_view_module('financials'))
    and (
      (select public.is_super_admin())
      or organization_id in (
           select c.organization_id from public.company_access ca
           join public.companies c on c.id = ca.company_id
           where ca.user_id = (select auth.uid())
         )
    )
  );

-- Escrita: regra de UMA empresa exige poder escrever nela; regra de todas as empresas,
-- administrador. A regra classifica compras das empresas que alcança (aplicação é
-- `security definer`), então criar uma é escrever nelas — um lançador da empresa A não
-- pode decidir como as compras da B são classificadas.
create policy classification_rules_ins on public.classification_rules
  for insert to authenticated
  with check (
    (select public.is_super_admin())
    or (company_id is not null and public.has_company_write_access(company_id))
    or (
      company_id is null
      and (select public.current_user_role()) = 'admin'
      and organization_id in (
            select c.organization_id from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  );

create policy classification_rules_upd on public.classification_rules
  for update to authenticated
  using (
    (select public.is_super_admin())
    or (company_id is not null and public.has_company_write_access(company_id))
    or (
      company_id is null
      and (select public.current_user_role()) = 'admin'
      and organization_id in (
            select c.organization_id from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  )
  with check (
    (select public.is_super_admin())
    or (company_id is not null and public.has_company_write_access(company_id))
    or (
      company_id is null
      and (select public.current_user_role()) = 'admin'
      and organization_id in (
            select c.organization_id from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  );

create policy classification_rules_del on public.classification_rules
  for delete to authenticated
  using (
    (select public.is_super_admin())
    or (company_id is not null and public.has_company_write_access(company_id))
    or (
      company_id is null
      and (select public.current_user_role()) = 'admin'
      and organization_id in (
            select c.organization_id from public.company_access ca
            join public.companies c on c.id = ca.company_id
            where ca.user_id = (select auth.uid())
          )
    )
  );

create policy oauth_sem_escrita_ins on public.classification_rules
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.classification_rules
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.classification_rules
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

revoke all on public.classification_rules from anon;
revoke truncate, references, trigger on public.classification_rules from authenticated;
grant select, insert, update, delete on public.classification_rules to authenticated;

-- =============================================================================
-- 3) Linha da fatura: de onde veio a classificação
-- =============================================================================
alter table public.card_statement_lines
  add column rule_id uuid references public.classification_rules(id) on delete set null,
  add column ai_confidence numeric(4,3) check (ai_confidence between 0 and 1),
  add column suggestion_reason text check (length(suggestion_reason) <= 300);

comment on column public.card_statement_lines.suggestion_reason is
  'Por que a IA sugeriu o item — curto, para quem aceita ou recusa a sugestão.';

-- A sugestão da IA é gravada com o JWT de quem pediu (Edge Function card-lines-suggest),
-- então essas colunas entram na lista de UPDATE liberado. `rule_id` não: só a aplicação
-- de regra (abaixo) grava.
grant update (ai_confidence, suggestion_reason) on public.card_statement_lines to authenticated;

-- Rastro coerente com a origem: decisão que não veio de regra não guarda `rule_id`, e o
-- motivo e a confiança da IA só ficam enquanto a decisão é dela. Sem isso a tela de
-- regras atribuiria a uma regra uma compra que uma pessoa reclassificou.
create or replace function public.card_statement_lines_clear_stale_traces()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.classification_source is distinct from 'rule' then
    new.rule_id := null;
  end if;
  if new.classification_source is distinct from 'ai' then
    new.ai_confidence := null;
    new.suggestion_reason := null;
  end if;
  return new;
end;
$$;

create trigger trg_card_lines_clear_stale_traces
  before insert or update on public.card_statement_lines
  for each row execute function public.card_statement_lines_clear_stale_traces();

-- =============================================================================
-- 4) Aplicar regras
--
-- A melhor regra de cada compra: a da própria empresa antes da geral, depois a de menor
-- prioridade, depois o padrão mais longo (o mais específico). Só toca compra ainda sem
-- decisão humana — `unclassified` ou `suggested` (a regra vence o palpite da IA); a
-- confirmada por pessoa, ou limpa por pessoa (`source = human`), não muda.
-- =============================================================================
create or replace function public._apply_classification_rules(p_line_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with candidates as (
    select distinct on (l.id)
      l.id as line_id, r.id as rule_id, r.management_account_id, r.cost_center_id,
      r.beneficiary_company_id, r.counterparty_id
    from card_statement_lines l
    join companies c on c.id = l.company_id
    join classification_rules r
      on r.organization_id = c.organization_id
     and r.is_active
     and (r.company_id is null or r.company_id = l.company_id)
     and case r.match_kind
           when 'prefix'   then position(r.pattern in public.normalize_card_description(l.description)) = 1
           when 'contains' then position(r.pattern in public.normalize_card_description(l.description)) > 0
         end
    where l.id = any(p_line_ids)
      and l.classification_status in ('unclassified', 'suggested')
      -- Quem limpou a classificação à mão decidiu que a regra não vale para esta compra.
      and l.classification_source is distinct from 'human'
    order by l.id, (r.company_id is not null) desc, r.priority, length(r.pattern) desc, r.created_at
  )
  update card_statement_lines l
  set management_account_id  = x.management_account_id,
      cost_center_id         = coalesce(x.cost_center_id, l.cost_center_id),
      beneficiary_company_id = coalesce(x.beneficiary_company_id, l.beneficiary_company_id),
      counterparty_id        = coalesce(x.counterparty_id, l.counterparty_id),
      classification_status  = 'confirmed',
      classification_source  = 'rule',
      rule_id                = x.rule_id,
      ai_confidence          = null,
      suggestion_reason      = null
  from candidates x
  where x.line_id = l.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public._apply_classification_rules(uuid[]) from public, anon, authenticated;

-- Toda fatura gravada já sai classificada pelo que as regras sabem.
create or replace function public.card_lines_apply_rules_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._apply_classification_rules(array(select id from inserted));
  return null;
end;
$$;

create trigger trg_card_lines_apply_rules
  after insert on public.card_statement_lines
  referencing new table as inserted
  for each statement execute function public.card_lines_apply_rules_on_insert();

-- Reaplicar numa fatura — depois de criar uma regra, por exemplo. Exige poder escrever na
-- empresa da fatura.
create or replace function public.apply_classification_rules(p_statement_id uuid)
returns int
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
  return public._apply_classification_rules(
    array(select id from card_statement_lines where statement_id = p_statement_id));
end;
$$;

revoke all on function public.apply_classification_rules(uuid) from public, anon;
grant execute on function public.apply_classification_rules(uuid) to authenticated;

-- =============================================================================
-- 5) A camada gerencial só conta classificação CONFIRMADA
--
-- Sugestão da IA (`suggested`) fica visível na tela, mas a compra continua somando como
-- "Fatura de cartão" até alguém aceitar. A área é sempre decisão de pessoa ou de regra
-- (a IA não sugere área), então vale como está.
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
  on ma.id = l.management_account_id and l.classification_status = 'confirmed';

-- =============================================================================
-- 6) Regras iniciais — os fornecedores das faturas de set/2026
--
-- Template igual para qualquer organização, como o plano gerencial: só o que é óbvio
-- pelo nome. Fica de fora o que precisa de alguém da casa (7Club, Somos Biu, SER
-- Acquisition, Morada, Mentoria) — a IA sugere e uma pessoa decide.
-- =============================================================================
insert into public.classification_rules
  (organization_id, name, match_kind, pattern, priority, management_account_id, cost_center_id)
select
  o.id, r.name, r.kind, r.pattern, 100,
  (select ma.id from public.management_accounts ma
   where ma.organization_id = o.id and ma.code = r.item),
  (select cc.id from public.cost_centers cc
   where cc.organization_id = o.id and cc.is_active and cc.name = r.area)
from public.organizations o
cross join (values
  ('Meta Ads',               'prefix',   'FACEBK',                'marketing.midia',     'Marketing'),
  ('Meta Ads',               'prefix',   'METAPAY',               'marketing.midia',     'Marketing'),
  ('Anthropic',              'prefix',   'ANTHROPIC',             'tecnologia.ia',       'Tecnologia'),
  ('OpenAI',                 'prefix',   'OPENAI',                'tecnologia.ia',       'Tecnologia'),
  ('OpenRouter',             'prefix',   'OPENROUTER',            'tecnologia.ia',       'Tecnologia'),
  ('Amazon Web Services',    'prefix',   'AMAZON AWS',            'tecnologia.infra',    'Tecnologia'),
  ('Google Cloud',           'prefix',   'GOOGLE CLOUD',          'tecnologia.infra',    'Tecnologia'),
  ('Supabase',               'prefix',   'SUPABASE',              'tecnologia.infra',    'Tecnologia'),
  ('Cloudflare',             'prefix',   'CLOUDFLARE',            'tecnologia.infra',    'Tecnologia'),
  ('Coolify',                'prefix',   'COOLLABS',              'tecnologia.infra',    'Tecnologia'),
  ('Hostinger',              'contains', 'HOSTINGER',             'tecnologia.infra',    'Tecnologia'),
  ('Latitude.sh',            'prefix',   'LATITUDE SH',           'tecnologia.infra',    'Tecnologia'),
  ('Convex',                 'prefix',   'CONVEX',                'tecnologia.infra',    'Tecnologia'),
  ('GitHub',                 'prefix',   'GITHUB',                'tecnologia.software', 'Tecnologia'),
  ('Sentry',                 'prefix',   'SENTRY',                'tecnologia.software', 'Tecnologia'),
  ('Resend',                 'prefix',   'RESEND',                'tecnologia.software', 'Tecnologia'),
  ('Google Workspace',       'prefix',   'GOOGLE WORKSPACE',      'tecnologia.software', 'Tecnologia'),
  ('WhatsApp Business',      'contains', 'GOOGLE WHATSA',         'tecnologia.software', 'Tecnologia'),
  ('Panda Video',            'prefix',   'PANDA VIDEO',           'tecnologia.software', 'Tecnologia'),
  ('Vindi',                  'contains', 'VINDI',                 'tecnologia.software', 'Tecnologia'),
  ('Conta Azul',             'prefix',   'CONTA AZUL',            'tecnologia.software', 'Tecnologia'),
  ('Financial Modeling Prep','prefix',   'FINANCIALMODELINGPREP', 'tecnologia.dados',    'Tecnologia')
) as r(name, kind, pattern, item, area);

do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
  from public.organizations o
  where (select count(*) from public.classification_rules r where r.organization_id = o.id) <> 22;
  assert v_bad = 0, format('regras iniciais incompletas em %s organização(ões)', v_bad);

  -- O casamento das regras sobre as descrições reais das faturas.
  assert position('FACEBK' in public.normalize_card_description('FACEBK* DZRJ55AZV4')) = 1, 'FACEBK*';
  assert position('GOOGLE WHATSA' in public.normalize_card_description('DL*GOOGLE WHATSA')) > 0, 'DL*GOOGLE';
  assert position('LATITUDE SH' in public.normalize_card_description('LATITUDE.SH')) = 1, 'LATITUDE.SH';
end $$;

-- =============================================================================
-- Plano gerencial — Fase 0 da Central de Gastos
--
-- O PROBLEMA. O plano de contas é do contador: amarrado à DRE e à apuração, compartilhado
-- entre as empresas, e grosso onde o dinheiro mais se esconde (`6.2.28 Cartão` é uma
-- conta só para R$ 308 mil/ano). A visão gerencial — "quanto com tecnologia, com equipe,
-- com ocupação" — vinha sendo improvisada no centro de custo, que passou a repetir a conta
-- (Receitas, Impostos, Distribuição, OPEX) e, por ser redigitado a cada lançamento, a
-- divergir dela: o mesmo `9.03 IRRF sobre Bônus` está metade em Impostos e metade em
-- Distribuição.
--
-- O MODELO. Um plano gerencial da ORGANIZAÇÃO (como a central de custos), em dois níveis —
-- grupo e item —, e um mapa conta → item. O item sai da conta, uma vez, revisado; não é
-- redigitado por lançamento. Ver docs/features/central-de-gastos-plan.md §3.
--
-- ESTA MIGRATION SÓ ACRESCENTA. Nenhum lançamento, centro de custo, DRE ou modelo de
-- Balanço muda. O uso do plano (Balanço por filtro, Central) é a Fase 1.
--
-- Onde mora o mapa:
--   · `chart_of_accounts_master.management_account_id` — o padrão da organização, que é o
--     que a tela edita;
--   · `chart_of_accounts.management_account_id` — exceção de UMA empresa, nula por padrão;
--   · conta sem nenhum dos dois (criada depois, ou exclusiva de uma empresa) cai no item
--     padrão do TIPO da conta (`default_management_account_code`), para que conta nova
--     nunca suma da visão gerencial em silêncio.
-- A regra efetiva tem uma implementação só: `v_account_management_map`.
-- =============================================================================

-- =============================================================================
-- 1) Tipos
--
-- `kind` diz em que bloco do resultado o item cai e é o que a Fase 1 usa para montar o
-- Balanço; `nature` (opex/capex) só existe em despesa — receita e tributo não têm.
-- =============================================================================
create type public.management_account_kind as enum (
  'revenue',       -- receita bruta (inclui estornos, com sinal de saída)
  'revenue_tax',   -- tributo sobre a receita
  'expense',       -- gasto operacional ou de investimento
  'financial',     -- resultado financeiro (rendimento e despesa)
  'distribution'   -- distribuição aos sócios, abaixo do lucro
);

create type public.expense_nature as enum ('opex', 'capex');

-- =============================================================================
-- 2) Plano gerencial
-- =============================================================================
create table public.management_accounts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  parent_id        uuid references public.management_accounts(id) on delete restrict,
  -- Chave estável, legível e referenciável por migration (`pessoas.salario_fixo`). O nome
  -- pode mudar na tela; o código não.
  code             text not null check (code ~ '^[a-z_]+(\.[a-z0-9_]+)?$'),
  name             text not null check (length(btrim(name)) between 2 and 80),
  description      text,
  kind             public.management_account_kind not null,
  nature           public.expense_nature,
  -- Grupo transitório: o que está aqui ainda precisa ser aberto (fatura de cartão,
  -- reembolso de sócio). A Central mede quanto do gasto ainda está nele.
  requires_detail  boolean not null default false,
  sort_order       int not null default 0,
  is_active        boolean not null default true,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint management_accounts_org_code_uniq unique (organization_id, code),
  -- Natureza existe exatamente em despesa: receita "capex" não significa nada, e despesa
  -- sem natureza deixaria a linha CAPEX do Balanço sem saber se a soma.
  constraint management_accounts_nature_ck check ((kind = 'expense') = (nature is not null)),
  -- O código denuncia o nível: grupo `pessoas`, item `pessoas.salario_fixo`.
  constraint management_accounts_level_ck check ((parent_id is null) = (position('.' in code) = 0))
);

create index idx_management_accounts_org on public.management_accounts(organization_id);
create index idx_management_accounts_parent on public.management_accounts(parent_id);

comment on table public.management_accounts is
  'Plano gerencial da organização (grupo → item). Classifica o gasto pelo que ele É, a partir da conta contábil; não substitui o plano de contas. Ver docs/features/central-de-gastos-plan.md.';

-- Dois níveis, sempre. Item herda o tipo do grupo — um item "receita" dentro do grupo
-- Pessoas somaria receita como gasto. Grupo com itens não vira item de outro grupo.
create or replace function public.management_accounts_check_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.management_accounts%rowtype;
begin
  if new.parent_id is null then
    -- Grupo com itens não muda de tipo nem de código: os itens herdam os dois, e ficariam
    -- incoerentes sem que nenhum deles fosse tocado.
    if tg_op = 'UPDATE'
       and (new.kind <> old.kind or new.code <> old.code)
       and exists (select 1 from public.management_accounts where parent_id = new.id) then
      raise exception 'Grupo "%" tem itens: tipo e código não podem mudar', new.name;
    end if;
    return new;
  end if;

  select * into v_parent from public.management_accounts where id = new.parent_id;

  if v_parent.organization_id <> new.organization_id then
    raise exception 'Item e grupo do plano gerencial precisam ser da mesma organização';
  end if;
  if v_parent.parent_id is not null then
    raise exception 'O plano gerencial tem dois níveis: "%" já é um item, não um grupo', v_parent.name;
  end if;
  if v_parent.kind <> new.kind then
    raise exception 'Item "%" precisa ter o mesmo tipo do grupo "%" (%)', new.name, v_parent.name, v_parent.kind;
  end if;
  if position(v_parent.code || '.' in new.code) <> 1 then
    raise exception 'Código "%" precisa começar com o do grupo ("%.")', new.code, v_parent.code;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.management_accounts where parent_id = new.id) then
    raise exception 'Grupo "%" tem itens e não pode virar item', new.name;
  end if;

  return new;
end;
$$;

create trigger trg_management_accounts_hierarchy
  before insert or update of parent_id, kind, code, organization_id on public.management_accounts
  for each row execute function public.management_accounts_check_hierarchy();

create trigger trg_management_accounts_updated before update on public.management_accounts
  for each row execute function set_updated_at();

-- =============================================================================
-- 3) Plano inicial, para cada organização
--
-- É o template da proposta revisada com o dono do repo (plano §3.2 e §12), igual para
-- qualquer organização — editável depois pela tela. Dado de referência, não de negócio:
-- o mesmo padrão do plano de contas mestre, que também nasce em migration.
--
-- Em função, e não em INSERT solto, para que organização criada depois também nasça com
-- o plano (trigger em `organizations`): sem ele, as contas dela cairiam fora da visão
-- gerencial em silêncio. Um INSERT por linha, grupos antes dos itens — o trigger de
-- hierarquia lê o grupo, e linha inserida pelo mesmo comando não é visível para ele.
-- Idempotente: reaplicar não duplica nem sobrescreve o que a tela já editou.
-- =============================================================================
create or replace function public.seed_management_plan(p_organization_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_inserted int := 0;
  v_count int;
begin
  for r in
    select *
    from (values
        ('receitas',                    'Receitas',                                  'revenue',      null,    false, 100),
        ('receitas.servicos',           'Venda de serviços',                         'revenue',      null,    false, 101),
        ('receitas.mercadorias',        'Venda de mercadorias',                      'revenue',      null,    false, 102),
        ('receitas.outras',             'Outras receitas',                           'revenue',      null,    false, 103),
        ('receitas.estornos',           'Estornos e chargebacks',                    'revenue',      null,    false, 104),
    
        ('tributos',                    'Tributos sobre a receita',                  'revenue_tax',  null,    false, 200),
        ('tributos.iss',                'ISS',                                       'revenue_tax',  null,    false, 201),
        ('tributos.pis_cofins',         'PIS e COFINS',                              'revenue_tax',  null,    false, 202),
        ('tributos.irpj_csll',          'IRPJ e CSLL',                               'revenue_tax',  null,    false, 203),
        ('tributos.das',                'DAS — Simples Nacional',                    'revenue_tax',  null,    false, 204),
        ('tributos.irrf',               'IRRF retido',                               'revenue_tax',  null,    false, 205),
        ('tributos.outros',             'Outros tributos',                           'revenue_tax',  null,    false, 206),
    
        ('pessoas',                     'Pessoas',                                   'expense',      'opex',  false, 300),
        ('pessoas.salario_fixo',        'Salário fixo',                              'expense',      'opex',  false, 301),
        ('pessoas.variavel',            'Variável, 13º, férias e rescisão',          'expense',      'opex',  false, 302),
        ('pessoas.encargos',            'Encargos',                                  'expense',      'opex',  false, 303),
        ('pessoas.beneficios',          'Benefícios',                                'expense',      'opex',  false, 304),
        ('pessoas.prestadores',         'PJ e prestadores',                          'expense',      'opex',  false, 305),
        ('pessoas.treinamento',         'Treinamento e cursos',                      'expense',      'opex',  false, 306),
        ('pessoas.eventos',             'Endomarketing e eventos',                   'expense',      'opex',  false, 307),
        ('pessoas.outros',              'Outros gastos com pessoal',                 'expense',      'opex',  false, 308),
    
        ('tecnologia',                  'Tecnologia',                                'expense',      'opex',  false, 400),
        ('tecnologia.ia',               'Inteligência artificial',                   'expense',      'opex',  false, 401),
        ('tecnologia.infra',            'Infraestrutura e cloud',                    'expense',      'opex',  false, 402),
        ('tecnologia.software',         'Software e SaaS',                           'expense',      'opex',  false, 403),
        ('tecnologia.dados',            'Dados e APIs',                              'expense',      'opex',  false, 404),
    
        ('marketing',                   'Marketing',                                 'expense',      'opex',  false, 500),
        ('marketing.midia',             'Mídia paga e publicidade',                  'expense',      'opex',  false, 501),
        ('marketing.patrocinios',       'Patrocínios e doações',                     'expense',      'opex',  false, 502),
        ('marketing.conteudo',          'Produção de conteúdo',                      'expense',      'opex',  false, 503),
        ('marketing.ferramentas',       'Ferramentas de marketing',                  'expense',      'opex',  false, 504),
    
        ('ocupacao',                    'Ocupação e escritório',                     'expense',      'opex',  false, 600),
        ('ocupacao.aluguel',            'Aluguel',                                   'expense',      'opex',  false, 601),
        ('ocupacao.condominio',         'Condomínio',                                'expense',      'opex',  false, 602),
        ('ocupacao.utilidades',         'Energia e água',                            'expense',      'opex',  false, 603),
        ('ocupacao.telecom',            'Internet e telefonia',                      'expense',      'opex',  false, 604),
        ('ocupacao.limpeza',            'Limpeza e copa',                            'expense',      'opex',  false, 605),
        ('ocupacao.manutencao',         'Manutenção e reparos',                      'expense',      'opex',  false, 606),
        ('ocupacao.taxas',              'Impostos e taxas do imóvel',                'expense',      'opex',  false, 607),
        ('ocupacao.material',           'Material de escritório',                    'expense',      'opex',  false, 608),
    
        ('servicos',                    'Serviços profissionais',                    'expense',      'opex',  false, 700),
        ('servicos.contabilidade',      'Contabilidade',                             'expense',      'opex',  false, 701),
        ('servicos.juridico',           'Jurídico e societário',                     'expense',      'opex',  false, 702),
        ('servicos.consultoria',        'Consultoria',                               'expense',      'opex',  false, 703),
    
        ('equipamentos',                'Equipamentos',                              'expense',      'capex', false, 800),
        ('equipamentos.computadores',   'Computadores e periféricos',                'expense',      'capex', false, 801),
        ('equipamentos.mobiliario',     'Mobiliário',                                'expense',      'capex', false, 802),
        ('equipamentos.outros',         'Outros equipamentos',                       'expense',      'capex', false, 803),
    
        ('viagens',                     'Viagens e alimentação',                     'expense',      'opex',  false, 900),
        ('viagens.viagens',             'Viagens e hospedagem',                      'expense',      'opex',  false, 901),
        ('viagens.transporte',          'Transporte',                                'expense',      'opex',  false, 902),
        ('viagens.refeicoes',           'Refeições',                                 'expense',      'opex',  false, 903),
    
        ('a_detalhar',                  'A detalhar',                                'expense',      'opex',  true,  1000),
        ('a_detalhar.cartao',           'Fatura de cartão',                          'expense',      'opex',  true,  1001),
        ('a_detalhar.reembolso_socio',  'Reembolso de cartão de sócio',              'expense',      'opex',  true,  1002),
    
        ('outros',                      'Outros',                                    'expense',      'opex',  false, 1100),
        ('outros.multas',               'Multas e penalidades',                      'expense',      'opex',  false, 1101),
        ('outros.nao_identificado',     'Não identificado',                          'expense',      'opex',  false, 1102),
    
        ('financeiro',                  'Resultado financeiro',                      'financial',    null,    false, 1200),
        ('financeiro.rendimentos',      'Rendimentos de aplicações',                 'financial',    null,    false, 1201),
        ('financeiro.tarifas',          'Tarifas bancárias',                         'financial',    null,    false, 1202),
        ('financeiro.iof',              'IOF',                                       'financial',    null,    false, 1203),
        ('financeiro.juros',            'Juros e multas',                            'financial',    null,    false, 1204),
        ('financeiro.recebimento',      'Custos de recebimento (MDR e antecipação)', 'financial',    null,    false, 1205),
        ('financeiro.emprestimos',      'Empréstimos e financiamentos',              'financial',    null,    false, 1206),
        ('financeiro.outras',           'Outras despesas financeiras',               'financial',    null,    false, 1207),
    
        ('distribuicao',                'Distribuição aos sócios',                   'distribution', null,    false, 1300),
        ('distribuicao.dividendos',     'Dividendos',                                'distribution', null,    false, 1301),
        ('distribuicao.bonus',          'Bônus a sócios',                            'distribution', null,    false, 1302),
        ('distribuicao.irrf_bonus',     'IRRF sobre bônus',                          'distribution', null,    false, 1303)
    ) as p(code, name, kind, nature, requires_detail, sort_order)
    order by position('.' in p.code) > 0, p.sort_order
  loop
    insert into public.management_accounts
      (organization_id, parent_id, code, name, kind, nature, requires_detail, sort_order)
    values (
      p_organization_id,
      (select g.id from public.management_accounts g
        where g.organization_id = p_organization_id
          and g.code = split_part(r.code, '.', 1)
          and position('.' in r.code) > 0),
      r.code, r.name, r.kind::public.management_account_kind,
      r.nature::public.expense_nature, r.requires_detail, r.sort_order
    )
    on conflict (organization_id, code) do nothing;

    get diagnostics v_count = row_count;
    v_inserted := v_inserted + v_count;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.seed_management_plan(uuid) from public, anon, authenticated;

create or replace function public.organizations_seed_management_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_management_plan(new.id);
  return new;
end;
$$;

create trigger trg_organizations_seed_management_plan
  after insert on public.organizations
  for each row execute function public.organizations_seed_management_plan();

select public.seed_management_plan(o.id) from public.organizations o;

-- Auditoria só depois do seed: o template não é ato de ninguém, e 70 linhas por
-- organização sem autor seriam só ruído no `audit_log`.
create trigger trg_audit_management_accounts
  after insert or update or delete on public.management_accounts
  for each row execute function audit_record();

-- =============================================================================
-- 4) Item padrão por tipo de conta
--
-- A rede de segurança para conta que ninguém mapeou: ela cai num item honesto
-- ("Não identificado", "Outros tributos") em vez de sumir. `capital_movement`
-- (transferência), patrimonial e totalizadora não são resultado — ficam fora.
-- =============================================================================
create or replace function public.default_management_account_code(p_kind public.account_kind)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'revenue'               then 'receitas.outras'
    when 'revenue_deduction'     then 'tributos.outros'
    when 'tax_on_profit'         then 'tributos.irpj_csll'
    when 'cogs'                  then 'pessoas.outros'
    when 'personnel_expense'     then 'pessoas.outros'
    when 'operating_expense'     then 'outros.nao_identificado'
    when 'financial_income'      then 'financeiro.rendimentos'
    when 'financial_expense'     then 'financeiro.outras'
    when 'dividend'              then 'distribuicao.dividendos'
    when 'partner_bonus'         then 'distribuicao.bonus'
    when 'partner_reimbursement' then 'a_detalhar.reembolso_socio'
    else null
  end
$$;

comment on function public.default_management_account_code(public.account_kind) is
  'Item do plano gerencial para conta sem mapa explícito, pelo tipo da conta. NULL = a conta não é de resultado (transferência, patrimonial, totalizadora).';

-- =============================================================================
-- 5) O mapa conta → plano gerencial
-- =============================================================================
alter table public.chart_of_accounts_master
  add column management_account_id uuid references public.management_accounts(id) on delete restrict;
alter table public.chart_of_accounts
  add column management_account_id uuid references public.management_accounts(id) on delete restrict;

comment on column public.chart_of_accounts_master.management_account_id is
  'Item do plano gerencial desta conta, para todas as empresas. É o mapa que a tela edita.';
comment on column public.chart_of_accounts.management_account_id is
  'Exceção de UMA empresa ao mapa do plano mestre. NULL = segue o mestre (o caso normal).';

create index idx_coa_master_management on public.chart_of_accounts_master(management_account_id);
create index idx_coa_management on public.chart_of_accounts(management_account_id);

-- Que tipo de item cada tipo de conta aceita. Conta de receita em "Pessoas" seria somada
-- com o sinal errado no Balanço sem que nada acusasse. As duas exceções são deliberadas:
-- estorno (`revenue_deduction`) abate a receita, e reembolso de sócio
-- (`partner_reimbursement`) é gasto da empresa pago no cartão pessoal (plano §12).
create or replace function public.management_kind_accepts(
  p_account_kind public.account_kind,
  p_management_kind public.management_account_kind
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_account_kind
    when 'revenue'               then p_management_kind = 'revenue'
    when 'revenue_deduction'     then p_management_kind in ('revenue_tax', 'revenue')
    when 'tax_on_profit'         then p_management_kind = 'revenue_tax'
    when 'cogs'                  then p_management_kind = 'expense'
    when 'personnel_expense'     then p_management_kind = 'expense'
    when 'operating_expense'     then p_management_kind = 'expense'
    when 'financial_income'      then p_management_kind = 'financial'
    when 'financial_expense'     then p_management_kind = 'financial'
    when 'dividend'              then p_management_kind = 'distribution'
    when 'partner_bonus'         then p_management_kind = 'distribution'
    when 'partner_reimbursement' then p_management_kind in ('expense', 'distribution')
    else false
  end
$$;

-- Conta aponta para ITEM, nunca para grupo, da própria organização e de tipo compatível.
-- Grupo como destino faria o Balanço da Fase 1 não saber em que linha somar; organização
-- alheia vazaria classificação de um grupo econômico para outro.
--
-- No mestre, mudar o mapa exige admin/editor: a policy de `chart_of_accounts_master` é
-- `is_financial_user()`, que inclui o visualizador, e o mapa reclassifica as contas de
-- TODAS as empresas. Sem `auth.uid()` (migration, service role) não há papel a conferir.
create or replace function public.check_account_management_mapping()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target public.management_accounts%rowtype;
  v_org uuid;
begin
  -- Antes do retorno por nulo: apagar o mapa também é mudar o mapa.
  if tg_table_name = 'chart_of_accounts_master'
     and tg_op = 'UPDATE'
     and new.management_account_id is distinct from old.management_account_id
     and auth.uid() is not null
     and not (public.is_super_admin() or public.current_user_role() in ('admin', 'editor')) then
    raise exception 'Só administrador ou lançador muda o mapa do plano gerencial';
  end if;

  if new.management_account_id is null then
    return new;
  end if;

  select * into v_target from public.management_accounts where id = new.management_account_id;

  if tg_table_name = 'chart_of_accounts_master' then
    v_org := new.organization_id;
  else
    select c.organization_id into v_org from public.companies c where c.id = new.company_id;
  end if;

  if v_target.organization_id <> v_org then
    raise exception 'Item do plano gerencial é de outra organização';
  end if;
  if v_target.parent_id is null then
    raise exception 'Conta aponta para item do plano gerencial, não para o grupo "%"', v_target.name;
  end if;
  if not public.management_kind_accepts(new.kind, v_target.kind) then
    raise exception 'Conta % (%) não pode cair em "%", que é do tipo %',
      new.code, new.kind, v_target.name, v_target.kind;
  end if;

  return new;
end;
$$;

create trigger trg_coa_master_management_check
  before insert or update of management_account_id, kind on public.chart_of_accounts_master
  for each row execute function public.check_account_management_mapping();

create trigger trg_coa_management_check
  before insert or update of management_account_id, kind on public.chart_of_accounts
  for each row execute function public.check_account_management_mapping();

-- Conta nova no plano mestre já nasce mapeada pelo tipo — quem cadastra não precisa
-- lembrar do plano gerencial para a conta aparecer na visão gerencial.
create or replace function public.coa_master_default_management()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.management_account_id is null and not new.is_summary then
    select ma.id into new.management_account_id
    from public.management_accounts ma
    where ma.organization_id = new.organization_id
      and ma.code = public.default_management_account_code(new.kind);
  end if;
  return new;
end;
$$;

create trigger trg_coa_master_default_management
  before insert on public.chart_of_accounts_master
  for each row execute function public.coa_master_default_management();

-- O mapa inicial, por código da conta. Decisões do plano §12 que mudam o Balanço:
-- `9.03` → Distribuição; `9.04` → despesa a detalhar (dentro do EBITDA);
-- `6.2.15` → opex; `7.04` → Financeiro.
with map(account_code, management_code) as (
  values
    ('1.01',   'receitas.servicos'),
    ('1.02',   'receitas.outras'),
    ('1.03',   'receitas.mercadorias'),
    ('1.04',   'receitas.outras'),
    ('2.01',   'tributos.irrf'),
    ('2.02',   'tributos.iss'),
    ('2.03',   'tributos.pis_cofins'),
    ('2.04',   'tributos.pis_cofins'),
    ('2.05',   'tributos.irpj_csll'),
    ('2.06',   'tributos.irpj_csll'),
    ('2.07',   'tributos.outros'),
    ('2.08',   'tributos.das'),
    ('2.09',   'receitas.estornos'),
    ('4.01',   'pessoas.salario_fixo'),
    ('4.02',   'pessoas.variavel'),
    ('6.1.01', 'pessoas.salario_fixo'),
    ('6.1.02', 'pessoas.encargos'),
    ('6.1.03', 'pessoas.outros'),
    ('6.1.04', 'pessoas.beneficios'),
    ('6.1.05', 'pessoas.beneficios'),
    ('6.1.06', 'pessoas.beneficios'),
    ('6.1.07', 'pessoas.beneficios'),
    ('6.2.01', 'ocupacao.utilidades'),
    ('6.2.02', 'ocupacao.utilidades'),
    ('6.2.03', 'ocupacao.telecom'),
    ('6.2.04', 'ocupacao.telecom'),
    ('6.2.05', 'ocupacao.telecom'),
    ('6.2.06', 'ocupacao.aluguel'),
    ('6.2.07', 'ocupacao.condominio'),
    ('6.2.08', 'tecnologia.software'),
    ('6.2.09', 'servicos.contabilidade'),
    ('6.2.10', 'outros.multas'),
    ('6.2.11', 'viagens.viagens'),
    ('6.2.12', 'ocupacao.material'),
    ('6.2.13', 'ocupacao.limpeza'),
    ('6.2.14', 'ocupacao.limpeza'),
    ('6.2.15', 'ocupacao.manutencao'),
    ('6.2.16', 'marketing.midia'),
    ('6.2.17', 'marketing.patrocinios'),
    ('6.2.18', 'ocupacao.taxas'),
    ('6.2.19', 'ocupacao.taxas'),
    ('6.2.20', 'servicos.consultoria'),
    ('6.2.21', 'ocupacao.taxas'),
    ('6.2.22', 'ocupacao.taxas'),
    ('6.2.23', 'ocupacao.taxas'),
    ('6.2.24', 'servicos.juridico'),
    ('6.2.25', 'pessoas.eventos'),
    ('6.2.26', 'pessoas.eventos'),
    ('6.2.27', 'equipamentos.mobiliario'),
    ('6.2.28', 'a_detalhar.cartao'),
    ('7.01',   'financeiro.rendimentos'),
    ('7.02',   'financeiro.juros'),
    ('7.03',   'financeiro.juros'),
    ('7.04',   'financeiro.tarifas'),
    ('7.05',   'financeiro.iof'),
    ('7.06',   'financeiro.emprestimos'),
    ('7.07',   'financeiro.emprestimos'),
    ('7.08',   'financeiro.tarifas'),
    ('7.09',   'financeiro.recebimento'),
    ('7.10',   'financeiro.recebimento'),
    ('9.01',   'distribuicao.dividendos'),
    ('9.02',   'distribuicao.bonus'),
    ('9.03',   'distribuicao.irrf_bonus'),
    ('9.04',   'a_detalhar.reembolso_socio')
)
update public.chart_of_accounts_master m
set management_account_id = ma.id
from map
join public.management_accounts ma on ma.code = map.management_code
where m.code = map.account_code
  and ma.organization_id = m.organization_id;

-- Conta do mestre fora da lista acima (criada pela tela em algum ambiente) recebe o item
-- padrão do tipo, como faria o trigger se tivesse nascido agora.
update public.chart_of_accounts_master m
set management_account_id = ma.id
from public.management_accounts ma
where m.management_account_id is null
  and not m.is_summary
  and ma.organization_id = m.organization_id
  and ma.code = public.default_management_account_code(m.kind);

-- =============================================================================
-- 6) A regra efetiva — uma implementação só
--
-- exceção da empresa → mapa do mestre → item padrão do tipo. Conta que termina sem item
-- não é de resultado (transferência, patrimonial). `security_invoker`: a view nasce sobre
-- tabela com RLS e não pode furá-la (CLAUDE.md, §RLS).
-- =============================================================================
create view public.v_account_management_map with (security_invoker = true) as
select
  a.id                 as account_id,
  a.company_id,
  a.code               as account_code,
  a.name               as account_name,
  a.kind               as account_kind,
  ma.id                as management_account_id,
  ma.code              as management_code,
  ma.name              as management_name,
  g.id                 as management_group_id,
  g.code               as management_group_code,
  g.name               as management_group_name,
  ma.kind              as management_kind,
  ma.nature,
  ma.requires_detail,
  case
    when a.management_account_id is not null then 'company'
    when m.management_account_id is not null then 'master'
    when fb.id is not null                   then 'kind_default'
  end                  as mapping_source
from public.chart_of_accounts a
join public.companies c on c.id = a.company_id
left join public.chart_of_accounts_master m on m.id = a.master_account_id
left join public.management_accounts fb
  on fb.organization_id = c.organization_id
 and fb.code = public.default_management_account_code(a.kind)
left join public.management_accounts ma
  on ma.id = coalesce(a.management_account_id, m.management_account_id, fb.id)
left join public.management_accounts g on g.id = ma.parent_id
where not a.is_summary;

comment on view public.v_account_management_map is
  'Item efetivo do plano gerencial de cada conta analítica: exceção da empresa, senão o mapa do mestre, senão o padrão do tipo. É A regra — não a reimplemente no cliente.';

grant select on public.v_account_management_map to authenticated;

-- =============================================================================
-- 7) RLS — mesmo desenho da central de custos global
--
-- Leitura: quem tem acesso a alguma empresa da organização (expõe o NOME dos itens,
-- nunca valor). Escrita: admin/editor da organização.
-- =============================================================================
alter table public.management_accounts enable row level security;

create policy management_accounts_sel on public.management_accounts
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

create policy management_accounts_ins on public.management_accounts
  for insert to authenticated
  with check (
    (select public.can_view_module('financials'))
    and (
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
  );

create policy management_accounts_upd on public.management_accounts
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

-- Apagar item mapeado é barrado pela FK (`on delete restrict`); o caminho normal é
-- desativar. Apagar fica para o item criado por engano e nunca usado.
create policy management_accounts_del on public.management_accounts
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

-- Trio restritivo: token de OAuth (cliente de IA) não escreve.
create policy oauth_sem_escrita_ins on public.management_accounts
  as restrictive for insert to authenticated
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_upd on public.management_accounts
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_sem_escrita_del on public.management_accounts
  as restrictive for delete to authenticated
  using ((select auth.jwt() ->> 'client_id') is null);

grant select, insert, update, delete on public.management_accounts to authenticated;

-- =============================================================================
-- 8) Conferência — `db:reset` falha se o plano ou o mapa saírem errados
-- =============================================================================
do $$
declare
  v_orgs int;
  v_bad int;
  v_missing text;
begin
  select count(*) into v_orgs from public.organizations;

  -- 13 grupos e 57 itens por organização.
  select count(*) into v_bad
  from public.organizations o
  where (select count(*) from public.management_accounts ma
         where ma.organization_id = o.id and ma.parent_id is null) <> 13
     or (select count(*) from public.management_accounts ma
         where ma.organization_id = o.id and ma.parent_id is not null) <> 57;
  assert v_bad = 0, format('plano gerencial incompleto em %s organização(ões)', v_bad);

  -- Toda conta analítica de resultado do mestre tem item.
  select string_agg(m.code, ', ') into v_missing
  from public.chart_of_accounts_master m
  where not m.is_summary
    and public.default_management_account_code(m.kind) is not null
    and m.management_account_id is null;
  assert v_missing is null, format('contas do mestre sem plano gerencial: %s', v_missing);

  -- As decisões do plano §12, conferidas onde a conta existe.
  select string_agg(m.code || '→' || coalesce(ma.code, 'nulo'), ', ') into v_missing
  from public.chart_of_accounts_master m
  left join public.management_accounts ma on ma.id = m.management_account_id
  join (values
    ('9.03',   'distribuicao.irrf_bonus'),
    ('9.04',   'a_detalhar.reembolso_socio'),
    ('6.2.15', 'ocupacao.manutencao'),
    ('7.04',   'financeiro.tarifas'),
    ('6.2.28', 'a_detalhar.cartao'),
    ('6.2.27', 'equipamentos.mobiliario')
  ) as d(account_code, management_code) on d.account_code = m.code
  where ma.code is distinct from d.management_code;
  assert v_missing is null, format('mapa diverge das decisões do plano: %s', v_missing);

  -- Ninguém mudou de lugar: a migration só acrescenta. Toda conta analítica de empresa
  -- resolve para um item pela view, exceto as que não são de resultado.
  select count(*) into v_bad
  from public.chart_of_accounts a
  left join public.v_account_management_map v on v.account_id = a.id
  where not a.is_summary
    and public.default_management_account_code(a.kind) is not null
    and v.management_account_id is null;
  assert v_bad = 0, format('%s conta(s) de empresa sem item efetivo', v_bad);
end $$;

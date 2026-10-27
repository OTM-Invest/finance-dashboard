-- =============================================================================
-- Seed LOCAL (db:reset) — configuração fiscal real do grupo OTM para validar a
-- esteira NFS-e/NF-e de ponta a ponta no ambiente local.
--
-- Escopo: dados de NEGÓCIO do próprio grupo (CNPJ/IE/IM/recebedores próprios +
-- códigos fiscais públicos). NÃO contém segredos do Vault (token do Focus,
-- secret key do pagar.me, segredo de webhook) nem PII de cliente — esses são
-- configurados pela UI (RPCs SECURITY DEFINER → Vault). Sem eles a config fica
-- pronta, mas a emissão real depende do operador cadastrar os tokens.
--
-- Idempotência: roda em banco recriado do zero (db:reset). Inserts com conflito
-- protegido por segurança.
-- =============================================================================

-- IDs fixos (referência cruzada no seed)
--   org           00000000-0000-0000-0000-000000000001  (OTM Group — já existe)
--   RCO Tecnologia 00000000-0000-0000-0000-000000000013 (já existe)
--   Jimmy Carvalho 00000000-0000-0000-0000-000000000014 (criado aqui)
--   conta pagar.me 00000000-0000-0000-0000-0000000000a0

-- -----------------------------------------------------------------------------
-- 1. Empresas — CNPJ da RCO + cadastro da Jimmy (emissora de NF-e/produto)
-- -----------------------------------------------------------------------------
update public.companies
set cnpj = '55481643000196'
where id = '00000000-0000-0000-0000-000000000013' and cnpj is null;

insert into public.companies (id, organization_id, legal_name, trade_name, cnpj, tax_regime, is_holding, sort_order)
values (
  '00000000-0000-0000-0000-000000000014',
  '00000000-0000-0000-0000-000000000001',
  'Jimmy Carvalho Educacao Financeira LTDA',
  'Jimmy Carvalho',
  '37383325000100',
  'lucro_presumido',
  false,
  4
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Config fiscal — Jimmy = NF-e (produto/livro, imunidade de ICMS)
--    Defaults de produto vão em parametros.nfe (o worker consome no fallback).
-- -----------------------------------------------------------------------------
insert into public.fiscal_company_settings (
  company_id, document_type, ambiente, emission_mode, enabled,
  inscricao_estadual, regime_tributario, serie, emitente_endereco, parametros
)
values (
  '00000000-0000-0000-0000-000000000014',
  'nfe', 'homologacao', 'automatic', true,
  '206764802112', 3, '101',
  jsonb_build_object(
    'logradouro', 'Alameda Rio Negro',
    'numero', '500',
    'complemento', 'ANEXO 54 Torre B Sala 501 a 508 Andar 5',
    'bairro', 'Alphaville Centro Industrial e Empresarial',
    'municipio', 'Barueri',
    'uf', 'SP',
    'cep', '06454000'
  ),
  jsonb_build_object('nfe', jsonb_build_object(
    'codigoProduto', '899',
    'descricao', 'Curso e Plataforma RCO Dash',
    'ncm', '49019900',
    'cest', '2806400',
    'cfopInterno', '5101',
    'cfopInterestadual', '6107',
    'origem', 0,
    'cstIcms', '41',
    'codigoBeneficioFiscal', 'SP070130',
    'pisCst', '01',
    'pisAliquota', 0.65,
    'cofinsCst', '01',
    'cofinsAliquota', 3.00,
    'infoComplementar', 'PRODUTO COM IMUNIDADE TRIBUTARIA CONFORME ALINEA D, DO INCISO VI, DO ARTIGO 150 DA CF/88. IPI isento conforme Cap. III secao I do decreto n 7.212/2010. Resposta a consulta RC 17.474 - Manual ISBN Pag.24'
  ))
)
on conflict (company_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Config fiscal — RCO = NFS-e (serviço, Barueri, Simples Nacional)
--    Código de serviço do layout 2026 (080201220) + códigos do Simples Barueri.
-- -----------------------------------------------------------------------------
insert into public.fiscal_company_settings (
  company_id, document_type, ambiente, emission_mode, enabled,
  inscricao_municipal, municipio_ibge, item_lista_servico, aliquota_iss,
  iss_retido, optante_simples, codigo_opcao_simples_nacional,
  regime_tributario_simples_nacional, discriminacao
)
values (
  '00000000-0000-0000-0000-000000000013',
  'nfse', 'homologacao', 'automatic', true,
  '5BF7555', '3505708', '080201220', 0.0200,
  false, true, 3, 1, 'Research RCO'
)
on conflict (company_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Conta pagar.me (Jimmy) — dona = Jimmy; recebedores: Jimmy + RCO (split)
--    Segredos (webhook/api) ficam null → cadastrados pela UI (Vault).
-- -----------------------------------------------------------------------------
insert into public.pagarme_accounts (id, organization_id, slug, label, owner_company_id, ambiente, active)
values (
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-000000000001',
  'jimmy-carvalho', 'Jimmy Carvalho',
  '00000000-0000-0000-0000-000000000014',
  'homologacao', true
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Mapa de recebedores do split → empresa (escopado à conta)
-- -----------------------------------------------------------------------------
insert into public.pagarme_recipient_map (pagarme_account_id, pagarme_recipient_id, company_id, ambiente, active)
values
  ('00000000-0000-0000-0000-0000000000a0', 're_cmgv7foko2q4a0l9tyv9if1mo', '00000000-0000-0000-0000-000000000014', 'homologacao', true),
  ('00000000-0000-0000-0000-0000000000a0', 're_cmnz0qnjs1wff0l9tu8zrhyg8', '00000000-0000-0000-0000-000000000013', 'homologacao', true)
on conflict (pagarme_account_id, pagarme_recipient_id) do nothing;

-- -----------------------------------------------------------------------------
-- Grupos de agregação — um recorte de exemplo para validar a consolidação seletiva
-- localmente (DRE/KPI/caixa somando 2 de 4 empresas, e não as 4).
-- -----------------------------------------------------------------------------
insert into public.company_groups (id, organization_id, name, description, sort_order)
values (
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  '00000000-0000-0000-0000-000000000001',
  'OTM (Assessoria + Corretora)',
  'Braço OTM sem a educação financeira nem a tecnologia',
  0
)
on conflict (id) do nothing;

insert into public.company_group_members (group_id, company_id, organization_id)
select
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  c.id,
  c.organization_id
from public.companies c
where c.id in (
  '00000000-0000-0000-0000-000000000011',  -- OTM Assessoria
  '00000000-0000-0000-0000-000000000012'   -- OTM Corretora
)
on conflict (group_id, company_id) do nothing;

-- -----------------------------------------------------------------------------
-- Centros de custo nos lançamentos + um duplicado de propósito.
--
-- Sem isto o relatório de centro de custo local mostra só "Sem centro de custo". A
-- central é GLOBAL, então a distribuição não olha empresa: qualquer lançamento pode
-- usar qualquer centro.
-- -----------------------------------------------------------------------------
update public.transactions t
set cost_center_id = escolhido.id
from (
  select cc.id, row_number() over (order by cc.name) - 1 as pos
  from public.cost_centers cc
  where cc.is_active
) escolhido
where escolhido.pos =
        abs(hashtext(t.id::text)) % greatest((select count(*) from public.cost_centers where is_active), 1)
  and t.cost_center_id is null
  and t.deleted_at is null;

-- Um centro duplicado, para exercitar a FUSÃO na central global: nasce separado de
-- "Administrativo" e é o candidato natural a ser fundido nele.
insert into public.cost_centers (organization_id, name, description)
select '00000000-0000-0000-0000-000000000001', 'OTM Corretora - Administrativo',
       'Nome divergente de propósito: candidato a fusão com Administrativo'
on conflict do nothing;

update public.transactions t
set cost_center_id = (
  select cc.id from public.cost_centers cc
  where lower(btrim(cc.name)) = 'otm corretora - administrativo' limit 1
)
where t.company_id = '00000000-0000-0000-0000-000000000012'
  and t.deleted_at is null
  and abs(hashtext(t.id::text)) % 3 = 0;

-- -----------------------------------------------------------------------------
-- 6. Regras de tributo — parâmetros extraídos das planilhas de cálculo
--
-- Reproduz o que hoje vive em célula de planilha, uma aba por mês: alíquota,
-- presunção, adicional, retenção e vencimento. Serve de ambiente local pronto e de
-- registro do que a contabilidade pratica hoje.
--
-- Fonte: `calculo iss-pis-cofins Otm assessor.xlsx`, `calculo IRPJ-CSLL Otm
-- assessor.xlsx`, `calculo PIS_COFINS_jce.xlsx`, `calculo_IRPJ_CSLL_ jce.xlsx`.
--
-- Vencimentos: DARF, ISS e IRRF ANTECIPAM para o dia útil anterior. É a correção de
-- três datas que as planilhas registram em dia não útil (ISS 10/10/2026 num sábado;
-- IRPJ 31/10/2026 num sábado; IRPJ 31/01/2027 num domingo).
-- -----------------------------------------------------------------------------

-- Classificação fiscal da receita: serviço em geral (32%) nas duas contas de receita
-- do plano mestre. Sem isso a apuração cairia na classe padrão da regra e avisaria.
update public.chart_of_accounts_master
   set presumption_class = 'servico_geral'
 where kind = 'revenue' and presumption_class is null;
update public.chart_of_accounts
   set presumption_class = 'servico_geral'
 where kind = 'revenue' and presumption_class is null;

-- OTM Assessoria: serviço puro.
-- ⚠️ `base_date_basis = 'cash'`: o lançamento de comissão tem `accrual_date` no mês a
-- que a comissão SE REFERE, e a competência fiscal é a da NOTA — que nesses dados cai
-- no `cash_date`. Por competência o IRPJ do 3t2026 daria R$ 681.872,60; por caixa dá
-- R$ 1.543.003,86, que é o número da planilha.
insert into public.tax_rules (
  company_id, kind, period_kind, base_source, base_date_basis, rate, uses_presumption,
  default_presumption_class, surtax_rate, surtax_monthly_allowance,
  deducts_retentions, due_day, due_month_offset, due_date_adjust, payee, valid_from, notes
) values
  ('00000000-0000-0000-0000-000000000011', 'iss', 'monthly', 'revenue_accounts', 'cash', 0.02,
   false, null, null, null, false, 10, 1, 'previous_business_day',
   'PREFEITURA DE BARUERI', '2026-01-01', 'ISS de Barueri sobre o faturamento do mês'),
  ('00000000-0000-0000-0000-000000000011', 'darf_pis', 'monthly', 'revenue_accounts', 'cash', 0.0065,
   false, null, null, null, true, 25, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'PIS cumulativo'),
  ('00000000-0000-0000-0000-000000000011', 'darf_cofins', 'monthly', 'revenue_accounts', 'cash', 0.03,
   false, null, null, null, true, 25, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'COFINS cumulativa'),
  ('00000000-0000-0000-0000-000000000011', 'darf_irpj', 'quarterly', 'revenue_accounts', 'cash', 0.15,
   true, 'servico_geral', 0.10, 20000, true, 31, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01',
   'Lucro presumido trimestral; adicional de 10% acima de R$ 60.000 no trimestre; IRRF de 1,5% das NFs deduzido como retenção'),
  ('00000000-0000-0000-0000-000000000011', 'darf_csll', 'quarterly', 'revenue_accounts', 'cash', 0.09,
   true, 'servico_geral', null, null, false, 31, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'Lucro presumido trimestral, sem adicional');

-- Faixas de presunção da OTM: 32% até R$ 1.250.000 no trimestre, 35,2% no excedente.
-- ATENÇÃO: a majoração é regra da contabilidade, confirmada pelo dono do repo. A
-- planilha aplica a faixa base sobre R$ 1.250.000 FIXOS; aqui é por interseção com a
-- receita, que é o que impede imposto negativo em trimestre sem receita.
insert into public.tax_rule_presumptions (rule_id, presumption_class, threshold_from, threshold_to, rate)
select r.id, 'servico_geral', v.f, v.t, v.rate
from public.tax_rules r
cross join (values (0, 1250000, 0.32), (1250000, null, 0.352)) as v(f, t, rate)
where r.company_id = '00000000-0000-0000-0000-000000000011'
  and r.kind in ('darf_irpj', 'darf_csll');

-- IRRF de 10% sobre distribuição de lucros acima de R$ 49.999,99 por sócio.
-- `full_when_exceeded` reproduz a planilha, que aplica os 10% sobre o valor inteiro de
-- quem passou do limite (E9 = 442.580 × 10% = 44.258). A leitura alternativa —
-- tributar só o excedente — é `excess`; ver `tax_allowance_mode`.
insert into public.tax_rules (
  company_id, kind, period_kind, base_source, base_date_basis, base_account_ids, rate,
  base_allowance, base_allowance_per_payee, base_allowance_mode,
  deducts_retentions, due_day, due_month_offset, due_date_adjust, payee, valid_from, notes
)
select
  '00000000-0000-0000-0000-000000000011', 'irrf_dividendos', 'monthly', 'dividends', 'cash',
  array_agg(a.id), 0.10, 49999.99, true, 'full_when_exceeded',
  false, 20, 1, 'previous_business_day', 'RECEITA FEDERAL', '2026-01-01',
  'IRRF retido do sócio na distribuição; a empresa é a fonte pagadora, então não deduz retenção própria'
from public.chart_of_accounts a
where a.company_id = '00000000-0000-0000-0000-000000000011' and a.kind = 'dividend'
having count(*) > 0;

-- Jimmy Carvalho: receita MISTA — mercadoria (NF-e), serviço (NFS-e) e ganho no
-- exterior, cada um com sua presunção. É o caso que a ferramenta antiga não sabia
-- representar de jeito nenhum.
insert into public.tax_rules (
  company_id, kind, period_kind, base_source, rate, uses_presumption,
  default_presumption_class, surtax_rate, surtax_monthly_allowance,
  deducts_retentions, due_day, due_month_offset, due_date_adjust, payee, valid_from, notes
) values
  ('00000000-0000-0000-0000-000000000014', 'iss', 'monthly', 'revenue_accounts', 0.02,
   false, null, null, null, false, 10, 1, 'previous_business_day',
   'PREFEITURA DE BARUERI', '2026-01-01', 'ISS só sobre a receita de serviço (NFS-e)'),
  ('00000000-0000-0000-0000-000000000014', 'darf_pis', 'monthly', 'revenue_accounts', 0.0065,
   false, null, null, null, true, 25, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'PIS cumulativo, com retenção da NF deduzida'),
  ('00000000-0000-0000-0000-000000000014', 'darf_cofins', 'monthly', 'revenue_accounts', 0.03,
   false, null, null, null, true, 25, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'COFINS cumulativa, com retenção da NF deduzida'),
  ('00000000-0000-0000-0000-000000000014', 'darf_irpj', 'quarterly', 'revenue_accounts', 0.15,
   true, 'servico_geral', 0.10, 20000, true, 31, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'Presunção por classe: mercadoria 8%, serviço 32%, exterior 100%'),
  ('00000000-0000-0000-0000-000000000014', 'darf_csll', 'quarterly', 'revenue_accounts', 0.09,
   true, 'servico_geral', null, null, false, 31, 1, 'previous_business_day',
   'RECEITA FEDERAL', '2026-01-01', 'Presunção por classe: mercadoria 12%, serviço 32%, exterior 100%');

-- IRPJ da Jimmy: mercadoria a 8%.
insert into public.tax_rule_presumptions (rule_id, presumption_class, threshold_from, threshold_to, rate)
select r.id, v.cls::public.tax_presumption_class, 0, null, v.rate
from public.tax_rules r
cross join (values ('revenda_mercadoria', 0.08), ('servico_geral', 0.32), ('financeiro_exterior', 1.0))
  as v(cls, rate)
where r.company_id = '00000000-0000-0000-0000-000000000014' and r.kind = 'darf_irpj';

-- CSLL da Jimmy: mercadoria a 12% — é a diferença que a planilha registra e que a
-- ferramenta antiga não tinha onde guardar.
insert into public.tax_rule_presumptions (rule_id, presumption_class, threshold_from, threshold_to, rate)
select r.id, v.cls::public.tax_presumption_class, 0, null, v.rate
from public.tax_rules r
cross join (values ('revenda_mercadoria', 0.12), ('servico_geral', 0.32), ('financeiro_exterior', 1.0))
  as v(cls, rate)
where r.company_id = '00000000-0000-0000-0000-000000000014' and r.kind = 'darf_csll';

-- A OTM tem a data-base CONFERIDA — o IRPJ do 3t2026 por caixa dá R$ 1.543.003,86 e o
-- ISS de ago/2026 dá R$ 681.872,60, os dois números da planilha no centavo. A JCE fica
-- não conferida de propósito: a base dela não foi batida contra as notas, e a apuração
-- deve avisar até alguém conferir.
update public.tax_rules set base_date_basis_confirmed = true
 where company_id = '00000000-0000-0000-0000-000000000011';

-- Receita do BTG: que empresa recebe cada relatório de comissão (receita-por-area.md).
-- Em produção, configurado na tela /receita → Sincronização.
insert into public.btg_report_routes (organization_id, kind, company_id) values
  ('00000000-0000-0000-0000-000000000001', 'pj1',    '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000001', 'pj2',    '00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000001', 'finder', '00000000-0000-0000-0000-000000000012');

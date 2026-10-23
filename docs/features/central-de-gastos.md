# Central de Gastos — estado, decisões e o que falta

> **Leia isto primeiro** ao continuar o trabalho. Atualizado em 2026-10-23.
>
> - Branch: `feat/plano-gerencial` — 8 commits sobre `main` (Fases 0 a 3, Fase 5, a tool
>   de MCP e a documentação), **não enviada ao GitHub, sem PR, nada aplicado no remoto**.
> - Histórico completo das decisões, números e simulações:
>   [`central-de-gastos-plan.md`](central-de-gastos-plan.md). Este documento é o resumo
>   operacional; o plano é a fonte do "porquê".

## 1. O que é

Uma visão gerencial de gastos de todas as empresas do grupo — "quanto com tecnologia,
com equipamentos, com equipe, por área" — sem mexer na contabilidade. Três peças:

1. **Plano gerencial** (`management_accounts`): o que cada gasto É (Pessoas, Tecnologia,
   Marketing, Ocupação, Equipamentos…), derivado da **conta contábil** por um mapa.
2. **Área** (`cost_centers`, reaproveitada): para QUEM é o gasto (Assessores, Apoio,
   Diretoria, Tecnologia, Marketing, Comercial, Geral).
3. **Fatura de cartão aberta em compras**: o lançamento da fatura continua um só no
   financeiro; as compras ficam penduradas nele (`card_statement_lines`) e, conferidas,
   substituem o lançamento na visão gerencial.

Tudo converge numa camada única, `v_management_lines`, que alimenta o **Balanço**
(`/reports` → Balanço), a **Central** (`/gastos`) e a tool de MCP `management_breakdown`.

## 2. Mudanças de rota (e por quê)

Registre aqui toda vez que o plano mudar — é o que evita refazer discussão.

| #   | Plano inicial                                                       | O que mudou                                                                                                         | Por quê                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Manter os centros de custo intocados e criar categoria/área à parte | **Plano gerencial único** + centro de custo reorganizado como área                                                  | O cruzamento centro × conta mostrou que o centro repetia a conta (Receitas, Impostos, OPEX…) e, redigitado a cada lançamento, divergia dela — o mesmo `9.03` metade em Impostos e metade em Distribuição. Duas dimensões paralelas manteriam o erro e dariam dois números para a mesma pergunta. |
| 2   | Migrar para um "Balanço V2" paralelo e comparar                     | **Reescrever os 6 modelos no lugar**, numa migration que se confere                                                 | O dono recusou o V2 ("gambiarra"). A comparação antes × depois virou simulação de leitura no remoto + `assert` dentro da migration.                                                                                                                                                              |
| 3   | "Diretoria + TI" seguiria como linha única                          | Dividido por **cargo do colaborador**: TI → Tecnologia, gestor de escritório → Apoio, sócios assessores → Diretoria | Confirmado pelo dono. Na OTM Assessoria isso criou a linha "Apoio" (R$ 234 mil/ano), que senão cairia em "Não classificado".                                                                                                                                                                     |
| 4   | Fase 4: ler fatura em imagem por visão (IA)                         | **Fase 4 cancelada**                                                                                                | Os dois PDFs-imagem (OTM, RCO) foram um "imprimir → salvar PDF" por engano; as faturas reais têm texto. O leitor de texto cobre o C6.                                                                                                                                                            |
| 5   | Linha da fatura com `cost_center_id` próprio, sem efeito no Balanço | A linha tem área e item; a fatura conferida **entra no Balanço** pelas compras                                      | Com o Balanço lendo `v_management_lines`, Central e Balanço passaram a ter uma fonte só.                                                                                                                                                                                                         |
| 6   | IA classifica                                                       | **IA só sugere**; só classificação confirmada conta                                                                 | Número do Balanço não pode sair de palpite. Regra é decisão humana e conta como confirmada.                                                                                                                                                                                                      |
| 7   | Escrita nas tabelas da fatura por RLS                               | **Escrita só por RPC** (`save_card_statement`, `delete_card_statement`), exceto classificar                         | Revisão achou: o Supabase concede ALL a `anon`/`authenticated` em tabela nova; com isso dava para marcar fatura que não fecha como conferida.                                                                                                                                                    |
| 8   | Regra escrita por admin/editor de qualquer empresa                  | Regra de uma empresa exige escrita nela; regra geral exige admin                                                    | Revisão: a aplicação de regra é `security definer` e alcançava empresas onde o autor não escreve.                                                                                                                                                                                                |

| 9 | Conferência "Σ camada × Σ DRE" | **Camada × lançamentos** (`transactions`), líquido por empresa/mês | O que a camada promete é não criar nem sumir com dinheiro em relação aos lançamentos; a DRE é uma agregação deles com regras próprias (natureza de conta), e comparar com ela misturaria duas perguntas. O bruto difere por construção (estorno de compra vira entrada na camada); o líquido, não. A migration se confere com `assert`. |
| 10 | `management_breakdown_multi` com mês na chave | **Sem mês na chave**: agregado do período + `months date[]`; `p_by_vendor` e `p_codes` | Com fornecedor e mês o consolidado passaria de mil linhas (o `max_rows` do PostgREST, que corta **sem erro**). Comparação de períodos = chamar de novo com outro intervalo; recorrência sai do array de meses. A tela lê em páginas com ordem total; o MCP usa `p_by_vendor=false` ou `p_codes` e avisa se bater no teto. |
| 11 | Cartões direto das tabelas | RPC própria `management_card_summary` | Mesmo regime e data (a do lançamento da fatura) da Central — o total por cartão fecha com a origem "cartão" (teste). Parcelas a vencer só da última fatura de cada cartão no período, para não contar a mesma parcela duas vezes. |
| 12 | Regras da Central no cliente (`src/`) | Em `supabase/functions/_shared/management/breakdown.ts`, reexportadas pela tela | A tool de MCP precisa do mesmo número (padrão de `dre-totais.ts`). |

Decisões de negócio tomadas (plano §12): `9.03 IRRF s/ bônus` → Distribuição; `9.04
Reembolso de cartão de sócio` → despesa (EBITDA), em "A detalhar"; manutenção opex com
capex por exceção; tarifas bancárias → resultado financeiro; empresa beneficiária só
gerencial; IA liberada (API Anthropic).

## 3. O que existe

### Fase 0 — plano gerencial (`20261023154641_plano_gerencial.sql`)

- `management_accounts` (13 grupos, 57 itens por organização; `code` estável tipo
  `pessoas.salario_fixo`), semeado por `seed_management_plan(org)` e trigger em
  `organizations`.
- Mapa: `chart_of_accounts_master.management_account_id` (padrão),
  `chart_of_accounts.management_account_id` (exceção por empresa), item padrão por tipo
  (`default_management_account_code`). **Regra efetiva única: `v_account_management_map`.**
- Travas: conta → item (nunca grupo), tipo compatível (`management_kind_accepts`), só
  admin/editor muda o mapa.
- Tela: `/settings/management-plan`.

### Fase 1 — áreas e Balanço por filtro (`20261023163831_areas_e_balanco_gerencial.sql`)

- `restructure_cost_centers_into_areas(org)`: renomeia/cria áreas, divide Diretoria + TI
  por cargo, desativa centros de natureza; CAPEX vira `transactions.nature_override`.
  Log em `cost_center_migration_log`.
- `rewrite_balance_model_lines(...)`: modelos do Balanço de `cost_centers` → `filter`.
- `v_management_lines`, `management_monthly_series_multi`,
  `management_line_transactions` (gaveta por chaves exatas).
- `merge_cost_centers` remapeia `clauses[].areaIds`.
- Frontend: `balance/compute.ts` (`clauseMatches`/`lineMatches` — **a** regra de que linha
  soma o quê), `FilterClausesEditor`, "Centro de custo" → "Área" na UI.

### Fase 2 — fatura de cartão (`20261023183502_faturas_de_cartao.sql`)

- Leitor C6 em `supabase/functions/_shared/cards/` (`text-lines.ts`, `c6.ts`,
  `validate.ts`, fixtures das 3 faturas reais), em centavos inteiros; o navegador lê o PDF
  com `pdfjs-dist@6.3.289` (`src/features/card-statements/reader.ts`).
- `payment_cards`, `card_statements`, `card_statement_lines`; `save_card_statement`
  refaz total, subtotal por cartão, resumo e lançamento e decide `reconciled` /
  `needs_review`; lançamento editado depois volta a fatura para conferência.
- Tela `/faturas` e `/faturas/:id`.

### Fase 3 — classificação (`20261023185538_regras_de_classificacao.sql`)

- `classification_rules` (22 regras iniciais), aplicadas ao gravar e por
  `apply_classification_rules`; precedência empresa → prioridade → padrão mais longo.
- Sugestão por IA: `_shared/cards/suggest.ts` + Edge Function `card-lines-suggest`
  (`claude-opus-5-5`, effort low, `json_schema`, `fallbacks: "default"`, SDK
  `@anthropic-ai/sdk@0.132.1`), com o JWT do usuário.
- Telas: botões na fatura (aplicar regras, sugerir, aceitar, criar regra) e
  `/settings/classification-rules`.

### Fase 5 — Central de Gastos (`20261023192736_central_de_gastos.sql`)

- RPCs `security invoker`, padrão `p_company_ids uuid[] default null`, só leitura:
  - `management_breakdown_multi(p_from, p_to, p_basis, p_company_ids, p_by_vendor, p_codes)`
    — só itens `expense` (inclui "A detalhar"), por empresa × item × área × natureza ×
    origem × fornecedor × moeda, com `outflow`, `inflow`, USD, IOF e `months`. Fornecedor =
    nome da regra › contraparte › descrição normalizada; a chave (maiúsculas) casa entre
    empresas.
  - `management_card_summary` — por cartão: total, estorno, USD, IOF, não classificado,
    parcelas a vencer; só fatura `reconciled`.
  - `management_reconciliation` — líquido da camada × líquido dos lançamentos por
    empresa/mês; a migration aborta se algum der ≠ 0.
- Regras (uma implementação): `_shared/management/breakdown.ts` — gasto = saída − entrada,
  cobertura, período anterior (anda em meses quando o período é de meses fechados), média
  12m, panorama grupo → item, por área, ranking de fornecedores, assinaturas (recorrente =
  ≥ 2 meses seguidos na janela de 12m; ativa; nova; subiu > 10%; duplicada = mais de uma
  empresa no período; USD). Reexportado em `src/features/spending/compute.ts`.
- Tela `/gastos` (menu "Central de Gastos"): faixa com gasto, anterior, média 12m e %
  classificado; abas Panorama, Por área, Tecnologia, Fornecedores, Cartões, Conferência
  (`?secao=`), regime em `?regime=`, período do `PeriodPicker`, escopo do seletor (hooks
  com `enabled: companyIds === null || companyIds.length > 0`). Tecnologia, Cartões e
  Conferência só consultam quando a aba abre.
- MCP: `management_breakdown` (`por`: grupo | item | area | fornecedor; `codigos`), logo
  depois de `expense_breakdown`. `cost_center_analysis` passou a se descrever como "por
  área".

## 4. Invariantes (não quebre)

1. **O contábil não muda.** DRE, caixa, apuração, conciliação leem `transactions` como
   antes; a fatura continua um lançamento em `6.2.28`.
2. **A camada gerencial reclassifica, nunca cria nem some com dinheiro.**
3. **Fatura só abre se fechar** (total, subtotais, resumo, lançamento) — conferido no banco.
4. **Sem dupla contagem**: fatura conferida é substituída pelas compras; linha do Balanço
   casa no máximo uma vez (assert na migration da Fase 1).
5. **Uma implementação por regra**: mapa → `v_account_management_map`; casamento de linha
   do Balanço → `compute.ts`; leitor/validador → `_shared/cards/`.
6. **Sugestão de IA não conta** até ser aceita.
7. Área vive também em jsonb (`clauses[].areaIds`): quem move/apaga área remapeia.

## 5. Como testar

```sh
bun run db:reset
for f in supabase/tests/*.sql; do psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f $f; done
bun run preflight
bun run build
```

Testes de banco desta frente: `areas_e_balanco_gerencial.sql` (26),
`faturas_de_cartao.sql` (28), `regras_de_classificacao.sql` (23), `central_de_gastos.sql` (25). O seed local **não tem a
estrutura de produção** (OPEX, Diretoria + TI…): os testes montam uma organização de
teste com ela.

Armadilhas que já custaram tempo:

- Tabela nova no Supabase nasce com ALL para `anon`/`authenticated`: revogue
  explicitamente (`revoke all … from anon; revoke insert, update, delete, truncate,
references, trigger … from authenticated`).
- Função `security definer` passa por cima das policies restritivas de OAuth: confira
  `auth.jwt() ->> 'client_id'` dentro dela.
- Mudar `cost_center_id` de lançamento de recorrência marca "editado à mão" — use
  `set_config('app.recurring_propagating', 'on', true)` quando a recorrência muda junto.
- A Edge Function não é checada pelo `tsc` do repo (só `_shared/`). Para conferir tipos,
  compile uma cópia contra o mesmo pacote npm num diretório temporário.

## 6. O que falta

### 6.1 Fase 5 — a tela `/gastos` — **feita** (ver §3)

O que ficou de fora dela:

- **Pagadora × beneficiária**: espera a UI de `beneficiary_company_id` (6.4).
- **Gaveta de lançamentos** por célula (como no Balanço): a Central ainda não abre os
  lançamentos de um item/fornecedor; quem precisa vai a `/faturas` ou ao Balanço.
- Parcelas a vencer usam as linhas parceladas; `summary.futureObligationsCents` da fatura
  (o que o banco imprime) não é exibido nem conferido contra elas.
- Sem verificação visual (preferência do dono): validado por preflight, build e testes.

Desenho original, para referência:

Fonte: `v_management_lines` (já tem item, grupo, natureza, área, origem `ledger|card`).
Criar RPC `management_breakdown_multi(p_from, p_to, p_basis, p_company_ids)` no padrão
`p_company_ids uuid[] default null`, `security invoker`, e uma de conferência
(`management_reconciliation`: Σ camada × Σ DRE por empresa/mês — deve dar zero).

Seções (plano §8):

- **Panorama**: grupo → item, variação vs. período anterior e média 12m; cobertura
  ("% confirmado", "R$ ainda em Fatura de cartão / A detalhar").
- **Por área**: custo de cada time, todas as naturezas.
- **Tecnologia / assinaturas**: recorrência (mesmo fornecedor em ≥ 2 meses seguidos),
  em dólar (`card_statement_lines.currency`), novas, que subiram, **duplicadas entre
  empresas** (mesma regra/fornecedor em mais de uma empresa — ex.: Anthropic e OpenAI na
  Jimmy e na RCO).
- **Fornecedores**: ranking e em quantas empresas aparece (regra `name` /
  `counterparty_id`).
- **Cartões**: por portador, parcelas futuras (`installment_n/total` +
  `summary.futureObligationsCents`), USD + IOF.
- **Pagadora × beneficiária**: só depois de existir UI para `beneficiary_company_id`
  (ver 6.4).
- **Conferência**: Central × DRE.
- Seletor empresa/consolidado/grupo: hook novo com
  `enabled: companyIds === null || companyIds.length > 0`.

### 6.2 MCP — **feito** (ver §3)

Falta só publicar (o Worker/Edge Function do MCP lê `_shared/` no deploy do dono).

### 6.3 Go-live (com o dono do repo)

1. `git push -u origin feat/plano-gerencial` e PR com as fases (CI "Quality gates").
2. Conferir com a contabilidade a simulação do Balanço (plano §11.2) — IRRF s/ bônus,
   móveis em CAPEX, gestor de escritório em Apoio.
3. `bun run db:push` (as migrations se conferem e abortam se algo não fechar).
4. `supabase secrets set ANTHROPIC_API_KEY=...` e publicar `card-lines-suggest`.
5. Backfill: importar as ~24 faturas de out/2025 a set/2026 pela tela `/faturas`.

### 6.4 Pendências menores

- UI para `beneficiary_company_id` (empresa que usa) e `nature_override` (capex de uma
  compra) nas linhas da fatura; e override de item gerencial por lançamento (o plano
  previa `management_account_override_id` em `transactions` — não feito).
- Regras iniciais não chegam a organização criada depois (só o plano chega).
- Áreas Marketing, Comercial e Geral foram criadas sem gente; atribuir colaboradores e
  contrapartes de OPEX com pessoal (VA, VT, encargos ~R$ 29 mil/ano sem área).
- Importação de CSV mantém o rótulo antigo "Centro de custo" da coluna.
- Leitor só do C6; outro banco = novo parser em `_shared/cards/` com fixtures.

## 7. Próxima sessão — por onde começar

1. Ler este documento, `CLAUDE.md` (seção "Plano gerencial, áreas & Central de Gastos")
   e `src/features/balance/compute.ts`.
2. `git switch feat/plano-gerencial && bun run db:reset` e rodar os testes de banco.
3. Go-live (6.3) com o dono: push, PR, conferência com a contabilidade, `db:push`.
4. Depois: pendências de 6.1 e 6.4.

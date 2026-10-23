# Central de Gastos e plano gerencial — plano

> Status: **proposta revisada** (2026-10-23). Nada implementado.
> Base empírica: as faturas C6 Business com vencimento 01/10/2026 de Jimmy, OTM
> Assessoria e RCO Tecnologia; os lançamentos de out/2025 a set/2026; e os 6 modelos de
> Balanço gravados em `balance_report_models` no remoto.
>
> Revisão anterior propunha manter o centro de custo intocado e criar dimensões à parte.
> Foi descartada: preservava a redundância centro × conta que hoje gera erro no Balanço
> (§2) e deixaria Balanço e Central com números diferentes para a mesma pergunta.

## 1. Objetivo

Uma resposta só, vinda de um lugar só, para perguntas como "quanto gastamos com
tecnologia, com equipamentos, com equipe, por área" — em todas as empresas, inclusive o
que hoje está escondido dentro da fatura do cartão. E o Balanço gerencial (`/reports` →
Balanço) continuar existindo, mais confiável do que hoje.

## 2. Diagnóstico

### 2.1 O cartão é uma caixa-preta

Uma fatura vira **um** lançamento na conta `6.2.28 Cartão`, centro `OPEX`.

| Últimos 12 meses (competência) | Cartão (6.2.28) | Faturas |
| ------------------------------ | --------------: | ------: |
| Jimmy Carvalho                 |      R$ 172.951 |       8 |
| OTM Assessoria                 |       R$ 84.917 |      12 |
| RCO Tecnologia                 |       R$ 50.713 |       4 |
| **Total**                      |  **R$ 308.582** |      24 |

É a 2ª maior despesa operacional do grupo, atrás só do aluguel. Abrir as três faturas de
set/2026 (R$ 39.897,59):

| Categoria                                                              |    Jimmy | OTM Assess. |       RCO |         Total |
| ---------------------------------------------------------------------- | -------: | ----------: | --------: | ------------: |
| Tecnologia · IA (Anthropic, OpenAI, OpenRouter)                        | 2.644,24 |           — |  9.925,13 | **12.569,37** |
| Tecnologia · Infra/cloud (AWS, Supabase, Latitude, GitHub, Hostinger…) |   140,30 |    4.841,61 |  5.761,90 | **10.743,81** |
| Marketing · Mídia paga (Meta)                                          | 2.815,94 |    7.010,12 |         — |  **9.826,06** |
| Tecnologia · SaaS (Workspace, Vindi, Conta Azul, Panda Video…)         | 1.055,00 |      348,36 |  1.171,33 |  **2.574,69** |
| Equipamentos · Mobiliário (parcela 1/3)                                |        — |    2.266,68 |         — |  **2.266,68** |
| Tecnologia · Dados/APIs (FMP, SER Acquisition)                         |        — |           — |  1.123,64 |  **1.123,64** |
| Pessoas · Treinamento (mentoria)                                       |        — |      294,00 |         — |    **294,00** |
| Não identificado (7Club, Somos Biu)                                    |    58,35 |           — |    440,99 |    **499,34** |
| **Total da fatura**                                                    | 6.713,83 |   14.760,77 | 18.422,99 | **39.897,59** |

As três somas batem centavo a centavo com o "Total a pagar". O que um mês já mostra:

- **~68% do cartão é tecnologia** (R$ 27,0 mil/mês), invisível em `6.2.08 Sistema de
Informática`; **~25% é Meta Ads**, invisível em `6.2.16 Publicidade`.
- **44% é em dólar** (R$ 17,7 mil) + **R$ 620 de IOF** no mês.
- **Quem paga ≠ quem usa**: o cartão da OTM Assessoria paga AWS, Supabase, GitHub,
  Cloudflare, Coolify, Hostinger e Resend.
- **Assinaturas duplicadas**: Anthropic e OpenAI na Jimmy _e_ na RCO.
- **Parcela esconde capex**: "MORADA MAD COMER Parcela 1/3" de R$ 2.266,68 é uma compra
  de R$ 6.800.

### 2.2 O centro de custo repete a conta — e erra

Os centros de custo formam **uma partição única que é, na prática, as linhas do
Balanço**: os 6 modelos (4 empresas, consolidado e 2 grupos) têm a mesma estrutura —
Receitas, OPEX, CAPEX, Assessores, Área de Apoio, Diretoria + TI, Impostos → Lucro e
EBITDA por fórmula → Distribuição, Rendimentos → Geração de caixa.

Cruzando centro × conta em 12 meses, quase todo centro é **determinado pela conta**:

| Centro                              | Contas que ele de fato contém                      |
| ----------------------------------- | -------------------------------------------------- |
| Receitas                            | 1.01, 1.02                                         |
| Impostos                            | 2.01–2.08 (deduções de receita)                    |
| Distribuição de Lucros              | 9.01                                               |
| Rendimentos                         | 7.01                                               |
| OPEX                                | 6.2.xx, 7.04                                       |
| Assessores · Apoio · Diretoria + TI | **só pessoal**: 4.01, 4.02, 6.1.01                 |
| CAPEX                               | 12 lançamentos — única decisão que a conta não diz |

Só duas informações não saem da conta: **de que time é o custo de pessoal** e **se é
capex**. O resto é redigitado a cada lançamento — e redigitar gera divergência, que já
distorce EBITDA e Lucro do Balanço hoje:

| Inconsistência (12m)                    | Valores                                                                                | Efeito no Balanço                              |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `9.03 IRRF sobre Bônus` em dois centros | R$ 93.080 em Impostos · R$ 84.998 em Distribuição                                      | mesma conta: metade reduz o Lucro, metade não  |
| `9.04 Reembolso Cartão` em três centros | R$ 20.108 OPEX · R$ 16.770 CAPEX · R$ 3.245 Distribuição                               | parte reduz EBITDA, parte não                  |
| Pessoal parado em OPEX                  | VA 11.586 · Encargos 7.599 · VT 4.757 · Salário 2.719 · Variável 2.139 (≈ R$ 28,8 mil) | custo de equipe sem área                       |
| `6.2.15 Manutenção e Reparos` dividida  | R$ 25.074 CAPEX · R$ 16.199 OPEX                                                       | fora/dentro do EBITDA                          |
| `6.2.16 Publicidade` no centro Receitas | R$ 4.100                                                                               | abate a receita                                |
| Centro "Receitas Jimmy"                 | R$ 16.427                                                                              | não está em modelo nenhum → "Não classificado" |
| `6.2.28 Cartão` em CAPEX                | R$ 7.468                                                                               | fatura inteira tratada como capex              |

### 2.3 As alavancas para classificar já existem

- **Todo lançamento tem contraparte** (567/567 em OPEX; 184/184 em Área de Apoio) — a
  contraparte é a chave natural de regra.
- **Diretoria + TI**: 112 dos 116 lançamentos vêm da folha, de **10 colaboradores**.
  Separar Diretoria de Tecnologia é classificar 10 pessoas, não 116 lançamentos.
- **Assessores**: 385 de 393 vêm da folha.
- **Área de Apoio**: 184 lançamentos de **21 pessoas**, sem vínculo de folha (pagamento
  direto) — 21 regras por contraparte.

## 3. O desenho: um plano gerencial, duas leituras

```
                 conta contábil (contabilidade — não muda)
                         │  mapa conta → plano gerencial (uma vez, revisado)
                         ▼
lançamentos ──►  CAMADA GERENCIAL  ◄── linhas de fatura de cartão conferida
                 (v_management_lines)       (substituem o lançamento da fatura)
                 empresa · mês · conta · plano gerencial · natureza · área ·
                 fornecedor · origem
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
        BALANÇO                 CENTRAL DE GASTOS
   linhas = filtros sobre       pivôs sobre a camada
   a camada (§5)                (§8)
```

Balanço e Central leem a **mesma** camada; por construção, não discordam.

### 3.1 Um campo por pergunta

| Campo                               | Pergunta                                                                    | Onde mora                                    | Quem preenche                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Conta contábil**                  | Como a contabilidade enxerga?                                               | `chart_of_accounts` (inalterado)             | quem lança, como hoje                                                               |
| **Plano gerencial**                 | O que é, gerencialmente? Receita, Tributos, Pessoas, Tecnologia, Marketing… | `management_accounts` (nova, global, árvore) | **automático pela conta**; sobrescrita opcional no lançamento ou na linha do cartão |
| **Natureza**                        | Opex ou capex?                                                              | atributo do plano gerencial                  | herdada; sobrescrita opcional                                                       |
| **Área**                            | Para qual time?                                                             | `cost_centers`, **reorganizado como áreas**  | obrigatória só em Pessoas (vem do colaborador/contraparte); opcional no resto       |
| **Fornecedor**                      | De quem?                                                                    | `counterparties` (+ aliases para cartão)     | já existe                                                                           |
| **Empresa pagadora / beneficiária** | Quem pagou / quem usou?                                                     | `company_id` / coluna nova gerencial         | beneficiária: regra por fornecedor; nula = pagadora                                 |
| **Portador**                        | Que cartão / pessoa?                                                        | `payment_cards` (nova)                       | fatura                                                                              |

Por que um plano gerencial e não só o plano de contas: o plano contábil é do contador,
compartilhado (`chart_of_accounts_master`), amarrado à DRE e à apuração — não dá para
abrir `6.2.28 Cartão` em vinte subcontas sem mexer no razão. O plano gerencial é a
camada onde a empresa organiza o próprio olhar, e é onde o detalhe do cartão consegue
cair sem tocar a contabilidade.

### 3.2 Plano gerencial inicial (proposta para validar)

Ele cobre **tudo** que o Balanço precisa, não só despesa:

```
Receitas            Venda de serviços · Outras receitas operacionais
Tributos s/ receita ISS · PIS · COFINS · IRPJ · CSLL · DAS · IRRF
Pessoas             Salário fixo · Variável/bônus/13º/férias · Encargos · Benefícios
                    · PJ/prestadores · Treinamento · Endomarketing/eventos
Tecnologia          IA · Infra/cloud · SaaS/ferramentas · Dados/APIs · Domínios/hosting
Marketing           Mídia paga · Conteúdo/produção · Ferramentas
Ocupação            Aluguel · Condomínio · Energia · Internet/telefonia · Limpeza/copa
                    · Manutenção · IPTU
Serviços prof.      Contabilidade · Jurídico/societário · Consultoria
Equipamentos        Computadores/periféricos · Mobiliário            (natureza: capex)
Viagens & alim.     Passagens · Hospedagem · Transporte · Refeições
Financeiro          Rendimentos · IOF · Tarifas · Juros/multas
Distribuição        Dividendos · (IRRF s/ bônus?) · (Reembolso sócio?)   ← decisão §11
Cartão a detalhar   transitória: fatura ainda não conferida
Outros              Não identificado
```

O mapa **conta → plano gerencial** é feito no `chart_of_accounts_master`, então vale
para as 4 empresas de uma vez. Exemplos: `6.1.01` → Pessoas/Salário; `6.2.08` →
Tecnologia/SaaS; `6.2.16` → Marketing/Mídia paga; `6.2.06` → Ocupação/Aluguel;
`6.2.27` → Equipamentos/Mobiliário; `6.2.28` → Cartão a detalhar; `9.01` →
Distribuição/Dividendos.

## 4. Reorganização do centro de custo → área

**A tabela `cost_centers` é reaproveitada**, só muda o papel: passa a significar _área_
(na tela, "Área"). Mais de 20 arquivos usam `cost_center_id` — folha
(`payroll_account_mappings`, `employees`), recorrência, importação, lançamento, contas a
pagar e as tools do MCP. Trocar a tabela seria churn sem ganho; o nome técnico fica.

| Centro hoje                                                       | Depois                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Assessores                                                        | **Área** Assessores                                                                               |
| Área de Apoio                                                     | **Área** Apoio                                                                                    |
| Diretoria + TI                                                    | **Áreas** Diretoria e Tecnologia (pelos 10 colaboradores)                                         |
| (novas, a validar)                                                | Marketing, Comercial, … e **Geral/compartilhado**                                                 |
| OPEX                                                              | deixa de ser centro → plano gerencial + natureza opex; área = Geral, regra por fornecedor ou nula |
| CAPEX                                                             | deixa de ser centro → **natureza capex gravada no lançamento** (preserva a decisão de vocês)      |
| Impostos · Distribuição · Receitas · Receitas Jimmy · Rendimentos | deixam de ser centro → vêm do plano gerencial; área nula                                          |

Depois disso, área responde só "para quem", e uma área pode ter gasto de qualquer
natureza: "Tecnologia" passa a ter os salários do time **e** a AWS do cartão.

## 5. O Balanço por filtro

O Balanço ganha um tipo de linha novo, ao lado de `formula` e `ratio`:

```ts
{ kind: "filter", measure, managementAccountIds?: [], areaIds?: [], nature?: "opex"|"capex" }
```

Os 6 modelos são **reescritos no lugar**, na mesma migração (mesmo id, mesma tela,
mesmo link). Equivalência proposta:

| Linha hoje (centro)                      | Linha depois (filtro)                                           |
| ---------------------------------------- | --------------------------------------------------------------- |
| Receitas                                 | plano Receitas                                                  |
| Impostos                                 | plano Tributos s/ receita                                       |
| Assessores                               | plano Pessoas ∩ área Assessores                                 |
| Área de Apoio                            | plano Pessoas ∩ área Apoio                                      |
| Diretoria + TI                           | plano Pessoas ∩ áreas Diretoria + Tecnologia (ou duas linhas)   |
| OPEX                                     | natureza opex, fora Pessoas, Tributos, Financeiro, Distribuição |
| CAPEX                                    | natureza capex                                                  |
| Distribuição                             | plano Distribuição                                              |
| Rendimentos                              | plano Financeiro/Rendimentos                                    |
| Lucro, EBITDA, margens, Geração de caixa | fórmulas — inalteradas                                          |

O tipo `cost_centers` deixa de ser oferecido no editor depois da migração (nenhum modelo
o usa mais); "Não classificado" continua existindo e passa a pegar o que não tem plano
gerencial — que, com o mapa completo, deve ser zero.

O que se ganha no Balanço além de consistência: linhas que hoje são impossíveis —
"Tecnologia" inteira (salários + SaaS + cartão), "Marketing" com a Meta do cartão,
"Custo do time X" somando pessoal e ferramentas.

## 6. A migração única

Uma migration, depois que o mapa e as áreas estiverem validados (§10, Fase 1):

1. Cria `management_accounts`, o mapa no master e `nature` (com override em
   `transactions.nature_override`).
2. **Log antes de tudo**: `cost_center_migration_log (transaction_id, old_cost_center_id,
new_area_id, nature_override)` — a fotografia do estado anterior. É a rede de
   segurança e a trilha de auditoria; com ela a operação é reversível.
3. Aplica a reorganização do §4 em `transactions`, `recurring_templates`, `employees` e
   `payroll_account_mappings`: centro de natureza → `null` (ou Geral) + override de
   natureza onde era CAPEX; Diretoria + TI → área pelo colaborador; pessoal parado em
   OPEX → área pela contraparte.
4. Desativa os centros de natureza (não apaga: `is_active = false`, histórico preservado
   no log).
5. Reescreve os 6 `balance_report_models.lines` (§5).
6. **Confere dentro da própria migration**, com `assert`, por empresa e mês, competência
   e caixa:
   - **Geração de caixa idêntica** ao centavo — a migração reclassifica, não cria nem
     some dinheiro. Se divergir, a migration falha e nada é gravado.
   - **EBITDA e Lucro** só podem divergir pelas reclassificações explícitas do §2.2 que
     vocês aprovarem; a migration compara com a tabela de diferenças esperadas.
7. Antes de aplicar no remoto: rodar contra um snapshot e entregar a **matriz do ano
   antes × depois** por modelo, com cada diferença explicada, para aprovação.

`db:reset` local primeiro, como sempre; `db:push` só após PR.

## 7. Leitor de faturas

### 7.1 O que as três faturas ensinaram

- **Duas das três PDFs não têm texto** — OTM e RCO foram "impressas" pelo navegador como
  imagem (`Skia/PDF`, zero fontes). Só a da Jimmy tem camada de texto. O leitor precisa de
  dois caminhos: texto e visão. Vale testar baixar a fatura direto do app/internet banking
  do C6 (e checar exportação CSV/OFX), que dispensaria a visão.
- **Pagamento aparece como linha**: "Inclusao de Pagamento" e "Pag Fatura Boleto
  5.202,16". Excluindo o pagamento, as 40 linhas da Jimmy batem exatamente com
  R$ 6.713,83.
- **IOF é linha separada**, mesma data/estabelecimento da compra internacional → anexar à
  compra (`iof_amount`): o custo real da ferramenta é USD × cotação + IOF.
- **Moeda e cotação** vêm na linha (`USD 978,64 | Cotação USD: R$5,38`).
- **Data sem ano, às vezes do ano anterior**: "28 jan CONTA AZUL Parcela 8/12" e "08 out
  SOMOS BIU Parcela 12/12" numa fatura que fecha em 24/09/26. Regra: dia/mês depois do
  fechamento ⇒ ano anterior.
- **Parcelas**: `Parcela n/N` dá o total da compra e o comprometido futuro ("Saldo
  obrigações futuras").
- **Vários cartões por fatura** (virtual principal + adicionais por portador), cada um com
  subtotal — checagem extra.
- **Descrição ≠ fornecedor**: "FACEBK _WX5UF4JFL4"/"METAPAY_…" ⇒ Meta Ads;
  "ANTHROPIC* CLAUDE TEAM SA" ⇒ Anthropic; "DL*GOOGLE WHATSA" ⇒ WhatsApp Business.

### 7.2 Pipeline

```
upload do PDF no lançamento da fatura  →  Storage `attachments` (já existe)
      ▼
Edge Function card-statement-ingest
  1. dedup: sha256 do arquivo + (empresa, emissor, data de fechamento)
  2. tem texto? sim → parser determinístico do emissor (_shared/cards/c6.ts)
                não → extração por visão (Claude, PDF como documento, JSON com schema estrito)
  3. normaliza: ano, pagamento fora, IOF anexado, parcela, moeda
  4. VALIDA (_shared/cards/validate.ts — a mesma função para os dois caminhos):
       Σ compras = nacionais + internacionais; Σ IOF = IOF do resumo;
       Σ por cartão = subtotal; Σ total = total da fatura = valor do lançamento
  5. fechou → parsed; não fechou → needs_review com a diferença por bloco
      ▼
classificação (§7.3) → revisão → reconciled → entra na camada gerencial
```

- O caminho por visão nunca é confiado sozinho: passa pelo **mesmo validador**. Um número
  lido errado faz a soma não fechar, e a fatura não entra.
- Interface por emissor; C6 primeiro, outros bancos como novos parsers.
- Fixtures: as três faturas (anonimizadas) viram testes Vitest — inclusive o "Pag Fatura
  Boleto" e a parcela do ano anterior.
- Fatura **projetada** (recorrências de R$ 180 mil/50 mil lançadas para out–dez na Jimmy)
  não é detalhada; só a real.

### 7.3 Classificação

1. **Regras determinísticas** (`classification_rules`): padrão sobre a descrição
   normalizada **ou** contraparte ⇒ fornecedor, plano gerencial, área, empresa
   beneficiária. Prioridade explícita; a primeira que casa vence. **As mesmas regras
   servem ao cartão e aos lançamentos** (ex.: contraparte X → área Apoio).
2. **Memória**: confirmar uma linha oferece "criar regra para as próximas". O universo
   de fornecedores é pequeno (as 3 faturas têm ~25).
3. **IA só sugere** para o que nenhuma regra pegou: recebe descrição, valor, moeda,
   empresa e as listas fechadas; devolve sugestão + confiança. Fica `suggested` até
   alguém confirmar.
4. **Fila de revisão** ordenada por valor.

Seed a partir destas faturas: Meta, Anthropic, OpenAI, OpenRouter, AWS, Supabase,
GitHub, Cloudflare, Coolify, Hostinger, Resend, Latitude.sh, Sentry, Convex, Google
Workspace, Google Cloud, WhatsApp, Panda Video, Vindi, Conta Azul, Financial Modeling
Prep. **A identificar com vocês**: 7Club, Somos Biu, SER Acquisition, Morada Mad Comer,
Mentoria Thomaz.

## 8. Central de Gastos — `/gastos`

- **Panorama**: por plano gerencial (nível 1 → 2), variação vs. período anterior e média
  12m; cobertura ("% classificado e confirmado", "R$ em cartão a detalhar").
- **Por área**: custo total de cada time, todas as naturezas.
- **Tecnologia**: assinaturas ativas, em USD, duplicadas entre empresas, novas, que subiram.
- **Fornecedores**: ranking, concentração, em quantas empresas aparece.
- **Pagadora × beneficiária**: matriz de quem paga o quê de quem.
- **Cartões**: por portador, parcelas futuras, exposição USD + IOF.
- **Conferência**: camada gerencial × DRE por empresa/mês — deve dar zero.
- Seletor empresa/consolidado/grupo (`companyIds`; recorte vazio ≠ todas).

MCP: tool `management_breakdown` (somente leitura, ordem fixada em
`registry.test.ts`) — "quanto gastamos com IA no trimestre?" com o mesmo número da tela.

## 9. Modelo de dados

Tudo com RLS no padrão InitPlan, trio `oauth_sem_escrita_*`, auditoria e `updated_at`.
Views com `security_invoker = true`. Módulo `financials`.

```
management_accounts        organization_id, parent_id, code, name, nature (opex|capex|n/a),
                           kind (revenue|tax|expense|financial|distribution|transitory),
                           sort_order, is_active                                   — global
chart_of_accounts_master   + management_account_id (o mapa; copiado para chart_of_accounts)
transactions               + management_account_override_id, + nature_override,
                           + beneficiary_company_id                 (todos nullable)
                           cost_center_id passa a significar área
cost_center_migration_log  transaction_id, old_cost_center_id, new_cost_center_id,
                           nature_override, migrated_at                    — só leitura
payment_cards              company_id, issuer, last4, kind, holder_name,
                           holder_employee_id?, is_active
card_statements            company_id, issuer, closing_date, due_date, total_amount,
                           summary jsonb, transaction_id UNIQUE (fatura), attachment_id,
                           file_sha256 UNIQUE, parser (text|vision), parser_version,
                           status (uploaded|parsed|needs_review|reconciled|failed),
                           validation jsonb
card_statement_lines       statement_id, card_id, purchase_date, description_raw,
                           line_kind (purchase|fee|interest|refund|adjustment),
                           amount numeric(18,2), currency, amount_original, fx_rate,
                           iof_amount, installment_n, installment_total, counterparty_id,
                           management_account_id, nature_override, cost_center_id (área),
                           beneficiary_company_id, classification_status
                           (unclassified|suggested|confirmed), classification_source
                           (rule|ai|human), rule_id, ai_confidence, confirmed_by/at
classification_rules       organization_id, match_on (description|counterparty), pattern,
                           priority, counterparty_id, management_account_id,
                           cost_center_id, beneficiary_company_id, created_from_line_id
```

**Camada gerencial** — `v_management_lines`:

```
  lançamentos (exceto faturas com statement reconciled)    origem = ledger
∪ linhas de faturas reconciled                             origem = card
    competência = a do lançamento-pai (bate com o DRE)
plano gerencial = coalesce(override, mapa da conta)
natureza        = coalesce(override, natureza do plano gerencial)
```

Triggers: `card_statements` só vincula a saída em conta mapeada para "Cartão a
detalhar"; `reconciled` exige Σ linhas = valor do lançamento.

RPCs (`p_company_ids uuid[] default null`, `security invoker`):
`management_monthly_series_multi` (substitui `cost_center_monthly_series_multi` como
fonte do Balanço), `management_breakdown_multi` (Central), `management_reconciliation`
(camada × DRE).

## 10. Invariantes

1. **O contábil não muda.** A fatura continua um lançamento em `6.2.28`; o detalhe vive
   em `card_statement_lines`. DRE, caixa, apuração e conciliação não se movem.
2. **A camada gerencial reclassifica, nunca cria nem some com dinheiro.** Por empresa e
   mês: Σ camada = Σ lançamentos. Teste + aviso na tela.
3. **Fatura detalhada só entra se fechar** (total, resumo e subtotal por cartão). Senão,
   o lançamento inteiro aparece como "Cartão a detalhar". Nunca parcialmente.
4. **Sem dupla contagem**: fatura reconciliada é substituída pelas linhas, nunca somada a
   elas.
5. **Balanço e Central têm uma fonte só** (`v_management_lines`) e uma regra só de
   plano gerencial/natureza (`_shared/`, reexportada pela tela, usada pelo MCP).
6. **Classificação de IA é sugestão** até confirmação humana.
7. **A migração preserva a Geração de caixa ao centavo** e só altera EBITDA/Lucro pelas
   reclassificações aprovadas (§6).

## 11. Fases

| Fase                   | Entrega                                                                                                                                                                                                                   | Mexe em dado existente?   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **0. Plano gerencial** | `management_accounts` + mapa conta→plano no master; relatório das inconsistências do §2.2 com proposta de tratamento; classificação dos 10 colaboradores de Diretoria + TI e das 21 contrapartes de Apoio; lista de áreas | Não — só acrescenta       |
| **1. Migração única**  | Centros → áreas, natureza, Balanço por filtro, log, asserts; matriz antes × depois aprovada                                                                                                                               | **Sim**, uma vez, com log |
| **2. Cartão — texto**  | `payment_cards`, `card_statements`, `card_statement_lines`; parser C6 + validador + fixtures; upload e conferência                                                                                                        | Não                       |
| **3. Classificação**   | `classification_rules` + seed; fila de revisão; sugestão por IA                                                                                                                                                           | Não                       |
| **4. Cartão — visão**  | Caminho por visão para PDF-imagem; outro emissor se houver                                                                                                                                                                | Não                       |
| **5. Central**         | `/gastos` (§8); Balanço ganha linhas Tecnologia/Marketing se vocês quiserem                                                                                                                                               | Não                       |
| **6. MCP + backfill**  | Tool `management_breakdown`; ~24 faturas dos últimos 12 meses                                                                                                                                                             | Não                       |

Cada fase é um PR com migration testada em `db:reset` e `preflight` verde. A Fase 1 é a
única com risco real, e por isso vem logo depois da validação e antes de tudo que
depende dela.

## 11.1 Estado da Fase 0 (2026-10-23)

Feito, na branch `feat/plano-gerencial`:

- Migration `…_plano_gerencial`: `management_accounts` (13 grupos, 57 itens por
  organização), mapa no `chart_of_accounts_master` para as 64 contas analíticas
  conhecidas, item padrão por tipo para conta nova ou desconhecida, exceção por empresa
  em `chart_of_accounts`, e `v_account_management_map` como regra efetiva única. Os
  `assert` da migration conferem o plano completo, toda conta de resultado mapeada e as
  decisões do §12 (`9.03`, `9.04`, `6.2.15`, `7.04`, `6.2.27`, `6.2.28`).
- Tela `/settings/management-plan`: o plano por grupo, com as contas de cada item, e o
  mapa conta a conta, editável por admin/editor.
- **Nada existente muda**: lançamentos, centros de custo, DRE e Balanço ficam iguais.

Pendente para começar a Fase 1:

- **Áreas de Diretoria + TI**, proposta por cargo dos 10 colaboradores: os 6 "Colaborador
  TI – PJ" e o "Gestor TI" → Tecnologia; o "Gestor escritório" → Apoio; os 2 sócios
  "Assessor" → Diretoria. Confirmar.
- Confirmar com a contabilidade o tratamento de `9.03 IRRF sobre bônus` (decisão 1).
- Matriz antes × depois de cada modelo de Balanço, gerada contra o remoto, para
  aprovação (§6, passo 7).

## 11.2 Estado da Fase 1 (2026-10-23)

Feito, na mesma branch, **ainda não aplicado no remoto**:

- Migration `…_areas_e_balanco_gerencial`:
  - `cost_centers` passa a ser **área** (Assessores, Apoio, Diretoria, Tecnologia,
    Marketing, Comercial, Geral). "Área de Apoio" vira "Apoio" e "Diretoria + TI" vira
    "Diretoria", mantendo o id; quem é de TI ou do escritório sai para Tecnologia/Apoio
    pelo cargo do colaborador.
  - Os centros de natureza (OPEX, CAPEX, Impostos, Distribuição, Receitas, Receitas
    Jimmy, Rendimentos, Transferência) são desativados; o lançamento fica sem área, e o
    que era CAPEX ganha `transactions.nature_override = 'capex'`.
  - `cost_center_migration_log` guarda o centro anterior de cada registro tocado.
  - `v_management_lines` (lançamento + item gerencial + natureza + área),
    `management_monthly_series_multi` (série do Balanço) e
    `management_line_transactions` (gaveta de lançamentos por chave).
  - Os 6 modelos de Balanço são reescritos para linhas `filter`; "Diretoria + TI" vira
    Diretoria + Tecnologia, e área com gente no escopo sem linha ganha uma (Apoio na OTM
    Assessoria), entrando nas fórmulas de Lucro e EBITDA.
  - A migration confere: nenhuma linha de centro sobra, nenhum lançamento em centro de
    natureza, nenhum lançamento em duas linhas, nada que era contado fica sem linha.
  - `merge_cost_centers` passa a remapear a área dentro de `clauses[].areaIds`.
- Frontend: o Balanço calcula por cláusula (item × área × natureza) em
  `balance/compute.ts`, com editor de cláusulas; "centro de custo" vira "Área" na
  interface (a importação de CSV mantém o rótulo antigo da coluna).
- Teste de banco `supabase/tests/areas_e_balanco_gerencial.sql`: organização com a
  estrutura de produção, um lançamento por caso decidido, 26 verificações.

### Simulação contra o remoto — 2026 até outubro, competência (R$)

Calculada só com leitura, aplicando as regras desta migration aos lançamentos reais.

| Empresa        | Linha            |     Antes |    Depois | Por quê                                                             |
| -------------- | ---------------- | --------: | --------: | ------------------------------------------------------------------- |
| Jimmy          | Receitas         | 3.150.893 | 3.171.420 | "Receitas Jimmy" (16 mil) e publicidade lançada em Receitas (4 mil) |
| Jimmy          | OPEX             |  −447.175 |  −430.921 | móveis vão para CAPEX, tarifas para Rendimentos, publicidade entra  |
| Jimmy          | CAPEX            |         0 |   −18.264 | móveis                                                              |
| Jimmy          | Impostos         |  −229.367 |  −136.287 | IRRF s/ bônus sai                                                   |
| Jimmy          | Distribuição     |  −894.780 |  −987.860 | IRRF s/ bônus entra                                                 |
| Jimmy          | Não classificado |    16.427 |         0 | "Receitas Jimmy" passa a ter linha                                  |
| OTM Assessoria | Diretoria + TI   |  −487.312 |  −253.022 | vira Diretoria + Tecnologia                                         |
| OTM Assessoria | Área de Apoio    |         — |  −234.289 | gestor de escritório; linha criada                                  |
| OTM Assessoria | CAPEX            |   −27.943 |   −31.561 | móveis                                                              |
| OTM Corretora  | CAPEX            |         0 |    −3.924 | móveis                                                              |
| OTM Corretora  | Distribuição     |  −364.545 |  −361.300 | reembolso de cartão de sócio vai para OPEX                          |
| RCO            | OPEX / Impostos  |           |      ±300 | IPTU e taxas saem de Impostos                                       |

Geração de caixa só muda onde havia "Não classificado" (Jimmy, +16 mil, que antes não
entrava em linha nenhuma).

### Para aplicar no remoto

1. PR revisado e `db:reset` + testes de banco verdes (feito localmente).
2. Conferir a simulação acima com a contabilidade.
3. `bun run db:push` — a migration falha sozinha se alguma conferência não fechar.

## 11.3 Estado da Fase 2 (2026-10-23)

Feito, na mesma branch, **ainda não aplicado no remoto**:

- Leitor da fatura C6 em `supabase/functions/_shared/cards/` (centavos inteiros):
  reconstrução de linhas a partir do pdf.js, parser, validador. Testado com as três
  faturas de set/2026 — a da Jimmy saiu do PDF pelo pdf.js e fechou em todas as
  conferências; as da OTM e da RCO (PDF só imagem) foram transcritas para cobrir cartão
  adicional, "Inclusao de Pagamento", parcela do ano anterior e quatro assinaturas iguais
  no mesmo dia.
- Migration `…_faturas_de_cartao`: `payment_cards`, `card_statements`,
  `card_statement_lines` (RLS da empresa + trio OAuth + auditoria), `save_card_statement`
  (o banco refaz total, subtotal por cartão e lançamento e decide `reconciled` ou
  `needs_review`) e `v_management_lines` trocando a fatura conferida pelas compras.
  Compra sem classificação herda "Fatura de cartão": detalhar não muda total.
- Tela `/faturas`: importar (lançamento + PDF, com senha se houver; a leitura é no
  navegador e o PDF vira anexo do lançamento), conferência, distribuição por grupo e
  classificação manual de cada compra (item gerencial + área).
- Teste de banco `supabase/tests/faturas_de_cartao.sql`: 28 verificações, inclusive que ninguém marca fatura como conferida nem mexe em compra por fora das RPCs, e que editar o lançamento depois devolve a fatura para conferência.

Limites conhecidos desta fase:

- **PDF só imagem não é lido** (OTM e RCO no formato atual). A tela pede o PDF original
  do C6; a leitura por visão é a Fase 4.
- **Classificação é manual.** Regras por fornecedor e sugestão por IA são a Fase 3.

## 11.4 Estado da Fase 3 (2026-10-23)

Feito, na mesma branch, **ainda não aplicado no remoto**:

- Migration `…_regras_de_classificacao`: `classification_rules` (por organização, opcional
  por empresa; "começa com" ou "contém" sobre a descrição normalizada), 22 regras iniciais
  com os fornecedores das faturas de set/2026, aplicação automática ao gravar a fatura e
  RPC para reaplicar. Precedência: regra da empresa → menor prioridade → padrão mais
  longo. Regra vence sugestão da IA; nunca sobrescreve decisão de pessoa.
- **Só classificação confirmada conta** em `v_management_lines`: sugestão da IA fica
  visível na tela mas a compra segue em "Fatura de cartão" até ser aceita.
- Sugestão por IA: `_shared/cards/suggest.ts` (pedido e leitura desconfiada da resposta)
  e Edge Function `card-lines-suggest` (Claude Opus 5.5, esforço baixo, saída em JSON
  com schema, fallback do servidor para recusa), com o JWT de quem pede — sem service
  role. Vai para a API só descrição, valor e moeda da compra, o nome da empresa e o
  plano gerencial.
- Tela da fatura: aplicar regras, sugerir com IA, aceitar (uma ou todas), criar regra a
  partir de uma compra, revisão "a classificar primeiro, por valor". Regras em
  `/settings/classification-rules`.
- Teste de banco `supabase/tests/regras_de_classificacao.sql`: 23 verificações, inclusive que lançador de uma empresa não cria regra que alcance outra.

Para ligar a sugestão por IA no remoto (com o dono do repo):

1. `supabase secrets set ANTHROPIC_API_KEY=...` no projeto.
2. Publicar a função `card-lines-suggest`.

Sem isso a tela funciona; o botão "Sugerir com IA" responde que a IA não está
configurada.

## 12. Decisões (tomadas em 2026-10-23)

Todas seguem a recomendação do plano.

1. **IRRF sobre bônus (9.03) → Distribuição.** Acompanha o bônus pago aos sócios, fica
   abaixo do Lucro. Confirmar com a contabilidade antes da Fase 1.
2. **Reembolso de cartão de sócio (9.04) → despesa operacional** (dentro do EBITDA): é
   gasto da empresa pago no cartão pessoal. O leitor de faturas cobre esse caso numa fase
   futura.
3. **Manutenção e reparos → opex por padrão**, capex por override caso a caso.
4. **Tarifas bancárias → Financeiro**, fora do EBITDA.
5. **Áreas**: Assessores, Apoio, Diretoria, Tecnologia, Marketing, Comercial e Geral. A
   área de cada colaborador de Diretoria + TI é proposta na Fase 0 para confirmação.
6. **Plano gerencial**: o do §3.2.
7. **Empresa beneficiária**: só gerencial. Rateio contábil intercompany fica fora.
8. **IA na leitura de fatura**: liberada (API Anthropic), junto com o teste de baixar os
   PDFs originais do C6 com camada de texto.

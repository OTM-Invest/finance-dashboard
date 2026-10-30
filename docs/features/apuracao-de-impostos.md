# Apuração de impostos — do cálculo do devido ao pagamento

Referência técnica do motor de apuração fiscal: como o imposto devido é calculado,
onde cada regra vive e quais invariantes não podem ser violadas.

## O problema

`/taxes` só sabia **agendar pagamento**. `generate_tax_obligations` criava DAS do
Simples e um PIS/COFINS linear sobre a receita do mês, e o resto do processo vivia em
planilha — uma por empresa, por família de tributo, por mês.

As planilhas fazem **três coisas ao mesmo tempo**, e é essa mistura que impedia
automatizar:

| Camada            | Conteúdo                                               | Onde vive agora                       |
| ----------------- | ------------------------------------------------------ | ------------------------------------- |
| **Parâmetro**     | tributos, alíquota, presunção, vencimento, recebedor   | `tax_rules` + `tax_rule_presumptions` |
| **Demonstrativo** | os documentos que compõem a base, linha por linha      | `tax_assessment_lines`                |
| **Apuração**      | base → presunção → tributo → retenções → saldo devedor | `tax_assessments`                     |

`tax_obligations` continua sendo o que já era de fato — **o pagamento** — e passou a
apontar para a apuração que a originou (`assessment_id`).

## O que faltava

Levantado das quatro planilhas de origem (OTM Assessoria e Jimmy Carvalho):

- apuração **trimestral** (IRPJ/CSLL do presumido) — `reference_period` era só mês;
- **presunção por tipo de receita**: mercadoria 8% IRPJ / 12% CSLL, serviço 32%,
  ganho no exterior 100%;
- **faixa de presunção**: 32% até R$ 1.250.000 no trimestre, 35,2% no excedente;
- **adicional de IRPJ** de 10% acima de R$ 60.000 por trimestre;
- **retenção sofrida na fonte** deduzida do tributo devido;
- **ISS** e **IRRF sobre distribuição de lucros** — nunca eram gerados;
- **vencimento por tributo, em dia útil** — era chumbado no dia 20 para tudo.

## Divisão de responsabilidade

É o ponto que impede a regra de existir duas vezes:

- **SQL = calendário e colheita.** O vencimento depende da tabela de feriados; a base
  depende dos lançamentos sob RLS. Nada disso é aritmética de tributo.
- **TS = aritmética.** `supabase/functions/_shared/tax/apuracao.ts`, pura, testada no
  Vitest contra as quatro planilhas. A tela reexporta de
  `src/features/taxes/apuracao.ts`; as tools de MCP podem importar a mesma função.
- **SQL = persistência com verificação.** `save_tax_assessment` **não** recalcula a
  regra (seria a segunda implementação), mas recusa o que for internamente incoerente
  e recalcula o vencimento por conta própria, ignorando o que o cliente mandou.

Fluxo completo:

```
tax_assessment_inputs(empresa, tributo, data)   -- SQL, security invoker, passa pela RLS
  → computeAssessment(inputs)                   -- TS puro, testado
    → save_tax_assessment(payload)              -- SQL, confere coerência, grava rascunho
      → confirm_tax_assessment(id)              -- congela + cria a obrigação
        → mark_tax_paid(...)                    -- fluxo que já existia: lança no caixa
```

## Banco

| Tabela                  | Papel                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `tax_holidays`          | dias não úteis (nacional / estadual / municipal). Dado de referência, vai em migration |
| `tax_rules`             | parâmetro por (empresa, tributo, vigência)                                             |
| `tax_rule_presumptions` | percentual de presunção por classe, com faixas                                         |
| `tax_assessments`       | a apuração: `draft` → `confirmed`                                                      |
| `tax_assessment_lines`  | o demonstrativo, com `is_manual`                                                       |

`chart_of_accounts.presumption_class` classifica a receita. É lá porque **a base sai
dos lançamentos**, não dos documentos fiscais — decisão do dono do repo. Conta de
receita sem classe cai em `tax_rules.default_presumption_class` **e a apuração avisa**,
para que receita nova não desapareça em silêncio da base.

### `is_manual` é a distinção que importa

Linha **colhida** (`is_manual = false`) vem de um lançamento, é rastreável até a origem
e é **regenerada** a cada recálculo. Linha **manual** (receita fora dos lançamentos,
devolução, retenção sofrida, outras deduções, saldo anterior) **sobrevive**. Sem isso, reapertar "Apurar" apagaria a
retenção digitada e o imposto subiria em silêncio. O check
`tax_assessment_lines_origem_ck` garante que toda linha não manual tenha
`transaction_id`.

### Receita digitada à mão

Há receita que não está nos lançamentos — nota emitida por fora, faturamento que a
contabilidade informou antes de o lançamento existir. Ela entra como linha manual de
`revenue` (ou `revenue_return`, gravada **negativa** como a colhida) e, quando a regra
presume, com a classe de presunção escolhida na tela. O demonstrativo marca a linha
como "digitado à mão".

⚠️ Ela **não entra** na comparação com a outra data-base: `gross_revenue_alt_basis` é
calculado só sobre lançamentos, e somar a receita digitada de um lado só acusaria
divergência que não existe. Se a receita digitada **duplica** um lançamento, nada
avisa — confira contra as linhas colhidas, que ficam na mesma seção.

### Estado dos lançamentos na base

`pending`, `settled` e `reconciled` — exatamente o mesmo conjunto da coluna de
**competência** da DRE (`…_dre_competencia_inclui_pendente`). `scheduled` fica fora: é
previsão de recorrência, não fato ocorrido.

### ⚠️ A data que delimita o período é PARÂMETRO, não constante

`tax_rules.base_date_basis` escolhe entre `accrual` (`accrual_date`) e `cash`
(`cash_date`, caindo para a competência quando ainda não há). Não existe resposta
universal — depende do tributo e de como a empresa registra receita.

Medido na produção, na OTM Assessoria:

|              | por `accrual_date` | por `cash_date`     | planilha do contador |
| ------------ | ------------------ | ------------------- | -------------------- |
| IRPJ 3t2026  | R$ 681.872,60      | **R$ 1.543.003,86** | **R$ 1.543.003,86**  |
| ISS ago/2026 | R$ 0,00            | **R$ 681.872,60**   | **R$ 681.872,60**    |

O lançamento de comissão tem `accrual_date` no mês a que a comissão **se refere**
("comissão ref julho 2026", accrual 10/07, caixa 07/08), enquanto a competência fiscal
é a da **nota** — que nesses dados cai no `cash_date`. A primeira versão colhia sempre
por `accrual_date`, justificada por consistência com a DRE, e dava a base errada.

Por isso `tax_assessment_inputs` devolve também `gross_revenue_alt_basis` — o total do
mesmo período pela outra data — e o motor **avisa quando as duas divergem mais de 1%**.
Errar a data-base não parece defeito: o número sai bonito, só do mês trocado.

### RLS

Padrão do projeto: leitura com módulo `taxes` + empresa acessível na forma InitPlan +
semi-join; escrita com `has_company_write_access` direto (incide sobre a linha
escrita). Tabela filha faz escopo pela pai (`rule_id in (subquery)`), nunca chamada de
função por linha. As cinco tabelas novas têm o trio restritivo
`oauth_sem_escrita_ins|upd|del`.

## Calendário

`tax_due_date(fim_do_período, dia, offset_de_meses, ajuste, uf, municipio)`.

- `due_day = 31` significa **último dia do mês** (é truncado pelo tamanho do mês), que
  é como se expressa "último dia útil do mês subsequente" do IRPJ/CSLL trimestral.
- DARF, ISS, FGTS e GPS **antecipam**; DAS do Simples **posterga**.
- A UF sai do código IBGE do município (`tax_uf_from_ibge`) — os dois primeiros dígitos
  do código de 7 dígitos são o código da UF. Derivar evita uma coluna que poderia
  divergir do município do ISS.

Cinco vencimentos são conferidos por `assert` **dentro da migration**, então
`bun run db:reset` falha se alguém mexer na tabela de feriados ou na aritmética da
data. Três deles são datas que as planilhas registram em dia não útil.

## Divergências em relação às planilhas

Cada uma tem teste dedicado em `apuracao.test.ts` que fixa o número correto e explica
o motivo — é o que impede alguém "consertar" o motor de volta para o erro.

1. **Presunção base sobre valor fixo.** `calculo IRPJ-CSLL Otm assessor.xlsx` calcula
   `B13 = B9*32%` (32% de R$ 1.250.000 **fixos**) em vez de
   `min(receita; 1.250.000) × 32%`, e multiplica um excedente **negativo** quando a
   receita fica abaixo do limite. Com receita zero produz IRPJ de −R$ 16.000 e CSLL de
   −R$ 3.600. No meio do trimestre, com só um mês lançado (R$ 500 mil), **subestima em
   R$ 8.160**.
2. **Adicional sem piso.** `B18 = B15-60000` sem `max(0; …)`.
3. **Ordem das deduções no PIS/COFINS.** `I51 = I49-I50` faz "contribuição a recolher"
   sair de `retenção − outras deduções` em vez de `devido − retenção − deduções`. O
   saldo final acerta **por acidente**, porque "outras deduções" está zero; com R$ 500
   o PIS sairia R$ 1.851,54 em vez de R$ 851,54. A COFINS tem o mesmo defeito
   (`I76 = I74`) e ainda é inconsistente com a aba do PIS quanto às linhas 52/53/72/99.
4. **Vencimento em dia não útil.** ISS de 10/10/2026 num sábado; IRPJ de 31/10/2026
   num sábado; IRPJ de 31/01/2027 num domingo.
5. **Crédito desaparecendo.** Quando as deduções passam do devido, o saldo é zero e o
   excedente vira `credit_carryforward`, com aviso — não some.

### Em aberto para a contabilidade

- **Modo da franquia do IRRF de dividendos.** A planilha aplica 10% sobre
  R$ 442.580 **inteiros**, com a observação "sócios acima de R$ 49.999,99". Isso admite
  duas leituras e a diferença é de ~R$ 10 mil no mês, então virou configuração
  (`tax_allowance_mode`): `full_when_exceeded` reproduz a planilha (é o seed),
  `excess` tributa só o excedente.
- **Adicional de IRPJ ausente na JCE.** No 2t2026 a base foi R$ 14.385, abaixo dos
  R$ 60.000, então não era devido — mas a planilha não tem a linha, e passaria batido
  quando ultrapassar. A regra do seed já tem o adicional configurado.
- **ISS da JCE só sobre a NFS-e.** Hotmart (R$ 6.000) e "plataforma Finance Dash"
  (R$ 201.928,80) entram em PIS/COFINS e não em ISS. Pode estar certo (NF-e de
  produto), mas se alguma dessas for serviço são ~R$ 4.038 de ISS.
- **CBS/IBS de 2026** não aparece em nenhuma aba.

## Arredondamento

Dinheiro em **centavos** e alíquota em **micro** (1e-6), como inteiros, para que
`base = valor × alíquota` seja exato.

Arredondar cada linha e somar dá resultado diferente de arredondar a soma — com as 100
notas da JCE a diferença chega a meio real. **O total manda**, e a sobra de centavos é
distribuída pelo **método do resto maior**, que espalha em vez de concentrar o desvio
numa linha. É o que faz a invariante do banco (`Σ linhas = base`) fechar.

## Invariantes

- **A aritmética tem uma implementação só.** `_shared/tax/apuracao.ts`. A tela
  reexporta; não se duplica a regra.
- **O vencimento é autoridade do banco.** `save_tax_assessment` recalcula e ignora o
  que o cliente mandou.
- **Apuração confirmada é imutável.** Reabrir é explícito, auditado, e é recusado se a
  obrigação já foi paga — nesse ponto a correção é retificação, não recálculo.
- **Obrigação paga não é sobrescrita.** `confirm_tax_assessment` preserva o valor no
  caixa e avisa.
- **Não existe apuração consolidada.** A regra é da empresa; somar o IRPJ de quatro
  empresas sob um rótulo só seria o pior defeito possível num sistema contábil.
- **Base nunca passa da soma das linhas.** Um demonstrativo que não fecha com o próprio
  total é recusado.
- **Retenção só entra quando a regra permite.** No IRRF de dividendos a empresa é a
  fonte pagadora, não a retida.
- **A data-base é conferida contra a alternativa.** Toda apuração compara o total pela
  outra data e avisa se divergir — é o que impede a base sair deslocada em um mês em
  silêncio.
- **DAS do Simples não é apurável aqui.** A alíquota efetiva é progressiva sobre o
  RBT12; o motor faz alíquota fixa. Fica fora de `APURAVEIS`, com aviso no motor para o
  caso de uma regra ser inserida por SQL.

## Verificação feita

- 24 testes de regressão em `apuracao.test.ts` reproduzindo os números das quatro
  planilhas **no centavo**, mais os casos de divergência e os guardas do motor.
- `bun run db:reset` do zero, com as asserções de calendário dentro da migration.
- Round-trip no banco local: `save` coerente → recusa de saldo incoerente → recusa de
  base que não fecha → `confirm` gerando a obrigação ligada → recusa de recálculo de
  apuração confirmada → `reopen` voltando a rascunho.
- `bun run preflight` verde (typecheck, lint, format, 1084 testes).

## Como continuar

- **Exportar o demonstrativo** em Excel no formato que a contabilidade já lê.
- **Tool de MCP** para apuração — o catálogo é fixado por teste em `registry.test.ts`,
  então tool nova é decisão revisada, não import solto.
- **INSS patronal e FGTS** a partir da folha (`base_source = 'payroll'` já existe no
  enum, sem colheita implementada).
- **Feriados de 2028 em diante** — os móveis são linha explícita por ano; não há
  cálculo de data de Páscoa no banco.

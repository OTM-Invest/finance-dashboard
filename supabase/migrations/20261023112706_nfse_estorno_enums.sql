-- Guardrail de estorno na esteira de NFS-e (1/2): tipos.
--
-- Migration separada de propósito: `alter type ... add value` adiciona o rótulo mas o
-- Postgres não permite USÁ-LO na mesma transação em que foi criado ("unsafe use of new
-- value of enum type"). Como cada arquivo de migration roda numa transação, `voided` só
-- pode aparecer em default, check, update ou policy a partir da migration seguinte.

-- ---------------------------------------------------------------------------
-- 1) Estado terminal da nota que NÃO vai ser emitida.
--
-- `cancelled` já existe e significa outra coisa: nota autorizada e depois cancelada na
-- prefeitura — ato definitivo, que sai do sistema e exige justificativa de 15 a 255
-- caracteres. `voided` é o oposto: a nota NUNCA chegou ao Focus, porque a venda foi
-- estornada enquanto o job ainda estava na fila. Confundir os dois faria o relatório
-- contábil tratar "descartada antes de existir" como "cancelada na prefeitura", que é
-- obrigação acessória e aparece na apuração do ISS.
-- ---------------------------------------------------------------------------
alter type public.invoice_job_status add value if not exists 'voided';

-- ---------------------------------------------------------------------------
-- 2) O que aconteceu com o dinheiro da venda que originou a nota.
--
-- Três naturezas distintas, e tratá-las como uma só é o defeito que esta feature
-- existe para evitar:
--
--   `full`       — `charge.refunded`: a cobrança vai a `canceled` e o dinheiro voltou
--                  inteiro. Não há serviço a documentar: a nota é descartada.
--   `partial`    — `charge.partial_canceled`: a cobrança SEGUE `paid` e parte voltou.
--                  A nota é devida, mas por valor menor que o do job — emitir o valor
--                  cheio documenta serviço que não houve, e descartar apaga o que
--                  houve. Fica retida para decisão humana.
--   `chargeback` — `charge.chargedback`: o cliente contestou e o serviço FOI prestado.
--                  Contabilmente é perda (inadimplência), não desfazimento da venda, e
--                  a nota continua devida. Também retida — a decisão é da contabilidade,
--                  não do sistema.
--
-- A ordem dos rótulos é a de severidade usada em `nfse_escalate_refund_state`.
-- ---------------------------------------------------------------------------
create type public.invoice_refund_state as enum ('none', 'partial', 'full', 'chargeback');

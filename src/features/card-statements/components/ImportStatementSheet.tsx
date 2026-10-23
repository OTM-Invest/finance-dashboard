/**
 * Importar uma fatura: escolher o lançamento, ler o PDF, conferir, gravar.
 *
 * A leitura é toda no navegador — o PDF só sobe para o Storage como anexo do lançamento
 * depois que a pessoa confirma. A conferência mostrada aqui é prévia; o banco refaz a
 * conta ao gravar e é ele quem decide se a fatura abre o lançamento na visão gerencial.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deleteAttachment, uploadAttachment, type Attachment } from "@/features/attachments/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCompanyScope } from "@/features/companies/CompanyContext";
import { formatDate } from "@/lib/dates";
import { formatBRL } from "@/lib/format";

import { usePendingInvoiceTransactions, useSaveCardStatement } from "../hooks";
import {
  PdfPasswordError,
  readStatementFile,
  validateStatement,
  type ReadStatementResult,
} from "../reader";
import { ValidationChecks } from "./ValidationChecks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportStatementSheet({ open, onOpenChange }: Props) {
  const { companyIds, companies } = useCompanyScope();
  const { user } = useAuth();
  const navigate = useNavigate();
  const pending = usePendingInvoiceTransactions(companyIds, open);
  const save = useSaveCardStatement();

  const [transactionId, setTransactionId] = React.useState<string>("");
  const [file, setFile] = React.useState<File | null>(null);
  const [password, setPassword] = React.useState("");
  const [needsPassword, setNeedsPassword] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReadStatementResult | null>(null);
  const [saving, setSaving] = React.useState(false);
  // Leitura mais recente: trocar de arquivo no meio da leitura não deixa a anterior
  // sobrescrever o resultado com a fatura do arquivo errado.
  const readToken = React.useRef(0);

  React.useEffect(() => {
    if (!open) {
      setTransactionId("");
      setFile(null);
      setPassword("");
      setNeedsPassword(false);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const transactions = pending.data ?? [];
  const selectedTx = transactions.find((t) => t.id === transactionId) ?? null;
  const companyName = (id: string) => companies.find((c) => c.id === id)?.trade_name ?? "";

  const validation = React.useMemo(
    () =>
      result
        ? validateStatement(
            result.statement,
            selectedTx ? Math.round(selectedTx.amount * 100) : null,
          )
        : null,
    [result, selectedTx],
  );

  async function read(nextFile: File, pdfPassword?: string) {
    const token = ++readToken.current;
    setReading(true);
    setError(null);
    setResult(null);
    try {
      const next = await readStatementFile(nextFile, pdfPassword === "" ? undefined : pdfPassword);
      if (token !== readToken.current) return;
      setResult(next);
      setNeedsPassword(false);
    } catch (err) {
      if (token !== readToken.current) return;
      if (err instanceof PdfPasswordError) {
        setNeedsPassword(true);
        setError(err.incorrect ? err.message : null);
      } else {
        setNeedsPassword(false);
        setError(err instanceof Error ? err.message : "Não foi possível ler o PDF.");
      }
    } finally {
      if (token === readToken.current) setReading(false);
    }
  }

  async function submit() {
    if (!result || !selectedTx || !file || !user) return;
    setSaving(true);
    let attachment: Attachment | null = null;
    try {
      attachment = await uploadAttachment({
        companyId: selectedTx.company_id,
        entityType: "transaction",
        entityId: selectedTx.id,
        file,
        userId: user.id,
      });
      const saved = await save.mutateAsync({
        transactionId: selectedTx.id,
        statement: result.statement,
        sha256: result.sha256,
        attachmentId: attachment.id,
      });
      toast.success(
        saved.status === "reconciled"
          ? "Fatura conferida e detalhada"
          : "Fatura gravada para conferência — a soma não fechou",
      );
      onOpenChange(false);
      void navigate(`/faturas/${saved.id}`);
    } catch (err) {
      // Sem fatura gravada, o PDF anexado ficaria solto no lançamento.
      if (attachment) await deleteAttachment(attachment).catch(() => undefined);
      toast.error("Não foi possível gravar a fatura", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const statement = result?.statement;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>Importar fatura de cartão</SheetTitle>
          <SheetDescription>
            O lançamento da fatura continua como está; as compras ficam penduradas nele e só entram
            na visão gerencial se a soma fechar com a fatura e com o lançamento.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-tx">Lançamento da fatura</Label>
            <Select value={transactionId} onValueChange={setTransactionId}>
              <SelectTrigger id="invoice-tx" disabled={pending.isLoading}>
                <SelectValue
                  placeholder={pending.isLoading ? "Carregando…" : "Escolha o lançamento"}
                />
              </SelectTrigger>
              <SelectContent>
                {transactions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {companyName(t.company_id)} · {formatDate(t.accrual_date, "MM/yyyy")} ·{" "}
                    {formatBRL(t.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!pending.isLoading && transactions.length === 0 && (
              <p className="text-2xs text-text-muted">
                Nenhum lançamento de fatura de cartão sem detalhamento no escopo.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-file">PDF da fatura</Label>
            <Input
              id="invoice-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                setPassword("");
                if (next) void read(next);
              }}
            />
            <p className="text-2xs text-text-muted">
              Por enquanto, C6 Business com texto selecionável (o PDF baixado do app ou do internet
              banking). PDF salvo como imagem ainda não é lido.
            </p>
          </div>

          {needsPassword && file && (
            <div className="space-y-1.5">
              <Label htmlFor="invoice-password" className="flex items-center gap-1.5">
                <Lock className="size-3.5" /> Senha do PDF
              </Label>
              <div className="flex gap-2">
                <Input
                  id="invoice-password"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!password || reading}
                  onClick={() => void read(file, password)}
                >
                  Abrir
                </Button>
              </div>
              <p className="text-2xs text-text-muted">
                A senha só abre o arquivo aqui no navegador; não é enviada nem gravada.
              </p>
            </div>
          )}

          {reading && (
            <p className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="size-4 animate-spin" /> Lendo a fatura…
            </p>
          )}
          {error && (
            <p className="rounded-[var(--radius-md)] border border-expense/40 bg-expense/5 p-3 text-sm text-expense">
              {error}
            </p>
          )}

          {statement && validation && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Fact label="Fechamento" value={formatDate(statement.closingDate)} />
                <Fact label="Vencimento" value={formatDate(statement.dueDate)} />
                <Fact label="Total" value={formatBRL(statement.totalCents / 100)} />
                <Fact label="Compras" value={String(statement.lines.length)} />
              </div>
              <p className="text-2xs text-text-muted">
                {statement.cards.map((c) => `Final ${c.last4} · ${c.holderName}`).join("  —  ")}
                {statement.payments.length > 0 &&
                  `. Pagamento da fatura anterior ignorado (${formatBRL(
                    statement.payments.reduce((s, p) => s + p.amountCents, 0) / 100,
                  )}).`}
              </p>
              {!selectedTx && (
                <p className="text-2xs text-warning">
                  Escolha o lançamento para conferir a fatura contra ele.
                </p>
              )}
              <ValidationChecks checks={validation.checks} />
              {!validation.ok && (
                <p className="text-2xs text-text-muted">
                  Dá para gravar mesmo assim: a fatura fica para conferência e o lançamento continua
                  inteiro na visão gerencial até a soma fechar.
                </p>
              )}
              {statement.warnings.length > 0 && (
                <ul className="text-2xs list-disc space-y-0.5 pl-4 text-warning">
                  {statement.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={!statement || !selectedTx || saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Gravar fatura
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2/40 px-3 py-2">
      <div className="text-2xs tracking-wide text-text-subtle uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

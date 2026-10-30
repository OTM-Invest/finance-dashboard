import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

import { VOID_MOTIVO_MIN } from "../constants";
import { useVoidInvoiceJobs } from "../hooks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onDone: () => void;
}

/**
 * Descarte manual de uma ou mais notas, com motivo obrigatório.
 *
 * Descartar é dizer "esta nota não deve existir" — o motivo fica no metadata de
 * cada job, com autor e horário, porque a pergunta do contador vem meses depois.
 * Nota que já saiu para o Focus não é descartada (o banco pula e devolve a
 * contagem): ou existe na prefeitura e se cancela lá, ou o reconcile vai dizer.
 */
export function VoidJobsDialog({ open, onOpenChange, ids, onDone }: Props) {
  const voidJobs = useVoidInvoiceJobs();
  const [motivo, setMotivo] = React.useState("");

  React.useEffect(() => {
    if (!open) setMotivo("");
  }, [open]);

  const motivoOk = motivo.trim().length >= VOID_MOTIVO_MIN;
  const plural = ids.length > 1;

  function confirmar() {
    if (!motivoOk || ids.length === 0) return;
    voidJobs.mutate(
      { ids, motivo: motivo.trim() },
      {
        onSuccess: ({ voided, skipped }) => {
          toast.success(`${voided} nota(s) descartada(s).`);
          if (skipped > 0) {
            toast.warning(
              `${skipped} nota(s) não puderam ser descartadas: já saíram para a prefeitura ou mudaram de estado.`,
            );
          }
          onOpenChange(false);
          onDone();
        },
        onError: (err) => toast.error("Não foi possível descartar", { description: err.message }),
      },
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !voidJobs.isPending && onOpenChange(o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-expense-soft text-expense">
              <Ban className="size-4" />
            </div>
            <div className="flex-1 space-y-1.5">
              <DialogPrimitive.Title className="font-display text-base font-semibold">
                {plural ? `Descartar ${ids.length} notas` : "Descartar nota"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-text-muted">
                {plural ? "As notas saem" : "A nota sai"} da fila e não{" "}
                {plural ? "serão emitidas" : "será emitida"}. Não é cancelamento na prefeitura —
                nada foi emitido ainda.
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Textarea
              rows={3}
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                plural
                  ? "Por que estas notas não devem existir?"
                  : "Por que esta nota não deve existir?"
              }
            />
            <p className="text-2xs text-text-subtle">
              mínimo {VOID_MOTIVO_MIN} caracteres — fica no histórico de cada nota
            </p>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={voidJobs.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              disabled={!motivoOk || voidJobs.isPending}
              className="bg-expense text-white hover:bg-expense/90 focus-visible:ring-expense"
            >
              {voidJobs.isPending && <Loader2 className="size-4 animate-spin" />}
              Confirmar descarte
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

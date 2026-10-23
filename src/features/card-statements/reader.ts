/**
 * Leitura da fatura no navegador: PDF → trechos de texto → fatura → conferência.
 *
 * O leitor e o validador vivem em `supabase/functions/_shared/cards/` — o mesmo código
 * vai servir à leitura por imagem no servidor (Fase 4). Importe daqui no app; não
 * duplique a regra. O banco refaz a conferência ao gravar (`save_card_statement`): o que
 * se mostra aqui é prévia, o veredito é dele.
 */
import {
  parseC6Statement,
  StatementParseError,
} from "../../../supabase/functions/_shared/cards/c6.ts";
import {
  buildTextLines,
  hasTextLayer,
  type PositionedText,
} from "../../../supabase/functions/_shared/cards/text-lines.ts";
import type {
  ParsedStatement,
  StatementLine,
  StatementValidation,
} from "../../../supabase/functions/_shared/cards/types.ts";
import {
  lineTotalCents,
  validateStatement,
} from "../../../supabase/functions/_shared/cards/validate.ts";

export { lineTotalCents, StatementParseError, validateStatement };
export type { ParsedStatement, StatementLine, StatementValidation };

export const PARSER_VERSION = "c6-text-1";

/** O PDF do banco costuma vir com senha (no C6, parte do CNPJ). */
export class PdfPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? "Senha do PDF incorreta." : "Este PDF tem senha.");
  }
}

/** PDF "impresso" como imagem: não há o que ler sem visão (Fase 4). */
export class PdfWithoutTextError extends Error {
  constructor() {
    super(
      "Este PDF não tem texto selecionável — parece ter sido salvo como imagem. Baixe a fatura direto do app ou do internet banking do C6 e tente de novo.",
    );
  }
}

async function readPdfTextItems(file: File, password?: string): Promise<PositionedText[]> {
  // pdf.js é pesado (o worker passa de 1 MB): só carrega quando alguém importa uma fatura.
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, password });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    if (err instanceof Error && err.name === "PasswordException") {
      throw new PdfPasswordError(Boolean(password));
    }
    throw err;
  }

  const items: PositionedText[] = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const [, , , , x, y] = item.transform as number[];
      items.push({ page, x, y, str: item.str });
    }
  }
  await task.destroy();
  return items;
}

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ReadStatementResult {
  statement: ParsedStatement;
  sha256: string;
}

/** Lê e interpreta o PDF. Lança erro com mensagem pronta para a tela. */
export async function readStatementFile(
  file: File,
  password?: string,
): Promise<ReadStatementResult> {
  const items = await readPdfTextItems(file, password);
  if (!hasTextLayer(items)) throw new PdfWithoutTextError();
  const statement = parseC6Statement(buildTextLines(items));
  return { statement, sha256: await sha256Hex(file) };
}

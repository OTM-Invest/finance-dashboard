/**
 * Quem é o assessor do relatório no cadastro de colaboradores — SUGESTÃO pelo nome.
 *
 * A ligação de verdade é o código (`employees.btg_advisor_code`), porque os nomes
 * divergem entre CRM e financeiro: "Marcio Roberto San Juam" × "Marcio San Juan",
 * "Kaio Vinicius Candido A|lves" × "Kaio Vinicius…", "Humberto Ataliao Prado" ×
 * "Humberto Atalião Vilas Boas Correa Do Prado". Por isso o nome só PROPÕE: a tela mostra
 * a sugestão e uma pessoa confirma gravando o código.
 *
 * Regra: primeiro nome igual (sem acento, sem símbolo) e ao menos mais um sobrenome em
 * comum, tolerando uma letra trocada em palavra de 4+ letras ("Juan"/"Juam"). Empate no
 * melhor placar não sugere ninguém.
 */

export interface AdvisorCandidate {
  id: string;
  fullName: string;
}

const PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !PARTICLES.has(t));
}

/** Distância de edição ≤ 1 (troca, inserção ou remoção de uma letra). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && withinOneEdit(a, b);
}

/** Quantos sobrenomes em comum, ou 0 se o primeiro nome não bate. */
export function nameScore(advisorName: string, employeeName: string): number {
  const a = nameTokens(advisorName);
  const b = nameTokens(employeeName);
  if (a.length === 0 || b.length === 0 || !sameToken(a[0], b[0])) return 0;
  const rest = b.slice(1);
  let common = 0;
  for (const token of a.slice(1)) {
    const idx = rest.findIndex((r) => sameToken(token, r));
    if (idx >= 0) {
      common += 1;
      rest.splice(idx, 1);
    }
  }
  return common;
}

export function suggestEmployee(
  advisorName: string | null,
  employees: readonly AdvisorCandidate[],
): AdvisorCandidate | null {
  if (!advisorName) return null;
  let best: AdvisorCandidate | null = null;
  let bestScore = 0;
  let tie = false;
  for (const e of employees) {
    const score = nameScore(advisorName, e.fullName);
    if (score > bestScore) {
      best = e;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return bestScore >= 1 && !tie ? best : null;
}

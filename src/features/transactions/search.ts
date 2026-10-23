/**
 * Busca livre dos lançamentos: descrição **e** fornecedor.
 *
 * O fornecedor mora em `counterparties`, tabela separada — e o PostgREST não
 * expressa "descrição casa OU nome do fornecedor casa" num filtro só, porque um
 * `or` que atravessa tabela embutida exige `!inner`, que por sua vez descarta
 * todo lançamento SEM fornecedor. Seria o pior resultado possível: buscar
 * "internet" deixaria de achar o lançamento chamado "internet" só porque ele não
 * tem fornecedor preenchido.
 *
 * Então a busca é em dois passos: primeiro os ids dos fornecedores cujo nome
 * casa, depois um `or` entre colunas da PRÓPRIA tabela de lançamentos
 * (`description` e `counterparty_id`). Caro? São 149 contrapartes na
 * organização inteira — a consulta é um índice e um `in` curto.
 *
 * Puro e sem React/Supabase: a montagem do filtro é testável direto.
 */

/** Abaixo disso a busca não filtra nada — evita varrer a tabela a cada tecla. */
export const SEARCH_MIN_LENGTH = 2;

/**
 * Teto de fornecedores casados por termo. Acima disso o termo é genérico demais
 * para ser recorte útil, e a URL do PostgREST tem limite de tamanho. O valor é
 * folgado contra as 149 contrapartes existentes; `searchHitCap` avisa quando
 * encosta, para o dia em que a base crescer.
 */
export const COUNTERPARTY_MATCH_CAP = 300;

/**
 * Normaliza o termo: tira o que quebra a sintaxe do `or` do PostgREST
 * (vírgula, parênteses, ponto, aspas) e os curingas, que deixariam o usuário
 * montar um padrão sem querer. Devolve null quando não sobra termo utilizável.
 */
export function normalizeSearchTerm(term: string | null | undefined): string | null {
  const cleaned = (term ?? "")
    .replace(/[,()."'\\*%]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned.length >= SEARCH_MIN_LENGTH ? cleaned : null;
}

/**
 * Monta o filtro `or` do PostgREST. Sem fornecedor casado, continua sendo só a
 * descrição — nunca devolve filtro vazio, que traria a tabela inteira.
 */
export function transactionSearchOr(term: string, counterpartyIds: readonly string[]): string {
  const parts = [`description.ilike.%${term}%`];
  if (counterpartyIds.length > 0) {
    parts.push(`counterparty_id.in.(${counterpartyIds.join(",")})`);
  }
  return parts.join(",");
}

/** O teto foi atingido? Sinaliza resultado possivelmente incompleto. */
export function searchHitCap(counterpartyIds: readonly string[]): boolean {
  return counterpartyIds.length >= COUNTERPARTY_MATCH_CAP;
}

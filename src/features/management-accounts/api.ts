import { supabase, type Tables } from "@/lib/supabase";

import type { MasterAccountRow } from "./tree";

export type ManagementAccount = Tables["management_accounts"]["Row"];
export type ManagementAccountInsert = Tables["management_accounts"]["Insert"];
export type ManagementAccountUpdate = Tables["management_accounts"]["Update"];

/**
 * O plano gerencial inteiro — grupos e itens, ativos e inativos. É da ORGANIZAÇÃO, como a
 * central de custos: o mesmo "Tecnologia" vale para todas as empresas.
 */
export async function fetchManagementAccounts(): Promise<ManagementAccount[]> {
  const { data, error } = await supabase
    .from("management_accounts")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Contas analíticas do plano mestre com o item gerencial de cada uma. É o mestre — e não a
 * conta de cada empresa — porque o mapa vale para as quatro empresas de uma vez; exceção de
 * uma empresa só é caso raro e não é editada por aqui.
 */
export async function fetchMasterAccountMapping(): Promise<MasterAccountRow[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts_master")
    .select("id, code, name, sort_order, management_account_id")
    .eq("is_summary", false)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Troca o item gerencial de uma conta do mestre. O banco recusa grupo e item de outra organização. */
export async function updateMasterAccountMapping(input: {
  masterAccountId: string;
  managementAccountId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("chart_of_accounts_master")
    .update({ management_account_id: input.managementAccountId })
    .eq("id", input.masterAccountId);
  if (error) throw error;
}

export async function createManagementAccount(
  payload: ManagementAccountInsert,
): Promise<ManagementAccount> {
  const { data, error } = await supabase
    .from("management_accounts")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateManagementAccount(
  id: string,
  payload: ManagementAccountUpdate,
): Promise<ManagementAccount> {
  const { data, error } = await supabase
    .from("management_accounts")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

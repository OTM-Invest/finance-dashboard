import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createManagementAccount,
  fetchManagementAccounts,
  fetchMasterAccountMapping,
  updateManagementAccount,
  updateMasterAccountMapping,
  type ManagementAccountInsert,
  type ManagementAccountUpdate,
} from "./api";

export const managementAccountKeys = {
  all: ["management-accounts"] as const,
  mapping: ["management-accounts", "mapping"] as const,
};

/** O plano gerencial inteiro — global, sem empresa. */
export function useManagementAccounts() {
  return useQuery({
    queryKey: managementAccountKeys.all,
    queryFn: fetchManagementAccounts,
  });
}

/** Contas analíticas do plano mestre e o item gerencial de cada uma. */
export function useMasterAccountMapping() {
  return useQuery({
    queryKey: managementAccountKeys.mapping,
    queryFn: fetchMasterAccountMapping,
  });
}

function invalidateManagement(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: managementAccountKeys.all });
}

export function useCreateManagementAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ManagementAccountInsert) => createManagementAccount(payload),
    onSuccess: () => invalidateManagement(qc),
  });
}

export function useUpdateManagementAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ManagementAccountUpdate }) =>
      updateManagementAccount(id, payload),
    onSuccess: () => invalidateManagement(qc),
  });
}

export function useUpdateMasterAccountMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMasterAccountMapping,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: managementAccountKeys.mapping });
    },
  });
}

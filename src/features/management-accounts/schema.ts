import { z } from "zod";

import { EXPENSE_NATURES } from "./tree";

/**
 * Item do plano gerencial. O grupo e o tipo não são editáveis aqui: o tipo vem do grupo
 * (o banco recusa divergência), e trocar o grupo de um item já mapeado mudaria em silêncio
 * a linha do Balanço onde as contas dele somam.
 */
export const managementItemFormSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(80),
  description: z.string().max(2000).nullable(),
  nature: z.enum(EXPENSE_NATURES).nullable(),
  isActive: z.boolean(),
});

export type ManagementItemFormValues = z.infer<typeof managementItemFormSchema>;

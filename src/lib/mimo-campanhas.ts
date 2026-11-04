import { z } from "zod";

const dia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Informe uma data válida.",
  );
export const campanhaMimoSchema = z
  .object({
    id: z.string().uuid().optional(),
    versao: z.number().int().positive().optional(),
    nome: z.string().trim().min(3, "Informe o nome da campanha.").max(200),
    inicio: dia,
    fim: dia,
    produtos: z.string().trim().max(10000),
    condicoes: z.string().trim().max(10000),
    status: z.enum(["rascunho", "publicada", "arquivada"]),
  })
  .refine((v) => v.fim >= v.inicio, {
    path: ["fim"],
    message: "O término deve ser igual ou posterior ao início.",
  })
  .refine((v) => v.status !== "publicada" || (!!v.produtos && !!v.condicoes), {
    path: ["condicoes"],
    message: "Para publicar, informe produtos, preços e condições.",
  })
  .refine((v) => !v.id || !!v.versao, {
    path: ["versao"],
    message: "Reabra a campanha antes de editar.",
  });
export type CampanhaMimoInput = z.infer<typeof campanhaMimoSchema>;
export type CampanhaMimo = Omit<CampanhaMimoInput, "id" | "versao"> & {
  id: string;
  versao: number;
  updated_at: string;
};
export const podeGerenciarCampanhas = (papel: string) =>
  ["administrador", "gestor", "marketing"].includes(papel);
export function situacaoCampanha(c: Pick<CampanhaMimo, "status" | "inicio" | "fim">, hoje: string) {
  if (c.status === "rascunho") return "Rascunho";
  if (c.status === "arquivada") return "Arquivada";
  if (hoje < c.inicio) return "Programada";
  return hoje > c.fim ? "Encerrada" : "Em vigor";
}

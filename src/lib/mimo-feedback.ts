import { z } from "zod";

export const CHAVE_FEEDBACKS_MIMO = ["mimo-feedbacks"] as const;
export const FEEDBACK_TITULO_MAX = 100;
export const FEEDBACK_MENSAGEM_MAX = 2000;

export const estadosFeedbackMimo = ["recebido", "em_analise", "concluido", "arquivado"] as const;
const estadoSchema = z.enum(estadosFeedbackMimo);
export type EstadoFeedbackMimo = z.infer<typeof estadoSchema>;

export const rotuloFeedbackMimo: Record<EstadoFeedbackMimo, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export const cursorFeedbackMimoSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
}).strict();
export type CursorFeedbackMimo = z.infer<typeof cursorFeedbackMimoSchema>;

export const novoFeedbackMimoSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().trim().min(1).max(FEEDBACK_TITULO_MAX),
  mensagem: z.string().trim().min(1).max(FEEDBACK_MENSAGEM_MAX),
}).strict();

export const alterarFeedbackMimoSchema = z.object({
  id: z.string().uuid(),
  estado: estadoSchema,
  versao: z.number().int().positive(),
}).strict();

export const lerEstadoFeedbackMimo = (estado: string) => estadoSchema.parse(estado);

import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

export const SITUACOES_CARTEIRA = [
  "Não abordado",
  "Em contato",
  "Em negociação",
  "Cliente",
  "Sem interesse",
] as const;
export const unidadeSchema = z.object({
  id: z.string().uuid().optional(),
  updated_at: z.string().optional(),
  nome: z.string().trim().min(2).max(200),
  cnpj: z.string().max(18).default(""),
  rede: z.string().trim().max(200).default(""),
  grupo: z.string().trim().max(200).default(""),
  razao_social: z.string().trim().max(200).default(""),
  canal: z.string().max(100).default(""),
  cidade: z.string().max(150).default(""),
  uf: z.string().max(2).default(""),
  instagram: z.string().max(200).default(""),
  classe: z.enum(["", "A", "B", "C"]).default(""),
  situacao: z.enum(SITUACOES_CARTEIRA).default("Não abordado"),
  responsavel_id: z.string().uuid().nullable().default(null),
  observacoes: z.string().max(10000).default(""),
});
export type UnidadeInput = z.infer<typeof unidadeSchema>;
export type Unidade = UnidadeInput & { id: string; empresa_id: string; updated_at: string };
export const atividadeSchema = z.object({
  unidade_id: z.string().uuid(),
  tipo: z.enum(["Ligação", "WhatsApp", "E-mail", "Tarefa"]),
  prazo: z.string().datetime(),
  descricao: z.string().trim().min(1).max(2000),
});
export type Atividade = {
  id: string;
  unidade_id: string;
  tipo: string;
  prazo: string;
  descricao: string;
  concluida_em: string | null;
  resultado: string;
};

export const filtrosCarteiraSchema = z.object({
  busca: z.string().max(200).default(""),
  classe: z.enum(["", "A", "B", "C", "sem"]).default(""),
  situacao: z.union([z.literal(""), z.enum(SITUACOES_CARTEIRA)]).default(""),
  rede: z.string().max(200).default(""),
  grupo: z.string().max(200).default(""),
  cidade: z.string().max(150).default(""),
  uf: z.string().max(2).default(""),
  responsavel: z.union([z.literal(""), z.literal("sem"), z.string().uuid()]).default(""),
  agenda: z.enum(["", "hoje", "atrasados", "sem"]).default(""),
  pagina: z.number().int().min(0).max(100000).default(0),
});
export type FiltrosCarteira = z.infer<typeof filtrosCarteiraSchema>;
export type UnidadeLista = Unidade & { proxima_acao: string | null; ultimo_contato: string | null };
export const contatoSchema = z
  .object({
    id: z.string().uuid().optional(),
    updated_at: z.string().optional(),
    unidade_id: z.string().uuid(),
    nome: z.string().trim().max(200).default(""),
    papel: z.enum(["Proprietário", "Comprador", "Outro"]).default("Outro"),
    telefone: z.string().trim().max(100).default(""),
    whatsapp: z.string().trim().max(100).default(""),
    email: z.string().trim().max(254).default(""),
  })
  .refine(
    (c) => !!(c.nome || c.telefone || c.whatsapp || c.email),
    "Informe nome ou um canal de contato.",
  );
export type Contato = z.infer<typeof contatoSchema> & { id: string; updated_at: string };
export type HistoricoCarteira = {
  id: string;
  acao: string;
  created_at: string;
  antes: Json;
  depois: Json;
};
export type NegociacaoCarteira = {
  lead_id: string;
  nome: string;
  etapa: string;
  unidades: { id: string; nome: string }[];
  pedidos: { id: string; numero: number; status: string; total: number }[];
};
export function whatsappCarteira(valor: string) {
  if (/[^\d+()\s.-]/.test(valor)) return null;
  const digitos = valor.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digitos)) return null;
  return `https://wa.me/${digitos.length <= 11 ? "55" : ""}${digitos}`;
}
/** Limites do dia comercial, sempre no fuso brasileiro, independentemente do dispositivo. */
export function limitesDiaCarteira(agora = new Date()) {
  const dia = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 86400000).toISOString() };
}

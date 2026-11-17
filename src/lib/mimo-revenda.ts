import { z } from "zod";
import { UFS, normalizarWhatsappInfluenciador } from "./mimo-influenciadores";
export { UFS };
export const MINIMO_REVENDA = 1500;
export const CANAIS_REVENDA = { loja: "Loja física", emporio: "Empório", distribuidor: "Distribuidora", internet: "Internet", comecando: "Estou começando" };
export const PRAZOS_REVENDA = { agora: "Agora", trinta_dias: "Nos próximos 30 dias", pesquisando: "Ainda estou pesquisando" };
const texto = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Use apenas texto neste campo.");
export const revendaSchema = z.object({
  envio_id: z.string().uuid(),
  interesse: z.literal("revenda"),
  canal: z.enum(["loja", "emporio", "distribuidor", "internet", "comecando"]),
  cidade: texto(100).refine(v => v.length >= 2, "Informe sua cidade."),
  uf: z.string().refine(v => UFS.includes(v), "Escolha seu estado."),
  investimento: z.literal("sim"),
  prazo: z.enum(["agora", "trinta_dias", "pesquisando"]),
  nome: texto(150).refine(v => v.length >= 3, "Informe seu nome."),
  whatsapp: z.string().max(25).transform(normalizarWhatsappInfluenciador)
    .pipe(z.string().regex(/^[1-9]{2}\d{8,9}$/, "Informe seu WhatsApp com DDD.")),
  consentimento: z.literal(true),
  site: z.string().max(0, "Envio inválido.").default(""),
  utm_source: texto(100).default(""), utm_campaign: texto(150).default(""), utm_content: texto(150).default(""),
});
export type RevendaInput = z.infer<typeof revendaSchema>;
export function mensagemRevenda(d: RevendaInput) {
  return `Olá! Preenchi o formulário de revenda MiMo e quero falar com um consultor.\nNome: ${d.nome}\nCidade/UF: ${d.cidade}/${d.uf}\nOnde pretendo revender: ${CANAIS_REVENDA[d.canal]}\nO pedido inicial mínimo de R$ 1.500 está dentro do que pretendo investir.\nQuando pretendo comprar: ${PRAZOS_REVENDA[d.prazo]}.`;
}
export function linkRevenda(numero: string, d: RevendaInput) {
  if (!/^55\d{10,11}$/.test(numero)) throw Error("Atendimento indisponível.");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagemRevenda(d))}`;
}


import { z } from "zod";

export const centavosVenda = z.number().int().min(0).max(999_999_999_999);
export const edicaoVendasSchema = z.object({
  competencia: z.iso.date(), dia: z.iso.date().nullable(), esperado: centavosVenda, valor: centavosVenda,
});
export type EdicaoVendas = z.infer<typeof edicaoVendasSchema>;
const diaImportado = z.object({ data: z.iso.date(), feriado: z.boolean(), realizado: centavosVenda });
const registroSchema = z.object({
  competencia: z.iso.date(),
  demonstrativo: z.object({
    semanas: z.array(z.object({ numero: z.number().int().min(1).max(6), dias: z.array(diaImportado).min(1).max(7) })).min(1).max(6),
    total: z.object({ orcado: centavosVenda }),
  }),
  ajustes: z.record(z.string(), centavosVenda).default({}),
});

export function valorEmCentavos(entrada: string): number | null {
  const s = entrada.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s) && !/^\d+\.\d{1,2}$/.test(s)) return null;
  const decimal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".")
    : /^\d+\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, "");
  const [inteiro, fracao = ""] = decimal.split(".");
  const valor = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return centavosVenda.safeParse(valor).success ? valor : null;
}

function totais(orcado: number, realizado: number) {
  // Both inputs are integer cents. Round the percentage only for display.
  const coberturaBps = orcado > 0 ? Math.round((realizado / orcado) * 10000) : null;
  return { orcado, realizado, coberturaBps, diferenca: realizado - orcado };
}
export type TotaisVendas = ReturnType<typeof totais>;

export function calcularVendasMensais(bruto: unknown) {
  const { competencia, demonstrativo, ajustes } = registroSchema.parse(bruto);
  const meta = ajustes.meta ?? demonstrativo.total.orcado;
  const dias = demonstrativo.semanas.flatMap(s => s.dias);
  const datasUteis = dias.filter(d => {
    const dia = new Date(d.data + "T00:00:00Z").getUTCDay();
    return !d.feriado && dia !== 0 && dia !== 6;
  }).map(d => d.data).sort();
  const base = datasUteis.length ? Math.floor(meta / datasUteis.length) : 0;
  const resto = datasUteis.length ? meta % datasUteis.length : 0;
  const metasDiarias = new Map(datasUteis.map((data, i) => [data, base + (i < resto ? 1 : 0)]));
  const semanas = demonstrativo.semanas.map(semana => {
    const linhas = semana.dias.map(d => ({ ...d, ...totais(metasDiarias.get(d.data) ?? 0, ajustes[d.data] ?? d.realizado) }));
    return { numero: semana.numero, dias: linhas, total: totais(
      linhas.reduce((s, d) => s + d.orcado, 0), linhas.reduce((s, d) => s + d.realizado, 0),
    ) };
  });
  return { competencia, semanas, diasUteis: datasUteis.length,
    total: totais(meta, semanas.reduce((s, semana) => s + semana.total.realizado, 0)) };
}
export type VendasMensais = ReturnType<typeof calcularVendasMensais>;

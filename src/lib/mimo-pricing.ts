import { z } from "zod";

export const CANAIS = [
  "Venda Direta",
  "Distribuidor",
  "Televendas",
  "E-commerce",
  "Marketplace",
  "Broker",
] as const;
// Fixed decimal arithmetic: 12 fractional places internally; no cent rounding between stages.
const SCALE = 10n ** 12n;
export function dec(v: string): bigint {
  const [a, b = ""] = v.split(".");
  return (
    BigInt(a) * SCALE + BigInt((b + "000000000000").slice(0, 12)) * (a.startsWith("-") ? -1n : 1n)
  );
}
export function str(v: bigint): string {
  const n = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${n / SCALE}.${(n % SCALE).toString().padStart(12, "0")}`;
}
const mul = (a: bigint, b: bigint) => (a * b) / SCALE;
const div = (a: bigint, b: bigint) => (a * SCALE) / b;
const sum = (a: bigint[]) => a.reduce((x, y) => x + y, 0n);
const decimal = z.string().regex(/^\d{1,12}(\.\d{1,12})?$/);
const rate = decimal.refine((v) => dec(v) <= SCALE, "Informe uma fração entre 0 e 1");
export const etapaSchema = z
  .object({ modo: z.enum(["margem", "markup"]), taxa: decimal })
  .refine((e) => e.modo !== "margem" || dec(e.taxa) < SCALE, "Margem deve ser menor que 1");
export const linhaSchema = z.object({
  codigo: z.string().trim().min(1).max(50),
  produto: z.string().trim().min(1).max(300),
  canal: z.enum(CANAIS),
  custo: decimal.nullable(),
  preco: decimal.nullable(),
  sugerido: decimal.nullable(),
  impostos: rate.nullable(),
  despesas: z
    .array(
      z.object({
        nome: z.string().min(1).max(100),
        base: z.enum(["faturamento", "unidade", "operacao"]),
        valor: decimal,
      }),
    )
    .max(30),
  desconto: rate,
  quantidade: decimal.nullable(),
  bonus: decimal,
  fixas: rate.nullable(),
  meta: rate.nullable(),
  varejista: etapaSchema.nullable(),
  distribuidor: etapaSchema.nullable(),
});
export type Linha = z.infer<typeof linhaSchema>;
export const politicaSchema = z.object({
  canal: z.enum(CANAIS),
  uf: z
    .string()
    .regex(
      /^$|^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
    ),
  cliente: z.string().uuid().nullable(),
  impostos: rate.nullable(),
  fixas: rate.nullable(),
  meta: rate.nullable(),
  varejista: etapaSchema.nullable(),
  distribuidor: etapaSchema.nullable(),
});
export type Politica = z.infer<typeof politicaSchema>;
export const documentoSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    cliente: z.string().uuid().nullable(),
    uf: politicaSchema.shape.uf,
    linhas: z.array(linhaSchema).min(1).max(1000),
    politicas: z.array(politicaSchema).max(1000),
  })
  .superRefine((d, c) => {
    const keys = d.linhas.map((l) => l.codigo + "|" + l.canal);
    if (new Set(keys).size !== keys.length)
      c.addIssue({ code: "custom", message: "SKU/canal duplicado" });
    const ps = d.politicas.map((p) => `${p.canal}|${p.uf}|${p.cliente}`);
    if (new Set(ps).size !== ps.length)
      c.addIssue({ code: "custom", message: "Política duplicada" });
  });
export type Documento = z.infer<typeof documentoSchema>;
export function aplicarPoliticas(
  l: Linha,
  ps: Politica[],
  cliente: string | null,
  uf: string,
): Linha {
  let result = { ...l };
  for (const p of [
    ps.find((p) => p.canal === l.canal && !p.cliente && !p.uf),
    ps.find((p) => p.canal === l.canal && !p.cliente && p.uf === uf && !!uf),
    ps.find((p) => p.canal === l.canal && p.cliente === cliente && !!cliente && p.uf === uf),
  ]) {
    if (p)
      for (const k of ["impostos", "fixas", "meta", "varejista", "distribuidor"] as const)
        if (p[k] !== null) result = { ...result, [k]: p[k] };
  }
  return result;
}
export function calcular(l: Linha, unitario = false) {
  if (
    unitario &&
    linhaSchema.safeParse(l).success &&
    (l.quantidade === null || dec(l.quantidade) === 0n) &&
    (dec(l.bonus) > 0n || l.despesas.some((e) => e.base === "operacao" && dec(e.valor) > 0n))
  )
    return {
      pendentes: ["Informe volume faturado para ratear bonificações e despesas por operação"],
      receita: null,
      bruta: null,
      contribuicao: null,
      liquido: null,
      percentual: null,
      minimo: null,
      efetivo: null,
      pdv: null,
      etapas: [],
    };
  if (!linhaSchema.safeParse(l).success)
    return {
      pendentes: ["Parâmetros inválidos"],
      receita: null,
      bruta: null,
      contribuicao: null,
      liquido: null,
      percentual: null,
      minimo: null,
      efetivo: null,
      pdv: null,
      etapas: [],
    };
  const pendentes: string[] = [];
  if (l.custo === null) pendentes.push("Custo ausente");
  if (l.preco === null) pendentes.push("Preço ausente");
  if (l.impostos === null) pendentes.push("Impostos ausentes");
  if (l.fixas === null) pendentes.push("Rateio fixo ausente");
  if (l.meta === null) pendentes.push("Meta ausente");
  const q = unitario ? SCALE : l.quantidade === null ? null : dec(l.quantidade);
  if (q === null) pendentes.push("Volume previsto ausente");
  if (q === null || l.custo === null || l.preco === null || l.impostos === null)
    return {
      pendentes,
      receita: null,
      bruta: null,
      contribuicao: null,
      liquido: null,
      percentual: null,
      minimo: null,
      efetivo: null,
      pdv: null,
      etapas: [],
    };
  const bonus = unitario
    ? l.quantidade && dec(l.quantidade) > 0n
      ? div(dec(l.bonus), dec(l.quantidade))
      : 0n
    : dec(l.bonus);
  const efetivo = mul(dec(l.preco), SCALE - dec(l.desconto));
  const receita = mul(q, efetivo),
    industrial = mul(q + bonus, dec(l.custo)),
    impostos = mul(receita, dec(l.impostos));
  const valores = l.despesas.map((e) => ({
    nome: e.nome,
    base: e.base,
    valor: mul(
      dec(e.valor),
      e.base === "faturamento"
        ? receita
        : e.base === "unidade"
          ? q + bonus
          : unitario
            ? l.quantidade && dec(l.quantidade) > 0n
              ? div(SCALE, dec(l.quantidade))
              : 0n
            : SCALE,
    ),
  }));
  const bruta = receita - impostos - industrial,
    contribuicao = bruta - sum(valores.map((e) => e.valor));
  const liquido = l.fixas === null ? null : contribuicao - mul(receita, dec(l.fixas));
  const percentual = receita > 0n ? div(contribuicao, receita) : null;
  let minimo: bigint | null = null;
  if (l.meta !== null && q > 0n && dec(l.desconto) < SCALE) {
    const den = mul(
      mul(q, SCALE - dec(l.desconto)),
      SCALE -
        dec(l.impostos) -
        sum(l.despesas.filter((e) => e.base === "faturamento").map((e) => dec(e.valor))) -
        dec(l.meta),
    );
    if (den > 0n)
      minimo = div(
        industrial + sum(valores.filter((e) => e.base !== "faturamento").map((e) => e.valor)),
        den,
      );
  }
  let pdv: bigint | null = efetivo;
  const etapas: {
    nome: string;
    entrada: string;
    saida: string;
    acrescimo: string;
    participacao: string | null;
    evolucao: string | null;
  }[] = [];
  for (const nome of (l.canal === "Distribuidor"
    ? ["distribuidor", "varejista"]
    : ["Venda Direta", "Televendas", "Broker"].includes(l.canal)
      ? ["varejista"]
      : []) as ("distribuidor" | "varejista")[]) {
    const e = l[nome];
    if (!e || pdv === null) {
      pendentes.push(`Parâmetro ${nome} ausente`);
      pdv = null;
      continue;
    }
    const entrada: bigint = pdv;
    pdv =
      e.modo === "margem" ? div(entrada, SCALE - dec(e.taxa)) : mul(entrada, SCALE + dec(e.taxa));
    etapas.push({
      nome,
      entrada: str(entrada),
      saida: str(pdv),
      acrescimo: str(pdv - entrada),
      participacao: null,
      evolucao: entrada > 0n ? str(div(pdv - entrada, entrada)) : null,
    });
  }
  if (pdv && pdv > 0n) for (const e of etapas) e.participacao = str(div(dec(e.acrescimo), pdv));
  if (contribuicao < 0n) pendentes.push("Contribuição negativa");
  if (l.meta !== null && percentual !== null && percentual < dec(l.meta))
    pendentes.push("Abaixo da meta");
  return {
    pendentes,
    receita: str(receita),
    industrial: str(industrial),
    impostos: str(impostos),
    variaveis: str(sum(valores.map((e) => e.valor))),
    despesas: valores.map((e) => ({ ...e, valor: str(e.valor) })),
    bruta: str(bruta),
    contribuicao: str(contribuicao),
    liquido: liquido === null ? null : str(liquido),
    percentual: percentual === null ? null : str(percentual),
    minimo: minimo === null ? null : str(minimo),
    efetivo: str(efetivo),
    pdv: pdv === null ? null : str(pdv),
    etapas,
  };
}
export function agregar(linhas: Linha[]) {
  const rs = linhas.filter((l) => l.quantidade !== null).map((l) => calcular(l));
  const completo = rs.length > 0 && rs.every((r) => r.receita !== null);
  const receita = completo ? sum(rs.map((r) => dec(r.receita!))) : null;
  const contribuicao = completo ? sum(rs.map((r) => dec(r.contribuicao!))) : null;
  return {
    volumes: rs.length,
    receita: receita === null ? null : str(receita),
    contribuicao: contribuicao === null ? null : str(contribuicao),
    percentual: receita && contribuicao !== null ? str(div(contribuicao, receita)) : null,
    liquido:
      completo && rs.every((r) => r.liquido !== null)
        ? str(sum(rs.map((r) => dec(r.liquido!))))
        : null,
  };
}
export function revisar(linhas: Linha[], anteriores: Linha[] = []) {
  const keys = new Set<string>();
  const erros: string[] = [];
  const avisos: string[] = [];
  let alterados = 0,
    novos = 0;
  for (const l of linhas) {
    const key = l.codigo + "|" + l.canal;
    if (keys.has(key)) erros.push(`Duplicado: ${key}`);
    keys.add(key);
    const a = anteriores.find((a) => a.codigo === l.codigo && a.canal === l.canal);
    if (!a) novos++;
    else if (JSON.stringify(a) !== JSON.stringify(l)) alterados++;
    if (l.custo === null || l.preco === null) avisos.push(`Custo/preço ausente: ${key}`);
  }
  for (const codigo of new Set(linhas.map((l) => l.codigo)))
    if (new Set(linhas.filter((l) => l.codigo === codigo).map((l) => l.custo)).size > 1)
      avisos.push(`Revisar custos diferentes entre canais: ${codigo}`);
  return { erros, avisos, novos, alterados };
}

export function diferencaPreco(a: string | null, b: string | null) {
  if (a === null || b === null || !/^\d+(\.\d+)?$/.test(a) || !/^\d+(\.\d+)?$/.test(b))
    return { valor: null, percentual: null };
  const delta = dec(b) - dec(a);
  return { valor: str(delta), percentual: dec(a) > 0n ? str(div(delta, dec(a))) : null };
}
export function conflitosPreco(linhas: Linha[]) {
  const alertas: string[] = [];
  for (const sku of new Set(linhas.map((l) => l.codigo))) {
    const ls = linhas.filter((l) => l.codigo === sku);
    for (const direto of ls.filter((l) => ["E-commerce", "Marketplace"].includes(l.canal))) {
      const pdv = calcular(direto, true).pdv;
      if (pdv === null) continue;
      for (const revenda of ls.filter((l) => !["E-commerce", "Marketplace"].includes(l.canal))) {
        const r = calcular(revenda, true);
        if (r.pdv !== null && dec(pdv) < dec(r.pdv))
          alertas.push(
            `${sku}: ${direto.canal} projeta PDV abaixo de ${revenda.canal}. Revisar conflito entre canais.`,
          );
      }
    }
  }
  return alertas;
}

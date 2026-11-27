import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

/**
 * Representantes comerciais externos (sem login) da MiMo: cadastro, território por UF,
 * atribuição de clientes da carteira e desempenho por período.
 * Dinheiro sempre em centavos inteiros; comissão em pontos-base (1% = 100 bps).
 */

export const UFS_BR =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

/** Estados do pedido que contam como faturamento (mesma regra do retorno de campanhas). */
export const STATUS_FATURADOS = ["faturado", "enviado", "entregue"] as const;

export const podeGerenciarRepresentantesComerciais = (papel: string) =>
  papel === "administrador" || papel === "gestor";

// ---------------------------------------------------------------- textos e números

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Nome de exibição: espaços colapsados. */
export const limparNome = (nome: string) => nome.replace(/\s+/g, " ").trim();

/** Chave de identidade do representante; o banco calcula a mesma chave (`mimo_rep_chave`). */
export const chaveNome = (nome: string) => semAcento(limparNome(nome).toLowerCase());

/**
 * Converte uma comissão para pontos-base sem ponto flutuante.
 * - `planilha`: número menor que 1 é fração (0,035 = 3,5%); de 1 a 100 é percentual; `%` explícito é percentual.
 * - `percentual`: o valor digitado é percentual (3,5 = 3,5%).
 * Retorna null quando o valor não é exato em pontos-base ou fica fora de 0–100%.
 */
export function comissaoParaBps(valor: unknown, modo: "planilha" | "percentual"): number | null {
  let texto: string;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    // Remove ruído binário do Excel (0.035000000000000003) mantendo 10 casas.
    texto = valor.toFixed(10);
  } else if (typeof valor === "string") texto = valor;
  else return null;
  texto = texto.trim().replace(/\s/g, "");
  let percentual = modo === "percentual";
  if (texto.endsWith("%")) {
    percentual = true;
    texto = texto.slice(0, -1);
  }
  if (texto.includes(",")) {
    if (texto.includes(".")) texto = texto.replace(/\./g, "");
    texto = texto.replace(",", ".");
  }
  const m = /^(\d{1,3})(?:\.(\d{1,10}))?$/.exec(texto);
  if (!m) return null;
  const inteiro = m[1];
  const fracao = (m[2] ?? "").replace(/0+$/, "");
  if (!percentual && modo === "planilha" && Number(inteiro) >= 1) percentual = true;
  // Pontos-base: percentual × 100 ou fração × 10000.
  const casas = percentual ? 2 : 4;
  if (fracao.length > casas) return null;
  const bps = Number(inteiro) * 10 ** casas + Number(fracao.padEnd(casas, "0") || "0");
  return Number.isSafeInteger(bps) && bps >= 0 && bps <= 10000 ? bps : null;
}

/** 350 → "3,5%"; 500 → "5%". */
export function formatarBps(bps: number) {
  const inteiro = Math.floor(bps / 100);
  const resto = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return `${inteiro}${resto ? "," + resto : ""}%`;
}

/** Comissão em centavos = faturamento × bps / 10000, arredondamento meio para cima, em BigInt. */
export function calcularComissaoCentavos(faturamentoCentavos: number, bps: number) {
  if (!Number.isSafeInteger(faturamentoCentavos) || faturamentoCentavos < 0)
    throw Error("Faturamento inválido.");
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) throw Error("Comissão inválida.");
  const v = (BigInt(faturamentoCentavos) * BigInt(bps) * 2n + 10000n) / 20000n;
  return Number(v);
}

export const centavosParaReais = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------- tipos persistidos

export type RepresentanteComercial = {
  id: string;
  empresa_id: string;
  nome: string;
  chave: string;
  ativo: boolean;
  comissao_bps: number;
  telefone: string;
  email: string;
  observacoes: string;
  versao: number;
  criado_por: string;
  atualizado_por: string;
  created_at: string;
  updated_at: string;
};
export type TerritorioRepresentante = {
  empresa_id: string;
  uf: string;
  representante_id: string;
  principal: boolean;
  regiao: string;
  estado: string;
  updated_at: string;
};
/** Atribuição manual; `representante_id` nulo significa "voltar ao automático pela UF". */
export type ClienteRepresentante = {
  empresa_id: string;
  unidade_id: string;
  representante_id: string | null;
  motivo: string;
  versao: number;
  atualizado_por: string;
  updated_at: string;
};
export type HistoricoRepresentanteComercial = {
  id: number;
  empresa_id: string;
  entidade: "representante" | "territorio" | "cliente" | "importacao";
  referencia: string;
  acao: string;
  antes: Json | null;
  depois: Json | null;
  ator_id: string;
  created_at: string;
};
export type UnidadeCarteiraRep = { id: string; nome: string; cidade: string; uf: string };

// ---------------------------------------------------------------- formulários / RPC

const ufSchema = z.string().refine((v) => UFS_BR.includes(v), "UF inválida.");

export const representanteComercialSchema = z
  .object({
    id: z.string().uuid().nullable(),
    versao: z.number().int().positive().nullable(),
    nome: z.string().transform(limparNome).pipe(z.string().min(2, "Informe o nome.").max(200)),
    ativo: z.boolean(),
    comissao_bps: z.number().int().min(0).max(10000),
    telefone: z.string().trim().max(40),
    email: z.union([z.literal(""), z.string().trim().email("E-mail inválido.").max(200)]),
    observacoes: z.string().max(2000),
    territorios: z
      .array(z.object({ uf: ufSchema, principal: z.boolean() }).strict())
      .max(27)
      .refine((t) => new Set(t.map((x) => x.uf)).size === t.length, "UF repetida."),
  })
  .strict()
  .refine((d) => (d.id === null) === (d.versao === null), "Versão obrigatória para editar.");
export type RepresentanteComercialInput = z.input<typeof representanteComercialSchema>;

export const clienteRepresentanteSchema = z
  .object({
    unidade_id: z.string().uuid(),
    representante_id: z.string().uuid().nullable(),
    motivo: z.string().trim().min(3, "Informe o motivo da alteração.").max(500),
    versao: z.number().int().positive().nullable(),
  })
  .strict();

export const importacaoRepresentantesSchema = z
  .object({
    representantes: z
      .array(
        z
          .object({
            nome: z.string().transform(limparNome).pipe(z.string().min(2).max(200)),
            comissao_bps: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    territorios: z
      .array(
        z
          .object({
            uf: ufSchema,
            nome: z.string().transform(limparNome).pipe(z.string().min(2).max(200)),
            principal: z.boolean(),
            regiao: z.string().trim().max(100),
            estado: z.string().trim().max(100),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict()
  .superRefine((d, ctx) => {
    const chaves = d.representantes.map((r) => chaveNome(r.nome));
    if (new Set(chaves).size !== chaves.length)
      ctx.addIssue({ code: "custom", message: "Representante repetido na importação." });
    const conhecidos = new Set(chaves);
    const vistos = new Set<string>();
    const principais = new Set<string>();
    for (const t of d.territorios) {
      const k = `${t.uf}|${chaveNome(t.nome)}`;
      if (!conhecidos.has(chaveNome(t.nome)))
        ctx.addIssue({ code: "custom", message: `Representante sem cadastro: ${t.nome}.` });
      if (vistos.has(k)) ctx.addIssue({ code: "custom", message: `Território repetido: ${t.uf}.` });
      vistos.add(k);
      if (t.principal) {
        if (principais.has(t.uf))
          ctx.addIssue({ code: "custom", message: `${t.uf} tem mais de um principal.` });
        principais.add(t.uf);
      }
    }
  });
export type ImportacaoRepresentantes = z.output<typeof importacaoRepresentantesSchema>;

export const periodoRepresentantesSchema = z
  .object({
    de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()
  .superRefine((p, ctx) => {
    const d = (s: string) => {
      const x = new Date(`${s}T12:00:00Z`);
      return Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== s ? null : x;
    };
    const de = d(p.de),
      ate = d(p.ate);
    if (!de || !ate) ctx.addIssue({ code: "custom", message: "Data inválida." });
    else if (de > ate) ctx.addIssue({ code: "custom", message: "Início depois do fim." });
    else if (ate.getTime() - de.getTime() > 366 * 86400000)
      ctx.addIssue({ code: "custom", message: "Use um período de até um ano." });
  });
export type PeriodoRepresentantes = z.infer<typeof periodoRepresentantesSchema>;

/** Do primeiro dia do mês até hoje, em datas comerciais de São Paulo. */
export function periodoPadrao(agora = new Date()): PeriodoRepresentantes {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

// ---------------------------------------------------------------- planilha

/** Cabeçalho comparável: sem acento, maiúsculas, só letras/números. */
const cab = (v: unknown) =>
  semAcento(String(v ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const COLUNAS = {
  regiao: ["REGIAO"],
  estado: ["ESTADO"],
  uf: ["UF"],
  representante: ["REPRESENTANTES", "REPRESENTANTE"],
  comissao: ["COMISSOES", "COMISSAO"],
  contar: ["CONTARUF"],
} as const;
type Coluna = keyof typeof COLUNAS;

export type LinhaPlanilhaRep = {
  linha: number;
  regiao: string;
  estado: string;
  uf: string;
  nome: string;
  comissaoBps: number;
  principal: boolean;
};
export type PlanilhaRepresentantes = {
  linhas: LinhaPlanilhaRep[];
  erros: { linha: number | null; mensagem: string }[];
  avisos: string[];
  payload: ImportacaoRepresentantes | null;
};

function colunasDo(row: unknown[]) {
  const idx: Partial<Record<Coluna, number>> = {};
  row.forEach((v, i) => {
    const c = cab(v);
    for (const [k, nomes] of Object.entries(COLUNAS) as [Coluna, readonly string[]][])
      if (idx[k] === undefined && (nomes as readonly string[]).includes(c)) idx[k] = i;
  });
  return idx;
}

export function indiceCabecalhoRepresentantes(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const c = colunasDo(rows[i] ?? []);
    if (c.uf !== undefined && c.representante !== undefined && c.comissao !== undefined) return i;
  }
  return -1;
}

const texto = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();

/** 1/0 (ou sim/não); vazio = null; qualquer outro valor = undefined (erro). */
function lerContar(v: unknown): boolean | null | undefined {
  const t = semAcento(texto(v)).toLowerCase();
  if (v === true || t === "1" || t === "sim") return true;
  if (v === false || t === "0" || t === "nao") return false;
  return t === "" ? null : undefined;
}

/**
 * Valida a planilha REGIÃO | ESTADO | UF | REPRESENTANTE(S) | COMISSÕES % | CONTAR UF.
 * Uma linha por representante e UF; CONTAR UF = 1 indica o principal da UF.
 * Sem a coluna CONTAR UF, uma UF com um único representante o tem como principal.
 */
export function prepararPlanilhaRepresentantes(rows: unknown[][]): PlanilhaRepresentantes {
  const erros: PlanilhaRepresentantes["erros"] = [];
  const avisos: string[] = [];
  const h = indiceCabecalhoRepresentantes(rows);
  if (h < 0)
    return {
      linhas: [],
      erros: [
        {
          linha: null,
          mensagem: "Cabeçalho não encontrado. Use as colunas UF, REPRESENTANTE(S) e COMISSÕES %.",
        },
      ],
      avisos,
      payload: null,
    };
  const c = colunasDo(rows[h]);
  const linhas: LinhaPlanilhaRep[] = [];
  const pendentesContar: { linha: LinhaPlanilhaRep; contar: boolean | null }[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const n = i + 1;
    const get = (k: Coluna) => (c[k] === undefined ? "" : row[c[k]!]);
    const uf = texto(get("uf")).toUpperCase();
    const nome = limparNome(texto(get("representante")));
    const bruto = get("comissao");
    if (!uf && !nome && texto(bruto) === "") continue;
    if (!UFS_BR.includes(uf)) {
      erros.push({ linha: n, mensagem: `UF inválida: "${uf || "vazia"}".` });
      continue;
    }
    if (!nome || nome === "-") {
      avisos.push(`Linha ${n}: ${uf} sem representante; ignorada.`);
      continue;
    }
    if (nome.length < 2 || nome.length > 200) {
      erros.push({ linha: n, mensagem: "Nome do representante inválido." });
      continue;
    }
    const bps = comissaoParaBps(bruto, "planilha");
    if (bps === null) {
      erros.push({ linha: n, mensagem: `Comissão inválida: "${texto(bruto)}".` });
      continue;
    }
    const contarBruto = get("contar");
    const contar = c.contar === undefined ? null : lerContar(contarBruto);
    if (contar === undefined) {
      erros.push({ linha: n, mensagem: `CONTAR UF deve ser 0 ou 1: "${texto(contarBruto)}".` });
      continue;
    }
    const linha: LinhaPlanilhaRep = {
      linha: n,
      regiao: texto(get("regiao")).slice(0, 100),
      estado: texto(get("estado")).slice(0, 100),
      uf,
      nome,
      comissaoBps: bps,
      principal: contar === true,
    };
    linhas.push(linha);
    pendentesContar.push({ linha, contar });
  }
  // Duplicidades e principal por UF.
  const porUf = new Map<string, LinhaPlanilhaRep[]>();
  for (const l of linhas) porUf.set(l.uf, [...(porUf.get(l.uf) ?? []), l]);
  for (const [uf, ls] of porUf) {
    const chaves = ls.map((l) => chaveNome(l.nome));
    if (new Set(chaves).size !== chaves.length)
      erros.push({ linha: ls[1].linha, mensagem: `${uf}: representante repetido na mesma UF.` });
    const semContar = pendentesContar.filter((p) => p.linha.uf === uf && p.contar === null);
    if (semContar.length) {
      if (ls.length === 1) ls[0].principal = true;
      else
        erros.push({
          linha: semContar[0].linha.linha,
          mensagem: `${uf} tem mais de um representante: informe CONTAR UF (1 = principal, 0 = secundário).`,
        });
    }
    const principais = ls.filter((l) => l.principal).length;
    if (principais > 1)
      erros.push({ linha: ls[0].linha, mensagem: `${uf} tem mais de um representante principal.` });
    if (principais === 0 && !semContar.length)
      avisos.push(
        `${uf} não tem representante principal; clientes da UF ficarão sem representante.`,
      );
  }
  // Comissão fixa por representante.
  const reps = new Map<string, { nome: string; comissao_bps: number; linha: number }>();
  for (const l of linhas) {
    const k = chaveNome(l.nome);
    const r = reps.get(k);
    if (!r) reps.set(k, { nome: l.nome, comissao_bps: l.comissaoBps, linha: l.linha });
    else if (r.comissao_bps !== l.comissaoBps)
      erros.push({
        linha: l.linha,
        mensagem: `${l.nome}: comissão diferente de outra linha (${formatarBps(r.comissao_bps)} × ${formatarBps(l.comissaoBps)}).`,
      });
  }
  if (!linhas.length && !erros.length)
    erros.push({ linha: null, mensagem: "Nenhuma linha de representante encontrada." });
  if (erros.length) return { linhas, erros, avisos, payload: null };
  const payload = importacaoRepresentantesSchema.parse({
    representantes: [...reps.values()].map(({ nome, comissao_bps }) => ({ nome, comissao_bps })),
    territorios: linhas.map((l) => ({
      uf: l.uf,
      nome: reps.get(chaveNome(l.nome))!.nome,
      principal: l.principal,
      regiao: l.regiao,
      estado: l.estado,
    })),
  });
  return { linhas, erros, avisos, payload };
}

/** Texto colado do Excel (tabulação) ou CSV com ";" ou ",". */
export function lerTextoTabela(text: string): string[][] {
  const limpo = text.replace(/^\uFEFF/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep = primeira.includes("\t")
    ? "\t"
    : primeira.split(";").length > primeira.split(",").length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    campo = "",
    aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i];
    if (ch === '"') {
      if (aspas && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      row.push(campo);
      campo = "";
    } else if ((ch === "\n" || ch === "\r") && !aspas) {
      if (ch === "\r" && limpo[i + 1] === "\n") i++;
      row.push(campo);
      rows.push(row);
      row = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || row.length) {
    row.push(campo);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------- atribuição

export type MotivoClienteSemRep = "sem_uf" | "uf_sem_principal";
export type MotivoPedidoSemRep =
  "pedido_sem_unidade" | "unidade_sem_representante" | "unidades_divergentes";
export const ROTULO_MOTIVO: Record<MotivoClienteSemRep | MotivoPedidoSemRep, string> = {
  sem_uf: "Cliente sem UF",
  uf_sem_principal: "UF sem representante principal ativo",
  pedido_sem_unidade: "Pedido sem unidade da carteira vinculada",
  unidade_sem_representante: "Unidade do pedido sem representante",
  unidades_divergentes: "Pedido vinculado a unidades de representantes diferentes",
};

export type Atribuicao =
  | { representanteId: string; origem: "manual" | "uf" }
  | { representanteId: null; origem: null; motivo: MotivoClienteSemRep };

/** Principal ativo de cada UF. Secundários e inativos não recebem clientes automaticamente. */
export function principaisPorUf(
  reps: Pick<RepresentanteComercial, "id" | "ativo">[],
  territorios: Pick<TerritorioRepresentante, "uf" | "representante_id" | "principal">[],
) {
  const ativos = new Set(reps.filter((r) => r.ativo).map((r) => r.id));
  const m = new Map<string, string>();
  for (const t of territorios)
    if (t.principal && ativos.has(t.representante_id)) m.set(t.uf, t.representante_id);
  return m;
}

/** Atribuição manual vence; senão, principal ativo da UF da unidade. */
export function atribuirUnidade(
  unidade: Pick<UnidadeCarteiraRep, "id" | "uf">,
  principais: Map<string, string>,
  manuais: Map<string, string>,
): Atribuicao {
  const manual = manuais.get(unidade.id);
  if (manual) return { representanteId: manual, origem: "manual" };
  const uf = (unidade.uf ?? "").trim().toUpperCase();
  if (!UFS_BR.includes(uf)) return { representanteId: null, origem: null, motivo: "sem_uf" };
  const rep = principais.get(uf);
  return rep
    ? { representanteId: rep, origem: "uf" }
    : { representanteId: null, origem: null, motivo: "uf_sem_principal" };
}

export function mapaManuais(
  clientes: Pick<ClienteRepresentante, "unidade_id" | "representante_id">[],
) {
  const m = new Map<string, string>();
  for (const c of clientes) if (c.representante_id) m.set(c.unidade_id, c.representante_id);
  return m;
}

// ---------------------------------------------------------------- desempenho

export type PedidoFaturadoRep = {
  id: string;
  lead_id: string;
  status: string;
  total: number;
  faturado_em: string | null;
};
export type LinhaDesempenho = {
  representanteId: string;
  nome: string;
  ativo: boolean;
  ufsPrincipais: string[];
  ufsSecundarias: string[];
  comissaoBps: number;
  clientes: number;
  clientesManuais: number;
  clientesFaturados: number;
  pedidos: number;
  faturamento: number;
  comissao: number;
};
export type SemRepresentante = {
  clientes: number;
  clientesFaturados: number;
  pedidos: number;
  faturamento: number;
  motivosClientes: Record<MotivoClienteSemRep, number>;
  motivosPedidos: Record<MotivoPedidoSemRep, { pedidos: number; faturamento: number }>;
};
export type Desempenho = {
  linhas: LinhaDesempenho[];
  semRepresentante: SemRepresentante;
  total: { clientes: number; pedidos: number; faturamento: number; comissao: number };
};

const soma = (a: number, b: number) => {
  const r = a + b;
  if (!Number.isSafeInteger(r)) throw Error("Total acima do limite seguro.");
  return r;
};

/**
 * Faturamento por representante: pedidos faturados/enviados/entregues cujo lead está vinculado
 * (negociação da carteira) a unidades atribuídas ao representante. Pedido ligado a unidades de
 * representantes diferentes não é dividido nem duplicado: vai para "Sem representante".
 */
export function calcularDesempenho(input: {
  representantes: RepresentanteComercial[];
  territorios: TerritorioRepresentante[];
  clientes: Pick<ClienteRepresentante, "unidade_id" | "representante_id">[];
  unidades: Pick<UnidadeCarteiraRep, "id" | "uf">[];
  negociacoes: { unidade_id: string; lead_id: string }[];
  pedidos: PedidoFaturadoRep[];
}): Desempenho {
  const principais = principaisPorUf(input.representantes, input.territorios);
  const manuais = mapaManuais(input.clientes);
  const linhas = new Map<string, LinhaDesempenho>();
  for (const r of [...input.representantes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
    const ts = input.territorios.filter((t) => t.representante_id === r.id);
    linhas.set(r.id, {
      representanteId: r.id,
      nome: r.nome,
      ativo: r.ativo,
      ufsPrincipais: ts
        .filter((t) => t.principal)
        .map((t) => t.uf)
        .sort(),
      ufsSecundarias: ts
        .filter((t) => !t.principal)
        .map((t) => t.uf)
        .sort(),
      comissaoBps: r.comissao_bps,
      clientes: 0,
      clientesManuais: 0,
      clientesFaturados: 0,
      pedidos: 0,
      faturamento: 0,
      comissao: 0,
    });
  }
  const sem: SemRepresentante = {
    clientes: 0,
    clientesFaturados: 0,
    pedidos: 0,
    faturamento: 0,
    motivosClientes: { sem_uf: 0, uf_sem_principal: 0 },
    motivosPedidos: {
      pedido_sem_unidade: { pedidos: 0, faturamento: 0 },
      unidade_sem_representante: { pedidos: 0, faturamento: 0 },
      unidades_divergentes: { pedidos: 0, faturamento: 0 },
    },
  };
  const atribuicao = new Map<string, string | null>();
  const unidadesVistas = new Set<string>();
  for (const u of input.unidades) {
    if (unidadesVistas.has(u.id)) continue;
    unidadesVistas.add(u.id);
    const a = atribuirUnidade(u, principais, manuais);
    const linha = a.representanteId ? linhas.get(a.representanteId) : undefined;
    if (linha) {
      atribuicao.set(u.id, linha.representanteId);
      linha.clientes++;
      if (a.origem === "manual") linha.clientesManuais++;
    } else {
      atribuicao.set(u.id, null);
      sem.clientes++;
      sem.motivosClientes[a.representanteId === null ? a.motivo : "uf_sem_principal"]++;
    }
  }
  const unidadesPorLead = new Map<string, Set<string>>();
  for (const n of input.negociacoes) {
    if (!atribuicao.has(n.unidade_id)) continue;
    const s = unidadesPorLead.get(n.lead_id) ?? new Set<string>();
    s.add(n.unidade_id);
    unidadesPorLead.set(n.lead_id, s);
  }
  const faturadosPorRep = new Map<string | null, Set<string>>();
  const pedidosVistos = new Set<string>();
  for (const p of input.pedidos) {
    if (pedidosVistos.has(p.id)) continue;
    if (!(STATUS_FATURADOS as readonly string[]).includes(p.status)) continue;
    if (!Number.isSafeInteger(p.total) || p.total < 0) throw Error("Total de pedido inválido.");
    pedidosVistos.add(p.id);
    const unidades = [...(unidadesPorLead.get(p.lead_id) ?? [])];
    const reps = new Set(unidades.map((u) => atribuicao.get(u) ?? null));
    let motivo: MotivoPedidoSemRep | null = null;
    if (!unidades.length) motivo = "pedido_sem_unidade";
    else if (reps.size > 1) motivo = "unidades_divergentes";
    else if (reps.has(null)) motivo = "unidade_sem_representante";
    const repId = motivo ? null : [...reps][0]!;
    const destino = repId ? linhas.get(repId)! : null;
    if (destino) {
      destino.pedidos++;
      destino.faturamento = soma(destino.faturamento, p.total);
    } else {
      sem.pedidos++;
      sem.faturamento = soma(sem.faturamento, p.total);
      const m = sem.motivosPedidos[motivo ?? "unidade_sem_representante"];
      m.pedidos++;
      m.faturamento = soma(m.faturamento, p.total);
    }
    if (motivo !== "pedido_sem_unidade" && motivo !== "unidades_divergentes") {
      const s = faturadosPorRep.get(repId) ?? new Set<string>();
      unidades.forEach((u) => s.add(u));
      faturadosPorRep.set(repId, s);
    }
  }
  const total = {
    clientes: sem.clientes,
    pedidos: sem.pedidos,
    faturamento: sem.faturamento,
    comissao: 0,
  };
  for (const l of linhas.values()) {
    l.clientesFaturados = faturadosPorRep.get(l.representanteId)?.size ?? 0;
    l.comissao = calcularComissaoCentavos(l.faturamento, l.comissaoBps);
    total.clientes += l.clientes;
    total.pedidos += l.pedidos;
    total.faturamento = soma(total.faturamento, l.faturamento);
    total.comissao = soma(total.comissao, l.comissao);
  }
  sem.clientesFaturados = faturadosPorRep.get(null)?.size ?? 0;
  return { linhas: [...linhas.values()], semRepresentante: sem, total };
}

// ---------------------------------------------------------------- CSV

const celula = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[\s]*([=+@-])/, "'$1")
    .replace(/"/g, '""') +
  '"';
const decimal = (centavos: number) => {
  const s = String(centavos).padStart(3, "0");
  return `${s.slice(0, -2)},${s.slice(-2)}`;
};

/** CSV com ";" e proteção contra fórmulas (mesma regra da exportação de candidatos). */
export function csvDesempenho(d: Desempenho, periodo: PeriodoRepresentantes) {
  const cab = [
    "Período",
    "Representante",
    "Situação",
    "UFs principais",
    "UFs secundárias",
    "Comissão %",
    "Clientes na carteira",
    "Clientes atribuídos manualmente",
    "Clientes faturados no período",
    "Pedidos faturados",
    "Faturamento (R$)",
    "Comissão (R$)",
  ];
  const per = `${periodo.de} a ${periodo.ate}`;
  const linhas = d.linhas.map((l) => [
    per,
    l.nome,
    l.ativo ? "Ativo" : "Inativo",
    l.ufsPrincipais.join(", "),
    l.ufsSecundarias.join(", "),
    formatarBps(l.comissaoBps),
    l.clientes,
    l.clientesManuais,
    l.clientesFaturados,
    l.pedidos,
    decimal(l.faturamento),
    decimal(l.comissao),
  ]);
  const s = d.semRepresentante;
  linhas.push([
    per,
    "Sem representante",
    "",
    "",
    "",
    "",
    s.clientes,
    "",
    s.clientesFaturados,
    s.pedidos,
    decimal(s.faturamento),
    "",
  ]);
  linhas.push([
    per,
    "Total",
    "",
    "",
    "",
    "",
    d.total.clientes,
    "",
    "",
    d.total.pedidos,
    decimal(d.total.faturamento),
    decimal(d.total.comissao),
  ]);
  return "\uFEFF" + [cab, ...linhas].map((r) => r.map(celula).join(";")).join("\r\n");
}

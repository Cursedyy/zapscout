import type { UnidadeInput } from "./mimo-carteira";
import { unidadeSchema } from "./mimo-carteira";

export function cnpjValido(valor: string) {
  if (!/^\d{14}$/.test(valor) || /^(\d)\1+$/.test(valor)) return false;
  const digito = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (const d of base) {
      soma += Number(d) * peso--;
      if (peso === 1) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return (
    digito(valor.slice(0, 12)) === Number(valor[12]) &&
    digito(valor.slice(0, 13)) === Number(valor[13])
  );
}

export const CAMPOS_IMPORTACAO = {
  nome: "Nome da unidade",
  razao: "Razão social",
  cnpj: "CNPJ",
  rede: "Rede confirmada",
  grupo: "Grupo econômico",
  canal: "Canal",
  classe: "Classe A/B/C",
  cidade: "Cidade",
  uf: "UF",
  instagram: "Instagram",
  proprietario: "Proprietário",
  telefone_proprietario: "Telefone do proprietário",
  whatsapp_proprietario: "WhatsApp do proprietário",
  email_proprietario: "E-mail do proprietário",
  comprador: "Comprador",
  telefone_comprador: "Telefone do comprador",
  whatsapp_comprador: "WhatsApp do comprador",
  email_comprador: "E-mail do comprador",
} as const;
export type Mapeamento = Record<keyof typeof CAMPOS_IMPORTACAO, string>;
const PADRAO: Mapeamento = {
  nome: "Franquia",
  razao: "Razão Social",
  cnpj: "CNPJ",
  rede: "",
  grupo: "Grupo Econômico",
  canal: "Canal",
  classe: "Prioridade",
  cidade: "Cidade",
  uf: "Estado",
  instagram: "Instagram",
  proprietario: "Proprietário",
  telefone_proprietario: "Telefone — Proprietário",
  whatsapp_proprietario: "WhatsApp — Proprietário",
  email_proprietario: "E-mail — Proprietário",
  comprador: "Comprador",
  telefone_comprador: "Telefone — Comprador",
  whatsapp_comprador: "WhatsApp — Comprador",
  email_comprador: "E-mail — Comprador",
};
export function mapeamentoInicial(cabecalhos: string[]): Mapeamento {
  return Object.fromEntries(
    Object.entries(PADRAO).map(([k, v]) => [k, cabecalhos.includes(v) ? v : ""]),
  ) as Mapeamento;
}
export type ContatoImportacao = {
  nome: string;
  telefone: string;
  whatsapp: string;
  email: string;
  papel: "Proprietário" | "Comprador" | "Outro";
};
export type LinhaCarteira = {
  linha: number;
  unidade: UnidadeInput;
  contatos: ContatoImportacao[];
  originais: Record<string, string>;
  problemas: string[];
  redeSugerida: string;
};
const texto = (v: unknown) => (v == null ? "" : String(v).trim());
const limpar = (v: unknown) => {
  const s = texto(v);
  return !s || /^-+$/.test(s) || s.toLowerCase() === "não informado" ? "" : s;
};
export function cabecalhoCarteira(rows: unknown[][]) {
  const index = rows.findIndex(
    (r) =>
      r.filter((c) => texto(c)).length >= 2 &&
      r.some((c) => ["CNPJ", "Razão Social", "Franquia", "Unidade"].includes(texto(c))),
  );
  if (index < 0) throw Error("Cabeçalhos de unidades não encontrados.");
  return { index, nomes: rows[index].map(texto) };
}
const REDES: Record<string, string> = {
  "BIO MUNDO": "Bio Mundo",
  "FIT LAND": "Fitland",
  FITLAND: "Fitland",
  "CIA DA SAÚDE": "Cia da Saúde",
  "CIA DA SAUDE": "Cia da Saúde",
  "DIVINA TERRA": "Divina Terra",
};
/** Prévia pura: nomes semelhantes não são fundidos nem classificados automaticamente. */
export function prepararBaseCarteira(rows: unknown[][], mapeamento?: Mapeamento): LinhaCarteira[] {
  const header = cabecalhoCarteira(rows);
  const nomes = header.nomes;
  const m = mapeamento ?? mapeamentoInicial(nomes);
  const vistas = new Set<string>();
  const resultado: LinhaCarteira[] = [];
  rows.slice(header.index + 1).forEach((r, i) => {
    const raw = Object.fromEntries(
      nomes.filter(Boolean).map((n) => [n, texto(r[nomes.indexOf(n)])]),
    );
    const valor = (k: keyof Mapeamento) => limpar(raw[m[k]]);
    const razao = valor("razao"),
      nome = valor("nome") || razao;
    if (!nome) return;
    const problemas: string[] = [];
    let cnpj = valor("cnpj").replace(/\D/g, "");
    if (cnpj && cnpj.length < 14) {
      const padded = cnpj.padStart(14, "0");
      if (cnpjValido(padded)) cnpj = padded;
    }
    if (cnpj && !cnpjValido(cnpj))
      problemas.push("CNPJ inválido: corrija ou remova o CNPJ explicitamente.");
    if (cnpj && vistas.has(cnpj)) problemas.push("CNPJ repetido: revisar antes de selecionar.");
    if (cnpj) vistas.add(cnpj);
    const prioridade = valor("classe").toUpperCase();
    if (prioridade && !["A", "B", "C"].includes(prioridade)) problemas.push("Classe desconhecida.");
    const parsed = unidadeSchema.safeParse({
      nome,
      razao_social: razao,
      cnpj,
      rede: valor("rede"),
      grupo: valor("grupo"),
      canal: valor("canal"),
      cidade: valor("cidade"),
      uf: valor("uf").toUpperCase(),
      instagram: valor("instagram"),
      classe: ["A", "B", "C"].includes(prioridade) ? prioridade : "",
    });
    if (!parsed.success) problemas.push(parsed.error.issues.map((e) => e.message).join("; "));
    const contatos: ContatoImportacao[] = [];
    for (const papel of ["proprietario", "comprador"] as const) {
      const c = {
        nome: valor(papel),
        telefone: valor(`telefone_${papel}`),
        whatsapp: valor(`whatsapp_${papel}`),
        email: valor(`email_${papel}`),
        papel: papel === "proprietario" ? ("Proprietário" as const) : ("Comprador" as const),
      };
      if (c.nome || c.telefone || c.whatsapp || c.email) contatos.push(c);
    }
    resultado.push({
      linha: header.index + i + 2,
      unidade: parsed.success
        ? parsed.data
        : unidadeSchema.parse({
            nome: nome.length >= 2 ? nome.slice(0, 200) : "Revisar unidade",
            cnpj,
          }),
      contatos,
      originais: raw,
      problemas,
      redeSugerida: REDES[nome.toUpperCase()] ?? "",
    });
  });
  if (resultado.length > 10000) throw Error("Limite de 10 mil unidades por arquivo.");
  return resultado;
}
export function lerCsvCarteira(text: string) {
  const delimitador =
    text.split(/\r?\n/, 1)[0].split(";").length > text.split(/\r?\n/, 1)[0].split(",").length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    campo = "",
    aspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (aspas && text[i + 1] === '"') {
        campo += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === delimitador && !aspas) {
      row.push(campo);
      campo = "";
    } else if (c === "\n" && !aspas) {
      row.push(campo.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      campo = "";
    } else campo += c;
  }
  if (aspas) throw Error("CSV com aspas não fechadas.");
  if (campo || row.length) {
    row.push(campo.replace(/\r$/, ""));
    rows.push(row);
  }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
export async function hashCarteira(bytes: BufferSource) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function lerBaseExcelCarteira(file: File) {
  const { default: read } = await import("read-excel-file");
  return prepararBaseCarteira(await read(file, { sheet: "Base Potencial" }));
}

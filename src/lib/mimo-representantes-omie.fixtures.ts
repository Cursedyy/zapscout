import type {
  RepresentanteComercial,
  TerritorioRepresentante,
} from "./mimo-representantes-comerciais";

// Dados 100% sintéticos (nomes, CNPJs e códigos inventados); nunca dados reais do Omie.

export const PERIODO_OMIE = { de: "2026-11-01", ate: "2026-11-27" };

export const R_SUL = "10000000-0000-4000-8000-0000000000a1";
export const R_SEC = "10000000-0000-4000-8000-0000000000a2";
export const R_SP = "10000000-0000-4000-8000-0000000000a3";
export const R_INATIVO = "10000000-0000-4000-8000-0000000000a4";
export const U_MANUAL = "30000000-0000-4000-8000-000000000001";
export const U_PR = "30000000-0000-4000-8000-000000000002";
export const U_SEM_UF = "30000000-0000-4000-8000-000000000003";

export const repSintetico = (
  id: string,
  nome: string,
  comissao_bps: number,
  ativo = true,
): RepresentanteComercial => ({
  id,
  empresa_id: "e",
  nome,
  chave: nome.toLowerCase(),
  ativo,
  comissao_bps,
  telefone: "",
  email: "",
  observacoes: "",
  versao: 1,
  criado_por: "u",
  atualizado_por: "u",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});
export const terSintetico = (
  uf: string,
  representante_id: string,
  principal: boolean,
): TerritorioRepresentante => ({
  empresa_id: "e",
  uf,
  representante_id,
  principal,
  regiao: "",
  estado: "",
  updated_at: "",
});

/** PR: principal R_SUL, secundário R_SEC. SP: R_SP. RJ: principal inativo. */
export const baseSintetica = () => ({
  representantes: [
    repSintetico(R_SUL, "Rep Sintético Sul", 500),
    repSintetico(R_SEC, "Rep Sintético Secundário", 350),
    repSintetico(R_SP, "Rep Sintético SP", 425),
    repSintetico(R_INATIVO, "Rep Sintético Inativo", 300, false),
  ],
  territorios: [
    terSintetico("PR", R_SUL, true),
    terSintetico("PR", R_SEC, false),
    terSintetico("SP", R_SP, true),
    terSintetico("RJ", R_INATIVO, true),
  ],
  // Unidade U_MANUAL (UF PR) atribuída manualmente ao secundário.
  clientes: [{ unidade_id: U_MANUAL, representante_id: R_SEC }],
  unidades: [
    { id: U_MANUAL, uf: "PR" },
    { id: U_PR, uf: "PR" },
    { id: U_SEM_UF, uf: "" },
  ],
  unidadesManuais: [{ unidade_id: U_MANUAL, cnpj: "11.222.333/0001-81" }],
});

/** Uma `nfCadastro` sintética no formato do ListarNF (resumo). */
export function notaSintetica(p: {
  id: number;
  cliente: number;
  valor: number | string;
  emissao?: string;
  doc?: string;
  tpNF?: string;
  finNFe?: string;
  dCan?: string;
  cDeneg?: string;
  dInut?: string;
  tpAmb?: string;
}) {
  return {
    compl: { nIdNF: p.id, nIdPedido: 0, cChaveNFe: "" },
    ide: {
      nNF: String(1000 + p.id),
      serie: "1",
      dEmi: p.emissao ?? "10/11/2026",
      hEmi: "10:00:00",
      tpNF: p.tpNF ?? "1",
      finNFe: p.finNFe ?? "1",
      tpAmb: p.tpAmb ?? "1",
      dCan: p.dCan ?? "",
      dInut: p.dInut ?? "",
      cDeneg: p.cDeneg ?? "N",
      mod: "55",
    },
    nfDestInt: {
      nCodCli: p.cliente,
      cCodCliInt: "",
      cRazao: "Cliente Sintético",
      cnpj_cpf: p.doc ?? "",
    },
    total: { ICMSTot: { vNF: p.valor, vProd: p.valor } },
    info: { dInc: "10/11/2026" },
  };
}

/** Cadastro sintético de cliente (ListarClientes/ConsultarCliente). */
export const clienteSintetico = (codigo: number, estado: string, cnpj_cpf = "") => ({
  codigo_cliente_omie: codigo,
  razao_social: `Cliente Sintético ${codigo} Ltda`,
  cnpj_cpf,
  estado,
});

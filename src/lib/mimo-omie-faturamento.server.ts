import { z } from "zod";
import { codigoOmieSchema } from "./mimo-omie";
import { montarInclusaoPedidoOmie } from "./mimo-omie-faturamento";

const credenciaisSchema = z.object({
  OMIE_TESTE_APP_KEY: z.string().trim().min(1),
  OMIE_TESTE_APP_SECRET: z.string().trim().min(1),
});

export function configurarOmieTeste(env = process.env) {
  const resultado = credenciaisSchema.safeParse(env);
  return resultado.success && resultado.data.OMIE_TESTE_APP_KEY !== env.OMIE_APP_KEY?.trim()
    ? resultado.data
    : null;
}

type CredenciaisTeste = NonNullable<ReturnType<typeof configurarOmieTeste>>;
const baseApi = "https://app.omie.com.br/api/v1/produtos/";
const fetchOmie: typeof fetch = (...args) => globalThis.fetch(...args);

export async function listarReferenciasOmieTeste(credenciais: CredenciaisTeste, fetcher = fetchOmie) {
  const linhaSchema = z.object({
    cabecalho: z.object({ codigo_pedido: codigoOmieSchema, numero_pedido: z.string() }),
    det: z.array(z.object({ produto: z.object({ descricao: z.string().nullish() }) })),
    infoCadastro: z.object({ cancelado: z.string().optional() }).optional(),
  });
  let resposta: Response;
  try {
    resposta = await fetcher(`${baseApi}pedido/`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarPedidos",
        app_key: credenciais.OMIE_TESTE_APP_KEY,
        app_secret: credenciais.OMIE_TESTE_APP_SECRET,
        param: [{ pagina: 1, registros_por_pagina: 100, apenas_importado_api: "N" }],
      }),
    });
  } catch {
    throw Error(
      "O servidor não conseguiu se comunicar com o Omie de teste. Tente novamente em instantes.",
    );
  }
  const bruto: unknown = await resposta.json().catch(() => undefined);
  const envelope = z
    .object({
      faultcode: z.string().optional(),
      faultstring: z.string().optional(),
      pedido_venda_produto: z.array(z.unknown()).nullish(),
      total_de_registros: z.number().int().optional(),
    })
    .safeParse(bruto);
  const falha = envelope.success ? (envelope.data.faultstring ?? "") : "";
  if (
    resposta.status === 401 ||
    resposta.status === 403 ||
    /app[_ -]?(key|secret)|credencia|n[aã]o autoriza|acesso negado|bloqueado|expirado|inativo/i.test(
      falha,
    )
  ) {
    throw Error(
      "O Omie recusou o acesso ao aplicativo de teste. Confira se ele está ativo e se os segredos vieram desse aplicativo.",
    );
  }
  if (
    resposta.status === 429 ||
    /too many requests|consumo indevido|limite de requisi/i.test(falha)
  ) {
    throw Error("O Omie limitou as consultas. Aguarde um minuto e tente novamente.");
  }
  if (/n[aã]o existem registros.*p[aá]gina|nenhum registro encontrado/i.test(falha)) return [];
  if (!resposta.ok || (envelope.success && (envelope.data.faultcode || falha))) {
    throw Error(`O Omie recusou a consulta de pedidos de teste (HTTP ${resposta.status}).`);
  }
  if (
    !envelope.success ||
    (!envelope.data.pedido_venda_produto && envelope.data.total_de_registros !== 0)
  ) {
    throw Error("O Omie retornou um formato inesperado na lista de pedidos de teste.");
  }
  const registros = envelope.data.pedido_venda_produto ?? [];
  const pedidos = registros.flatMap((registro) => {
    const linha = linhaSchema.safeParse(registro);
    return linha.success ? [linha.data] : [];
  });
  if (registros.length && !pedidos.length)
    throw Error("O Omie retornou pedidos de teste sem os campos necessários para listagem.");
  return pedidos
    .filter((pedido) => pedido.det.length === 1 && pedido.infoCadastro?.cancelado !== "S")
    .map(({ cabecalho, det }) => ({
      id: cabecalho.codigo_pedido,
      numero: cabecalho.numero_pedido,
      produto: det[0]?.produto.descricao ?? "Produto de demonstração",
    }));
}

async function enviarAoOmie<T>(
  credenciais: CredenciaisTeste,
  endpoint: "pedido/" | "pedidovendafat/",
  operacao: "IncluirPedido" | "FaturarPedidoVenda",
  parametro: object,
  respostaSchema: z.ZodType<T>,
  fetcher: typeof fetch,
): Promise<T> {
  try {
    const resposta = await fetcher(`${baseApi}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        call: operacao,
        app_key: credenciais.OMIE_TESTE_APP_KEY,
        app_secret: credenciais.OMIE_TESTE_APP_SECRET,
        param: [parametro],
      }),
    });
    if (!resposta.ok) throw Error("Resposta HTTP inválida.");
    return respostaSchema.parse(await resposta.json());
  } catch {
    throw Error("Operação sem confirmação no Omie. Consulte o pedido antes de tentar novamente.");
  }
}

export async function incluirPedidoOmieTeste(
  credenciais: CredenciaisTeste,
  dados: Parameters<typeof montarInclusaoPedidoOmie>,
  fetcher = fetchOmie,
) {
  const pedido = montarInclusaoPedidoOmie(...dados);
  const resposta = z.object({
    codigo_status: z.literal("0"),
    codigo_pedido: codigoOmieSchema,
    codigo_pedido_integracao: z.literal(pedido.cabecalho.codigo_pedido_integracao),
  });
  return enviarAoOmie(credenciais, "pedido/", "IncluirPedido", pedido, resposta, fetcher);
}

export async function solicitarFaturamentoOmieTeste(
  credenciais: CredenciaisTeste,
  codigoPedido: number,
  fetcher = fetchOmie,
) {
  const codigo = codigoOmieSchema.parse(codigoPedido);
  const resposta = z.object({ cCodStatus: z.literal("0"), nCodPed: z.literal(codigo) });
  return enviarAoOmie(
    credenciais,
    "pedidovendafat/",
    "FaturarPedidoVenda",
    { nCodPed: codigo },
    resposta,
    fetcher,
  );
}

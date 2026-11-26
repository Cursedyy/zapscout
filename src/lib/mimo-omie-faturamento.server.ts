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

export async function listarReferenciasOmieTeste(
  credenciais: CredenciaisTeste,
  fetcher = fetchOmie,
) {
  const linhaSchema = z.object({
    cabecalho: z.object({ codigo_pedido: codigoOmieSchema, numero_pedido: z.string() }),
    det: z.array(
      z.object({
        produto: z.object({ descricao: z.string().nullish(), codigo_produto: z.unknown() }),
      }),
    ),
    infoCadastro: z.object({ cancelado: z.string().optional() }).optional(),
  });
  let resposta: Response;
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), 25000);
  try {
    resposta = await fetcher(`${baseApi}pedido/`, {
      method: "POST",
      redirect: "manual",
      signal: controlador.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarPedidos",
        app_key: credenciais.OMIE_TESTE_APP_KEY,
        app_secret: credenciais.OMIE_TESTE_APP_SECRET,
        param: [{ pagina: 1, registros_por_pagina: 100, apenas_importado_api: "N" }],
      }),
    });
  } catch (erro) {
    if (controlador.signal.aborted)
      throw Error("O Omie de teste não respondeu em 25 segundos (OMIE-TIMEOUT).");
    const mensagem = erro instanceof Error ? erro.message : "";
    const codigo = /tls|certificate|certificado|ssl/i.test(mensagem)
      ? "OMIE-TLS"
      : /dns|resolve host|enotfound/i.test(mensagem)
        ? "OMIE-DNS"
        : /illegal invocation/i.test(mensagem)
          ? "OMIE-RUNTIME"
          : "OMIE-REDE";
    console.error("[omie-teste] Falha na consulta", { codigo });
    throw Error(`A conexão do ZapScout com o Omie de teste falhou (${codigo}).`);
  } finally {
    clearTimeout(prazo);
  }
  if (resposta.status >= 300 && resposta.status < 400) {
    throw Error(`O Omie redirecionou a consulta (OMIE-REDIRECT-${resposta.status}).`);
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
    .filter((pedido) => pedido.infoCadastro?.cancelado !== "S")
    .map(({ cabecalho, det }) => ({
      id: cabecalho.codigo_pedido,
      numero: cabecalho.numero_pedido,
      produtos: [
        ...new Map(
          det.flatMap(({ produto }) => {
            const codigo = codigoOmieSchema.safeParse(Number(produto.codigo_produto));
            return codigo.success
              ? [
                  [
                    codigo.data,
                    { codigo: codigo.data, nome: produto.descricao || "Produto de demonstração" },
                  ] as const,
                ]
              : [];
          }),
        ).values(),
      ],
    }))
    .filter((pedido) => pedido.produtos.length > 0);
}

async function enviarAoOmie<T>(
  credenciais: CredenciaisTeste,
  endpoint: "pedido/" | "pedidovendafat/",
  operacao: "ConsultarPedido" | "IncluirPedido" | "FaturarPedidoVenda",
  parametro: object,
  respostaSchema: z.ZodType<T>,
  fetcher: typeof fetch,
): Promise<T> {
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), 25000);
  try {
    const resposta = await fetcher(`${baseApi}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "manual",
      signal: controlador.signal,
      body: JSON.stringify({
        call: operacao,
        app_key: credenciais.OMIE_TESTE_APP_KEY,
        app_secret: credenciais.OMIE_TESTE_APP_SECRET,
        param: [parametro],
      }),
    });
    if (!resposta.ok) throw Error("Resposta HTTP inválida.");
    const bruto = await resposta.json();
    if (bruto?.faultcode || bruto?.faultstring) throw Error("Operação recusada.");
    return respostaSchema.parse(bruto);
  } catch {
    if (operacao === "ConsultarPedido")
      throw Error("Não foi possível ler os campos do pedido no Omie de teste.");
    throw Error("Operação sem confirmação no Omie. Consulte o pedido antes de tentar novamente.");
  } finally {
    clearTimeout(prazo);
  }
}

export async function consultarPedidoFaturamentoOmieTeste(
  credenciais: CredenciaisTeste,
  codigo: number,
  fetcher = fetchOmie,
) {
  const id = codigoOmieSchema.parse(codigo);
  const pedido = z
    .object({
      cabecalho: z.object({ codigo_pedido: z.literal(id) }).passthrough(),
      infoCadastro: z.object({ faturado: z.enum(["S", "N"]), cancelado: z.enum(["S", "N"]) }),
      det: z
        .array(
          z.object({
            ide: z.object({ codigo_item_integracao: z.string().optional() }).optional(),
            produto: z.object({}).passthrough(),
          }),
        )
        .min(1),
    })
    .passthrough();
  const retorno = z.union([
    z.object({ pedido_venda_produto: pedido }).transform((r) => r.pedido_venda_produto),
    pedido,
  ]);
  return enviarAoOmie(
    credenciais,
    "pedido/",
    "ConsultarPedido",
    { codigo_pedido: id },
    retorno,
    fetcher,
  );
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

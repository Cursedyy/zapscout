/** Public bounded health probe: never sends credentials or accepts a destination from the caller. */
const codigos = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);
export async function sondarTransporteUazapi(fetcher = fetch, valor = process.env.UAZAPI_BASE_URL) {
  let url: URL;
  try {
    url = new URL(valor?.trim() ?? "");
  } catch {
    return { configuracaoValida: false };
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".uazapi.com") || url.port)
    return { configuracaoValida: false };
  const formato = {
    configuracaoValida: true,
    temCredenciaisNaUrl: !!(url.username || url.password),
    temCaminho: url.pathname !== "/",
    temParametros: !!(url.search || url.hash),
  };
  try {
    const r = await fetcher(url.origin + "/instance/status", {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return { ...formato, httpStatus: r.status };
  } catch (error) {
    const e = error as { name?: string; cause?: { code?: string } };
    return {
      ...formato,
      erro: ["TypeError", "AbortError", "TimeoutError"].includes(e?.name ?? "") ? e.name : "Error",
      codigo: codigos.has(e?.cause?.code ?? "") ? e.cause!.code : "indisponivel",
    };
  }
}
let cache: { expira: number; promise: ReturnType<typeof sondarTransporteUazapi> } | null = null;
export async function saudeTransporteUazapi() {
  if (!cache || cache.expira < Date.now())
    cache = { expira: Date.now() + 60000, promise: sondarTransporteUazapi() };
  return Response.json(await cache.promise, { headers: { "Cache-Control": "public, max-age=60" } });
}

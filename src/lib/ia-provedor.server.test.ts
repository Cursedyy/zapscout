import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chamarChatIA, configurarProvedorIA, gerarChatIA, schemaParaClaude } from "./ia-provedor.server";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  for (const key of ["IA_PROVIDER", "IA_MODEL", "IA_MODEL_AGENTE", "IA_MODEL_SCORE", "IA_BASE_URL", "IA_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "LOVABLE_API_KEY"]) vi.stubEnv(key, "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const messages = [{ role: "system" as const, content: "Instrução sintética" }, { role: "user" as const, content: "Olá" }];
const openaiResponse = (content = "Resposta sintética") => Response.json({ choices: [{ message: { content } }] });
const claudeResponse = (stop_reason = "end_turn", text = "Resposta sintética") => Response.json({ stop_reason, content: [{ type: "text", text }], usage: { input_tokens: 4, output_tokens: 6 } });

describe("configuração por servidor e ausência de fallback entre contas", () => {
  it("mantém compatibilidade com o ambiente legado quando não selecionado outro provedor", () => {
    expect(configurarProvedorIA("conversa", "modelo-legado", { LOVABLE_API_KEY: "sintetica" })).toMatchObject({ provider: "lovable", model: "modelo-legado" });
  });
  it.each(["gemini", "anthropic", "openai-compatible"])("%s sem sua própria chave recusa mesmo com chave Lovable disponível", async (provider) => {
    vi.stubEnv("IA_PROVIDER", provider); vi.stubEnv("LOVABLE_API_KEY", "legada-nao-usar"); vi.stubEnv("IA_MODEL", "modelo-sintetico");
    await expect(chamarChatIA(messages)).rejects.toMatchObject({ codigo: "ia_sem_credencial" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("exige escolha de modelo no provedor direto", () => {
    expect(() => configurarProvedorIA("agente", undefined, { IA_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sintetica" })).toThrow("modelo");
  });
  it("permite modelo por finalidade sem enviar nomes de modelo do antigo gateway", () => {
    expect(configurarProvedorIA("agente", "google/antigo", { IA_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sintetica", IA_MODEL: "geral", IA_MODEL_AGENTE: "agente" })).toMatchObject({ model: "agente", baseURL: "https://api.anthropic.com/v1" });
  });
  it.each(["http://api.example/v1", "https://user:pass@api.example/v1", "https://api.example/v1?key=secret", "https://api.example/v1#fragment", "https://ai.gateway.lovable.dev/v1"])("recusa endpoint inseguro ou Lovable em modo próprio: %s", (url) => {
    expect(() => configurarProvedorIA("conversa", undefined, { IA_PROVIDER: "openai-compatible", IA_API_KEY: "sintetica", IA_MODEL: "teste", IA_BASE_URL: url })).toThrow();
  });
});

describe("contrato HTTP e saídas seguras", () => {
  it("Gemini envia só a chave própria e o modelo configurado, com prazo e redirecionamentos bloqueados", async () => {
    vi.stubEnv("IA_PROVIDER", "gemini"); vi.stubEnv("GEMINI_API_KEY", "google-sintetica"); vi.stubEnv("IA_MODEL", "modelo-sintetico");
    fetchMock.mockResolvedValue(openaiResponse());
    expect(await chamarChatIA(messages)).toBe("Resposta sintética");
    const [url, req] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(req.headers.Authorization).toBe("Bearer google-sintetica");
    expect(JSON.parse(req.body)).toEqual({ model: "modelo-sintetico", messages });
    expect(req.signal).toBeInstanceOf(AbortSignal); expect(req.redirect).toBe("error"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("Claude usa a API nativa, preserva imagem privada temporária e métricas sem executar ferramentas", async () => {
    vi.stubEnv("IA_PROVIDER", "anthropic"); vi.stubEnv("ANTHROPIC_API_KEY", "claude-sintetica"); vi.stubEnv("IA_MODEL", "modelo-sintetico");
    fetchMock.mockResolvedValue(claudeResponse());
    const result = await gerarChatIA([...messages, { role: "user", content: [{ type: "image_url", image_url: { url: "https://storage.example/synthetic?token=synthetic" } }] }], "campanhas", undefined, { type: "object", properties: { resposta: { type: "string", maxLength: 800 } } });
    expect(result).toEqual({ texto: "Resposta sintética", tokensEntrada: 4, tokensSaida: 6 });
    const [url, req] = fetchMock.mock.calls[0]; const body = JSON.parse(req.body);
    expect(url).toBe("https://api.anthropic.com/v1/messages"); expect(req.headers["x-api-key"]).toBe("claude-sintetica"); expect(req.headers.Authorization).toBeUndefined();
    expect(body.system).toBe("Instrução sintética"); expect(body.messages[1].content[0]).toEqual({ type: "image", source: { type: "url", url: "https://storage.example/synthetic?token=synthetic" } });
    expect(body.output_config.format.schema.properties.resposta).toEqual({ type: "string" }); expect(body.tools).toBeUndefined(); expect(body.max_tokens).toBe(2048);
  });
  it.each(["max_tokens", "refusal", "tool_use"])("Claude recusa resultado com término %s sem repetir", async stop => {
    vi.stubEnv("IA_PROVIDER", "anthropic"); vi.stubEnv("ANTHROPIC_API_KEY", "sintetica"); vi.stubEnv("IA_MODEL", "modelo-sintetico");
    fetchMock.mockResolvedValue(claudeResponse(stop));
    await expect(chamarChatIA(messages)).rejects.toMatchObject({ codigo: "ia_resposta_invalida" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([[401,"ia_acesso_negado"],[402,"ia_creditos_esgotados"],[403,"ia_acesso_negado"],[404,"ia_modelo_indisponivel"],[429,"ia_limite_uso"],[500,"ia_indisponivel"]])("HTTP %s não expõe o corpo nem repete a chamada", async (status, codigo) => {
    vi.stubEnv("LOVABLE_API_KEY", "sintetica");
    fetchMock.mockResolvedValue(new Response("token=privado; conteudo confidencial", { status: Number(status) }));
    try { await chamarChatIA(messages); throw Error("Não deveria concluir"); } catch (error) { expect(error).toMatchObject({ codigo }); expect(String(error)).not.toMatch(/privado|confidencial/); }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["", null, { invalido: true }])("recusa conteúdo ausente ou fora do tipo: %s", async content => {
    vi.stubEnv("LOVABLE_API_KEY", "sintetica"); fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
    await expect(chamarChatIA(messages)).rejects.toMatchObject({ codigo: "ia_resposta_invalida" });
  });
  it("falha de rede não gera nova requisição", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "sintetica"); fetchMock.mockRejectedValue(new DOMException("Prazo", "TimeoutError"));
    await expect(chamarChatIA(messages)).rejects.toThrow(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("normaliza schema sem alterar o original nem remover campos chamados como keywords", () => {
    const original = { type: "object", properties: { minimum: { type: "string", minLength: 1 } } };
    expect(schemaParaClaude(original)).toEqual({ type: "object", properties: { minimum: { type: "string" } }, additionalProperties: false });
    expect(original.properties.minimum.minLength).toBe(1);
  });
});

import { afterEach, expect, it, vi } from "vitest";
import { configInicialAgente } from "./mimo-agente";
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("envia os bytes da foto na mesma mensagem da legenda e exige evidência textual", async () => {
  vi.stubEnv("GEMINI_API_KEY", "chave-sintetica");
  const resposta = "Na foto aparece uma embalagem. O que você gostaria de saber sobre ela?";
  const content = JSON.stringify({ resposta, dados: { nome: { valor: "Ana", evidencia: "Sou Ana" } }, encaminhar: false });
  const fetcher = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: content }] } }] }));
  vi.stubGlobal("fetch", fetcher);
  const r = await gerarRespostaAgente(configInicialAgente, [{
    role: "user", content: "Oi",
    imagem: { mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71) },
  }], {});
  expect(r).toMatchObject({ resposta, dados: {}, estado: "agente" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).contents[0]).toEqual({
    role: "user",
    content: [
      { text: "Oi" },
      { inlineData: { mimeType: "image/png", data: "iVBORw==" } },
    ],
  });
});

it("protege o corpo de erro quando a requisição inclui imagem", async () => {
  vi.stubEnv("GEMINI_API_KEY", "chave-sintetica");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { message: "imagem e texto privados" } }, { status: 400 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(gerarRespostaAgente(configInicialAgente, [{
    role: "user", content: "Consegue identificar?",
    imagem: { mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71) },
  }], {})).rejects.toThrow(/^Erro IA \(400\) ao analisar imagem\.$/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

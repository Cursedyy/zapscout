import { afterEach, expect, it, vi } from "vitest";
import { configInicialAgente } from "./mimo-agente";
import { gerarRespostaAgente } from "./mimo-agente-modelo.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("envia os bytes da foto na mesma mensagem da legenda e exige evidência textual", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "chave-sintetica");
  const resposta = "Na foto aparece uma embalagem. O que você gostaria de saber sobre ela?";
  const content = JSON.stringify({ resposta, dados: { nome: { valor: "Ana", evidencia: "Sou Ana" } }, encaminhar: false });
  const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
  vi.stubGlobal("fetch", fetcher);
  const r = await gerarRespostaAgente(configInicialAgente, [{
    role: "user", content: "Oi",
    imagem: { mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71) },
  }], {});
  expect(r).toMatchObject({ resposta, dados: {}, estado: "agente" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1]).toEqual({
    role: "user",
    content: [
      { type: "text", text: "Oi" },
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw==" } },
    ],
  });
});

it("protege o corpo de erro quando a requisição inclui imagem", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "chave-sintetica");
  const fetcher = vi.fn().mockResolvedValue(new Response("imagem e texto privados", { status: 400 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(gerarRespostaAgente(configInicialAgente, [{
    role: "user", content: "Consegue identificar?",
    imagem: { mime: "image/png", bytes: Uint8Array.of(137, 80, 78, 71) },
  }], {})).rejects.toThrow(/^Erro IA \(400\) ao analisar imagem\.$/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

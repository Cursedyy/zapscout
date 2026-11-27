import { expect, it, vi } from "vitest";
import { receberDesenhoMimo } from "./mimo-campanha-desenhos.server";
import { LIMITE_DESENHO } from "./mimo-campanha-desenhos";

const empresa = "10000000-0000-4000-8000-000000000001";
const envio = "20000000-0000-4000-8000-000000000001";
const origem = "https://zapscout.example";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0]);
const mp4 = new Uint8Array([0, 0, 0, 16, ...new TextEncoder().encode("ftypisom"), 0, 0, 0, 0]);

function request(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(`${origem}/api/public/mimo-campanha-desenhos`, {
    method: "POST",
    headers: {
      origin: origem,
      "x-envio-id": envio,
      "x-instagram": "@Perfil.MiMo",
      "content-type": "image/png",
      ...headers,
    },
    body,
  });
}

it.each([
  [png, "image/png", "png"],
  [mp4, "video/mp4", "mp4"],
] as const)("persiste o arquivo %s antes de confirmar o envio", async (corpo, mime, extensao) => {
  const rpc = vi.fn().mockResolvedValue({ data: { empresa, estado: "reservado" } });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: () => filtro });
  const filtro = {
    eq: () => filtro,
    is: () => filtro,
    select: () => filtro,
    maybeSingle: () => ({ data: { id: envio } }),
  };
  const db = { rpc, storage: { from: () => ({ upload }) }, from: () => ({ update }) };
  const resultado = await receberDesenhoMimo(request(corpo, { "content-type": mime }), db as never);
  expect(resultado.status).toBe(201);
  expect(rpc).toHaveBeenCalledWith(
    "mimo_reservar_desenho",
    expect.objectContaining({
      p_instagram: "perfil.mimo",
      p_id: envio,
      p_mime: mime,
      p_tamanho: corpo.length,
    }),
  );
  expect(upload).toHaveBeenCalledWith(
    expect.stringMatching(new RegExp(`^${empresa}/${envio}/[0-9a-f]{64}\\.${extensao}$`)),
    corpo,
    { contentType: mime, upsert: false },
  );
  expect(upload.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
});

it("rejeita origem externa, falsa imagem e arquivos acima do limite sem persistir", async () => {
  const rpc = vi.fn();
  const db = { rpc };
  expect(
    (await receberDesenhoMimo(request(png, { origin: "https://outro.example" }), db as never))
      .status,
  ).toBe(403);
  expect(
    (await receberDesenhoMimo(request("<html>arquivo falso</html>"), db as never)).status,
  ).toBe(415);
  expect(
    (
      await receberDesenhoMimo(
        request(png, { "content-length": String(LIMITE_DESENHO + 1) }),
        db as never,
      )
    ).status,
  ).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});

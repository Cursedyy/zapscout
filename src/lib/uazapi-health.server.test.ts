import { it, expect, vi } from "vitest";
import { sondarTransporteUazapi } from "./uazapi-health.server";
it("sondagem não transmite credenciais e ignora caminho/query secretos", async () => {
  const f = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
  const r = await sondarTransporteUazapi(
    f,
    "https://usuario:privado@servidor.uazapi.com/token-no-caminho?secret=valor",
  );
  expect(r).toMatchObject({
    httpStatus: 401,
    temCredenciaisNaUrl: true,
    temCaminho: true,
    temParametros: true,
  });
  expect(f.mock.calls[0][0]).toBe("https://servidor.uazapi.com/instance/status");
  expect(f.mock.calls[0][1].headers).toEqual({ Accept: "application/json" });
  expect(JSON.stringify(r)).not.toMatch(/privado|token-no-caminho|secret|valor/);
});
it("não aceita destino fora do provedor", async () => {
  const f = vi.fn();
  for (const url of [
    "http://servidor.uazapi.com",
    "https://evil.example.invalid",
    "https://servidor.uazapi.com:8443",
  ])
    expect(await sondarTransporteUazapi(f, url)).toEqual({ configuracaoValida: false });
  expect(f).not.toHaveBeenCalled();
});
it("retorna só código de rede conhecido sem corpo ou erro sensível", async () => {
  const f = vi
    .fn()
    .mockRejectedValue(
      Object.assign(new TypeError("segredo"), { cause: { code: "CERT_HAS_EXPIRED" } }),
    );
  expect(await sondarTransporteUazapi(f, "https://servidor.uazapi.com")).toMatchObject({
    codigo: "CERT_HAS_EXPIRED",
  });
});

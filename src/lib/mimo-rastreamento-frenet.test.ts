import { expect, it, vi } from "vitest";
import { consultarEventosFrenet } from "./mimo-frenet-rastreamento.server";

it("usa HTTPS e devolve as movimentações sem expor a credencial ou o payload bruto", async () => {
  const enviar = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      TrackingNumber: "AB123BR",
      TrackingEvents: [
        {
          EventDateTime: "25/11/2026 14:00",
          EventDescription: "Objeto postado",
          EventLocation: "Pelotas",
          Extra: "dado externo",
        },
      ],
    }),
  );
  await expect(consultarEventosFrenet("AB123BR", "04669", "teste", enviar)).resolves.toEqual([
    { data: "25/11/2026 14:00", descricao: "Objeto postado", local: "Pelotas" },
  ]);
  const [url, opcoes] = enviar.mock.calls[0];
  expect(url).toBe("https://api.frenet.com.br/tracking/trackinginfo");
  expect(opcoes).toMatchObject({ headers: { token: "teste" }, redirect: "error" });
  expect(JSON.parse(String(opcoes?.body))).toEqual({
    ShippingServiceCode: "04669",
    TrackingNumber: "AB123BR",
  });
});

it("distingue rastreio sem eventos de erro e recusa dados de outro rastreio", async () => {
  const enviar = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ TrackingNumber: "AB123BR", TrackingEvents: [] }))
    .mockResolvedValueOnce(Response.json({ ErrorMessage: "mensagem interna" }))
    .mockResolvedValueOnce(Response.json({ TrackingNumber: "OUTRO", TrackingEvents: [] }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  const consultar = () => consultarEventosFrenet("AB123BR", "04669", "teste", enviar);
  await expect(consultar()).resolves.toEqual([]);
  await expect(consultar()).rejects.toThrow("não conseguiu localizar");
  await expect(consultar()).rejects.toThrow("outro código");
  await expect(consultar()).rejects.toThrow("limite de consultas");
});

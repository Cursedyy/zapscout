import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
import { receberInscricaoRepresentante } from "./mimo-representantes.server";
const dados = {
  nome: "Representante sintético",
  email: "teste@example.invalid",
  whatsapp: "11999991234",
  cidade: "São Paulo",
  uf: "SP",
  regiao_atuacao: "Grande São Paulo",
  experiencia: "mais3",
  segmentos: ["produtos_naturais"],
  carteira_clientes: 200,
  core: "ativo",
  disponibilidade: "imediata",
  motivacao: "Quero ampliar o acesso a alimentos saudáveis na minha região.",
  consentimento: true,
};
const request = (d: unknown, origin = "https://example.invalid") =>
  new Request("https://example.invalid/api/public/mimo-representantes", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
    body: JSON.stringify(d),
  });
afterEach(() => vi.resetAllMocks());
it("envia somente campos permitidos e confirma após gravação", async () => {
  rpc.mockResolvedValue({ data: "recebido", error: null });
  const r = await receberInscricaoRepresentante(
    request({ ...dados, empresa_id: "outra", etapa: "Confirmado" }),
  );
  expect(r.status).toBe(200);
  expect(rpc.mock.calls[0][0]).toBe("mimo_inscrever_representante");
  expect(rpc.mock.calls[0][1].p_dados.motivacao).toBe(dados.motivacao);
  expect(rpc.mock.calls[0][1].p_dados).not.toHaveProperty("empresa_id");
  expect(rpc.mock.calls[0][1].p_dados).not.toHaveProperty("etapa");
  expect(JSON.stringify(await r.json())).not.toContain(dados.email);
});
it("barra todos os campos ausentes, spam, corpo excessivo e origem externa", async () => {
  for (const k of Object.keys(dados)) {
    const d: Record<string, unknown> = { ...dados };
    delete d[k];
    expect((await receberInscricaoRepresentante(request(d))).status, k).toBe(400);
  }
  expect((await receberInscricaoRepresentante(request({ ...dados, site: "spam" }))).status).toBe(
    400,
  );
  expect(
    (await receberInscricaoRepresentante(request({ ...dados, nome: "a".repeat(9000) }))).status,
  ).toBe(413);
  expect(
    (await receberInscricaoRepresentante(request(dados, "https://externo.invalid"))).status,
  ).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it("responde duplicidade e indisponibilidade sem falso sucesso", async () => {
  rpc.mockResolvedValue({ data: "duplicado", error: null });
  expect((await receberInscricaoRepresentante(request(dados))).status).toBe(409);
  rpc.mockResolvedValue({ data: "limite", error: null });
  expect((await receberInscricaoRepresentante(request(dados))).status).toBe(429);
  rpc.mockResolvedValue({ data: null, error: { code: "erro" } });
  expect((await receberInscricaoRepresentante(request(dados))).status).toBe(503);
});

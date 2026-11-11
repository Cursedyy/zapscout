import { afterEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));
import { receberInscricaoInfluenciador } from "./mimo-influenciadores.server";
afterEach(() => vi.resetAllMocks());
const dados = {
  nome: "Perfil sintético",
  whatsapp: "11999991234",
  rede: "Instagram",
  perfil: "sintetico",
  cidade: "São Paulo",
  uf: "SP",
  seguidores: 5000,
  visualizacoes: "Até 1 mil",
  nicho: "Outros",
  parceria: "Ambas as opções",
  consentimento: true,
};
const req = (body: unknown, origin = "https://example.invalid") =>
  new Request("https://example.invalid/api/public/mimo-influenciadores", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
    body: JSON.stringify(body),
  });
it("envia somente campos permitidos e não retorna contatos ou IDs", async () => {
  rpc.mockResolvedValue({ data: "recebido", error: null });
  const r = await receberInscricaoInfluenciador(
    req({ ...dados, empresa_id: "invasao", etapa: "Confirmado" }),
  );
  expect(r.status).toBe(200);
  const args = rpc.mock.calls[0][1];
  expect(args.p_dados).not.toHaveProperty("empresa_id");
  expect(args.p_dados).not.toHaveProperty("etapa");
  expect(args.p_ip_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(await r.json())).not.toContain(dados.whatsapp);
});
it("nega origem externa, spam, corpo grande e ausência de aceite antes de consultar o banco", async () => {
  expect((await receberInscricaoInfluenciador(req(dados, "https://externo.invalid"))).status).toBe(
    403,
  );
  expect((await receberInscricaoInfluenciador(req({ ...dados, site: "spam" }))).status).toBe(400);
  expect(
    (await receberInscricaoInfluenciador(req({ ...dados, consentimento: false }))).status,
  ).toBe(400);
  expect(
    (await receberInscricaoInfluenciador(req({ ...dados, nome: "a".repeat(9000) }))).status,
  ).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});
it("mostra falha real em vez de confirmar inscrição quando banco falha", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "erro" } });
  expect((await receberInscricaoInfluenciador(req(dados))).status).toBe(503);
  rpc.mockResolvedValue({ data: "limite", error: null });
  expect((await receberInscricaoInfluenciador(req(dados))).status).toBe(429);
});

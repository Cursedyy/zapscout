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
it("recusa duplicidade sem mostrar a confirmação de inscrição", async () => {
  rpc.mockResolvedValue({ data: "duplicado", error: null });
  const resposta = await receberInscricaoInfluenciador(req(dados));
  expect(resposta.status).toBe(409);
  expect((await resposta.json()).mensagem).toContain("Já existe uma inscrição");
});
it("impede o envio de cada campo obrigatório ausente antes de chegar ao banco", async () => {
  for (const campo of Object.keys(dados)) {
    const incompleto: Record<string, unknown> = { ...dados };
    delete incompleto[campo];
    expect((await receberInscricaoInfluenciador(req(incompleto))).status).toBe(400);
  }
  expect(rpc).not.toHaveBeenCalled();
});

const reqNativa = (patch: Record<string, unknown> = {}, origin = "https://example.invalid") =>
  new Request("https://example.invalid/api/public/mimo-influenciadores", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(
      Object.entries({ ...dados, consentimento: "on", site: "", ...patch }).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
  });
it("aceita envio nativo sem JavaScript com a mesma validação e confirma em HTML privado", async () => {
  rpc.mockResolvedValue({ data: "recebido", error: null });
  const r = await receberInscricaoInfluenciador(reqNativa());
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("text/html");
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  expect(rpc.mock.calls[0][1].p_dados).toMatchObject(dados);
  expect(rpc.mock.calls[0][1].p_dados).not.toHaveProperty("site");
  const html = await r.text();
  expect(html).toContain("Recebemos sua inscrição!");
  expect(html).toContain('<meta name="referrer" content="no-referrer">');
  expect(html).not.toContain(dados.whatsapp);
});
it("protege envio nativo contra origem externa, spam, falta de aceite e HTML nos erros", async () => {
  expect(
    (await receberInscricaoInfluenciador(reqNativa({}, "https://externo.invalid"))).status,
  ).toBe(403);
  expect((await receberInscricaoInfluenciador(reqNativa({ site: "spam" }))).status).toBe(400);
  expect((await receberInscricaoInfluenciador(reqNativa({ consentimento: "" }))).status).toBe(400);
  const r = await receberInscricaoInfluenciador(
    reqNativa({ visualizacoes: "<img src=x onerror=alert(1)>" }),
  );
  expect(r.status).toBe(400);
  const html = await r.text();
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("&lt;img");
  expect(rpc).not.toHaveBeenCalled();
});
it("não confirma cadastro nativo em duplicidade ou falha do serviço", async () => {
  rpc
    .mockResolvedValueOnce({ data: "duplicado", error: null })
    .mockResolvedValueOnce({ data: null, error: { code: "erro" } });
  expect((await receberInscricaoInfluenciador(reqNativa())).status).toBe(409);
  const r = await receberInscricaoInfluenciador(reqNativa());
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("Recebemos sua inscrição!");
});
it("explica em português campos obrigatórios ausentes no envio nativo", async () => {
  const r = await receberInscricaoInfluenciador(
    new Request("https://example.invalid/api/public/mimo-influenciadores", {
      method: "POST",
      headers: {
        origin: "https://example.invalid",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "site=synthetic",
    }),
  );
  expect(r.status).toBe(400);
  expect(await r.text()).toContain("Preencha os campos obrigatórios do formulário.");
  expect(rpc).not.toHaveBeenCalled();
});

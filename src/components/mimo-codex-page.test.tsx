// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoCodexPage } from "./mimo-codex-page";
const f = vi.hoisted(() => ({ fetch: vi.fn(), user: { id: "gestor" } as { id: string } | null }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: f.user,
    session: f.user ? { access_token: "jwt-sintetico" } : null,
    loading: false,
  }),
}));
function resposta(texto: string) {
  const encoder = new TextEncoder();
  const sse = `event: delta\ndata: ${JSON.stringify({ type: "delta", text: texto })}\n\nevent: complete\ndata: {"type":"complete"}\n\n`;
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode(sse));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const clientes: QueryClient[] = [];
function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientes.push(client);
  const view = () => (
    <QueryClientProvider client={client}>
      <MimoCodexPage />
    </QueryClientProvider>
  );
  const r = render(view());
  return { user: userEvent.setup(), rerender: () => r.rerender(view()) };
}
beforeEach(() => {
  f.user = { id: "gestor" };
  f.fetch.mockImplementation(async (_url, init?: RequestInit) =>
    init?.method === "POST" ? resposta("const exemplo = 1;") : Response.json({ configurado: true }),
  );
  vi.stubGlobal("fetch", f.fetch);
});
afterEach(() => {
  cleanup();
  clientes.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("configuração ausente não oferece geração", async () => {
  f.fetch.mockResolvedValue(Response.json({ configurado: false }));
  montar();
  expect(
    await screen.findByText("A integração ainda não foi configurada pela administração."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Enviar solicitação" })).toBeNull();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("gera somente após submissão e apresenta código como texto sem executar", async () => {
  const { user } = montar();
  await user.type(await screen.findByLabelText("Solicitação"), "Crie uma função de soma.");
  expect(f.fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  f.fetch.mockImplementation(async (_url, init?: RequestInit) =>
    init?.method === "POST"
      ? resposta("<script>naoExecutar()</script>")
      : Response.json({ configurado: true }),
  );
  await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
  expect(await screen.findByText("Texto concluído. Revise e teste antes de usar.")).toBeTruthy();
  expect(screen.getByText("<script>naoExecutar()</script>")).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  const post = f.fetch.mock.calls.find(([, o]) => o?.method === "POST")!;
  expect(post[0]).toBe("/api/mimo/codex");
  expect(JSON.parse(post[1].body)).toEqual({
    mode: "generate",
    prompt: "Crie uma função de soma.",
    code: "",
    language: "typescript",
  });
});
it("não envia código oculto ao voltar de edição para geração", async () => {
  const { user } = montar();
  await screen.findByLabelText("Operação");
  await user.selectOptions(screen.getByLabelText("Operação"), "edit");
  await user.type(screen.getByLabelText("Código atual"), "const privado = 1;");
  await user.type(screen.getByLabelText("Solicitação"), "Crie um novo exemplo.");
  await user.selectOptions(screen.getByLabelText("Operação"), "generate");
  await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
  await screen.findByText("Texto concluído. Revise e teste antes de usar.");
  expect(JSON.parse(f.fetch.mock.calls.find(([, o]) => o?.method === "POST")![1].body).code).toBe(
    "",
  );
});
it("cancelamento permite nova solicitação sem aceitar retorno tardio da anterior", async () => {
  let resolver!: (r: Response) => void;
  let signal!: AbortSignal;
  let chamadas = 0;
  f.fetch.mockImplementation(async (_url, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ configurado: true });
    if (++chamadas === 1) {
      signal = init.signal!;
      return new Promise<Response>((r) => {
        resolver = r;
      });
    }
    return resposta("resultado novo");
  });
  const { user } = montar();
  await user.type(await screen.findByLabelText("Solicitação"), "Crie uma função de soma.");
  await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
  await user.click(await screen.findByRole("button", { name: "Cancelar geração" }));
  expect(signal.aborted).toBe(true);
  await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
  expect(await screen.findByText("resultado novo")).toBeTruthy();
  await act(async () => resolver(resposta("resultado antigo")));
  expect(screen.queryByText("resultado antigo")).toBeNull();
  expect(screen.getByText("resultado novo")).toBeTruthy();
});
it("troca de usuário limpa conteúdo e cancela a operação pendente", async () => {
  let signal!: AbortSignal;
  f.fetch.mockImplementation(async (_url, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ configurado: true });
    signal = init.signal!;
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new DOMException("Cancelado", "AbortError"))),
    );
  });
  const { user, rerender } = montar();
  await user.type(await screen.findByLabelText("Solicitação"), "Solicitação privada sintética");
  fireEvent.click(screen.getByRole("button", { name: "Enviar solicitação" }));
  await waitFor(() => expect(signal).toBeDefined());
  f.user = { id: "outro-gestor" };
  rerender();
  expect(signal.aborted).toBe(true);
  expect(((await screen.findByLabelText("Solicitação")) as HTMLTextAreaElement).value).toBe("");
});
it("não exibe corpo upstream sensível em erro", async () => {
  f.fetch.mockImplementation(async (_url, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json({ message: "segredo interno" }, { status: 429 })
      : Response.json({ configurado: true }),
  );
  const { user } = montar();
  await user.type(await screen.findByLabelText("Solicitação"), "Crie uma função de soma.");
  await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText(/segredo interno/)).toBeNull();
});

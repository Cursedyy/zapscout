// @vitest-environment happy-dom
// Interface real com respostas simuladas; autorização e transações são testadas em PostgreSQL separado.
import { Suspense } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { unidadeSchema } from "@/lib/mimo-carteira";
const EMP = "10000000-0000-4000-8000-000000000001",
  USER = "20000000-0000-4000-8000-000000000001",
  ID = "30000000-0000-4000-8000-000000000001";
const state = vi.hoisted(() => ({
  filtros: [] as Record<string, unknown>[],
  salvos: [] as Record<string, unknown>[],
  pendente: null as Promise<void> | null,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/mimo-contexto", () => ({
  contextoMimoOptions: {
    queryKey: ["mimo-leads-contexto"],
    queryFn: async () => ({
      empresaId: EMP,
      usuarioId: USER,
      papel: "administrador",
      membros: [{ user_id: USER, nome: "Gestor de teste", papel: "administrador" }],
    }),
  },
}));
const unidade = () => ({
  ...unidadeSchema.parse({
    nome: "Unidade Centro",
    classe: "A",
    rede: "Bio Mundo",
    cidade: "Curitiba",
    uf: "PR",
    responsavel_id: USER,
  }),
  id: ID,
  empresa_id: EMP,
  updated_at: "2026-11-03T12:00:00Z",
});
vi.mock("@/lib/mimo-carteira.functions", () => ({
  listarCarteiraMimo: async ({ data }: any) => {
    state.filtros.push(data);
    if (state.pendente) await state.pendente;
    return {
      disponivel: true,
      total: 1,
      unidades: [{ ...unidade(), proxima_acao: null, ultimo_contato: null }],
    };
  },
  gravarUnidadeMimo: async ({ data }: any) => {
    state.salvos.push(data);
    return { ...data, id: ID };
  },
  detalheCarteiraMimo: async () => ({
    unidade: unidade(),
    contatos: [
      {
        id: ID,
        unidade_id: ID,
        nome: "Compradora de teste",
        papel: "Comprador",
        telefone: "",
        whatsapp: "41999999999",
        email: "",
        updated_at: "2026-11-03T12:00:00Z",
      },
    ],
    atividades: [],
    totalAtividades: 0,
    historico: [],
    totalHistorico: 0,
    negociacoes: [],
  }),
  atribuirCarteiraMimo: async () => ({}),
  buscarLeadsCarteiraMimo: async () => [],
  negociarCarteiraMimo: async () => ({}),
  gravarContatoCarteiraMimo: async () => ({}),
  associarContatoCarteiraMimo: async () => ({}),
  buscarContatosCarteiraMimo: async () => [],
  agendarCarteiraMimo: async () => ({}),
  concluirCarteiraMimo: async () => ({}),
  reagendarCarteiraMimo: async () => ({}),
  obterLeadCarteiraMimo: async () => ({}),
}));
const { MimoCarteiraPage } = await import("./mimo-carteira-page");
function montar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60000 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <Suspense fallback={<p>Carregando contexto…</p>}>
        <MimoCarteiraPage />
      </Suspense>
    </QueryClientProvider>,
  );
  return qc;
}
beforeEach(() => {
  state.filtros = [];
  state.salvos = [];
  state.pendente = null;
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => cleanup());
describe("Carteira: interface", () => {
  it("mantém a unidade visível durante atualização dos filtros", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("button", { name: "Unidade Centro" });
    let liberar!: () => void;
    state.pendente = new Promise<void>((r) => {
      liberar = r;
    });
    await user.selectOptions(screen.getByLabelText("Potencial"), "A");
    await waitFor(() => expect(state.filtros.some((f) => f.classe === "A")).toBe(true));
    expect(screen.getByRole("button", { name: "Unidade Centro" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Atualizando");
    liberar();
    state.pendente = null;
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).not.toContain("Atualizando"),
    );
  });
  it("abre contatos e oferece WhatsApp apenas como ação manual", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Unidade Centro" }));
    await user.click(await screen.findByRole("tab", { name: "Contatos" }));
    expect(await screen.findByText("Compradora de teste")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Abrir WhatsApp" });
    expect(link.getAttribute("href")).toBe("https://wa.me/5541999999999");
  });
  it("salva uma unidade com os dados informados na ficha", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: "Nova unidade" }));
    const campo = await screen.findByLabelText("Unidade");
    await user.type(campo, "Parceiro independente");
    await user.click(screen.getByRole("button", { name: "Salvar unidade" }));
    await waitFor(() => expect(state.salvos[0]?.nome).toBe("Parceiro independente"));
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ chamadas: [] as any[] }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/mimo-carteira-arquivo", () => ({
  lerArquivoCarteira: async () => ({
    hash: "a".repeat(64),
    rows: [
      ["CNPJ", "Franquia", "Razão Social", "Prioridade", "Comprador"],
      ["11222333000181", "BIO MUNDO", "Empresa Teste", "A", "Compradora Teste"],
      ["11222333000182", "Parceiro", "Outra Empresa", "B", ""],
    ],
  }),
}));
vi.mock("@/lib/mimo-carteira.functions", () => ({
  importacoesCarteiraMimo: async () => [],
  resultadosImportacaoCarteiraMimo: async () => ({ total: 0, linhas: [] }),
  importarCarteiraMimo: async ({ data }: any) => {
    state.chamadas.push(data);
    return {
      processados: data.total,
      total: data.total,
      criados: data.total,
      ignorados: 0,
      concluida_em: "2026-11-03T12:00:00Z",
    };
  },
}));
const { ImportarCarteira } = await import("./mimo-carteira-importar");
function montar(disponivel: boolean) {
  state.chamadas = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ImportarCarteira usuario="teste" disponivel={disponivel} />
    </QueryClientProvider>,
  );
}
afterEach(() => cleanup());
describe("importação: revisão antes da gravação", () => {
  it("permite prévia sem banco e não oferece gravar linhas inválidas", async () => {
    const u = userEvent.setup();
    montar(false);
    await u.upload(
      screen.getByLabelText("Arquivo Excel ou CSV"),
      new File(["teste"], "base.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(await screen.findByText(/2 unidades · 1 selecionadas/)).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: "Importar linha 3" }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Importar 1 unidades" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(state.chamadas).toHaveLength(0);
  });
  it("importa somente linhas revisadas, com contatos e origem preservados", async () => {
    const u = userEvent.setup();
    montar(true);
    await u.upload(screen.getByLabelText("Arquivo Excel ou CSV"), new File(["teste"], "base.xlsx"));
    await screen.findByText(/2 unidades · 1 selecionadas/);
    expect((screen.getByLabelText("Rede linha 2") as HTMLInputElement).value).toBe("Bio Mundo");
    await u.click(screen.getByLabelText(/Conferi colunas/));
    await u.click(screen.getByRole("button", { name: "Importar 1 unidades" }));
    await waitFor(() => expect(state.chamadas).toHaveLength(1));
    expect(state.chamadas[0].linhas[0].unidade.rede).toBe("Bio Mundo");
    expect(state.chamadas[0].linhas[0].contatos[0].nome).toBe("Compradora Teste");
    expect(state.chamadas[0].linhas[0].originais.Franquia).toBe("BIO MUNDO");
  });
});

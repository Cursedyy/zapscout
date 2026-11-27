// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MimoInadimplenciaPage } from "./mimo-inadimplencia-page";
import {
  calcularInadimplencia,
  normalizarTitulos,
  type ResultadoInadimplencia,
} from "@/lib/mimo-inadimplencia";
import {
  HOJE_FIXTURE,
  PERIODO_FIXTURE,
  titulosSinteticos,
} from "@/lib/mimo-inadimplencia.fixtures";

const api = vi.hoisted(() => ({ consultar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/mimo-inadimplencia.functions", () => ({
  consultarInadimplenciaMimo: api.consultar,
}));

function resultado(): ResultadoInadimplencia {
  const { titulos } = normalizarTitulos(titulosSinteticos());
  const r = calcularInadimplencia(titulos, PERIODO_FIXTURE, HOJE_FIXTURE);
  r.clientes[0].nome = "Cliente Sintético Trinta";
  return {
    ...r,
    geradoEm: "2026-11-27T15:00:00.000Z",
    titulosLidos: 16,
    invalidos: 1,
    duplicados: 1,
    avisos: ["1 título(s) sem campos obrigatórios válidos foram ignorados. Confira-os no Omie."],
  };
}
beforeEach(() => {
  api.consultar.mockResolvedValue({ disponivel: true, resultado: resultado() });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function montar() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MimoInadimplenciaPage />
    </QueryClientProvider>,
  );
}

it("mostra índices, faixas, ranking e vendedores calculados pelo servidor", async () => {
  montar();
  expect(await screen.findByText("73,83%")).toBeTruthy();
  expect(screen.getByText("87,50%")).toBeTruthy();
  expect(screen.getByText("Cliente Sintético Trinta")).toBeTruthy();
  expect(screen.getByText("Cliente Omie 20")).toBeTruthy();
  expect(screen.getByText("Mais de 90 dias")).toBeTruthy();
  expect(screen.getByText("Sem vendedor informado")).toBeTruthy();
  expect(screen.getByText(/sem campos obrigatórios/)).toBeTruthy();
  expect(api.consultar).toHaveBeenCalledTimes(1);
});

it("exporta CSV a partir do resultado já carregado", async () => {
  const criar = vi.fn(() => "blob:sintetico");
  const revogar = vi.fn();
  Object.assign(URL, { createObjectURL: criar, revokeObjectURL: revogar });
  const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  montar();
  await userEvent.click(await screen.findByRole("button", { name: /Exportar CSV/ }));
  expect(criar).toHaveBeenCalledTimes(1);
  expect(clique).toHaveBeenCalledTimes(1);
  expect(revogar).toHaveBeenCalledWith("blob:sintetico");
  expect(api.consultar).toHaveBeenCalledTimes(1);
});

it("informa integração indisponível sem mostrar valores", async () => {
  api.consultar.mockResolvedValue({ disponivel: false, mensagem: "Integração Omie indisponível." });
  montar();
  expect(await screen.findByText("Integração Omie indisponível.")).toBeTruthy();
  expect(screen.queryByText(/^Índice de inadimplência \(/)).toBeNull();
  expect(screen.queryByText(/R\$/)).toBeNull();
});

it("mostra erro do Omie, não inventa indicadores e permite tentar novamente", async () => {
  api.consultar.mockRejectedValueOnce(Error("O Omie limitou as consultas."));
  montar();
  expect(await screen.findByText("O Omie limitou as consultas.")).toBeTruthy();
  expect(screen.getByText("Nenhum indicador foi calculado.")).toBeTruthy();
  expect(screen.queryByText(/%$/)).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("73,83%")).toBeTruthy();
});

it("valida o período no navegador antes de consultar", async () => {
  montar();
  await screen.findByText("73,83%");
  const [de, ate] = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/) as HTMLInputElement[];
  await userEvent.clear(de);
  await userEvent.type(de, "2026-12-31");
  await userEvent.clear(ate);
  await userEvent.type(ate, "2026-01-01");
  await userEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText(/data inicial precisa ser anterior/)).toBeTruthy();
  await waitFor(() => expect(api.consultar).toHaveBeenCalledTimes(1));
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  assinaturaFrete,
  CATALOGO,
  itemDeProduto,
  novoPedido,
  sugerirCaixas,
  type Pedido,
} from "@/lib/mimo-pedido";
const calls = vi.hoisted(() => ({ cotar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/mimo-frete.functions", () => ({ cotarFreteMimo: calls.cotar }));
vi.mock("@/components/mimo-lead-editor", () => ({ Escolha: () => null }));
const { LogisticaPedido } = await import("./mimo-pedido-logistica");
function base(): Pedido {
  const itens = [itemDeProduto(CATALOGO.find((i) => i.preco !== null && i.pesoG !== null)!)];
  return {
    ...novoPedido(),
    leadId: "11111111-1111-4111-8111-111111111111",
    itens,
    volumes: sugerirCaixas(itens).map((v) => ({ ...v, confirmado: true })),
    destinoCep: "01001000",
    endereco: "Endereço sintético",
    declarado: 10000,
  };
}
function resposta(p: Pedido, valor = 1234) {
  return {
    cotacoes: [
      {
        id: crypto.randomUUID(),
        modalidade: "Jadlog Package",
        prazo: "3 dias úteis",
        modo: "remessa",
        valor,
        valoresVolumes: {},
        assinatura: assinaturaFrete(p),
        registradaEm: new Date().toISOString(),
        oficial: true,
        provedor: "jadlog",
      },
    ],
  };
}
function montar(configurada: boolean, frenetConfigurada = false, inicial = base) {
  function Form() {
    const [p, setP] = useState(inicial);
    return (
      <LogisticaPedido
        pedido={p}
        onChange={setP}
        avisar={() => {}}
        usuarioId="ator"
        jadlogConfigurada={configurada}
        frenetConfigurada={frenetConfigurada}
      />
    );
  }
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Form />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("frete automático na entrega", () => {
  it("compara a remessa inteira e deixa trocar a mais barata pela mais rápida", async () => {
    calls.cotar.mockImplementation(async ({ data }) => {
      const criar = (id: string, valor: number, prazoDias: number) => ({
        ...resposta(data.pedido, valor).cotacoes[0],
        id,
        provedor: "frenet",
        modalidade: `Transportadora ${id}`,
        prazo: `Até ${prazoDias} dias úteis`,
        prazoDias,
        comprovante: `${Date.now() + 15 * 60_000}.assinatura-sintetica`,
        postagem: { tipo: "postagem", descricao: "Ponto sintético Pelotas", origemCep: "96085440" },
      });
      return { cotacoes: [criar("economica", 4000, 8), criar("expressa", 6000, 3)] };
    });
    montar(false, true, () => {
      const p = base();
      p.itens[0].quantidade = 4;
      p.volumes = [1, 2, 3, 4].map((n) => ({
        ...p.volumes[0],
        id: `v${n}`,
        caixa: "G",
        pesoAjustadoG: 4800,
        conteudo: [{ itemId: p.itens[0].id, quantidade: 1 }],
      }));
      return p;
    });
    const barata = await screen.findByRole("radio", { name: /Transportadora economica/ });
    expect((barata as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Menor prazo")).toBeTruthy();
    expect(screen.getByText(/O comparativo soma o frete de todas as caixas/)).toBeTruthy();
    expect(calls.cotar.mock.calls[0][0].data.pedido.volumes).toHaveLength(4);
    await userEvent.setup().click(screen.getByRole("radio", { name: /Transportadora expressa/ }));
    expect((barata as HTMLInputElement).checked).toBe(false);
    expect(
      (screen.getByRole("radio", { name: /Transportadora expressa/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(calls.cotar).toHaveBeenCalledTimes(1);
  });
  it("não recomenda nem deixa escolher uma cotação sem origem confirmada", async () => {
    calls.cotar.mockImplementation(async ({ data }) => ({
      cotacoes: [
        {
          ...resposta(data.pedido).cotacoes[0],
          provedor: "frenet",
          modalidade: "Origem pendente",
          comprovante: `${Date.now() + 15 * 60_000}.assinatura-sintetica`,
          prazoDias: 2,
        },
      ],
    }));
    montar(false, true);
    const opcao = await screen.findByRole("radio", { name: /Origem pendente/ });
    expect((opcao as HTMLInputElement).disabled).toBe(true);
    expect((opcao as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText("Menor valor")).toBeNull();
    expect(screen.getByText(/precisa registrar no MiMo/)).toBeTruthy();
    expect(screen.getByText(/Cotações recebidas/)).toBeTruthy();
    expect(screen.queryByText(/Preencha o destino e confira/)).toBeNull();
    expect(screen.getByRole("list", { name: "Cotações de frete" }).contains(opcao)).toBe(true);
  });
  it("falha da Frenet aparece sem fabricar cotação ou trocar de provedor", async () => {
    calls.cotar.mockRejectedValue(Error("A Frenet está indisponível para cotação."));
    montar(false, true);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Frenet"),
    );
    expect(screen.queryByRole("radio", { name: /Transportadora/ })).toBeNull();
    expect(calls.cotar).toHaveBeenCalledTimes(1);
  });
  it("calcula sem digitar preço ou modalidade e seleciona o resultado", async () => {
    calls.cotar.mockImplementation(async ({ data }) => resposta(data.pedido));
    montar(true);
    const opcao = await screen.findByRole("radio", { name: /Jadlog Package/ });
    expect((opcao as HTMLInputElement).checked).toBe(true);
    expect(calls.cotar).toHaveBeenCalledTimes(1);
  });
  it("não consulta nem apresenta preço fictício sem integração configurada", () => {
    montar(false);
    expect(screen.getByText(/serviço de cotação está temporariamente indisponível/)).toBeTruthy();
    expect(calls.cotar).not.toHaveBeenCalled();
  });
  it("descarta uma resposta antiga quando o CEP muda durante a consulta", async () => {
    let concluir!: (v: unknown) => void;
    let primeiro!: Pedido;
    calls.cotar.mockImplementationOnce(({ data }) => {
      primeiro = data.pedido;
      return new Promise((resolve) => {
        concluir = resolve;
      });
    });
    calls.cotar.mockImplementation(async ({ data }) => resposta(data.pedido, 5678));
    montar(true);
    await waitFor(() => expect(calls.cotar).toHaveBeenCalledTimes(1));
    const u = userEvent.setup();
    await u.clear(screen.getByLabelText("CEP de destino"));
    await u.type(screen.getByLabelText("CEP de destino"), "02002000");
    concluir(resposta(primeiro));
    await waitFor(() => expect(screen.queryByText(/12,34/)).toBeNull());
    await waitFor(() => expect(calls.cotar).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getAllByText(/56,78/).length).toBeGreaterThan(0));
  });
});

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
const calls = vi.hoisted(() => ({ cotar: vi.fn(), confirmar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/mimo-frete.functions", () => ({
  cotarFreteMimo: calls.cotar,
  confirmarOrigemFreteMimo: calls.confirmar,
}));
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
function montar(
  configurada: boolean,
  frenetConfigurada = false,
  inicial = base,
  gerenciarOrigem = false,
) {
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
        gerenciarOrigem={gerenciarOrigem}
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
    expect(screen.queryByRole("button", { name: "Confirmar origem" })).toBeNull();
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

it("gestao confirma o ponto configurado e consegue selecionar sem alterar o preco", async () => {
  calls.cotar.mockImplementation(async ({ data }) => ({
    provedor: "frenet",
    cotacoes: [
      {
        ...resposta(data.pedido).cotacoes[0],
        provedor: "frenet",
        modalidade: "J&T Standard",
        transportadora: "J&T Express",
        comprovante: `${Date.now() + 15 * 60_000}.sintetico`,
      },
    ],
  }));
  calls.confirmar.mockImplementation(async ({ data }) => ({
    cotacao: {
      ...data.pedido.cotacoes[0],
      id: "confirmada",
      postagem: { tipo: data.tipo, descricao: data.descricao, origemCep: data.pedido.origemCep },
    },
  }));
  montar(false, true, base, true);
  const u = userEvent.setup();
  const radio = await screen.findByRole("radio", { name: /J&T Standard/ });
  expect((radio as HTMLInputElement).disabled).toBe(true);
  await u.click(screen.getByRole("button", { name: "Confirmar origem" }));
  const salvar = screen.getByRole("button", { name: "Confirmar e selecionar frete" });
  expect((salvar as HTMLButtonElement).disabled).toBe(true);
  await u.click(screen.getByRole("checkbox", { name: /Confirmo que este servi/ }));
  await u.click(salvar);
  await waitFor(() => {
    const atual = screen.getByRole("radio", { name: /J&T Standard/ }) as HTMLInputElement;
    expect(atual.checked).toBe(true);
    expect(atual.disabled).toBe(false);
  });
  expect(calls.confirmar).toHaveBeenCalledWith({
    data: expect.objectContaining({
      confirmado: true,
      tipo: "postagem",
      cotacaoId: expect.any(String),
    }),
  });
  expect(calls.cotar).toHaveBeenCalledTimes(1);
});
it("erro ao confirmar nao libera o radio nem inventa postagem", async () => {
  calls.cotar.mockImplementation(async ({ data }) => ({
    provedor: "frenet",
    cotacoes: [
      {
        ...resposta(data.pedido).cotacoes[0],
        provedor: "frenet",
        modalidade: "J&T Standard",
        comprovante: `${Date.now() + 15 * 60_000}.sintetico`,
      },
    ],
  }));
  calls.confirmar.mockRejectedValue(Error("Cotacao expirou. Atualize o frete."));
  montar(false, true, base, true);
  const u = userEvent.setup();
  await screen.findByRole("radio", { name: /J&T Standard/ });
  await u.click(screen.getByRole("button", { name: "Confirmar origem" }));
  await u.click(screen.getByRole("checkbox", { name: /Confirmo que este servi/ }));
  await u.click(screen.getByRole("button", { name: "Confirmar e selecionar frete" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("expirou"),
  );
  const radio = screen.getByRole("radio", { name: /J&T Standard/ }) as HTMLInputElement;
  expect(radio.disabled).toBe(true);
  expect(radio.checked).toBe(false);
});

it("descarta a confirmacao quando o CEP muda durante a chamada", async () => {
  calls.cotar.mockImplementation(async ({ data }) => ({
    provedor: "frenet",
    cotacoes: [
      {
        ...resposta(data.pedido).cotacoes[0],
        provedor: "frenet",
        modalidade: "J&T Standard",
        comprovante: `${Date.now() + 15 * 60_000}.sintetico`,
      },
    ],
  }));
  let concluir!: (value: unknown) => void;
  let pedidoInicial!: Pedido;
  calls.confirmar.mockImplementation(({ data }) => {
    pedidoInicial = data.pedido;
    return new Promise((resolve) => {
      concluir = resolve;
    });
  });
  montar(false, true, base, true);
  const u = userEvent.setup();
  await screen.findByRole("radio", { name: /J&T Standard/ });
  await u.click(screen.getByRole("button", { name: "Confirmar origem" }));
  await u.click(screen.getByRole("checkbox", { name: /Confirmo que este servi/ }));
  await u.click(screen.getByRole("button", { name: "Confirmar e selecionar frete" }));
  await waitFor(() => expect(calls.confirmar).toHaveBeenCalledTimes(1));
  await u.clear(screen.getByLabelText("CEP de destino"));
  await u.type(screen.getByLabelText("CEP de destino"), "02002000");
  concluir({
    cotacao: {
      ...pedidoInicial.cotacoes[0],
      id: "confirmacao-antiga",
      postagem: { tipo: "postagem", descricao: "Local confirmado", origemCep: "96085440" },
    },
  });
  await waitFor(() => expect(calls.cotar).toHaveBeenCalledTimes(2), { timeout: 4000 });
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("radio", { name: /J&T Standard/ })
        .every((r) => !(r as HTMLInputElement).checked),
    ).toBe(true),
  );
  expect(screen.queryByText("Postagem: Local confirmado")).toBeNull();
});

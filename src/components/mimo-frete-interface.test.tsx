// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { assinaturaFrete, CATALOGO, itemDeProduto, novoPedido, sugerirCaixas, type Pedido } from "@/lib/mimo-pedido";
const calls = vi.hoisted(() => ({ cotar: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/mimo-frete.functions", () => ({ cotarFreteJadlogMimo: calls.cotar }));
vi.mock("@/components/mimo-lead-editor", () => ({ Escolha: () => null }));
const { LogisticaPedido } = await import("./mimo-pedido-logistica");
function base(): Pedido {
  const itens = [itemDeProduto(CATALOGO.find(i => i.preco !== null && i.pesoG !== null)!)];
  return { ...novoPedido(), leadId: "11111111-1111-4111-8111-111111111111", itens, volumes: sugerirCaixas(itens).map(v => ({ ...v, confirmado: true })), destinoCep: "01001000", endereco: "Endereço sintético", declarado: 10000 };
}
function resposta(p: Pedido, valor = 1234) { return { cotacoes: [{ id: crypto.randomUUID(), modalidade: "Jadlog Package", prazo: "3 dias úteis", modo: "remessa", valor, valoresVolumes: {}, assinatura: assinaturaFrete(p), registradaEm: new Date().toISOString(), oficial: true, provedor: "jadlog" }] }; }
function montar(configurada: boolean) {
  function Form() { const [p, setP] = useState(base); return <LogisticaPedido pedido={p} onChange={setP} avisar={() => {}} usuarioId="ator" jadlogConfigurada={configurada}/>; }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Form/></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("frete automático na entrega", () => {
  it("calcula sem digitar preço ou modalidade e seleciona o resultado", async () => {
    calls.cotar.mockImplementation(async ({ data }) => resposta(data.pedido)); montar(true);
    const opcao = await screen.findByRole("radio", { name: /Jadlog Package/ });
    expect((opcao as HTMLInputElement).checked).toBe(true);
    expect(calls.cotar).toHaveBeenCalledTimes(1);
  });
  it("não consulta nem apresenta preço fictício sem integração configurada", () => {
    montar(false); expect(screen.getByText(/aguarda a conexão do contrato/)).toBeTruthy(); expect(calls.cotar).not.toHaveBeenCalled();
  });
  it("descarta uma resposta antiga quando o CEP muda durante a consulta", async () => {
    let concluir!: (v: unknown) => void; let primeiro!: Pedido;
    calls.cotar.mockImplementationOnce(({ data }) => { primeiro = data.pedido; return new Promise(resolve => { concluir = resolve; }); });
    calls.cotar.mockImplementation(async ({ data }) => resposta(data.pedido, 5678)); montar(true);
    await waitFor(() => expect(calls.cotar).toHaveBeenCalledTimes(1));
    const u = userEvent.setup(); await u.clear(screen.getByLabelText("CEP de destino")); await u.type(screen.getByLabelText("CEP de destino"), "02002000");
    concluir(resposta(primeiro));
    await waitFor(() => expect(screen.queryByText(/12,34/)).toBeNull());
    await waitFor(() => expect(calls.cotar).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await waitFor(() => expect(screen.getAllByText(/56,78/).length).toBeGreaterThan(0));
  });
});

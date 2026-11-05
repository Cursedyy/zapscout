// @vitest-environment happy-dom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({
  estado: vi.fn(),
  conectar: vi.fn(),
  ativar: vi.fn(),
  pausar: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/mimo-whatsapp.functions", () => ({
  estadoWhatsAppMimo: api.estado,
  conectarWhatsAppMimo: api.conectar,
  ativarWhatsAppMimo: api.ativar,
  pausarWhatsAppMimo: api.pausar,
}));
import { MimoWhatsAppPage } from "./mimo-whatsapp-page";
const base = {
  disponivel: true,
  compativel: true,
  vinculos: [],
  status: "connecting",
  numero: null,
  desafio: null,
  qrcode: "data:image/png;base64,c3ludGhldGlj",
  erro: "",
};
let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  api.estado.mockResolvedValue(base);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const abrir = () =>
  render(
    <QueryClientProvider client={client}>
      <MimoWhatsAppPage />
    </QueryClientProvider>,
  );
it("mostra QR que chegou pela consulta de status sem exigir outro pareamento", async () => {
  abrir();
  expect(
    await screen.findByRole("img", { name: "QR Code para conectar o WhatsApp comercial" }),
  ).toBeTruthy();
  expect(api.conectar).not.toHaveBeenCalled();
});
it("remove QR depois que status confirma conexão", async () => {
  abrir();
  await screen.findByRole("img", { name: "QR Code para conectar o WhatsApp comercial" });
  api.estado.mockResolvedValue({
    ...base,
    status: "connected",
    qrcode: null,
    numero: "5511999999999",
    desafio: "sintetico",
  });
  await userEvent.click(screen.getByRole("button", { name: "Atualizar status" }));
  await screen.findByText("Número conectado: +5511999999999");
  expect(
    screen.queryByRole("img", { name: "QR Code para conectar o WhatsApp comercial" }),
  ).toBeNull();
  expect(api.ativar).not.toHaveBeenCalled();
});

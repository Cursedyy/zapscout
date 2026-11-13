// @vitest-environment happy-dom
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MimoInfluenciadoresForm } from "./mimo-influenciadores-form";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function requiredElement(selector: string) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
function preencherRapido() {
  const values = {
    nome: "Perfil sintético",
    perfil: "perfil_teste",
    cidade: "São Paulo",
    uf: "SP",
    seguidores: "100000",
    whatsapp: "11999991234",
  };
  for (const [name, value] of Object.entries(values))
    fireEvent.change(requiredElement(`[name="${name}"]`), { target: { value } });
  for (const name of ["visualizacoes", "nicho", "parceria", "consentimento"])
    fireEvent.click(requiredElement(`[name="${name}"]`));
  return requiredElement("form");
}
it("oferece POST nativo seguro enquanto JavaScript não iniciou", () => {
  render(<MimoInfluenciadoresForm />);
  const form = requiredElement("form");
  expect(form.getAttribute("method")).toBe("post");
  expect(form.getAttribute("action")).toBe("/api/public/mimo-influenciadores");
});
it("encerra uma conexão travada sem apagar respostas nem prender o botão de envio", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<MimoInfluenciadoresForm />);
  fireEvent.submit(preencherRapido());
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0][1].body).seguidores).toBe(100000);
  await act(async () => {
    vi.advanceTimersByTime(25000);
  });
  expect(screen.getByRole("alert").textContent).toContain("A conexão demorou");
  expect((screen.getByLabelText("1. Nome completo") as HTMLInputElement).value).toBe(
    "Perfil sintético",
  );
  expect(
    (screen.getByRole("button", { name: "Quero participar da campanha MiMo" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("indica e focaliza o campo rejeitado pela validação", () => {
  render(<MimoInfluenciadoresForm />);
  const form = preencherRapido();
  const phone = screen.getByLabelText(/8\. WhatsApp com DDD/);
  fireEvent.change(phone, { target: { value: "abc" } });
  fireEvent.submit(form);
  expect(document.activeElement).toBe(phone);
  expect(screen.getByRole("alert").textContent).toContain("WhatsApp");
});
it("preserva respostas após erro e confirma somente depois da gravação", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ mensagem: "Inscrições temporariamente indisponíveis." }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ mensagem: "Inscrição recebida." }) });
  vi.stubGlobal("fetch", fetch);
  render(<MimoInfluenciadoresForm />);
  expect(screen.queryByRole("button", { name: "Compartilhar convite" })).toBeNull();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("1. Nome completo"), "Perfil sintético");
  await user.type(screen.getByLabelText("Seu perfil na rede escolhida"), "@sintetico");
  await user.type(screen.getByLabelText("Cidade"), "São Paulo");
  await user.selectOptions(screen.getByLabelText("Estado"), "SP");
  await user.type(screen.getByLabelText(/4\. Quantos seguidores/), "15000");
  await user.click(screen.getByLabelText("Até 1 mil"));
  await user.click(screen.getByLabelText("Alimentação e receitas"));
  await user.click(screen.getByLabelText("Ambas as opções"));
  await user.type(screen.getByLabelText(/8\. WhatsApp com DDD/), "11999991234");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Quero participar da campanha MiMo" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Inscrições temporariamente indisponíveis.",
  );
  expect(screen.queryByRole("button", { name: "Compartilhar convite" })).toBeNull();
  expect((screen.getByLabelText("1. Nome completo") as HTMLInputElement).value).toBe(
    "Perfil sintético",
  );
  await user.click(screen.getByRole("button", { name: "Quero participar da campanha MiMo" }));
  await waitFor(() => expect(screen.getByText("Recebemos sua inscrição!")).toBeTruthy());
  expect(screen.getByRole("button", { name: "Compartilhar convite" })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("envia a UF americana selecionada com o país identificado", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ mensagem: "Inscrição recebida." }) });
  vi.stubGlobal("fetch", fetch);
  render(<MimoInfluenciadoresForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("1. Nome completo"), "Perfil exterior");
  await user.type(screen.getByLabelText("Seu perfil na rede escolhida"), "@exterior");
  await user.type(screen.getByLabelText("Cidade"), "Miami");
  await user.selectOptions(
    screen.getByLabelText("Estado"),
    screen.getByRole("option", { name: "Florida (FL)" }),
  );
  await user.type(screen.getByLabelText(/4\. Quantos seguidores/), "15000");
  await user.click(screen.getByLabelText("Até 1 mil"));
  await user.click(screen.getByLabelText("Outros"));
  await user.click(screen.getByLabelText("Ambas as opções"));
  await user.type(screen.getByLabelText(/8\. WhatsApp com DDD/), "11999991234");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Quero participar da campanha MiMo" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ cidade: "Miami", uf: "US-FL" });
});

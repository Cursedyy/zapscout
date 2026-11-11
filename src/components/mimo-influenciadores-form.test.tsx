// @vitest-environment happy-dom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MimoInfluenciadoresForm } from "./mimo-influenciadores-form";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

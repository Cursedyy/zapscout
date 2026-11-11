// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MimoRepresentantesForm } from "./mimo-representantes-form";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("preenche todos os dados e preserva respostas se houver duplicidade", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ mensagem: "Já existe uma candidatura com este contato." }),
    })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ mensagem: "Cadastro recebido." }) });
  vi.stubGlobal("fetch", fetch);
  render(<MimoRepresentantesForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nome completo"), "Representante sintético");
  await user.type(screen.getByLabelText("E-mail"), "teste@example.invalid");
  await user.type(screen.getByLabelText("WhatsApp com DDD"), "11999991234");
  await user.type(screen.getByLabelText("Cidade"), "São Paulo");
  await user.selectOptions(screen.getByLabelText("Estado"), "SP");
  await user.type(screen.getByLabelText("Região de atuação"), "Grande São Paulo");
  await user.selectOptions(
    screen.getByLabelText("Experiência com representação ou vendas"),
    "mais3",
  );
  await user.click(screen.getByLabelText("Produtos naturais"));
  await user.type(screen.getByLabelText("Quantos clientes ativos tem na carteira?"), "200");
  await user.type(
    screen.getByLabelText("Marcas que representa atualmente (opcional)"),
    "Marca sintética",
  );
  await user.selectOptions(screen.getByLabelText("Possui registro no CORE?"), "ativo");
  await user.selectOptions(screen.getByLabelText("Disponibilidade para iniciar"), "imediata");
  await user.click(
    screen.getByLabelText(
      "Concordo com o uso dos meus dados nesta seleção e autorizo o contato da MiMo.",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Quero representar a MiMo" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Já existe uma candidatura com este contato.",
  );
  expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("teste@example.invalid");
  await user.click(screen.getByRole("button", { name: "Quero representar a MiMo" }));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Cadastro recebido!" })).toBeTruthy(),
  );
  expect(fetch.mock.calls[1][0]).toBe("/api/public/mimo-representantes");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    email: "teste@example.invalid",
    segmentos: ["produtos_naturais"],
    carteira_clientes: 200,
    core: "ativo",
    consentimento: true,
  });
});

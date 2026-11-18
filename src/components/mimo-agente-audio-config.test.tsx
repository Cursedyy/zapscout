// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mimo-agente-audio-config.functions", () => ({ configurarAudioAgenteMimo: api }));
import { ConfigAudioAgente } from "./mimo-agente-audio-config";
const chave = "sk-" + "x".repeat(40);
beforeEach(() => vi.resetAllMocks()); afterEach(cleanup);
it("mantém chave oculta, limpa imediatamente, evita duplo envio e confirma sucesso", async () => {
  let concluir!: (v: unknown) => void; api.mockImplementation(() => new Promise(resolve => { concluir = resolve; }));
  render(<ConfigAudioAgente />); const input = screen.getByLabelText("Chave OpenAI") as HTMLInputElement;
  expect(input.type).toBe("password"); expect(api).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: chave } });
  fireEvent.submit(input.form!); fireEvent.submit(input.form!);
  expect(api).toHaveBeenCalledTimes(1); expect(input.value).toBe(""); expect(input.disabled).toBe(true);
  concluir({ ok: true }); expect((await screen.findByRole("status")).textContent).toMatch(/testada com sucesso/);
  expect(input.value).toBe("");
});
it("não mostra erro bruto com segredo e não repete automaticamente", async () => {
  api.mockRejectedValue(Error("sk-segredo-sintetico")); render(<ConfigAudioAgente />);
  const input = screen.getByLabelText("Chave OpenAI") as HTMLInputElement;
  fireEvent.change(input, { target: { value: chave } }); fireEvent.submit(input.form!);
  await screen.findByRole("alert"); await waitFor(() => expect(input.disabled).toBe(false));
  expect(input.value).toBe(""); expect(document.body.textContent).not.toContain("sk-segredo-sintetico"); expect(api).toHaveBeenCalledOnce();
});
it("rejeita formato incompleto antes de enviar e limpa a entrada", async () => {
  render(<ConfigAudioAgente />); const input = screen.getByLabelText("Chave OpenAI") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "token-incorreto" } }); fireEvent.submit(input.form!);
  expect((await screen.findByRole("alert")).textContent).toContain("começar com sk-");
  expect(api).not.toHaveBeenCalled(); expect(input.value).toBe("");
});
it("diferencia chave salva sem transcrição sem anunciar sucesso", async () => {
  api.mockResolvedValue({ ok: false, codigo: "chave_salva_sem_transcricao" }); render(<ConfigAudioAgente />);
  const input = screen.getByLabelText("Chave OpenAI") as HTMLInputElement;
  fireEvent.change(input, { target: { value: chave } }); fireEvent.submit(input.form!);
  expect((await screen.findByRole("alert")).textContent).toContain("chave foi salva");
  expect(screen.queryByRole("status")).toBeNull(); expect(api).toHaveBeenCalledOnce();
});

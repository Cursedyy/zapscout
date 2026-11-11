// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConviteInfluenciadoresMimo, LINK_CONVITE_MIMO } from "./mimo-influenciadores-compartilhar";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("abre o compartilhamento com convite e link público, sem dados pessoais", async () => {
  const share = vi.fn().mockResolvedValue(undefined),
    writeText = vi.fn();
  vi.stubGlobal("navigator", { share, clipboard: { writeText } });
  render(<ConviteInfluenciadoresMimo />);
  fireEvent.click(screen.getByRole("button", { name: "Compartilhar convite" }));
  expect(share).toHaveBeenCalledWith({
    title: "Seja uma influenciadora MiMo",
    text: expect.stringContaining("Cadastre seu perfil"),
    url: LINK_CONVITE_MIMO,
  });
  expect(writeText).not.toHaveBeenCalled();
});
it("copia o link quando o navegador não oferece compartilhamento", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<ConviteInfluenciadoresMimo />);
  fireEvent.click(screen.getByRole("button", { name: "Compartilhar convite" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK_CONVITE_MIMO));
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    expect.stringContaining("Link copiado!"),
  );
});
it("permite copiar diretamente e apresenta o link se a área de transferência falhar", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("clipboard_unavailable"));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<ConviteInfluenciadoresMimo />);
  fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
  expect(await screen.findByLabelText("Link do convite")).toHaveProperty(
    "value",
    LINK_CONVITE_MIMO,
  );
});
it("respeita o cancelamento do compartilhamento sem copiar o link", async () => {
  const share = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("cancelled"), { name: "AbortError" })),
    writeText = vi.fn();
  vi.stubGlobal("navigator", { share, clipboard: { writeText } });
  render(<ConviteInfluenciadoresMimo />);
  fireEvent.click(screen.getByRole("button", { name: "Compartilhar convite" }));
  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(writeText).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});

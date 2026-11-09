// @vitest-environment happy-dom
import { expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PoliticaComercialAgente } from "./mimo-agente-politica";
import type { PoliticaComercialAgente as Politica } from "@/lib/mimo-agente-politica";
afterEach(cleanup);
it("não preenche condições reais e permite desabilitar respostas comerciais", async () => {
  const user = userEvent.setup();
  function Harness() {
    const [p, set] = useState<Politica | null>(null);
    return (
      <>
        <PoliticaComercialAgente value={p} onChange={set} />
        <output>{p ? "configurada" : "desabilitada"}</output>
      </>
    );
  }
  render(<Harness />);
  expect(screen.getByText("desabilitada")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Configurar condições comerciais" }));
  expect(
    (screen.getByLabelText("Pedido mínimo das demais localidades (R$)") as HTMLInputElement).value,
  ).toBe("");
  await user.click(
    screen.getByRole("button", { name: "Desabilitar respostas comerciais automáticas" }),
  );
  expect(screen.getByText("desabilitada")).toBeTruthy();
});
it("edita centavos sem arredondar valores e invalida a revisão anterior", async () => {
  const user = userEvent.setup();
  let saved: Politica | null = null;
  const initial: Politica = {
    revisada: true,
    regioes: [],
    demais: { minimoCentavos: 76000, frete: "FOB" },
    pix: true,
    cartao: null,
    boleto: null,
    bonificacaoFrete: false,
  };
  function Harness() {
    const [p, set] = useState<Politica | null>(initial);
    return (
      <PoliticaComercialAgente
        value={p}
        onChange={(v) => {
          saved = v;
          set(v);
        }}
      />
    );
  }
  render(<Harness />);
  const input = screen.getByLabelText("Pedido mínimo das demais localidades (R$)");
  await user.clear(input);
  await user.type(input, "123.45");
  expect(saved).toEqual(
    expect.objectContaining({ revisada: false, demais: { minimoCentavos: 12345, frete: "FOB" } }),
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: "A equipe revisou estas condições comerciais",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
});

// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MimoRetornoCodigos } from "./mimo-retorno-codigos";
import type { RetornoPorCodigo } from "@/lib/mimo-retorno-campanhas";

afterEach(cleanup);
const item = {
  id: "k1",
  codigo: "BF26",
  nome: "Black Friday",
  ativo: true,
  campanhasMeta: ["11"],
  investimentoMeta: 10000,
  investimentoManual: 2500,
  investimento: 12500,
  leadsMeta: 4,
  leadsCrm: 5,
  leadsAutomaticos: 2,
  cplCrm: 2500,
  pedidos: 2,
  receita: 50000,
  cac: 6250,
  roas: 4,
};
const dados: RetornoPorCodigo = {
  codigos: [item],
  semCodigo: { leads: 3, pedidos: 1, receita: 1000, investimentoMeta: 700 },
  metaComIds: true,
};
const nbsp = (t: string | null) => t?.replace(/\s/g, " ");

it("mostra investimento, leads, pedidos, faturamento, CAC e retorno por código e a linha não atribuída", () => {
  render(<MimoRetornoCodigos dados={dados} />);
  const linhas = within(
    screen.getByRole("table", { name: "Retorno por código de campanha" }),
  ).getAllByRole("row");
  const bf = nbsp(linhas[1].textContent);
  expect(bf).toContain("BF26");
  expect(bf).toContain("R$ 125,00");
  expect(bf).toContain("Meta R$ 100,00 · manual R$ 25,00");
  expect(bf).toContain("2 pelo anúncio");
  expect(bf).toContain("R$ 500,00");
  expect(bf).toContain("4x");
  expect(nbsp(linhas[2].textContent)).toContain("Não atribuídos");
});

it("marketing vê indisponível (—), não zero, e avisa ausência da migração", () => {
  render(
    <MimoRetornoCodigos
      dados={{
        ...dados,
        codigos: [{ ...item, pedidos: null, receita: null, cac: null, roas: null }],
        semCodigo: { ...dados.semCodigo, pedidos: null, receita: null },
      }}
    />,
  );
  const celulas = within(screen.getAllByRole("row")[1])
    .getAllByRole("cell")
    .map((c) => c.textContent);
  expect(celulas.slice(4)).toEqual(["—", "—", "—", "—"]);
  cleanup();
  render(<MimoRetornoCodigos dados={null} />);
  expect(screen.getByText(/ainda não ativados/)).toBeTruthy();
});

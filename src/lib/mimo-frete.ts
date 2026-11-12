import type { Cotacao } from "./mimo-pedido";

export function postagemConfirmada(c: Cotacao) {
  return c.provedor !== "frenet" || !!c.postagem;
}

export function compararFretes(cotacoes: Cotacao[]) {
  const elegiveis = cotacoes.filter(postagemConfirmada);
  const total = (c: Cotacao) =>
    c.modo === "volumes" ? Object.values(c.valoresVolumes).reduce((a, b) => a + b, 0) : c.valor;
  const menor = elegiveis.reduce<Cotacao | null>(
    (a, b) => (!a || total(b) < total(a) ? b : a),
    null,
  );
  const maisRapida = elegiveis
    .filter((c) => c.prazoDias !== undefined)
    .reduce<Cotacao | null>(
      (a, b) =>
        !a || b.prazoDias! < a.prazoDias! || (b.prazoDias === a.prazoDias && total(b) < total(a))
          ? b
          : a,
      null,
    );
  return { menor, maisRapida };
}

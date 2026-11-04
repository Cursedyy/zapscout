import type { RascunhoPedido } from "./mimo-rascunho";
export const memoriaRascunhos = new Map<string, { valor: RascunhoPedido; versao: number }>();
export const gravacoesRascunhos = new Map<string, symbol>();
export function limparRascunhosMemoria() { memoriaRascunhos.clear(); gravacoesRascunhos.clear(); }

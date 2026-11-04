import { queryOptions } from "@tanstack/react-query";
import { carregarTiraMimo } from "./mimo-pedido.functions";

export const tiraOptions = queryOptions({
  queryKey: ["mimo-tira"],
  queryFn: () => carregarTiraMimo(),
  staleTime: 60_000,
});

import { queryOptions } from "@tanstack/react-query";
import { listarCodigosCampanhaMimo } from "./mimo-campanhas-codigos.functions";

export const codigosCampanhaOptions = queryOptions({
  queryKey: ["mimo-codigos-campanha"],
  queryFn: () => listarCodigosCampanhaMimo(),
  staleTime: 60_000,
});

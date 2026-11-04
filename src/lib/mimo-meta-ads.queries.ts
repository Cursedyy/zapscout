import { queryOptions } from "@tanstack/react-query";
import { listarImportacoesMetaMimo } from "./mimo-meta-ads.functions";

export const importacoesMetaOptions = queryOptions({
  queryKey: ["mimo-meta-importacoes"],
  queryFn: () => listarImportacoesMetaMimo(),
  staleTime: 60_000,
});

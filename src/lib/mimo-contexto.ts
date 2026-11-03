import { queryOptions } from "@tanstack/react-query";
import { contextoLeadsMimo } from "./mimo-leads.functions";
export const contextoMimoOptions = queryOptions({
  queryKey: ["mimo-leads-contexto"],
  queryFn: () => contextoLeadsMimo(),
});

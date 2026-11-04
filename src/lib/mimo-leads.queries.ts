import { queryOptions } from "@tanstack/react-query";
import { listarLeadsMimo, type FiltrosMimo } from "./mimo-leads.functions";

export const filtrosIniciais: FiltrosMimo = {
  busca: "",
  inicio: null,
  fim: null,
  origem: "",
  perfil: "",
  etapa: "",
  responsavel: "",
  pagina: 0,
};
export const leadsMimoOptions = (usuario: string, filtros: FiltrosMimo) =>
  queryOptions({
    queryKey: ["mimo-leads", usuario, filtros],
    queryFn: () => listarLeadsMimo({ data: filtros }),
    staleTime: 60_000,
  });

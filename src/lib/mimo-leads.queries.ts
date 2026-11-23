import { queryOptions } from "@tanstack/react-query";
import { leadsEmEsperaMimo, listarLeadsMimo, meusLeadsPendentesMimo, type FiltrosMimo } from "./mimo-leads.functions";

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
// A fila é compartilhada, então a chave não depende do usuário; sai quando um vendedor assume.
export const leadsEmEsperaMimoOptions = queryOptions({
  queryKey: ["mimo-leads-espera"],
  queryFn: () => leadsEmEsperaMimo(),
  staleTime: 10_000,
  refetchInterval: 15_000,
});
// Pendências do vendedor logado: entram no mesmo pop-up da fila.
export const leadsPendentesMimoOptions = queryOptions({
  queryKey: ["mimo-leads-pendentes"],
  queryFn: () => meusLeadsPendentesMimo(),
  staleTime: 10_000,
  refetchInterval: 30_000,
});
export const leadsMimoOptions = (usuario: string, filtros: FiltrosMimo) =>
  queryOptions({
    queryKey: ["mimo-leads", usuario, filtros],
    queryFn: () => listarLeadsMimo({ data: filtros }),
    staleTime: 60_000,
  });

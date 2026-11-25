import { queryOptions } from "@tanstack/react-query";
import { mensagensLeadWhatsAppMimo } from "./mimo-whatsapp.functions";

export const conversaLeadOptions = (
  usuarioId: string,
  leadId: string,
  pagina = 0,
  empresaId?: string,
) =>
  queryOptions({
    queryKey: [
      "mimo-whatsapp-mensagens",
      usuarioId,
      leadId,
      pagina,
      ...(empresaId ? [empresaId] : []),
    ],
    queryFn: ({ signal }) => mensagensLeadWhatsAppMimo({ data: { leadId, pagina }, signal }),
    staleTime: pagina === 0 ? 5_000 : 60_000,
    retry: false,
  });

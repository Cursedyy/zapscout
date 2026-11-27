import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Remessa = { empresa_id: string; pedido_id: string; codigo: string; servico: string };
type BancoFrenet = {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: {
      mimo_frenet_remessas: { Row: Remessa; Insert: never; Update: never; Relationships: [] };
    };
    Functions: {
      mimo_frenet_vincular_remessa: {
        Args: {
          _empresa: string;
          _ator: string;
          _pedido: string;
          _codigo: string;
          _servico: string;
          _codigo_anterior: string | null;
          _servico_anterior: string | null;
        };
        Returns: undefined;
      };
    };
  };
};

export function bancoRastreamentoFrenet(client: SupabaseClient<Database>) {
  return client as unknown as SupabaseClient<BancoFrenet>;
}

const respostaSchema = z.object({
  TrackingNumber: z.string().nullish(),
  ErrorMessage: z.string().nullish(),
  TrackingEvents: z
    .array(
      z.object({
        EventDateTime: z.string().max(100).nullish(),
        EventDescription: z.string().trim().min(1).max(2000),
        EventLocation: z.string().max(300).nullish(),
      }),
    )
    .max(1000)
    .nullish(),
});

export function tokenRastreamentoFrenet() {
  return process.env.MIMO_FRENET_TOKEN?.trim() || null;
}

export async function consultarEventosFrenet(
  codigo: string,
  servico: string,
  token: string,
  enviar: typeof fetch = fetch,
) {
  let resposta: Response;
  try {
    resposta = await enviar("https://api.frenet.com.br/tracking/trackinginfo", {
      method: "POST",
      headers: { token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ShippingServiceCode: servico, TrackingNumber: codigo }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw Error("Não foi possível consultar a Frenet. Tente novamente.");
  }
  if (resposta.status === 401 || resposta.status === 403) {
    throw Error("A Frenet recusou a conexão da conta. Peça à gestão para verificar.");
  }
  if (resposta.status === 429) {
    throw Error("O limite de consultas da Frenet foi atingido. Tente novamente em instantes.");
  }
  if (!resposta.ok) throw Error("A consulta de rastreio na Frenet está indisponível.");
  const payload = respostaSchema.safeParse(await resposta.json().catch(() => null));
  if (!payload.success) throw Error("A Frenet retornou uma resposta inválida.");
  if (payload.data.ErrorMessage?.trim()) {
    throw Error(
      "A Frenet não conseguiu localizar o envio. Confira o código de rastreio e o serviço.",
    );
  }
  if (
    payload.data.TrackingNumber?.trim() &&
    payload.data.TrackingNumber.trim().toUpperCase() !== codigo
  ) {
    throw Error("A Frenet retornou dados de outro código de rastreio.");
  }
  if (!payload.data.TrackingEvents && !payload.data.TrackingNumber?.trim()) {
    throw Error("A Frenet retornou uma resposta inválida.");
  }
  return (payload.data.TrackingEvents ?? []).map((evento) => ({
    data: evento.EventDateTime ?? null,
    descricao: evento.EventDescription,
    local: evento.EventLocation ?? null,
  }));
}

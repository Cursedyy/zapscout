import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  anularInvestimentoSchema,
  codigoCampanhaSchema,
  investimentoManualSchema,
} from "@/lib/mimo-campanhas-codigos";

export const listarCodigosCampanhaMimo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listarCodigosCampanha } = await import("@/lib/mimo-campanhas-codigos.server");
    return listarCodigosCampanha(context.supabase, context.userId);
  });

export const salvarCodigoCampanhaMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => codigoCampanhaSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { salvarCodigoCampanha } = await import("@/lib/mimo-campanhas-codigos.server");
    return salvarCodigoCampanha(context.supabase, context.userId, data);
  });

export const lancarInvestimentoCodigoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => investimentoManualSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { lancarInvestimentoCodigo } = await import("@/lib/mimo-campanhas-codigos.server");
    return lancarInvestimentoCodigo(context.supabase, context.userId, data);
  });

export const anularInvestimentoCodigoMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => anularInvestimentoSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { anularInvestimentoCodigo } = await import("@/lib/mimo-campanhas-codigos.server");
    return anularInvestimentoCodigo(context.supabase, context.userId, data);
  });

export const preencherHistoricoCodigosMimo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { preencherHistoricoCodigos } = await import("@/lib/mimo-campanhas-codigos.server");
    return preencherHistoricoCodigos(context.supabase, context.userId);
  });

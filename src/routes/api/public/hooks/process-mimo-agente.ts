import { createFileRoute } from "@tanstack/react-router";
import { gateCronHook } from "@/lib/hook-gate.server";
export const Route = createFileRoute("/api/public/hooks/process-mimo-agente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-mimo-agente");
        if (gate) return gate;
        try {
          const { executarAgenteMimo } = await import("@/lib/mimo-agente-worker.server");
          return Response.json(
            { resultado: await executarAgenteMimo() },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch {
          return Response.json(
            { erro: "agente_processamento_falhou" },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});

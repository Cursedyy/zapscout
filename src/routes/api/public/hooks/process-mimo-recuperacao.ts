import { createFileRoute } from "@tanstack/react-router";
import { gateCronHook } from "@/lib/hook-gate.server";
export const Route = createFileRoute("/api/public/hooks/process-mimo-recuperacao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await gateCronHook(request, "process-mimo-recuperacao");
        if (gate) return gate;
        try {
          const { executarRecuperacaoMimo } = await import("@/lib/mimo-recuperacao-worker.server");
          return Response.json(
            { resultado: await executarRecuperacaoMimo() },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          console.error("[mimo-recuperacao] processamento_falhou");
          const codigo =
            error instanceof Error && /^recuperacao_[a-z_]+$/.test(error.message)
              ? error.message
              : "processamento_falhou";
          return Response.json({ erro: codigo }, { status: 503 });
        }
      },
    },
  },
});

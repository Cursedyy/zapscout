import { createFileRoute } from "@tanstack/react-router";
import { receberInscricaoRepresentante } from "@/lib/mimo-representantes.server";
export const Route = createFileRoute("/api/public/mimo-representantes")({
  server: { handlers: { POST: ({ request }) => receberInscricaoRepresentante(request) } },
});

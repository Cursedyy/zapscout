import { createFileRoute } from "@tanstack/react-router";
import { receberInscricaoInfluenciador } from "@/lib/mimo-influenciadores.server";
export const Route = createFileRoute("/api/public/mimo-influenciadores")({
  server: { handlers: { POST: ({ request }) => receberInscricaoInfluenciador(request) } },
});

import { createFileRoute } from "@tanstack/react-router";
import { receberDesenhoMimo } from "@/lib/mimo-campanha-desenhos.server";

export const Route = createFileRoute("/api/public/mimo-campanha-desenhos")({
  server: { handlers: { POST: ({ request }) => receberDesenhoMimo(request) } },
});

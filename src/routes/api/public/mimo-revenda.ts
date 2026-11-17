import { createFileRoute } from "@tanstack/react-router";
import { receberRevenda } from "@/lib/mimo-revenda.server";
export const Route = createFileRoute("/api/public/mimo-revenda")({ server: { handlers: { POST: ({ request }) => receberRevenda(request) } } });


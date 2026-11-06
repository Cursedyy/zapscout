import { createFileRoute } from "@tanstack/react-router";
import { tratarDescadastroGmail } from "@/lib/mimo-gmail.server";
export const Route = createFileRoute("/api/public/mimo-carrinhos-descadastro")({
  server: {
    handlers: {
      GET: ({ request }) => tratarDescadastroGmail(request),
      POST: ({ request }) => tratarDescadastroGmail(request),
    },
  },
});

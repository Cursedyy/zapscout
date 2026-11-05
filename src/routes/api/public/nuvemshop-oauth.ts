import { createFileRoute } from "@tanstack/react-router";
import { callbackOAuthNuvem } from "@/lib/mimo-nuvemshop-oauth.server";
export const Route = createFileRoute("/api/public/nuvemshop-oauth")({
  server: { handlers: { GET: ({ request }) => callbackOAuthNuvem(request) } },
});

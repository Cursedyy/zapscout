import { createFileRoute } from "@tanstack/react-router";
import { callbackGmail } from "@/lib/mimo-gmail.server";
export const Route = createFileRoute("/api/public/mimo-gmail-oauth")({
  server: { handlers: { GET: ({ request }) => callbackGmail(request) } },
});

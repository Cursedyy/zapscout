import { createFileRoute } from "@tanstack/react-router";
import { atenderCodex } from "@/lib/mimo-codex.server";

export const Route = createFileRoute("/api/mimo/codex")({
  server: {
    handlers: {
      GET: ({ request }) => atenderCodex(request),
      POST: ({ request }) => atenderCodex(request),
    },
  },
});

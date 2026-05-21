import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/follow-ups")({
  beforeLoad: () => {
    throw redirect({ to: "/app/sequencias" });
  },
});

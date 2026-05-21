import { createFileRoute } from "@tanstack/react-router";
import { Route as SequenciasRoute } from "./app.sequencias";

export const Route = createFileRoute("/app/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SequenciasRoute.options.component!,
});

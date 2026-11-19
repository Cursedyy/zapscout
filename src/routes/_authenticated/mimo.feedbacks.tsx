import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoFeedbacksPage } from "@/components/mimo-feedbacks-page";

export const Route = createFileRoute("/_authenticated/mimo/feedbacks")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Feedbacks MiMo — ZapScout" }] }),
  component: MimoFeedbacksPage,
});

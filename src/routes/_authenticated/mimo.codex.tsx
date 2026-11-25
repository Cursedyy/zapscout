import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoCodexPage } from "@/components/mimo-codex-page";

export const Route = createFileRoute("/_authenticated/mimo/codex")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Codex — MiMo" }] }),
  component: MimoCodexPage,
});

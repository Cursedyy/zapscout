import { createFileRoute } from "@tanstack/react-router";
import { MimoInfluenciadoresPage } from "@/components/mimo-influenciadores-page";
import { MimoCarregando } from "@/components/mimo-carregando";
export const Route = createFileRoute("/_authenticated/mimo/influenciadores")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Influenciadores MiMo" }] }),
  component: MimoInfluenciadoresPage,
});

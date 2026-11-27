import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoProdutosPage } from "@/components/mimo-produtos-page";
import { tiraOptions } from "@/lib/mimo-tira.queries";

export const Route = createFileRoute("/_authenticated/mimo/produtos")({
  pendingComponent: MimoCarregando,
  pendingMs: 150,
  pendingMinMs: 200,
  loader: async ({ context }) => {
    if (context.mimoAcesso.autorizado) await context.queryClient.ensureQueryData(tiraOptions);
  },
  head: () => ({ meta: [{ title: "Produtos — MiMo" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MimoProdutosPage,
});

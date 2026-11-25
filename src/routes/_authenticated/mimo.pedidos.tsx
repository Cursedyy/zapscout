import { createFileRoute } from "@tanstack/react-router";
import { MimoCarregando } from "@/components/mimo-carregando";
import { MimoPainelPedidos } from "@/components/mimo-painel-pedidos";

export const Route = createFileRoute("/_authenticated/mimo/pedidos")({
  pendingComponent: MimoCarregando,
  head: () => ({ meta: [{ title: "Pedidos — MiMo" }] }),
  component: MimoPainelPedidos,
});

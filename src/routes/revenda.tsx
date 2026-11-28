import { createFileRoute } from "@tanstack/react-router";
import { MimoRevendaForm } from "@/components/mimo-revenda-form";
export const Route = createFileRoute("/revenda")({
  head: () => ({ meta: [
    { title: "Revenda MiMo | Pedido inicial a partir de R$ 1.000,00" },
    { name: "description", content: "Quer comprar MiMo para revender? Conte como pretende vender e fale com nossa equipe. Pedido inicial mínimo de R$ 1.000,00." },
    { property: "og:title", content: "Revenda MiMo · Esse Pode!" },
    { property: "og:description", content: "Pedido inicial mínimo de R$ 1.000,00. Preencha o formulário e converse com nossa equipe." },
    { property: "og:url", content: "https://zapscout.com.br/revenda" },
  ], links: [{ rel: "canonical", href: "https://zapscout.com.br/revenda" }] }),
  component: MimoRevendaForm,
});


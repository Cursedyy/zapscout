import { createFileRoute } from "@tanstack/react-router";
import { MimoRepresentantesForm } from "@/components/mimo-representantes-form";
const titulo = "Seja representante MiMo",
  descricao =
    "Leve a MiMo para novos caminhos. Cadastre sua região de atuação e venha representar a nossa marca.",
  imagem = "https://zapscout.com.br/mimo/representantes-compartilhar-v1.png";
export const Route = createFileRoute("/representantes")({
  head: () => ({
    meta: [
      { title: titulo + " | Cadastre-se" },
      { name: "description", content: descricao },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "MiMo" },
      { property: "og:title", content: titulo },
      { property: "og:description", content: descricao },
      { property: "og:url", content: "https://zapscout.com.br/representantes" },
      { property: "og:image", content: imagem },
      { property: "og:image:secure_url", content: imagem },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "MiMo — Esse Pode! Leve a MiMo para novos caminhos. Cadastre-se para representar a marca.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: titulo },
      { name: "twitter:description", content: descricao },
      { name: "twitter:image", content: imagem },
      { name: "twitter:image:alt", content: titulo },
    ],
    links: [{ rel: "canonical", href: "https://zapscout.com.br/representantes" }],
  }),
  component: MimoRepresentantesForm,
});

import { createFileRoute } from "@tanstack/react-router";
import { MimoInfluenciadoresForm } from "@/components/mimo-influenciadores-form";
export const Route = createFileRoute("/influenciadores")({
  head: () => ({
    meta: [
      { title: "Seja uma influenciadora MiMo | Cadastre seu perfil" },
      {
        name: "description",
        content:
          "Seu conteúdo pode fazer parte da nossa história. Inscreva seu perfil para participar dos lançamentos MiMo.",
      },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:site_name", content: "MiMo" },
      { property: "og:title", content: "Seja uma influenciadora MiMo" },
      {
        property: "og:description",
        content:
          "Participe dos lançamentos MiMo. Cadastre seu perfil e venha criar essa história com a gente.",
      },
      { property: "og:url", content: "https://zapscout.com.br/influenciadores" },
      {
        property: "og:image",
        content: "https://zapscout.com.br/mimo/influenciadores-compartilhar-v1.png",
      },
      {
        property: "og:image:secure_url",
        content: "https://zapscout.com.br/mimo/influenciadores-compartilhar-v1.png",
      },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "MiMo — Esse Pode! Seu conteúdo. Nossa próxima história. Cadastre seu perfil para participar dos lançamentos MiMo.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Seja uma influenciadora MiMo" },
      {
        name: "twitter:description",
        content:
          "Participe dos lançamentos MiMo. Cadastre seu perfil e venha criar essa história com a gente.",
      },
      {
        name: "twitter:image",
        content: "https://zapscout.com.br/mimo/influenciadores-compartilhar-v1.png",
      },
      {
        name: "twitter:image:alt",
        content: "Convite para criadoras: participe dos lançamentos MiMo.",
      },
    ],
    links: [{ rel: "canonical", href: "https://zapscout.com.br/influenciadores" }],
  }),
  component: MimoInfluenciadoresForm,
});

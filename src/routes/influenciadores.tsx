import { createFileRoute } from "@tanstack/react-router";
import { MimoInfluenciadoresForm } from "@/components/mimo-influenciadores-form";
export const Route = createFileRoute("/influenciadores")({
  head: () => ({
    meta: [
      { title: "Influenciadoras MiMo | Participe da campanha" },
      { name: "description", content: "Inscreva seu perfil para participar dos lançamentos MiMo." },
    ],
  }),
  component: MimoInfluenciadoresForm,
});

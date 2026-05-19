import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

export const Route = createFileRoute("/para/advocacia")({
  head: () => ({
    meta: [
      { title: "Prospecção para advocacia — ZapScout" },
      { name: "description", content: "Encontre empresas e profissionais por região e ofereça serviços jurídicos pelo WhatsApp. Captação ativa para escritórios de advocacia." },
      { property: "og:title", content: "Prospecção para advocacia — ZapScout" },
      { property: "og:description", content: "Captação ativa de clientes para escritórios de advocacia, com mapa e WhatsApp." },
      { property: "og:url", content: "/para/advocacia" },
    ],
    links: [{ rel: "canonical", href: "/para/advocacia" }],
  }),
  component: AdvocaciaPage,
});

function AdvocaciaPage() {
  return (
    <MarketingPage
      currentPath="/para/advocacia"
      eyebrow="⚖️ Para escritórios de advocacia"
      title={<>Capte clientes jurídicos por <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>região</span></>}
      subtitle="Encontre empresas e profissionais autônomos na sua cidade, abra conversas no WhatsApp e ofereça seus serviços com follow-up automático."
    >
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {[
          { title: "Empresas por segmento", desc: "Filtre comércios e indústrias que precisam de assessoria trabalhista, tributária ou empresarial." },
          { title: "Abordagem por WhatsApp", desc: "Mensagens com tom profissional, variáveis e horários inteligentes para escritórios." },
          { title: "Follow-up automático", desc: "A IA acompanha leads frios e devolve aos quentes para sua agenda." },
        ].map((c) => (
          <div key={c.title} className="card-glow rounded-[20px] p-6"
            style={{ background: "var(--gradient-card)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-card)" }}>
            <h2 className="font-display font-semibold text-lg mb-2">{c.title}</h2>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}

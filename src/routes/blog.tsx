import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";
import { getNichePages, getFeaturePages } from "@/content/site-graph";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog ZapScout — guias de prospecção e WhatsApp" },
      { name: "description", content: "Guias práticos de prospecção ativa, disparo no WhatsApp e captação de clientes por nicho." },
      { property: "og:title", content: "Blog ZapScout" },
      { property: "og:description", content: "Guias práticos de prospecção, WhatsApp e captação por nicho." },
      { property: "og:url", content: "/blog" },
    ],
    links: [{ rel: "canonical", href: "/blog" }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const niches = getNichePages();
  const features = getFeaturePages();
  return (
    <MarketingPage
      currentPath="/blog"
      eyebrow="📚 Centro de aprendizado"
      title={<>Guias de prospecção e <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>WhatsApp</span></>}
      subtitle="Conteúdo prático para encontrar clientes, abordar pelo WhatsApp e fechar mais vendas."
    >
      <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
        <h2 className="md:col-span-2 font-display text-xl font-semibold mt-4">Por nicho</h2>
        {niches.map((n) => (
          <Link key={n.path} to={n.path} className="card-glow rounded-[20px] p-6 transition-transform hover:-translate-y-1"
            style={{ background: "var(--gradient-card)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-card)" }}>
            <h3 className="font-display font-semibold text-lg mb-1.5">{n.title}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{n.description}</p>
          </Link>
        ))}
        <h2 className="md:col-span-2 font-display text-xl font-semibold mt-6">Recursos</h2>
        {features.map((f) => (
          <Link key={f.path} to={f.path} className="card-glow rounded-[20px] p-6 transition-transform hover:-translate-y-1"
            style={{ background: "var(--gradient-card)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-card)" }}>
            <h3 className="font-display font-semibold text-lg mb-1.5">{f.title}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{f.description}</p>
          </Link>
        ))}
      </div>
    </MarketingPage>
  );
}

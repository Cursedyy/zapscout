import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

export const Route = createFileRoute("/para/energia-solar")({
  head: () => ({
    meta: [
      { title: "Prospecção para energia solar — ZapScout" },
      { name: "description", content: "Encontre comércios e indústrias com alto consumo elétrico em cada cidade e feche projetos solares pelo WhatsApp." },
      { property: "og:title", content: "Prospecção para energia solar — ZapScout" },
      { property: "og:description", content: "Captação ativa de leads B2B para instaladoras de energia solar." },
      { property: "og:url", content: "/para/energia-solar" },
    ],
    links: [{ rel: "canonical", href: "/para/energia-solar" }],
  }),
  component: EnergiaSolarPage,
});

function EnergiaSolarPage() {
  return (
    <MarketingPage
      currentPath="/para/energia-solar"
      eyebrow="☀️ Para instaladoras de energia solar"
      title={<>Encontre comércios e indústrias com <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>alta conta de luz</span></>}
      subtitle="Mapeie supermercados, postos, indústrias e galpões na sua região e ofereça simulação de economia direto no WhatsApp do decisor."
    >
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {[
          { title: "Segmentos de alto consumo", desc: "Supermercados, indústrias, postos, galpões — todos no mapa interativo." },
          { title: "Pitch via WhatsApp", desc: "Envie simulação de economia com variáveis da empresa-alvo." },
          { title: "Pipeline visual", desc: "Acompanhe propostas, visitas e fechamentos sem planilha." },
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

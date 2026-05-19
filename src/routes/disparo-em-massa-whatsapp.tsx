import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

export const Route = createFileRoute("/disparo-em-massa-whatsapp")({
  head: () => ({
    meta: [
      { title: "Disparo em massa no WhatsApp com prospecção geolocalizada — ZapScout" },
      { name: "description", content: "Encontre leads no mapa do Brasil e dispare mensagens personalizadas no WhatsApp com follow-ups automáticos. Sem listas frias." },
      { property: "og:title", content: "Disparo em massa no WhatsApp — ZapScout" },
      { property: "og:description", content: "Disparo no WhatsApp com leads quentes encontrados no mapa." },
      { property: "og:url", content: "/disparo-em-massa-whatsapp" },
    ],
    links: [{ rel: "canonical", href: "/disparo-em-massa-whatsapp" }],
  }),
  component: DisparoPage,
});

function DisparoPage() {
  return (
    <MarketingPage
      currentPath="/disparo-em-massa-whatsapp"
      eyebrow="📣 Disparo em massa inteligente"
      title={<>Disparo no <span style={{ background: "var(--gradient-zap)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>WhatsApp</span> com leads quentes do mapa</>}
      subtitle="Ao invés de comprar listas frias, encontre empresas reais no Google Maps por nicho e região e converse personalizadamente — com follow-up automático."
    >
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {[
          { title: "Leads do Google Maps", desc: "Sem listas vencidas. Cada lead vem com nome, endereço e categoria." },
          { title: "Variáveis e templates", desc: "Personalize a mensagem com nome da empresa, cidade e segmento." },
          { title: "Cadência inteligente", desc: "Ritmo controlado para evitar bloqueio e maximizar resposta." },
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

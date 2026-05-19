import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";

export const Route = createFileRoute("/para/corretor-de-imoveis")({
  head: () => ({
    meta: [
      { title: "Prospecção para corretor de imóveis — ZapScout" },
      { name: "description", content: "Capte proprietários, condomínios e empresas por região e abra conversa no WhatsApp. Prospecção ativa para corretores de imóveis." },
      { property: "og:title", content: "Prospecção para corretor de imóveis — ZapScout" },
      { property: "og:description", content: "Capte imóveis e clientes na sua região com mapa e WhatsApp." },
      { property: "og:url", content: "/para/corretor-de-imoveis" },
    ],
    links: [{ rel: "canonical", href: "/para/corretor-de-imoveis" }],
  }),
  component: CorretorPage,
});

function CorretorPage() {
  return (
    <MarketingPage
      currentPath="/para/corretor-de-imoveis"
      eyebrow="🏠 Para corretores de imóveis"
      title={<>Capte imóveis e clientes no <span style={{ background: "var(--gradient-primary)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>seu bairro</span></>}
      subtitle="Encontre condomínios, imobiliárias parceiras e empresas em expansão. Abra conversa no WhatsApp com pitch personalizado por bairro."
    >
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {[
          { title: "Busca por bairro", desc: "Filtre por raio e tipo de imóvel direto no mapa do Brasil." },
          { title: "Mensagens de captação", desc: "Templates de captação de imóveis e oferta de visita pelo WhatsApp." },
          { title: "Lembretes de follow-up", desc: "Nunca esqueça de retornar para um lead morno. A IA cuida." },
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

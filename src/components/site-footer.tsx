import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { getNichePages, getFeaturePages, APP_PAGES, SITE } from "@/content/site-graph";

function FooterLogo() {
  return (
    <svg width={24} height={24} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#8A47EA" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="6" fill="#8A47EA" />
      <circle cx="16" cy="16" r="11" stroke="#8A47EA" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" />
    </svg>
  );
}

/**
 * Sitewide mega-footer. Driven by the site graph: adding a new niche/feature
 * landing automatically links it from every marketing page.
 */
export function SiteFooter() {
  const niches = getNichePages();
  const features = getFeaturePages();
  const blog = SITE.find((n) => n.kind === "blog");

  return (
    <footer
      style={{ background: "var(--color-bg-surface)", borderTop: "1px solid var(--color-border-subtle)" }}
    >
      <div className="container mx-auto px-6 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand + CTA */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <FooterLogo />
              <span className="font-display font-bold" style={{ color: "var(--color-primary-light)" }}>
                ZapScout
              </span>
            </Link>
            <p className="text-sm mb-5 max-w-sm" style={{ color: "var(--color-text-secondary)" }}>
              Prospecção ativa no mapa do Brasil com disparo no WhatsApp e follow-ups automáticos.
            </p>
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-pill px-5 py-2.5 font-display font-semibold text-white text-sm"
              style={{ background: "var(--gradient-zap)" }}
            >
              <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
            </a>
          </div>

          {/* Niches */}
          <FooterColumn title="Por nicho">
            {niches.map((n) => (
              <FooterLink key={n.path} to={n.path}>{n.short}</FooterLink>
            ))}
          </FooterColumn>

          {/* Features + blog */}
          <FooterColumn title="Recursos">
            {features.map((f) => (
              <FooterLink key={f.path} to={f.path}>{f.short}</FooterLink>
            ))}
            {blog && <FooterLink to={blog.path}>{blog.short}</FooterLink>}
          </FooterColumn>

          {/* App pages (deep linking for logged-in users) */}
          <FooterColumn title="Plataforma">
            {APP_PAGES.map((p) => (
              <FooterLink key={p.path} to={p.path}>{p.short}</FooterLink>
            ))}
            <FooterLink to="/login">Entrar</FooterLink>
            <FooterLink to="/cadastro">Criar conta</FooterLink>
          </FooterColumn>
        </div>

        <div
          className="mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs"
          style={{ borderTop: "1px solid var(--color-border-subtle)", color: "var(--color-text-muted)" }}
        >
          <p>© {new Date().getFullYear()} ZapScout. Todos os direitos reservados.</p>
          <p>Prospecte. Conecte. Venda.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        className="font-display text-xs uppercase tracking-wider mb-3"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="text-sm transition-colors hover:text-foreground"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {children}
      </Link>
    </li>
  );
}

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { RelatedLinks } from "@/components/related-links";
import { ArrowRight } from "lucide-react";

function HeaderLogo() {
  return (
    <svg width={28} height={28} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#6050D6" fillOpacity="0.15" />
      <circle cx="16" cy="16" r="6" fill="#6050D6" />
      <circle cx="16" cy="16" r="11" stroke="#6050D6" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" />
    </svg>
  );
}

export function MarketingHeader() {
  return (
    <>
      <div
        className="w-full text-center text-xs font-medium py-1.5 px-4"
        style={{
          background: "linear-gradient(90deg, #f59e0b, #f97316)",
          color: "#0f0f0f",
        }}
      >
        🚀 Você está acessando o ZapScout em versão Beta — preços especiais de lançamento por tempo limitado.
      </div>
      <header
        className="sticky top-0 z-20 border-b"
        style={{
          background: "rgba(12,10,20,0.8)",
          backdropFilter: "blur(20px)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <HeaderLogo />
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg leading-none" style={{ color: "var(--color-primary-light)" }}>
                ZapScout
              </span>
              <span className="mt-0.5 inline-flex items-center self-start rounded bg-amber-400/90 px-1 py-[1px] text-[9px] font-bold uppercase tracking-wider text-amber-950">
                BETA
              </span>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Entrar</Button></Link>
            <Link to="/cadastro">
              <Button className="rounded-pill shadow-glow font-display" style={{ background: "var(--gradient-primary)" }}>
                Começar grátis
              </Button>
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}

interface MarketingPageProps {
  currentPath: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Shared shell for niche landings, feature landings, blog index, etc.
 * Renders header + hero + body + RelatedLinks + SiteFooter so every
 * marketing page gets consistent interlinking automatically.
 */
export function MarketingPage({ currentPath, eyebrow, title, subtitle, children }: MarketingPageProps) {
  return (
    <div className="min-h-dvh text-foreground" style={{ background: "var(--gradient-hero)" }}>
      <MarketingHeader />

      <section className="container mx-auto px-6 pt-16 pb-12 text-center max-w-3xl">
        {eyebrow && (
          <div
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs mb-5"
            style={{
              background: "var(--color-primary-glow)",
              color: "var(--color-primary-light)",
              border: "1px solid rgba(96,80,214,0.3)",
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
          {title}
        </h1>
        <p className="mt-5 text-lg" style={{ color: "var(--color-text-secondary)" }}>
          {subtitle}
        </p>
        <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/cadastro">
            <Button size="lg" className="rounded-pill shadow-glow font-display" style={{ background: "var(--gradient-primary)" }}>
              Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline" className="rounded-pill font-display">Entrar</Button>
          </Link>
        </div>
      </section>

      {children && <div className="container mx-auto px-6 pb-12">{children}</div>}

      <RelatedLinks currentPath={currentPath} />
      <SiteFooter />
    </div>
  );
}

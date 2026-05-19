import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-page";
import { SiteFooter } from "@/components/site-footer";
import { RelatedLinks } from "@/components/related-links";

// ──────────────────────────────────────────────────────────────────────────
// Landing template — composes building blocks from a single config object.
// To create a new landing: define a `LandingConfig` and pass to <LandingTemplate />.
// See src/templates/landing.example.tsx for a copy-paste starter.
// ──────────────────────────────────────────────────────────────────────────

export interface FeatureItem {
  icon?: LucideIcon;
  title: string;
  description: string;
}

export interface StepItem {
  title: string;
  description: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface TestimonialItem {
  quote: string;
  author: string;
  role?: string;
}

export interface CTAConfig {
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
}

export interface LandingConfig {
  /** Required for sitemap / related links / canonical / og:url */
  currentPath: string;
  /** Hero */
  eyebrow?: string;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  cta?: CTAConfig;
  /** Optional sections — omit any to skip rendering */
  features?: { title?: string; items: FeatureItem[] };
  steps?: { title?: string; items: StepItem[] };
  bullets?: { title: string; items: string[] };
  testimonials?: { title?: string; items: TestimonialItem[] };
  faq?: { title?: string; items: FAQItem[] };
  finalCta?: { title: string; subtitle?: string; cta: CTAConfig };
  /** Related links auto-picked from site graph — pass false to hide */
  showRelated?: boolean;
}

const DEFAULT_CTA: CTAConfig = {
  primary: { label: "Começar grátis", to: "/cadastro" },
  secondary: { label: "Entrar", to: "/login" },
};

export function LandingTemplate(cfg: LandingConfig) {
  const cta = cfg.cta ?? DEFAULT_CTA;
  return (
    <div className="min-h-dvh text-foreground" style={{ background: "var(--gradient-hero)" }}>
      <MarketingHeader />
      <HeroSection {...cfg} cta={cta} />
      {cfg.features && <FeaturesSection {...cfg.features} />}
      {cfg.steps && <StepsSection {...cfg.steps} />}
      {cfg.bullets && <BulletsSection {...cfg.bullets} />}
      {cfg.testimonials && <TestimonialsSection {...cfg.testimonials} />}
      {cfg.faq && <FAQSection {...cfg.faq} />}
      {cfg.finalCta && <FinalCTASection {...cfg.finalCta} />}
      {cfg.showRelated !== false && <RelatedLinks currentPath={cfg.currentPath} />}
      <SiteFooter />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Building blocks — also exported so you can compose ad-hoc pages.
// ──────────────────────────────────────────────────────────────────────────

export function HeroSection({
  eyebrow,
  title,
  subtitle,
  cta,
}: Pick<LandingConfig, "eyebrow" | "title" | "subtitle"> & { cta: CTAConfig }) {
  return (
    <section className="container mx-auto px-6 pt-16 pb-16 text-center max-w-3xl relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(rgba(168,124,240,0.18) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />
      <div className="relative">
        {eyebrow && (
          <div
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs mb-5"
            style={{
              background: "var(--color-primary-glow)",
              color: "var(--color-primary-light)",
              border: "1px solid rgba(138,71,234,0.3)",
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
        <CTAGroup cta={cta} className="mt-7 justify-center" />
      </div>
    </section>
  );
}

export function FeaturesSection({ title, items }: { title?: string; items: FeatureItem[] }) {
  return (
    <section className="container mx-auto px-6 py-14">
      {title && <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">{title}</h2>}
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {items.map((f) => (
          <div
            key={f.title}
            className="card-glow rounded-[20px] p-6"
            style={{
              background: "var(--gradient-card)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            {f.icon && (
              <div
                className="grid place-items-center h-10 w-10 rounded-lg mb-4"
                style={{ background: "var(--color-primary-glow)", color: "var(--color-primary-light)" }}
              >
                <f.icon className="h-5 w-5" />
              </div>
            )}
            <h3 className="font-display font-semibold text-lg mb-1.5">{f.title}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StepsSection({ title = "Como funciona", items }: { title?: string; items: StepItem[] }) {
  return (
    <section className="container mx-auto px-6 py-14">
      <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">{title}</h2>
      <ol className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {items.map((s, i) => (
          <li
            key={s.title}
            className="rounded-[20px] p-6 relative"
            style={{
              background: "var(--gradient-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              className="absolute -top-3 -left-3 h-9 w-9 grid place-items-center rounded-full font-display font-bold"
              style={{ background: "var(--gradient-primary)", color: "white" }}
            >
              {i + 1}
            </div>
            <h3 className="font-display font-semibold text-lg mb-1.5 mt-2">{s.title}</h3>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{s.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BulletsSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="container mx-auto px-6 py-14 max-w-3xl">
      <h2 className="font-display text-2xl md:text-3xl font-bold mb-6">{title}</h2>
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b} className="flex items-start gap-3">
            <Check className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "var(--color-primary-light)" }} />
            <span style={{ color: "var(--color-text-secondary)" }}>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TestimonialsSection({ title = "O que dizem", items }: { title?: string; items: TestimonialItem[] }) {
  return (
    <section className="container mx-auto px-6 py-14">
      <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">{title}</h2>
      <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
        {items.map((t) => (
          <figure
            key={t.quote}
            className="rounded-[20px] p-6"
            style={{ background: "var(--gradient-card)", border: "1px solid var(--color-border)" }}
          >
            <blockquote className="text-base leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-4 text-sm font-medium">
              {t.author}
              {t.role && <span style={{ color: "var(--color-text-muted)" }}> — {t.role}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function FAQSection({ title = "Perguntas frequentes", items }: { title?: string; items: FAQItem[] }) {
  return (
    <section className="container mx-auto px-6 py-14 max-w-3xl">
      <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-8">{title}</h2>
      <div className="space-y-3">
        {items.map((q) => (
          <details
            key={q.question}
            className="group rounded-[16px] p-5 cursor-pointer"
            style={{ background: "var(--gradient-card)", border: "1px solid var(--color-border)" }}
          >
            <summary className="font-display font-semibold list-none flex items-center justify-between gap-4">
              <span>{q.question}</span>
              <span
                aria-hidden
                className="text-xl transition-transform group-open:rotate-45"
                style={{ color: "var(--color-primary-light)" }}
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>{q.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function FinalCTASection({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle?: string;
  cta: CTAConfig;
}) {
  return (
    <section className="container mx-auto px-6 py-16">
      <div
        className="rounded-[24px] p-10 text-center max-w-3xl mx-auto"
        style={{
          background: "var(--gradient-primary)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        <h2 className="font-display text-2xl md:text-3xl font-extrabold text-white">{title}</h2>
        {subtitle && <p className="mt-3 text-white/85">{subtitle}</p>}
        <CTAGroup cta={cta} className="mt-6 justify-center" variant="onPrimary" />
      </div>
    </section>
  );
}

function CTAGroup({
  cta,
  className = "",
  variant = "default",
}: {
  cta: CTAConfig;
  className?: string;
  variant?: "default" | "onPrimary";
}) {
  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      {cta.primary && (
        <Link to={cta.primary.to}>
          <Button
            size="lg"
            className="rounded-pill shadow-glow font-display"
            style={
              variant === "onPrimary"
                ? { background: "white", color: "var(--color-primary)" }
                : { background: "var(--gradient-primary)" }
            }
          >
            {cta.primary.label} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      )}
      {cta.secondary && (
        <Link to={cta.secondary.to}>
          <Button
            size="lg"
            variant="outline"
            className="rounded-pill font-display"
            style={variant === "onPrimary" ? { borderColor: "rgba(255,255,255,0.6)", color: "white" } : undefined}
          >
            {cta.secondary.label}
          </Button>
        </Link>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// JSON-LD helpers — drop into the route's head().scripts array.
// ──────────────────────────────────────────────────────────────────────────

/** Build a FAQPage JSON-LD payload from the same items the FAQ section uses. */
export function faqJsonLd(items: FAQItem[]) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: { "@type": "Answer", text: q.answer },
      })),
    }),
  };
}

/** Build a BreadcrumbList JSON-LD payload. Pass `[{name, item}]` from root → current. */
export function breadcrumbJsonLd(trail: { name: string; item: string }[]) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t.name,
        item: t.item,
      })),
    }),
  };
}

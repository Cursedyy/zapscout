import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { getRelatedLinks } from "@/content/site-graph";

interface RelatedLinksProps {
  currentPath: string;
  title?: string;
  limit?: number;
}

/**
 * Auto-picked "see also" grid. Sourced from the site graph so adding a new
 * landing/blog post wires it into every related page without manual links.
 */
export function RelatedLinks({ currentPath, title = "Veja também", limit = 3 }: RelatedLinksProps) {
  const items = getRelatedLinks(currentPath, limit);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="related-links-title"
      className="container mx-auto px-6 py-16"
    >
      <h2
        id="related-links-title"
        className="font-display text-2xl md:text-3xl font-bold mb-8"
      >
        {title}
      </h2>
      <div className="grid md:grid-cols-3 gap-5">
        {items.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="group card-glow rounded-[20px] p-6 transition-transform hover:-translate-y-1"
            style={{
              background: "var(--gradient-card)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide mb-3"
              style={{
                background: "var(--color-primary-glow)",
                color: "var(--color-primary-light)",
              }}
            >
              {item.kind === "niche" ? "Por nicho" : item.kind === "blog" ? "Guia" : item.kind === "feature" ? "Recurso" : "Plataforma"}
            </div>
            <h3 className="font-display font-semibold text-lg mb-1.5 leading-snug">
              {item.title}
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
              {item.description}
            </p>
            <span
              className="inline-flex items-center gap-1 text-sm font-medium transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--color-primary-light)" }}
            >
              Acessar <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="relative flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8 pb-5 border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 -left-6 h-24 w-48 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.30), transparent)" }}
      />
      <div className="min-w-0 relative">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight font-display text-gradient-primary">
          {title}
        </h1>
        {subtitle && <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2 relative">{children}</div>}
    </div>
  );
}

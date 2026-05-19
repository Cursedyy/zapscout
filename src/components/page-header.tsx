export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-display">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

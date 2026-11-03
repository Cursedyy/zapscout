/** Mantém o espaço da seção durante navegação e consultas iniciais. */
export function MimoCarregando() {
  return <div role="status" aria-live="polite" aria-label="Carregando seção MiMo" className="space-y-6 px-4 py-6 md:px-8 md:py-8">
    <span className="sr-only">Carregando…</span>
    <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-3">{[0,1,2].map(i=><div key={i} className="h-24 rounded-lg border border-border bg-muted/40" />)}</div>
      <div className="space-y-3 rounded-lg border border-border p-4">{[0,1,2,3,4].map(i=><div key={i} className="h-10 rounded bg-muted/50" />)}</div>
    </div>
  </div>;
}

import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export function MimoVazio({ titulo, subtitulo, icon: Icon, texto }: { titulo: string; subtitulo: string; icon: LucideIcon; texto: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title={titulo} subtitle={subtitulo} />
      <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary-glow">
            <Icon className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Ainda não há dados</h2>
          <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
        </div>
      </div>
    </div>
  );
}
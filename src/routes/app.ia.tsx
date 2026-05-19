import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/ia")({ component: IAPage });

function IAPage() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <PageHeader title="Sugestões da IA" subtitle="Próximas ações recomendadas para seus leads." />
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="grid place-items-center h-14 w-14 rounded-2xl bg-primary/15 text-primary mx-auto mb-4">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="font-semibold mb-1">Nenhuma sugestão pendente</h2>
        <p className="text-sm text-muted-foreground">Quando seus leads responderem, a IA gerará sugestões aqui.</p>
      </div>
    </div>
  );
}

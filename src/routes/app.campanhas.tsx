import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Send, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: CampanhasPage,
});

const STATUS_CLS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  agendada: "bg-info/15 text-info",
  em_andamento: "bg-warning/15 text-warning",
  pausada: "bg-muted text-muted-foreground",
  concluida: "bg-success/15 text-success",
};

function CampanhasPage() {
  const qc = useQueryClient();
  const { data: campanhas } = useQuery({
    queryKey: ["campanhas"],
    queryFn: async () => {
      const { data } = await supabase.from("campanhas").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Campanhas" subtitle="Crie e gerencie envios automáticos no WhatsApp.">
        <NovaCampanha onCreated={() => qc.invalidateQueries({ queryKey: ["campanhas"] })} />
      </PageHeader>

      <div className="grid md:grid-cols-2 gap-4">
        {(campanhas ?? []).length === 0 && (
          <div className="md:col-span-2 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Nenhuma campanha criada. Clique em "Nova campanha".
          </div>
        )}
        {(campanhas ?? []).map((c) => (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">{c.nome}</h3>
                <p className="text-xs text-muted-foreground">{c.segmento_alvo ?? "Todos segmentos"}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_CLS[c.status]}`}>{c.status}</span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{c.mensagem}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {c.limite_por_hora}/h</span>
              <Button size="sm" variant="outline"><Send className="h-3 w-3 mr-1" /> Iniciar</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NovaCampanha({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", segmento_alvo: "", mensagem: "Olá {{nome_empresa}}! Vi que vocês atuam em {{cidade}} no segmento de {{segmento}}." });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("campanhas").insert({ user_id: u.user!.id, ...form });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha criada");
      setOpen(false);
      onCreated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nova campanha</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="space-y-2"><Label>Segmento alvo</Label><Input value={form.segmento_alvo} onChange={(e) => setForm({ ...form, segmento_alvo: e.target.value })} placeholder="Ex: clínicas" /></div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea rows={5} value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
            <p className="text-xs text-muted-foreground">Variáveis: {"{{nome_empresa}}, {{cidade}}, {{segmento}}, {{tem_site}}"}</p>
          </div>
          <Button className="w-full" disabled={!form.nome || !form.mensagem || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Salvando..." : "Criar campanha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Star, Globe, GlobeLock, Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";


export const Route = createFileRoute("/app/leads")({
  component: LeadsPage,
});

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "bg-info/15 text-info" },
  mensagem_enviada: { label: "Mensagem enviada", cls: "bg-warning/15 text-warning" },
  respondeu_positivo: { label: "Respondeu (positivo)", cls: "bg-success/15 text-success" },
  respondeu_negativo: { label: "Respondeu (negativo)", cls: "bg-destructive/15 text-destructive" },
  sem_resposta: { label: "Sem resposta", cls: "bg-muted text-muted-foreground" },
  convertido: { label: "Convertido", cls: "bg-primary/20 text-primary" },
  descartado: { label: "Descartado", cls: "bg-muted text-muted-foreground" },
};

function LeadsPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroSite, setFiltroSite] = useState<string>("");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtrados = (leads ?? []).filter((l) => {
    if (filtroStatus && l.status !== filtroStatus) return false;
    if (filtroSite === "sem" && l.tem_site) return false;
    if (filtroSite === "com" && !l.tem_site) return false;
    if (busca && !`${l.nome_empresa} ${l.cidade} ${l.segmento}`.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Leads" subtitle={`${filtrados.length} leads`}>
        <NovoLeadDialog onCreated={() => qc.invalidateQueries({ queryKey: ["leads"] })} />
      </PageHeader>

      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 mb-6 grid gap-3 sm:flex sm:flex-wrap">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar leads" className="pl-9 w-full" placeholder="Buscar por nome, cidade, segmento..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
          <select aria-label="Filtrar por status" className="h-10 w-full sm:w-auto rounded-md bg-input border border-border px-3 text-sm" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select aria-label="Filtrar por presença de site" className="h-10 w-full sm:w-auto rounded-md bg-input border border-border px-3 text-sm" value={filtroSite} onChange={(e) => setFiltroSite(e.target.value)}>
            <option value="">Site: todos</option>
            <option value="sem">Sem site (oportunidade!)</option>
            <option value="com">Com site</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Segmento</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Avaliação</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && [...Array(5)].map((_, i) => (
                <tr key={`sk-${i}`} className="border-t border-border">
                  {[...Array(6)].map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[140px]" /></td>
                  ))}
                </tr>
              ))}
              {!isLoading && filtrados.length === 0 && (
                <tr><td className="px-4 py-12 text-center text-muted-foreground" colSpan={6}>
                  Nenhum lead ainda. Adicione manualmente ou prospecte pelo mapa.
                </td></tr>
              )}
              {filtrados.map((l) => {
                const s = STATUS_LABEL[l.status] ?? STATUS_LABEL.novo;
                return (
                  <tr key={l.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 font-medium">{l.nome_empresa}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.cidade ?? "—"}/{l.estado ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.segmento ?? "—"}</td>
                    <td className="px-4 py-3">
                      {l.tem_site
                        ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Globe className="h-3 w-3" /> Sim</span>
                        : <span className="inline-flex items-center gap-1 text-primary"><GlobeLock className="h-3 w-3" /> Não</span>}
                    </td>
                    <td className="px-4 py-3">
                      {l.avaliacao ? (
                        <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-warning fill-warning" /> {l.avaliacao}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NovoLeadDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome_empresa: "", whatsapp: "", cidade: "", estado: "SP", segmento: "", tem_site: false });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("leads").insert({ user_id: u.user!.id, ...form });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead adicionado");
      setOpen(false);
      setForm({ nome_empresa: "", whatsapp: "", cidade: "", estado: "SP", segmento: "", tem_site: false });
      onCreated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> Novo lead</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2"><Label>Empresa</Label><Input value={form.nome_empresa} onChange={(e) => setForm({ ...form, nome_empresa: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(11) 99999-9999" /></div>
            <div className="space-y-2"><Label>Segmento</Label><Input value={form.segmento} onChange={(e) => setForm({ ...form, segmento: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
            <div className="space-y-2"><Label>Estado</Label><Input maxLength={2} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.tem_site} onChange={(e) => setForm({ ...form, tem_site: e.target.checked })} /> Possui site
          </label>
          <Button className="w-full" disabled={!form.nome_empresa || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {create.isPending ? "Salvando..." : "Salvar lead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

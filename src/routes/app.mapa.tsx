import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Search, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/mapa")({
  head: () => ({ meta: [{ title: "Mapa de prospecção — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MapaPage,
});

const ESTADOS = [
  ["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],
  ["CE","Ceará"],["DF","Distrito Federal"],["ES","Espírito Santo"],["GO","Goiás"],
  ["MA","Maranhão"],["MT","Mato Grosso"],["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],
  ["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],["PE","Pernambuco"],["PI","Piauí"],
  ["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],["RS","Rio Grande do Sul"],
  ["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],
  ["SE","Sergipe"],["TO","Tocantins"],
] as const;

const corClass: Record<string, string> = {
  azul: "bg-info text-background",
  verde: "bg-success text-background",
  vermelho: "bg-destructive text-destructive-foreground",
  amarelo: "bg-warning text-background",
};

function MapaPage() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState("SP");
  const [cidade, setCidade] = useState("");
  const [segmento, setSegmento] = useState("");

  const { data: regioes } = useQuery({
    queryKey: ["regioes"],
    queryFn: async () => {
      const { data } = await supabase.from("regioes_prospectadas").select("*").order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const addRegiao = useMutation({
    mutationFn: async () => {
      if (!cidade || !estado) throw new Error("Informe a cidade");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("regioes_prospectadas").upsert({
        user_id: u.user!.id, cidade, estado, status_cor: "azul",
      }, { onConflict: "user_id,cidade,estado" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Região marcada para prospecção");
      qc.invalidateQueries({ queryKey: ["regioes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const prospectar = () => {
    if (!cidade || !segmento) return toast.error("Preencha cidade e segmento");
    toast.info("Em breve: busca automática no Google Maps via integração.");
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Mapa de Prospecção" subtitle="Selecione regiões e segmentos para prospectar." />

      <div className="grid lg:grid-cols-[1fr_360px] gap-4 sm:gap-6">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Brasil</h2>
          <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {ESTADOS.map(([sigla, nome]) => {
              const ativo = estado === sigla;
              return (
                <button
                  key={sigla}
                  onClick={() => setEstado(sigla)}
                  className={`rounded-lg border px-2 py-3 text-center transition ${
                    ativo
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-secondary/40 hover:bg-secondary"
                  }`}
                  title={nome}
                >
                  <div className="font-bold text-sm">{sigla}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{nome}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Regiões marcadas</h3>
            <div className="flex flex-wrap gap-2">
              {(regioes ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma região marcada ainda.</p>}
              {(regioes ?? []).map((r) => (
                <span key={r.id} className={`px-3 py-1 rounded-full text-xs font-medium ${corClass[r.status_cor] ?? ""}`}>
                  {r.cidade} / {r.estado}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <Legenda cor="azul" texto="Selecionada" />
              <Legenda cor="verde" texto="Resposta positiva" />
              <Legenda cor="vermelho" texto="Sem resposta" />
              <Legenda cor="amarelo" texto="Em andamento" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 h-fit lg:sticky lg:top-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Nova prospecção</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Estado</Label>
              <select className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {ESTADOS.map(([s, n]) => <option key={s} value={s}>{n}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: São Paulo" />
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex: restaurantes" />
            </div>
            <Button className="w-full" onClick={() => addRegiao.mutate()}>
              <MapPin className="h-4 w-4 mr-2" /> Marcar região
            </Button>
            <Button className="w-full" variant="outline" onClick={prospectar}>
              <Search className="h-4 w-4 mr-2" /> Buscar leads agora
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${corClass[cor]}`} />
      <span className="text-muted-foreground">{texto}</span>
    </div>
  );
}

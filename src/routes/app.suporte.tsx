import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lightbulb, Send, MessageSquare, Clock, Inbox } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/suporte")({
  head: () => ({ meta: [{ title: "Suporte — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SuportePage,
});

function SuportePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"problema" | "sugestao" | "historico">("problema");
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["suporte-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suporte_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const enviar = async (tipo: "problema" | "sugestao") => {
    if (!assunto.trim() || !descricao.trim()) {
      toast.error("Preencha o assunto e a descrição.");
      return;
    }
    setEnviando(true);
    const { error } = await supabase.from("suporte_tickets").insert({
      tipo,
      assunto: assunto.trim(),
      descricao: descricao.trim(),
    });
    setEnviando(false);
    if (error) {
      toast.error("Erro ao enviar. Tente novamente.");
      return;
    }
    toast.success(tipo === "problema" ? "Problema reportado com sucesso!" : "Sugestão enviada com sucesso!");
    setAssunto("");
    setDescricao("");
    queryClient.invalidateQueries({ queryKey: ["suporte-tickets"] });
    setActiveTab("historico");
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      aberto: { cls: "bg-warning/15 text-warning", label: "Aberto" },
      respondido: { cls: "bg-success/15 text-success", label: "Respondido" },
      fechado: { cls: "bg-muted text-muted-foreground", label: "Fechado" },
    };
    const s = map[status] ?? map.aberto;
    return <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", s.cls)}>{s.label}</span>;
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-3xl mx-auto">
      <PageHeader title="Suporte" subtitle="Relate problemas ou envie sugestões para melhorarmos o ZapScout" />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <TabButton active={activeTab === "problema"} onClick={() => setActiveTab("problema")} icon={AlertTriangle} label="Relatar problema" />
        <TabButton active={activeTab === "sugestao"} onClick={() => setActiveTab("sugestao")} icon={Lightbulb} label="Enviar sugestão" />
        <TabButton active={activeTab === "historico"} onClick={() => setActiveTab("historico")} icon={Inbox} label="Meus envios" badge={tickets?.length} />
      </div>

      {activeTab === "problema" && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h3 className="text-sm font-medium">Relatar um problema</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Encontrou algo que não está funcionando? Descreva o problema com o máximo de detalhes possível.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Assunto</Label>
              <Input placeholder="Ex: erro ao disparar campanha" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição do problema</Label>
              <Textarea placeholder="Descreva o que aconteceu, em qual página, e os passos para reproduzir..." rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <Button onClick={() => enviar("problema")} disabled={enviando || !assunto.trim() || !descricao.trim()}>
              <Send className="h-4 w-4" /> {enviando ? "Enviando..." : "Enviar problema"}
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "sugestao" && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-medium">Enviar uma sugestão</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Tem uma ideia para melhorar o ZapScout? Conta pra gente!
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Assunto</Label>
              <Input placeholder="Ex: adicionar filtro por estado na busca" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sua sugestão</Label>
              <Textarea placeholder="Descreva sua ideia e como ela ajudaria no seu dia a dia..." rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <Button onClick={() => enviar("sugestao")} disabled={enviando || !assunto.trim() || !descricao.trim()}>
              <Send className="h-4 w-4" /> {enviando ? "Enviando..." : "Enviar sugestão"}
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "historico" && (
        <div className="space-y-3">
          {isLoading ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Carregando...</Card>
          ) : tickets && tickets.length > 0 ? (
            tickets.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {t.tipo === "problema" ? (
                        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                      ) : (
                        <Lightbulb className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{t.assunto}</span>
                      {statusBadge(t.status)}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.descricao}</p>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(t.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-10 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Você ainda não enviou nenhum problema ou sugestão.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20">{badge}</span>
      )}
    </button>
  );
}

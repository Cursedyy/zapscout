import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user!.id).single();
      return data;
    },
  });

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <PageHeader title="Configurações" />
      <Tabs defaultValue="conta">
        <TabsList>
          <TabsTrigger value="conta">Minha conta</TabsTrigger>
          <TabsTrigger value="limites">Limites de envio</TabsTrigger>
          <TabsTrigger value="plano">Plano e pagamento</TabsTrigger>
          <TabsTrigger value="notif">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="conta" className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input defaultValue={profile?.nome ?? ""} /></div>
            <div className="space-y-2"><Label>Email</Label><Input defaultValue={profile?.email ?? ""} disabled /></div>
            <Button>Salvar alterações</Button>
          </div>
        </TabsContent>

        <TabsContent value="limites" className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="space-y-2"><Label>Mensagens por hora</Label><Input type="number" defaultValue={20} /></div>
            <div className="space-y-2"><Label>Intervalo entre envios (segundos)</Label><Input type="number" defaultValue={60} /></div>
            <Button>Salvar</Button>
          </div>
        </TabsContent>

        <TabsContent value="plano" className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground mb-2">Plano atual</p>
            <p className="text-2xl font-bold capitalize">{profile?.plano ?? "free"}</p>
            <Button className="mt-4">Fazer upgrade</Button>
          </div>
        </TabsContent>

        <TabsContent value="notif" className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> Alertar quando lead responder</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> Resumo diário por email</label>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

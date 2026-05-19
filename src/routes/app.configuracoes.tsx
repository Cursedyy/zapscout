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
          <TabsTrigger value="acessibilidade">Acessibilidade</TabsTrigger>
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

        <TabsContent value="acessibilidade" className="mt-6">
          <AcessibilidadeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AcessibilidadeTab() {
  const { mode, reduced, setMode } = useReducedMotion();
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Reduzir animações</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Desativa transições, pulses e efeitos de hover para uma experiência mais calma.
            O modo automático respeita a configuração do seu sistema operacional.
          </p>
        </div>
        <Switch
          checked={mode === "on" || (mode === "auto" && reduced)}
          onCheckedChange={(v) => setMode(v ? "on" : "off")}
          aria-label="Reduzir animações"
        />
      </div>

      <div className="space-y-3">
        <Label className="text-sm">Comportamento</Label>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "auto" | "on" | "off")} className="grid gap-2">
          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer hover:bg-secondary/60">
            <RadioGroupItem value="auto" id="rm-auto" className="mt-0.5" />
            <div>
              <div className="text-sm font-medium">Automático <span className="text-muted-foreground font-normal">(recomendado)</span></div>
              <div className="text-xs text-muted-foreground">Segue a preferência do sistema (prefers-reduced-motion).</div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer hover:bg-secondary/60">
            <RadioGroupItem value="off" id="rm-off" className="mt-0.5" />
            <div>
              <div className="text-sm font-medium">Animações completas</div>
              <div className="text-xs text-muted-foreground">Mostra todas as transições e efeitos do ZapScout.</div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3 cursor-pointer hover:bg-secondary/60">
            <RadioGroupItem value="on" id="rm-on" className="mt-0.5" />
            <div>
              <div className="text-sm font-medium">Reduzidas</div>
              <div className="text-xs text-muted-foreground">Desativa pulses, hovers e transições não essenciais.</div>
            </div>
          </label>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Estado atual: <span className="text-foreground font-medium">{reduced ? "Animações reduzidas" : "Animações ativas"}</span>
        </p>
      </div>
    </div>
  );
}

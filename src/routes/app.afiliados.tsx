import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Gift, Copy, Share2, Users, CreditCard, Wallet, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/afiliados")({
  head: () => ({ meta: [{ title: "Afiliados — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AfiliadosPage,
});

type IndicacaoStatus = "cadastrado" | "pagante";
type Indicacao = { id: string; nome: string; data: string; status: IndicacaoStatus; comissao: number };

const INDICACOES: Indicacao[] = [
  { id: "1", nome: "Mariana Lopes", data: "2026-05-18", status: "pagante", comissao: 19.4 },
  { id: "2", nome: "Carlos Henrique", data: "2026-05-15", status: "pagante", comissao: 19.4 },
  { id: "3", nome: "Studio Bella Salão", data: "2026-05-12", status: "cadastrado", comissao: 0 },
  { id: "4", nome: "Pedro Ramos", data: "2026-05-09", status: "pagante", comissao: 39.8 },
  { id: "5", nome: "Academia Power Fit", data: "2026-05-05", status: "pagante", comissao: 19.4 },
  { id: "6", nome: "Juliana Mendes", data: "2026-04-28", status: "cadastrado", comissao: 0 },
  { id: "7", nome: "Restaurante Sabor Mineiro", data: "2026-04-22", status: "pagante", comissao: 19.4 },
  { id: "8", nome: "Fernando Souza", data: "2026-04-18", status: "cadastrado", comissao: 0 },
];

function AfiliadosPage() {
  const { user } = useAuth();
  const [copiado, setCopiado] = useState(false);

  const codigo = useMemo(() => {
    const base = user?.email?.split("@")[0] || user?.id?.slice(0, 8) || "zap123";
    return base.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }, [user]);

  const link = `https://zapscout.com.br/?ref=${codigo}`;

  const total = INDICACOES.length;
  const pagantes = INDICACOES.filter((i) => i.status === "pagante").length;
  const comissao = INDICACOES.reduce((a, i) => a + i.comissao, 0);
  const minimoSaque = 50;
  const podeSacar = comissao >= minimoSaque;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Programa de Afiliados" subtitle="Indique e ganhe comissão recorrente" />

      {/* Card destaque */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="flex items-center gap-2 mb-3">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/20">
            <Share2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="font-semibold">Seu link de indicação</div>
            <div className="text-xs text-muted-foreground">Compartilhe com colegas e ganhe 20% recorrente sobre cada assinatura.</div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={link} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={copiar} className="shrink-0">
            {copiado ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar link</>}
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <MetricaCard icon={<Users className="h-4 w-4" />} label="Indicações realizadas" value={String(total)} />
        <MetricaCard icon={<CreditCard className="h-4 w-4" />} label="Convertidas em pagantes" value={String(pagantes)} />
        <MetricaCard icon={<Wallet className="h-4 w-4" />} label="Comissão acumulada" value={`R$ ${comissao.toFixed(2).replace(".", ",")}`} highlight />
      </div>

      {/* Como funciona */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Como funciona</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <PassoCard numero={1} titulo="Compartilhe seu link" desc="Envie para colegas, redes sociais ou grupos." />
          <PassoCard numero={2} titulo="Amigo cria conta" desc="Ele se cadastra usando o seu link de indicação." />
          <PassoCard numero={3} titulo="Você ganha 20% recorrente" desc="Comissão em todas as mensalidades, enquanto ele for assinante." />
        </div>
      </section>

      {/* Histórico */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Histórico de indicações</h2>
          <div className="flex items-center gap-3">
            {!podeSacar && (
              <span className="text-xs text-muted-foreground">
                Mínimo para saque: R$ {minimoSaque.toFixed(2).replace(".", ",")}
              </span>
            )}
            <Button disabled={!podeSacar} onClick={() => toast.success("Solicitação de saque enviada!")}>
              <Wallet className="h-4 w-4" /> Solicitar saque
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {INDICACOES.map((i) => (
                  <tr key={i.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{i.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {new Date(i.data).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          i.status === "pagante"
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {i.status === "pagante" ? "Pagante" : "Cadastrado"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {i.comissao > 0 ? `R$ ${i.comissao.toFixed(2).replace(".", ",")}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricaCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function PassoCard({ numero, titulo, desc }: { numero: number; titulo: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 relative">
      <div className="flex items-center gap-3 mb-2">
        <div className="grid place-items-center h-9 w-9 rounded-full bg-primary/15 text-primary font-bold">
          {numero}
        </div>
        {numero < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground hidden md:block ml-auto" />}
      </div>
      <div className="font-semibold mb-1">{titulo}</div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

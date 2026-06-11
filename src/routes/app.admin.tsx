import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Shield, Search, Loader2, KeyRound, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PLANOS, type PlanoId } from "@/data/planos";
import { adminResetSenha, adminAlterarPlano } from "@/lib/admin.functions";

export const Route = createFileRoute("/app/admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("plano")
      .eq("id", sess.session.user.id)
      .maybeSingle();
    if (prof?.plano !== "dono") throw redirect({ to: "/app" });
  },
  head: () => ({ meta: [{ title: "Admin — ZapScout" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminPage,
});

type ProfileRow = {
  id: string;
  nome: string | null;
  email: string | null;
  plano: string;
  created_at: string;
};

const PLANOS_DISPONIVEIS: PlanoId[] = ["free", "pro", "agencia", "business", "dono"];

function AdminPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ProfileRow | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [resetting, setResetting] = useState(false);
  const resetFn = useServerFn(adminResetSenha);
  const alterarPlanoFn = useServerFn(adminAlterarPlano);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, email, plano, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar usuários: " + error.message);
    setRows((data ?? []) as ProfileRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      (r.email ?? "").toLowerCase().includes(term) ||
      (r.nome ?? "").toLowerCase().includes(term)
    );
  }, [rows, q]);

  const alterarPlano = async (id: string, novoPlano: string) => {
    setSavingId(id);
    try {
      await alterarPlanoFn({ data: { userId: id, plano: novoPlano as PlanoId } });
      toast.success(`Plano atualizado para ${novoPlano}`);
      setRows(prev => prev.map(r => r.id === id ? { ...r, plano: novoPlano } : r));
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? "desconhecido"));
    } finally {
      setSavingId(null);
    }
  };

  const confirmarReset = async () => {
    if (!resetTarget) return;
    if (novaSenha.length < 8) { toast.error("Senha deve ter ao menos 8 caracteres"); return; }
    setResetting(true);
    try {
      await resetFn({ data: { userId: resetTarget.id, novaSenha } });
      toast.success(`Senha redefinida para ${resetTarget.email}`);
      setResetTarget(null);
      setNovaSenha("");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? "desconhecido"));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="grid place-items-center h-10 w-10 rounded-lg bg-gradient-primary shadow-glow">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold">Painel do Dono</h1>
          <p className="text-sm text-muted-foreground">Gerencie planos de todos os usuários da plataforma.</p>
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email ou nome..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border-0 focus-visible:ring-0 px-0"
          />
          <div className="text-xs text-muted-foreground tabular-nums">{filtered.length} usuários</div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando...
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/20">
                  <td className="px-4 py-3 font-medium">{r.nome ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <Select value={r.plano} onValueChange={(v) => alterarPlano(r.id, v)}>
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANOS_DISPONIVEIS.map((pid) => (
                          <SelectItem key={pid} value={pid}>{PLANOS[pid].nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setResetTarget(r); setNovaSenha(""); }}
                      title="Redefinir senha"
                    >
                      {savingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        Apenas usuários com plano <span className="font-mono">dono</span> têm acesso a esta página.
      </p>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setNovaSenha(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <span className="font-medium">{resetTarget?.email}</span>. O usuário poderá fazer login imediatamente com ela.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="text"
              placeholder="Nova senha (mín. 8 caracteres)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetTarget(null); setNovaSenha(""); }} disabled={resetting}>
              Cancelar
            </Button>
            <Button onClick={confirmarReset} disabled={resetting || novaSenha.length < 8}>
              {resetting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : "Redefinir senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

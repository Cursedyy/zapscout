import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { alterarPapelMimo, convidarMembroMimo, definirAtivoMimo, listarEquipeMimo, reatribuirLeadsMimo } from "@/lib/mimo-equipe.functions";
import { ROTULO_PAPEL } from "@/lib/mimo-acesso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Papel = "administrador" | "gestor" | "vendedor";
const ROTULO_ACAO: Record<string, string> = {
  convite: "Membro adicionado", alteracao_funcao: "Função alterada", desativacao: "Membro desativado",
  reativacao: "Membro reativado", reatribuicao: "Lead transferido", remocao: "Membro removido",
};
const MSG_CONVITE: Record<string, string> = {
  adicionado: "Membro adicionado.", reativado: "Membro reativado.",
  ja_membro: "Essa pessoa já é membro ativo.", conta_inexistente: "Não há conta no ZapScout com esse e-mail. Peça para a pessoa se cadastrar primeiro.",
};

export function MimoEquipePage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarEquipeMimo);
  const convidar = useServerFn(convidarMembroMimo);
  const alterar = useServerFn(alterarPapelMimo);
  const ativar = useServerFn(definirAtivoMimo);
  const reatribuir = useServerFn(reatribuirLeadsMimo);
  const q = useQuery({ queryKey: ["mimo-equipe"], queryFn: () => listar(), retry: false });
  const [email, setEmail] = useState(""); const [papel, setPapel] = useState<Papel>("vendedor");
  const [de, setDe] = useState(""); const [para, setPara] = useState("");
  const [confirmar, setConfirmar] = useState<null | { titulo: string; texto: string; acao: () => Promise<unknown> }>(null);
  const [ocupado, setOcupado] = useState(false);

  async function executar(fn: () => Promise<unknown>, ok?: string) {
    setOcupado(true);
    try { const r = await fn(); if (ok) toast.success(ok); await qc.invalidateQueries({ queryKey: ["mimo-equipe"] }); return r; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setOcupado(false); }
  }

  if (q.isLoading) return <p className="p-6 text-muted-foreground">Carregando equipe…</p>;
  if (q.error || !q.data) return <p className="p-6 text-muted-foreground">Somente administradores e gestores acessam esta página.</p>;
  const { membros, auditoria, papel: meuPapel, usuarioId } = q.data;
  const admin = meuPapel === "administrador";
  const nome = (id: string | null) => { if (!id) return "—"; const m = membros.find((x) => x.user_id === id); return m ? (m.nome || m.email || "Membro") : "Membro"; };
  const ativos = membros.filter((m) => m.ativo);

  return (
    <div className="space-y-8 p-6">
      <header><h1 className="text-2xl font-semibold">Equipe</h1><p className="text-sm text-muted-foreground">Membros, funções, transferência de leads e registro de ações.</p></header>

      {admin && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-medium">Adicionar membro</h2>
          <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await executar(() => convidar({ data: { email, papel } })); if (typeof r === "string") { toast.message(MSG_CONVITE[r] ?? "Concluído."); if (r === "adicionado" || r === "reativado") setEmail(""); } }}>
            <Input type="email" required placeholder="E-mail da conta no ZapScout" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-xs" />
            <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{(["vendedor", "gestor", "administrador"] as const).map((p) => <SelectItem key={p} value={p}>{ROTULO_PAPEL[p]}</SelectItem>)}</SelectContent></Select>
            <Button type="submit" disabled={ocupado}>Adicionar</Button>
          </form>
        </section>
      )}

      <section className="rounded-lg border bg-card">
        <h2 className="border-b p-4 font-medium">Membros</h2>
        <ul className="divide-y">
          {membros.map((m) => {
            const eu = m.user_id === usuarioId;
            const podeStatus = !eu && (admin || m.papel === "vendedor");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-48 flex-1"><p className="font-medium">{m.nome || m.email}{eu && " (você)"}</p><p className="text-xs text-muted-foreground">{m.email} · {m.leads_atribuidos} leads</p></div>
                {!m.ativo && <Badge variant="secondary">Inativo</Badge>}
                {admin && !eu ? (
                  <Select value={m.papel} onValueChange={(v) => setConfirmar({ titulo: "Alterar função", texto: `Mudar ${m.nome || m.email} para ${ROTULO_PAPEL[v as Papel]}?`, acao: () => executar(() => alterar({ data: { userId: m.user_id, papel: v as Papel } }), "Função alterada.") })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["vendedor", "gestor", "administrador"] as const).map((p) => <SelectItem key={p} value={p}>{ROTULO_PAPEL[p]}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Badge variant="outline">{ROTULO_PAPEL[m.papel as Papel]}</Badge>}
                {podeStatus && (
                  <Button variant="outline" size="sm" disabled={ocupado} onClick={() => setConfirmar({
                    titulo: m.ativo ? "Desativar membro" : "Reativar membro",
                    texto: m.ativo ? `${m.nome || m.email} perderá o acesso à MiMo. Os leads e o histórico continuam guardados e podem ser transferidos.` : `${m.nome || m.email} voltará a acessar a MiMo.`,
                    acao: () => executar(() => ativar({ data: { userId: m.user_id, ativo: !m.ativo } }), m.ativo ? "Membro desativado." : "Membro reativado."),
                  })}>{m.ativo ? "Desativar" : "Reativar"}</Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-medium">Transferir leads</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={de} onValueChange={setDe}><SelectTrigger className="w-56"><SelectValue placeholder="De" /></SelectTrigger>
            <SelectContent>{membros.filter((m) => m.leads_atribuidos > 0).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome || m.email} ({m.leads_atribuidos})</SelectItem>)}</SelectContent></Select>
          <span className="text-muted-foreground">para</span>
          <Select value={para} onValueChange={setPara}><SelectTrigger className="w-56"><SelectValue placeholder="Para" /></SelectTrigger>
            <SelectContent>{ativos.filter((m) => m.user_id !== de).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome || m.email}</SelectItem>)}</SelectContent></Select>
          <Button disabled={!de || !para || ocupado} onClick={() => setConfirmar({
            titulo: "Transferir leads", texto: `Transferir todos os leads de ${nome(de)} para ${nome(para)}? Histórico e conversas continuam ligados a cada lead.`,
            acao: async () => { const n = await executar(() => reatribuir({ data: { de, para } })); if (typeof n === "number") { toast.success(`${n} lead(s) transferido(s).`); setDe(""); setPara(""); } },
          })}>Transferir</Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <h2 className="border-b p-4 font-medium">Registro de ações</h2>
        {auditoria.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p> : (
          <ul className="divide-y text-sm">
            {auditoria.map((a) => {
              const c = (a.contexto ?? {}) as Record<string, string | null>;
              const detalhe = a.acao === "alteracao_funcao" ? `${ROTULO_PAPEL[c.de as Papel] ?? c.de} → ${ROTULO_PAPEL[c.para as Papel] ?? c.para}`
                : a.acao === "reatribuicao" ? `de ${nome(c.responsavel_anterior ?? null)} para ${nome(c.novo_responsavel ?? null)}` : "";
              return <li key={a.id} className="flex flex-wrap gap-x-3 p-3"><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span><span className="font-medium">{ROTULO_ACAO[a.acao] ?? a.acao}</span><span>{a.acao !== "reatribuicao" && nome(a.alvo_user_id)} {detalhe}</span><span className="text-muted-foreground">por {a.autor_id ? nome(a.autor_id) : "sistema"}</span></li>;
            })}
          </ul>
        )}
      </section>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirmar?.titulo}</AlertDialogTitle><AlertDialogDescription>{confirmar?.texto}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { const c = confirmar; setConfirmar(null); void c?.acao(); }}>Confirmar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

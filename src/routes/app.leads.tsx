import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ChevronLeft, ChevronRight, Bell, Trash2, KanbanSquare, List as ListIcon, Clock, Search, X } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { useStore, STATUS_COLUNAS, type CrmLead, type CrmStatus } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/app/leads")({
  head: () => ({ meta: [{ title: "Meus leads — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LeadsPage,
});

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `há ${d} dia${d > 1 ? "s" : ""}`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `há ${h}h`;
  const m = Math.floor(diff / 60000);
  return m > 0 ? `há ${m}min` : "agora";
}

function parseCidadeEstado(cidade: string): { cidade: string; estado: string } {
  const [c, e] = cidade.split(" - ");
  return { cidade: (c ?? cidade).trim(), estado: (e ?? "").trim() };
}

function LeadsPage() {
  const { leads, buscasSalvas, toggleBuscaSalva, removeBuscaSalva } = useStore();
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [selected, setSelected] = useState<CrmLead | null>(null);

  const [q, setQ] = useState("");
  const [nicho, setNicho] = useState<string>("todos");
  const [cidade, setCidade] = useState<string>("todas");
  const [estado, setEstado] = useState<string>("todos");
  const [statusF, setStatusF] = useState<string>("todos");
  const [temSite, setTemSite] = useState<string>("todos");

  const { nichos, cidades, estados } = useMemo(() => {
    const n = new Set<string>();
    const c = new Set<string>();
    const e = new Set<string>();
    for (const l of leads) {
      if (l.nicho) n.add(l.nicho);
      const parsed = parseCidadeEstado(l.cidade ?? "");
      if (parsed.cidade) c.add(parsed.cidade);
      if (parsed.estado) e.add(parsed.estado);
    }
    return {
      nichos: [...n].sort(),
      cidades: [...c].sort(),
      estados: [...e].sort(),
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const query = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (query) {
        const hay = `${l.nome} ${l.telefone ?? ""} ${l.endereco ?? ""} ${l.cidade ?? ""} ${l.nicho ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (nicho !== "todos" && l.nicho !== nicho) return false;
      const parsed = parseCidadeEstado(l.cidade ?? "");
      if (cidade !== "todas" && parsed.cidade !== cidade) return false;
      if (estado !== "todos" && parsed.estado !== estado) return false;
      if (statusF !== "todos" && l.status !== statusF) return false;
      if (temSite === "sim" && !l.site) return false;
      if (temSite === "nao" && l.site) return false;
      return true;
    });
  }, [leads, q, nicho, cidade, estado, statusF, temSite]);

  const hasFilters = q || nicho !== "todos" || cidade !== "todas" || estado !== "todos" || statusF !== "todos" || temSite !== "todos";
  const clearFilters = () => { setQ(""); setNicho("todos"); setCidade("todas"); setEstado("todos"); setStatusF("todos"); setTemSite("todos"); };

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-[1600px] mx-auto">
      <PageHeader title="Meus leads" subtitle={`${filteredLeads.length} de ${leads.length} no CRM`}>
        <div className="flex gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-border p-0.5 bg-card">
            <button onClick={() => setView("kanban")} className={cn("px-3 py-1.5 rounded text-xs inline-flex items-center gap-1.5", view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <KanbanSquare className="h-3 w-3" /> Kanban
            </button>
            <button onClick={() => setView("lista")} className={cn("px-3 py-1.5 rounded text-xs inline-flex items-center gap-1.5", view === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <ListIcon className="h-3 w-3" /> Lista
            </button>
          </div>
          <ExportButton leads={filteredLeads} filename="meus-leads.csv" extra={(l) => ({ Status: (l as CrmLead).status ?? "", Anotacoes: (l as CrmLead).notes ?? "" })} />
        </div>
      </PageHeader>

      {leads.length > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, telefone, endereço, nicho…"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <FilterSelect value={nicho} onChange={setNicho} placeholder="Nicho" allLabel="Todos nichos" allValue="todos" options={nichos} />
            <FilterSelect value={cidade} onChange={setCidade} placeholder="Cidade" allLabel="Todas cidades" allValue="todas" options={cidades} />
            <FilterSelect value={estado} onChange={setEstado} placeholder="Estado" allLabel="Todos estados" allValue="todos" options={estados} />
            <Select value={statusF} onValueChange={setStatusF}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {STATUS_COLUNAS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={temSite} onValueChange={setTemSite}>
              <SelectTrigger><SelectValue placeholder="Tem site" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Site: todos</SelectItem>
                <SelectItem value="sim">Tem site</SelectItem>
                <SelectItem value="nao">Sem site</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="h-3 w-3" /> Limpar filtros
              </Button>
            </div>
          )}
        </div>
      )}

      {buscasSalvas.length > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium"><Bell className="h-4 w-4 text-primary" /> Alertas de novos leads</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {buscasSalvas.map((b) => (
              <div key={b.id} className="rounded-lg border border-border bg-background/40 p-3 text-sm">
                <div className="font-medium truncate">{b.nicho || "Busca"}</div>
                <div className="text-xs text-muted-foreground">{b.cidade} · {b.raio}km</div>
                <div className="text-xs text-muted-foreground mt-1">Último scan: {timeAgo(b.ultimoScan)} · {b.novos} novos</div>
                <div className="flex items-center gap-2 mt-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={b.ativo} onChange={() => toggleBuscaSalva(b.id)} />
                    {b.ativo ? "Ativo" : "Pausado"}
                  </label>
                  <button onClick={() => removeBuscaSalva(b.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          <KanbanSquare className="h-10 w-10 mx-auto mb-3 text-primary/50" />
          <p className="font-medium text-foreground mb-1">Seu CRM está vazio</p>
          <p className="text-sm">Vá em <strong>Buscar leads</strong> e adicione negócios ao CRM.</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 text-primary/50" />
          <p className="font-medium text-foreground mb-1">Nenhum lead corresponde aos filtros</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={clearFilters}>Limpar filtros</Button>
        </div>
      ) : view === "kanban" ? (
        <KanbanView leads={filteredLeads} onSelect={setSelected} />
      ) : (
        <ListaView leads={filteredLeads} onSelect={setSelected} />
      )}

      <LeadDetailDialog lead={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, allLabel, allValue, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; allLabel: string; allValue: string; options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function KanbanView({ leads, onSelect }: { leads: CrmLead[]; onSelect: (l: CrmLead) => void }) {
  const { updateLeadStatus } = useStore();
  return (
    <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 overflow-x-auto pb-4">
      {STATUS_COLUNAS.map((col) => {
        const items = leads.filter((l) => l.status === col.id);
        return (
          <div key={col.id} className="rounded-xl border border-border bg-card/40">
            <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", col.dot)} />
              <span className="text-sm font-medium">{col.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[200px] max-h-[70vh] overflow-y-auto">
              {items.map((l) => {
                const idx = STATUS_COLUNAS.findIndex((c) => c.id === col.id);
                const prev = STATUS_COLUNAS[idx - 1]?.id as CrmStatus | undefined;
                const next = STATUS_COLUNAS[idx + 1]?.id as CrmStatus | undefined;
                return (
                  <div key={l.id} className="rounded-lg border border-border bg-card p-3 hover:border-primary/40 cursor-pointer" onClick={() => onSelect(l)}>
                    <div className="font-medium text-sm truncate">{l.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.telefone} · {l.cidade}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">Adicionado {timeAgo(l.addedAt)}</div>
                    <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                      <button disabled={!prev} onClick={() => prev && updateLeadStatus(l.id, prev)} className="grid place-items-center h-7 w-7 rounded border border-border disabled:opacity-30 hover:bg-secondary/50"><ChevronLeft className="h-3 w-3" /></button>
                      <WhatsAppButton lead={l} label="WA" />
                      <button disabled={!next} onClick={() => next && updateLeadStatus(l.id, next)} className="grid place-items-center h-7 w-7 rounded border border-border disabled:opacity-30 hover:bg-secondary/50 ml-auto"><ChevronRight className="h-3 w-3" /></button>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div className="text-center text-[10px] text-muted-foreground py-6">Vazio</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListaView({ leads, onSelect }: { leads: CrmLead[]; onSelect: (l: CrmLead) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Cidade</th><th className="px-4 py-3">Telefone</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Adicionado</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const col = STATUS_COLUNAS.find((c) => c.id === l.status)!;
              return (
                <tr key={l.id} className="border-t border-border hover:bg-secondary/20 cursor-pointer" onClick={() => onSelect(l)}>
                  <td className="px-4 py-3 font-medium">{l.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.cidade}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.telefone}</td>
                  <td className="px-4 py-3"><span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", col.cls)}>{col.label}</span></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{timeAgo(l.addedAt)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><WhatsAppButton lead={l} label="WhatsApp" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadDetailDialog({ lead, onClose }: { lead: CrmLead | null; onClose: () => void }) {
  const { updateLeadNotes, setFollowUp, updateLeadStatus, startSequence, stopSequence, marcarRespondeu, setLeadValor } = useStore();
  const [follow, setFollow] = useState("");
  const [valorInput, setValorInput] = useState("");
  useEffect(() => { setValorInput(lead?.valorFechado != null ? String(lead.valorFechado) : ""); }, [lead?.id, lead?.valorFechado]);

  return (
    <Dialog open={!!lead} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {lead && (
          <>
            <DialogHeader><DialogTitle>{lead.nome}</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Telefone:</span> {lead.telefone}</div>
                <div><span className="text-muted-foreground">Nicho:</span> {lead.nicho}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Endereço:</span> {lead.endereco}, {lead.cidade}</div>
                <div><span className="text-muted-foreground">Avaliação:</span> {lead.avaliacao}★ ({lead.totalAvaliacoes})</div>
                <div><span className="text-muted-foreground">Site:</span> {lead.site ?? "—"}</div>
              </div>

              <SequenciaWidget
                lead={lead}
                onStart={() => { startSequence(lead.id); toast.success("Cadência automática ativada ✓"); }}
                onStop={() => { stopSequence(lead.id, "manual"); toast("Cadência pausada"); }}
                onRespondeu={() => { marcarRespondeu(lead.id); toast.success("Lead respondeu — cadência encerrada"); }}
              />

              <div>
                <div className="text-xs font-medium mb-2 flex items-center gap-1"><Clock className="h-3 w-3" /> Histórico</div>
                <div className="rounded-lg border border-border bg-background/40 p-3 max-h-40 overflow-y-auto space-y-1.5 text-xs">
                  {lead.history.map((h, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground tabular-nums">{new Date(h.ts).toLocaleString("pt-BR")}</span>
                      <span>· {h.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-2">Anotações</div>
                <Textarea defaultValue={lead.notes} onBlur={(e) => { updateLeadNotes(lead.id, e.target.value); }} rows={3} placeholder="Notas sobre o lead..." />
              </div>

              <div>
                <div className="text-xs font-medium mb-2 flex items-center gap-1"><Calendar className="h-3 w-3" /> Lembrete manual</div>
                <div className="flex gap-2">
                  <Input type="date" defaultValue={lead.followUp ?? ""} onChange={(e) => setFollow(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => { setFollowUp(lead.id, follow || null); toast.success("Lembrete salvo ✓"); }}>Salvar</Button>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <WhatsAppButton lead={lead} label="WhatsApp" />
                {(() => {
                  const idx = STATUS_COLUNAS.findIndex((c) => c.id === lead.status);
                  const next = STATUS_COLUNAS[idx + 1];
                  return next ? <Button variant="outline" size="sm" onClick={() => { updateLeadStatus(lead.id, next.id); toast.success(`Movido para ${next.label}`); onClose(); }}>Mover para {next.label} <ChevronRight className="h-3 w-3" /></Button> : null;
                })()}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SequenciaWidget({ lead, onStart, onStop, onRespondeu }: {
  lead: CrmLead;
  onStart: () => void;
  onStop: () => void;
  onRespondeu: () => void;
}) {
  const seq = lead.sequence;
  const ativa = !!seq?.enabled;
  const enviados = seq?.sentSteps.length ?? 0;
  const parouAuto = !ativa && seq?.stoppedReason === "respondeu";

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-primary" /> Follow-up automático (1 / 2 / 3 dias)
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {ativa
              ? `Ativa · ${enviados}/3 enviados · próximo passo agendado automaticamente`
              : parouAuto
                ? "Encerrada — lead respondeu / avançou no funil"
                : seq?.stoppedReason === "concluida"
                  ? "Concluída — 3 mensagens enviadas"
                  : seq
                    ? "Pausada manualmente"
                    : "Não iniciada"}
          </div>
        </div>
        {ativa ? (
          <Button size="sm" variant="ghost" onClick={onStop}>Pausar</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onStart}>{seq ? "Reativar" : "Ativar"}</Button>
        )}
      </div>
      <div className="flex gap-1.5 mb-2">
        {[1, 2, 3].map((s) => {
          const done = (seq?.sentSteps ?? []).some((x) => x.step === s);
          const atual = ativa && enviados + 1 === s;
          return (
            <div key={s} className={cn(
              "flex-1 h-1.5 rounded-full",
              done ? "bg-success" : atual ? "bg-primary" : "bg-muted/40",
            )} />
          );
        })}
      </div>
      {ativa && (
        <Button size="sm" variant="outline" className="w-full" onClick={onRespondeu}>
          Marcar que respondeu (parar cadência)
        </Button>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Search,
  Loader2,
  Trash2,
  RefreshCw,
  X,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  Star,
  Pause,
  Play,
  CalendarClock,
  Download,
  MessageSquare,
  History,
  Send,
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import {
  listFilaPaginada,
  getFilaItemDetalhes,
  cancelEnviosManuais,
  reagendarEnvioFila,
  retentarEnvioFila,
  exportarFilaCsv,
  getHistoricoLead,
  getWhatsAppConfig,
  setFilaPausada,
} from "@/lib/whatsapp.functions";
import { toastErro, traduzirErro } from "@/lib/traduzir-erro";
import { useHasSession } from "@/hooks/use-has-session";
import { useFilaEnviosManuaisRealtime } from "@/hooks/use-fila-envios-manuais-realtime";
import { toast } from "sonner";

const STATUS = [
  { id: "todos", label: "Todos" },
  { id: "pendente", label: "Pendentes" },
  { id: "enviado", label: "Enviados" },
  { id: "falha", label: "Com falha" },
  { id: "recusada_limite", label: "Recusados" },
] as const;

type StatusId = (typeof STATUS)[number]["id"];

type FilaSearch = {
  status: StatusId;
  page: number;
  q: string;
  selected: string;
};

function parseStatus(v: unknown): StatusId {
  return (STATUS.find((s) => s.id === v)?.id ?? "todos") as StatusId;
}

export const Route = createFileRoute("/app/fila")({
  head: () => ({
    meta: [
      { title: "Fila de envios — ZapScout" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): FilaSearch => ({
    status: parseStatus(raw.status),
    page: Math.max(1, Number(raw.page) || 1),
    q: typeof raw.q === "string" ? raw.q : "",
    selected: typeof raw.selected === "string" ? raw.selected : "",
  }),
  component: FilaPage,
});

function fmtDataHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtEspera(iso?: string | null) {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "agora";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `em ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `em ${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `em ${h}h${rm}m` : `em ${h}h`;
}

function mask(numero: string) {
  const d = numero.replace(/\D/g, "");
  if (d.length < 4) return numero;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    pendente: { cls: "bg-warning/15 text-warning border-warning/30", label: "Pendente", Icon: Clock },
    enviado: { cls: "bg-success/15 text-success border-success/30", label: "Enviado", Icon: CheckCircle2 },
    falha: { cls: "bg-destructive/15 text-destructive border-destructive/30", label: "Falha", Icon: XCircle },
    recusada_limite: {
      cls: "bg-muted text-muted-foreground border-border",
      label: "Recusado",
      Icon: AlertTriangle,
    },
  };
  const info = map[status ?? ""] ?? map.pendente;
  const { Icon } = info;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${info.cls}`}
    >
      <Icon className="h-3 w-3" />
      {info.label}
    </span>
  );
}

function FilaPage() {
  const hasSession = useHasSession();
  useFilaEnviosManuaisRealtime();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const status = (STATUS.find((s) => s.id === search.status)?.id ?? "todos") as StatusId;
  const page = Math.max(1, search.page);
  const [buscaInput, setBuscaInput] = useState(search.q);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  function toggleSel(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function limparSel() {
    setSelecionados(new Set());
  }

  const listFn = useServerFn(listFilaPaginada);
  const detailFn = useServerFn(getFilaItemDetalhes);
  const cancelFn = useServerFn(cancelEnviosManuais);
  const reagendarFn = useServerFn(reagendarEnvioFila);
  const retentarFn = useServerFn(retentarEnvioFila);
  const exportFn = useServerFn(exportarFilaCsv);
  const cfgFn = useServerFn(getWhatsAppConfig);
  const pausarFn = useServerFn(setFilaPausada);

  const { data: cfg } = useQuery({
    queryKey: ["whatsapp-config-fila"],
    queryFn: () => cfgFn(),
    enabled: hasSession === true,
    staleTime: 15000,
  });
  const filaPausada = !!(cfg as { filaPausada?: boolean } | undefined)?.filaPausada;

  const pauseMut = useMutation({
    mutationFn: (pausada: boolean) => pausarFn({ data: { pausada } }),
    onSuccess: (res) => {
      toast.success(res.pausada ? "Envios pausados" : "Envios retomados");
      qc.invalidateQueries({ queryKey: ["whatsapp-config-fila"] });
    },
    onError: (e) => toastErro(e, "Falha ao alterar estado da fila"),
  });

  // Reagendamento
  const [reagOpen, setReagOpen] = useState(false);
  const [reagDias, setReagDias] = useState(1);
  const [reagHoras, setReagHoras] = useState(0);
  const [reagMinutos, setReagMinutos] = useState(0);
  const [reagBase, setReagBase] = useState<"agora" | "atual">("agora");

  const reagMut = useMutation({
    mutationFn: (payload: {
      id: string;
      dias: number;
      horas: number;
      minutos: number;
      base: "agora" | "atual";
    }) => reagendarFn({ data: payload }),
    onSuccess: (res) => {
      toast.success(
        `Reagendado para ${new Date(res.agendadoPara).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
      setReagOpen(false);
      qc.invalidateQueries({ queryKey: ["fila-paginada"] });
      qc.invalidateQueries({ queryKey: ["fila-item"] });
      qc.invalidateQueries({ queryKey: ["fila-envios-manuais"] });
    },
    onError: (e) => toastErro(e, "Falha ao reagendar"),
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["fila-paginada", status, page, search.q],
    queryFn: () => listFn({ data: { status, page, pageSize: 20, busca: search.q } }),
    enabled: hasSession === true,
    // Realtime já invalida via useFilaEnviosManuaisRealtime; polling é rede de
    // segurança caso o canal caia. Mais frequente onde há mudança esperada.
    refetchInterval: status === "pendente" || status === "todos" ? 15000 : 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 10000,
  });

  const selectedId = search.selected || "";
  const { data: detalhes, isLoading: loadingDet } = useQuery({
    queryKey: ["fila-item", selectedId],
    queryFn: () => detailFn({ data: { id: selectedId } }),
    enabled: hasSession === true && !!selectedId,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const cancelMut = useMutation({
    mutationFn: (ids: string[]) => cancelFn({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`${res.cancelados} envio(s) cancelado(s).`);
      limparSel();
      qc.invalidateQueries({ queryKey: ["fila-paginada"] });
      qc.invalidateQueries({ queryKey: ["fila-envios-manuais"] });
      qc.invalidateQueries({ queryKey: ["envios-manuais-fila"] });
    },
    onError: (e) => toastErro(e, "Falha ao cancelar"),
  });

  const retentarMut = useMutation({
    mutationFn: (payload: { ids?: string[]; all?: boolean }) =>
      retentarFn({ data: payload }),
    onSuccess: (res) => {
      toast.success(
        res.reenviados === 1
          ? "Envio reenfileirado — será tentado novamente em instantes."
          : `${res.reenviados} envio(s) reenfileirados.`,
      );
      qc.invalidateQueries({ queryKey: ["fila-paginada"] });
      qc.invalidateQueries({ queryKey: ["fila-item"] });
      qc.invalidateQueries({ queryKey: ["fila-envios-manuais"] });
      qc.invalidateQueries({ queryKey: ["envios-manuais-fila"] });
    },
    onError: (e) => toastErro(e, "Falha ao reenviar"),
  });

  const exportMut = useMutation({
    mutationFn: () => exportFn({ data: { status, busca: search.q } }),
    onSuccess: (res) => {
      if (!res.items.length) {
        toast.info("Nenhum envio para exportar com o filtro atual.");
        return;
      }
      const headers = [
        "nome",
        "whatsapp",
        "numero",
        "status",
        "tentativas",
        "ultima_tentativa",
        "proxima_tentativa",
        "agendado_para",
        "texto",
        "ultimo_erro",
        "criado_em",
      ] as const;
      const rotulos: Record<(typeof headers)[number], string> = {
        nome: "Nome",
        whatsapp: "WhatsApp",
        numero: "Número enviado",
        status: "Status",
        tentativas: "Tentativas",
        ultima_tentativa: "Última tentativa",
        proxima_tentativa: "Próxima tentativa",
        agendado_para: "Agendado para",
        texto: "Mensagem",
        ultimo_erro: "Último erro",
        criado_em: "Criado em",
      };
      const fmt = (iso: unknown) => {
        if (!iso || typeof iso !== "string") return "";
        try {
          return new Date(iso).toLocaleString("pt-BR");
        } catch {
          return "";
        }
      };
      const escape = (v: unknown) => {
        const s = v === null || v === undefined ? "" : String(v);
        return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
      };
      const lines = [headers.map((h) => escape(rotulos[h])).join(",")];
      for (const it of res.items) {
        const row = it as Record<string, unknown>;
        lines.push(
          headers
            .map((h) => {
              if (
                h === "ultima_tentativa" ||
                h === "proxima_tentativa" ||
                h === "agendado_para" ||
                h === "criado_em"
              ) {
                return escape(fmt(row[h]));
              }
              return escape(row[h]);
            })
            .join(","),
        );
      }
      const csv = "\uFEFF" + lines.join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `fila-${status}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${res.total} envio(s) exportado(s).`);
    },
    onError: (e) => toastErro(e, "Falha ao exportar CSV"),
  });

  const items = useMemo(
    () =>
      (data?.items ?? []) as Array<{
        id: string;
        numero: string;
        texto: string;
        status?: string;
        agendado_para?: string | null;
        enviado_em?: string | null;
        tentativas?: number | null;
        ultimo_erro?: string | null;
        lead_id?: string | null;
        lead_nome?: string | null;
      }>,
    [data?.items],
  );

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  function setStatus(next: StatusId) {
    navigate({ search: (p: FilaSearch) => ({ ...p, status: next, page: 1 }) });
  }
  function goPage(next: number) {
    navigate({
      search: (p: FilaSearch) => ({ ...p, page: Math.max(1, Math.min(totalPages, next)) }),
    });
  }
  function selectItem(id: string) {
    navigate({ search: (p: FilaSearch) => ({ ...p, selected: id }) });
  }
  function closeDetails() {
    navigate({ search: (p: FilaSearch) => ({ ...p, selected: "" }) });
  }
  function submitBusca(e: React.FormEvent) {
    e.preventDefault();
    navigate({ search: (p: FilaSearch) => ({ ...p, q: buscaInput.trim(), page: 1 }) });
  }

  const selecionado = detalhes?.item as
    | {
        id: string;
        numero: string;
        texto: string;
        status?: string;
        agendado_para?: string | null;
        enviado_em?: string | null;
        tentativas?: number | null;
        ultimo_erro?: string | null;
      }
    | undefined;
  const lead = detalhes?.lead as
    | {
        id: string;
        nome_empresa: string;
        telefone?: string | null;
        whatsapp?: string | null;
        cidade?: string | null;
        estado?: string | null;
        endereco?: string | null;
        categoria?: string | null;
        nicho?: string | null;
        avaliacao?: number | null;
        total_avaliacoes?: number | null;
        site_url?: string | null;
        status?: string | null;
        score?: number | null;
        observacoes?: string | null;
      }
    | null
    | undefined;

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader
        title="Fila de envios"
        subtitle="Todos os disparos agendados, enviados e com falha do WhatsApp."
      />

      {/* Ações rápidas: pausar/retomar */}
      <div
        className={`mb-4 rounded-xl border p-3 flex items-center gap-3 ${
          filaPausada
            ? "border-warning/40 bg-warning/10"
            : "border-border bg-card/60"
        }`}
      >
        <div
          className={`grid place-items-center h-8 w-8 rounded-full ${
            filaPausada ? "bg-warning/20 text-warning" : "bg-success/15 text-success"
          }`}
        >
          {filaPausada ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {filaPausada ? "Fila pausada" : "Fila ativa"}
          </div>
          <div className="text-xs text-muted-foreground">
            {filaPausada
              ? "Nenhum envio pendente será disparado até você retomar."
              : "Envios pendentes são disparados automaticamente no horário agendado."}
          </div>
        </div>
        <Button
          size="sm"
          variant={filaPausada ? "default" : "outline"}
          disabled={pauseMut.isPending || !cfg}
          onClick={() => pauseMut.mutate(!filaPausada)}
        >
          {pauseMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : filaPausada ? (
            <>
              <Play className="h-3.5 w-3.5" /> Retomar envios
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" /> Pausar envios
            </>
          )}
        </Button>
      </div>


      {/* Filtros por status */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS.map((s) => {
          const active = s.id === status;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatus(s.id)}
              className={`px-2.5 py-1 rounded-md border text-xs transition-colors ${
                active
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <form onSubmit={submitBusca} className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            placeholder="Buscar número ou texto…"
            className="pl-8 h-9 text-xs"
          />
        </form>
        {status === "falha" && items.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={retentarMut.isPending}
            onClick={() => {
              if (!confirm(`Reenfileirar todos os ${total} envios em falha?`)) return;
              retentarMut.mutate({ all: true });
            }}
          >
            {retentarMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Retentar todos
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportMut.mutate()}
          disabled={exportMut.isPending || total === 0}
          title="Exportar CSV com filtro atual"
        >
          {exportMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Exportar CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Lista */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {(() => {
            const pendentesVisiveis = items.filter((i) => i.status === "pendente");
            const selVisiveis = pendentesVisiveis.filter((i) => selecionados.has(i.id));
            const allChecked =
              pendentesVisiveis.length > 0 && selVisiveis.length === pendentesVisiveis.length;
            const someChecked = selVisiveis.length > 0 && !allChecked;

            if (selecionados.size > 0) {
              return (
                <div className="px-4 py-2.5 border-b border-border bg-primary/5 flex items-center gap-3 flex-wrap">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={(v) => {
                      setSelecionados((prev) => {
                        const next = new Set(prev);
                        if (v) pendentesVisiveis.forEach((i) => next.add(i.id));
                        else pendentesVisiveis.forEach((i) => next.delete(i.id));
                        return next;
                      });
                    }}
                    aria-label="Selecionar todos os pendentes desta página"
                  />
                  <span className="text-xs font-medium">
                    {selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"}
                  </span>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={limparSel}>
                    Limpar seleção
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={cancelMut.isPending}
                    onClick={() => {
                      const ids = Array.from(selecionados);
                      if (!confirm(`Cancelar ${ids.length} envio(s) pendente(s)?`)) return;
                      cancelMut.mutate(ids);
                    }}
                  >
                    {cancelMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Cancelar selecionados
                  </Button>
                </div>
              );
            }

            return (
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {pendentesVisiveis.length > 0 && (
                    <Checkbox
                      checked={false}
                      onCheckedChange={(v) => {
                        if (!v) return;
                        setSelecionados((prev) => {
                          const next = new Set(prev);
                          pendentesVisiveis.forEach((i) => next.add(i.id));
                          return next;
                        });
                      }}
                      aria-label="Selecionar pendentes desta página"
                    />
                  )}
                  <span>
                    {isLoading
                      ? "Carregando…"
                      : `${total} envio${total === 1 ? "" : "s"} no total`}
                  </span>
                </div>
                <span>
                  Página {page} de {totalPages}
                </span>
              </div>
            );
          })()}

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> carregando…
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Nenhum envio corresponde ao filtro atual.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it) => {
                const active = it.id === selectedId;
                const isFalha = it.status === "falha";
                const isPendente = it.status === "pendente";
                const isSel = selecionados.has(it.id);
                return (
                  <li key={it.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => selectItem(it.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectItem(it.id);
                        }
                      }}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors ${
                        active
                          ? "bg-primary/10"
                          : isSel
                            ? "bg-primary/5"
                            : "hover:bg-secondary/40"
                      }`}
                    >
                      {isPendente ? (
                        <div
                          className="pt-0.5 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleSel(it.id)}
                            aria-label={`Selecionar envio para ${it.lead_nome ?? mask(it.numero)}`}
                          />
                        </div>
                      ) : (
                        <div className="w-4 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {it.lead_nome ?? mask(it.numero)}
                          </span>
                          <StatusBadge status={it.status} />
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {mask(it.numero)} · {it.texto}
                        </div>
                        {it.ultimo_erro && (
                          <div className="text-[11px] text-destructive line-clamp-1 mt-0.5">
                            {traduzirErro(it.ultimo_erro)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="text-right text-xs">
                          <div className="text-foreground">
                            {it.status === "pendente"
                              ? fmtEspera(it.agendado_para)
                              : fmtDataHora(it.enviado_em ?? it.agendado_para)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {fmtDataHora(it.agendado_para)}
                          </div>
                        </div>
                        {isFalha && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={retentarMut.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              retentarMut.mutate({ ids: [it.id] });
                            }}
                          >
                            {retentarMut.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Tentar novamente
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Paginação */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goPage(page - 1)}
              disabled={page <= 1 || isFetching}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </Button>
            <div className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages || isFetching}
            >
              Próxima <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Painel de detalhes */}
        <aside className="rounded-2xl border border-border bg-card sticky top-4 h-fit">
          {!selectedId ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Clique em um item da fila para ver os detalhes do lead.
            </div>
          ) : loadingDet ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> carregando…
            </div>
          ) : !selecionado ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Item não encontrado.
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalhes do envio
                </div>
                <button
                  type="button"
                  onClick={closeDetails}
                  aria-label="Fechar"
                  className="grid place-items-center h-6 w-6 rounded-md hover:bg-secondary/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selecionado.status} />
                  <span className="text-xs text-muted-foreground">
                    {selecionado.tentativas ?? 0} tentativa(s)
                  </span>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Número
                  </div>
                  <div className="font-medium">{mask(selecionado.numero)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Agendado
                  </div>
                  <div>{fmtDataHora(selecionado.agendado_para)}</div>
                </div>
                {selecionado.enviado_em && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Enviado
                    </div>
                    <div>{fmtDataHora(selecionado.enviado_em)}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Mensagem
                  </div>
                  <div className="rounded-md border border-border bg-background p-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {selecionado.texto}
                  </div>
                </div>
                {selecionado.ultimo_erro && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Último erro
                    </div>
                    <div className="text-xs text-destructive">
                      {traduzirErro(selecionado.ultimo_erro)}
                    </div>
                  </div>
                )}
              </div>

              {/* Lead */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Lead
                </div>
                {!lead ? (
                  <div className="text-xs text-muted-foreground">
                    Envio avulso — sem lead vinculado.
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium">{lead.nome_empresa}</div>
                    {(lead.categoria || lead.nicho) && (
                      <div className="text-xs text-muted-foreground">
                        {lead.categoria ?? lead.nicho}
                      </div>
                    )}
                    {typeof lead.avaliacao === "number" && lead.avaliacao > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <Star className="h-3 w-3 fill-warning text-warning" />
                        <span className="font-medium">{lead.avaliacao.toFixed(1)}</span>
                        <span className="text-muted-foreground">
                          ({lead.total_avaliacoes ?? 0})
                        </span>
                      </div>
                    )}
                    {(lead.endereco || lead.cidade) && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          {[lead.endereco, lead.cidade, lead.estado].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                    {(lead.telefone || lead.whatsapp) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span>{lead.whatsapp ?? lead.telefone}</span>
                      </div>
                    )}
                    {lead.observacoes && (
                      <div className="text-xs text-muted-foreground line-clamp-3">
                        {lead.observacoes}
                      </div>
                    )}
                    <Button asChild variant="outline" size="sm" className="w-full mt-2">
                      <Link to="/app/leads">
                        Abrir no CRM <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>

              {selecionado.status === "pendente" && (
                <div className="mt-4 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setReagDias(1);
                      setReagHoras(0);
                      setReagMinutos(0);
                      setReagBase("agora");
                      setReagOpen(true);
                    }}
                  >
                    <CalendarClock className="h-3.5 w-3.5" /> Reagendar envio
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    disabled={cancelMut.isPending}
                    onClick={() => {
                      if (!confirm("Cancelar este envio pendente?")) return;
                      cancelMut.mutate([selecionado.id]);
                      closeDetails();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Cancelar envio
                  </Button>
                </div>
              )}

              {selecionado.status === "falha" && (
                <div className="mt-4">
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full"
                    disabled={retentarMut.isPending}
                    onClick={() => retentarMut.mutate({ ids: [selecionado.id] })}
                  >
                    {retentarMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Tentar novamente
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    O envio volta para a fila e é tentado nos próximos minutos.
                  </p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Dialog de reagendamento */}
      <Dialog open={reagOpen} onOpenChange={setReagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar envio</DialogTitle>
            <DialogDescription>
              Escolha quanto tempo esperar antes de tentar enviar novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Dias</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={reagDias}
                  onChange={(e) => setReagDias(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Horas</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={reagHoras}
                  onChange={(e) => setReagHoras(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Minutos</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={reagMinutos}
                  onChange={(e) => setReagMinutos(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground self-center mr-1">Atalhos:</span>
              {[
                { d: 0, h: 1, m: 0, label: "+1h" },
                { d: 0, h: 3, m: 0, label: "+3h" },
                { d: 1, h: 0, m: 0, label: "+1 dia" },
                { d: 3, h: 0, m: 0, label: "+3 dias" },
                { d: 7, h: 0, m: 0, label: "+1 semana" },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setReagDias(s.d);
                    setReagHoras(s.h);
                    setReagMinutos(s.m);
                  }}
                  className="px-2 py-1 rounded-md border border-border text-xs hover:bg-secondary/40"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Base da espera</Label>
              <div className="flex gap-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={reagBase === "agora"}
                    onChange={() => setReagBase("agora")}
                  />
                  A partir de agora
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={reagBase === "atual"}
                    onChange={() => setReagBase("atual")}
                  />
                  A partir do horário atual do envio
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReagOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                reagMut.isPending ||
                !selecionado ||
                reagDias + reagHoras + reagMinutos === 0
              }
              onClick={() => {
                if (!selecionado) return;
                reagMut.mutate({
                  id: selecionado.id,
                  dias: reagDias,
                  horas: reagHoras,
                  minutos: reagMinutos,
                  base: reagBase,
                });
              }}
            >
              {reagMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}
              Reagendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

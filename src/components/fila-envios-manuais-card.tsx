import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle, Loader2, RefreshCw, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEnviosManuaisFila, cancelEnviosManuais } from "@/lib/whatsapp.functions";
import { useHasSession } from "@/hooks/use-has-session";
import { toast } from "sonner";

type Item = {
  id: string;
  numero: string;
  texto: string;
  agendado_para?: string | null;
  enviado_em?: string | null;
  status?: string;
  tentativas?: number | null;
  ultimo_erro?: string | null;
  lead_nome?: string | null;
};

function fmtEspera(iso?: string | null) {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "agora";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `em ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `em ${h}h ${rm}m`;
}

function fmtHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function mask(numero: string) {
  const d = numero.replace(/\D/g, "");
  if (d.length < 4) return numero;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
}

function sameDay(iso: string | null | undefined, ymd: string) {
  if (!iso || !ymd) return false;
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` === ymd;
}

export function FilaEnviosManuaisCard() {
  const hasSession = useHasSession();
  const qc = useQueryClient();
  const fn = useServerFn(listEnviosManuaisFila);
  const cancelFn = useServerFn(cancelEnviosManuais);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["envios-manuais-fila"],
    queryFn: () => fn(),
    enabled: hasSession === true,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const [busca, setBusca] = useState("");
  const [dia, setDia] = useState<string>(""); // yyyy-mm-dd
  const [dataPreset, setDataPreset] = useState<string>("todos"); // todos|hoje|amanha|custom
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const cancelMut = useMutation({
    mutationFn: (payload: { ids?: string[]; all?: boolean }) => cancelFn({ data: payload }),
    onSuccess: (res) => {
      toast.success(`${res.cancelados} envio(s) cancelado(s).`);
      setSelecionados(new Set());
      qc.invalidateQueries({ queryKey: ["envios-manuais-fila"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar"),
  });

  const pendentesAll = (data?.pendentes ?? []) as Item[];
  const recentes = (data?.recentes ?? []) as Item[];

  const diaEfetivo = useMemo(() => {
    if (dataPreset === "hoje") {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (dataPreset === "amanha") {
      const d = new Date(Date.now() + 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (dataPreset === "custom") return dia;
    return "";
  }, [dataPreset, dia]);

  const pendentes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pendentesAll.filter((it) => {
      if (q) {
        const nome = (it.lead_nome ?? "").toLowerCase();
        const num = it.numero.toLowerCase();
        const txt = it.texto.toLowerCase();
        if (!nome.includes(q) && !num.includes(q) && !txt.includes(q)) return false;
      }
      if (diaEfetivo && !sameDay(it.agendado_para, diaEfetivo)) return false;
      return true;
    });
  }, [pendentesAll, busca, diaEfetivo]);

  const allChecked = pendentes.length > 0 && pendentes.every((it) => selecionados.has(it.id));
  const someChecked = pendentes.some((it) => selecionados.has(it.id));

  function toggleAll() {
    if (allChecked) {
      const next = new Set(selecionados);
      pendentes.forEach((it) => next.delete(it.id));
      setSelecionados(next);
    } else {
      const next = new Set(selecionados);
      pendentes.forEach((it) => next.add(it.id));
      setSelecionados(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelecionados(next);
  }

  function cancelarSelecionados() {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    if (!confirm(`Cancelar ${ids.length} envio(s) pendente(s)?`)) return;
    cancelMut.mutate({ ids });
  }

  function cancelarTudo() {
    if (pendentesAll.length === 0) return;
    if (!confirm(`Cancelar TODOS os ${pendentesAll.length} envios pendentes?`)) return;
    cancelMut.mutate({ all: true });
  }

  function cancelarUm(id: string) {
    if (!confirm("Cancelar este envio?")) return;
    cancelMut.mutate({ ids: [id] });
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Fila de envios manuais
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Veja, filtre e cancele mensagens aguardando disparo.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por lead, número ou texto…"
              className="pl-8 h-9 text-xs"
            />
          </div>
          <Select value={dataPreset} onValueChange={setDataPreset}>
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as datas</SelectItem>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="amanha">Amanhã</SelectItem>
              <SelectItem value="custom">Data específica…</SelectItem>
            </SelectContent>
          </Select>
          {dataPreset === "custom" && (
            <Input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="h-9 w-[160px] text-xs"
            />
          )}
          <div className="flex-1" />
          {someChecked && (
            <Button
              variant="destructive"
              size="sm"
              onClick={cancelarSelecionados}
              disabled={cancelMut.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Cancelar selecionados ({selecionados.size})
            </Button>
          )}
          {pendentesAll.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancelarTudo}
              disabled={cancelMut.isPending}
            >
              Cancelar todos
            </Button>
          )}
        </div>

        {/* Pendentes */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Pendentes ({pendentes.length}
            {pendentes.length !== pendentesAll.length && ` de ${pendentesAll.length}`})
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando…
            </div>
          ) : pendentes.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              {pendentesAll.length === 0
                ? "Nenhuma mensagem na fila."
                : "Nenhum envio corresponde aos filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2">
                      <Checkbox
                        checked={allChecked}
                        onCheckedChange={toggleAll}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th className="text-left font-medium py-2 pr-3">Para</th>
                    <th className="text-left font-medium py-2 pr-3">Mensagem</th>
                    <th className="text-left font-medium py-2 pr-3">Envio previsto</th>
                    <th className="text-left font-medium py-2 pr-3">Tent.</th>
                    <th className="w-10 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendentes.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 align-top">
                        <Checkbox
                          checked={selecionados.has(it.id)}
                          onCheckedChange={() => toggleOne(it.id)}
                          aria-label="Selecionar"
                        />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <div className="font-medium text-foreground">
                          {it.lead_nome ?? mask(it.numero)}
                        </div>
                        {it.lead_nome && (
                          <div className="text-[11px] text-muted-foreground">{mask(it.numero)}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top max-w-[280px]">
                        <div className="line-clamp-2 text-muted-foreground">{it.texto}</div>
                      </td>
                      <td className="py-2 pr-3 align-top whitespace-nowrap">
                        <div className="text-foreground">{fmtEspera(it.agendado_para)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtHora(it.agendado_para)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 align-top">
                        {it.tentativas ?? 0}
                        {it.ultimo_erro && (
                          <div className="text-[11px] text-destructive mt-1 line-clamp-2 max-w-[200px]">
                            {it.ultimo_erro}
                          </div>
                        )}
                      </td>
                      <td className="py-2 align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => cancelarUm(it.id)}
                          disabled={cancelMut.isPending}
                          title="Cancelar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Últimos processados */}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Últimas 24h ({recentes.length})
          </div>
          {recentes.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nada processado nas últimas 24h.</div>
          ) : (
            <ul className="space-y-1.5">
              {recentes.slice(0, 15).map((it) => {
                const ok = it.status === "enviado";
                return (
                  <li key={it.id} className="flex items-start gap-2 text-xs">
                    {ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {it.lead_nome ?? mask(it.numero)}
                        </span>
                        <span className="text-muted-foreground">
                          {fmtHora(it.enviado_em ?? it.agendado_para)}
                        </span>
                      </div>
                      {!ok && it.ultimo_erro && (
                        <div className="text-destructive line-clamp-1">{it.ultimo_erro}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

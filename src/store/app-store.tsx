import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PLANOS, type PlanoId } from "@/data/planos";
import { TEMPLATES_PADRAO, type Template } from "@/data/templates";
import type { MockLead } from "@/data/mock-leads";
import { supabase } from "@/integrations/supabase/client";
import {
  listLeadsRemote,
  upsertLeadRemote,
  updateLeadRemote,
  listCampanhasRemote,
  createCampanhaRemote,
  updateCampanhaRemote,
  deleteCampanhaRemote,
} from "@/lib/crm.functions";

export type CrmStatus = "novo" | "contatado" | "respondeu" | "negociacao" | "fechado" | "perdido";

export const STATUS_COLUNAS: { id: CrmStatus; label: string; cls: string; dot: string }[] = [
  { id: "novo", label: "Novo", cls: "bg-muted/40 text-muted-foreground", dot: "bg-muted-foreground" },
  { id: "contatado", label: "Contatado", cls: "bg-primary/15 text-primary", dot: "bg-primary" },
  { id: "respondeu", label: "Respondeu", cls: "bg-info/15 text-info", dot: "bg-info" },
  { id: "negociacao", label: "Em negociação", cls: "bg-warning/15 text-warning", dot: "bg-warning" },
  { id: "fechado", label: "Fechado", cls: "bg-success/15 text-success", dot: "bg-success" },
  { id: "perdido", label: "Perdido", cls: "bg-destructive/15 text-destructive", dot: "bg-destructive" },
];

export type FollowUpSequence = {
  enabled: boolean;
  startedAt: number;
  sentSteps: { step: number; ts: number }[];
  stoppedAt?: number;
  stoppedReason?: "respondeu" | "manual" | "concluida";
};

export type CrmLead = MockLead & {
  status: CrmStatus;
  addedAt: number;
  notes: string;
  followUp: string | null;
  history: { ts: number; text: string }[];
  sequence?: FollowUpSequence;
  valorFechado?: number | null;
};

export type CampanhaStatus = "rascunho" | "agendada" | "em_andamento" | "pausada" | "concluida";

export type CampanhaItem = {
  leadId: string;
  status: "pendente" | "enviado" | "falha";
  sentAt?: number;
};

export type Campanha = {
  id: string;
  nome: string;
  templateId: string;
  mensagemOverride?: string;
  filtroNicho: string;
  filtroCidade: string;
  apenasSemSite: boolean;
  apenasStatusNovo: boolean;
  limitePorHora: number;
  agendamento?: number;
  status: CampanhaStatus;
  items: CampanhaItem[];
  createdAt: number;
  startedAt?: number;
  lastSentAt?: number;
};

export type BuscaSalva = {
  id: string;
  nicho: string;
  cidade: string;
  raio: number;
  semSite: boolean;
  avaliacaoMin: number;
  ativo: boolean;
  ultimoScan: number;
  novos: number;
};

type Store = {
  plano: PlanoId;
  setPlano: (p: PlanoId) => void;

  buscasUsadas: number;
  incrementarBusca: () => void;

  leads: CrmLead[];
  addLead: (lead: MockLead) => boolean;
  updateLeadStatus: (id: string, status: CrmStatus) => void;
  updateLeadNotes: (id: string, notes: string) => void;
  setFollowUp: (id: string, iso: string | null) => void;
  appendHistory: (id: string, text: string) => void;
  setLeadValor: (id: string, valor: number | null) => void;

  startSequence: (id: string) => void;
  stopSequence: (id: string, reason?: "respondeu" | "manual" | "concluida") => void;
  markFollowUpSent: (id: string, step: number) => void;
  marcarRespondeu: (id: string) => void;

  templates: Template[];
  templateSelecionado: string;
  setTemplateSelecionado: (id: string) => void;
  addTemplate: (t: Omit<Template, "id">) => void;
  updateTemplate: (id: string, t: Partial<Template>) => void;
  deleteTemplate: (id: string) => void;

  pularPreviewWA: boolean;
  setPularPreviewWA: (v: boolean) => void;

  buscasSalvas: BuscaSalva[];
  addBuscaSalva: (b: Omit<BuscaSalva, "id" | "ultimoScan" | "novos" | "ativo">) => void;
  toggleBuscaSalva: (id: string) => void;
  removeBuscaSalva: (id: string) => void;

  campanhas: Campanha[];
  createCampanha: (c: Omit<Campanha, "id" | "createdAt" | "status" | "items"> & { items: CampanhaItem[]; status?: CampanhaStatus }) => string;
  deleteCampanha: (id: string) => void;
  setCampanhaStatus: (id: string, status: CampanhaStatus) => void;
  markCampanhaItemEnviado: (campanhaId: string, leadId: string) => void;

  followupDias: [number, number, number];
  setFollowupDias: (d: [number, number, number]) => void;
  defaultIntervaloSegundos: number;
  setDefaultIntervaloSegundos: (s: number) => void;
};

const STORAGE_KEY = "zapscout:v2";

const Ctx = createContext<Store | null>(null);

function loadInit() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ============================== Mappers ============================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLead(r: any): CrmLead {
  const history = Array.isArray(r.history) ? r.history : [];
  const seqRaw = r.sequence_state;
  let sequence: FollowUpSequence | undefined;
  if (seqRaw && typeof seqRaw === "object") {
    sequence = {
      enabled: !!seqRaw.enabled,
      startedAt: typeof seqRaw.startedAt === "number"
        ? seqRaw.startedAt
        : (seqRaw.startedAt ? new Date(seqRaw.startedAt).getTime() : Date.now()),
      sentSteps: Array.isArray(seqRaw.sentSteps)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? seqRaw.sentSteps.map((s: any) => ({
            step: s.step,
            ts: typeof s.ts === "number" ? s.ts : new Date(s.ts).getTime(),
          }))
        : [],
      stoppedAt: seqRaw.stoppedAt
        ? (typeof seqRaw.stoppedAt === "number" ? seqRaw.stoppedAt : new Date(seqRaw.stoppedAt).getTime())
        : undefined,
      stoppedReason: seqRaw.stoppedReason,
    };
  }
  return {
    id: r.id,
    nome: r.nome_empresa ?? "",
    nicho: r.nicho ?? r.segmento ?? "",
    cidade: r.cidade ?? "",
    endereco: r.endereco ?? "",
    telefone: r.whatsapp ?? r.telefone ?? "",
    site: r.site_url ?? null,
    avaliacao: r.avaliacao ?? 0,
    totalAvaliacoes: r.total_avaliacoes ?? 0,
    lat: 0,
    lng: 0,
    status: (r.status as CrmStatus) ?? "novo",
    addedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    notes: r.notes ?? "",
    followUp: r.follow_up_at ?? null,
    history,
    sequence,
    valorFechado: r.valor_fechado != null ? Number(r.valor_fechado) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampanha(r: any): Campanha {
  const filtros = (r.filtros ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    nome: r.nome,
    templateId: (filtros.templateId as string) ?? "",
    mensagemOverride: r.mensagem_override ?? undefined,
    filtroNicho: (filtros.filtroNicho as string) ?? "",
    filtroCidade: (filtros.filtroCidade as string) ?? "",
    apenasSemSite: !!filtros.apenasSemSite,
    apenasStatusNovo: !!filtros.apenasStatusNovo,
    limitePorHora: r.limite_por_hora ?? 20,
    agendamento: r.agendamento ? new Date(r.agendamento).getTime() : undefined,
    status: r.status,
    items: Array.isArray(r.items) ? r.items : [],
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    startedAt: r.started_at ? new Date(r.started_at).getTime() : undefined,
    lastSentAt: r.last_sent_at ? new Date(r.last_sent_at).getTime() : undefined,
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const init = loadInit();
  const qc = useQueryClient();

  // Estado local (preferências e listas auxiliares)
  const [plano, setPlano] = useState<PlanoId>(init?.plano ?? "free");
  const [buscasUsadas, setBuscasUsadas] = useState<number>(init?.buscasUsadas ?? 0);
  const [templates, setTemplates] = useState<Template[]>(init?.templates ?? TEMPLATES_PADRAO);
  const [templateSelecionado, setTemplateSelecionado] = useState<string>(init?.templateSelecionado ?? TEMPLATES_PADRAO[1].id);
  const [pularPreviewWA, setPularPreviewWA] = useState<boolean>(init?.pularPreviewWA ?? false);
  const [buscasSalvas, setBuscasSalvas] = useState<BuscaSalva[]>(init?.buscasSalvas ?? []);
  const [followupDias, setFollowupDias] = useState<[number, number, number]>(init?.followupDias ?? [1, 2, 3]);
  const [defaultIntervaloSegundos, setDefaultIntervaloSegundos] = useState<number>(init?.defaultIntervaloSegundos ?? 180);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ plano, buscasUsadas, templates, templateSelecionado, pularPreviewWA, buscasSalvas, followupDias, defaultIntervaloSegundos }),
      );
    } catch { /* noop */ }
  }, [plano, buscasUsadas, templates, templateSelecionado, pularPreviewWA, buscasSalvas, followupDias, defaultIntervaloSegundos]);

  // Sincroniza plano com a tabela profiles (fonte de verdade no servidor).
  useEffect(() => {
    let cancelled = false;
    const fetchPlano = async (userId: string) => {
      const { data } = await supabase.from("profiles").select("plano").eq("id", userId).maybeSingle();
      if (cancelled) return;
      const p = data?.plano as PlanoId | undefined;
      if (p && PLANOS[p]) setPlano(p);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) fetchPlano(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) fetchPlano(s.user.id);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);


  /* ============================== React Query ============================== */

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const rows = await listLeadsRemote();
      return rows.map(rowToLead);
    },
    staleTime: 10_000,
  });
  const leads = leadsQuery.data ?? [];

  const campanhasQuery = useQuery({
    queryKey: ["campanhas"],
    queryFn: async () => {
      const rows = await listCampanhasRemote();
      return rows.map(rowToCampanha);
    },
    staleTime: 10_000,
  });
  const campanhas = campanhasQuery.data ?? [];

  /* ============================== Mutations ============================== */

  const upsertLeadMut = useMutation({
    mutationFn: (lead: MockLead) =>
      upsertLeadRemote({
        data: {
          externalId: lead.id,
          nome: lead.nome,
          telefone: lead.telefone,
          whatsapp: lead.telefone,
          cidade: lead.cidade,
          endereco: lead.endereco,
          nicho: lead.nicho,
          siteUrl: lead.site,
          temSite: !!lead.site,
          avaliacao: lead.avaliacao,
          totalAvaliacoes: lead.totalAvaliacoes,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const updateLeadMut = useMutation({
    mutationFn: (vars: Parameters<typeof updateLeadRemote>[0]["data"]) =>
      updateLeadRemote({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const prev = qc.getQueryData<CrmLead[]>(["leads"]);
      if (prev) {
        qc.setQueryData<CrmLead[]>(["leads"], prev.map((l) => {
          if (l.id !== vars.id) return l;
          return {
            ...l,
            status: (vars.status as CrmStatus) ?? l.status,
            notes: vars.notes ?? l.notes,
            followUp: vars.follow_up_at !== undefined ? vars.follow_up_at : l.followUp,
            history: vars.history ?? l.history,
            valorFechado: vars.valor_fechado !== undefined ? vars.valor_fechado : l.valorFechado,
            sequence: vars.sequence_state !== undefined
              ? (vars.sequence_state as unknown as FollowUpSequence | undefined)
              : l.sequence,
          };
        }));
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["leads"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const createCampanhaMut = useMutation({
    mutationFn: (vars: Parameters<typeof createCampanhaRemote>[0]["data"]) =>
      createCampanhaRemote({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campanhas"] }),
  });

  const updateCampanhaMut = useMutation({
    mutationFn: (vars: Parameters<typeof updateCampanhaRemote>[0]["data"]) =>
      updateCampanhaRemote({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["campanhas"] });
      const prev = qc.getQueryData<Campanha[]>(["campanhas"]);
      if (prev) {
        qc.setQueryData<Campanha[]>(["campanhas"], prev.map((c) => {
          if (c.id !== vars.id) return c;
          return {
            ...c,
            status: (vars.status as CampanhaStatus) ?? c.status,
            items: vars.items ? (vars.items as CampanhaItem[]) : c.items,
            startedAt: vars.started_at !== undefined
              ? (vars.started_at ? new Date(vars.started_at).getTime() : undefined)
              : c.startedAt,
            lastSentAt: vars.last_sent_at !== undefined
              ? (vars.last_sent_at ? new Date(vars.last_sent_at).getTime() : undefined)
              : c.lastSentAt,
          };
        }));
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["campanhas"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["campanhas"] }),
  });

  const deleteCampanhaMut = useMutation({
    mutationFn: (id: string) => deleteCampanhaRemote({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["campanhas"] });
      const prev = qc.getQueryData<Campanha[]>(["campanhas"]);
      if (prev) qc.setQueryData<Campanha[]>(["campanhas"], prev.filter((c) => c.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["campanhas"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["campanhas"] }),
  });

  /* ============================== API pública ============================== */

  const incrementarBusca = useCallback(() => setBuscasUsadas((n) => n + 1), []);

  const addLead = useCallback((lead: MockLead) => {
    // Dedup local: se já temos esse lead na cache, retorna false.
    const current = qc.getQueryData<CrmLead[]>(["leads"]) ?? [];
    if (current.some((l) => l.nome === lead.nome && l.telefone === lead.telefone)) return false;
    upsertLeadMut.mutate(lead);
    return true;
  }, [qc, upsertLeadMut]);

  const findLeadById = useCallback((id: string) => {
    const cur = qc.getQueryData<CrmLead[]>(["leads"]) ?? [];
    return cur.find((l) => l.id === id);
  }, [qc]);

  const updateLeadStatus = useCallback((id: string, status: CrmStatus) => {
    const lead = findLeadById(id);
    if (!lead) return;
    const now = Date.now();
    const history = [...lead.history, { ts: now, text: `Status alterado para ${status}` }];
    const deveParar = lead.sequence?.enabled && status !== "novo" && status !== "contatado";
    const sequence = deveParar
      ? { ...lead.sequence!, enabled: false, stoppedAt: now, stoppedReason: "respondeu" as const }
      : lead.sequence;
    if (deveParar) history.push({ ts: now, text: "Cadência pausada automaticamente — lead avançou no funil" });
    updateLeadMut.mutate({ id, status, history, sequence_state: sequence ?? null });
  }, [findLeadById, updateLeadMut]);

  const updateLeadNotes = useCallback((id: string, notes: string) => {
    updateLeadMut.mutate({ id, notes });
  }, [updateLeadMut]);

  const setFollowUp = useCallback((id: string, iso: string | null) => {
    const lead = findLeadById(id);
    if (!lead) return;
    const history = [...lead.history, { ts: Date.now(), text: iso ? `Follow-up agendado para ${iso}` : "Follow-up removido" }];
    updateLeadMut.mutate({ id, follow_up_at: iso, history });
  }, [findLeadById, updateLeadMut]);

  const appendHistory = useCallback((id: string, text: string) => {
    const lead = findLeadById(id);
    if (!lead) return;
    const history = [...lead.history, { ts: Date.now(), text }];
    updateLeadMut.mutate({ id, history });
  }, [findLeadById, updateLeadMut]);

  const setLeadValor = useCallback((id: string, valor: number | null) => {
    const lead = findLeadById(id);
    if (!lead) return;
    const history = [...lead.history, { ts: Date.now(), text: valor != null ? `Valor fechado: R$ ${valor.toFixed(2)}` : "Valor fechado removido" }];
    updateLeadMut.mutate({ id, valor_fechado: valor, history });
  }, [findLeadById, updateLeadMut]);

  const startSequence = useCallback((id: string) => {
    const lead = findLeadById(id);
    if (!lead) return;
    const now = Date.now();
    const sequence: FollowUpSequence = { enabled: true, startedAt: now, sentSteps: [] };
    const history = [...lead.history, { ts: now, text: "Cadência de follow-up automático ativada" }];
    updateLeadMut.mutate({ id, sequence_state: sequence, history });
  }, [findLeadById, updateLeadMut]);

  const stopSequence = useCallback((id: string, reason: "respondeu" | "manual" | "concluida" = "manual") => {
    const lead = findLeadById(id);
    if (!lead?.sequence?.enabled) return;
    const now = Date.now();
    const txt = reason === "respondeu"
      ? "Cadência pausada — lead respondeu"
      : reason === "concluida"
        ? "Cadência concluída (3 mensagens enviadas)"
        : "Cadência pausada manualmente";
    const sequence = { ...lead.sequence, enabled: false, stoppedAt: now, stoppedReason: reason };
    const history = [...lead.history, { ts: now, text: txt }];
    updateLeadMut.mutate({ id, sequence_state: sequence, history });
  }, [findLeadById, updateLeadMut]);

  const markFollowUpSent = useCallback((id: string, step: number) => {
    const lead = findLeadById(id);
    if (!lead?.sequence) return;
    const now = Date.now();
    const sentSteps = [...lead.sequence.sentSteps, { step, ts: now }];
    const concluida = sentSteps.length >= 3;
    const sequence: FollowUpSequence = {
      ...lead.sequence,
      sentSteps,
      enabled: concluida ? false : lead.sequence.enabled,
      stoppedAt: concluida ? now : lead.sequence.stoppedAt,
      stoppedReason: concluida ? "concluida" : lead.sequence.stoppedReason,
    };
    const history = [...lead.history, { ts: now, text: `Follow-up automático #${step} enviado` }];
    updateLeadMut.mutate({ id, sequence_state: sequence, history });
  }, [findLeadById, updateLeadMut]);

  const marcarRespondeu = useCallback((id: string) => updateLeadStatus(id, "respondeu"), [updateLeadStatus]);

  /* ----- Templates / Buscas (locais) ----- */

  const addTemplate = useCallback((t: Omit<Template, "id">) => {
    setTemplates((prev) => [...prev, { ...t, id: `c${Date.now()}`, custom: true }]);
  }, []);
  const updateTemplate = useCallback((id: string, t: Partial<Template>) => {
    setTemplates((prev) => prev.map((x) => x.id === id ? { ...x, ...t } : x));
  }, []);
  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const addBuscaSalva = useCallback((b: Omit<BuscaSalva, "id" | "ultimoScan" | "novos" | "ativo">) => {
    setBuscasSalvas((prev) => [...prev, { ...b, id: `b${Date.now()}`, ultimoScan: Date.now(), novos: 0, ativo: true }]);
  }, []);
  const toggleBuscaSalva = useCallback((id: string) => {
    setBuscasSalvas((prev) => prev.map((b) => b.id === id ? { ...b, ativo: !b.ativo } : b));
  }, []);
  const removeBuscaSalva = useCallback((id: string) => {
    setBuscasSalvas((prev) => prev.filter((b) => b.id !== id));
  }, []);

  /* ----- Campanhas ----- */

  const createCampanha = useCallback((c: Omit<Campanha, "id" | "createdAt" | "status" | "items"> & { items: CampanhaItem[]; status?: CampanhaStatus }) => {
    const tempId = `temp_${Date.now()}`;
    const tpl = templates.find((t) => t.id === c.templateId);
    createCampanhaMut.mutate({
      nome: c.nome,
      templateId: c.templateId,
      mensagem: c.mensagemOverride || tpl?.mensagem || "",
      mensagemOverride: c.mensagemOverride,
      filtroNicho: c.filtroNicho,
      filtroCidade: c.filtroCidade,
      apenasSemSite: c.apenasSemSite,
      apenasStatusNovo: c.apenasStatusNovo,
      limitePorHora: c.limitePorHora,
      agendamento: c.agendamento,
      items: c.items,
    });
    return tempId;
  }, [createCampanhaMut, templates]);

  const deleteCampanha = useCallback((id: string) => {
    deleteCampanhaMut.mutate(id);
  }, [deleteCampanhaMut]);

  const setCampanhaStatus = useCallback((id: string, status: CampanhaStatus) => {
    const camp = (qc.getQueryData<Campanha[]>(["campanhas"]) ?? []).find((c) => c.id === id);
    updateCampanhaMut.mutate({
      id,
      status,
      started_at: status === "em_andamento" && !camp?.startedAt ? new Date().toISOString() : undefined,
    });
  }, [qc, updateCampanhaMut]);

  const markCampanhaItemEnviado = useCallback((campanhaId: string, leadId: string) => {
    const camp = (qc.getQueryData<Campanha[]>(["campanhas"]) ?? []).find((c) => c.id === campanhaId);
    if (!camp) return;
    const items = camp.items.map((it) => it.leadId === leadId && it.status === "pendente"
      ? { ...it, status: "enviado" as const, sentAt: Date.now() }
      : it);
    const restantes = items.filter((it) => it.status === "pendente").length;
    const nowIso = new Date().toISOString();
    updateCampanhaMut.mutate({
      id: campanhaId,
      items,
      last_sent_at: nowIso,
      status: restantes === 0 ? "concluida" : undefined,
    });
  }, [qc, updateCampanhaMut]);

  const value = useMemo<Store>(() => ({
    plano, setPlano,
    buscasUsadas, incrementarBusca,
    leads, addLead, updateLeadStatus, updateLeadNotes, setFollowUp, appendHistory, setLeadValor,
    startSequence, stopSequence, markFollowUpSent, marcarRespondeu,
    templates, templateSelecionado, setTemplateSelecionado, addTemplate, updateTemplate, deleteTemplate,
    pularPreviewWA, setPularPreviewWA,
    buscasSalvas, addBuscaSalva, toggleBuscaSalva, removeBuscaSalva,
    campanhas, createCampanha, deleteCampanha, setCampanhaStatus, markCampanhaItemEnviado,
    followupDias, setFollowupDias, defaultIntervaloSegundos, setDefaultIntervaloSegundos,
  }), [plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas, campanhas,
    followupDias, defaultIntervaloSegundos,
    incrementarBusca, addLead, updateLeadStatus, updateLeadNotes, setFollowUp, appendHistory, setLeadValor,
    startSequence, stopSequence, markFollowUpSent, marcarRespondeu,
    addTemplate, updateTemplate, deleteTemplate, addBuscaSalva, toggleBuscaSalva, removeBuscaSalva,
    createCampanha, deleteCampanha, setCampanhaStatus, markCampanhaItemEnviado]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore precisa estar dentro de AppStoreProvider");
  return v;
}

export function usePlano() {
  const { plano } = useStore();
  return PLANOS[plano];
}

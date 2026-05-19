import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PLANOS, type PlanoId } from "@/data/planos";
import { TEMPLATES_PADRAO, type Template } from "@/data/templates";
import type { MockLead } from "@/data/mock-leads";

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
  followUp: string | null; // ISO date (lembrete manual)
  history: { ts: number; text: string }[];
  sequence?: FollowUpSequence;
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
  filtroNicho: string; // "" = todos
  filtroCidade: string;
  apenasSemSite: boolean;
  apenasStatusNovo: boolean;
  limitePorHora: number; // 1..120
  agendamento?: number; // timestamp ms
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
  addLead: (lead: MockLead) => boolean; // false se já existe
  updateLeadStatus: (id: string, status: CrmStatus) => void;
  updateLeadNotes: (id: string, notes: string) => void;
  setFollowUp: (id: string, iso: string | null) => void;
  appendHistory: (id: string, text: string) => void;

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

  // Configurações de cadência (dias entre os 3 follow-ups) e padrão de intervalo (s) entre mensagens em novas campanhas.
  followupDias: [number, number, number];
  setFollowupDias: (d: [number, number, number]) => void;
  defaultIntervaloSegundos: number;
  setDefaultIntervaloSegundos: (s: number) => void;
};

const STORAGE_KEY = "zapscout:v1";

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

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const init = loadInit();
  const [plano, setPlano] = useState<PlanoId>(init?.plano ?? "free");
  const [buscasUsadas, setBuscasUsadas] = useState<number>(init?.buscasUsadas ?? 0);
  const [leads, setLeads] = useState<CrmLead[]>(init?.leads ?? []);
  const [templates, setTemplates] = useState<Template[]>(init?.templates ?? TEMPLATES_PADRAO);
  const [templateSelecionado, setTemplateSelecionado] = useState<string>(init?.templateSelecionado ?? TEMPLATES_PADRAO[1].id);
  const [pularPreviewWA, setPularPreviewWA] = useState<boolean>(init?.pularPreviewWA ?? false);
  const [buscasSalvas, setBuscasSalvas] = useState<BuscaSalva[]>(init?.buscasSalvas ?? []);
  const [campanhas, setCampanhas] = useState<Campanha[]>(init?.campanhas ?? []);
  const [followupDias, setFollowupDias] = useState<[number, number, number]>(init?.followupDias ?? [1, 2, 3]);
  const [defaultIntervaloSegundos, setDefaultIntervaloSegundos] = useState<number>(init?.defaultIntervaloSegundos ?? 180);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas, campanhas, followupDias, defaultIntervaloSegundos }),
      );
    } catch { /* noop */ }
  }, [plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas, campanhas, followupDias, defaultIntervaloSegundos]);

  const incrementarBusca = useCallback(() => setBuscasUsadas((n) => n + 1), []);

  const addLead = useCallback((lead: MockLead) => {
    let ok = true;
    setLeads((prev) => {
      if (prev.some((l) => l.id === lead.id)) { ok = false; return prev; }
      const now = Date.now();
      return [
        ...prev,
        { ...lead, status: "novo", addedAt: now, notes: "", followUp: null, history: [{ ts: now, text: "Adicionado ao CRM" }] },
      ];
    });
    return ok;
  }, []);

  // updateLeadStatus duplicado — implementação real está abaixo


  const updateLeadNotes = useCallback((id: string, notes: string) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, notes } : l));
  }, []);

  const setFollowUp = useCallback((id: string, iso: string | null) => {
    setLeads((prev) => prev.map((l) => l.id === id
      ? { ...l, followUp: iso, history: [...l.history, { ts: Date.now(), text: iso ? `Follow-up agendado para ${iso}` : "Follow-up removido" }] }
      : l));
  }, []);

  const appendHistory = useCallback((id: string, text: string) => {
    setLeads((prev) => prev.map((l) => l.id === id
      ? { ...l, history: [...l.history, { ts: Date.now(), text }] }
      : l));
  }, []);

  const startSequence = useCallback((id: string) => {
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const now = Date.now();
      return {
        ...l,
        sequence: { enabled: true, startedAt: now, sentSteps: [] },
        history: [...l.history, { ts: now, text: "Cadência de follow-up automático ativada" }],
      };
    }));
  }, []);

  const stopSequence = useCallback((id: string, reason: "respondeu" | "manual" | "concluida" = "manual") => {
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id || !l.sequence?.enabled) return l;
      const now = Date.now();
      const txt = reason === "respondeu"
        ? "Cadência pausada — lead respondeu"
        : reason === "concluida"
          ? "Cadência concluída (3 mensagens enviadas)"
          : "Cadência pausada manualmente";
      return {
        ...l,
        sequence: { ...l.sequence, enabled: false, stoppedAt: now, stoppedReason: reason },
        history: [...l.history, { ts: now, text: txt }],
      };
    }));
  }, []);

  const markFollowUpSent = useCallback((id: string, step: number) => {
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id || !l.sequence) return l;
      const now = Date.now();
      const sentSteps = [...l.sequence.sentSteps, { step, ts: now }];
      const concluida = sentSteps.length >= 3;
      return {
        ...l,
        sequence: {
          ...l.sequence,
          sentSteps,
          enabled: concluida ? false : l.sequence.enabled,
          stoppedAt: concluida ? now : l.sequence.stoppedAt,
          stoppedReason: concluida ? "concluida" : l.sequence.stoppedReason,
        },
        history: [...l.history, { ts: now, text: `Follow-up automático #${step} enviado` }],
      };
    }));
  }, []);

  // updateLeadStatus com auto-stop quando o lead "responde"/segue no funil
  const updateLeadStatus = useCallback((id: string, status: CrmStatus) => {
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const now = Date.now();
      const novoHistorico = [...l.history, { ts: now, text: `Status alterado para ${status}` }];
      const deveParar = l.sequence?.enabled && status !== "novo" && status !== "contatado";
      const seq = deveParar
        ? { ...l.sequence!, enabled: false, stoppedAt: now, stoppedReason: "respondeu" as const }
        : l.sequence;
      if (deveParar) novoHistorico.push({ ts: now, text: "Cadência pausada automaticamente — lead avançou no funil" });
      return { ...l, status, sequence: seq, history: novoHistorico };
    }));
  }, []);

  const marcarRespondeu = useCallback((id: string) => {
    updateLeadStatus(id, "respondeu");
  }, [updateLeadStatus]);



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

  const createCampanha = useCallback((c: Omit<Campanha, "id" | "createdAt" | "status" | "items"> & { items: CampanhaItem[]; status?: CampanhaStatus }) => {
    const id = `camp_${Date.now()}`;
    setCampanhas((prev) => [
      ...prev,
      { ...c, id, createdAt: Date.now(), status: c.status ?? (c.agendamento ? "agendada" : "rascunho") },
    ]);
    return id;
  }, []);
  const deleteCampanha = useCallback((id: string) => {
    setCampanhas((prev) => prev.filter((c) => c.id !== id));
  }, []);
  const setCampanhaStatus = useCallback((id: string, status: CampanhaStatus) => {
    setCampanhas((prev) => prev.map((c) => c.id === id
      ? { ...c, status, startedAt: status === "em_andamento" && !c.startedAt ? Date.now() : c.startedAt }
      : c));
  }, []);
  const markCampanhaItemEnviado = useCallback((campanhaId: string, leadId: string) => {
    setCampanhas((prev) => prev.map((c) => {
      if (c.id !== campanhaId) return c;
      const items = c.items.map((it) => it.leadId === leadId && it.status === "pendente"
        ? { ...it, status: "enviado" as const, sentAt: Date.now() }
        : it);
      const restantes = items.filter((it) => it.status === "pendente").length;
      return {
        ...c,
        items,
        lastSentAt: Date.now(),
        status: restantes === 0 ? "concluida" : c.status,
      };
    }));
  }, []);

  const value = useMemo<Store>(() => ({
    plano, setPlano,
    buscasUsadas, incrementarBusca,
    leads, addLead, updateLeadStatus, updateLeadNotes, setFollowUp, appendHistory,
    startSequence, stopSequence, markFollowUpSent, marcarRespondeu,
    templates, templateSelecionado, setTemplateSelecionado, addTemplate, updateTemplate, deleteTemplate,
    pularPreviewWA, setPularPreviewWA,
    buscasSalvas, addBuscaSalva, toggleBuscaSalva, removeBuscaSalva,
    campanhas, createCampanha, deleteCampanha, setCampanhaStatus, markCampanhaItemEnviado,
  }), [plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas, campanhas,
    incrementarBusca, addLead, updateLeadStatus, updateLeadNotes, setFollowUp, appendHistory,
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

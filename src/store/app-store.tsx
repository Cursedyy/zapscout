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

export type CrmLead = MockLead & {
  status: CrmStatus;
  addedAt: number;
  notes: string;
  followUp: string | null; // ISO date
  history: { ts: number; text: string }[];
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

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas }),
      );
    } catch { /* noop */ }
  }, [plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas]);

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

  const updateLeadStatus = useCallback((id: string, status: CrmStatus) => {
    setLeads((prev) => prev.map((l) => l.id === id
      ? { ...l, status, history: [...l.history, { ts: Date.now(), text: `Status alterado para ${status}` }] }
      : l));
  }, []);

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

  const value = useMemo<Store>(() => ({
    plano, setPlano,
    buscasUsadas, incrementarBusca,
    leads, addLead, updateLeadStatus, updateLeadNotes, setFollowUp, appendHistory,
    templates, templateSelecionado, setTemplateSelecionado, addTemplate, updateTemplate, deleteTemplate,
    pularPreviewWA, setPularPreviewWA,
    buscasSalvas, addBuscaSalva, toggleBuscaSalva, removeBuscaSalva,
  }), [plano, buscasUsadas, leads, templates, templateSelecionado, pularPreviewWA, buscasSalvas,
    incrementarBusca, addLead, updateLeadStatus, updateLeadNotes, setFollowUp, appendHistory,
    addTemplate, updateTemplate, deleteTemplate, addBuscaSalva, toggleBuscaSalva, removeBuscaSalva]);

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

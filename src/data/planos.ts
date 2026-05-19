export type PlanoId = "free" | "pro" | "agencia";

export type Plano = {
  id: PlanoId;
  nome: string;
  preco: number;
  buscas_mes: number;
  leads_export: boolean;
  templates_custom: number;
  usuarios: number;
  ia_templates: boolean;
  follow_up: boolean;
  monitoramento: number;
  beneficios: string[];
  popular?: boolean;
};

export const PLANOS: Record<PlanoId, Plano> = {
  free: {
    id: "free",
    nome: "Free",
    preco: 0,
    buscas_mes: 20,
    leads_export: false,
    templates_custom: 2,
    usuarios: 1,
    ia_templates: false,
    follow_up: false,
    monitoramento: 0,
    beneficios: [
      "20 buscas por mês",
      "CRM com leads ilimitados",
      "2 templates personalizados",
      "Abordagem 1-clique no WhatsApp",
    ],
  },
  pro: {
    id: "pro",
    nome: "Pro",
    preco: 97,
    buscas_mes: 500,
    leads_export: true,
    templates_custom: 999,
    usuarios: 1,
    ia_templates: true,
    follow_up: true,
    monitoramento: 3,
    popular: true,
    beneficios: [
      "500 buscas por mês",
      "Exportação CSV ilimitada",
      "Templates personalizados ilimitados",
      "Geração de templates com IA",
      "Follow-ups e agendamentos",
      "3 buscas em monitoramento",
    ],
  },
  agencia: {
    id: "agencia",
    nome: "Agência",
    preco: 247,
    buscas_mes: 9999,
    leads_export: true,
    templates_custom: 999,
    usuarios: 10,
    ia_templates: true,
    follow_up: true,
    monitoramento: 999,
    beneficios: [
      "Buscas ilimitadas",
      "Até 10 usuários na equipe",
      "Tudo do plano Pro",
      "Monitoramento ilimitado",
      "Suporte prioritário",
    ],
  },
};

export type PlanoId = "free" | "pro" | "agencia" | "business" | "dono";

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
  /** Plano oculto — nunca exibido em telas públicas/pricing. */
  hidden?: boolean;
  /** URL do checkout Kiwify (vazio para planos free). */
  checkoutUrl?: string;
};

export const LINKS_KIWIFY = {
  pro: "https://pay.kiwify.com.br/0SGQIkZ",
  agencia: "https://pay.kiwify.com.br/5eK1MKf",
} as const;

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
      "2 templates de mensagem",
      "Botão WhatsApp 1 clique",
      "Exportar CSV",
    ],
  },
  pro: {
    id: "pro",
    nome: "Pro",
    preco: 67,
    checkoutUrl: "https://pay.kiwify.com.br/0SGQIkZ",
    buscas_mes: 50,
    leads_export: true,
    templates_custom: 999,
    usuarios: 1,
    ia_templates: true,
    follow_up: true,
    monitoramento: 3,
    popular: true,
    beneficios: [
      "50 buscas por mês",
      "Templates ilimitados",
      "Geração de templates com IA",
      "Follow-ups automáticos",
      "3 buscas em monitoramento",
      "Exportar CSV ilimitado",
      "Suporte por email",
    ],
  },
  agencia: {
    id: "agencia",
    nome: "Agência",
    preco: 247,
    checkoutUrl: "https://pay.kiwify.com.br/5eK1MKf",
    buscas_mes: 200,
    leads_export: true,
    templates_custom: 999,
    usuarios: 5,
    ia_templates: true,
    follow_up: true,
    monitoramento: 10,
    beneficios: [
      "200 buscas por mês",
      "Tudo do plano Pro",
      "Até 5 usuários na equipe",
      "10 buscas em monitoramento",
      "Relatórios avançados",
      "Suporte prioritário",
    ],
  },
  business: {
    id: "business",
    nome: "Business",
    preco: 497,
    buscas_mes: 500,
    leads_export: true,
    templates_custom: 999,
    usuarios: 10,
    ia_templates: true,
    follow_up: true,
    monitoramento: 999,
    beneficios: [
      "500 buscas por mês",
      "Tudo do plano Agência",
      "Até 10 usuários na equipe",
      "Monitoramento ilimitado",
      "IA de vendas inclusa",
      "Suporte dedicado 1:1",
    ],
  },
  dono: {
    id: "dono",
    nome: "Dono",
    preco: 0,
    hidden: true,
    buscas_mes: 999999,
    leads_export: true,
    templates_custom: 999999,
    usuarios: 999999,
    ia_templates: true,
    follow_up: true,
    monitoramento: 999999,
    beneficios: ["Acesso total ao sistema", "Painel administrativo"],
  },
};

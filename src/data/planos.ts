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
  /** Campanhas de disparo em massa. */
  campanhas: boolean;
  /** Aquecimento de número — descrição do limite. */
  aquecimento: string;
  /** Intensidade agressiva no aquecimento. */
  aquecimento_agressivo: boolean;
  /** Suporte prioritário com SLA. */
  suporte_sla: boolean;
};

export const LINKS_KIWIFY = {
  pro: "https://pay.kiwify.com.br/0SGQIkZ",
  agencia: "https://pay.kiwify.com.br/5eK1MKf",
  business: "https://pay.kiwify.com.br/UpqSUM1",
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
    campanhas: false,
    aquecimento: "Bloqueado",
    aquecimento_agressivo: false,
    suporte_sla: false,
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
    campanhas: true,
    aquecimento: "1 chip · 7 dias",
    aquecimento_agressivo: false,
    suporte_sla: false,
    popular: true,
    beneficios: [
      "50 buscas por mês",
      "Templates ilimitados",
      "Geração de templates com IA",
      "Follow-ups automáticos",
      "Campanhas de disparo em massa",
      "3 buscas em monitoramento",
      "Exportar CSV ilimitado",
      "Aquecimento de número (1 chip, 7 dias)",
      "Suporte por email",
    ],
  },
  agencia: {
    id: "agencia",
    nome: "Agência",
    preco: 147,
    checkoutUrl: "https://pay.kiwify.com.br/5eK1MKf",
    buscas_mes: 200,
    leads_export: true,
    templates_custom: 999,
    usuarios: 5,
    ia_templates: true,
    follow_up: true,
    monitoramento: 10,
    campanhas: true,
    aquecimento: "3 chips · 30 dias",
    aquecimento_agressivo: false,
    suporte_sla: false,
    beneficios: [
      "200 buscas por mês",
      "Tudo do plano Pro",
      "Até 5 usuários na equipe",
      "10 buscas em monitoramento",
      "Aquecimento de até 3 chips simultâneos",
      "Relatórios avançados",
      "Suporte prioritário",
    ],
  },
  business: {
    id: "business",
    nome: "Business",
    preco: 497,
    checkoutUrl: "https://pay.kiwify.com.br/UpqSUM1",
    buscas_mes: 99999,
    leads_export: true,
    templates_custom: 999,
    usuarios: 999,
    ia_templates: true,
    follow_up: true,
    monitoramento: 999,
    campanhas: true,
    aquecimento: "5 chips · 30 dias",
    aquecimento_agressivo: true,
    suporte_sla: true,
    beneficios: [
      "Buscas ilimitadas",
      "Tudo do plano Agência",
      "Usuários ilimitados",
      "Campanhas ilimitadas",
      "Aquecimento de até 5 chips com intensidade agressiva",
      "IA de vendas sem limite de conversas",
      "Webhook para integração com CRM externo",
      "White-label completo",
      "Onboarding dedicado",
      "Suporte prioritário SLA 2h",
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
    campanhas: true,
    aquecimento: "Ilimitado",
    aquecimento_agressivo: true,
    suporte_sla: true,
    beneficios: ["Acesso total ao sistema", "Painel administrativo"],
  },
};

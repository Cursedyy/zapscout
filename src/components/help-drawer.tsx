import { useState, useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { HelpCircle, PlayCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type HelpSection = { title: string; body: string };
type HelpPage = { title: string; intro: string; sections: HelpSection[] };

const HELP_BY_PATH: Record<string, HelpPage> = {
  "/app/buscar": {
    title: "Buscar leads",
    intro: "Encontre negócios reais no Google Maps por nicho e cidade para alimentar seu CRM.",
    sections: [
      { title: "Como funciona", body: "Digite o nicho (ex: clínica, restaurante, academia) e a cidade. O ZapScout consulta o Google Maps e devolve negócios com telefone, avaliação, endereço e site." },
      { title: "Dicas de nicho", body: "Use termos que os próprios negócios usariam para se descrever (ex: 'estética facial', 'oficina mecânica'). Quanto mais específico, melhor a qualidade." },
      { title: "Dicas de cidade", body: "Comece por uma cidade que você conhece bem ou onde já vende. Você pode buscar bairros específicos para refinar." },
      { title: "Score do lead", body: "Combina avaliação no Google, quantidade de reviews e se possui site. Quanto mais alto, maior o potencial — priorize estes nas campanhas." },
      { title: "Salvar busca", body: "Clique em 'Salvar busca' para adicionar todos os leads ao seu CRM. Eles entram com status 'Novo'." },
    ],
  },
  "/app/leads": {
    title: "Meus leads (CRM)",
    intro: "Kanban para acompanhar cada lead do primeiro contato ao fechamento.",
    sections: [
      { title: "Mover pelo funil", body: "Arraste o card entre colunas (Novo → Contatado → Respondeu → Negociação → Fechado/Perdido) ou use o menu de status." },
      { title: "Seleção em massa", body: "Marque vários leads e use 'Mover para' para atualizar todos de uma vez." },
      { title: "Enviar mensagem", body: "Abra o card e clique em 'WhatsApp' para abrir uma conversa com o template selecionado preenchido." },
      { title: "Histórico e notas", body: "Cada lead tem histórico automático e campo de notas. Use para registrar combinados e objeções." },
      { title: "Exportar CSV", body: "Botão 'Exportar' baixa todos os leads filtrados em planilha — útil para backup ou enviar para parceiros." },
    ],
  },
  "/app/campanhas": {
    title: "Campanhas",
    intro: "Dispare a mesma mensagem para vários leads do CRM de forma controlada.",
    sections: [
      { title: "Criar campanha", body: "Clique em 'Nova campanha'. Escolha um template, defina filtros (nicho, cidade, apenas sem site) e o limite por hora." },
      { title: "Filtros", body: "Restringem quais leads do CRM entram na campanha. Use 'Apenas status Novo' para não reabordar quem já foi contatado." },
      { title: "Limite por hora", body: "Mantém o ritmo natural e protege o número de bloqueio. Sugerido: 15–30 disparos/hora para chip aquecido, menos para chip novo." },
      { title: "Agendar", body: "Você pode agendar a campanha para iniciar em horário comercial. Fora do horário comercial reduz taxa de resposta." },
    ],
  },
  "/app/sequencias": {
    title: "Sequências (follow-up automático)",
    intro: "Mensagens de acompanhamento enviadas automaticamente nos dias seguintes.",
    sections: [
      { title: "Estrutura", body: "Cada sequência tem várias etapas. Cada etapa define o intervalo (em horas ou dias) desde a etapa anterior e a mensagem a enviar." },
      { title: "Quando para", body: "A sequência para automaticamente se o lead responder ou for movido para 'Negociação'/'Fechado'/'Perdido'." },
      { title: "Variáveis", body: "Use {{nome}}, {{cidade}} e {{empresa}} para personalizar cada mensagem da cadência." },
      { title: "Quantas etapas", body: "3 a 5 etapas costuma render melhor. Espace as primeiras em 1–3 dias e a última como 'última tentativa' após 7 dias." },
    ],
  },
  "/app/templates": {
    title: "Templates de mensagem",
    intro: "Mensagens reutilizáveis com variáveis dinâmicas por lead.",
    sections: [
      { title: "Variáveis disponíveis", body: "{{nome}} — nome do contato/empresa; {{cidade}} — cidade do lead; {{empresa}} — nome da empresa. São substituídas no momento do envio." },
      { title: "Template eficiente", body: "Curto (2–4 linhas), 1 pergunta clara no final, sem links na primeira mensagem (links na 1ª msg derrubam a entrega)." },
      { title: "Tom", body: "Escreva como você falaria por WhatsApp com um conhecido. Evite palavras de propaganda ('promoção', 'oferta única')." },
      { title: "Testar", body: "Antes de campanhas grandes, dispare manualmente para 3–5 leads e ajuste o template pela resposta." },
    ],
  },
  "/app/whatsapp": {
    title: "WhatsApp",
    intro: "Conecte seu número e mantenha o chip aquecido.",
    sections: [
      { title: "Conectar via API Key", body: "Clique em 'Usar minha API Key' e insira as credenciais da sua instância UazAPI. Sem isso, nenhuma mensagem é enviada." },
      { title: "O que é aquecimento", body: "Antes de disparar em massa, o número precisa parecer humano. O aquecimento envia trocas simuladas entre chips de forma crescente." },
      { title: "Quando aquecer", body: "Sempre que o número for novo, ou se ficou parado por mais de 30 dias. Ative em 'Aquecimento de número'." },
      { title: "Evitar bloqueio", body: "Não dispare mais de 30/hora em chip novo, varie o texto (templates diferentes) e não envie links na 1ª mensagem." },
    ],
  },
  "/app/relatorios": {
    title: "Relatórios",
    intro: "Métricas para entender o que está funcionando.",
    sections: [
      { title: "Leads contatados", body: "Quantos leads do CRM já receberam pelo menos uma mensagem sua." },
      { title: "Taxa de resposta", body: "(Leads que responderam ÷ leads contatados) × 100. Saudável: 8–20% para cold outreach via WhatsApp." },
      { title: "Conversões", body: "Leads marcados como 'Fechado' no kanban. Acompanhe junto do valor fechado para entender retorno real." },
      { title: "Quando ajustar", body: "Resposta < 5%: revise o template. Resposta alta + conversão baixa: melhore o discovery na conversa." },
    ],
  },
  "/app/afiliados": {
    title: "Afiliados",
    intro: "Indique o ZapScout e receba comissão recorrente.",
    sections: [
      { title: "Como funciona", body: "Compartilhe seu link único. Cada venda gerada pelo seu link rende comissão enquanto a pessoa for assinante." },
      { title: "Comissão", body: "Percentual sobre o valor pago pelo indicado, recorrente em cada renovação do plano." },
      { title: "Acompanhamento", body: "A tela mostra cliques no seu link, indicados que se cadastraram, e os que viraram assinantes pagos." },
      { title: "Saque", body: "Quando atingir o valor mínimo, solicite o saque. O pagamento cai via Pix nos dias úteis seguintes." },
    ],
  },
};

const DEFAULT_HELP: HelpPage = {
  title: "Como usar o ZapScout",
  intro: "Ajuda geral do painel. Selecione uma seção do menu para ver dicas específicas dela.",
  sections: [
    { title: "Fluxo recomendado", body: "1) Buscar leads → 2) Conectar WhatsApp → 3) Criar template → 4) Disparar campanha → 5) Acompanhar no CRM." },
    { title: "Atalho", body: "Use o '?' no canto superior direito de qualquer página para abrir a ajuda contextual daquela tela." },
  ],
};

function pickHelp(pathname: string): HelpPage {
  if (HELP_BY_PATH[pathname]) return HELP_BY_PATH[pathname];
  // Match por prefixo (ex: /app/campanhas/nova → ajuda de /app/campanhas)
  const keys = Object.keys(HELP_BY_PATH).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (pathname === k || pathname.startsWith(k + "/")) return HELP_BY_PATH[k];
  }
  return DEFAULT_HELP;
}

export function HelpButton({ className, variant = "fixed" }: { className?: string; variant?: "fixed" | "inline" }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const help = useMemo(() => pickHelp(pathname), [pathname]);

  const dispararTutorial = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zs:open-tutorial"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir ajuda desta página"
        className={cn(
          variant === "fixed"
            ? "hidden md:flex fixed top-4 right-4 z-40 h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow hover:scale-105 transition-transform"
            : "h-9 w-9 inline-flex items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors",
          className,
        )}
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-5 pb-3 border-b border-border shrink-0">
            <div className="flex items-start gap-3">
              <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/15 text-primary shrink-0">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-left">{help.title}</SheetTitle>
                <SheetDescription className="text-left mt-1">{help.intro}</SheetDescription>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Fechar ajuda"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {help.sections.map((s, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold mb-1.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border bg-background p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={dispararTutorial}
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Ver tutorial completo
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

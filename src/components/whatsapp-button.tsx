import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/app-store";
import { renderTemplate } from "@/data/templates";
import { getWhatsAppConfig, sendNow } from "@/lib/whatsapp.functions";
import { registrarMensagemEnviada } from "@/lib/mensagens.functions";
import { upsertLeadRemote } from "@/lib/crm.functions";
import { useHasSession } from "@/hooks/use-has-session";
import type { MockLead } from "@/data/mock-leads";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function WhatsAppButton({
  lead,
  size = "sm",
  label = "Abordar no WhatsApp",
}: {
  lead: MockLead;
  size?: "sm" | "default" | "lg";
  label?: string;
}) {
  const {
    templates,
    templateSelecionado,
    pularPreviewWA,
    setPularPreviewWA,
    appendHistory,
    addLead,
    leads,
    startSequence,
    updateLeadStatus,
  } = useStore();
  const tpl = templates.find((t) => t.id === templateSelecionado) ?? templates[0];
  const mensagemInicial = renderTemplate(tpl?.mensagem ?? "", {
    nome: lead.nome,
    cidade: lead.cidade,
    nicho: lead.nicho,
    avaliacao: lead.avaliacao,
    telefone: lead.telefone,
    endereco: lead.endereco,
  });

  const [open, setOpen] = useState(false);
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [skipNext, setSkipNext] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const cfgFn = useServerFn(getWhatsAppConfig);
  const registrarFn = useServerFn(registrarMensagemEnviada);
  const hasSession = useHasSession();
  const { data: config, isLoading: cfgLoading } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => cfgFn(),
    enabled: hasSession === true,
    staleTime: 20000,
  });
  const sendFn = useServerFn(sendNow);
  // Considera conectado se a API confirmou OU se há provedor configurado.
  const conectado = !!config?.connected || !!config?.provider;
  const aguardandoConfig = hasSession === true && (cfgLoading || config === undefined);

  const normTel = (s?: string | null) => (s ?? "").replace(/\D/g, "");
  const findCrm = () =>
    leads.find(
      (l) =>
        l.id === lead.id ||
        (l.nome === lead.nome && l.telefone === lead.telefone) ||
        (!!lead.telefone && normTel(l.telefone) === normTel(lead.telefone)),
    );

  const registrarSucesso = (_texto: string) => {
    const existente = findCrm();
    if (!existente) addLead(lead);
    const aplicar = () => {
      const atual = findCrm();
      const idAlvo = atual?.id ?? lead.id;
      appendHistory(idAlvo, "Mensagem WhatsApp enviada");
      if (atual) {
        if (atual.status === "novo") updateLeadStatus(atual.id, "contatado");
        if (!atual.sequence) startSequence(atual.id);
      }
    };
    if (existente) aplicar();
    else setTimeout(aplicar, 400);
  };


  const dispararApi = async (texto: string) => {
    setEnviando(true);
    try {
      await sendFn({ data: { numero: lead.telefone, texto, leadId: lead.id as string } });
      registrarSucesso(texto);
      try {
        await registrarFn({ data: { leadId: lead.id as string, texto, status: "enviado" } });
      } catch (regErr) {
        console.error("Erro ao registrar mensagem_enviada:", regErr);
      }
      setEnviado(true);
      toast.success("Mensagem enviada pelo WhatsApp! ✓");
      setTimeout(() => setEnviado(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no envio";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  const disparar = (texto: string) => {
    if (aguardandoConfig) {
      toast.info("Verificando conexão do WhatsApp...");
      return;
    }
    if (!conectado) {
      toast.error("WhatsApp não conectado. Conecte em /app/whatsapp para enviar mensagens.");
      return;
    }
    void dispararApi(texto);
  };

  const onClick = () => {
    // Lead sem telefone: não envia nem altera status. Só avisa o usuário.
    if (!normTel(lead.telefone)) {
      toast.error("Este lead não tem telefone cadastrado. Edite o lead e adicione um número para enviar mensagem.");
      return;
    }
    if (pularPreviewWA) {
      disparar(mensagemInicial);
      return;
    }
    setMensagem(mensagemInicial);
    setOpen(true);
  };

  const btnLabel = enviado
    ? "Enviado!"
    : enviando
      ? "Enviando..."
      : conectado
        ? "Enviar mensagem"
        : label;
  const btnIcon = enviado ? (
    <CheckCircle2 className="h-4 w-4" />
  ) : enviando ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <MessageCircle className="h-4 w-4" />
  );

  return (
    <>
      <Button
        size={size}
        onClick={onClick}
        disabled={enviando}
        className="bg-[color:var(--color-zap)] hover:bg-[color:var(--color-zap-dark)] text-white"
        title={conectado ? "Enviar pela API conectada" : "Conecte seu WhatsApp em /app/whatsapp para envio direto"}
      >
        {btnIcon} {btnLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview da mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Para: <span className="text-foreground font-medium">{lead.nome}</span> · {lead.telefone}
              {conectado && (
                <span className="ml-2 text-success">● envio direto via API</span>
              )}
            </div>
            <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={7} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={skipNext}
                onChange={(e) => setSkipNext(e.target.checked)}
              />
              Não mostrar preview novamente
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-[color:var(--color-zap)] hover:bg-[color:var(--color-zap-dark)] text-white"
                disabled={enviando}
                onClick={() => {
                  if (skipNext) setPularPreviewWA(true);
                  disparar(mensagem);
                  setOpen(false);
                }}
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                {conectado ? " Enviar pela API" : " WhatsApp não conectado"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

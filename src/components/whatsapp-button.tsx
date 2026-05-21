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
import type { MockLead } from "@/data/mock-leads";

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
  const { data: config } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => cfgFn(),
    staleTime: 20000,
  });
  const sendFn = useServerFn(sendNow);
  const conectado = !!config?.connected;

  const registrarSucesso = (texto: string) => {
    addLead(lead);
    appendHistory(lead.id, "Mensagem WhatsApp enviada");
    const atual = leads.find((l) => l.id === lead.id);
    if (atual) {
      if (atual.status === "novo") updateLeadStatus(lead.id, "contatado");
      if (!atual.sequence) startSequence(lead.id);
    } else {
      setTimeout(() => {
        updateLeadStatus(lead.id, "contatado");
        startSequence(lead.id);
      }, 0);
    }
  };

  const dispararWaMe = (texto: string) => {
    const fone = lead.telefone.replace(/\D/g, "");
    const url = `https://wa.me/55${fone}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener");
    registrarSucesso(texto);
    toast.success("WhatsApp aberto · cadência ativada ✓");
  };

  const dispararApi = async (texto: string) => {
    setEnviando(true);
    try {
      await sendFn({ data: { numero: lead.telefone, texto, leadId: lead.id as string } });
      registrarSucesso(texto);
      setEnviado(true);
      toast.success("Mensagem enviada pelo WhatsApp! ✓");
      setTimeout(() => setEnviado(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no envio";
      toast.error(`${msg} — abrindo wa.me como fallback`);
      dispararWaMe(texto); // fallback
    } finally {
      setEnviando(false);
    }
  };

  const disparar = (texto: string) => {
    if (conectado) void dispararApi(texto);
    else dispararWaMe(texto);
  };

  const onClick = () => {
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
                {conectado ? " Enviar pela API" : " Enviar no WhatsApp"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

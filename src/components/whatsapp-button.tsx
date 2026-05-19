import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store/app-store";
import { renderTemplate } from "@/data/templates";
import type { MockLead } from "@/data/mock-leads";

export function WhatsAppButton({ lead, size = "sm", label = "Abordar no WhatsApp" }: { lead: MockLead; size?: "sm" | "default" | "lg"; label?: string }) {
  const { templates, templateSelecionado, pularPreviewWA, setPularPreviewWA, appendHistory, addLead, leads, startSequence, updateLeadStatus } = useStore();
  const [open, setOpen] = useState(false);
  const tpl = templates.find((t) => t.id === templateSelecionado) ?? templates[0];
  const mensagemInicial = renderTemplate(tpl?.mensagem ?? "", { nome: lead.nome, cidade: lead.cidade, nicho: lead.nicho, avaliacao: lead.avaliacao, telefone: lead.telefone, endereco: lead.endereco });
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [skipNext, setSkipNext] = useState(false);

  const disparar = (texto: string) => {
    const fone = lead.telefone.replace(/\D/g, "");
    const url = `https://wa.me/55${fone}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener");
    addLead(lead);
    appendHistory(lead.id, "Abordado via WhatsApp");
    // Move para "contatado" e inicia cadência automática se ainda não existir
    const atual = leads.find((l) => l.id === lead.id);
    if (atual) {
      if (atual.status === "novo") updateLeadStatus(lead.id, "contatado");
      if (!atual.sequence) startSequence(lead.id);
    } else {
      // foi acabado de adicionar pelo addLead — dispara num microtask
      setTimeout(() => { updateLeadStatus(lead.id, "contatado"); startSequence(lead.id); }, 0);
    }
    toast.success("WhatsApp aberto · cadência de follow-up ativada ✓");
  };

  const onClick = () => {
    if (pularPreviewWA) { disparar(mensagemInicial); return; }
    setMensagem(mensagemInicial);
    setOpen(true);
  };

  return (
    <>
      <Button size={size} onClick={onClick} className="bg-[color:var(--color-zap)] hover:bg-[color:var(--color-zap-dark)] text-white">
        <MessageCircle className="h-4 w-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Preview da mensagem</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Para: <span className="text-foreground font-medium">{lead.nome}</span> · {lead.telefone}</div>
            <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={7} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={skipNext} onChange={(e) => setSkipNext(e.target.checked)} />
              Não mostrar preview novamente
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-[color:var(--color-zap)] hover:bg-[color:var(--color-zap-dark)] text-white"
                onClick={() => { if (skipNext) setPularPreviewWA(true); disparar(mensagem); setOpen(false); }}
              >
                <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

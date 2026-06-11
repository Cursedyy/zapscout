import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { salvarFeedback } from "@/lib/feedback.functions";
import { toast } from "sonner";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [loading, setLoading] = useState(false);

  const enviar = async () => {
    if (!mensagem.trim()) return;
    setLoading(true);
    try {
      await salvarFeedback({ data: { mensagem: mensagem.trim() } });
      toast.success("Feedback enviado! Obrigado.");
      setMensagem("");
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao enviar feedback. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Enviar sugestão ou feedback"
        title="Sugestão ou feedback"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sugestão ou feedback</DialogTitle>
            <DialogDescription>
              Conte-nos o que podemos melhorar ou qual ideia você tem.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              maxLength={2000}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={loading || !mensagem.trim()}>
              {loading ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

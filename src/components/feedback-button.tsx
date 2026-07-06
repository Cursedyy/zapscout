import { useRef, useState } from "react";
import { MessageSquare, Paperclip, X, Loader2, ImageIcon, Bug, Lightbulb, HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { salvarFeedback, type CategoriaFeedback } from "@/lib/feedback.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MAX_MB = 5;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

const CATEGORIAS: { id: CategoriaFeedback; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "bug", label: "Bug", icon: Bug },
  { id: "ideia", label: "Ideia", icon: Lightbulb },
  { id: "melhoria", label: "Melhoria", icon: Sparkles },
  { id: "duvida", label: "Dúvida", icon: HelpCircle },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [categoria, setCategoria] = useState<CategoriaFeedback>("ideia");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const escolherArquivo = (f: File | null) => {
    if (!f) {
      setArquivo(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    if (!ACCEPT.split(",").includes(f.type)) {
      toast.error("Formato inválido. Use PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`Imagem maior que ${MAX_MB} MB.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setArquivo(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const limpar = () => {
    setMensagem("");
    escolherArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const enviar = async () => {
    if (!mensagem.trim()) return;
    setLoading(true);
    try {
      let imagem_path: string | null = null;

      if (arquivo) {
        const { data: sess } = await supabase.auth.getUser();
        const uid = sess.user?.id;
        if (!uid) throw new Error("Sessão expirada. Faça login novamente.");
        const ext = arquivo.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("feedback-imagens")
          .upload(path, arquivo, { contentType: arquivo.type, upsert: false });
        if (upErr) throw new Error("Falha ao enviar imagem: " + upErr.message);
        imagem_path = path;
      }

      await salvarFeedback({ data: { mensagem: mensagem.trim(), imagem_path } });
      toast.success("Feedback enviado! Obrigado.");
      limpar();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar feedback. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-40 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        aria-label="Enviar sugestão ou feedback"
        title="Enviar sugestão ou feedback"
      >
        <MessageSquare className="h-3 w-3" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!loading) setOpen(o);
          if (!o) limpar();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sugestão ou feedback</DialogTitle>
            <DialogDescription>
              Conte-nos o que podemos melhorar. Se quiser, anexe um print.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              maxLength={2000}
              disabled={loading}
            />

            {previewUrl ? (
              <div className="relative rounded-md border border-border bg-muted/30 p-2">
                <img
                  src={previewUrl}
                  alt="Prévia do anexo"
                  className="max-h-48 w-full rounded object-contain"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 truncate">
                    <ImageIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{arquivo?.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => escolherArquivo(null)}
                    disabled={loading}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3 w-3" /> remover
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                className="inline-flex items-center gap-2 self-start rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Anexar imagem (opcional, máx {MAX_MB} MB)
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={loading || !mensagem.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Enviando...
                </>
              ) : (
                "Enviar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

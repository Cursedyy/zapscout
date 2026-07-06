import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Paperclip,
  X,
  Loader2,
  ImageIcon,
  Bug,
  Lightbulb,
  HelpCircle,
  Sparkles,
  CheckCircle2,
  Clock,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { salvarFeedback, type CategoriaFeedback } from "@/lib/feedback.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type MeuFeedback = {
  id: string;
  categoria: string | null;
  mensagem: string;
  created_at: string;
  resposta: string | null;
  respondido_em: string | null;
  resolvido: boolean | null;
};

type Status = "recebido" | "em_analise" | "resolvido";

function derivarStatus(f: MeuFeedback): Status {
  if (f.resolvido) return "resolvido";
  if (f.resposta && f.resposta.trim()) return "em_analise";
  return "recebido";
}

const STATUS_UI: Record<Status, { label: string; classe: string; icon: React.ComponentType<{ className?: string }> }> = {
  recebido: {
    label: "Recebido",
    classe: "bg-muted text-muted-foreground border-border",
    icon: Inbox,
  },
  em_analise: {
    label: "Em análise",
    classe: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    icon: Clock,
  },
  resolvido: {
    label: "Resolvido",
    classe: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
    icon: CheckCircle2,
  },
};


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
  const [aba, setAba] = useState<"novo" | "meus">("novo");
  const [mensagem, setMensagem] = useState("");
  const [categoria, setCategoria] = useState<CategoriaFeedback>("ideia");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [meus, setMeus] = useState<MeuFeedback[]>([]);
  const [loadingMeus, setLoadingMeus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregarMeus = async () => {
    setLoadingMeus(true);
    try {
      const { data: sess } = await supabase.auth.getUser();
      const uid = sess.user?.id;
      if (!uid) {
        setMeus([]);
        return;
      }
      const { data, error } = await supabase
        .from("feedbacks")
        .select("id, categoria, mensagem, created_at, resposta, respondido_em, resolvido")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setMeus((data ?? []) as MeuFeedback[]);
    } catch (e: any) {
      toast.error("Erro ao carregar seus feedbacks: " + (e?.message ?? "desconhecido"));
    } finally {
      setLoadingMeus(false);
    }
  };

  useEffect(() => {
    if (open && aba === "meus") carregarMeus();
  }, [open, aba]);

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
    setCategoria("ideia");
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

      await salvarFeedback({ data: { mensagem: mensagem.trim(), categoria, imagem_path } });
      toast.success("Feedback enviado! Você pode acompanhar o status em 'Meus feedbacks'.");
      limpar();
      setAba("meus");
      carregarMeus();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar feedback. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen(true)}
              className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-md backdrop-blur transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
              aria-label="Enviar sugestão ou feedback"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Feedback</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Enviar sugestão, bug ou dúvida
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!loading) setOpen(o);
          if (!o) limpar();
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
            <DialogDescription>
              Envie sugestões e acompanhe o retorno do time.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setAba("novo")}
              className={`rounded px-2 py-1.5 font-medium transition-colors ${
                aba === "novo" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Novo
            </button>
            <button
              type="button"
              onClick={() => setAba("meus")}
              className={`rounded px-2 py-1.5 font-medium transition-colors ${
                aba === "meus" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Meus feedbacks
            </button>
          </div>

          {aba === "novo" ? (
            <>
              <div className="grid gap-3 py-2 overflow-y-auto">
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Categoria
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CATEGORIAS.map((c) => {
                      const Icon = c.icon;
                      const ativo = categoria === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoria(c.id)}
                          disabled={loading}
                          className={
                            "flex flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-medium transition-colors " +
                            (ativo
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")
                          }
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Textarea
                  placeholder={
                    categoria === "bug"
                      ? "Descreva o bug: o que aconteceu, o que esperava, passos para reproduzir…"
                      : categoria === "duvida"
                      ? "Qual é a sua dúvida?"
                      : categoria === "melhoria"
                      ? "O que poderia funcionar melhor?"
                      : "Qual é a sua ideia?"
                  }
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
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
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
            </>
          ) : (
            <div className="overflow-y-auto py-2 -mx-1 px-1">
              {loadingMeus ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
                </div>
              ) : meus.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Você ainda não enviou nenhum feedback.
                </div>
              ) : (
                <ul className="space-y-2">
                  {meus.map((f) => {
                    const status = derivarStatus(f);
                    const ui = STATUS_UI[status];
                    const StatusIcon = ui.icon;
                    const catUi = CATEGORIAS.find((c) => c.id === (f.categoria ?? "ideia"));
                    return (
                      <li
                        key={f.id}
                        className="rounded-lg border border-border bg-card/50 p-3 text-sm space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 uppercase tracking-wide ${ui.classe}`}
                          >
                            <StatusIcon className="h-3 w-3" /> {ui.label}
                          </span>
                          {catUi && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                              <catUi.icon className="h-3 w-3" /> {catUi.label}
                            </span>
                          )}
                          <span className="ml-auto text-muted-foreground tabular-nums">
                            {new Date(f.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap text-foreground/90 text-[13px] leading-relaxed">
                          {f.mensagem}
                        </div>
                        {f.resposta && (
                          <div className="mt-2 rounded-md border border-primary/25 bg-primary/5 p-2 text-[12px]">
                            <div className="text-[10px] uppercase tracking-wide text-primary mb-0.5">
                              Resposta do time
                              {f.respondido_em && (
                                <span className="ml-1 text-muted-foreground normal-case tracking-normal">
                                  · {new Date(f.respondido_em).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap text-foreground/90">{f.resposta}</div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

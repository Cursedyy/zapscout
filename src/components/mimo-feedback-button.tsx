import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { enviarFeedbackMimo } from "@/lib/mimo-feedback.functions";
import {
  CHAVE_FEEDBACKS_MIMO,
  FEEDBACK_MENSAGEM_MAX,
  FEEDBACK_TITULO_MAX,
  novoFeedbackMimoSchema,
} from "@/lib/mimo-feedback";

export function MimoFeedbackButton() {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const envioId = useRef<string | null>(null);
  const formId = useId();
  const cliente = useQueryClient();
  const enviar = useServerFn(enviarFeedbackMimo);
  const envio = useMutation({
    mutationFn: (entrada: Parameters<typeof enviar>[0]) => enviar(entrada),
    onSuccess: () => {
      setTitulo("");
      setMensagem("");
      envioId.current = null;
      setAberto(false);
      toast.success("Sugestão enviada.");
      void cliente.invalidateQueries({ queryKey: CHAVE_FEEDBACKS_MIMO });
    },
  });

  function enviarSugestao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (envio.isPending) return;
    const resultado = novoFeedbackMimoSchema.safeParse({
      id: envioId.current ?? crypto.randomUUID(),
      titulo,
      mensagem,
    });
    if (!resultado.success) return;
    envioId.current = resultado.data.id;
    envio.mutate({ data: resultado.data });
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 h-11 rounded-full px-4 shadow-lg sm:right-6">
          <MessageSquarePlus aria-hidden="true" className="size-4" />
          Dar feedback
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-labelledby={`${formId}-titulo-painel`}
        aria-describedby={`${formId}-descricao`}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl p-5"
      >
        <h2 id={`${formId}-titulo-painel`} className="text-lg font-semibold">Sugira uma melhoria</h2>
        <p id={`${formId}-descricao`} className="mt-1 text-sm text-muted-foreground">
          A equipe MiMo pode consultar as sugestões enviadas.
        </p>
        <form className="mt-4 space-y-3" onSubmit={enviarSugestao}>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-titulo`}>Título</Label>
            <Input
              id={`${formId}-titulo`}
              value={titulo}
              maxLength={FEEDBACK_TITULO_MAX}
              required
              disabled={envio.isPending}
              onChange={(e) => {
                setTitulo(e.target.value);
                envioId.current = null;
                if (envio.isError) envio.reset();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-mensagem`}>O que podemos melhorar?</Label>
            <Textarea
              id={`${formId}-mensagem`}
              value={mensagem}
              rows={4}
              maxLength={FEEDBACK_MENSAGEM_MAX}
              required
              disabled={envio.isPending}
              onChange={(e) => {
                setMensagem(e.target.value);
                envioId.current = null;
                if (envio.isError) envio.reset();
              }}
            />
          </div>
          {envio.isError && <p role="alert" className="text-sm text-destructive">{envio.error.message}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/mimo/feedbacks" onClick={() => setAberto(false)}>Ver feedbacks</Link>
            </Button>
            <Button type="submit" size="sm" disabled={envio.isPending || !titulo.trim() || !mensagem.trim()}>
              <Send aria-hidden="true" className="size-4" />
              {envio.isPending ? "Enviando…" : "Enviar sugestão"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

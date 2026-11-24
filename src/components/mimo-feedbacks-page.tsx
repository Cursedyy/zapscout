import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MimoCarregando } from "@/components/mimo-carregando";
import { alterarFeedbackMimo, listarFeedbacksMimo } from "@/lib/mimo-feedback.functions";
import {
  CHAVE_FEEDBACKS_MIMO,
  estadosFeedbackMimo,
  lerEstadoFeedbackMimo,
  rotuloFeedbackMimo,
  type CursorFeedbackMimo,
} from "@/lib/mimo-feedback";

const corEstadoFeedback: Record<(typeof estadosFeedbackMimo)[number], string> = {
  recebido: "bg-blue-600 dark:bg-blue-400",
  em_analise: "bg-amber-600 dark:bg-amber-400",
  concluido: "bg-emerald-600 dark:bg-emerald-400",
  arquivado: "bg-slate-500 dark:bg-slate-400",
};

const formatoData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

export function MimoFeedbacksPage() {
  const [cursores, setCursores] = useState<(CursorFeedbackMimo | null)[]>([null]);
  const cursor = cursores.at(-1) ?? null;
  const cliente = useQueryClient();
  const listar = useServerFn(listarFeedbacksMimo);
  const alterar = useServerFn(alterarFeedbackMimo);
  const lista = useQuery({
    queryKey: [...CHAVE_FEEDBACKS_MIMO, cursor],
    queryFn: () => listar({ data: { cursor } }),
  });
  const mudanca = useMutation({
    mutationFn: (entrada: Parameters<typeof alterar>[0]) => alterar(entrada),
    onSettled: () => cliente.invalidateQueries({ queryKey: CHAVE_FEEDBACKS_MIMO }),
  });
  const proximo = lista.data?.proximo;

  return (
    <section className="space-y-5 p-4 pb-24 sm:p-6 sm:pb-24" aria-labelledby="mimo-feedbacks-titulo">
      <header>
        <h1 id="mimo-feedbacks-titulo" className="text-2xl font-semibold tracking-tight">Feedbacks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sugestões da equipe MiMo para o painel.</p>
      </header>
      {lista.isPending && <MimoCarregando />}
      {lista.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <p role="alert" className="text-sm text-destructive">{lista.error.message}</p>
          <Button onClick={() => void lista.refetch()} variant="outline" size="sm">Tentar novamente</Button>
        </div>
      )}
      {mudanca.isError && <p role="alert" className="text-sm text-destructive">{mudanca.error.message}</p>}
      {lista.data?.feedbacks.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
          <MessageSquare aria-hidden="true" className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="font-medium">Ainda não há sugestões.</p>
          <p className="mt-1 text-sm text-muted-foreground">Use o botão Dar feedback para enviar a primeira.</p>
        </div>
      )}
      {lista.data && lista.data.feedbacks.length > 0 && (
        <ul className="space-y-3">
          {lista.data.feedbacks.map((feedback) => (
            <li key={feedback.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-semibold">{feedback.titulo}</h2>
                  <time dateTime={feedback.created_at} className="text-xs text-muted-foreground">
                    {formatoData.format(new Date(feedback.created_at))}
                  </time>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${corEstadoFeedback[feedback.estado]}`} />
                  {lista.data.podeGerenciar ? (
                  <select
                    aria-label={`Status de ${feedback.titulo}`}
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                    value={feedback.estado}
                    disabled={mudanca.isPending}
                    onChange={(e) => mudanca.mutate({ data: {
                      id: feedback.id,
                      versao: feedback.versao,
                      estado: lerEstadoFeedbackMimo(e.target.value),
                    } })}
                  >
                    {estadosFeedbackMimo.map((estado) => (
                      <option key={estado} value={estado}>{rotuloFeedbackMimo[estado]}</option>
                    ))}
                  </select>
                  ) : <Badge variant="secondary">{rotuloFeedbackMimo[feedback.estado]}</Badge>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{feedback.mensagem}</p>
            </li>
          ))}
        </ul>
      )}
      {(cursores.length > 1 || proximo) && (
        <nav aria-label="Paginação dos feedbacks" className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={cursores.length < 2} onClick={() => setCursores((c) => c.slice(0, -1))}>
            Anterior
          </Button>
          <Button variant="outline" disabled={!proximo} onClick={() => {
            if (proximo) setCursores((c) => [...c, proximo]);
          }}>
            Próxima
          </Button>
        </nav>
      )}
    </section>
  );
}

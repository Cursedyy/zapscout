import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { mensagensLeadWhatsAppMimo } from "@/lib/mimo-whatsapp.functions";
import { whatsappCarteira } from "@/lib/mimo-carteira";
import { Button } from "./ui/button";
export function WhatsAppLeadMimo({
  leadId,
  usuarioId,
  telefone,
}: {
  leadId: string;
  usuarioId: string;
  telefone: string;
}) {
  const [pagina, setPagina] = useState(0);
  const listar = useServerFn(mensagensLeadWhatsAppMimo);
  const q = useQuery({
    queryKey: ["mimo-whatsapp-mensagens", usuarioId, leadId, pagina],
    queryFn: () => listar({ data: { leadId, pagina } }),
    retry: false,
  });
  const wa = whatsappCarteira(telefone);
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Mensagens do WhatsApp comercial</h3>
        <div className="flex gap-2">
          <Button variant="outline" disabled={q.isFetching} onClick={() => void q.refetch()}>
            Atualizar
          </Button>
          {wa && (
            <Button asChild variant="outline">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                Abrir WhatsApp
              </a>
            </Button>
          )}
        </div>
      </header>
      {q.isPending ? (
        <p role="status" className="text-sm">
          Carregando mensagens…
        </p>
      ) : q.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as mensagens deste lead.
        </p>
      ) : !q.data.mensagens.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma mensagem registrada. O histórico começa com as novas mensagens após ativar o
          número na MiMo.
        </p>
      ) : (
        <ol className="space-y-3">
          {q.data.mensagens.map((m) => (
            <li key={m.id} className="rounded-lg border bg-card p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {m.direcao === "recebida" ? "Recebida" : "Enviada"} ·{" "}
                {new Date(m.contato_em).toLocaleString("pt-BR")}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {m.texto || "Mensagem sem texto"}
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={!pagina || q.isFetching}
          onClick={() => setPagina((p) => p - 1)}
        >
          Mais recentes
        </Button>
        <Button
          variant="outline"
          disabled={!q.data?.mais || q.isFetching}
          onClick={() => setPagina((p) => p + 1)}
        >
          Mais antigas
        </Button>
      </div>
    </section>
  );
}

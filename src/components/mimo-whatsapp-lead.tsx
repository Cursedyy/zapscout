import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { enviarMensagemLeadMimo, mensagensLeadWhatsAppMimo } from "@/lib/mimo-whatsapp.functions";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const mensagensEnvio = {
  enviada: "Mensagem enviada ao WhatsApp.",
  cancelada: "A conversa mudou antes do envio. Confira as mensagens recentes e tente novamente.",
  falha: "Não foi possível enviar. Tente novamente.",
  incerta: "O WhatsApp ainda não confirmou o envio. Confira o histórico antes de tentar de novo.",
  em_andamento: "Já existe um envio em andamento. Aguarde a atualização da conversa.",
  envio_pendente: "Existe um envio aguardando confirmação nesta conversa.",
  linha_indisponivel: "O número comercial desta conversa está indisponível. Peça à gestão que confira a conexão.",
  destino_indisponivel: "Confira o telefone cadastrado neste lead antes de enviar.",
  bloqueada: "Este contato pediu para parar de receber mensagens.",
  indisponivel: "O envio pelo painel ainda está indisponível neste ambiente.",
  erro: "Não foi possível consultar o resultado. Tente novamente para verificar a mesma mensagem.",
};

export function WhatsAppLeadMimo({
  leadId,
  usuarioId,
  telefone,
  ativo = true,
}: {
  leadId: string;
  usuarioId: string;
  telefone: string;
  ativo?: boolean;
}) {
  const [pagina, setPagina] = useState(0);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<keyof typeof mensagensEnvio>();
  const pedido = useRef<{ texto: string; id: string } | null>(null);
  const emEnvio = useRef(false);
  const historico = useRef<HTMLOListElement>(null);
  const seguirConversa = useRef(true);
  const client = useQueryClient();
  const listar = useServerFn(mensagensLeadWhatsAppMimo);
  const enviar = useServerFn(enviarMensagemLeadMimo);
  const chave = ["mimo-whatsapp-mensagens", usuarioId, leadId] as const;
  const q = useQuery({
    queryKey: [...chave, pagina],
    staleTime: pagina === 0 ? 5_000 : 60_000,
    retry: false,
    queryFn: () => listar({ data: { leadId, pagina } }),
    enabled: ativo,
    refetchInterval: ativo && pagina === 0 ? 5000 : false,
  });
  const maisRecente = q.data?.mensagens[0]?.id;
  useEffect(() => {
    if (ativo && !pagina && seguirConversa.current && historico.current) {
      historico.current.scrollTop = historico.current.scrollHeight;
    }
  }, [ativo, pagina, maisRecente]);

  async function enviarTexto(e: FormEvent) {
    e.preventDefault();
    const mensagem = texto.trim();
    if (!telefone || !mensagem || emEnvio.current || q.isError) return;
    if (pedido.current?.texto !== mensagem) pedido.current = { texto: mensagem, id: crypto.randomUUID() };
    emEnvio.current = true;
    setEnviando(true);
    setEstado(undefined);
    try {
      const result = await enviar({ data: { leadId, texto: mensagem, solicitacao: pedido.current.id } });
      setEstado(result.estado);
      if (!["incerta", "em_andamento"].includes(result.estado)) pedido.current = null;
      if (result.estado === "enviada") setTexto("");
      seguirConversa.current = true;
      setPagina(0);
      void client.invalidateQueries({ queryKey: chave });
    } catch {
      setEstado("erro");
    } finally {
      emEnvio.current = false;
      setEnviando(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-medium">Conversa com o lead</h3>{telefone && <p className="text-sm text-muted-foreground">{telefone}</p>}</div>
        <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}>
          Atualizar
        </Button>
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
          Nenhuma mensagem registrada nesta conversa.
        </p>
      ) : (
        <ol ref={historico} aria-label="Histórico da conversa" className="grid max-h-[min(18rem,40dvh)] gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3"
          onScroll={(e) => {
            const el = e.currentTarget;
            seguirConversa.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}>
          {[...q.data.mensagens].reverse().map((m) => (
            <li key={m.id} className={cn("max-w-[90%] rounded-lg border bg-card px-3 py-2 sm:max-w-[80%]", m.direcao === "enviada" ? "justify-self-end bg-primary/10" : "justify-self-start")}>
              <p className="mb-2 text-xs text-muted-foreground">
                {m.direcao === "recebida" ? "Recebida" : "Enviada"} ·{" "}
                {new Date(m.contato_em).toLocaleString("pt-BR")}
              </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">
                {m.texto || "Mensagem sem texto"}
              </p>
            </li>
          ))}
        </ol>
      )}
      {(pagina > 0 || q.data?.mais) && <div className="flex flex-wrap justify-end gap-2">
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
      </div>}
      <form onSubmit={enviarTexto} className="space-y-2 border-t pt-4">
        <Label htmlFor={`mensagem-${leadId}`}>Sua mensagem</Label>
        <Textarea id={`mensagem-${leadId}`} value={texto} rows={3} maxLength={2000}
          disabled={!telefone || enviando} onChange={(e) => setTexto(e.target.value)}
          placeholder={telefone ? "Escreva uma mensagem…" : "Cadastre um telefone para enviar mensagens"} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className={cn("text-sm", estado && estado !== "enviada" ? "text-destructive" : "text-muted-foreground")}>
            {estado ? mensagensEnvio[estado] : "As respostas chegam nesta conversa."}
          </p>
          <Button type="submit" disabled={!telefone || !texto.trim() || enviando || q.isPending || q.isError}>
            {enviando ? "Enviando…" : "Enviar mensagem"}
          </Button>
        </div>
      </form>
    </section>
  );
}

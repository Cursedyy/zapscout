import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  linha_indisponivel: "A linha de envio está indisponível. Confira sua conexão no menu WhatsApp ou fale com a gestão.",
  destino_indisponivel: "Confira o telefone cadastrado neste lead antes de enviar.",
  bloqueada: "Este contato pediu para parar de receber mensagens.",
  indisponivel: "Atendimento pessoal indisponível; nenhuma mensagem foi enviada.",
  erro: "Não foi possível consultar o resultado. Tente novamente para verificar a mesma mensagem.",
};

type EstadoEnvio = keyof typeof mensagensEnvio;
type IdentidadeMensagem = { messageId: string; vinculoId: string };
type Saida = {
  id: string;
  texto: string;
  contato_em: string;
  estado: EstadoEnvio | "enviando";
  identidade?: IdentidadeMensagem;
};
const verificarMesmoEnvio = (estado: Saida["estado"]) =>
  estado === "incerta" || estado === "em_andamento" || estado === "erro";

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
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [estado, setEstado] = useState<EstadoEnvio>();
  const entrada = useRef<HTMLTextAreaElement>(null);
  const textoAtual = useRef("");
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
    refetchInterval: ativo && pagina === 0 ? 2000 : false,
  });
  const atualizar = () => client.invalidateQueries({ queryKey: [...chave, 0] });
  const envio = useMutation({
    scope: { id: `mimo-whatsapp:${usuarioId}:${leadId}` },
    retry: false,
    mutationFn: (m: Saida) => enviar({ data: { leadId, texto: m.texto, solicitacao: m.id } }),
    onSuccess: ({ estado, identidade }, m) => {
      setEstado(estado);
      setSaidas(atual => atual.map(s => s.id === m.id ? { ...s, estado, identidade } : s));
      void atualizar().then(() => {
        if (estado === "enviada" && !identidade) {
          setSaidas(atual => atual.filter(s => s.id !== m.id));
        }
      });
    },
    onError: (_, m) => {
      setEstado("erro");
      setSaidas(atual => atual.map(s => s.id === m.id ? { ...s, estado: "erro" } : s));
      void atualizar();
    },
  });

  const mensagens = q.data?.mensagens;
  function estaNoHistorico(saida: Saida) {
    const id = saida.identidade;
    return !!id && !!mensagens?.some(m =>
      m.message_id === id.messageId && m.vinculo_id === id.vinculoId);
  }
  const recentes = pagina === 0 ? saidas.filter(s => !estaNoHistorico(s)) : [];
  const maisRecente = q.data?.mensagens[0]?.id;
  const ultimaSaida = recentes.at(-1)?.id;
  useEffect(() => {
    if (pagina || !mensagens?.length) return;
    setSaidas(atual => {
      const pendentes = atual.filter(s => !estaNoHistorico(s));
      return pendentes.length === atual.length ? atual : pendentes;
    });
  }, [mensagens, pagina]);
  useEffect(() => {
    if (ativo && !pagina && seguirConversa.current && historico.current) {
      historico.current.scrollTop = historico.current.scrollHeight;
    }
  }, [ativo, pagina, maisRecente, ultimaSaida]);

  function enfileirar(texto: string, anterior?: Saida) {
    const id = anterior && verificarMesmoEnvio(anterior.estado) ? anterior.id : crypto.randomUUID();
    const nova: Saida = { id, texto, contato_em: new Date().toISOString(), estado: "enviando" };
    seguirConversa.current = true;
    setPagina(0);
    setEstado(undefined);
    setSaidas(atual => [...atual.filter(s => s.id !== anterior?.id), nova]);
    envio.mutate(nova);
  }

  function enviarTexto(e: FormEvent) {
    e.preventDefault();
    const mensagem = textoAtual.current.trim();
    if (!ativo || !telefone || !mensagem || q.isPending || q.isError) return;
    textoAtual.current = "";
    setTexto("");
    enfileirar(mensagem);
    entrada.current?.focus();
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
      ) : !q.data.mensagens.length && !recentes.length ? (
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
          {recentes.map(m => (
            <li key={m.id} className="max-w-[90%] justify-self-end rounded-lg border bg-primary/10 px-3 py-2 text-sm sm:max-w-[80%]">
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>
              <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <time dateTime={m.contato_em}>{new Date(m.contato_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                <span>{m.estado === "enviando" ? "Enviando…" : m.estado === "enviada" ? "Enviada" :
                  verificarMesmoEnvio(m.estado) || m.estado === "envio_pendente" ? "Aguardando confirmação" : "Envio não concluído"}</span>
                {m.estado !== "enviando" && m.estado !== "enviada" && m.estado !== "bloqueada" &&
                  <button type="button" className="underline" disabled={q.isError} onClick={() => enfileirar(m.texto, m)}>
                    {verificarMesmoEnvio(m.estado) ? "Verificar envio" : "Tentar novamente"}
                  </button>}
              </div>
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
        <Textarea id={`mensagem-${leadId}`} ref={entrada} value={texto} rows={2} maxLength={2000} enterKeyHint="send"
          disabled={!telefone} onChange={(e) => { textoAtual.current = e.target.value; setTexto(e.target.value); }}
          onKeyDown={e => {
            if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
              e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            e.preventDefault();
            if (!e.repeat) e.currentTarget.form?.requestSubmit();
          }}
          placeholder={telefone ? "Escreva uma mensagem…" : "Cadastre um telefone para enviar mensagens"} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className={cn("text-sm", estado && estado !== "enviada" ? "text-destructive" : "text-muted-foreground")}>
            {estado ? mensagensEnvio[estado] : "Enter envia · Shift+Enter quebra a linha"}
          </p>
          <Button type="submit" disabled={!telefone || !texto.trim() || q.isPending || q.isError}>
            Enviar mensagem
          </Button>
        </div>
      </form>
    </section>
  );
}

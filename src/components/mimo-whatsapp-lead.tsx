import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, FileText, MessageCircle, RefreshCw, Send, Zap } from "lucide-react";
import { enviarMensagemLeadMimo } from "@/lib/mimo-whatsapp.functions";
import { conversaLeadOptions } from "@/lib/mimo-conversa.queries";
import { CATALOGO_CHAT_MIMO } from "@/lib/mimo-whatsapp";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Skeleton } from "./ui/skeleton";

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
  catalogo_indisponivel: "O catálogo em PDF está indisponível. Peça à gestão para conferir o material publicado.",
  erro: "Não foi possível consultar o resultado. Tente novamente para verificar a mesma mensagem.",
};

type EstadoEnvio = keyof typeof mensagensEnvio;
type IdentidadeMensagem = { messageId: string; vinculoId: string };
type Saida = {
  id: string;
  tipo: "texto" | "catalogo";
  texto: string;
  contato_em: string;
  estado: EstadoEnvio | "enviando";
  identidade?: IdentidadeMensagem;
};
const verificarMesmoEnvio = (estado: Saida["estado"]) =>
  estado === "incerta" || estado === "em_andamento" || estado === "erro";

const RESPOSTA_RAPIDA_MIMO = "Posso te ajudar com o catálogo, as opções de produtos e as condições para o primeiro pedido.";
const diaDaConversa = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
const horaDaConversa = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function BalaoConversa({ texto, enviada, data, children }: {
  texto: string;
  enviada: boolean;
  data: string;
  children?: ReactNode;
}) {
  return (
    <li className={cn("w-fit min-w-24 max-w-[88%] rounded-2xl border px-3 py-2 text-sm shadow-sm sm:max-w-[78%] sm:px-3.5",
      enviada ? "justify-self-end rounded-br-sm border-primary/20 bg-primary/10" : "justify-self-start rounded-bl-sm border-border bg-card")}>
      <span className="sr-only">{enviada ? "Enviada" : "Recebida"}</span>
      {texto === CATALOGO_CHAT_MIMO ? (
        <p className="flex items-center gap-2 rounded-lg bg-background/70 px-2.5 py-2 font-medium">
          <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" /> {texto}
        </p>
      ) : (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{texto || "Mensagem sem texto"}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <time dateTime={data}>{horaDaConversa.format(new Date(data))}</time>
        {children}
      </div>
    </li>
  );
}

export function WhatsAppLeadMimo({
  leadId,
  usuarioId,
  telefone,
  contato,
  nomeContato,
  ativo = true,
  incorporado = false,
}: {
  leadId: string;
  usuarioId: string;
  telefone: string;
  contato?: string;
  nomeContato?: string | null;
  ativo?: boolean;
  incorporado?: boolean;
}) {
  const [pagina, setPagina] = useState(0);
  const [texto, setTexto] = useState("");
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [estado, setEstado] = useState<EstadoEnvio>();
  const mensagemId = useId();
  const entrada = useRef<HTMLTextAreaElement>(null);
  const textoAtual = useRef("");
  const envioCatalogo = useRef(false);
  const historico = useRef<HTMLDivElement>(null);
  const seguirConversa = useRef(true);
  const paginaMostrada = useRef<number>(undefined);
  const client = useQueryClient();
  const enviar = useServerFn(enviarMensagemLeadMimo);
  const q = useQuery({
    ...conversaLeadOptions(usuarioId, leadId, pagina),
    placeholderData: (dados, anterior) => anterior?.queryKey[1] === usuarioId && anterior.queryKey[2] === leadId ? dados : undefined,
    enabled: ativo,
    refetchInterval: ativo && pagina === 0 ? 2000 : false,
  });
  const atualizar = () => client.invalidateQueries({ queryKey: conversaLeadOptions(usuarioId, leadId).queryKey });
  const envio = useMutation({
    scope: { id: `mimo-whatsapp:${usuarioId}:${leadId}` },
    retry: false,
    mutationFn: (m: Saida) => enviar({ data: m.tipo === "catalogo"
      ? { leadId, tipo: "catalogo", solicitacao: m.id }
      : { leadId, texto: m.texto, solicitacao: m.id } }),
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
    onSettled: (_, __, m) => {
      if (m.tipo === "catalogo") envioCatalogo.current = false;
    },
  });

  const podeEnviar = ativo && !!telefone && !!q.data && !q.isError;
  const catalogoPendente = saidas.some(s => s.tipo === "catalogo" &&
    (s.estado === "enviando" || verificarMesmoEnvio(s.estado)));
  const mensagens = q.data?.mensagens;
  function estaNoHistorico(saida: Saida) {
    const id = saida.identidade;
    return !!id && !!mensagens?.some(m =>
      m.message_id === id.messageId && m.vinculo_id === id.vinculoId);
  }
  const recentes = pagina === 0 && !q.isPlaceholderData ? saidas.filter(s => !estaNoHistorico(s)) : [];
  const visiveis = [
    ...(mensagens ?? []).slice().reverse().map(m => ({
      id: m.id, texto: m.texto, data: m.contato_em, enviada: m.direcao === "enviada", saida: undefined,
    })),
    ...recentes.map(m => ({ id: m.id, texto: m.texto, data: m.contato_em, enviada: true, saida: m })),
  ];
  const maisRecente = q.data?.mensagens[0]?.id;
  const ultimaSaida = recentes.at(-1)?.id;
  useEffect(() => {
    if (pagina || q.isPlaceholderData || !mensagens?.length) return;
    setSaidas(atual => {
      const pendentes = atual.filter(s => !estaNoHistorico(s));
      return pendentes.length === atual.length ? atual : pendentes;
    });
  }, [mensagens, pagina, q.isPlaceholderData]);
  useEffect(() => {
    if (!ativo || q.isPlaceholderData || !historico.current || !q.data) return;
    const trocouPagina = paginaMostrada.current !== pagina;
    paginaMostrada.current = pagina;
    if (trocouPagina || (pagina === 0 && seguirConversa.current)) {
      historico.current.scrollTop = historico.current.scrollHeight;
    }
  }, [ativo, pagina, maisRecente, ultimaSaida, q.data, q.isPlaceholderData]);

  function enfileirar(tipo: Saida["tipo"], texto: string, anterior?: Saida) {
    if (!podeEnviar || (tipo === "catalogo" && envioCatalogo.current)) return;
    if (tipo === "catalogo") envioCatalogo.current = true;
    const id = anterior && verificarMesmoEnvio(anterior.estado) ? anterior.id : crypto.randomUUID();
    const nova: Saida = { id, tipo, texto, contato_em: new Date().toISOString(), estado: "enviando" };
    seguirConversa.current = true;
    setPagina(0);
    setEstado(undefined);
    setSaidas(atual => [...atual.filter(s => s.id !== anterior?.id), nova]);
    envio.mutate(nova);
  }

  function enviarTexto(e: FormEvent) {
    e.preventDefault();
    const mensagem = textoAtual.current.trim();
    if (!podeEnviar || !mensagem) return;
    textoAtual.current = "";
    setTexto("");
    enfileirar("texto", mensagem);
    entrada.current?.focus();
  }

  function inserirRespostaRapida() {
    if (!telefone || textoAtual.current.trim()) return;
    const primeiroNome = nomeContato?.trim().split(/\s+/)[0];
    const saudacao = primeiroNome && /^[\p{L}][\p{L}\p{M}'’.-]{0,39}$/u.test(primeiroNome)
      ? `Olá, ${primeiroNome}!`
      : "Olá!";
    const resposta = `${saudacao} ${RESPOSTA_RAPIDA_MIMO}`;
    textoAtual.current = resposta;
    setTexto(resposta);
    entrada.current?.focus();
  }

  return (
    <section aria-label="Conversa no WhatsApp" className={cn("min-w-0 overflow-hidden rounded-xl border border-border bg-card", !incorporado && "mt-4")}>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold sm:text-base">{contato || "Conversa no WhatsApp"}</h3>
            {q.data?.qualificacao === "qualificado" && (
              <span className="rounded border px-2 py-0.5 text-xs font-medium">Qualificado</span>
            )}
            {q.data?.qualificacao === "nao_qualificado" && (
              <span className="rounded border px-2 py-0.5 text-xs font-medium">Desqualificado</span>
            )}
            {telefone && <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
              {contato && "WhatsApp · "}{telefone}
            </p>}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Atualizar conversa" title="Atualizar conversa"
          className="shrink-0 text-muted-foreground" disabled={!ativo || q.isFetching} onClick={() => void q.refetch()}>
          <RefreshCw className={cn("size-4", q.isFetching && "motion-safe:animate-spin")} aria-hidden="true" />
        </Button>
      </header>
      <div className="relative bg-muted/45">
        {(pagina > 0 || q.data?.mais) && (
          <nav aria-label="Páginas da conversa" className="flex flex-wrap items-center justify-center gap-1 border-b border-border/60 bg-card/80 px-3 py-1.5">
            {pagina > 0 && (
              <Button type="button" variant="ghost" size="sm" disabled={q.isPlaceholderData} onClick={() => setPagina(p => p - 1)}>
                <ArrowDown aria-hidden="true" /> Mais recentes
              </Button>
            )}
            {q.data?.mais && (
              <Button type="button" variant="ghost" size="sm" disabled={q.isPlaceholderData} onClick={() => setPagina(p => p + 1)}>
                <ArrowUp aria-hidden="true" /> Mais antigas
              </Button>
            )}
          </nav>
        )}
        {q.isError && q.data && (
          <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            Não foi possível atualizar a conversa.
          </p>
        )}
        <div ref={historico} className={cn("min-h-44 max-h-[min(48dvh,30rem)] overflow-y-auto overscroll-contain px-3 py-4 sm:px-5",
          incorporado ? "h-[clamp(15rem,48dvh,28rem)] max-h-none" : "sm:min-h-60")}
          aria-busy={q.isPending || q.isPlaceholderData}
          onScroll={(e) => {
            if (pagina !== 0 || q.isPlaceholderData) return;
            const el = e.currentTarget;
            seguirConversa.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}>
          {q.isPending ? (
            <div role="status" aria-label="Carregando mensagens" className="grid gap-3">
              <Skeleton className="h-12 w-1/2 max-w-48 rounded-2xl" />
              <Skeleton className="h-14 w-3/5 max-w-60 justify-self-end rounded-2xl" />
              <Skeleton className="h-10 w-2/5 max-w-36 rounded-2xl" />
            </div>
          ) : q.isError && !q.data ? (
            <p role="alert" className="my-8 text-center text-sm text-destructive">Não foi possível carregar as mensagens deste lead.</p>
          ) : !visiveis.length ? (
            <div className="grid min-h-36 place-content-center gap-2 text-center text-sm text-muted-foreground">
              <MessageCircle className="mx-auto size-6" aria-hidden="true" />
              <p>Nenhuma mensagem registrada nesta conversa.</p>
            </div>
          ) : (
            <ol aria-label="Histórico da conversa" className="grid gap-2">
              {visiveis.map((m, i) => {
                const dia = diaDaConversa.format(new Date(m.data));
                const anterior = visiveis[i - 1];
                const mudouDia = !anterior || diaDaConversa.format(new Date(anterior.data)) !== dia;
                const saida = m.saida;
                return (
                  <Fragment key={m.id}>
                    {mudouDia && (
                      <li className="my-2 justify-self-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                        {dia}
                      </li>
                    )}
                    <BalaoConversa texto={m.texto} enviada={m.enviada} data={m.data}>
                      {saida && (
                        <>
                          <span>{saida.estado === "enviando" ? "Enviando…" : saida.estado === "enviada" ? "Enviada" :
                            verificarMesmoEnvio(saida.estado) || saida.estado === "envio_pendente" ? "Aguardando confirmação" : "Envio não concluído"}</span>
                          {saida.estado !== "enviando" && saida.estado !== "enviada" && saida.estado !== "bloqueada" && (
                            <button type="button" className="font-medium underline underline-offset-2"
                              disabled={!podeEnviar} onClick={() => enfileirar(saida.tipo, saida.texto, saida)}>
                              {verificarMesmoEnvio(saida.estado) ? "Verificar envio" : "Tentar novamente"}
                            </button>
                          )}
                        </>
                      )}
                    </BalaoConversa>
                  </Fragment>
                );
              })}
            </ol>
          )}
        </div>
      </div>
      <form onSubmit={enviarTexto} className="space-y-2 border-t border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal"
            disabled={!podeEnviar || catalogoPendente} onClick={() => enfileirar("catalogo", CATALOGO_CHAT_MIMO)}>
            <FileText aria-hidden="true" /> Enviar catálogo
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-auto min-h-8 whitespace-normal"
            disabled={!telefone || !!texto.trim()} onClick={inserirRespostaRapida}>
            <Zap aria-hidden="true" /> Resposta rápida
          </Button>
        </div>
        <Label htmlFor={mensagemId} className="sr-only">Sua mensagem</Label>
        <div className="overflow-hidden rounded-xl border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
          <Textarea id={mensagemId} ref={entrada} value={texto} rows={2} maxLength={2000} enterKeyHint="send"
            className="min-h-16 resize-y rounded-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
            disabled={!telefone} onChange={(e) => { textoAtual.current = e.target.value; setTexto(e.target.value); }}
            onKeyDown={e => {
              if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ||
                e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              e.preventDefault();
              if (!e.repeat) e.currentTarget.form?.requestSubmit();
            }}
            placeholder={telefone ? "Escreva uma mensagem…" : "Cadastre um telefone para enviar mensagens"} />
          <div className="flex justify-end border-t border-border/60 p-2">
            <Button type="submit" size="sm" disabled={!podeEnviar || !texto.trim()}>
              <Send aria-hidden="true" /> Enviar mensagem
            </Button>
          </div>
        </div>
        <p role="status" className={cn("text-xs", estado && estado !== "enviada" ? "text-destructive" : "text-muted-foreground",
          !estado && "hidden sm:block")}>
          {estado ? mensagensEnvio[estado] : "Enter envia · Shift+Enter quebra a linha"}
        </p>
      </form>
    </section>
  );
}

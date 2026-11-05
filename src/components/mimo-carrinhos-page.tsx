import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarCarrinhosMimo, sincronizarCarrinhosMimo } from "@/lib/mimo-carrinhos.functions";
import { conectarNuvemshopMimo } from "@/lib/mimo-nuvemshop-oauth.functions";
import { preverLembreteMimo } from "@/lib/mimo-carrinhos-recuperacao";
import { MimoCarrinhosMensagens } from "./mimo-carrinhos-mensagens";
import { Button } from "./ui/button";
import { MimoCarregando } from "./mimo-carregando";
const moeda = (v: number, currency: string) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency });
const falhasConexao: Record<string, string> = {
  reserva_indisponivel:
    "A conexão falhou e não foi possível liberar a tentativa no banco. Aguarde a expiração da reserva antes de tentar novamente.",
  rede_provedor:
    "O servidor não conseguiu abrir a conexão com a Nuvemshop. É necessário verificar a saída de rede da hospedagem.",
  tempo_provedor:
    "A Nuvemshop não respondeu dentro do prazo para autorizar. Tente uma nova conexão mais tarde.",
  bloqueio_provedor:
    "A Nuvemshop bloqueou a requisição do servidor (HTTP 403). A comunicação da hospedagem com o provedor precisa ser revisada.",
  limite_provedor:
    "A Nuvemshop limitou as requisições (HTTP 429). Aguarde antes de iniciar uma nova conexão.",
  redirecionamento_provedor:
    "O endpoint da Nuvemshop redirecionou para um destino inesperado. A conexão foi interrompida para proteger as credenciais.",
  navegador:
    "A autorização não corresponde a este navegador. Inicie novamente aqui e conclua no mesmo navegador.",
  estado_expirado: "A autorização expirou ou já foi utilizada. Inicie uma nova conexão nesta tela.",
  codigo_recusado:
    "A Nuvemshop recusou a troca do código. Confira o App ID e o Client Secret na hospedagem e tente uma nova autorização.",
  provedor_indisponivel:
    "Não foi possível comunicar com a Nuvemshop para concluir a autorização. Tente novamente mais tarde.",
  resposta_invalida:
    "A Nuvemshop retornou uma resposta de autorização inesperada. A integração precisa ser revisada.",
  loja_divergente:
    "A loja autorizada é diferente da loja configurada na integração. Confira o ID da loja na hospedagem e a conta utilizada.",
  permissao_pedidos:
    "O aplicativo não recebeu permissão para ler pedidos. Confira o escopo de leitura de pedidos no aplicativo Nuvemshop.",
  gravar_credencial:
    "A autorização chegou ao servidor, mas não foi possível salvar a conexão. A configuração do banco e o acesso de gestão precisam ser revisados.",
  falha_interna:
    "O servidor não conseguiu finalizar a conexão. A configuração da integração precisa ser revisada.",
};
export function MimoCarrinhosPage() {
  const [pagina, setPagina] = useState(0);
  const [resultadoConexao, setResultadoConexao] = useState<string | null>(null);
  const [motivoConexao, setMotivoConexao] = useState<string | null>(null);
  useEffect(() => {
    setMotivoConexao(new URLSearchParams(window.location.search).get("motivo"));
    setResultadoConexao(new URLSearchParams(window.location.search).get("conexao"));
  }, []);
  const conectar = useServerFn(conectarNuvemshopMimo);
  const conexao = useMutation({
    mutationFn: () => conectar(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
  const listar = useServerFn(listarCarrinhosMimo),
    sincronizar = useServerFn(sincronizarCarrinhosMimo);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["mimo-carrinhos", pagina],
    queryFn: () => listar({ data: { pagina } }),
  });
  const sync = useMutation({
    mutationFn: () => sincronizar(),
    onSuccess: async () => {
      setPagina(0);
      await qc.invalidateQueries({ queryKey: ["mimo-carrinhos"] });
    },
  });
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Recuperação de carrinhos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe os carrinhos da Nuvemshop e as compras identificadas.
        </p>
      </header>
      <div className="rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">WhatsApp e e-mail · Envios desativados</p>
        <p className="mt-1 text-muted-foreground">
          Primeiro lembrete após 2 horas, todos os dias, das 9h às 18h (Brasília). Um por WhatsApp e
          um por e-mail, quando disponíveis. Textos e conexões de envio estão em preparação.
        </p>
      </div>
      <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Regras do primeiro lembrete</summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            Envios fora do horário ficam para as 9h seguintes. Um único lembrete por canal, com 10% de desconto pelo cupom MIMOCONSULTOR.
          </p>
          <p>
            A prévia conta duas horas da última atualização conhecida do carrinho. A Nuvemshop pode
            disponibilizar o abandono com atraso de até seis horas.
          </p>
          <p>
            Os carrinhos atuais não foram colocados em fila. A ativação terá um início definido para
            evitar contato automático com o histórico.
          </p>
          <p>
            Antes de enviar, será necessário conferir novamente a compra e os pedidos para não
            receber mensagens.
          </p>
        </div>
      </details>
      <MimoCarrinhosMensagens />
      {resultadoConexao === "sucesso" && (
        <p role="status" className="text-sm">
          Loja conectada. Sincronize para carregar os carrinhos. Os envios continuam desativados.
        </p>
      )}
      {resultadoConexao === "falha" && (
        <p role="alert" className="text-sm text-destructive">
          {(Object.hasOwn(falhasConexao, motivoConexao ?? "")
            ? falhasConexao[motivoConexao!]
            : undefined) ??
            "Não foi possível concluir a autorização. Inicie a conexão novamente nesta tela."}
        </p>
      )}
      {q.isPending ? (
        <MimoCarregando />
      ) : q.isError ? (
        <div role="alert">
          <p>{q.error.message}</p>
          <Button variant="outline" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {!q.data.disponivel || !q.data.configurada ? (
            <p role="status" className="rounded-xl border p-4 text-sm">
              {!q.data.disponivel
                ? "A recuperação de carrinhos está em preparação."
                : "A conexão da Nuvemshop ainda não foi configurada."}
            </p>
          ) : null}
          <section className="space-y-2 rounded-xl border p-4 text-sm">
            <p>
              Quem administra a loja na Nuvemshop precisa autorizar a conexão no mesmo navegador.
              Use a conta do marketing nessa etapa.
            </p>
            <Button
              variant="outline"
              disabled={
                !q.data.disponivel || !q.data.podeConectar || conexao.isPending || sync.isPending
              }
              onClick={() => conexao.mutate()}
            >
              {conexao.isPending
                ? "Abrindo autorização…"
                : q.data.configurada
                  ? "Reautorizar Nuvemshop"
                  : "Conectar Nuvemshop"}
            </Button>
            {!q.data.podeConectar && (
              <p className="text-muted-foreground">
                O aplicativo da integração ainda precisa ser cadastrado e configurado.
              </p>
            )}
            {conexao.isError && (
              <p role="alert" className="text-destructive">
                {conexao.error.message}
              </p>
            )}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {q.data.sincronizadoEm
                ? "Última sincronização: " + new Date(q.data.sincronizadoEm).toLocaleString("pt-BR")
                : "Nenhuma sincronização concluída."}
            </p>
            <Button
              disabled={!q.data.disponivel || !q.data.configurada || sync.isPending || q.isFetching}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? "Sincronizando…" : "Sincronizar loja"}
            </Button>
          </div>
          {sync.isError && (
            <p role="alert" className="text-sm text-destructive">
              {sync.error.message}
            </p>
          )}
          {sync.isSuccess && (
            <p role="status" className="text-sm">
              Sincronização concluída. Nenhuma mensagem foi enviada.
            </p>
          )}
          <p className="text-sm">
            {q.data.total} carrinhos registrados. A Nuvemshop pode levar até seis horas para
            disponibilizar um carrinho abandonado.
          </p>
          {!q.data.carrinhos.length && (
            <div className="rounded-xl border p-6 text-sm text-muted-foreground">
              Nenhum carrinho nesta página. Após conectar e sincronizar a loja, os dados disponíveis
              aparecerão aqui.
            </div>
          )}
          <div className="space-y-3">
            {q.data.carrinhos.map((c) => {
              const previa = preverLembreteMimo({
                atualizadoEm: c.atualizadoEm,
                temContato: !!(c.email || c.telefone),
                temLink: !!c.url,
                temPedido: !!c.pedido,
              });
              return (
                <article key={c.id} className="space-y-2 rounded-xl border p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h2 className="font-medium">
                      {c.nome || "Cliente sem nome"} · Carrinho #{c.id}
                    </h2>
                    <p className="text-sm">{c.situacao}</p>
                  </div>
                  <p className="text-sm">
                    {moeda(c.total, c.moeda)} · Contato disponível: {c.canais}
                  </p>
                  {c.pedido && (
                    <p className="text-sm">
                      Pedido #{c.pedido.numero} · {moeda(c.pedido.total, c.pedido.moeda)}. Lembretes
                      de carrinho bloqueados.
                    </p>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer">Ver detalhes</summary>
                    <div className="mt-2 space-y-1">
                      <p className="font-medium">Prévia do lembrete · Sem envio agendado</p>
                      {previa.previstoPara && (
                        <p>
                          Horário possível:{" "}
                          {new Date(previa.previstoPara).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                          })}{" "}
                          (Brasília)
                        </p>
                      )}
                      <p>{previa.motivo}</p>
                      <p>E-mail: {c.email || "Não informado"}</p>
                      <p>Telefone: {c.telefone || "Não informado"}</p>
                      {c.itens.map((item, i) => (
                        <p key={i}>
                          {item.quantidade} × {item.nome}
                        </p>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Atualizado na loja: {new Date(c.atualizadoEm).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </details>
                  {c.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        Abrir carrinho na loja
                      </a>
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
          {q.data.total > 30 && (
            <nav aria-label="Páginas de carrinhos" className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                disabled={!pagina || q.isFetching || sync.isPending}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">
                {pagina + 1}/{Math.ceil(q.data.total / 30)}
              </span>
              <Button
                variant="outline"
                disabled={(pagina + 1) * 30 >= q.data.total || q.isFetching || sync.isPending}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </nav>
          )}
          <p className="text-xs text-muted-foreground">
            Uma compra identificada não comprova recuperação pela automação. Não há receita
            atribuída nesta etapa.
          </p>
        </>
      )}
    </div>
  );
}

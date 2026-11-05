import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarCarrinhosMimo, sincronizarCarrinhosMimo } from "@/lib/mimo-carrinhos.functions";
import { conectarNuvemshopMimo } from "@/lib/mimo-nuvemshop-oauth.functions";
import { Button } from "./ui/button";
import { MimoCarregando } from "./mimo-carregando";
const moeda = (v: number, currency: string) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency });
export function MimoCarrinhosPage() {
  const [pagina, setPagina] = useState(0);
  const [resultadoConexao, setResultadoConexao] = useState<string | null>(null);
  useEffect(() => {
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
          Mensagens, intervalos e horários ainda precisam ser definidos. Nenhum cliente será
          contatado nesta etapa.
        </p>
      </div>
      {resultadoConexao === "sucesso" && (
        <p role="status" className="text-sm">
          Loja conectada. Sincronize para carregar os carrinhos. Os envios continuam desativados.
        </p>
      )}
      {resultadoConexao === "falha" && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível concluir a autorização. Inicie a conexão novamente nesta tela.
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
            {q.data.carrinhos.map((c) => (
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
            ))}
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

import { lazy, Suspense, useState } from "react";
import { atualizarConsultasMimo } from '@/lib/mimo-cache';
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { MimoCarregando } from "./mimo-carregando";
import {
  SITUACOES_CARTEIRA,
  unidadeSchema,
  whatsappCarteira,
  type UnidadeInput,
  type Contato,
  type Atividade,
} from "@/lib/mimo-carteira";
import {
  detalheCarteiraMimo,
  gravarUnidadeMimo,
  gravarContatoCarteiraMimo,
  associarContatoCarteiraMimo,
  buscarContatosCarteiraMimo,
  agendarCarteiraMimo,
  concluirCarteiraMimo,
  reagendarCarteiraMimo,
  obterLeadCarteiraMimo,
} from "@/lib/mimo-carteira.functions";
import type { contextoLeadsMimo } from "@/lib/mimo-leads.functions";
import { Negociar } from "./mimo-carteira-page";
import { ETAPAS } from "@/lib/mimo-leads";
const LeadEditor = lazy(() =>
  import("./mimo-lead-editor").then((m) => ({ default: m.MimoLeadEditor })),
);
type Contexto = Awaited<ReturnType<typeof contextoLeadsMimo>>;
const inputClass = "rounded border border-input bg-background p-2 text-sm";
export function FichaCarteira({
  id,
  contexto,
  close,
}: {
  id: string;
  contexto: Contexto;
  close: () => void;
}) {
  const detalhe = useServerFn(detalheCarteiraMimo);
  const [aba, setAba] = useState("cadastro"),
    [pagina, setPagina] = useState(0);
  const qc = useQueryClient();
  const [negociar, setNegociar] = useState(false),
    [leadId, setLeadId] = useState<string | null>(null);
  const gestao = ["administrador", "gestor"].includes(contexto.papel);
  const q = useQuery({
    queryKey: ["mimo-carteira-ficha", contexto.empresaId, contexto.usuarioId, id, pagina],
    queryFn: () => detalhe({ data: { id, pagina } }),
    enabled: id !== "nova",
  });
  const refresh = () => {
    void atualizarConsultasMimo(qc);
  };
  const nome = id === "nova" ? "Nova unidade" : q.data?.unidade.nome || "Unidade";
  const v = q.data;
  const total =
    aba === "atividades"
      ? (v?.totalAtividades ?? 0)
      : aba === "historico"
        ? (v?.totalHistorico ?? 0)
        : 0;
  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{nome}</SheetTitle>
          <SheetDescription>Cadastro e acompanhamento comercial da unidade.</SheetDescription>
        </SheetHeader>
        {id !== "nova" && (
          <div
            role="tablist"
            aria-label="Ficha da unidade"
            className="my-5 flex gap-2 overflow-x-auto"
          >
            {[
              ["cadastro", "Cadastro"],
              ["contatos", "Contatos"],
              ["atividades", "Atividades"],
              ["negociacoes", "Negociações"],
              ["historico", "Histórico"],
            ].map(([key, label]) => (
              <Button
                key={key}
                role="tab"
                aria-selected={aba === key}
                variant={aba === key ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setAba(key);
                  setPagina(0);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        {id === "nova" ? (
          <Cadastro
            initial={{ ...unidadeSchema.parse({ nome: "Nova unidade" }), nome: "" }}
            contexto={contexto}
            saved={close}
          />
        ) : q.isPending ? (
          <MimoCarregando />
        ) : q.isError ? (
          <div role="alert">
            <p>{q.error.message}</p>
            <Button onClick={() => void q.refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          v && (
            <>
              {aba === "cadastro" && (
                <Cadastro
                  key={v.unidade.updated_at}
                  initial={v.unidade}
                  contexto={contexto}
                  saved={refresh}
                />
              )}
              {aba === "contatos" && (
                <Contatos
                  key={id}
                  unidade={id}
                  contatos={v.contatos}
                  gestao={gestao}
                  usuario={contexto.usuarioId}
                  refresh={refresh}
                />
              )}
              {aba === "atividades" && (
                <Atividades unidade={id} itens={v.atividades} refresh={refresh} />
              )}
              {aba === "negociacoes" && (
                <section className="space-y-4">
                  <Button onClick={() => setNegociar(true)}>Criar ou vincular negociação</Button>
                  {!v.negociacoes.length && (
                    <p className="text-sm text-muted-foreground">Nenhuma negociação vinculada.</p>
                  )}
                  {v.negociacoes.map((n) => (
                    <article key={n.lead_id} className="space-y-3 rounded-lg border p-4">
                      <h3 className="font-medium">{n.nome}</h3>
                      <p className="text-sm">{ETAPAS[n.etapa as keyof typeof ETAPAS] || n.etapa}</p>
                      <p className="text-xs text-muted-foreground">
                        Unidades autorizadas: {n.unidades.map((u) => u.nome).join(", ")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setLeadId(n.lead_id)}>
                          Abrir lead
                        </Button>
                        <Button variant="outline" asChild>
                          <Link to="/mimo/tira-pedido" search={{ lead: n.lead_id }}>
                            Montar pedido
                          </Link>
                        </Button>
                      </div>
                      {n.pedidos.map((p) => (
                        <p key={p.id} className="text-sm">
                          <Link
                            className="text-primary hover:underline"
                            to="/mimo/tira-pedido"
                            search={{ busca: String(p.numero) }}
                          >
                            Pedido #{p.numero}
                          </Link>{" "}
                          · {p.status} ·{" "}
                          {(p.total / 100).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                      ))}
                    </article>
                  ))}
                </section>
              )}
              {aba === "historico" && (
                <section className="space-y-3">
                  {!v.historico.length && (
                    <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
                  )}
                  {v.historico.map((h) => (
                    <article key={h.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">
                        {{
                          unidade: "Cadastro da unidade",
                          contato: "Contato",
                          atividade: "Atividade",
                          reagendamento: "Reagendamento",
                          responsavel: "Responsável",
                          negociacao: "Negociação",
                        }[h.acao] || h.acao}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </p>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer">Ver alterações</summary>
                        <Alteracoes antes={h.antes} depois={h.depois} membros={contexto.membros} />
                      </details>
                    </article>
                  ))}
                </section>
              )}
              {total > 30 && (
                <nav
                  aria-label="Histórico e atividades"
                  className="mt-5 flex items-center justify-end gap-3"
                >
                  <Button
                    variant="outline"
                    disabled={pagina === 0 || q.isFetching}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm">
                    {pagina + 1}/{Math.ceil(total / 30)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(pagina + 1) * 30 >= total || q.isFetching}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </nav>
              )}
            </>
          )
        )}
        {negociar && (
          <Negociar
            unidades={{ [id]: nome }}
            usuario={contexto.usuarioId}
            close={() => setNegociar(false)}
            saved={() => {
              setNegociar(false);
              refresh();
            }}
          />
        )}
        {leadId && (
          <LeadComercial
            id={leadId}
            contexto={contexto}
            close={() => setLeadId(null)}
            refresh={refresh}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
function Cadastro({
  initial,
  contexto,
  saved,
}: {
  initial: UnidadeInput;
  contexto: Contexto;
  saved: () => void;
}) {
  const [v, setV] = useState(initial),
    [ok, setOk] = useState(false);
  const salvar = useServerFn(gravarUnidadeMimo);
  const qc = useQueryClient();
  const gestao = ["administrador", "gestor"].includes(contexto.papel);
  const mutation = useMutation({
    mutationFn: () => salvar({ data: v }),
    onSuccess: () => {
      setOk(true);
      void qc.invalidateQueries({ queryKey: ["mimo-carteira"] });
      saved();
    },
  });
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setOk(false);
        mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending} className="grid gap-4 sm:grid-cols-2">
        {(
          [
            "nome",
            "cnpj",
            "rede",
            "grupo",
            "razao_social",
            "canal",
            "cidade",
            "uf",
            "instagram",
          ] as const
        ).map((k) => (
          <label key={k} className="grid gap-1 text-sm">
            {
              {
                nome: "Unidade",
                cnpj: "CNPJ",
                rede: "Rede / franquia",
                grupo: "Grupo econômico",
                razao_social: "Razão social",
                canal: "Canal",
                cidade: "Cidade",
                uf: "UF",
                instagram: "Instagram",
              }[k]
            }
            <Input
              required={k === "nome"}
              maxLength={k === "uf" ? 2 : k === "cnpj" ? 18 : 200}
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          Potencial
          <select
            className={inputClass}
            value={v.classe}
            onChange={(e) => setV({ ...v, classe: e.target.value as UnidadeInput["classe"] })}
          >
            <option value="">Não classificado</option>
            {["A", "B", "C"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Situação
          <select
            className={inputClass}
            value={v.situacao}
            onChange={(e) => setV({ ...v, situacao: e.target.value as UnidadeInput["situacao"] })}
          >
            {SITUACOES_CARTEIRA.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {gestao && (
          <label className="grid gap-1 text-sm">
            Responsável
            <select
              className={inputClass}
              value={v.responsavel_id || ""}
              onChange={(e) => setV({ ...v, responsavel_id: e.target.value || null })}
            >
              <option value="">Sem responsável</option>
              {contexto.membros
                .filter((m) => ["administrador", "gestor", "vendedor"].includes(m.papel))
                .map((m) => (
                  <option value={m.user_id} key={m.user_id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-sm sm:col-span-2">
          Observações
          <textarea
            className={inputClass}
            maxLength={10000}
            rows={4}
            value={v.observacoes}
            onChange={(e) => setV({ ...v, observacoes: e.target.value })}
          />
        </label>
      </fieldset>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm">
          Unidade salva.
        </p>
      )}
      <Button disabled={mutation.isPending}>
        {mutation.isPending ? "Salvando…" : "Salvar unidade"}
      </Button>
    </form>
  );
}
function Contatos({
  unidade,
  contatos,
  gestao,
  usuario,
  refresh,
}: {
  unidade: string;
  contatos: Contato[];
  gestao: boolean;
  usuario: string;
  refresh: () => void;
}) {
  const [editar, setEditar] = useState<Contato | null>(null),
    [novo, setNovo] = useState(false);
  const [busca, setBusca] = useState(""),
    [termo, setTermo] = useState("");
  const [papel, setPapel] = useState<Contato["papel"]>("Comprador");
  const buscar = useServerFn(buscarContatosCarteiraMimo),
    associar = useServerFn(associarContatoCarteiraMimo);
  const q = useQuery({
    queryKey: ["mimo-carteira-contatos-busca", usuario, termo],
    queryFn: () => buscar({ data: { busca: termo } }),
    enabled: gestao && termo.length >= 2,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => associar({ data: { id, unidade_id: unidade, papel } }),
    onSuccess: () => {
      setTermo("");
      setBusca("");
      refresh();
    },
  });
  return (
    <section className="space-y-4">
      <Button
        onClick={() => {
          setEditar(null);
          setNovo(true);
        }}
      >
        Novo contato
      </Button>
      {(novo || editar) && (
        <ContatoForm
          key={editar?.id || "novo"}
          unidade={unidade}
          initial={editar}
          close={() => {
            setNovo(false);
            setEditar(null);
          }}
          saved={() => {
            setNovo(false);
            setEditar(null);
            refresh();
          }}
        />
      )}
      {!contatos.length && (
        <p className="text-sm text-muted-foreground">
          Cadastre o proprietário e o comprador para facilitar a prospecção.
        </p>
      )}
      {contatos.map((c) => {
        const wa = whatsappCarteira(c.whatsapp);
        return (
          <article key={c.id} className="space-y-2 rounded-lg border p-4">
            <h3 className="font-medium">{c.nome || "Contato sem nome"}</h3>
            <p className="text-xs text-primary">{c.papel}</p>
            <p className="break-words text-sm">Telefone: {c.telefone || "—"}</p>
            <p className="break-words text-sm">WhatsApp: {c.whatsapp || "—"}</p>
            <p className="break-words text-sm">E-mail: {c.email || "—"}</p>
            <div className="flex flex-wrap gap-2">
              {wa && (
                <Button asChild variant="outline">
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    Abrir WhatsApp
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setNovo(false);
                  setEditar(c);
                }}
              >
                Editar contato
              </Button>
            </div>
          </article>
        );
      })}
      {gestao && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Associar comprador ou proprietário de outra unidade
          </summary>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setTermo(busca);
            }}
          >
            <Input
              aria-label="Buscar contato compartilhado"
              placeholder="Nome ou telefone"
              value={busca}
              minLength={2}
              onChange={(e) => setBusca(e.target.value)}
            />
            <Button variant="outline">Buscar</Button>
          </form>
          <label className="mt-3 grid gap-1 text-sm">
            Função nesta unidade
            <select
              className={inputClass}
              value={papel}
              onChange={(e) => setPapel(e.target.value as Contato["papel"])}
            >
              {["Comprador", "Proprietário", "Outro"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          {q.isFetching && <p role="status">Buscando contatos…</p>}
          {q.isError && <p role="alert">Não foi possível buscar.</p>}
          {q.data?.map((c) => (
            <div className="mt-3 flex items-center justify-between gap-2 text-sm" key={c.id}>
              <span>{c.nome || c.telefone || c.email}</span>
              <Button
                variant="outline"
                disabled={mutation.isPending || contatos.some((x) => x.id === c.id)}
                onClick={() => mutation.mutate(c.id)}
              >
                Associar
              </Button>
            </div>
          ))}
          {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        </details>
      )}
    </section>
  );
}
function ContatoForm({
  unidade,
  initial,
  close,
  saved,
}: {
  unidade: string;
  initial: Contato | null;
  close: () => void;
  saved: () => void;
}) {
  const [v, setV] = useState(
    initial ?? {
      unidade_id: unidade,
      nome: "",
      telefone: "",
      whatsapp: "",
      email: "",
      papel: "Comprador" as Contato["papel"],
    },
  );
  const salvar = useServerFn(gravarContatoCarteiraMimo);
  const mutation = useMutation({ mutationFn: () => salvar({ data: v }), onSuccess: saved });
  return (
    <form
      className="space-y-3 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="grid gap-1 text-sm">
        Função
        <select
          className={inputClass}
          value={v.papel}
          onChange={(e) => setV({ ...v, papel: e.target.value as Contato["papel"] })}
        >
          {["Comprador", "Proprietário", "Outro"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {(["nome", "telefone", "whatsapp", "email"] as const).map((k) => (
        <label key={k} className="grid gap-1 text-sm">
          {{ nome: "Nome", telefone: "Telefone", whatsapp: "WhatsApp", email: "E-mail" }[k]}
          <Input
            maxLength={k === "email" ? 254 : k === "nome" ? 200 : 100}
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
          />
        </label>
      ))}
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      <div className="flex gap-2">
        <Button disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar contato"}
        </Button>
        <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={close}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
function Atividades({
  unidade,
  itens,
  refresh,
}: {
  unidade: string;
  itens: Atividade[];
  refresh: () => void;
}) {
  const [prazo, setPrazo] = useState(""),
    [descricao, setDescricao] = useState(""),
    [tipo, setTipo] = useState<"Ligação" | "WhatsApp" | "E-mail" | "Tarefa">("WhatsApp");
  const [editar, setEditar] = useState<{
    id: string;
    operacao: "concluir" | "reagendar";
    valor: string;
  } | null>(null);
  const agendar = useServerFn(agendarCarteiraMimo),
    concluir = useServerFn(concluirCarteiraMimo),
    reagendar = useServerFn(reagendarCarteiraMimo);
  const nova = useMutation({
    mutationFn: () =>
      agendar({
        data: { unidade_id: unidade, tipo, prazo: new Date(prazo).toISOString(), descricao },
      }),
    onSuccess: () => {
      setDescricao("");
      refresh();
    },
  });
  const alteracao = useMutation({
    mutationFn: () =>
      editar!.operacao === "concluir"
        ? concluir({ data: { id: editar!.id, unidade_id: unidade, resultado: editar!.valor } })
        : reagendar({
            data: {
              id: editar!.id,
              unidade_id: unidade,
              prazo: new Date(editar!.valor).toISOString(),
            },
          }),
    onSuccess: () => {
      setEditar(null);
      refresh();
    },
  });
  return (
    <section className="space-y-4">
      <h2 className="font-medium">Agendar próximo contato</h2>
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          nova.mutate();
        }}
      >
        <select
          aria-label="Tipo de atividade"
          className={inputClass}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
        >
          {["WhatsApp", "Ligação", "E-mail", "Tarefa"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Input
          aria-label="Prazo da atividade"
          type="datetime-local"
          required
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
        />
        <Input
          aria-label="Próximo passo"
          placeholder="Qual será o próximo passo?"
          maxLength={2000}
          required
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <Button disabled={nova.isPending}>
          {nova.isPending ? "Agendando…" : "Agendar contato"}
        </Button>
        {nova.isError && <p role="alert">{nova.error.message}</p>}
      </form>
      {!itens.length && (
        <p className="text-sm text-muted-foreground">
          Nenhuma atividade. Agende a primeira conversa.
        </p>
      )}
      {itens.map((a) => (
        <article className="space-y-2 rounded-lg border p-4" key={a.id}>
          <p className="text-sm font-medium">
            {a.tipo} · {new Date(a.prazo).toLocaleString("pt-BR")}
          </p>
          <p className="text-sm text-muted-foreground">{a.descricao}</p>
          {a.concluida_em ? (
            <p className="text-sm">Concluída · {a.resultado}</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditar({ id: a.id, operacao: "concluir", valor: "" })}
                >
                  Concluir
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditar({ id: a.id, operacao: "reagendar", valor: "" })}
                >
                  Reagendar
                </Button>
              </div>
              {editar?.id === a.id && (
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    alteracao.mutate();
                  }}
                >
                  <Input
                    aria-label={
                      editar.operacao === "concluir" ? "Resultado do contato" : "Novo prazo"
                    }
                    type={editar.operacao === "concluir" ? "text" : "datetime-local"}
                    required
                    maxLength={2000}
                    value={editar.valor}
                    onChange={(e) => setEditar({ ...editar, valor: e.target.value })}
                    placeholder="Resultado: interessado, sem retorno, retornar depois…"
                  />
                  <Button disabled={alteracao.isPending}>
                    {alteracao.isPending ? "Registrando…" : "Registrar"}
                  </Button>
                  {alteracao.isError && <p role="alert">{alteracao.error.message}</p>}
                </form>
              )}
            </>
          )}
        </article>
      ))}
      <p className="text-xs text-muted-foreground">
        Após concluir um contato, use o formulário acima para agendar o próximo passo.
      </p>
    </section>
  );
}
function LeadComercial({
  id,
  contexto,
  close,
  refresh,
}: {
  id: string;
  contexto: Contexto;
  close: () => void;
  refresh: () => void;
}) {
  const obter = useServerFn(obterLeadCarteiraMimo);
  const q = useQuery({
    queryKey: ["mimo-carteira-lead", contexto.usuarioId, id],
    queryFn: () => obter({ data: { id } }),
  });
  const membros = Object.fromEntries(contexto.membros.map((m) => [m.user_id, m.nome]));
  if (q.isPending) return <MimoCarregando />;
  if (q.isError) return <p role="alert">{q.error.message}</p>;
  return (
    <Suspense fallback={<MimoCarregando />}>
      <LeadEditor
        lead={q.data}
        usuarioId={contexto.usuarioId}
        vendedor={contexto.papel === "vendedor"}
        podeEditar={contexto.papel !== "vendedor" || q.data.responsavel_id === contexto.usuarioId}
        membros={membros}
        onClose={close}
        onSaved={() => {
          close();
          refresh();
        }}
      />
    </Suspense>
  );
}

function Alteracoes({
  antes,
  depois,
  membros,
}: {
  antes: unknown;
  depois: unknown;
  membros: Contexto["membros"];
}) {
  const a = antes && typeof antes === "object" ? (antes as Record<string, unknown>) : {};
  const d = depois && typeof depois === "object" ? (depois as Record<string, unknown>) : {};
  const labels: Record<string, string> = {
    nome: "Nome",
    cnpj: "CNPJ",
    rede: "Rede",
    grupo: "Grupo econômico",
    razao_social: "Razão social",
    canal: "Canal",
    cidade: "Cidade",
    uf: "UF",
    instagram: "Instagram",
    classe: "Potencial",
    situacao: "Situação",
    responsavel_id: "Responsável",
    observacoes: "Observações",
    telefone: "Telefone",
    whatsapp: "WhatsApp",
    email: "E-mail",
    tipo: "Tipo",
    prazo: "Prazo",
    descricao: "Atividade",
    concluida_em: "Conclusão",
    resultado: "Resultado",
  };
  const format = (k: string, v: unknown) =>
    v === null || v === undefined || v === ""
      ? "Não informado"
      : k === "responsavel_id"
        ? membros.find((m) => m.user_id === v)?.nome || "Membro anterior"
        : String(v);
  const campos = Object.keys(labels).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]));
  return (
    <div className="mt-2 space-y-2">
      {campos.length ? (
        campos.map((k) => (
          <p className="break-words" key={k}>
            <strong>{labels[k]}:</strong> {format(k, a[k])} → {format(k, d[k])}
          </p>
        ))
      ) : (
        <p>Vínculo comercial registrado.</p>
      )}
    </div>
  );
}

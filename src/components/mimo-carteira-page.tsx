import { lazy, Suspense, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Users, Upload, CalendarClock } from "lucide-react";
import { contextoMimoOptions } from "@/lib/mimo-contexto";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { MimoCarregando } from "./mimo-carregando";
import {
  SITUACOES_CARTEIRA,
  filtrosCarteiraSchema,
  type FiltrosCarteira,
} from "@/lib/mimo-carteira";
import {
  listarCarteiraMimo,
  atribuirCarteiraMimo,
  buscarLeadsCarteiraMimo,
  negociarCarteiraMimo,
} from "@/lib/mimo-carteira.functions";
const Ficha = lazy(() =>
  import("./mimo-carteira-ficha").then((m) => ({ default: m.FichaCarteira })),
);
const Importar = lazy(() =>
  import("./mimo-carteira-importar").then((m) => ({ default: m.ImportarCarteira })),
);
const dataCurta = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Sem próximo contato";
export function MimoCarteiraPage() {
  const { data: contexto } = useSuspenseQuery(contextoMimoOptions);
  const listar = useServerFn(listarCarteiraMimo),
    atribuir = useServerFn(atribuirCarteiraMimo);
  const qc = useQueryClient();
  const gestao = ["administrador", "gestor"].includes(contexto.papel);
  const membros = Object.fromEntries(contexto.membros.map((m) => [m.user_id, m.nome]));
  const [aba, setAba] = useState("carteira"),
    [f, setF] = useState<FiltrosCarteira>(() => filtrosCarteiraSchema.parse({}));
  const [busca, setBusca] = useState("");
  const [ficha, setFicha] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Record<string, string>>({});
  const [responsavel, setResponsavel] = useState("");
  const [negociar, setNegociar] = useState(false);
  const q = useQuery({
    queryKey: ["mimo-carteira", contexto.empresaId, contexto.usuarioId, f],
    queryFn: () => listar({ data: f }),
    placeholderData: keepPreviousData,
  });
  const ids = Object.keys(selecionadas);
  const atribuicao = useMutation({
    mutationFn: () => atribuir({ data: { ids, responsavel_id: responsavel || null } }),
    onSuccess: () => {
      setSelecionadas({});
      void qc.invalidateQueries({ queryKey: ["mimo-carteira"] });
    },
  });
  function filtrar<K extends keyof FiltrosCarteira>(k: K, v: FiltrosCarteira[K]) {
    setF((o) => ({ ...o, [k]: v, pagina: 0 }));
    setSelecionadas({});
  }
  const ativo = q.data?.disponivel ?? false;
  return (
    <section className="px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-primary">Comercial MiMo</p>
          <h1 className="mt-1 text-3xl">Carteira</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Unidades, parceiros e próximas conversas.
          </p>
        </div>
        <Button disabled={!ativo} onClick={() => setFicha("nova")}>
          <Plus />
          Nova unidade
        </Button>
      </header>
      {gestao && (
        <div className="my-5 flex gap-2" role="tablist" aria-label="Carteira">
          <Button
            role="tab"
            aria-selected={aba === "carteira"}
            variant={aba === "carteira" ? "default" : "outline"}
            onClick={() => setAba("carteira")}
          >
            <Users />
            Unidades
          </Button>
          <Button
            role="tab"
            aria-selected={aba === "importar"}
            variant={aba === "importar" ? "default" : "outline"}
            onClick={() => setAba("importar")}
          >
            <Upload />
            Importar base
          </Button>
        </div>
      )}
      {aba === "importar" ? (
        <Suspense fallback={<MimoCarregando />}>
          <Importar usuario={contexto.usuarioId} disponivel={ativo} />
        </Suspense>
      ) : (
        <>
          <div className="my-5 flex flex-wrap gap-2">
            {(
              [
                ["", "Todas"],
                ["hoje", "Para hoje"],
                ["atrasados", "Atrasados"],
                ["sem", "Sem próxima ação"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={f.agenda === key ? "default" : "outline"}
                onClick={() => filtrar("agenda", key)}
              >
                <CalendarClock className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
          <form
            className="flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              filtrar("busca", busca);
            }}
          >
            <Input
              aria-label="Buscar unidades"
              placeholder="Unidade, rede, cidade ou CNPJ"
              value={busca}
              maxLength={200}
              onChange={(e) => setBusca(e.target.value)}
            />
            <Button aria-label="Pesquisar" type="submit">
              <Search />
            </Button>
          </form>
          <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Filtro
              label="Potencial"
              value={f.classe}
              onChange={(v) => filtrar("classe", v as FiltrosCarteira["classe"])}
              options={{ "": "Todas as classes", A: "A", B: "B", C: "C", sem: "Não classificado" }}
            />
            <Filtro
              label="Situação"
              value={f.situacao}
              onChange={(v) => filtrar("situacao", v as FiltrosCarteira["situacao"])}
              options={{
                "": "Todas",
                ...Object.fromEntries(SITUACOES_CARTEIRA.map((s) => [s, s])),
              }}
            />
            {gestao && (
              <Filtro
                label="Responsável"
                value={f.responsavel}
                onChange={(v) => filtrar("responsavel", v)}
                options={{ "": "Todos", sem: "Sem responsável", ...membros }}
              />
            )}
            <details className="self-end rounded border p-2 text-sm">
              <summary className="cursor-pointer">Rede e região</summary>
              <div className="mt-3 grid gap-2">
                {(["rede", "grupo", "cidade", "uf"] as const).map((k) => (
                  <label key={k} className="grid gap-1 text-xs">
                    {{ rede: "Rede", grupo: "Grupo econômico", cidade: "Cidade", uf: "UF" }[k]}
                    <Input
                      value={f[k]}
                      maxLength={k === "uf" ? 2 : 150}
                      onChange={(e) => filtrar(k, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </details>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setF(filtrosCarteiraSchema.parse({}));
              setBusca("");
              setSelecionadas({});
            }}
          >
            Limpar filtros
          </Button>
          {q.isPending ? (
            <MimoCarregando />
          ) : q.isError ? (
            <div role="alert" className="py-8">
              <p>Não foi possível carregar a carteira.</p>
              <Button onClick={() => void q.refetch()}>Tentar novamente</Button>
            </div>
          ) : !ativo ? (
            <p className="mt-5 rounded-lg border p-6 text-muted-foreground">
              A carteira aguarda a liberação do banco.{" "}
              {gestao ? "Você já pode conferir a prévia em Importar base." : ""}
            </p>
          ) : (
            <>
              <p role="status" className="my-4 text-sm text-muted-foreground">
                {q.data.total} unidades {q.isFetching ? "· Atualizando…" : ""}
              </p>
              {ids.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                  <p className="text-sm">{ids.length} selecionadas</p>
                  {gestao && (
                    <>
                      <select
                        aria-label="Atribuir responsável"
                        className="max-w-64 rounded border bg-background p-2 text-sm"
                        value={responsavel}
                        onChange={(e) => setResponsavel(e.target.value)}
                      >
                        <option value="">Sem responsável</option>
                        {contexto.membros
                          .filter((m) => ["administrador", "gestor", "vendedor"].includes(m.papel))
                          .map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.nome}
                            </option>
                          ))}
                      </select>
                      <Button
                        disabled={atribuicao.isPending || q.isFetching}
                        onClick={() => atribuicao.mutate()}
                      >
                        {atribuicao.isPending ? "Atribuindo…" : "Atribuir"}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    disabled={q.isFetching}
                    onClick={() => setNegociar(true)}
                  >
                    Negociar com selecionadas
                  </Button>
                  {atribuicao.isError && <p role="alert">{atribuicao.error.message}</p>}
                </div>
              )}
              <div
                className="max-w-full overflow-x-auto rounded-lg border"
                aria-busy={q.isFetching}
              >
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="p-3">
                        <input
                          aria-label="Selecionar página"
                          type="checkbox"
                          disabled={q.isFetching}
                          checked={
                            !!q.data.unidades.length &&
                            q.data.unidades.every((u) => !!selecionadas[u.id])
                          }
                          onChange={(e) =>
                            setSelecionadas(
                              e.target.checked
                                ? Object.fromEntries(q.data.unidades.map((u) => [u.id, u.nome]))
                                : {},
                            )
                          }
                        />
                      </th>
                      {[
                        "Unidade / rede",
                        "Cidade / UF",
                        "Potencial",
                        "Situação",
                        "Responsável",
                        "Próxima ação",
                      ].map((t) => (
                        <th className="whitespace-nowrap p-3" key={t}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.unidades.map((u) => (
                      <tr className="border-t" key={u.id}>
                        <td className="p-3">
                          <input
                            aria-label={`Selecionar ${u.nome}`}
                            disabled={q.isFetching}
                            type="checkbox"
                            checked={!!selecionadas[u.id]}
                            onChange={(e) =>
                              setSelecionadas((old) => {
                                const copy = { ...old };
                                if (e.target.checked) copy[u.id] = u.nome;
                                else delete copy[u.id];
                                return copy;
                              })
                            }
                          />
                        </td>
                        <td className="min-w-48 p-3">
                          <button
                            className="text-left font-medium text-primary hover:underline"
                            disabled={q.isFetching}
                            onClick={() => setFicha(u.id)}
                          >
                            {u.nome}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {u.rede || "Rede não informada"}
                          </p>
                        </td>
                        <td className="p-3">
                          {u.cidade || "—"} / {u.uf || "—"}
                        </td>
                        <td className="p-3">{u.classe || "Não classificado"}</td>
                        <td className="whitespace-nowrap p-3">{u.situacao}</td>
                        <td className="p-3">
                          {u.responsavel_id
                            ? membros[u.responsavel_id] || "Membro inativo"
                            : "Sem responsável"}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          <span
                            className={
                              u.proxima_acao && Date.parse(u.proxima_acao) < Date.now()
                                ? "text-destructive"
                                : ""
                            }
                          >
                            {dataCurta(u.proxima_acao)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!q.data.total && (
                  <p className="p-10 text-center text-muted-foreground">
                    Nenhuma unidade encontrada para estes filtros.
                  </p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={!f.pagina || q.isFetching}
                  onClick={() => {
                    setF({ ...f, pagina: f.pagina - 1 });
                    setSelecionadas({});
                  }}
                >
                  Anterior
                </Button>
                <span className="text-sm">
                  Página {f.pagina + 1} de {Math.max(1, Math.ceil(q.data.total / 30))}
                </span>
                <Button
                  variant="outline"
                  disabled={q.isFetching || (f.pagina + 1) * 30 >= q.data.total}
                  onClick={() => {
                    setF({ ...f, pagina: f.pagina + 1 });
                    setSelecionadas({});
                  }}
                >
                  Próxima
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {ficha && (
        <Suspense fallback={<MimoCarregando />}>
          <Ficha id={ficha} contexto={contexto} close={() => setFicha(null)} />
        </Suspense>
      )}
      {negociar && (
        <Negociar
          unidades={selecionadas}
          usuario={contexto.usuarioId}
          close={() => setNegociar(false)}
          saved={() => {
            setNegociar(false);
            setSelecionadas({});
            void qc.invalidateQueries({ queryKey: ["mimo-carteira"] });
            void qc.invalidateQueries({ queryKey: ["mimo-leads"] });
          }}
        />
      )}
    </section>
  );
}
function Filtro({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  return (
    <label className="grid gap-1 text-xs">
      {label}
      <select
        className="rounded border bg-background p-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Negociar({
  unidades,
  usuario,
  close,
  saved,
}: {
  unidades: Record<string, string>;
  usuario: string;
  close: () => void;
  saved: () => void;
}) {
  const [busca, setBusca] = useState(""),
    [termo, setTermo] = useState("");
  const [lead, setLead] = useState("");
  const [principal, setPrincipal] = useState(Object.keys(unidades)[0]);
  const [operacao] = useState(() => crypto.randomUUID());
  const buscar = useServerFn(buscarLeadsCarteiraMimo),
    negociar = useServerFn(negociarCarteiraMimo);
  const q = useQuery({
    queryKey: ["mimo-carteira-leads", usuario, termo],
    queryFn: () => buscar({ data: { busca: termo } }),
  });
  const mutation = useMutation({
    mutationFn: () =>
      negociar({
        data: {
          unidades: Object.keys(unidades),
          principal,
          lead_id: lead || null,
          operacao_id: operacao,
        },
      }),
    onSuccess: saved,
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !mutation.isPending) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Negociação comercial</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Um único lead comercial atende as unidades selecionadas. Pedidos e valores são
          contabilizados uma vez.
        </p>
        <p className="text-sm">{Object.values(unidades).join(", ")}</p>
        <label className="grid gap-1 text-sm">
          Unidade principal
          <select
            className="rounded border bg-background p-2"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
          >
            {Object.entries(unidades).map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTermo(busca);
          }}
        >
          <Input
            aria-label="Buscar negociação existente"
            placeholder="Buscar lead existente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Button variant="outline">Buscar</Button>
        </form>
        {q.isPending ? (
          <p role="status">Carregando leads…</p>
        ) : q.isError ? (
          <p role="alert">Não foi possível buscar leads.</p>
        ) : (
          <label className="grid gap-1 text-sm">
            Lead comercial
            <select
              className="rounded border bg-background p-2"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
            >
              <option value="">Criar nova negociação</option>
              {q.data.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome_empresa} · {l.etapa}
                </option>
              ))}
            </select>
          </label>
        )}
        {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Vinculando…" : lead ? "Vincular negociação" : "Criar negociação"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

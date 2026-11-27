import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ROTULO_MOTIVO,
  UFS_BR,
  atribuirUnidade,
  centavosParaReais,
  comissaoParaBps,
  csvDesempenho,
  formatarBps,
  indiceCabecalhoRepresentantes,
  lerTextoTabela,
  mapaManuais,
  periodoPadrao,
  periodoRepresentantesSchema,
  prepararPlanilhaRepresentantes,
  principaisPorUf,
  type ClienteRepresentante,
  type PeriodoRepresentantes,
  type PlanilhaRepresentantes,
  type RepresentanteComercial,
  type TerritorioRepresentante,
  type UnidadeCarteiraRep,
} from "@/lib/mimo-representantes-comerciais";
import {
  atribuirClienteRepresentante,
  carregarRepresentantesComerciais,
  desempenhoRepresentantesComerciais,
  historicoRepresentantesComerciais,
  importarRepresentantesComerciais,
  salvarRepresentanteComercial,
} from "@/lib/mimo-representantes-comerciais.functions";

const CHAVE = ["mimo-representantes-comerciais"] as const;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

type Base = {
  representantes: RepresentanteComercial[];
  territorios: TerritorioRepresentante[];
  clientes: ClienteRepresentante[];
  unidades: UnidadeCarteiraRep[];
};

export function MimoRepresentantesComerciaisPage() {
  const base = useQuery({
    queryKey: CHAVE,
    queryFn: () => carregarRepresentantesComerciais() as Promise<Base>,
  });
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Representantes comerciais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Desempenho por representante: faturamento dos clientes da carteira, pedidos e comissão.
          Cada cliente segue o representante principal da sua UF, salvo atribuição manual.
        </p>
      </header>
      {base.isPending ? (
        <p role="status">Carregando representantes…</p>
      ) : base.isError ? (
        <div role="alert" className="rounded-xl border p-5 text-destructive">
          <p>{base.error.message}</p>
          <Button variant="outline" className="mt-3" onClick={() => base.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="desempenho">
          <TabsList className="flex-wrap">
            <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
            <TabsTrigger value="cadastro">Representantes</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
            <TabsTrigger value="importar">Importar planilha</TabsTrigger>
          </TabsList>
          <TabsContent value="desempenho" className="mt-4">
            <Desempenho />
          </TabsContent>
          <TabsContent value="cadastro" className="mt-4">
            <Cadastro base={base.data} />
          </TabsContent>
          <TabsContent value="clientes" className="mt-4">
            <Clientes base={base.data} />
          </TabsContent>
          <TabsContent value="importar" className="mt-4">
            <Importar />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ desempenho

function Desempenho() {
  const [rascunho, setRascunho] = useState<PeriodoRepresentantes>(() => periodoPadrao());
  const valido = periodoRepresentantesSchema.safeParse(rascunho);
  const periodo = valido.success ? valido.data : null;
  const q = useQuery({
    queryKey: [...CHAVE, "desempenho", periodo],
    queryFn: () => desempenhoRepresentantesComerciais({ data: periodo! }),
    enabled: !!periodo,
    placeholderData: (anterior) => anterior,
  });
  function exportar() {
    if (!q.data) return;
    const url = URL.createObjectURL(
      new Blob([csvDesempenho(q.data, q.data.periodo)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `representantes-comerciais-${q.data.periodo.de}-${q.data.periodo.ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const d = q.data;
  return (
    <section aria-label="Desempenho por representante" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm">
          De
          <Input
            type="date"
            aria-label="Data inicial"
            value={rascunho.de}
            onChange={(e) => setRascunho((p) => ({ ...p, de: e.target.value }))}
          />
        </label>
        <label className="text-sm">
          Até
          <Input
            type="date"
            aria-label="Data final"
            value={rascunho.ate}
            onChange={(e) => setRascunho((p) => ({ ...p, ate: e.target.value }))}
          />
        </label>
        <Button variant="outline" disabled={!d || q.isFetching} onClick={exportar}>
          Exportar CSV
        </Button>
        {!valido.success && (
          <p role="alert" className="text-sm text-destructive">
            {valido.error.issues[0]?.message}
          </p>
        )}
        <p className="basis-full text-xs text-muted-foreground">
          Faturamento = pedidos faturados, enviados ou entregues com data de faturamento no período,
          vinculados à carteira pela negociação. Valores atuais dos pedidos, não recebimentos.
          Comissão = faturamento × % fixo do representante.
        </p>
      </div>
      {q.isError ? (
        <p role="alert" className="text-destructive">
          {q.error.message}
        </p>
      ) : !d ? (
        <p role="status">Calculando desempenho…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Faturamento", centavosParaReais(d.total.faturamento)],
              ["Comissões", centavosParaReais(d.total.comissao)],
              ["Pedidos faturados", d.total.pedidos],
              ["Clientes na carteira", d.total.clientes],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">{l}</p>
                <strong className="mt-2 block text-xl">{v}</strong>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {[
                    "Representante",
                    "UFs",
                    "Comissão %",
                    "Clientes",
                    "Clientes faturados",
                    "Pedidos",
                    "Faturamento",
                    "Comissão",
                  ].map((l) => (
                    <th key={l} className="whitespace-nowrap p-3 font-medium">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.linhas.map((l) => (
                  <tr key={l.representanteId} className="border-t">
                    <td className="p-3">
                      <p className="font-medium">{l.nome}</p>
                      {!l.ativo && <p className="text-xs text-muted-foreground">Inativo</p>}
                    </td>
                    <td className="p-3">
                      {l.ufsPrincipais.join(", ") || "—"}
                      {l.ufsSecundarias.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Secundário: {l.ufsSecundarias.join(", ")}
                        </p>
                      )}
                    </td>
                    <td className="p-3">{formatarBps(l.comissaoBps)}</td>
                    <td className="p-3">
                      {l.clientes}
                      {l.clientesManuais > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({l.clientesManuais} manual)
                        </span>
                      )}
                    </td>
                    <td className="p-3">{l.clientesFaturados}</td>
                    <td className="p-3">{l.pedidos}</td>
                    <td className="p-3">{centavosParaReais(l.faturamento)}</td>
                    <td className="p-3">{centavosParaReais(l.comissao)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30">
                  <td className="p-3 font-medium">Sem representante</td>
                  <td className="p-3">—</td>
                  <td className="p-3">—</td>
                  <td className="p-3">{d.semRepresentante.clientes}</td>
                  <td className="p-3">{d.semRepresentante.clientesFaturados}</td>
                  <td className="p-3">{d.semRepresentante.pedidos}</td>
                  <td className="p-3">{centavosParaReais(d.semRepresentante.faturamento)}</td>
                  <td className="p-3">—</td>
                </tr>
              </tbody>
            </table>
            {!d.linhas.length && (
              <p className="p-6 text-center text-muted-foreground">
                Nenhum representante cadastrado. Use “Importar planilha” ou “Representantes”.
              </p>
            )}
          </div>
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Por que há “Sem representante”?
            </summary>
            <ul className="mt-3 space-y-1">
              {Object.entries(d.semRepresentante.motivosClientes).map(([k, n]) => (
                <li key={k}>
                  {ROTULO_MOTIVO[k as keyof typeof ROTULO_MOTIVO]}: {n} cliente(s)
                </li>
              ))}
              {Object.entries(d.semRepresentante.motivosPedidos).map(([k, m]) => (
                <li key={k}>
                  {ROTULO_MOTIVO[k as keyof typeof ROTULO_MOTIVO]}: {m.pedidos} pedido(s),{" "}
                  {centavosParaReais(m.faturamento)}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ cadastro

type Form = {
  id: string | null;
  versao: number | null;
  nome: string;
  ativo: boolean;
  comissao: string;
  telefone: string;
  email: string;
  observacoes: string;
  ufs: Record<string, "" | "principal" | "secundario">;
};

function Cadastro({ base }: { base: Base }) {
  const [form, setForm] = useState<Form | null>(null);
  const [historico, setHistorico] = useState<RepresentanteComercial | null>(null);
  function abrir(r?: RepresentanteComercial) {
    const ufs: Form["ufs"] = {};
    if (r)
      for (const t of base.territorios)
        if (t.representante_id === r.id) ufs[t.uf] = t.principal ? "principal" : "secundario";
    setForm({
      id: r?.id ?? null,
      versao: r?.versao ?? null,
      nome: r?.nome ?? "",
      ativo: r?.ativo ?? true,
      comissao: r ? formatarBps(r.comissao_bps).replace("%", "") : "",
      telefone: r?.telefone ?? "",
      email: r?.email ?? "",
      observacoes: r?.observacoes ?? "",
      ufs,
    });
  }
  return (
    <section aria-label="Cadastro de representantes" className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => abrir()}>Novo representante</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {[
                "Nome",
                "Situação",
                "Comissão",
                "UFs principais",
                "UFs secundárias",
                "Contato",
                "",
              ].map((l, i) => (
                <th key={i} className="p-3 font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {base.representantes.map((r) => {
              const ts = base.territorios.filter((t) => t.representante_id === r.id);
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.nome}</td>
                  <td className="p-3">{r.ativo ? "Ativo" : "Inativo"}</td>
                  <td className="p-3">{formatarBps(r.comissao_bps)}</td>
                  <td className="p-3">
                    {ts
                      .filter((t) => t.principal)
                      .map((t) => t.uf)
                      .join(", ") || "—"}
                  </td>
                  <td className="p-3">
                    {ts
                      .filter((t) => !t.principal)
                      .map((t) => t.uf)
                      .join(", ") || "—"}
                  </td>
                  <td className="p-3 text-xs">
                    {[r.telefone, r.email].filter(Boolean).join(" · ")}
                  </td>
                  <td className="space-x-2 whitespace-nowrap p-3">
                    <Button variant="outline" size="sm" onClick={() => abrir(r)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setHistorico(r)}>
                      Histórico
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!base.representantes.length && (
          <p className="p-6 text-center text-muted-foreground">Nenhum representante cadastrado.</p>
        )}
      </div>
      {form && <FormRepresentante inicial={form} fechar={() => setForm(null)} />}
      {historico && (
        <Historico
          titulo={historico.nome}
          entidade="representante"
          referencia={historico.id}
          fechar={() => setHistorico(null)}
        />
      )}
    </section>
  );
}

function FormRepresentante({ inicial, fechar }: { inicial: Form; fechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(inicial);
  const bps = comissaoParaBps(f.comissao, "percentual");
  const salvar = useMutation({
    mutationFn: () =>
      salvarRepresentanteComercial({
        data: {
          id: f.id,
          versao: f.versao,
          nome: f.nome,
          ativo: f.ativo,
          comissao_bps: bps!,
          telefone: f.telefone,
          email: f.email.trim(),
          observacoes: f.observacoes,
          territorios: Object.entries(f.ufs)
            .filter(([, v]) => v)
            .map(([uf, v]) => ({ uf, principal: v === "principal" })),
        },
      }),
    onSuccess: async () => {
      toast.success("Representante salvo.");
      await qc.invalidateQueries({ queryKey: CHAVE });
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{f.id ? "Editar representante" : "Novo representante"}</DialogTitle>
          <DialogDescription>
            Pessoa externa, sem acesso ao painel. A comissão é um percentual fixo sobre o
            faturamento.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (bps === null) return toast.error("Comissão inválida. Ex.: 3,5");
            salvar.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Nome
              <Input
                required
                value={f.nome}
                onChange={(e) => setF({ ...f, nome: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Comissão (%)
              <Input
                required
                inputMode="decimal"
                placeholder="3,5"
                value={f.comissao}
                aria-invalid={f.comissao !== "" && bps === null}
                onChange={(e) => setF({ ...f, comissao: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Telefone (opcional)
              <Input
                value={f.telefone}
                onChange={(e) => setF({ ...f, telefone: e.target.value })}
              />
            </label>
            <label className="text-sm">
              E-mail (opcional)
              <Input
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.ativo}
              onChange={(e) => setF({ ...f, ativo: e.target.checked })}
            />
            Ativo (inativos não recebem clientes pela UF)
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Território (UF)</legend>
            <p className="text-xs text-muted-foreground">
              O principal recebe automaticamente os clientes da UF; o secundário só por atribuição
              manual.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {UFS_BR.map((uf) => (
                <label key={uf} className="text-xs">
                  {uf}
                  <select
                    aria-label={`Território ${uf}`}
                    className="block w-full rounded-md border bg-background p-1"
                    value={f.ufs[uf] ?? ""}
                    onChange={(e) =>
                      setF({ ...f, ufs: { ...f.ufs, [uf]: e.target.value as Form["ufs"][string] } })
                    }
                  >
                    <option value="">—</option>
                    <option value="principal">Principal</option>
                    <option value="secundario">Secundário</option>
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            Observações
            <Textarea
              maxLength={2000}
              value={f.observacoes}
              onChange={(e) => setF({ ...f, observacoes: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Historico(props: {
  titulo: string;
  entidade: "representante" | "cliente";
  referencia: string;
  fechar: () => void;
}) {
  const q = useQuery({
    queryKey: [...CHAVE, "historico", props.entidade, props.referencia],
    queryFn: () =>
      historicoRepresentantesComerciais({
        data: { entidade: props.entidade, referencia: props.referencia },
      }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && props.fechar()}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico · {props.titulo}</DialogTitle>
          <DialogDescription>Registro permanente das alterações.</DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <p role="status">Carregando…</p>
        ) : q.isError ? (
          <p role="alert">{q.error.message}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {q.data.map((h) => (
              <li key={h.id} className="rounded-md border p-2">
                <p className="font-medium">{h.acao.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
            {!q.data.length && <li>Sem alterações registradas.</li>}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ clientes

function Clientes({ base }: { base: Base }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"" | "sem" | "manual">("");
  const [pagina, setPagina] = useState(1);
  const [editar, setEditar] = useState<UnidadeCarteiraRep | null>(null);
  const nomes = useMemo(
    () => new Map(base.representantes.map((r) => [r.id, r])),
    [base.representantes],
  );
  const linhas = useMemo(() => {
    const principais = principaisPorUf(base.representantes, base.territorios);
    const manuais = mapaManuais(base.clientes);
    return base.unidades
      .map((u) => ({ u, a: atribuirUnidade(u, principais, manuais) }))
      .sort((x, y) => x.u.nome.localeCompare(y.u.nome, "pt-BR"));
  }, [base]);
  const filtradas = linhas.filter(
    ({ u, a }) =>
      (!busca || norm(`${u.nome} ${u.cidade} ${u.uf}`).includes(norm(busca))) &&
      (filtro !== "sem" || !a.representanteId) &&
      (filtro !== "manual" || a.origem === "manual"),
  );
  const paginas = Math.max(1, Math.ceil(filtradas.length / 25));
  const atual = Math.min(pagina, paginas);
  return (
    <section aria-label="Clientes por representante" className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        <Input
          className="max-w-sm"
          aria-label="Buscar clientes"
          placeholder="Unidade, cidade ou UF"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(1);
          }}
        />
        <select
          aria-label="Filtro de atribuição"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value as typeof filtro);
            setPagina(1);
          }}
        >
          <option value="">Todos os clientes</option>
          <option value="sem">Sem representante</option>
          <option value="manual">Atribuição manual</option>
        </select>
        <p className="self-center text-sm text-muted-foreground">{filtradas.length} clientes</p>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Unidade", "Cidade / UF", "Representante", ""].map((l, i) => (
                <th key={i} className="p-3 font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.slice((atual - 1) * 25, atual * 25).map(({ u, a }) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.nome}</td>
                <td className="p-3">{[u.cidade, u.uf].filter(Boolean).join(" / ") || "—"}</td>
                <td className="p-3">
                  {a.representanteId === null ? (
                    <span className="text-muted-foreground">
                      Sem representante · {ROTULO_MOTIVO[a.motivo]}
                    </span>
                  ) : (
                    <>
                      {nomes.get(a.representanteId)?.nome ?? "—"}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({a.origem === "manual" ? "manual" : "pela UF"})
                      </span>
                    </>
                  )}
                </td>
                <td className="p-3">
                  <Button variant="outline" size="sm" onClick={() => setEditar(u)}>
                    Alterar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtradas.length && (
          <p className="p-6 text-center text-muted-foreground">Nenhum cliente encontrado.</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 text-sm">
        <Button variant="outline" disabled={atual <= 1} onClick={() => setPagina(atual - 1)}>
          Anterior
        </Button>
        <span>
          Página {atual} de {paginas}
        </span>
        <Button variant="outline" disabled={atual >= paginas} onClick={() => setPagina(atual + 1)}>
          Próxima
        </Button>
      </div>
      {editar && (
        <AtribuirCliente
          unidade={editar}
          atual={base.clientes.find((c) => c.unidade_id === editar.id) ?? null}
          representantes={base.representantes.filter((r) => r.ativo)}
          fechar={() => setEditar(null)}
        />
      )}
    </section>
  );
}

function AtribuirCliente(props: {
  unidade: UnidadeCarteiraRep;
  atual: ClienteRepresentante | null;
  representantes: RepresentanteComercial[];
  fechar: () => void;
}) {
  const qc = useQueryClient();
  const [rep, setRep] = useState(props.atual?.representante_id ?? "");
  const [motivo, setMotivo] = useState("");
  const [historico, setHistorico] = useState(false);
  const salvar = useMutation({
    mutationFn: () =>
      atribuirClienteRepresentante({
        data: {
          unidade_id: props.unidade.id,
          representante_id: rep || null,
          motivo,
          versao: props.atual?.versao ?? null,
        },
      }),
    onSuccess: async () => {
      toast.success("Representante do cliente atualizado.");
      await qc.invalidateQueries({ queryKey: CHAVE });
      props.fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && props.fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Representante de {props.unidade.nome}</DialogTitle>
          <DialogDescription>
            A atribuição manual vence a regra da UF ({props.unidade.uf || "sem UF"}) e fica
            registrada no histórico.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <label className="block text-sm">
            Representante
            <select
              className="mt-1 block h-10 w-full rounded-md border bg-background px-3"
              value={rep}
              onChange={(e) => setRep(e.target.value)}
            >
              <option value="">Automático (principal da UF)</option>
              {props.representantes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Motivo
            <Textarea
              required
              minLength={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setHistorico(true)}>
              Histórico
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={props.fechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvar.isPending || motivo.trim().length < 3}>
                Salvar
              </Button>
            </div>
          </div>
        </form>
        {historico && (
          <Historico
            titulo={props.unidade.nome}
            entidade="cliente"
            referencia={props.unidade.id}
            fechar={() => setHistorico(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ importação

async function lerArquivo(file: File): Promise<unknown[][]> {
  if (file.size > 5 * 1024 * 1024) throw Error("Use um arquivo de até 5 MB.");
  if (/\.(csv|txt|tsv)$/i.test(file.name)) return lerTextoTabela(await file.text());
  const { default: ler, readSheetNames } = await import("read-excel-file");
  const abas = await readSheetNames(file);
  let primeira: unknown[][] | null = null;
  for (const aba of abas) {
    const rows = (await ler(file, { sheet: aba })) as unknown[][];
    primeira ??= rows;
    if (indiceCabecalhoRepresentantes(rows) >= 0) return rows;
  }
  return primeira ?? [];
}

function Importar() {
  const qc = useQueryClient();
  const [colado, setColado] = useState("");
  const [previa, setPrevia] = useState<PlanilhaRepresentantes | null>(null);
  const [lendo, setLendo] = useState(false);
  const importar = useMutation({
    mutationFn: () => importarRepresentantesComerciais({ data: previa!.payload! }),
    onSuccess: async (r) => {
      toast.success(
        `Importação concluída: ${r.criados} novos, ${r.atualizados} atualizados, ${r.inalterados} sem mudança, ${r.territorios} territórios alterados.`,
      );
      setPrevia(null);
      setColado("");
      await qc.invalidateQueries({ queryKey: CHAVE });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <section aria-label="Importar planilha de representantes" className="space-y-4">
      <div className="rounded-xl border bg-card p-4 text-sm">
        <p>
          Colunas esperadas:{" "}
          <strong>REGIÃO | ESTADO | UF | REPRESENTANTE(S) | COMISSÕES % | CONTAR UF</strong>. Uma
          linha por representante e UF; em UFs com dois representantes, CONTAR UF = 1 indica o
          principal e 0 o secundário. Comissão como fração (0,035) ou percentual (3,5%).
        </p>
        <p className="mt-2 text-muted-foreground">
          Reimportar é seguro: representantes são reconhecidos pelo nome, a comissão é atualizada e
          cada UF do arquivo passa a ter exatamente os representantes listados. UFs fora do arquivo,
          situação (ativo/inativo), contatos e atribuições manuais não mudam.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          Arquivo (.xlsx ou .csv)
          <Input
            type="file"
            accept=".xlsx,.csv,.txt,.tsv"
            disabled={lendo}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setLendo(true);
              try {
                setPrevia(prepararPlanilhaRepresentantes(await lerArquivo(file)));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Não foi possível ler o arquivo.");
              } finally {
                setLendo(false);
              }
            }}
          />
        </label>
        <div className="space-y-2">
          <label className="block text-sm">
            Ou cole as linhas copiadas da planilha (com o cabeçalho)
            <Textarea rows={4} value={colado} onChange={(e) => setColado(e.target.value)} />
          </label>
          <Button
            variant="outline"
            disabled={!colado.trim()}
            onClick={() => setPrevia(prepararPlanilhaRepresentantes(lerTextoTabela(colado)))}
          >
            Pré-visualizar
          </Button>
        </div>
      </div>
      {previa && (
        <div className="space-y-3">
          {previa.erros.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-destructive p-4 text-sm text-destructive"
            >
              <p className="font-medium">Corrija antes de importar:</p>
              <ul className="mt-2 list-disc pl-5">
                {previa.erros.map((e, i) => (
                  <li key={i}>
                    {e.linha ? `Linha ${e.linha}: ` : ""}
                    {e.mensagem}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {previa.avisos.length > 0 && (
            <ul className="list-disc rounded-xl border p-4 pl-8 text-sm text-muted-foreground">
              {previa.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Linha", "Região", "UF", "Representante", "Comissão", "Papel na UF"].map(
                    (l) => (
                      <th key={l} className="p-2 font-medium">
                        {l}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {previa.linhas.map((l) => (
                  <tr key={l.linha} className="border-t">
                    <td className="p-2">{l.linha}</td>
                    <td className="p-2">{l.regiao}</td>
                    <td className="p-2">{l.uf}</td>
                    <td className="p-2">{l.nome}</td>
                    <td className="p-2">{formatarBps(l.comissaoBps)}</td>
                    <td className="p-2">{l.principal ? "Principal" : "Secundário"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPrevia(null)}>
              Descartar
            </Button>
            <Button
              disabled={!previa.payload || importar.isPending}
              onClick={() => importar.mutate()}
            >
              Importar{" "}
              {previa.payload ? `${previa.payload.representantes.length} representantes` : ""}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

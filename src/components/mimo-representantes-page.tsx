import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CORE_REP,
  DISPONIBILIDADES_REP,
  EXPERIENCIAS_REP,
  SEGMENTOS_REP,
  ETAPAS_REP,
  UFS,
  csvRepresentantes,
  type Representante,
} from "@/lib/mimo-representantes";
import {
  listarRepresentantesMimo,
  editarRepresentanteMimo,
  excluirRepresentanteMimo,
  historicoRepresentanteMimo,
} from "@/lib/mimo-representantes.functions";
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function MimoRepresentantesPage() {
  const q = useQuery({
    queryKey: ["mimo-representantes"],
    queryFn: () => listarRepresentantesMimo(),
    refetchInterval: 30000,
  });
  const [f, setF] = useState({
    busca: "",
    uf: "",
    etapa: "",
    experiencia: "",
    segmento: "",
    core: "",
    disponibilidade: "",
    carteira: "",
  });
  const [ordem, setOrdem] = useState("recentes"),
    [pagina, setPagina] = useState(1),
    [pessoa, setPessoa] = useState<Representante | null>(null);
  const todos = q.data ?? [];
  const rows = todos
    .filter(
      (r) =>
        (!f.busca ||
          norm(
            `${r.nome} ${r.email} ${r.whatsapp} ${r.cidade} ${r.regiao_atuacao} ${r.marcas_atuais}`,
          ).includes(norm(f.busca))) &&
        (!f.uf || r.uf === f.uf) &&
        (!f.etapa || r.etapa === f.etapa) &&
        (!f.experiencia || r.experiencia === f.experiencia) &&
        (!f.segmento || r.segmentos.includes(f.segmento as (typeof r.segmentos)[number])) &&
        (!f.core || r.core === f.core) &&
        (!f.disponibilidade || r.disponibilidade === f.disponibilidade) &&
        (!f.carteira ||
          (f.carteira === "com" ? r.carteira_clientes > 0 : r.carteira_clientes === 0)),
    )
    .sort((a, b) =>
      ordem === "nome"
        ? a.nome.localeCompare(b.nome)
        : ordem === "carteira"
          ? b.carteira_clientes - a.carteira_clientes
          : b.created_at.localeCompare(a.created_at),
    );
  const paginas = Math.max(1, Math.ceil(rows.length / 25)),
    atual = Math.min(pagina, paginas);
  function filtro(k: keyof typeof f, v: string) {
    setF((s) => ({ ...s, [k]: v }));
    setPagina(1);
  }
  function exportar() {
    const url = URL.createObjectURL(
      new Blob([csvRepresentantes(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "representantes-mimo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Representantes MiMo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastros, regiões de atuação e seleção de representantes comerciais.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/representantes`);
                toast.success("Link do formulário copiado.");
              } catch {
                toast.error("Abra o formulário e copie o endereço.");
              }
            }}
          >
            Copiar link do formulário
          </Button>
          <Button variant="outline" asChild>
            <a href="/representantes" target="_blank" rel="noreferrer">
              Abrir formulário
            </a>
          </Button>
        </div>
      </header>
      <section
        aria-label="Indicadores de representantes"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {[
          ["Inscritos", todos.length],
          ["Em análise", todos.filter((r) => r.etapa === "Em análise").length],
          ["Aprovados", todos.filter((r) => r.etapa === "Aprovado").length],
          ["Confirmados", todos.filter((r) => r.etapa === "Confirmado").length],
        ].map(([l, n]) => (
          <div key={l} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{l}</p>
            <strong className="mt-2 block text-2xl">{n}</strong>
          </div>
        ))}
      </section>
      <section
        aria-label="Inscrições por experiência"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Object.entries(EXPERIENCIAS_REP).map(([k, l]) => (
          <div role="group" aria-label={l} key={k} className="rounded-xl border bg-card p-4">
            <p className="text-sm">{l}</p>
            <strong className="mt-2 block text-xl">
              {todos.filter((r) => r.experiencia === k).length}
            </strong>
            <p className="mt-1 text-xs text-muted-foreground">inscritos</p>
          </div>
        ))}
      </section>
      <section
        aria-label="Filtros de representantes"
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Input
          aria-label="Buscar representantes"
          placeholder="Nome, contato, região ou marca"
          value={f.busca}
          onChange={(e) => filtro("busca", e.target.value)}
        />
        <Filtro
          label="Etapa"
          value={f.etapa}
          mudar={(v) => filtro("etapa", v)}
          opcoes={Object.fromEntries(ETAPAS_REP.map((e) => [e, e]))}
        />
        <Filtro
          label="Estado"
          value={f.uf}
          mudar={(v) => filtro("uf", v)}
          opcoes={Object.fromEntries(UFS.map((e) => [e, e]))}
        />
        <Filtro
          label="Experiência"
          value={f.experiencia}
          mudar={(v) => filtro("experiencia", v)}
          opcoes={EXPERIENCIAS_REP}
        />
        <Filtro
          label="Segmento"
          value={f.segmento}
          mudar={(v) => filtro("segmento", v)}
          opcoes={SEGMENTOS_REP}
        />
        <Filtro label="CORE" value={f.core} mudar={(v) => filtro("core", v)} opcoes={CORE_REP} />
        <Filtro
          label="Disponibilidade"
          value={f.disponibilidade}
          mudar={(v) => filtro("disponibilidade", v)}
          opcoes={DISPONIBILIDADES_REP}
        />
        <Filtro
          label="Carteira de clientes"
          value={f.carteira}
          mudar={(v) => filtro("carteira", v)}
          opcoes={{ com: "Com clientes ativos", sem: "Sem clientes ativos" }}
        />
        <label className="text-sm">
          Ordenar por
          <select
            className="ml-2 rounded-md border bg-background p-2"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value)}
          >
            <option value="recentes">Mais recentes</option>
            <option value="nome">Nome</option>
            <option value="carteira">Maior carteira</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setF({
              busca: "",
              uf: "",
              etapa: "",
              experiencia: "",
              segmento: "",
              core: "",
              disponibilidade: "",
              carteira: "",
            });
            setPagina(1);
          }}
        >
          Limpar filtros
        </Button>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} cadastros encontrados · atualização a cada 30 segundos
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={q.isFetching} onClick={() => q.refetch()}>
            Atualizar
          </Button>
          <Button variant="outline" disabled={!rows.length || q.isError} onClick={exportar}>
            Exportar filtrados
          </Button>
        </div>
      </div>
      {q.isPending ? (
        <p role="status">Carregando representantes…</p>
      ) : q.isError ? (
        <div role="alert" className="rounded-xl border p-5 text-destructive">
          <p>{q.error.message}</p>
          <Button variant="outline" className="mt-3" onClick={() => q.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {[
                    "Nome e contato",
                    "Localização / atuação",
                    "Experiência e carteira",
                    "Segmentos",
                    "Etapa",
                    "",
                  ].map((l, i) => (
                    <th key={i} className="whitespace-nowrap p-4 font-medium">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice((atual - 1) * 25, atual * 25).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-4">
                      <p className="font-medium">{r.nome}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </td>
                    <td className="p-4">
                      <p>
                        {r.cidade} / {r.uf}
                      </p>
                      <p className="max-w-xs text-xs text-muted-foreground">{r.regiao_atuacao}</p>
                    </td>
                    <td className="p-4">
                      <p>{EXPERIENCIAS_REP[r.experiencia]}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.carteira_clientes.toLocaleString("pt-BR")} clientes ativos
                      </p>
                    </td>
                    <td className="p-4">{r.segmentos.map((s) => SEGMENTOS_REP[s as keyof typeof SEGMENTOS_REP]).join(", ")}</td>
                    <td className="p-4">{r.etapa}</td>
                    <td className="p-4">
                      <Button variant="outline" onClick={() => setPessoa(r)}>
                        Avaliar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-8 text-center text-muted-foreground">
                {todos.length
                  ? "Nenhum cadastro corresponde aos filtros."
                  : "Os cadastros aparecerão aqui assim que o formulário receber inscrições."}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <Button variant="outline" disabled={atual <= 1} onClick={() => setPagina(atual - 1)}>
              Anterior
            </Button>
            <span>
              Página {atual} de {paginas}
            </span>
            <Button
              variant="outline"
              disabled={atual >= paginas}
              onClick={() => setPagina(atual + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      {pessoa && <Ficha key={pessoa.id} pessoa={pessoa} fechar={() => setPessoa(null)} />}
    </div>
  );
}
function Filtro({
  label,
  value,
  mudar,
  opcoes,
}: {
  label: string;
  value: string;
  mudar: (v: string) => void;
  opcoes: Record<string, string>;
}) {
  return (
    <select
      aria-label={label}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => mudar(e.target.value)}
    >
      <option value="">{label}: todos</option>
      {Object.entries(opcoes).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
function Ficha({ pessoa: r, fechar }: { pessoa: Representante; fechar: () => void }) {
  const qc = useQueryClient(),
    [etapa, setEtapa] = useState(r.etapa),
    [notas, setNotas] = useState(r.notas),
    [confirma, setConfirma] = useState(false);
  const h = useQuery({
    queryKey: ["mimo-representante-historico", r.id],
    queryFn: () => historicoRepresentanteMimo({ data: r.id }),
  });
  const sucesso = async (texto: string) => {
    await qc.invalidateQueries({ queryKey: ["mimo-representantes"] });
    toast.success(texto);
    fechar();
  };
  const salvar = useMutation({
    mutationFn: () =>
      editarRepresentanteMimo({ data: { id: r.id, versao: r.versao, etapa, notas } }),
    onSuccess: () => sucesso("Avaliação salva."),
    onError: (e) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => excluirRepresentanteMimo({ data: { id: r.id, versao: r.versao } }),
    onSuccess: () => sucesso("Representante excluído da lista."),
    onError: (e) => toast.error(e.message),
  });
  const ocupado = salvar.isPending || excluir.isPending;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !ocupado) fechar();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r.nome}</DialogTitle>
          <DialogDescription>
            Cadastro recebido em {new Date(r.created_at).toLocaleDateString("pt-BR")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <a className="block text-primary underline" href={`mailto:${r.email}`}>
            {r.email}
          </a>
          <a
            className="block text-primary underline"
            href={`https://wa.me/55${r.whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp: {r.whatsapp}
          </a>
          <p>
            {r.cidade} / {r.uf}
          </p>
          <p>
            <strong>Região de atuação:</strong> {r.regiao_atuacao}
          </p>
          <p>
            <strong>Experiência:</strong> {EXPERIENCIAS_REP[r.experiencia]}
          </p>
          <p>
            <strong>Segmentos:</strong> {r.segmentos.map((s) => SEGMENTOS_REP[s]).join(", ")}
          </p>
          <p>
            <strong>Carteira:</strong> {r.carteira_clientes.toLocaleString("pt-BR")} clientes ativos
          </p>
          <p>
            <strong>Marcas atuais:</strong> {r.marcas_atuais || "Não informado"}
          </p>
          <p>
            <strong>CORE:</strong> {CORE_REP[r.core]}
          </p>
          <p>
            <strong>Disponibilidade:</strong> {DISPONIBILIDADES_REP[r.disponibilidade]}
          </p>
          <p className="text-xs text-muted-foreground">
            Informações autodeclaradas · aceite para seleção e contato registrado.
          </p>
        </div>
        <label className="text-sm">
          Etapa
          <select
            value={etapa}
            onChange={(e) => setEtapa(e.target.value as typeof etapa)}
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
          >
            {ETAPAS_REP.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Anotações internas
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={5000}
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
          />
        </label>
        <Button disabled={ocupado} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : "Salvar avaliação"}
        </Button>
        {confirma ? (
          <div
            role="group"
            aria-label="Confirmar exclusão"
            className="space-y-3 rounded-lg border border-destructive/40 p-4"
          >
            <p className="text-sm">
              Excluir este representante da lista e dos indicadores? O WhatsApp e o e-mail
              continuarão bloqueados para inscrições repetidas.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={ocupado} onClick={() => excluir.mutate()}>
                {excluir.isPending ? "Excluindo…" : "Confirmar exclusão"}
              </Button>
              <Button variant="outline" disabled={ocupado} onClick={() => setConfirma(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="text-destructive"
            disabled={ocupado}
            onClick={() => setConfirma(true)}
          >
            Excluir da lista
          </Button>
        )}
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Histórico de avaliação</h3>
          {h.isPending && <p className="text-xs">Carregando histórico…</p>}
          {h.isError && (
            <p role="alert" className="text-xs text-destructive">
              {h.error.message}
            </p>
          )}
          {h.data?.map((e) => (
            <div key={e.id} className="rounded-lg border p-3 text-xs">
              <p>
                {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
                {e.acao === "excluido" ? "Excluído da lista" : e.etapa}
              </p>
              {e.notas && (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{e.notas}</p>
              )}
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}

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
  categoriaInfluenciador,
  csvInfluenciadores,
  ETAPAS_INFLUENCIADORES,
  METAS_INFLUENCIADORES,
  NICHOS_INFLUENCIADORES,
  PARCERIAS_INFLUENCIADORES,
  UFS_INFLUENCIADORES,
  urlPerfilInfluenciador,
  VIEWS_INFLUENCIADORES,
  type Influenciador,
} from "@/lib/mimo-influenciadores";
import {
  excluirInfluenciadorMimo,
  editarInfluenciadorMimo,
  historicoInfluenciadorMimo,
  listarInfluenciadoresMimo,
} from "@/lib/mimo-influenciadores.functions";

export function MimoInfluenciadoresPage() {
  const consulta = useQuery({
    queryKey: ["mimo-influenciadores"],
    queryFn: () => listarInfluenciadoresMimo(),
    refetchInterval: 30000,
  });
  const [busca, setBusca] = useState("");
  const [etapa, setEtapa] = useState("");
  const [categoria, setCategoria] = useState("");
  const [nicho, setNicho] = useState("");
  const [parceria, setParceria] = useState("");
  const [uf, setUf] = useState("");
  const [rede, setRede] = useState("");
  const [views, setViews] = useState("");
  const [faixa, setFaixa] = useState("");
  const [paginaAtual, setPagina] = useState(1);
  const [ordem, setOrdem] = useState("recentes");
  const [selecionado, setSelecionado] = useState<Influenciador | null>(null);
  const todos = consulta.data ?? [];
  const buscaNormalizada = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtrados = todos
    .filter(
      (i) =>
        (!busca ||
          buscaNormalizada(`${i.nome} ${i.perfil} ${i.cidade} ${i.whatsapp}`).includes(
            buscaNormalizada(busca),
          )) &&
        (!etapa || i.etapa === etapa) &&
        (!categoria || categoriaInfluenciador(i.seguidores) === categoria) &&
        (!nicho || i.nicho === nicho) &&
        (!parceria || i.parceria === parceria) &&
        (!uf || i.uf === uf) &&
        (!rede || i.rede === rede) &&
        (!views || i.visualizacoes === views) &&
        (!faixa ||
          (faixa === "Até 5 mil"
            ? i.seguidores <= 5000
            : faixa === "Mais de 5 mil até 20 mil"
              ? i.seguidores > 5000 && i.seguidores <= 20000
              : faixa === "Mais de 20 mil até 50 mil"
                ? i.seguidores > 20000 && i.seguidores <= 50000
                : faixa === "Mais de 50 mil até 100 mil"
                  ? i.seguidores > 50000 && i.seguidores <= 100000
                  : i.seguidores > 100000)),
    )
    .sort((a, b) =>
      ordem === "seguidores"
        ? b.seguidores - a.seguidores
        : ordem === "nome"
          ? a.nome.localeCompare(b.nome)
          : b.created_at.localeCompare(a.created_at),
    );
  const paginas = Math.max(1, Math.ceil(filtrados.length / 25));
  const pagina = Math.min(paginaAtual, paginas);
  const confirmados = todos.filter((i) => i.etapa === "Confirmado");
  function exportar() {
    const url = URL.createObjectURL(
      new Blob([csvInfluenciadores(filtrados)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "influenciadores-mimo.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Influenciadores MiMo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seleção para os lançamentos de novembro de 2026 · Meta: 400 confirmações.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/influenciadores`);
                toast.success("Link do formulário copiado.");
              } catch {
                toast.error("Não foi possível copiar. Abra o formulário e copie o endereço.");
              }
            }}
          >
            Copiar link do formulário
          </Button>
          <Button variant="outline" asChild>
            <a href="/influenciadores" target="_blank" rel="noreferrer">
              Abrir formulário
            </a>
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Inscritos", todos.length],
          ["Pré-selecionados", todos.filter((i) => i.etapa === "Pré-selecionado").length],
          ["Aprovados", todos.filter((i) => i.etapa === "Aprovado").length],
          ["Confirmados", `${confirmados.length} / 400`],
        ].map(([label, valor]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{valor}</p>
          </div>
        ))}
      </div>
      <section
        aria-label="Inscrições por categoria"
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {METAS_INFLUENCIADORES.map((m) => {
          const n = todos.filter(
            (i) => categoriaInfluenciador(i.seguidores) === m.categoria,
          ).length;
          return (
            <div key={m.categoria} className="rounded-xl border bg-card p-4">
              <div className="flex justify-between text-sm">
                <span>{m.categoria}</span>
                <strong>
                  {n} / {m.meta}
                </strong>
              </div>
              <progress
                aria-label={`Meta ${m.categoria}`}
                value={Math.min(n, m.meta)}
                max={m.meta}
                className="mt-3 h-2 w-full accent-primary"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {m.categoria === "Nano"
                  ? "1 mil a menos de 5 mil"
                  : m.categoria === "Micro"
                    ? "5 mil a menos de 30 mil"
                    : "30 mil a 100 mil"}{" "}
                seguidores · inscritos
              </p>
            </div>
          );
        })}
        <div
          role="group"
          aria-label="Inscritos acima de 100 mil"
          className="rounded-xl border bg-card p-4"
        >
          <div className="flex justify-between text-sm">
            <span>Acima de 100 mil</span>
            <strong>{todos.filter((i) => i.seguidores > 100000).length}</strong>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Acima de 100 mil seguidores · inscritos
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Disponíveis para avaliação · sem meta definida
          </p>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        Seguidores e visualizações são autodeclarados. Perfis fora das faixas da meta continuam
        disponíveis para avaliação.
      </p>
      <section
        aria-label="Filtros"
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Input
          aria-label="Buscar influenciadores"
          placeholder="Nome, perfil, cidade ou WhatsApp"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(1);
          }}
        />
        <Filtro label="Etapa" valor={etapa} mudar={setEtapa} opcoes={ETAPAS_INFLUENCIADORES} />
        <Filtro
          label="Categoria"
          valor={categoria}
          mudar={setCategoria}
          opcoes={["Nano", "Micro", "Média", "Abaixo de 1 mil", "Acima de 100 mil"]}
        />
        <Filtro
          label="Faixa de seguidores"
          valor={faixa}
          mudar={setFaixa}
          opcoes={[
            "Até 5 mil",
            "Mais de 5 mil até 20 mil",
            "Mais de 20 mil até 50 mil",
            "Mais de 50 mil até 100 mil",
            "Acima de 100 mil",
          ]}
        />
        <Filtro label="Conteúdo" valor={nicho} mudar={setNicho} opcoes={NICHOS_INFLUENCIADORES} />
        <Filtro
          label="Parceria"
          valor={parceria}
          mudar={setParceria}
          opcoes={PARCERIAS_INFLUENCIADORES}
        />
        <Filtro label="Estado" valor={uf} mudar={setUf} opcoes={UFS_INFLUENCIADORES} />
        <Filtro label="Rede" valor={rede} mudar={setRede} opcoes={["Instagram", "TikTok"]} />
        <Filtro
          label="Visualizações"
          valor={views}
          mudar={setViews}
          opcoes={VIEWS_INFLUENCIADORES}
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
            <option value="seguidores">Mais seguidores</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setBusca("");
            setEtapa("");
            setCategoria("");
            setFaixa("");
            setNicho("");
            setParceria("");
            setUf("");
            setRede("");
            setViews("");
            setPagina(1);
          }}
        >
          Limpar filtros
        </Button>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtrados.length} inscrições encontradas · atualização a cada 30 segundos
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={consulta.isFetching}
            onClick={() => consulta.refetch()}
          >
            Atualizar
          </Button>
          <Button
            variant="outline"
            disabled={!filtrados.length || consulta.isError}
            onClick={exportar}
          >
            Exportar filtrados
          </Button>
        </div>
      </div>
      {consulta.isPending ? (
        <p role="status">Carregando inscrições…</p>
      ) : consulta.isError ? (
        <div role="alert" className="rounded-xl border p-5 text-destructive">
          <p>{consulta.error.message}</p>
          <Button variant="outline" className="mt-3" onClick={() => consulta.refetch()}>
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
                    "Nome e perfil",
                    "Localização",
                    "Alcance declarado",
                    "Conteúdo / parceria",
                    "Etapa",
                    "",
                  ].map((t, n) => (
                    <th key={n} className="whitespace-nowrap p-4 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.slice((pagina - 1) * 25, pagina * 25).map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-4">
                      <p className="font-medium">{i.nome}</p>
                      <a
                        className="text-primary underline"
                        href={urlPerfilInfluenciador(i)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {i.rede} · @{i.perfil}
                      </a>
                    </td>
                    <td className="p-4">
                      {i.cidade} / {i.uf}
                    </td>
                    <td className="p-4">
                      <p>
                        {i.seguidores.toLocaleString("pt-BR")} seguidores ·{" "}
                        {categoriaInfluenciador(i.seguidores)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {i.visualizacoes} visualizações
                      </p>
                    </td>
                    <td className="p-4">
                      <p>{i.nicho}</p>
                      <p className="text-xs text-muted-foreground">{i.parceria}</p>
                    </td>
                    <td className="p-4">{i.etapa}</td>
                    <td className="p-4">
                      <Button variant="outline" onClick={() => setSelecionado(i)}>
                        Avaliar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtrados.length && (
              <p className="p-8 text-center text-muted-foreground">
                {todos.length
                  ? "Nenhuma inscrição corresponde aos filtros."
                  : "As inscrições aparecerão aqui assim que o formulário receber cadastros."}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <Button variant="outline" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
              Anterior
            </Button>
            <span>
              Página {pagina} de {paginas}
            </span>
            <Button
              variant="outline"
              disabled={pagina >= paginas}
              onClick={() => setPagina(pagina + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      {selecionado && (
        <Ficha key={selecionado.id} pessoa={selecionado} fechar={() => setSelecionado(null)} />
      )}
    </div>
  );
}
function Filtro({
  label,
  valor,
  mudar,
  opcoes,
}: {
  label: string;
  valor: string;
  mudar: (v: string) => void;
  opcoes: readonly string[];
}) {
  return (
    <select
      aria-label={label}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={valor}
      onChange={(e) => mudar(e.target.value)}
    >
      <option value="">{label}: todos</option>
      {opcoes.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
function Ficha({ pessoa, fechar }: { pessoa: Influenciador; fechar: () => void }) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState(pessoa.etapa);
  const [notas, setNotas] = useState(pessoa.notas);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const historico = useQuery({
    queryKey: ["mimo-influenciador-historico", pessoa.id],
    queryFn: () => historicoInfluenciadorMimo({ data: pessoa.id }),
  });
  const salvar = useMutation({
    mutationFn: () =>
      editarInfluenciadorMimo({ data: { id: pessoa.id, versao: pessoa.versao, etapa, notas } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mimo-influenciadores"] });
      toast.success("Avaliação salva.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => excluirInfluenciadorMimo({ data: { id: pessoa.id, versao: pessoa.versao } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mimo-influenciadores"] });
      toast.success("Influenciador excluído da lista.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !salvar.isPending && !excluir.isPending) fechar();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pessoa.nome}</DialogTitle>
          <DialogDescription>
            Inscrição recebida em {new Date(pessoa.created_at).toLocaleDateString("pt-BR")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>
            {pessoa.cidade} / {pessoa.uf}
          </p>
          <a
            className="block text-primary underline"
            href={urlPerfilInfluenciador(pessoa)}
            target="_blank"
            rel="noreferrer"
          >
            {pessoa.rede} · @{pessoa.perfil}
          </a>
          <a
            className="block text-primary underline"
            href={`https://wa.me/55${pessoa.whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp: {pessoa.whatsapp}
          </a>
          <p>
            {pessoa.seguidores.toLocaleString("pt-BR")} seguidores · {pessoa.visualizacoes}{" "}
            visualizações
          </p>
          <p>
            {pessoa.nicho} · {pessoa.parceria}
          </p>
          <p className="text-xs text-muted-foreground">
            Aceite para seleção e contato registrado na inscrição.
          </p>
        </div>
        <label className="space-y-2 text-sm">
          Etapa
          <select
            className="mt-2 h-10 w-full rounded-md border bg-background px-3"
            value={etapa}
            onChange={(e) => setEtapa(e.target.value as typeof etapa)}
          >
            {ETAPAS_INFLUENCIADORES.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          Anotações internas
          <textarea
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={5000}
          />
        </label>
        <Button disabled={salvar.isPending || excluir.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : "Salvar avaliação"}
        </Button>
        {confirmaExcluir ? (
          <div
            role="group"
            aria-label="Confirmar exclusão"
            className="space-y-3 rounded-lg border border-destructive/40 p-4"
          >
            <p className="text-sm">
              Excluir este influenciador da lista e dos indicadores? O WhatsApp e o perfil
              continuarão bloqueados para inscrições repetidas.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={excluir.isPending || salvar.isPending}
                onClick={() => excluir.mutate()}
              >
                {excluir.isPending ? "Excluindo…" : "Confirmar exclusão"}
              </Button>
              <Button
                variant="outline"
                disabled={excluir.isPending}
                onClick={() => setConfirmaExcluir(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="text-destructive"
            disabled={salvar.isPending}
            onClick={() => setConfirmaExcluir(true)}
          >
            Excluir da lista
          </Button>
        )}
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Histórico de avaliação</h3>
          {historico.isPending && <p className="text-xs">Carregando histórico…</p>}
          {historico.isError && (
            <p role="alert" className="text-xs text-destructive">
              {historico.error.message}
            </p>
          )}
          {historico.data?.map((h) => (
            <div key={h.id} className="rounded-lg border p-3 text-xs">
              <p>
                {new Date(h.created_at).toLocaleString("pt-BR")} ·{" "}
                {h.acao === "excluido" ? "Excluído da lista" : h.etapa}
              </p>
              {h.notas && (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{h.notas}</p>
              )}
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}

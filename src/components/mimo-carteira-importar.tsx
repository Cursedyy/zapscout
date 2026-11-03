import { lerArquivoCarteira } from "@/lib/mimo-carteira-arquivo";
import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  CAMPOS_IMPORTACAO,
  cabecalhoCarteira,
  mapeamentoInicial,
  prepararBaseCarteira,
  hashCarteira,
  cnpjValido,
  type Mapeamento,
} from "@/lib/mimo-carteira-importacao";
import {
  importarCarteiraMimo,
  importacoesCarteiraMimo,
  resultadosImportacaoCarteiraMimo,
} from "@/lib/mimo-carteira.functions";
import type { UnidadeInput } from "@/lib/mimo-carteira";

export function ImportarCarteira({
  usuario,
  disponivel,
}: {
  usuario: string;
  disponivel: boolean;
}) {
  const importar = useServerFn(importarCarteiraMimo),
    listar = useServerFn(importacoesCarteiraMimo);
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState<{ rows: unknown[][]; hash: string; nome: string } | null>(
    null,
  );
  const [map, setMap] = useState<Mapeamento | null>(null);
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const [edicoes, setEdicoes] = useState<Record<number, Partial<UnidadeInput>>>({});
  const [redes, setRedes] = useState(false),
    [revisado, setRevisado] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [ocupado, setOcupado] = useState(false),
    [iniciada, setIniciada] = useState(false);
  const [lendo, setLendo] = useState(false),
    [erro, setErro] = useState("");
  const [progresso, setProgresso] = useState<{
    processados: number;
    total: number;
    criados: number;
    ignorados: number;
    concluida_em: string | null;
  } | null>(null);
  const pausar = useRef(false);
  useEffect(
    () => () => {
      pausar.current = true;
    },
    [],
  );
  const jobs = useQuery({
    queryKey: ["mimo-carteira-importacoes", usuario],
    queryFn: () => listar(),
  });
  const previa = useMemo(() => {
    if (!arquivo || !map) return { linhas: [], erro: "" };
    try {
      return { linhas: prepararBaseCarteira(arquivo.rows, map), erro: "" };
    } catch (e) {
      return { linhas: [], erro: e instanceof Error ? e.message : "Arquivo inválido." };
    }
  }, [arquivo, map]);
  const linhas = useMemo(() => {
    const vistos = new Set<string>();
    return previa.linhas.map((l) => {
      const unidade = { ...l.unidade, ...edicoes[l.linha] };
      if (redes && l.redeSugerida && edicoes[l.linha]?.rede === undefined && !unidade.rede)
        unidade.rede = l.redeSugerida;
      const problemas = l.problemas.filter((p) => !p.startsWith("CNPJ"));
      if (unidade.cnpj && !cnpjValido(unidade.cnpj)) problemas.push("CNPJ inválido.");
      if (unidade.cnpj && vistos.has(unidade.cnpj)) problemas.push("CNPJ repetido na prévia.");
      if (unidade.cnpj) vistos.add(unidade.cnpj);
      return { ...l, unidade, problemas };
    });
  }, [previa, edicoes, redes]);
  const validas = linhas.filter((l) => !l.problemas.length && !excluidas.has(l.linha));
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / 25));
  async function ler(file?: File) {
    if (!file) return;
    setLendo(true);
    setErro("");
    setArquivo(null);
    setProgresso(null);
    setIniciada(false);
    setRevisado(false);
    setRedes(false);
    setEdicoes({});
    setExcluidas(new Set());
    setPagina(0);
    try {
      const data = await lerArquivoCarteira(file);
      setArquivo({ ...data, nome: file.name });
      setMap(mapeamentoInicial(cabecalhoCarteira(data.rows).nomes));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler.");
    } finally {
      setLendo(false);
    }
  }
  async function executar() {
    if (!arquivo || !revisado || !validas.length || ocupado) return;
    setOcupado(true);
    setIniciada(true);
    pausar.current = false;
    setErro("");
    try {
      const payload = validas.map(({ linha, unidade, contatos, originais }) => ({
        linha,
        unidade,
        contatos,
        originais,
      }));
      const plano_hash = await hashCarteira(new TextEncoder().encode(JSON.stringify(payload)));
      for (let i = 0; i < payload.length; i += 50) {
        if (pausar.current) break;
        const r = await importar({
          data: {
            hash: arquivo.hash,
            plano_hash,
            total: payload.length,
            linhas: payload.slice(i, i + 50),
          },
        });
        setProgresso(r);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mimo-carteira"] }),
        qc.invalidateQueries({ queryKey: ["mimo-carteira-importacoes"] }),
      ]);
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Falha na importação. Você pode retomar a mesma revisão.",
      );
    } finally {
      setOcupado(false);
    }
  }
  const bloqueado = iniciada || ocupado;
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Importar unidades</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Excel: apenas Base Potencial. CSV: uma linha por unidade. Contatos e pedidos históricos
          não serão importados das outras abas.
        </p>
      </div>
      <label className="grid gap-2 text-sm">
        Arquivo Excel ou CSV
        <Input
          type="file"
          accept=".xlsx,.csv"
          disabled={ocupado || lendo}
          onChange={(e) => void ler(e.target.files?.[0])}
        />
      </label>
      {lendo && <p role="status">Lendo o arquivo e preparando a prévia…</p>}
      {(erro || previa.erro) && (
        <p role="alert" className="text-sm text-destructive">
          {erro || previa.erro}
        </p>
      )}
      {arquivo && map && (
        <>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Conferir colunas do arquivo
            </summary>
            <fieldset
              disabled={bloqueado}
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {(Object.keys(CAMPOS_IMPORTACAO) as (keyof Mapeamento)[]).map((k) => (
                <label className="grid gap-1 text-xs" key={k}>
                  {CAMPOS_IMPORTACAO[k]}
                  <select
                    className="rounded border bg-background p-2"
                    value={map[k]}
                    onChange={(e) => {
                      setMap({ ...map, [k]: e.target.value });
                      setRevisado(false);
                      setEdicoes({});
                    }}
                  >
                    <option value="">Não importar esta coluna</option>
                    {cabecalhoCarteira(arquivo.rows)
                      .nomes.filter(Boolean)
                      .map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                  </select>
                </label>
              ))}
            </fieldset>
          </details>
          {map.rede && (
            <p className="text-sm text-muted-foreground">
              Rede lida da coluna “{map.rede}”.
              {map.rede.trim().toLocaleLowerCase("pt-BR") === "franquia" &&
                " Bio Mundo, Fitland, Cia da Saúde e Divina Terra são reconhecidas automaticamente; os demais parceiros ficam sem rede. Você pode ajustar cada rede na prévia."}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              disabled={bloqueado}
              checked={redes}
              onChange={(e) => {
                setRedes(e.target.checked);
                setRevisado(false);
              }}
            />
            Usar sugestões exatas de rede para Bio Mundo, Fitland, Cia da Saúde e Divina Terra.
            Confira os nomes na prévia.
          </label>
          <p className="text-sm">
            {linhas.length} unidades · {validas.length} selecionadas ·{" "}
            {linhas.filter((l) => l.problemas.length).length} precisam de revisão
          </p>
          <div className="max-w-full overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Importar", "Linha / unidade", "CNPJ", "Rede", "Revisão"].map((t) => (
                    <th className="p-3" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.slice(pagina * 25, pagina * 25 + 25).map((l) => (
                  <tr key={l.linha} className="border-t">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Importar linha ${l.linha}`}
                        disabled={bloqueado || !!l.problemas.length}
                        checked={!l.problemas.length && !excluidas.has(l.linha)}
                        onChange={(e) =>
                          setExcluidas((old) => {
                            const s = new Set(old);
                            e.target.checked ? s.delete(l.linha) : s.add(l.linha);
                            return s;
                          })
                        }
                      />
                    </td>
                    <td className="min-w-48 p-3">
                      {l.linha} · {l.unidade.nome}
                      <p className="text-xs text-muted-foreground">
                        {l.unidade.cidade}/{l.unidade.uf} · {l.contatos.length} contatos ·{" "}
                        {l.unidade.classe || "Sem classe"}
                      </p>
                    </td>
                    <td className="p-3">
                      <Input
                        className="min-w-40"
                        aria-label={`CNPJ linha ${l.linha}`}
                        disabled={bloqueado}
                        value={l.unidade.cnpj}
                        onChange={(e) => {
                          setEdicoes((o) => ({
                            ...o,
                            [l.linha]: { ...o[l.linha], cnpj: e.target.value.replace(/\D/g, "") },
                          }));
                          setRevisado(false);
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        className="min-w-40"
                        aria-label={`Rede linha ${l.linha}`}
                        disabled={bloqueado}
                        value={l.unidade.rede}
                        onChange={(e) => {
                          setEdicoes((o) => ({
                            ...o,
                            [l.linha]: { ...o[l.linha], rede: e.target.value },
                          }));
                          setRevisado(false);
                        }}
                      />
                    </td>
                    <td className="min-w-48 p-3 text-xs">
                      {l.problemas.join(" ") || "Pronta para importar"}
                      <details className="mt-1">
                        <summary className="cursor-pointer">Dados originais</summary>
                        {Object.entries(l.originais).map(([k, v]) => (
                          <p key={k}>
                            {k}: {v || "—"}
                          </p>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="text-sm">
              {pagina + 1}/{totalPaginas}
            </span>
            <Button
              variant="outline"
              disabled={pagina + 1 >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              disabled={bloqueado}
              checked={revisado}
              onChange={(e) => setRevisado(e.target.checked)}
            />
            Conferi colunas, redes e unidades selecionadas. Registros existentes serão preservados e
            sinalizados, sem sobrescrever dados.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                !disponivel || !revisado || !validas.length || ocupado || !!progresso?.concluida_em
              }
              onClick={() => void executar()}
            >
              {ocupado
                ? "Importando…"
                : iniciada
                  ? "Retomar importação"
                  : `Importar ${validas.length} unidades`}
            </Button>
            {ocupado && (
              <Button
                variant="outline"
                onClick={() => {
                  pausar.current = true;
                }}
              >
                Pausar após este lote
              </Button>
            )}
          </div>
          {!disponivel && (
            <p className="text-sm text-muted-foreground">
              A prévia está disponível. A gravação aguarda a liberação do banco.
            </p>
          )}
          {progresso && (
            <div role="status" className="rounded-lg border p-4">
              <progress
                className="w-full accent-primary"
                value={progresso.processados}
                max={progresso.total}
              />
              <p className="text-sm">
                {progresso.processados}/{progresso.total} processadas · {progresso.criados} criadas
                · {progresso.ignorados} existentes para revisão{" "}
                {progresso.concluida_em ? "· Concluído" : ""}
              </p>
            </div>
          )}
        </>
      )}
      <div className="border-t pt-4">
        <h3 className="font-medium">Importações recentes</h3>
        {jobs.isPending ? (
          <p role="status">Carregando importações…</p>
        ) : jobs.isError ? (
          <p role="alert">Não foi possível carregar as importações.</p>
        ) : (
          jobs.data?.map((j) => (
            <div key={j.id}>
              <p className="py-2 text-sm">
                {new Date(j.created_at).toLocaleString("pt-BR")} · {j.processados}/{j.total} ·{" "}
                {j.criados} criadas · {j.ignorados} existentes ·{" "}
                {j.concluida_em ? "Concluída" : "Pode ser retomada com o mesmo arquivo e revisão"}
              </p>
              <ResultadoImportacao id={j.id} usuario={usuario} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ResultadoImportacao({ id, usuario }: { id: string; usuario: string }) {
  const [aberto, setAberto] = useState(false),
    [pagina, setPagina] = useState(0);
  const listar = useServerFn(resultadosImportacaoCarteiraMimo);
  const q = useQuery({
    queryKey: ["mimo-carteira-importacao-resultado", usuario, id, pagina],
    queryFn: () => listar({ data: { id, pagina } }),
    enabled: aberto,
  });
  return (
    <details
      onToggle={(e) => setAberto(e.currentTarget.open)}
      className="mb-3 rounded border p-3 text-sm"
    >
      <summary className="cursor-pointer">Conferir linhas processadas e conflitos</summary>
      {q.isFetching && <p role="status">Carregando resultado…</p>}
      {q.isError && <p role="alert">Não foi possível carregar o resultado.</p>}
      {q.data?.linhas.map((l) => (
        <p key={l.linha} className="mt-2">
          Linha {l.linha} · {l.nome} ·{" "}
          {l.resultado === "criado"
            ? "Criada"
            : "Unidade já existente: dados preservados; revisar vínculo"}
        </p>
      ))}
      {q.data && q.data.total > 30 && (
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            disabled={pagina === 0 || q.isFetching}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={(pagina + 1) * 30 >= q.data.total || q.isFetching}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </details>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarCampanhasMimo, salvarCampanhaMimo } from "@/lib/mimo-campanhas.functions";
import { campanhaMimoSchema, situacaoCampanha, type CampanhaMimoInput } from "@/lib/mimo-campanhas";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";

const chave = ["mimo-campanhas-comerciais"];
const hojeLocal = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dia = (s: string) => s.split("-").reverse().join("/");
const nova = (): CampanhaMimoInput => ({
  nome: "",
  inicio: hojeLocal(),
  fim: hojeLocal(),
  produtos: "",
  condicoes: "",
  status: "rascunho",
});

export function MimoCampanhasPage() {
  const listar = useServerFn(listarCampanhasMimo),
    salvar = useServerFn(salvarCampanhaMimo);
  const client = useQueryClient();
  const consulta = useQuery({ queryKey: chave, queryFn: () => listar() });
  const [edicao, setEdicao] = useState<CampanhaMimoInput | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("atuais");
  const gravar = useMutation({
    mutationFn: (data: CampanhaMimoInput) => salvar({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: chave });
      setFiltro("todas");
      setEdicao(null);
      setErro("");
    },
    onError: (e) => setErro(e.message),
  });
  const hoje = hojeLocal();
  const campanhas = (consulta.data?.campanhas ?? []).filter(
    (c) =>
      filtro === "todas" ||
      (filtro === "rascunhos"
        ? c.status === "rascunho"
        : c.status === "publicada" && c.fim >= hoje),
  );
  const mudar = (campo: keyof CampanhaMimoInput, valor: string) =>
    setEdicao((atual) => (atual ? { ...atual, [campo]: valor } : null));
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Campanhas de vendas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Consulte as promoções, os produtos e as condições comerciais da MiMo.
          </p>
        </div>
        {consulta.data?.podeGerenciar && !edicao && (
          <Button
            onClick={() => {
              setEdicao(nova());
              setErro("");
            }}
          >
            Nova campanha
          </Button>
        )}
      </header>
      {consulta.isPending && <p role="status">Carregando campanhas…</p>}
      {consulta.isError && (
        <div role="alert">
          <p>{consulta.error.message}</p>
          <Button variant="outline" onClick={() => void consulta.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {edicao && (
        <form
          className="space-y-4 rounded-xl border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const r = campanhaMimoSchema.safeParse(edicao);
            if (!r.success) {
              setErro(r.error.issues.map((i) => i.message).join(" "));
              return;
            }
            setErro("");
            gravar.mutate(r.data);
          }}
        >
          <h2 className="text-lg font-semibold">
            {edicao.id ? "Editar campanha" : "Nova campanha"}
          </h2>
          <fieldset disabled={gravar.isPending} className="space-y-4">
            <label className="grid gap-2 text-sm">
              Nome da campanha
              <Input
                required
                minLength={3}
                maxLength={200}
                value={edicao.nome}
                onChange={(e) => mudar("nome", e.target.value)}
                placeholder="Ex.: Promoção de novembro"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Início
                <Input
                  type="date"
                  required
                  value={edicao.inicio}
                  onChange={(e) => mudar("inicio", e.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Término
                <Input
                  type="date"
                  required
                  min={edicao.inicio}
                  value={edicao.fim}
                  onChange={(e) => mudar("fim", e.target.value)}
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm">
              Produtos participantes
              <Textarea
                rows={5}
                maxLength={10000}
                value={edicao.produtos}
                onChange={(e) => mudar("produtos", e.target.value)}
                placeholder="Liste os produtos, kits e quantidades da promoção."
              />
            </label>
            <label className="grid gap-2 text-sm">
              Preços e condições promocionais
              <Textarea
                rows={6}
                maxLength={10000}
                value={edicao.condicoes}
                onChange={(e) => mudar("condicoes", e.target.value)}
                placeholder="Informe preços, descontos, pedido mínimo, pagamento, frete e restrições."
              />
            </label>
            <label className="grid gap-2 text-sm">
              Disponibilidade
              <select
                className="rounded-md border bg-background p-2"
                value={edicao.status}
                onChange={(e) => mudar("status", e.target.value)}
              >
                <option value="rascunho">Rascunho — visível à gestão e ao marketing</option>
                <option value="publicada">Publicada — disponível à equipe</option>
                <option value="arquivada">Arquivada — guardar no histórico</option>
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              A campanha publicada aparece para a equipe. A vigência indica se está programada, em
              vigor ou encerrada.
            </p>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit">{gravar.isPending ? "Salvando…" : "Salvar campanha"}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEdicao(null);
                  setErro("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {consulta.data && (
        <>
          <label className="flex flex-wrap items-center gap-3 text-sm">
            Mostrar
            <select
              className="rounded-md border bg-background p-2"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            >
              <option value="atuais">Em vigor e programadas</option>
              <option value="todas">Todas as campanhas</option>
              {consulta.data.podeGerenciar && <option value="rascunhos">Rascunhos</option>}
            </select>
          </label>
          {!campanhas.length && (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              Nenhuma campanha neste filtro.
              {consulta.data.podeGerenciar
                ? " Use Nova campanha para cadastrar a promoção do mês."
                : " As promoções publicadas pela gestão aparecerão aqui."}
            </div>
          )}
          <div className="grid gap-5">
            {campanhas.map((c) => (
              <article key={c.id} className="space-y-4 rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge variant="outline">{situacaoCampanha(c, hoje)}</Badge>
                    <h2 className="mt-2 text-xl font-semibold">{c.nome}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dia(c.inicio)} a {dia(c.fim)}
                    </p>
                  </div>
                  {consulta.data.podeGerenciar && (
                    <Button
                      variant="outline"
                      disabled={gravar.isPending}
                      onClick={() => {
                        setEdicao(c);
                        setErro("");
                      }}
                    >
                      Editar
                    </Button>
                  )}
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <section>
                    <h3 className="font-medium">Produtos participantes</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {c.produtos || "Ainda não informado."}
                    </p>
                  </section>
                  <section>
                    <h3 className="font-medium">Preços e condições</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {c.condicoes || "Ainda não informado."}
                    </p>
                  </section>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

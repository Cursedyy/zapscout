import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Save, Ban, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  anularInvestimentoCodigoMimo,
  lancarInvestimentoCodigoMimo,
  preencherHistoricoCodigosMimo,
  salvarCodigoCampanhaMimo,
} from "@/lib/mimo-campanhas-codigos.functions";
import { codigosCampanhaOptions } from "@/lib/mimo-campanhas-codigos.queries";
import {
  analisarIdsMeta,
  codigoCampanhaSchema,
  investimentoManualSchema,
  reaisParaCentavos,
  type CodigoCampanhaInput,
  type InvestimentoManualInput,
} from "@/lib/mimo-campanhas-codigos";
import type { listarCodigosCampanhaMimo } from "@/lib/mimo-campanhas-codigos.functions";
import { atualizarConsultasMimo } from "@/lib/mimo-cache";

type Codigo = Awaited<ReturnType<typeof listarCodigosCampanhaMimo>>["codigos"][number];
const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (v: string) => v.split("-").reverse().join("/");
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Cadastro de códigos de campanha (centro de custo) e investimento manual por código. */
export function MimoCodigosCampanha() {
  const q = useQuery(codigosCampanhaOptions);
  const [editando, setEditando] = useState<Codigo | "novo" | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);
  const client = useQueryClient();
  const preencher = useServerFn(preencherHistoricoCodigosMimo);
  const historico = useMutation({
    mutationFn: () => preencher(),
    onSuccess: (r) => {
      toast.success(`${r.leads} lead(s) antigo(s) receberam código pelo anúncio Meta exato.`);
      void atualizarConsultasMimo(client);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível aplicar."),
  });

  if (q.isPending)
    return (
      <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando códigos de campanha…
      </p>
    );
  if (q.isError)
    return (
      <p role="alert" className="mt-10 text-sm text-destructive">
        Não foi possível carregar os códigos de campanha.
      </p>
    );
  const d = q.data;
  if (!d.podeGerir) return null;

  return (
    <section aria-labelledby="codigos-titulo" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="codigos-titulo" className="text-lg font-semibold">
            Códigos de campanha (centro de custo)
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada ação de marketing recebe um código. O lead guarda o código (escolhido no cadastro
            ou capturado pelo anúncio Meta exato) e os pedidos herdam do lead. Investimento =
            campanhas Meta vinculadas pelo ID + lançamentos manuais.
          </p>
        </div>
        {d.disponivel && (
          <div className="flex flex-wrap gap-2">
            {d.podePreencherHistorico && (
              <Button
                variant="outline"
                disabled={historico.isPending}
                onClick={() => historico.mutate()}
              >
                {historico.isPending ? <Loader2 className="animate-spin" /> : <History />}Aplicar
                aos leads antigos
              </Button>
            )}
            <Button onClick={() => setEditando("novo")}>
              <Plus />
              Novo código
            </Button>
          </div>
        )}
      </div>

      {!d.disponivel ? (
        <p className="mt-4 border-y border-border py-5 text-sm text-muted-foreground">
          O cadastro de códigos ainda não foi ativado no banco (migração preparada pendente). Nenhum
          dado foi alterado.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto border-y border-border">
            <Table aria-label="Códigos de campanha">
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Campanhas Meta (ID)</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.codigos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.codigo}</TableCell>
                    <TableCell>
                      {c.nome}
                      {c.descricao && (
                        <span className="block text-xs text-muted-foreground">{c.descricao}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.ativo ? (
                        <Badge variant="secondary">Ativo</Badge>
                      ) : (
                        <Badge variant="outline">Arquivado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs break-words font-mono text-xs">
                      {c.campanhasMeta.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditando(c)}
                        aria-label={`Editar ${c.codigo}`}
                      >
                        <Pencil />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!d.codigos.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhum código cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <InvestimentoManual codigos={d.codigos} />

          <h3 className="mt-6 font-medium">Investimentos manuais</h3>
          <div className="mt-2 overflow-x-auto border-y border-border">
            <Table aria-label="Investimentos manuais">
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.investimentos.map((i) => (
                  <TableRow
                    key={i.id}
                    className={i.anulado_em ? "text-muted-foreground" : undefined}
                  >
                    <TableCell className="whitespace-nowrap">{dia(i.competencia)}</TableCell>
                    <TableCell className="font-mono">
                      {d.codigos.find((c) => c.id === i.codigo_id)?.codigo ?? "—"}
                    </TableCell>
                    <TableCell>
                      {i.descricao}
                      {i.anulado_em && (
                        <span className="block text-xs">Anulado: {i.motivo_anulacao}</span>
                      )}
                    </TableCell>
                    <TableCell className={i.anulado_em ? "line-through" : undefined}>
                      {brl(i.valor_centavos)}
                    </TableCell>
                    <TableCell>
                      {!i.anulado_em && (
                        <Button variant="ghost" size="sm" onClick={() => setAnulando(i.id)}>
                          <Ban />
                          Anular
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!d.investimentos.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhum investimento manual lançado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Lançamentos não são editados nem apagados: para corrigir, anule com motivo e lance de
            novo. Tudo fica no histórico do código.
          </p>
        </>
      )}

      {editando && (
        <EditorCodigo
          codigo={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
      {anulando && <AnularInvestimento id={anulando} onClose={() => setAnulando(null)} />}
    </section>
  );
}

function EditorCodigo({ codigo, onClose }: { codigo: Codigo | null; onClose: () => void }) {
  const client = useQueryClient();
  const salvar = useServerFn(salvarCodigoCampanhaMimo);
  const [form, setForm] = useState({
    codigo: codigo?.codigo ?? "",
    nome: codigo?.nome ?? "",
    descricao: codigo?.descricao ?? "",
    ativo: codigo?.ativo ?? true,
    ids: codigo?.campanhasMeta.join("\n") ?? "",
  });
  const [erro, setErro] = useState("");
  const mut = useMutation({
    mutationFn: (dados: CodigoCampanhaInput) => salvar({ data: dados }),
    onSuccess: () => {
      toast.success("Código salvo.");
      void atualizarConsultasMimo(client);
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const ids = analisarIdsMeta(form.ids);
    if (ids.invalidos.length)
      return setErro(
        `IDs de campanha Meta inválidos: ${ids.invalidos.slice(0, 5).join(", ")}. Use apenas números.`,
      );
    const v = codigoCampanhaSchema.safeParse({
      id: codigo?.id ?? null,
      versao: codigo?.versao ?? null,
      codigo: form.codigo,
      nome: form.nome,
      descricao: form.descricao,
      ativo: form.ativo,
      campanhasMeta: ids.ids,
    });
    if (!v.success) return setErro(v.error.issues[0]?.message ?? "Confira os campos.");
    mut.mutate(v.data);
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !mut.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {codigo ? `Editar ${codigo.codigo}` : "Novo código de campanha"}
          </DialogTitle>
          <DialogDescription>
            O código não muda depois de criado. Arquive quando a ação terminar.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={enviar}>
          <fieldset disabled={mut.isPending} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cod-codigo">Código *</Label>
              <Input
                id="cod-codigo"
                value={form.codigo}
                disabled={!!codigo}
                maxLength={40}
                placeholder="EX: META-BLACKFRIDAY-26"
                className="font-mono uppercase"
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cod-nome">Nome *</Label>
              <Input
                id="cod-nome"
                value={form.nome}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cod-desc">Descrição</Label>
              <Textarea
                id="cod-desc"
                value={form.descricao}
                maxLength={1000}
                rows={2}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cod-ids">IDs de campanha Meta</Label>
              <Textarea
                id="cod-ids"
                value={form.ids}
                rows={3}
                className="font-mono text-xs"
                placeholder="Um ID por linha (coluna “ID da campanha” do Gerenciador de Anúncios)"
                onChange={(e) => setForm((f) => ({ ...f, ids: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Cada campanha Meta pertence a um único código. Nomes não são usados para vincular.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="cod-ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
              />
              <Label htmlFor="cod-ativo">Ativo (disponível para novos leads)</Label>
            </div>
          </fieldset>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="animate-spin" /> : <Save />}Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvestimentoManual({ codigos }: { codigos: Codigo[] }) {
  const client = useQueryClient();
  const lancar = useServerFn(lancarInvestimentoCodigoMimo);
  const [form, setForm] = useState({ codigoId: "", competencia: hoje(), valor: "", descricao: "" });
  const [erro, setErro] = useState("");
  const mut = useMutation({
    mutationFn: (dados: InvestimentoManualInput) => lancar({ data: dados }),
    onSuccess: () => {
      toast.success("Investimento lançado.");
      setForm((f) => ({ ...f, valor: "", descricao: "" }));
      void atualizarConsultasMimo(client);
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Não foi possível lançar."),
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const valorCentavos = reaisParaCentavos(form.valor);
    if (valorCentavos === null) return setErro("Informe o valor em reais, por exemplo 1.250,00.");
    const v = investimentoManualSchema.safeParse({
      codigoId: form.codigoId,
      competencia: form.competencia,
      valorCentavos,
      descricao: form.descricao,
    });
    if (!v.success)
      return setErro(
        form.codigoId ? (v.error.issues[0]?.message ?? "Confira os campos.") : "Escolha o código.",
      );
    if (v.data.competencia > hoje()) return setErro("A competência não pode estar no futuro.");
    mut.mutate(v.data);
  }
  const ativos = codigos.filter((c) => c.ativo);
  return (
    <form
      onSubmit={enviar}
      className="mt-6 rounded-xl border border-border p-4"
      aria-labelledby="inv-titulo"
    >
      <h3 id="inv-titulo" className="font-medium">
        Lançar investimento manual
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Para ações fora do Meta (influenciador, evento, material, outra mídia). Conta no período da
        competência.
      </p>
      <fieldset
        disabled={mut.isPending || !ativos.length}
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="grid gap-1.5 text-sm">
          <span>Código *</span>
          <Select
            value={form.codigoId || "__vazio"}
            onValueChange={(v) => setForm((f) => ({ ...f, codigoId: v === "__vazio" ? "" : v }))}
          >
            <SelectTrigger aria-label="Código">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__vazio">Escolha o código</SelectItem>
              {ativos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} · {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-comp">Competência *</Label>
          <Input
            id="inv-comp"
            type="date"
            max={hoje()}
            value={form.competencia}
            onChange={(e) => setForm((f) => ({ ...f, competencia: e.target.value }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-valor">Valor (R$) *</Label>
          <Input
            id="inv-valor"
            inputMode="decimal"
            placeholder="0,00"
            value={form.valor}
            onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-desc">Descrição *</Label>
          <Input
            id="inv-desc"
            maxLength={300}
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
          />
        </div>
      </fieldset>
      {!ativos.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Cadastre um código ativo para lançar investimentos.
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button type="submit" disabled={mut.isPending || !ativos.length}>
          {mut.isPending ? <Loader2 className="animate-spin" /> : <Plus />}Lançar
        </Button>
      </div>
    </form>
  );
}

function AnularInvestimento({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient();
  const anular = useServerFn(anularInvestimentoCodigoMimo);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const mut = useMutation({
    mutationFn: () => anular({ data: { id, motivo } }),
    onSuccess: () => {
      toast.success("Investimento anulado.");
      void atualizarConsultasMimo(client);
      onClose();
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Não foi possível anular."),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !mut.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anular investimento</DialogTitle>
          <DialogDescription>
            O lançamento continua no histórico, mas deixa de contar no retorno.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErro("");
            if (motivo.trim().length < 2) return setErro("Informe o motivo.");
            mut.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="anular-motivo">Motivo *</Label>
            <Input
              id="anular-motivo"
              maxLength={300}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="animate-spin" /> : <Ban />}Anular
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

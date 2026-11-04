import { useState } from "react";
import { buscarClientesPricing } from "@/lib/mimo-pricing.functions";
import { CANAIS, politicaSchema, linhaSchema, type Politica, type Linha } from "@/lib/mimo-pricing";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { toast } from "sonner";

export function ClientePricing({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null, uf?: string) => void;
}) {
  const [busca, setBusca] = useState(""),
    [clientes, setClientes] = useState<{ id: string; nome: string; uf: string }[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <label>
        Buscar cliente/unidade da Carteira
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome do cliente"
        />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setClientes(await buscarClientesPricing({ data: busca }));
          } catch (e) {
            toast.error(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Buscar clientes
      </Button>
      <select
        aria-label="Cliente vinculado"
        className="w-full rounded border bg-card p-2"
        value={value ?? ""}
        onChange={(e) => {
          const c = clientes.find((c) => c.id === e.target.value);
          onChange(e.target.value || null, c?.uf);
        }}
      >
        <option value="">Sem cliente vinculado</option>
        {value && !clientes.some((c) => c.id === value) && (
          <option value={value}>Cliente vinculado · {value}</option>
        )}
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} · {c.uf}
          </option>
        ))}
      </select>
    </div>
  );
}
const politicaVazia: Politica = {
  canal: "Venda Direta",
  uf: "",
  cliente: null,
  impostos: null,
  fixas: null,
  meta: null,
  varejista: null,
  distribuidor: null,
};
export function PoliticasPricing({
  value,
  onChange,
}: {
  value: Politica[];
  onChange: (p: Politica[]) => void;
}) {
  const [p, setP] = useState<Politica>(politicaVazia);
  return (
    <details className="rounded-xl border p-4">
      <summary>Políticas por canal, UF e cliente</summary>
      <p className="my-3 text-sm">
        Precedência: padrão do canal, exceção por UF, cliente/canal/UF. Campo vazio herda; zero
        explícito substitui. Alíquotas são parâmetros informados pela gestão.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label>
          Canal
          <select
            className="block rounded border bg-card p-2"
            value={p.canal}
            onChange={(e) => setP({ ...p, canal: e.target.value as Politica["canal"] })}
          >
            {CANAIS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          UF (vazio = padrão)
          <Input
            maxLength={2}
            value={p.uf}
            onChange={(e) => setP({ ...p, uf: e.target.value.toUpperCase() })}
          />
        </label>
        <ClientePricing
          value={p.cliente}
          onChange={(cliente, uf) => setP({ ...p, cliente, uf: uf ?? p.uf })}
        />
        {(["impostos", "fixas", "meta"] as const).map((k) => (
          <label key={k}>
            {
              {
                impostos: "Impostos (fração)",
                fixas: "Rateio fixo (fração)",
                meta: "Meta de contribuição (fração)",
              }[k]
            }
            <Input
              value={p[k] ?? ""}
              placeholder="Herdar"
              onChange={(e) => setP({ ...p, [k]: e.target.value || null })}
            />
          </label>
        ))}
        {(["distribuidor", "varejista"] as const).map((k) => (
          <label key={k}>
            {k}
            <select
              className="block rounded border bg-card p-2"
              value={p[k]?.modo ?? ""}
              onChange={(e) =>
                setP({
                  ...p,
                  [k]: e.target.value ? { modo: e.target.value, taxa: p[k]?.taxa ?? "0" } : null,
                })
              }
            >
              <option value="">Herdar</option>
              <option value="margem">Margem</option>
              <option value="markup">Markup</option>
            </select>
            {p[k] && (
              <Input
                aria-label={`Taxa política ${k}`}
                value={p[k]!.taxa}
                onChange={(e) => setP({ ...p, [k]: { ...p[k]!, taxa: e.target.value } })}
              />
            )}
          </label>
        ))}
      </div>
      <Button
        className="my-3"
        onClick={() => {
          const r = politicaSchema.safeParse(p);
          if (!r.success) {
            toast.error("Revise UF e taxas da política.");
            return;
          }
          const key = (a: Politica) =>
            a.canal === p.canal && a.uf === p.uf && a.cliente === p.cliente;
          onChange([...value.filter((a) => !key(a)), r.data]);
          toast.success("Política aplicada ao estudo. Salve para persistir.");
        }}
      >
        Aplicar política ao estudo
      </Button>
      {value.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-3 border-t py-3">
          <span>
            {a.canal} · {a.uf || "Todas as UFs"} ·{" "}
            {a.cliente ? "Cliente específico" : "Padrão do canal"} · impostos{" "}
            {a.impostos ?? "herdar"} · rateio {a.fixas ?? "herdar"} · meta {a.meta ?? "herdar"}
          </span>
          <Button variant="outline" onClick={() => setP(a)}>
            Editar
          </Button>
          <Button variant="outline" onClick={() => onChange(value.filter((_, j) => i !== j))}>
            Remover
          </Button>
        </div>
      ))}
    </details>
  );
}
export function NovoSkuPricing({
  template,
  onAdd,
}: {
  template: Linha;
  onAdd: (l: Linha) => void;
}) {
  const [codigo, setCodigo] = useState(""),
    [produto, setProduto] = useState(""),
    [canal, setCanal] = useState<Linha["canal"]>("Venda Direta");
  return (
    <details className="rounded-xl border p-4">
      <summary>Cadastrar SKU/canal</summary>
      <div className="my-3 grid gap-3 md:grid-cols-3">
        <label>
          Código
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </label>
        <label>
          Produto
          <Input value={produto} onChange={(e) => setProduto(e.target.value)} />
        </label>
        <label>
          Canal
          <select
            className="block rounded border bg-card p-2"
            value={canal}
            onChange={(e) => setCanal(e.target.value as Linha["canal"])}
          >
            {CANAIS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="my-2 text-sm">
        Custos e preços ficarão pendentes. Políticas serão herdadas do canal quando cadastradas.
      </p>
      <Button
        onClick={() => {
          try {
            const l = linhaSchema.parse({
              ...template,
              codigo,
              produto,
              canal,
              custo: null,
              preco: null,
              sugerido: null,
              impostos: null,
              despesas: [],
              quantidade: null,
              bonus: "0",
              desconto: "0",
              fixas: null,
              meta: null,
              varejista: null,
              distribuidor: null,
            });
            onAdd(l);
            setCodigo("");
            setProduto("");
          } catch (e) {
            toast.error(String(e));
          }
        }}
      >
        Adicionar ao estudo
      </Button>
    </details>
  );
}

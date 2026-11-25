import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmarCfopMimo,
  consultarOmieMimo,
  prepararCfopMimo,
  statusOmieMimo,
} from "@/lib/mimo-omie.functions";
import { codigoOmieSchema, mudancasCfopSchema, type PreviaCfop } from "@/lib/mimo-omie";

type Consulta = Awaited<ReturnType<typeof consultarOmieMimo>>;
export function MimoOmiePage() {
  const statusFn = useServerFn(statusOmieMimo),
    consultar = useServerFn(consultarOmieMimo);
  const preparar = useServerFn(prepararCfopMimo),
    confirmar = useServerFn(confirmarCfopMimo);
  const status = useQuery({
    queryKey: ["mimo-omie-status"],
    queryFn: () => statusFn(),
    retry: false,
  });
  const [codigo, setCodigo] = useState("");
  const [pedido, setPedido] = useState<Consulta | null>(null);
  const [cfops, setCfops] = useState<Record<number, string>>({});
  const [previa, setPrevia] = useState<PreviaCfop | null>(null);
  const [aceite, setAceite] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  async function executar(fn: () => Promise<void>) {
    setOcupado(true);
    setErro("");
    setSucesso("");
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <section className="space-y-5 p-4 sm:p-6" aria-labelledby="omie-titulo">
      <header>
        <h1 id="omie-titulo" className="text-2xl font-semibold">
          OMIE · Prévia de CFOP
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confira a troca de CFOP dos itens de um pedido. Informe somente códigos validados pela
          contabilidade.
        </p>
      </header>
      <p role="status" className="rounded-lg border bg-card p-4 text-sm">
        {status.isPending ? "Verificando configuração…" : status.data?.mensagem}
      </p>
      {status.isError && (
        <div role="alert">
          <p>Não foi possível verificar o acesso à integração.</p>
          <Button variant="outline" onClick={() => void status.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {status.data?.disponivel && (
        <>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setPedido(null);
              setPrevia(null);
              setCfops({});
              setAceite(false);
              void executar(async () => {
                const id = codigoOmieSchema.safeParse(Number(codigo));
                if (!id.success) throw Error("Informe o código interno numérico do pedido OMIE.");
                setPedido(await consultar({ data: { pedidoId: id.data } }));
              });
            }}
          >
            <label className="grid gap-1 text-sm">
              Código interno do pedido OMIE
              <Input
                value={codigo}
                inputMode="numeric"
                disabled={ocupado}
                onChange={(e) => {
                  setCodigo(e.target.value);
                  setPedido(null);
                  setPrevia(null);
                  setAceite(false);
                  setSucesso("");
                }}
              />
            </label>
            <Button disabled={ocupado || !codigo.trim()}>Consultar pedido</Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Use o identificador interno da API OMIE, que pode ser diferente do número exibido no
            pedido.
          </p>
          {pedido && (
            <div className="space-y-4 rounded-lg border p-4">
              <h2 className="font-semibold">Pedido {pedido.numero || pedido.pedidoId}</h2>
              {!pedido.editavel && (
                <p role="alert">
                  Este pedido já foi faturado ou cancelado. A simulação está indisponível.
                </p>
              )}
              <p className="text-sm">
                Preencha apenas os itens que deseja alterar. Os demais dados permanecem na cópia
                consultada.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">CFOP atual</th>
                      <th scope="col">Novo CFOP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.itens.map((item) => (
                      <tr key={item.itemId} className="border-t">
                        <td className="p-2">
                          {item.descricao} · {item.itemId}
                        </td>
                        <td className="p-2">{item.cfop}</td>
                        <td className="p-2">
                          <Input
                            aria-label={`Novo CFOP do item ${item.itemId}`}
                            placeholder="Ex.: 5.102"
                            value={cfops[item.itemId] ?? ""}
                            disabled={ocupado || !pedido.editavel}
                            onChange={(e) => {
                              setCfops({ ...cfops, [item.itemId]: e.target.value });
                              setPrevia(null);
                              setAceite(false);
                              setSucesso("");
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!pedido.itens.length && <p>Nenhum item disponível.</p>}
              <Button
                variant="outline"
                disabled={
                  ocupado || !pedido.editavel || !Object.values(cfops).some((v) => v.trim())
                }
                onClick={() => {
                  setPrevia(null);
                  setAceite(false);
                  void executar(async () => {
                    const mudancas = mudancasCfopSchema.safeParse(
                      Object.entries(cfops)
                        .filter(([, v]) => v.trim())
                        .map(([itemId, cfop]) => ({ itemId: Number(itemId), cfop })),
                    );
                    if (!mudancas.success)
                      throw Error("Informe quatro dígitos para cada CFOP selecionado.");
                    setPrevia(
                      await preparar({
                        data: {
                          pedidoId: pedido.pedidoId,
                          versao: pedido.versao,
                          mudancas: mudancas.data,
                        },
                      }),
                    );
                  });
                }}
              >
                Gerar prévia
              </Button>
            </div>
          )}
          {previa && (
            <section
              aria-label="Prévia da alteração"
              className="space-y-3 rounded-lg border bg-card p-4"
            >
              <h2 className="font-semibold">Confira antes de confirmar</h2>
              <ul>
                {previa.mudancas.map((i) => (
                  <li key={i.itemId}>
                    Item {i.itemId}: {i.anterior} → {i.novo}
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                Apenas o CFOP muda na simulação. ICMS e os demais campos fiscais e comerciais são
                preservados na cópia. Isso não valida o processamento tributário do OMIE.
              </p>
              <p className="text-xs text-muted-foreground">
                Válida até {new Date(previa.expiraEm).toLocaleTimeString("pt-BR")}.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={aceite}
                  disabled={ocupado}
                  onChange={(e) => setAceite(e.target.checked)}
                />
                Conferi os códigos com a contabilidade e entendo que esta confirmação registra
                somente uma simulação.
              </label>
              <Button
                disabled={ocupado || !aceite}
                onClick={() =>
                  void executar(async () => {
                    await confirmar({ data: { previaId: previa.id, confirmar: true } });
                    setPrevia(null);
                    setAceite(false);
                    setSucesso(
                      "Simulação registrada na auditoria. Nenhum pedido foi alterado no OMIE.",
                    );
                  })
                }
              >
                Confirmar simulação
              </Button>
            </section>
          )}
        </>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {sucesso && (
        <p role="status" className="text-sm">
          {sucesso}
        </p>
      )}
    </section>
  );
}

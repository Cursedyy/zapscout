import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PedidoSalvo } from "@/lib/mimo-pedido";
import {
  listarReferenciasFaturamentoOmieMimo,
  testarFaturamentoOmieMimo,
} from "@/lib/mimo-omie-faturamento.functions";

export function MimoOmieFaturamentoTeste({ pedido, data }: { pedido: PedidoSalvo; data: string }) {
  const listar = useServerFn(listarReferenciasFaturamentoOmieMimo);
  const testar = useServerFn(testarFaturamentoOmieMimo);
  const compativel = pedido.documento.itens.length === 1 && !pedido.documento.itens[0]?.brinde;
  const referencias = useQuery({
    queryKey: ["omie-faturamento-referencias", pedido.empresa_id],
    queryFn: () => listar(),
    enabled: compativel,
    retry: false,
  });
  const [referencia, setReferencia] = useState("");
  const [produto, setProduto] = useState("");
  const produtos = referencias.data?.find((r) => String(r.id) === referencia)?.produtos ?? [];
  const produtoSelecionado = produtos.length === 1 ? String(produtos[0]?.codigo) : produto;
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<{ mensagem: string; erro: boolean }>();
  if (!compativel)
    return (
      <p role="status">
        Para este teste, abra um pedido de demonstração confirmado com um produto e sem brinde.
      </p>
    );
  if (referencias.isPending) return <p role="status">Buscando pedidos no Omie de teste…</p>;
  if (referencias.isError)
    return (
      <div role="alert">
        <p>{referencias.error.message}</p>
        <Button variant="outline" onClick={() => void referencias.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!referencias.data?.length)
    return (
      <p role="status">
        O Omie de teste não retornou pedidos com produtos. Salve um Pedido de Venda de demonstração
        no Omie e reabra esta janela.
      </p>
    );
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (ocupado || !referencia || !produtoSelecionado) return;
        const campos = new FormData(event.currentTarget);
        setOcupado(true);
        setRetorno(undefined);
        try {
          const resultado = await testar({
            data: {
              id: pedido.id,
              versao: pedido.versao,
              dataPrevisao: String(campos.get("data")),
              confirmarTeste: true,
              referencia: Number(referencia),
              produtoReferencia: Number(produtoSelecionado),
            },
          });
          setRetorno({
            mensagem: `Faturamento solicitado no Omie de teste. Código interno ${resultado.codigo}.`,
            erro: false,
          });
        } catch (erro) {
          setRetorno({
            mensagem: erro instanceof Error ? erro.message : "Não foi possível concluir o teste.",
            erro: true,
          });
        } finally {
          setOcupado(false);
        }
      }}
    >
      <label className="grid gap-1 text-sm">
        Pedido de referência do Omie de teste
        <select
          className="rounded-md border bg-background p-2"
          required
          value={referencia}
          onChange={(e) => {
            setReferencia(e.target.value);
            setProduto("");
          }}
          disabled={ocupado}
        >
          <option value="">Selecione um pedido</option>
          {referencias.data.map((r) => (
            <option key={r.id} value={r.id}>
              Pedido {r.numero} ·{" "}
              {r.produtos.length === 1 ? r.produtos[0]?.nome : `${r.produtos.length} produtos`}
            </option>
          ))}
        </select>
      </label>
      {produtos.length > 1 && (
        <label className="grid gap-1 text-sm">
          Produto de referência
          <select
            className="rounded-md border bg-background p-2"
            required
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            disabled={ocupado}
          >
            <option value="">Selecione um produto</option>
            {produtos.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-sm text-muted-foreground">
        O teste usa o cliente, o produto e os cadastros fiscais da referência selecionada.
      </p>
      <label className="grid gap-1 text-sm">
        Data prevista
        <Input type="date" name="data" defaultValue={data} disabled={ocupado} required />
      </label>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" required disabled={ocupado} />
        Confirmei que este pedido do MiMo é de demonstração.
      </label>
      {retorno && <p role={retorno.erro ? "alert" : "status"}>{retorno.mensagem}</p>}
      <Button
        type="submit"
        disabled={!referencia || !produtoSelecionado || ocupado || retorno?.erro === false}
      >
        {ocupado ? "Solicitando…" : "Criar e faturar no Omie de teste"}
      </Button>
    </form>
  );
}

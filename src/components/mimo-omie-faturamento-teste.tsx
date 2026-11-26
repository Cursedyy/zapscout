import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PedidoSalvo } from "@/lib/mimo-pedido";
import { testarFaturamentoOmieMimo } from "@/lib/mimo-omie-faturamento.functions";

const campos = [
  ["cliente", "Código do cliente"],
  ["categoria", "Código da categoria"],
  ["conta", "Código da conta corrente"],
  ["parcela", "Código da condição de pagamento"],
  ["cenario", "Código do cenário de impostos"],
] as const;

export function MimoOmieFaturamentoTeste({ pedido, data }: { pedido: PedidoSalvo; data: string }) {
  const testar = useServerFn(testarFaturamentoOmieMimo);
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<{ mensagem: string; erro: boolean }>();
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (ocupado) return;
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
              cadastro: {
                codigoCliente: Number(campos.get("cliente")),
                codigoCategoria: String(campos.get("categoria")),
                codigoContaCorrente: Number(campos.get("conta")),
                codigoParcela: String(campos.get("parcela")),
                codigoCenarioImpostos: Number(campos.get("cenario")),
                consumidorFinal: campos.get("consumidor") === "S" ? "S" : "N",
                modalidadeFrete: campos.get("frete") as "0" | "1" | "2" | "3" | "4" | "9",
                produtosPorItem: Object.fromEntries(
                  pedido.documento.itens.map((item) => [
                    item.id,
                    Number(campos.get(`item:${item.id}`)),
                  ]),
                ),
              },
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
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={ocupado}>
        {campos.map(([nome, rotulo]) => (
          <label className="grid gap-1 text-sm" key={nome}>
            {rotulo}
            <Input name={nome} required />
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          Data prevista
          <Input type="date" name="data" defaultValue={data} required />
        </label>
        <label className="grid gap-1 text-sm">
          Consumidor final
          <select name="consumidor" required defaultValue="">
            <option value="">Selecione</option>
            <option value="S">Sim</option>
            <option value="N">Não</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Modalidade do frete
          <select name="frete" required defaultValue="">
            <option value="">Selecione</option>
            <option value="0">0 — Remetente</option>
            <option value="1">1 — Destinatário</option>
            <option value="2">2 — Terceiros</option>
            <option value="3">3 — Próprio remetente</option>
            <option value="4">4 — Próprio destinatário</option>
            <option value="9">9 — Sem frete</option>
          </select>
        </label>
        {pedido.documento.itens.map((item) => (
          <label className="grid gap-1 text-sm" key={item.id}>
            Código Omie de {item.nome}
            <Input name={`item:${item.id}`} inputMode="numeric" required />
          </label>
        ))}
      </fieldset>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" required disabled={ocupado} />
        Confirmei que o pedido e os cadastros são de demonstração.
      </label>
      {retorno && <p role={retorno.erro ? "alert" : "status"}>{retorno.mensagem}</p>}
      <Button type="submit" disabled={ocupado || retorno?.erro === false}>
        {ocupado ? "Solicitando…" : "Criar e faturar no Omie de teste"}
      </Button>
    </form>
  );
}

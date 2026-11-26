import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  consultarFaturamentoOmieMimo,
  operarFaturamentoOmieMimo,
} from "@/lib/mimo-omie-producao.functions";
import type { PedidoSalvo } from "@/lib/mimo-pedido";
import { MimoOmieEnvioPedido } from "./mimo-omie-envio-pedido";

export function MimoOmieOperacaoPedido({ pedido, data }: { pedido: PedidoSalvo; data: string }) {
  const consultar = useServerFn(consultarFaturamentoOmieMimo);
  const operar = useServerFn(operarFaturamentoOmieMimo);
  const cliente = useQueryClient();
  const referencia = { id: pedido.id, versao: pedido.versao };
  const [conferido, setConferido] = useState(false);
  const vinculo = useQuery({
    queryKey: ["mimo-omie-faturamento", pedido.empresa_id, pedido.id, pedido.versao],
    queryFn: () => consultar({ data: referencia }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const operacao = useMutation({
    mutationFn: (emitir: boolean) => operar({ data: { ...referencia, emitir } }),
    onSuccess: (retorno) => {
      if (retorno.estado === "autorizado")
        void cliente.invalidateQueries({ queryKey: ["mimo-painel-pedidos"] });
    },
  });
  if (vinculo.isPending) return <p role="status">Consultando vínculo com o Omie…</p>;
  if (vinculo.isError)
    return (
      <div className="grid gap-2">
        <p role="alert">{vinculo.error.message}</p>
        <Button variant="outline" onClick={() => void vinculo.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  const resultado = operacao.data;
  if (resultado?.estado === "autorizado" || vinculo.data.estado === "autorizado") {
    const nota =
      resultado?.estado === "autorizado"
        ? resultado.nota
        : vinculo.data.estado === "autorizado"
          ? vinculo.data.nota
          : "";
    return (
      <p role="status">NF-e {nota} autorizada. O pedido foi marcado como faturado no painel.</p>
    );
  }
  if (vinculo.data.estado !== "vinculado")
    return (
      <MimoOmieEnvioPedido pedido={pedido} data={data} onEnviado={() => void vinculo.refetch()} />
    );
  const pendente = vinculo.data.pendente || resultado?.estado === "aguardando";
  const encerrado = resultado?.estado === "cancelado" || resultado?.estado === "denegado";
  const permiteEmitir = vinculo.data.ativo && !pendente && !encerrado;

  return (
    <div className="grid gap-3">
      <p className="text-sm">Pedido {vinculo.data.numero} vinculado ao Omie.</p>
      {permiteEmitir && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={conferido}
            disabled={operacao.isPending}
            onChange={(e) => setConferido(e.target.checked)}
          />
          Conferi o cliente, as embalagens, os valores e os dados fiscais no Omie.
        </label>
      )}
      {pendente && <p role="status">Aguardando confirmação da NF-e no Omie.</p>}
      {encerrado && (
        <p role="alert">O Omie informou cancelamento ou denegação. Confira o pedido no Omie.</p>
      )}
      {resultado?.estado === "aberto" && (
        <p role="status">O Omie ainda não confirmou uma NF-e para este pedido.</p>
      )}
      {operacao.isError && (
        <p role="alert" className="text-destructive">
          {operacao.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={operacao.isPending}
          onClick={() => operacao.mutate(false)}
        >
          Consultar autorização
        </Button>
        {permiteEmitir && (
          <Button
            disabled={!conferido || operacao.isPending}
            onClick={() => {
              setConferido(false);
              operacao.mutate(true);
            }}
          >
            Solicitar emissão da NF-e
          </Button>
        )}
      </div>
    </div>
  );
}

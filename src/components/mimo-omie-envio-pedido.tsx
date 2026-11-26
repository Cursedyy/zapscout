import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  consultarClientePedidoEnvioOmieMimo,
  consultarProdutosPedidoEnvioOmieMimo,
  enviarPedidoParaConferenciaOmieMimo,
} from "@/lib/mimo-omie-envio.functions";
import type { PedidoSalvo } from "@/lib/mimo-pedido";

const modalidades = [
  ["0", "Contratado pelo remetente (CIF)"],
  ["1", "Contratado pelo destinatário (FOB)"],
  ["2", "Contratado por terceiros"],
  ["3", "Transporte próprio do remetente"],
  ["4", "Transporte próprio do destinatário"],
  ["9", "Sem frete"],
] as const;

export function MimoOmieEnvioPedido({
  pedido,
  data,
  onEnviado,
}: {
  pedido: PedidoSalvo;
  data: string;
  onEnviado: () => void;
}) {
  const consultarProdutos = useServerFn(consultarProdutosPedidoEnvioOmieMimo);
  const consultarCliente = useServerFn(consultarClientePedidoEnvioOmieMimo);
  const enviarPedido = useServerFn(enviarPedidoParaConferenciaOmieMimo);
  const referencia = { id: pedido.id, versao: pedido.versao };
  const produtos = useQuery({
    queryKey: ["mimo-omie-produtos-envio", pedido.empresa_id, pedido.id, pedido.versao],
    queryFn: () => consultarProdutos({ data: referencia }),
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [documento, setDocumento] = useState("");
  const [modalidade, setModalidade] = useState<(typeof modalidades)[number][0] | "">("");
  const cliente = useMutation({
    mutationFn: (cpfCnpj: string) =>
      consultarCliente({ data: { ...referencia, documento: cpfCnpj } }),
  });
  const envio = useMutation({
    mutationFn: (dados: Parameters<typeof enviarPedido>[0]) => enviarPedido(dados),
    onSuccess: onEnviado,
  });
  const bloqueado = envio.isPending || envio.isSuccess;

  if (produtos.isPending) return <p role="status">Conferindo produtos no Omie…</p>;
  if (produtos.isError)
    return (
      <div className="grid gap-2">
        <p role="alert">{produtos.error.message}</p>
        <Button variant="outline" onClick={() => void produtos.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  const completos =
    produtos.data.itens.length > 0 && produtos.data.itens.every((item) => item.produto);

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2 rounded-md border p-3 text-sm" aria-label="Produtos no Omie">
        {produtos.data.itens.map((item) => (
          <li key={item.id}>
            {item.quantidade} × {item.nome}
            {item.unidade && ` (${item.unidade})`}
            <p className={item.produto ? "text-muted-foreground" : "text-destructive"}>
              {item.produto
                ? `${item.produto.codigo} · ${item.produto.nome}${item.produto.unidade ? ` (${item.produto.unidade})` : ""}`
                : `Confira o cadastro ou vincule o código ${item.codigo} no Omie.`}
            </p>
          </li>
        ))}
      </ul>
      {!produtos.data.envioAtivo && <p role="status">O envio ao Omie ainda não está ativado.</p>}
      {produtos.data.envioAtivo && completos && (
        <>
          <form
            className="grid gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (!cliente.isPending && !bloqueado) cliente.mutate(documento);
            }}
          >
            <label className="grid gap-1 text-sm">
              CPF ou CNPJ de {pedido.documento.cliente || "cliente"}
              <Input
                value={documento}
                required
                maxLength={24}
                inputMode="numeric"
                autoComplete="off"
                disabled={cliente.isPending || bloqueado}
                onChange={(e) => {
                  setDocumento(e.target.value);
                  cliente.reset();
                  envio.reset();
                }}
              />
            </label>
            <Button variant="outline" disabled={cliente.isPending || bloqueado}>
              {cliente.isPending ? "Consultando…" : "Consultar cliente"}
            </Button>
            {cliente.isError && (
              <p role="alert" className="text-destructive text-sm">
                {cliente.error.message}
              </p>
            )}
          </form>
          {cliente.data && (
            <form
              className="grid gap-3"
              onSubmit={(evento) => {
                evento.preventDefault();
                if (!modalidade || !cliente.data || bloqueado) return;
                const campos = new FormData(evento.currentTarget);
                envio.mutate({
                  data: {
                    ...referencia,
                    documento,
                    clienteId: cliente.data.id,
                    versaoProdutos: produtos.data.versaoProdutos,
                    dataPrevisao: String(campos.get("previsao")),
                    fiscal: {
                      codigoCategoria: String(campos.get("categoria")),
                      codigoContaCorrente: Number(campos.get("conta")),
                      codigoParcela: String(campos.get("parcela")),
                      consumidorFinal: campos.get("consumidor") === "S" ? "S" : "N",
                      modalidadeFrete: modalidade,
                    },
                  },
                });
              }}
            >
              <p className="text-sm">
                Cliente localizado no Omie <strong>{cliente.data.nome}</strong>
              </p>
              <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Previsão de faturamento
                  <Input type="date" name="previsao" defaultValue={data} required />
                </label>
                <label className="grid gap-1 text-sm">
                  Código da categoria
                  <Input name="categoria" required maxLength={20} />
                </label>
                <label className="grid gap-1 text-sm">
                  Código da conta corrente
                  <Input name="conta" required inputMode="numeric" pattern="[1-9][0-9]*" />
                </label>
                <label className="grid gap-1 text-sm">
                  Código da condição de pagamento
                  <Input name="parcela" required maxLength={3} />
                </label>
                <label className="grid gap-1 text-sm">
                  Modalidade de frete
                  <select
                    className="rounded-md border bg-background p-2"
                    required
                    value={modalidade}
                    onChange={(e) =>
                      setModalidade(
                        modalidades.find(([codigo]) => codigo === e.target.value)?.[0] ?? "",
                      )
                    }
                  >
                    <option value="">Selecione</option>
                    {modalidades.map(([codigo, nome]) => (
                      <option key={codigo} value={codigo}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  Consumidor final
                  <select
                    name="consumidor"
                    className="rounded-md border bg-background p-2"
                    required
                    defaultValue=""
                  >
                    <option value="">Selecione</option>
                    <option value="S">Sim</option>
                    <option value="N">Não</option>
                  </select>
                </label>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" required className="mt-1" />
                  Conferi o cliente, os produtos, as unidades e os dados do pedido.
                </label>
              </fieldset>
              {envio.isError && (
                <p role="alert" className="text-destructive text-sm">
                  {envio.error.message}
                </p>
              )}
              {envio.isSuccess && (
                <p role="status" className="font-medium text-sm">
                  Pedido {envio.data.numero} localizado no Omie. Abra o pedido lá para conferir o
                  faturamento.
                </p>
              )}
              <Button disabled={bloqueado}>
                {envio.isPending ? "Enviando…" : "Enviar pedido para conferência"}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

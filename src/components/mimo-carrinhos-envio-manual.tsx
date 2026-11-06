import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { enviarLembreteManualMimo } from "@/lib/mimo-carrinhos-recuperacao.functions";
import {
  motivoRecuperacaoCarrinho,
  type DiagnosticoCarrinho,
} from "@/lib/mimo-carrinhos-diagnostico";
import { mensagensRecuperacaoMimo } from "@/lib/mimo-carrinhos-mensagens";
import { Button } from "./ui/button";

const resultados: Record<string, string> = {
  enviada: "Lembrete aceito pelo WhatsApp. O recebimento no aparelho depende do provedor.",
  incerta:
    "O aceite do envio ficou incerto. Não repita; revise o atendimento antes de qualquer ação.",
  bloqueada: "O envio foi bloqueado pela verificação final de compra, contato ou atendimento.",
  vazia:
    "Carrinho indisponível para envio: já processado, em processamento ou bloqueado. Consulte o estado atualizado.",
  desativada: "Configure a recuperação e o WhatsApp comercial antes de enviar.",
  sem_configuracao: "A conexão da loja precisa ser configurada antes de enviar.",
};
export function MimoCarrinhoEnvioManual({
  id,
  nome,
  telefone,
  url,
  diagnostico,
}: {
  id: string;
  nome: string;
  telefone: string;
  url: string | null;
  diagnostico?: DiagnosticoCarrinho | null;
}) {
  const [revisando, setRevisando] = useState(false);
  const enviar = useServerFn(enviarLembreteManualMimo);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => enviar({ data: { checkout: id } }),
    retry: false,
    onSettled: async () => {
      setRevisando(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mimo-carrinhos"] }),
        qc.invalidateQueries({ queryKey: ["mimo-recuperacao-indicadores"] }),
      ]);
    },
  });
  const permitido = !!diagnostico?.podeEnviar && !!url && !!telefone;
  return (
    <div className="space-y-2 border-t pt-3 text-sm">
      <p>{motivoRecuperacaoCarrinho(diagnostico?.motivo)}</p>
      {diagnostico?.enviadaEm && (
        <p className="text-muted-foreground">
          {diagnostico.manual ? "Envio manual" : "Envio automático"} em{" "}
          {new Date(diagnostico.enviadaEm).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
          (Brasília).
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!permitido || m.isPending || m.isSuccess}
        onClick={() => setRevisando(true)}
      >
        {m.isPending ? "Enviando lembrete…" : "Enviar lembrete manual"}
      </Button>
      {revisando && permitido && url && (
        <section
          aria-label={`Revisar lembrete do carrinho ${id}`}
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
        >
          <p className="font-medium">
            Enviar para {nome || "este cliente"} · {telefone}
          </p>
          <p className="whitespace-pre-wrap">
            {mensagensRecuperacaoMimo(nome, url, [new URL(url).hostname]).whatsapp}
          </p>
          <p className="text-muted-foreground">
            Será enviado um único lembrete deste carrinho. Compras e respostas do cliente serão
            verificadas novamente antes do envio.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
              Confirmar envio
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={m.isPending}
              onClick={() => setRevisando(false)}
            >
              Cancelar
            </Button>
          </div>
        </section>
      )}
      {m.isSuccess && (
        <p role="status">
          {resultados[m.data.resultado] ?? "Envio não concluído. Consulte o estado atualizado."}
        </p>
      )}
      {m.isError && (
        <p role="alert" className="text-destructive">
          {m.error.message}
        </p>
      )}
    </div>
  );
}

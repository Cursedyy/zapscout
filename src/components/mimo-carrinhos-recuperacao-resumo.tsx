import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  obterIndicadoresRecuperacaoMimo,
  obterRemetentesRecuperacaoMimo,
  configurarRecuperacaoMimo,
} from "@/lib/mimo-carrinhos-recuperacao.functions";
import { Button } from "./ui/button";
export function MimoRecuperacaoResumo() {
  const obter = useServerFn(obterIndicadoresRecuperacaoMimo),
    configurar = useServerFn(configurarRecuperacaoMimo);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const listar = useServerFn(obterRemetentesRecuperacaoMimo);
  const remetentes = useQuery({
    queryKey: ["mimo-recuperacao-remetentes"],
    queryFn: () => listar(),
    refetchInterval: 30000,
  });
  const selecionado = escolhido ?? remetentes.data?.selecionado ?? "";
  const permitido =
    remetentes.data?.linhas.some((l) => l.id === selecionado && l.permitido) ?? false;
  const q = useQuery({
    queryKey: ["mimo-recuperacao-indicadores"],
    queryFn: () => obter(),
    refetchInterval: 30000,
  });
  const m = useMutation({
    mutationFn: (data: { ativo: boolean; vinculoId?: string }) => configurar({ data }),
    onSuccess: async () => {
      await Promise.all([q.refetch(), remetentes.refetch()]);
    },
  });
  const d = q.data;
  const taxa = d?.enviadas
    ? ((100 * d.compras) / d.enviadas).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"
    : "—";
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">
          WhatsApp · {d?.ativa ? "Recuperação ativa" : "Envios automáticos desativados"}
        </p>
        {d && (
          <Button
            variant="outline"
            size="sm"
            disabled={m.isPending || q.isFetching || (!d.ativa && !permitido)}
            onClick={() =>
              m.mutate(d.ativa ? { ativo: false } : { ativo: true, vinculoId: selecionado })
            }
          >
            {m.isPending ? "Atualizando…" : d.ativa ? "Pausar lembretes" : "Ativar lembretes"}
          </Button>
        )}
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <label htmlFor="recuperacao-remetente" className="font-medium">
          Número para recuperação de carrinhos
        </label>
        <select
          id="recuperacao-remetente"
          className="block w-full rounded-md border bg-background p-2"
          value={selecionado}
          disabled={m.isPending || remetentes.isFetching}
          onChange={(e) => setEscolhido(e.target.value)}
        >
          <option value="">Selecione um número comercial</option>
          {remetentes.data?.linhas.map((l) => (
            <option key={l.id} value={l.id} disabled={!l.permitido}>
              {l.numero}
              {!l.permitido ? " · indisponível para recuperação" : ""}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground">
          Use um número diferente da IA de atendimento. Conecte e confirme a outra linha como
          Entrada em WhatsApp MiMo para selecioná-la aqui.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={!permitido || m.isPending || remetentes.isFetching}
            onClick={() => m.mutate({ ativo: false, vinculoId: selecionado })}
          >
            Salvar número e manter pausado
          </Button>
          <a className="text-primary underline" href="/mimo/whatsapp">
            Conectar outro número
          </a>
        </div>
        {remetentes.isError && (
          <p role="alert">Não foi possível carregar os números. Tente atualizar a página.</p>
        )}
        {remetentes.isSuccess && !permitido && (
          <p>Configure uma linha própria para liberar os lembretes por WhatsApp.</p>
        )}
        {m.isSuccess && (
          <p role="status">
            Configuração salva. {d?.ativa ? "Lembretes ativos." : "Lembretes pausados."}
          </p>
        )}
      </div>
      <p className="text-muted-foreground">
        Um lembrete por WhatsApp após 2 horas, todos os dias, 24 horas por dia, com o cupom
        MIMOCONSULTOR.
      </p>
      {q.isError && <p role="alert">Não foi possível atualizar os indicadores.</p>}
      {q.isSuccess && !d && <p className="text-muted-foreground">Processamento em preparação.</p>}
      {d && (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Envios aceitos", d.enviadas],
              ["Na fila", d.pendentes],
              ["Compras após lembrete", d.compras],
              ["Conversão após envio", taxa],
            ].map(([nome, valor]) => (
              <div key={nome} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{nome}</dt>
                <dd className="mt-1 text-xl font-semibold">{valor}</dd>
              </div>
            ))}
          </dl>
          <p>
            Valor vendido (BRL): R$ {(BigInt(d.valorCentavos) / 100n).toLocaleString("pt-BR")},
            {(BigInt(d.valorCentavos) % 100n).toString().padStart(2, "0")} · Bloqueados:{" "}
            {d.bloqueadas} · Envios incertos: {d.incertas}
          </p>
          <p className="text-xs text-muted-foreground">
            Compras pagas do mesmo checkout criadas após o envio. Cancelamentos e estornos
            excluídos. A relação temporal não comprova que a mensagem causou a compra.
          </p>
          {d.inicioEm && (
            <p className="text-xs text-muted-foreground">
              Desde{" "}
              {new Date(d.inicioEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{" "}
              (Brasília). Somente carrinhos novos após a ativação.
            </p>
          )}
        </>
      )}
      {m.isError && (
        <p role="alert" className="text-destructive">
          {m.error.message}
        </p>
      )}
    </section>
  );
}

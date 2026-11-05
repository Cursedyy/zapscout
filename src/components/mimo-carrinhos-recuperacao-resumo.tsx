import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  obterIndicadoresRecuperacaoMimo,
  configurarRecuperacaoMimo,
} from "@/lib/mimo-carrinhos-recuperacao.functions";
import { Button } from "./ui/button";
export function MimoRecuperacaoResumo() {
  const obter = useServerFn(obterIndicadoresRecuperacaoMimo),
    configurar = useServerFn(configurarRecuperacaoMimo);
  const q = useQuery({
    queryKey: ["mimo-recuperacao-indicadores"],
    queryFn: () => obter(),
    refetchInterval: 30000,
  });
  const m = useMutation({
    mutationFn: (ativo: boolean) => configurar({ data: { ativo } }),
    onSuccess: async () => {
      await q.refetch();
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
            disabled={m.isPending || q.isFetching}
            onClick={() => m.mutate(!d.ativa)}
          >
            {m.isPending ? "Atualizando…" : d.ativa ? "Pausar lembretes" : "Ativar lembretes"}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground">
        Um lembrete após 2 horas, todos os dias, 24 horas por dia, com o cupom MIMOCONSULTOR. E-mail
        adiado.
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

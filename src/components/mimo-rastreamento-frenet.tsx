import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  consultarRemessaFrenetMimo,
  listarRemessasFrenetMimo,
  vincularRemessaFrenetMimo,
} from "@/lib/mimo-rastreamento.functions";

type Remessa = { codigo: string; servico: string };

export function MimoRastreamentoFrenet({
  pedidoId,
  codigoServico,
  podeVincular,
}: {
  pedidoId: string;
  codigoServico: string | null;
  podeVincular: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="border-t border-border pt-3 lg:col-span-3" aria-label="Rastreios Frenet">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={aberto}
        onClick={() => setAberto(!aberto)}
      >
        {aberto ? "Ocultar rastreios Frenet" : "Ver rastreios Frenet"}
      </Button>
      {aberto && (
        <Remessas pedidoId={pedidoId} codigoServico={codigoServico} podeVincular={podeVincular} />
      )}
    </section>
  );
}

function Remessas({
  pedidoId,
  codigoServico,
  podeVincular,
}: {
  pedidoId: string;
  codigoServico: string | null;
  podeVincular: boolean;
}) {
  const listar = useServerFn(listarRemessasFrenetMimo);
  const vincular = useServerFn(vincularRemessaFrenetMimo);
  const consultar = useServerFn(consultarRemessaFrenetMimo);
  const [formulario, setFormulario] = useState<{
    valores: Remessa;
    anterior: Remessa | null;
  } | null>(null);
  const lista = useQuery({
    queryKey: ["mimo-frenet-remessas", pedidoId],
    queryFn: () => listar({ data: { pedidoId } }),
    retry: false,
  });
  const eventos = useMutation({
    mutationFn: (codigo: string) => consultar({ data: { pedidoId, codigo } }),
  });
  const salvar = useMutation({
    mutationFn: ({ valores, anterior }: NonNullable<typeof formulario>) =>
      vincular({ data: { pedidoId, ...valores, anterior } }),
    onSuccess: async () => {
      eventos.reset();
      setFormulario(null);
      await lista.refetch();
    },
  });

  if (lista.isPending)
    return (
      <p className="mt-3 text-sm" role="status">
        Carregando rastreios…
      </p>
    );
  if (lista.isError)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-destructive" role="alert">
          {lista.error.message}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void lista.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );

  return (
    <div className="mt-3 grid gap-3">
      {lista.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum código de rastreio vinculado a este pedido.
        </p>
      )}
      {lista.data.map((remessa) => (
        <div key={remessa.codigo} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-sm font-medium">{remessa.codigo}</p>
              <p className="text-xs text-muted-foreground">Serviço {remessa.servico}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => eventos.mutate(remessa.codigo)}
                disabled={eventos.isPending || salvar.isPending}
              >
                {eventos.isPending && eventos.variables === remessa.codigo
                  ? "Consultando…"
                  : "Consultar movimentações"}
              </Button>
              {podeVincular && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={salvar.isPending}
                  onClick={() => {
                    salvar.reset();
                    setFormulario({ valores: remessa, anterior: remessa });
                  }}
                >
                  Editar rastreio
                </Button>
              )}
            </div>
          </div>
          {eventos.variables === remessa.codigo && eventos.isError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {eventos.error.message}
            </p>
          )}
          {eventos.variables === remessa.codigo && eventos.isSuccess && (
            <div className="mt-3 border-t border-border pt-3">
              <h3 className="text-sm font-semibold">Movimentações da Frenet</h3>
              {eventos.data.length === 0 ? (
                <p role="status" className="mt-1 text-sm text-muted-foreground">
                  A Frenet ainda não informou movimentações.
                </p>
              ) : (
                <ul className="mt-2 grid gap-2 text-sm" aria-label="Movimentações da Frenet">
                  {eventos.data.map((evento, indice) => (
                    <li key={indice} className="border-l-2 border-primary/40 pl-3">
                      <p>{evento.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        {[evento.data, evento.local].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}
      {podeVincular &&
        (formulario ? (
          <form
            className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!salvar.isPending) salvar.mutate(formulario);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Código de rastreio
                <Input
                  required
                  maxLength={80}
                  value={formulario.valores.codigo}
                  disabled={salvar.isPending}
                  onChange={(event) =>
                    setFormulario({
                      ...formulario,
                      valores: { ...formulario.valores, codigo: event.target.value },
                    })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Código do serviço na Frenet
                <Input
                  required
                  maxLength={80}
                  value={formulario.valores.servico}
                  disabled={salvar.isPending}
                  onChange={(event) =>
                    setFormulario({
                      ...formulario,
                      valores: { ...formulario.valores, servico: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={salvar.isPending || eventos.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar rastreio"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={salvar.isPending}
                onClick={() => setFormulario(null)}
              >
                Cancelar
              </Button>
            </div>
            {salvar.isError && (
              <p className="text-sm text-destructive" role="alert">
                {salvar.error.message}
              </p>
            )}
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => {
              salvar.reset();
              setFormulario({
                valores: { codigo: "", servico: codigoServico ?? "" },
                anterior: null,
              });
            }}
          >
            Vincular código de rastreio
          </Button>
        ))}
    </div>
  );
}

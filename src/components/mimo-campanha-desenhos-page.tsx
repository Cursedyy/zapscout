import { useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, Film, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MimoCarregando } from "@/components/mimo-carregando";
import { baixarDesenhoMimo, listarDesenhosMimo } from "@/lib/mimo-campanha-desenhos.functions";

const linkCampanha = "https://zapscout.com.br/campanha-desenhos";
const formatoData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const formatoTamanho = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
type Cursor = { id: string; recebido_em: string } | null;

export function MimoCampanhaDesenhosPage() {
  const listar = useServerFn(listarDesenhosMimo);
  const baixar = useServerFn(baixarDesenhoMimo);
  const [aviso, setAviso] = useState("");
  const lista = useInfiniteQuery({
    queryKey: ["mimo", "campanha-desenhos"],
    queryFn: ({ pageParam }) => listar({ data: { cursor: pageParam } }),
    initialPageParam: null as Cursor,
    getNextPageParam: (pagina) => pagina.proximo,
  });
  const download = useMutation({
    mutationFn: (id: string) => baixar({ data: id }),
    onSuccess: (url) => {
      const link = document.createElement("a");
      link.href = url;
      link.referrerPolicy = "no-referrer";
      link.click();
    },
  });
  const envios = lista.data?.pages.flatMap((pagina) => pagina.envios) ?? [];

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkCampanha);
      setAviso("Link copiado.");
    } catch {
      setAviso("Selecione o link no campo acima para copiar.");
    }
  }

  return (
    <section className="space-y-6 p-4 pb-24 sm:p-6 sm:pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Campanha de desenhos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fotos e vídeos enviados pelos participantes do Instagram.
        </p>
      </header>
      <div className="space-y-2 rounded-xl border bg-card p-4">
        <label htmlFor="link-campanha-desenhos" className="text-sm font-medium">
          Link para compartilhar no Instagram
        </label>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <Input id="link-campanha-desenhos" value={linkCampanha} readOnly />
          <Button variant="outline" onClick={() => void copiar()}>
            <Copy /> Copiar link
          </Button>
        </div>
        {aviso && (
          <p role="status" className="text-sm text-muted-foreground">
            {aviso}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Envios recebidos</h2>
        {lista.isPending && <MimoCarregando />}
        {lista.isError && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-destructive">
              Não foi possível carregar os envios.
            </p>
            <Button size="sm" variant="outline" onClick={() => void lista.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {lista.isSuccess && !envios.length && (
          <p className="rounded-xl border border-dashed bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum desenho recebido até agora.
          </p>
        )}
        {download.isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível baixar o arquivo. Tente novamente.
          </p>
        )}
        {envios.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {envios.map((envio) => {
              const video = envio.mime.startsWith("video/");
              const Icone = video ? Film : ImageIcon;
              return (
                <li
                  key={envio.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icone aria-hidden="true" className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <a
                        className="block truncate text-sm font-semibold hover:underline"
                        href={`https://www.instagram.com/${envio.instagram}/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        @{envio.instagram}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {video ? "Vídeo" : "Foto"} ·{" "}
                        {formatoTamanho.format(envio.tamanho / 1024 / 1024)} MB
                        {envio.recebido_em &&
                          ` · ${formatoData.format(new Date(envio.recebido_em))}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={download.isPending}
                    aria-label={`Baixar envio de @${envio.instagram}`}
                    onClick={() => download.mutate(envio.id)}
                  >
                    <Download /> Baixar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {lista.hasNextPage && (
          <Button
            variant="outline"
            disabled={lista.isFetchingNextPage}
            onClick={() => void lista.fetchNextPage()}
          >
            {lista.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
          </Button>
        )}
      </div>
    </section>
  );
}

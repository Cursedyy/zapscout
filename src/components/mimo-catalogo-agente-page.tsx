import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ExternalLink, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  ativarCatalogoMimo,
  carregarCatalogoAgenteMimo,
  LIMITE_CATALOGO_BYTES,
  prepararEnvioCatalogoMimo,
} from "@/lib/mimo-catalogo-agente.functions";

const data = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function MimoCatalogoAgentePage() {
  const client = useQueryClient();
  const carregar = useServerFn(carregarCatalogoAgenteMimo);
  const preparar = useServerFn(prepararEnvioCatalogoMimo);
  const ativar = useServerFn(ativarCatalogoMimo);
  const q = useQuery({ queryKey: ["mimo-catalogo-agente"], queryFn: () => carregar() });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState("Catálogo de produtos MiMo");
  const [aviso, setAviso] = useState("");
  const envio = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw Error("Escolha o PDF do catálogo.");
      if (arquivo.type && arquivo.type !== "application/pdf") throw Error("Envie o catálogo em PDF.");
      if (arquivo.size > LIMITE_CATALOGO_BYTES) throw Error("O PDF precisa ter até 50 MB.");
      const p = await preparar({ data: { tamanho: arquivo.size } });
      const up = await supabase.storage
        .from("mimo-agente-materiais")
        .uploadToSignedUrl(p.path, p.token, arquivo, { contentType: "application/pdf" });
      if (up.error) throw Error("Não foi possível enviar o arquivo. Tente novamente.");
      await ativar({ data: { id: p.id, nome } });
    },
    onSuccess: () => {
      setArquivo(null);
      setAviso("Catálogo publicado. O agente já envia esta versão a quem pedir o catálogo.");
      void client.invalidateQueries({ queryKey: ["mimo-catalogo-agente"] });
    },
    onError: (e) => setAviso(e instanceof Error ? e.message : "Não foi possível publicar o catálogo."),
  });

  return (
    <section className="min-h-dvh bg-background px-4 py-6 text-foreground md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Marketing</p>
          <h1 className="text-2xl font-semibold">Catálogo do agente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Este é o PDF que o agente de atendimento envia no WhatsApp quando um lead pede o catálogo. Ao
            publicar um novo, ele substitui o atual na hora; os anteriores ficam guardados no histórico.
          </p>
        </header>

        <article className="rounded-lg border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BookOpen className="size-4" />
            Catálogo em uso
          </h2>
          {q.isPending ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">Carregando…</p>
          ) : q.isError ? (
            <p className="mt-3 text-sm" role="alert">Não foi possível carregar o catálogo.</p>
          ) : q.data.atual ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{q.data.atual.nome}</p>
                <p className="text-xs text-muted-foreground">Publicado em {data(q.data.atual.enviadoEm)}</p>
              </div>
              {q.data.atual.url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={q.data.atual.url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Abrir PDF
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum catálogo publicado. Enquanto isso, pedidos de catálogo vão para a equipe.
            </p>
          )}
        </article>

        <form
          className="space-y-4 rounded-lg border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setAviso("");
            envio.mutate();
          }}
        >
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Upload className="size-4" />
            Publicar novo catálogo
          </h2>
          <label className="grid gap-1 text-sm">
            Nome do arquivo para o cliente
            <Input value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            PDF do catálogo (até 50 MB)
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </label>
          {arquivo && arquivo.size > 16 * 1024 * 1024 && (
            <p className="text-xs text-muted-foreground">
              Arquivo de {(arquivo.size / 1024 / 1024).toFixed(1)} MB. Ele funciona, mas um PDF mais leve abre mais
              rápido no celular do cliente.
            </p>
          )}
          <Button type="submit" disabled={!arquivo || !nome.trim() || envio.isPending}>
            {envio.isPending ? "Enviando…" : "Publicar catálogo"}
          </Button>
          {aviso && (
            <p role="status" className="text-sm">
              {aviso}
            </p>
          )}
        </form>

        {!!q.data?.anteriores.length && (
          <section>
            <h2 className="text-sm font-semibold">Versões anteriores</h2>
            <ul className="mt-2 divide-y divide-border text-sm">
              {q.data.anteriores.map((m) => (
                <li key={m.id} className="flex justify-between py-2">
                  <span>{m.nome}</span>
                  <span className="text-muted-foreground">{data(m.enviadoEm)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

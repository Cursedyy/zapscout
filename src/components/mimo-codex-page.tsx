import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { codexErrorMessage, codexRequestSchema, consumirCodex } from "@/lib/mimo-codex";

export function MimoCodexPage() {
  const { user, session, loading } = useAuth();
  if (loading)
    return (
      <p role="status" className="p-6">
        Verificando sessão…
      </p>
    );
  if (!user || !session)
    return (
      <p role="alert" className="p-6">
        Sua sessão expirou. Entre novamente.
      </p>
    );
  return <EditorCodex key={user.id} usuarioId={user.id} token={session.access_token} />;
}
function EditorCodex({ usuarioId, token }: { usuarioId: string; token: string }) {
  const [mode, setMode] = useState<"generate" | "edit">("generate");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [estado, setEstado] = useState<"ocioso" | "gerando" | "concluido" | "cancelado" | "erro">(
    "ocioso",
  );
  const [erro, setErro] = useState("");
  const atual = useRef<AbortController | null>(null);
  const configuracao = useQuery({
    queryKey: ["mimo-codex-config", usuarioId],
    retry: false,
    queryFn: async ({ signal }) => {
      const r = await fetch("/api/mimo/codex", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
        cache: "no-store",
      });
      if (!r.ok) throw Error(codexErrorMessage(r.status));
      const body = await r.json();
      if (typeof body?.configurado !== "boolean") throw Error(codexErrorMessage(503));
      return body.configurado as boolean;
    },
  });
  useEffect(
    () => () => {
      atual.current?.abort();
      atual.current = null;
    },
    [],
  );
  async function executar() {
    if (atual.current || !configuracao.data) return;
    const entrada = codexRequestSchema.safeParse({
      mode,
      prompt,
      code: mode === "edit" ? code : "",
      language: "typescript",
    });
    if (!entrada.success) {
      setErro(
        "Confira a descrição (10 a 4.000 caracteres) e o código a editar (até 20.000 caracteres).",
      );
      return;
    }
    const controller = new AbortController();
    atual.current = controller;
    setOutput("");
    setErro("");
    setEstado("gerando");
    try {
      const r = await fetch("/api/mimo/codex", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(entrada.data),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!r.ok || !r.body || !r.headers.get("content-type")?.includes("text/event-stream"))
        throw Error(codexErrorMessage(r.ok ? 502 : r.status));
      await consumirCodex(
        r.body,
        (texto) => {
          if (atual.current === controller) setOutput((antes) => antes + texto);
        },
        controller.signal,
      );
      if (atual.current === controller) setEstado("concluido");
    } catch (e) {
      if (atual.current === controller) {
        setEstado(controller.signal.aborted ? "cancelado" : "erro");
        // Messages are local constants; never show a raw upstream body or parser error.
        if (!controller.signal.aborted)
          setErro(
            e instanceof Error &&
              [400, 401, 403, 413, 415, 429, 502, 503, 504]
                .map(codexErrorMessage)
                .includes(e.message)
              ? e.message
              : codexErrorMessage(502),
          );
      }
    } finally {
      if (atual.current === controller) atual.current = null;
    }
  }
  return (
    <section className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold">Codex · Ferramenta administrativa</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gere ou edite trechos TypeScript para revisão. O resultado é somente texto: nenhum código
          é executado ou aplicado ao painel.
        </p>
      </header>
      <p className="rounded-lg border bg-card p-4 text-sm">
        Somente a solicitação e o código colados por você serão enviados à OpenAI. Não cole segredos
        ou dados pessoais. A ferramenta não acessa repositório, leads, arquivos ou credenciais do
        produto.
      </p>
      {configuracao.isPending && <p role="status">Verificando configuração…</p>}
      {configuracao.isError && (
        <div role="alert">
          <p>{configuracao.error.message}</p>
          <Button variant="outline" onClick={() => void configuracao.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {configuracao.data === false && (
        <p role="status">A integração ainda não foi configurada pela administração.</p>
      )}
      {configuracao.data === true && !configuracao.isError && (
        <form
          className="space-y-4 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void executar();
          }}
        >
          <fieldset disabled={estado === "gerando"} className="space-y-4">
            <label className="grid gap-1 text-sm">
              Operação
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "generate" | "edit");
                  setOutput("");
                  setErro("");
                  setEstado("ocioso");
                }}
                className="h-10 rounded-md border bg-background px-3"
              >
                <option value="generate">Gerar trecho TypeScript</option>
                <option value="edit">Editar trecho TypeScript</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Solicitação
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                minLength={10}
                maxLength={4000}
                required
                rows={4}
              />
            </label>
            {mode === "edit" && (
              <label className="grid gap-1 text-sm">
                Código atual
                <Textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={20000}
                  required
                  rows={10}
                  className="font-mono text-xs"
                />
              </label>
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button disabled={estado === "gerando"}>Enviar solicitação</Button>
            {estado === "gerando" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  atual.current?.abort();
                  atual.current = null;
                  setEstado("cancelado");
                }}
              >
                Cancelar geração
              </Button>
            )}
          </div>
        </form>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <section
        aria-labelledby="codex-resultado"
        className="space-y-3 rounded-xl border bg-card p-4"
      >
        <h2 id="codex-resultado" className="font-semibold">
          Resultado para revisão
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {estado === "gerando"
            ? "Gerando texto…"
            : estado === "concluido"
              ? "Texto concluído. Revise e teste antes de usar."
              : estado === "cancelado"
                ? "Geração cancelada. O texto parcial não foi aplicado."
                : estado === "erro"
                  ? "Geração interrompida. O texto parcial pode estar incompleto."
                  : "Nenhum código é aplicado automaticamente."}
        </p>
        <pre className="min-h-32 whitespace-pre-wrap break-words text-sm font-mono">
          {output || "O resultado aparecerá aqui."}
        </pre>
      </section>
    </section>
  );
}

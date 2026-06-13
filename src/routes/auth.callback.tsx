import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Confirmando acesso — ZapScout" }, { name: "robots", content: "noindex" }],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const hash = window.location.hash.startsWith("#")
          ? new URLSearchParams(window.location.hash.slice(1))
          : new URLSearchParams();

        // Erros vindos do Supabase no hash ou query
        const errDesc =
          hash.get("error_description") || url.searchParams.get("error_description");
        if (errDesc) {
          if (!cancelled) setErro(errDesc);
          return;
        }

        // 1) PKCE: ?code=...
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hash.get("access_token")) {
          // 2) Implicit: #access_token=...&refresh_token=...
          const access_token = hash.get("access_token")!;
          const refresh_token = hash.get("refresh_token") ?? "";
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else {
          // 3) Já pode haver sessão persistida (ex.: link aberto duas vezes)
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            if (!cancelled)
              setErro("Link inválido ou já utilizado. Faça login para continuar.");
            return;
          }
        }

        if (cancelled) return;
        // Limpa hash/query antes de navegar
        window.history.replaceState({}, "", "/auth/callback");
        navigate({ to: "/app", search: { welcome: "true" } as never, replace: true });
      } catch (e: any) {
        if (!cancelled) setErro(e?.message ?? "Não foi possível concluir a autenticação.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (erro) {
    return (
      <div className="min-h-dvh grid place-items-center bg-background p-6">
        <div className="max-w-md text-center">
          <div className="grid place-items-center h-12 w-12 rounded-full bg-destructive/15 mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold">Não foi possível confirmar seu acesso</h1>
          <p className="text-sm text-muted-foreground mt-2">{erro}</p>
          <div className="mt-6 flex gap-2 justify-center">
            <Button onClick={() => navigate({ to: "/login" })}>Ir para o login</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
        <h1 className="text-lg font-semibold">Confirmando seu acesso…</h1>
        <p className="text-sm text-muted-foreground mt-1">Só um instante.</p>
      </div>
    </div>
  );
}

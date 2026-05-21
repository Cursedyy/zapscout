import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Zap, Loader2, AlertTriangle, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — ZapScout" },
      { name: "description", content: "Defina uma nova senha para sua conta ZapScout." },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: "Redefinir senha — ZapScout" },
      { property: "og:url", content: "/reset-password" },
    ],
    links: [{ rel: "canonical", href: "/reset-password" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<{ title: string; message: string } | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [verificandoToken, setVerificandoToken] = useState(true);
  const [tokenValido, setTokenValido] = useState(false);

  useEffect(() => {
    let cancelado = false;

    // Escuta evento PASSWORD_RECOVERY do Supabase
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (!cancelado) {
          setTokenValido(true);
          setVerificandoToken(false);
        }
      }
    });

    const processarLink = async () => {
      const url = new URL(window.location.href);
      const hash = window.location.hash || "";
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

      // 1) Erro retornado pelo Supabase (link expirado/inválido)
      const errorDesc =
        url.searchParams.get("error_description") || hashParams.get("error_description");
      const errorCode =
        url.searchParams.get("error_code") || hashParams.get("error_code");
      if (errorDesc || errorCode) {
        if (!cancelado) {
          setTokenValido(false);
          setVerificandoToken(false);
        }
        return;
      }

      // 2) Fluxo PKCE: ?code=...
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelado) return;
        if (error) {
          setTokenValido(false);
        } else {
          setTokenValido(true);
        }
        setVerificandoToken(false);
        return;
      }

      // 3) Fluxo legado: tokens no hash (#access_token=...&type=recovery)
      if (hashParams.get("access_token") && hashParams.get("type") === "recovery") {
        const access_token = hashParams.get("access_token")!;
        const refresh_token = hashParams.get("refresh_token") || "";
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (cancelado) return;
        setTokenValido(!error);
        setVerificandoToken(false);
        return;
      }

      // 4) Sessão já ativa (ex.: evento PASSWORD_RECOVERY já disparou)
      const { data } = await supabase.auth.getSession();
      if (cancelado) return;
      if (data.session) {
        setTokenValido(true);
      }
      setVerificandoToken(false);
    };

    processarLink();

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (novaSenha.length < 8) {
      setErro({
        title: "Senha muito curta",
        message: "A nova senha deve ter pelo menos 8 caracteres.",
      });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro({
        title: "Senhas não coincidem",
        message: "Digite a mesma senha nos dois campos.",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase();
      let friendly = error.message;
      if (msg.includes("weak_password") || msg.includes("pwned")) {
        friendly = "Essa senha é muito fraca ou já apareceu em vazamentos públicos. Use ao menos 8 caracteres, misturando letras, números e símbolos.";
      }
      setErro({
        title: "Não foi possível redefinir",
        message: friendly,
      });
      return toast.error("Erro ao redefinir senha");
    }

    setSucesso(true);
    toast.success("Senha redefinida com sucesso!");
  };

  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg" style={{ color: "var(--color-primary-light)" }}>
            ZapScout
          </span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-8">
          {verificandoToken ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Verificando link...</p>
            </div>
          ) : !tokenValido && !sucesso ? (
            <div className="text-center space-y-4">
              <div className="mx-auto grid place-items-center h-12 w-12 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <h1 className="text-2xl font-semibold">Link inválido ou expirado</h1>
              <p className="text-sm text-muted-foreground">
                O link de recuperação não é válido ou já expirou. Solicite um novo.
              </p>
              <Button asChild className="w-full">
                <Link to="/recuperar-senha">Solicitar novo link</Link>
              </Button>
            </div>
          ) : sucesso ? (
            <div className="text-center space-y-4">
              <div className="mx-auto grid place-items-center h-12 w-12 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-semibold">Senha redefinida!</h1>
              <p className="text-sm text-muted-foreground">
                Sua senha foi atualizada com sucesso. Agora você pode acessar sua conta.
              </p>
              <Button asChild className="w-full">
                <Link to="/login">Entrar na conta</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="grid place-items-center h-10 w-10 rounded-full bg-primary/10">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold">Nova senha</h1>
                  <p className="text-sm text-muted-foreground">Defina uma nova senha segura.</p>
                </div>
              </div>

              {erro && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{erro.title}</AlertTitle>
                  <AlertDescription>{erro.message}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha</Label>
                  <Input
                    id="nova-senha"
                    type="password"
                    required
                    minLength={8}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                  <Input
                    id="confirmar-senha"
                    type="password"
                    required
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Digite novamente"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {loading ? "Redefinindo..." : "Redefinir senha"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

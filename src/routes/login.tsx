import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Zap, Loader2, MailCheck, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { describeAuthError, logAuthEvent } from "@/lib/auth-logger";
import { precheckLogin, logLoginFailure } from "@/lib/auth-precheck.functions";
import { setKeepLogged, getKeepLogged } from "@/lib/session-persistence";


export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — ZapScout" },
      { name: "description", content: "Acesse sua conta ZapScout para prospectar clientes no mapa e disparar mensagens no WhatsApp." },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: "Entrar — ZapScout" },
      { property: "og:url", content: "/login" },
    ],
    links: [{ rel: "canonical", href: "/login" }],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/app" });
  },
  component: LoginPage,
});


function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [honeypot, setHoneypot] = useState(""); // Bots preenchem; humanos não
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [authError, setAuthError] = useState<{ title: string; message: string; confirmEmail?: boolean } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [keepLogged, setKeepLoggedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return getKeepLogged();
  });

  const normalizedEmail = email.trim().toLowerCase();

  const getFriendlyError = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes("email not confirmed")) {
      return {
        title: "Confirme seu email",
        message: "Sua conta foi criada, mas o email ainda não foi confirmado. Reenvie a confirmação ou abra o link enviado para sua caixa de entrada.",
        confirmEmail: true,
      };
    }
    if (lower.includes("invalid login credentials")) {
      return {
        title: "Email ou senha incorretos",
        message: "Confira se o email e a senha foram digitados exatamente como no cadastro.",
      };
    }
    return { title: "Não foi possível entrar", message };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    setKeepLogged(keepLogged);

    // Precheck: honeypot + rate limit por IP
    try {
      const pre = await precheckLogin({ data: { honeypot, email: normalizedEmail } });
      if (!pre.ok) {
        setLoading(false);
        setAuthError({ title: "Acesso bloqueado", message: pre.error });
        return toast.error(pre.error);
      }
    } catch (err) {
      // Falha aberta: se o precheck explodir, deixa o Supabase decidir
      console.warn("[login] precheck falhou:", err);
    }

    const started = performance.now();
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: senha });
    const durationMs = Math.round(performance.now() - started);
    setLoading(false);
    if (error) {
      const desc = describeAuthError(error);
      logAuthEvent({
        action: "sign_in",
        email: normalizedEmail,
        success: false,
        errorCode: desc.code,
        errorMessage: desc.message,
        status: desc.status,
        extra: { durationMs },
      });
      // Log de segurança server-side (IP, UA, motivo)
      void logLoginFailure({ data: { email: normalizedEmail, reason: desc.code || desc.message || "unknown" } }).catch(() => {});
      const friendlyError = getFriendlyError(error.message);
      setAuthError(friendlyError);
      return toast.error(friendlyError.title);
    }
    logAuthEvent({ action: "sign_in", email: normalizedEmail, success: true, extra: { durationMs } });
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/app" });
  };

  const resendConfirmation = async () => {
    if (!normalizedEmail) {
      setAuthError({ title: "Informe seu email", message: "Digite o email cadastrado para reenviar a confirmação.", confirmEmail: true });
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResending(false);
    if (error) {
      const desc = describeAuthError(error);
      logAuthEvent({
        action: "resend_confirmation",
        email: normalizedEmail,
        success: false,
        errorCode: desc.code,
        errorMessage: desc.message,
        status: desc.status,
      });
      const friendlyError = getFriendlyError(error.message);
      setAuthError(friendlyError);
      return toast.error(friendlyError.title);
    }
    logAuthEvent({ action: "resend_confirmation", email: normalizedEmail, success: true });
    toast.success("Email de confirmação reenviado.");
  };


  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg" style={{ color: "var(--color-primary-light)" }}>ZapScout</span>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="text-2xl font-semibold mb-1">Entrar</h1>
          <p className="text-sm text-muted-foreground mb-6">Acesse sua conta para prospectar.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            {authError && (
              <Alert variant={authError.confirmEmail ? "default" : "destructive"}>
                {authError.confirmEmail ? <MailCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>{authError.title}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{authError.message}</p>
                  {authError.confirmEmail && (
                    <Button type="button" variant="outline" size="sm" onClick={resendConfirmation} disabled={resending}>
                      {resending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Reenviar confirmação
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {/* Honeypot — invisível para humanos, bots costumam preencher */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor="website-hp">Não preencha este campo</label>
              <input
                type="text"
                id="website-hp"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="senha">Senha</Label>
                <Link to="/recuperar-senha" className="text-xs text-primary hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="senha"
                  type={showPassword ? "text" : "password"}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer">
              <Checkbox
                checked={keepLogged}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setKeepLoggedState(next);
                  setKeepLogged(next);
                }}
              />
              Manter-me conectado
            </label>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-6">
            Não tem conta? <Link to="/cadastro" className="text-primary hover:underline">Cadastre-se</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

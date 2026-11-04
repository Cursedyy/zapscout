import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Zap,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Eye,
  EyeOff,
  Mail,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { describeAuthError, logAuthEvent } from "@/lib/auth-logger";
import { validarTokenAcesso, redimirTokenAcesso } from "@/lib/acesso.functions";
import { precheckSignup } from "@/lib/auth-precheck.functions";
import { mensagemErroSenha, senhaRecusada } from "@/lib/auth-password-error";
import { PasswordRequirements } from "@/components/password-requirements";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/cadastro")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Criar conta — ZapScout" },
      {
        name: "description",
        content:
          "Crie sua conta ZapScout grátis e comece a prospectar clientes no mapa do Brasil hoje mesmo.",
      },
      { property: "og:title", content: "Criar conta — ZapScout" },
      {
        property: "og:description",
        content: "Crie sua conta ZapScout grátis e comece a prospectar clientes no mapa do Brasil.",
      },
      { property: "og:url", content: "/cadastro" },
    ],
    links: [{ rel: "canonical", href: "/cadastro" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { token } = useSearch({ from: "/cadastro" });
  if (token) return <TokenFlow token={token} />;
  return <FreeSignup />;
}

// ============================================================================
// Fluxo A: cliente que comprou na Kiwify (?token=xxx)
// ============================================================================
function TokenFlow({ token }: { token: string }) {
  const navigate = useNavigate();
  const validar = useServerFn(validarTokenAcesso);
  const redimir = useServerFn(redimirTokenAcesso);

  const [estado, setEstado] = useState<"validando" | "ok" | "invalido">("validando");
  const [dados, setDados] = useState<{ nome: string; email: string; plano: string } | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await validar({ data: { token } });
        if (cancelled) return;
        if (res.ok) {
          setDados({ nome: res.nome, email: res.email, plano: res.plano });
          setEstado("ok");
        } else {
          setEstado("invalido");
        }
      } catch {
        if (!cancelled) setEstado("invalido");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, validar]);

  const confirmarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (senha !== confirmar) return toast.error("As senhas não coincidem.");
    if (!dados) return;

    setSubmitting(true);
    try {
      await redimir({ data: { token, senha } });
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: dados.email,
        password: senha,
      });
      if (loginErr) {
        toast.error("Senha criada, mas falha ao entrar. Vá para o login.");
        navigate({ to: "/login" });
        return;
      }
      toast.success("Acesso liberado!");
      navigate({ to: "/app", search: { welcome: "true" } as never });
    } catch (err) {
      toast.error(err instanceof Error ? mensagemErroSenha(err) : "Erro ao definir senha");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span
            className="font-display font-bold text-lg"
            style={{ color: "var(--color-primary-light)" }}
          >
            ZapScout
          </span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-8">
          {estado === "validando" && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <h1 className="text-lg font-semibold">Verificando seu acesso…</h1>
              <p className="text-sm text-muted-foreground mt-1">Aguarde um momento.</p>
            </div>
          )}

          {estado === "invalido" && (
            <div className="text-center py-4">
              <div className="grid place-items-center h-12 w-12 rounded-full bg-destructive/15 mx-auto mb-4">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <h1 className="text-lg font-semibold">Link inválido ou expirado</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Este link de acesso não é mais válido. Entre em contato com o suporte ou acesse sua
                conta.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button asChild variant="outline">
                  <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/login">Ir para o login</Link>
                </Button>
              </div>
            </div>
          )}

          {estado === "ok" && dados && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <h1 className="text-xl font-semibold">Sua compra foi confirmada!</h1>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Plano ZapScout{" "}
                <span className="font-medium text-foreground">{dados.plano.toUpperCase()}</span>{" "}
                ativado. Crie sua senha para começar.
              </p>

              <form onSubmit={confirmarSenha} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={dados.nome} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={dados.email} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="senha">Crie sua senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    autoComplete="new-password"
                    aria-describedby="token-password-requisitos"
                    required
                    minLength={8}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar">Confirme sua senha</Label>
                  <Input
                    id="confirmar"
                    type="password"
                    autoComplete="new-password"
                    aria-describedby="token-password-requisitos"
                    required
                    minLength={8}
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                  />
                </div>
                <PasswordRequirements
                  senha={senha}
                  confirmar={confirmar}
                  id="token-password-requisitos"
                />
                <Button type="submit" className="w-full bg-gradient-primary" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar minha senha e entrar →
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Fluxo B: cadastro grátis (sem token)
// ============================================================================
function FreeSignup() {
  const navigate = useNavigate();
  // Verificação prévia de email removida: revelava se o email estava cadastrado (enumeração).
  // O próprio supabase.auth.signUp trata duplicatas com mensagem genérica.
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [emailJaExiste, setEmailJaExiste] = useState(false);
  const [submitErro, setSubmitErro] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [resending, setResending] = useState(false);

  const traduzErroSignup = (err: { message?: string; code?: string; status?: number }) => {
    const msg = (err.message ?? "").toLowerCase();
    if (senhaRecusada(err)) return mensagemErroSenha(err);
    if (msg.includes("rate") || err.status === 429) {
      return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
    }
    if (msg.includes("invalid") && msg.includes("email")) {
      return "Email inválido. Verifique e tente novamente.";
    }
    return err.message || "Não foi possível criar a conta. Tente novamente.";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setSubmitErro(null);

    try {
      // Precheck: honeypot + rate limit por IP/email
      const pre = await precheckSignup({ data: { honeypot, email: email.trim().toLowerCase() } });
      if (!pre.ok) {
        setSubmitErro(pre.error);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      const redirectUrl = `${window.location.origin}/auth/callback`;
      const started = performance.now();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: senha,
        options: { emailRedirectTo: redirectUrl, data: { nome } },
      });
      const durationMs = Math.round(performance.now() - started);

      if (error) {
        const desc = describeAuthError(error);
        logAuthEvent({
          action: "sign_up",
          email: normalizedEmail,
          success: false,
          errorCode: desc.code,
          errorMessage: desc.message,
          status: desc.status,
          extra: { durationMs },
        });
        const msg = error.message?.toLowerCase() ?? "";
        if (msg.includes("registered") || msg.includes("already") || msg.includes("exists")) {
          setEmailJaExiste(true);
          setEmailErro("Este email já tem uma conta.");
          return;
        }
        const traduzido = traduzErroSignup(error);
        setSubmitErro(traduzido);
        toast.error(traduzido);
        return;
      }

      // 2) Fallback: Supabase devolve sucesso silencioso para email já confirmado
      // (identities vazio indica usuário pré-existente)
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setEmailJaExiste(true);
        setEmailErro("Este email já tem uma conta.");
        return;
      }

      logAuthEvent({
        action: "sign_up",
        email: normalizedEmail,
        success: true,
        extra: { durationMs },
      });
      if (data.session) {
        await navigate({ to: "/app", search: { welcome: "true" } as never });
        return;
      }
      setSignupComplete(true);
    } catch {
      const message =
        "Não foi possível concluir o cadastro agora. Verifique sua conexão e tente novamente.";
      setSubmitErro(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error)
        toast.error("Não foi possível reenviar agora. Aguarde um pouco e tente novamente.");
      else toast.success("Se o cadastro estiver pendente, um novo email será enviado.");
    } catch {
      toast.error("Não foi possível reenviar agora. Verifique sua conexão e tente novamente.");
    } finally {
      setResending(false);
    }
  };

  if (signupComplete) {
    return (
      <div className="min-h-dvh grid place-items-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
            <Mail className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">Confirme seu email</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Enviamos um link de confirmação. Abra-o no mesmo navegador para liberar sua conta.
          </p>
          <div className="mt-6 space-y-2">
            <Button asChild className="w-full">
              <Link to="/login">Já confirmei — entrar</Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={resendConfirmation}
              disabled={resending}
            >
              <RefreshCw className={resending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Reenviar
              email
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Confira também as pastas Spam e Promoções.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-background p-6">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-gradient-primary shadow-glow">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span
            className="font-display font-bold text-lg"
            style={{ color: "var(--color-primary-light)" }}
          >
            ZapScout
          </span>
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="text-2xl font-semibold mb-1">Criar conta grátis</h1>
          <p className="text-sm text-muted-foreground mb-6">Comece a prospectar em minutos.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Honeypot — invisível para humanos */}
            <div hidden aria-hidden="true">
              <label htmlFor="signup-website-check">Não preencha este campo</label>
              <input
                type="text"
                id="signup-website-check"
                name="signup_website_check"
                tabIndex={-1}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                autoComplete="name"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailErro) {
                    setEmailErro(null);
                    setEmailJaExiste(false);
                  }
                }}
                onBlur={() => {
                  /* verificação prévia removida para evitar enumeração de emails */
                }}
                aria-invalid={emailJaExiste || undefined}
                className={emailJaExiste ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {emailErro && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    {emailErro}{" "}
                    <Link to="/login" className="underline font-medium">
                      Entrar na minha conta →
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-describedby="signup-password-requisitos"
                  required
                  minLength={8}
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    if (submitErro) setSubmitErro(null);
                  }}
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
              <p className="text-xs text-muted-foreground">
                Use uma senha exclusiva para esta conta.
              </p>
              <PasswordRequirements senha={senha} id="signup-password-requisitos" />
            </div>
            {submitErro && (
              <div className="flex items-start gap-2 text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>{submitErro}</div>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || emailJaExiste}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Criando..." : "Criar conta"}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Já tem conta?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Quer mais recursos?{" "}
            <Link to="/planos" className="text-primary hover:underline">
              Ver planos pagos
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

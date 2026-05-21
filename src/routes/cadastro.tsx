import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Loader2, CheckCircle2, AlertCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { describeAuthError, logAuthEvent } from "@/lib/auth-logger";
import { validarTokenAcesso, redimirTokenAcesso, verificarEmailExiste } from "@/lib/acesso.functions";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/cadastro")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Criar conta — ZapScout" },
      { name: "description", content: "Crie sua conta ZapScout grátis e comece a prospectar clientes no mapa do Brasil hoje mesmo." },
      { property: "og:title", content: "Criar conta — ZapScout" },
      { property: "og:description", content: "Crie sua conta ZapScout grátis e comece a prospectar clientes no mapa do Brasil." },
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
      navigate({ to: "/app", search: { welcome: "true" } as any });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao definir senha");
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
          <span className="font-display font-bold text-lg" style={{ color: "var(--color-primary-light)" }}>ZapScout</span>
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
                Este link de acesso não é mais válido. Entre em contato com o suporte ou acesse sua conta.
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
                Plano ZapScout <span className="font-medium text-foreground">{dados.plano.toUpperCase()}</span> ativado. Crie sua senha para começar.
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
                  <Input id="senha" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar">Confirme sua senha</Label>
                  <Input id="confirmar" type="password" required minLength={8} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
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
  const verificarEmail = useServerFn(verificarEmailExiste);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [emailJaExiste, setEmailJaExiste] = useState(false);
  const [verificandoEmail, setVerificandoEmail] = useState(false);

  const checarEmail = async (valor: string) => {
    const normalized = valor.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailErro(null);
      setEmailJaExiste(false);
      return false;
    }
    setVerificandoEmail(true);
    try {
      const { existe } = await verificarEmail({ data: { email: normalized } });
      setEmailJaExiste(existe);
      setEmailErro(existe ? "Este email já tem uma conta." : null);
      return existe;
    } catch {
      return false;
    } finally {
      setVerificandoEmail(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    // 1) Pré-check via servidor (admin) — bloqueia duplicata
    const existe = await checarEmail(normalizedEmail);
    if (existe) {
      setLoading(false);
      return;
    }

    const redirectUrl = `${window.location.origin}/app`;
    const started = performance.now();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: senha,
      options: { emailRedirectTo: redirectUrl, data: { nome } },
    });
    const durationMs = Math.round(performance.now() - started);
    setLoading(false);

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
      return toast.error(error.message);
    }

    // 2) Fallback: Supabase devolve sucesso silencioso para email já confirmado
    // (identities vazio indica usuário pré-existente)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setEmailJaExiste(true);
      setEmailErro("Este email já tem uma conta.");
      return;
    }

    logAuthEvent({ action: "sign_up", email: normalizedEmail, success: true, extra: { durationMs } });
    toast.success("Conta criada! Verifique seu email para confirmar.");
    navigate({ to: "/login" });
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
          <h1 className="text-2xl font-semibold mb-1">Criar conta grátis</h1>
          <p className="text-sm text-muted-foreground mb-6">Comece a prospectar em minutos.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailErro) {
                    setEmailErro(null);
                    setEmailJaExiste(false);
                  }
                }}
                onBlur={(e) => checarEmail(e.target.value)}
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
              <Input id="senha" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading || verificandoEmail || emailJaExiste}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Criando..." : verificandoEmail ? "Verificando email..." : "Criar conta"}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
          </p>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Quer mais recursos? <Link to="/planos" className="text-primary hover:underline">Ver planos pagos</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { describeAuthError, logAuthEvent } from "@/lib/auth-logger";


export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — ZapScout" },
      { name: "description", content: "Crie sua conta ZapScout grátis e comece a prospectar clientes no mapa do Brasil hoje mesmo." },
      { property: "og:title", content: "Criar conta — ZapScout" },
      { property: "og:description", content: "Crie sua conta ZapScout grátis e comece a prospectar clientes no mapa do Brasil." },
      { property: "og:url", content: "/cadastro" },
      { name: "twitter:title", content: "Criar conta — ZapScout" },
      { name: "twitter:description", content: "Crie sua conta grátis e comece a prospectar no mapa do Brasil." },
    ],
    links: [{ rel: "canonical", href: "/cadastro" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const redirectUrl = `${window.location.origin}/app`;
    const normalizedEmail = email.trim().toLowerCase();
    const started = performance.now();
    const { error } = await supabase.auth.signUp({
      email: normalizedEmail, password: senha,
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
      return toast.error(error.message);
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
          <h1 className="text-2xl font-semibold mb-1">Criar conta</h1>
          <p className="text-sm text-muted-foreground mb-6">Comece a prospectar em minutos.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {loading ? "Criando..." : "Criar conta"}
            </Button>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-6">
            Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

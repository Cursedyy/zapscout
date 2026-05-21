import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Zap, Loader2, MailCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — ZapScout" },
      { name: "description", content: "Recupere o acesso à sua conta ZapScout." },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: "Recuperar senha — ZapScout" },
      { property: "og:url", content: "/recuperar-senha" },
    ],
    links: [{ rel: "canonical", href: "/recuperar-senha" }],
  }),
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<{ title: string; message: string } | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setErro({
        title: "Não foi possível enviar",
        message: error.message,
      });
      return toast.error("Erro ao enviar email de recuperação");
    }

    setEnviado(true);
    toast.success("Email enviado! Verifique sua caixa de entrada.");
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
          {!enviado ? (
            <>
              <h1 className="text-2xl font-semibold mb-1">Recuperar senha</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>

              {erro && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{erro.title}</AlertTitle>
                  <AlertDescription>{erro.message}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center space-y-4">
              <div className="mx-auto grid place-items-center h-12 w-12 rounded-full bg-primary/10">
                <MailCheck className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold">Verifique seu email</h1>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de recuperação para <strong>{normalizedEmail}</strong>. Abra-o para definir uma nova senha.
              </p>
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center mt-6">
            <Link to="/login" className="text-primary hover:underline">Voltar para o login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

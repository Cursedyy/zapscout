import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConviteInfluenciadoresMimo } from "@/components/mimo-influenciadores-compartilhar";
import {
  inscricaoInfluenciadorSchema,
  NICHOS_INFLUENCIADORES,
  PARCERIAS_INFLUENCIADORES,
  UFS,
  ESTADOS_EUA,
  VIEWS_INFLUENCIADORES,
} from "@/lib/mimo-influenciadores";

export function MimoInfluenciadoresForm() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    const campos = Object.fromEntries(new FormData(event.currentTarget));
    const validacao = inscricaoInfluenciadorSchema.safeParse({
      ...campos,
      seguidores: Number(campos.seguidores),
      consentimento: campos.consentimento === "on",
    });
    if (!validacao.success) {
      setErro(validacao.error.issues[0].message);
      const nomeCampo = validacao.error.issues[0].path[0];
      const campo = event.currentTarget.querySelector<HTMLElement>(`[name="${nomeCampo}"]`);
      campo?.focus();
      campo?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      return;
    }
    setEnviando(true);
    setErro("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/public/mimo-influenciadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validacao.data),
        signal: controller.signal,
      });
      const resposta = await res.json();
      if (!res.ok)
        throw new Error(resposta.mensagem || "Não foi possível enviar. Tente novamente.");
      setSucesso(resposta.mensagem);
    } catch (e) {
      setErro(
        controller.signal.aborted
          ? "A conexão demorou para responder. Não foi possível confirmar o envio. Suas respostas foram mantidas; confira a conexão e tente novamente."
          : e instanceof TypeError || e instanceof SyntaxError
            ? "Não foi possível confirmar o envio. Suas respostas foram mantidas; confira a conexão e tente novamente."
            : e instanceof Error
              ? e.message
              : "Confira sua conexão e tente novamente.",
      );
    } finally {
      window.clearTimeout(timeout);
      setEnviando(false);
    }
  }
  return (
    <main className="mimo-app min-h-dvh bg-background px-4 py-10 text-foreground sm:py-16">
      <div className="mx-auto max-w-xl">
        <p className="font-display text-4xl font-bold tracking-tight">
          MiMo<span className="text-primary">.</span>
        </p>
        <p className="mt-1 font-display italic text-primary">Esse Pode!</p>
        <div className="mb-7 mt-9">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
            <Sparkles className="h-4 w-4" /> Lançamentos de novembro
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Seu conteúdo pode fazer parte da nossa história.
          </h1>
          <p className="mt-3 text-muted-foreground">Cadastro de Influenciadoras | Campanha MiMo</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Conte um pouco sobre você em cerca de 2 minutos. A inscrição é gratuita, passa por
            avaliação e não garante participação. Não é preciso criar conta.
          </p>
        </div>
        {sucesso ? (
          <>
            <section role="status" className="rounded-2xl border bg-card p-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-4 text-2xl font-semibold">Recebemos sua inscrição!</h2>
              <p className="mt-3 text-muted-foreground">{sucesso}</p>
            </section>
            <ConviteInfluenciadoresMimo />
          </>
        ) : (
          <form
            onSubmit={enviar}
            method="post"
            action="/api/public/mimo-influenciadores"
            className="space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-8"
          >
            <noscript>
              <p className="text-sm text-muted-foreground">
                Você pode preencher e enviar normalmente. A confirmação abrirá em uma nova página.
              </p>
            </noscript>
            {erro && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
              >
                {erro}
              </p>
            )}
            <label className="block space-y-2">
              <span className="text-sm font-medium">1. Nome completo</span>
              <Input
                name="nome"
                autoComplete="name"
                placeholder="Seu nome"
                required
                minLength={3}
                maxLength={150}
              />
            </label>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">2. Perfil do Instagram ou TikTok</legend>
              <div className="flex gap-5">
                {["Instagram", "TikTok"].map((rede, index) => (
                  <label key={rede} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="rede" value={rede} defaultChecked={!index} required />
                    {rede}
                  </label>
                ))}
              </div>
              <Input
                name="perfil"
                aria-label="Seu perfil na rede escolhida"
                placeholder="@seuperfil"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={200}
              />
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">3. Cidade e estado</legend>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
                <Input
                  name="cidade"
                  aria-label="Cidade"
                  autoComplete="address-level2"
                  placeholder="Cidade"
                  required
                  minLength={2}
                  maxLength={100}
                />
                <select
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                  name="uf"
                  aria-label="Estado"
                  autoComplete="address-level1"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    UF
                  </option>
                  <optgroup label="Brasil">
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Estados Unidos">
                    {ESTADOS_EUA.map(({ uf, nome }) => (
                      <option key={uf} value={uf}>
                        {nome} ({uf.slice(3)})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </fieldset>
            <label className="block space-y-2">
              <span className="text-sm font-medium">
                4. Quantos seguidores você tem nessa rede?
              </span>
              <Input
                type="number"
                name="seguidores"
                inputMode="numeric"
                min={0}
                max={1000000000}
                step={1}
                placeholder="Ex.: 12500"
                required
              />
              <span className="block text-xs text-muted-foreground">
                Informe o número aproximado, sem pontos. Ex.: 12500 para 12,5 mil.
              </span>
            </label>
            <Opcoes
              titulo="5. Quantas visualizações seus vídeos têm, em média?"
              name="visualizacoes"
              opcoes={VIEWS_INFLUENCIADORES}
            />
            <Opcoes
              titulo="6. Qual é o seu principal tipo de conteúdo?"
              name="nicho"
              opcoes={NICHOS_INFLUENCIADORES}
            />
            <Opcoes
              titulo="7. Qual formato de parceria você aceita?"
              name="parceria"
              opcoes={PARCERIAS_INFLUENCIADORES}
            />
            <label className="block space-y-2">
              <span className="text-sm font-medium">8. WhatsApp com DDD</span>
              <Input
                name="whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                required
                maxLength={22}
              />
              <span className="block text-xs text-muted-foreground">
                Usaremos este contato para falar sobre a seleção.
              </span>
            </label>
            <div className="absolute -left-[10000px]" aria-hidden="true">
              <label>
                Site
                <input name="site" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <p>
                Suas respostas ficarão restritas à equipe autorizada da MiMo para avaliar seu perfil
                e organizar esta campanha. Seguidores e visualizações são informações declaradas por
                você. Para solicitar correção ou exclusão, use o canal oficial da MiMo pelo qual
                recebeu este convite.
              </p>
              <label className="mt-3 flex items-start gap-3 text-sm text-foreground">
                <input type="checkbox" name="consentimento" required className="mt-1" />
                <span>
                  Concordo com o uso dos meus dados para esta seleção e autorizo contato sobre a
                  campanha MiMo.
                </span>
              </label>
            </div>
            <Button type="submit" disabled={enviando} className="w-full">
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              {enviando ? "Enviando inscrição…" : "Quero participar da campanha MiMo"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          MiMo · Conteúdo que conecta.
        </p>
      </div>
    </main>
  );
}
function Opcoes({
  titulo,
  name,
  opcoes,
}: {
  titulo: string;
  name: string;
  opcoes: readonly string[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{titulo}</legend>
      {opcoes.map((opcao) => (
        <label
          key={opcao}
          className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
        >
          <input type="radio" name={name} value={opcao} required />
          {opcao}
        </label>
      ))}
    </fieldset>
  );
}

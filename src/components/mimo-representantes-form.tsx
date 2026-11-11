import { useState, type FormEvent } from "react";
import { CheckCircle2, Handshake, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CORE_REP,
  DISPONIBILIDADES_REP,
  EXPERIENCIAS_REP,
  SEGMENTOS_REP,
  UFS,
  inscricaoRepresentanteSchema,
} from "@/lib/mimo-representantes";
export function MimoRepresentantesForm() {
  const [enviando, setEnviando] = useState(false),
    [erro, setErro] = useState(""),
    [sucesso, setSucesso] = useState("");
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const f = new FormData(e.currentTarget);
    const dados = inscricaoRepresentanteSchema.safeParse({
      ...Object.fromEntries(f),
      segmentos: f.getAll("segmentos"),
      carteira_clientes: Number(f.get("carteira_clientes")),
      consentimento: f.get("consentimento") === "on",
    });
    if (!dados.success) {
      setErro(dados.error.issues[0].message);
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/public/mimo-representantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados.data),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.mensagem || "Não foi possível enviar. Tente novamente.");
      setSucesso(b.mensagem);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Confira sua conexão e tente novamente.");
    } finally {
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
            <Handshake className="h-4 w-4" />
            Representantes MiMo
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Leve a MiMo para novos caminhos.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Conte sobre sua atuação comercial e seu interesse em representar a marca. O cadastro
            leva poucos minutos e será avaliado pela nossa equipe.
          </p>
        </div>
        {sucesso ? (
          <section role="status" className="rounded-2xl border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
            <h2 className="mt-4 text-2xl font-semibold">Cadastro recebido!</h2>
            <p className="mt-3 text-muted-foreground">{sucesso}</p>
          </section>
        ) : (
          <form
            onSubmit={enviar}
            className="space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-8"
          >
            <Campo label="Nome completo">
              <Input
                name="nome"
                autoComplete="name"
                required
                minLength={3}
                maxLength={150}
                placeholder="Seu nome"
              />
            </Campo>
            <Campo label="E-mail">
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="voce@exemplo.com.br"
              />
            </Campo>
            <Campo label="WhatsApp com DDD">
              <Input
                name="whatsapp"
                type="tel"
                autoComplete="tel"
                required
                maxLength={22}
                placeholder="(11) 99999-9999"
              />
            </Campo>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Cidade e estado</legend>
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <Input
                  name="cidade"
                  aria-label="Cidade"
                  autoComplete="address-level2"
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Cidade"
                />
                <select
                  name="uf"
                  aria-label="Estado"
                  required
                  defaultValue=""
                  className="h-10 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="" disabled>
                    UF
                  </option>
                  {UFS.map((uf) => (
                    <option key={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            </fieldset>
            <Campo label="Região de atuação">
              <Input
                name="regiao_atuacao"
                required
                minLength={2}
                maxLength={500}
                placeholder="Cidades ou regiões onde atua ou pretende atuar"
              />
            </Campo>
            <Escolha
              label="Experiência com representação ou vendas"
              name="experiencia"
              opcoes={EXPERIENCIAS_REP}
            />
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                Quais segmentos atende ou deseja atender?
              </legend>
              {Object.entries(SEGMENTOS_REP).map(([v, label]) => (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input type="checkbox" name="segmentos" value={v} />
                  {label}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">Selecione pelo menos uma opção.</p>
            </fieldset>
            <Campo label="Quantos clientes ativos tem na carteira?">
              <Input
                type="number"
                name="carteira_clientes"
                min={0}
                max={10000000}
                step={1}
                inputMode="numeric"
                required
                placeholder="Informe 0 se está começando"
              />
            </Campo>
            <Campo label="Marcas que representa atualmente (opcional)">
              <Input
                name="marcas_atuais"
                maxLength={1000}
                placeholder="Nomes das marcas ou empresas"
              />
            </Campo>
            <Escolha label="Possui registro no CORE?" name="core" opcoes={CORE_REP} />
            <Escolha
              label="Disponibilidade para iniciar"
              name="disponibilidade"
              opcoes={DISPONIBILIDADES_REP}
            />
            <div className="absolute -left-[10000px]" aria-hidden="true">
              <label>
                Site
                <input name="site" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
              <p>
                Suas respostas serão usadas pela equipe autorizada da MiMo para avaliar esta
                candidatura e entrar em contato. A inscrição não garante aprovação. As condições da
                parceria serão apresentadas pela equipe durante a seleção. Para solicitar correção
                ou exclusão, use o canal oficial MiMo pelo qual recebeu este convite.
              </p>
              <label className="mt-3 flex items-start gap-3 text-sm text-foreground">
                <input type="checkbox" name="consentimento" required className="mt-1" />
                <span>
                  Concordo com o uso dos meus dados nesta seleção e autorizo o contato da MiMo.
                </span>
              </label>
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <Button type="submit" disabled={enviando} className="w-full">
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              {enviando ? "Enviando cadastro…" : "Quero representar a MiMo"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          MiMo · Novas conexões, novos caminhos.
        </p>
      </div>
    </main>
  );
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
function Escolha({
  label,
  name,
  opcoes,
}: {
  label: string;
  name: string;
  opcoes: Record<string, string>;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <select
        name={name}
        required
        defaultValue=""
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="" disabled>
          Selecione uma opção
        </option>
        {Object.entries(opcoes).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

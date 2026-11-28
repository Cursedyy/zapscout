import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CANAIS_REVENDA, PRAZOS_REVENDA, UFS, revendaSchema } from "@/lib/mimo-revenda";
import { comPrazoConexao } from "@/lib/prazo-conexao";
export function MimoRevendaForm() {
  const [interesse, setInteresse] = useState(""), [investimento, setInvestimento] = useState("");
  const [enviando, setEnviando] = useState(false), [erro, setErro] = useState(""), [destino, setDestino] = useState("");
  const envio = useRef<string | null>(null);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (enviando) return;
    envio.current ??= crypto.randomUUID();
    const f = new FormData(e.currentTarget), query = new URLSearchParams(window.location.search);
    const validacao = revendaSchema.safeParse({ ...Object.fromEntries(f), envio_id: envio.current, consentimento: f.get("consentimento") === "on",
      utm_source: query.get("utm_source")?.slice(0,100) || "", utm_campaign: query.get("utm_campaign")?.slice(0,150) || "", utm_content: query.get("utm_content")?.slice(0,150) || "" });
    if (!validacao.success) { setErro(validacao.error.issues[0]?.message || "Confira os campos."); return; }
    setEnviando(true); setErro("");
    try {
      const b = await comPrazoConexao(async signal => {
        const r = await fetch("/api/public/mimo-revenda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validacao.data), signal });
        const resposta = await r.json();
        if (!r.ok) throw Error(resposta.mensagem || "Não foi possível enviar.");
        if (typeof resposta.whatsapp !== "string" || !/^https:\/\/wa\.me\/55\d{10,11}\?text=/.test(resposta.whatsapp)) throw Error("Não foi possível confirmar o atendimento.");
        return resposta;
      }, 15000);
      setDestino(b.whatsapp);
    } catch (e) { setErro(e instanceof Error ? e.message : "Confira sua conexão e tente novamente."); }
    finally { setEnviando(false); }
  }
  return <main className="mimo-app min-h-dvh bg-background px-4 py-10 text-foreground sm:py-16"><div className="mx-auto max-w-xl">
    <p className="font-display text-4xl font-bold tracking-tight">MiMo<span className="text-primary">.</span></p><p className="mt-1 font-display italic text-primary">Esse Pode!</p>
    <header className="mb-7 mt-8"><p className="text-sm font-semibold uppercase tracking-wider text-primary">Compre para revender</p><h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Leve a MiMo para seus clientes.</h1><p className="mt-4 text-muted-foreground">Conte como pretende revender. Nossa equipe recebe suas respostas para continuar o atendimento pelo WhatsApp.</p>
      <p className="mt-5 rounded-xl border border-primary/30 bg-primary/10 p-4 font-semibold">Pedido inicial mínimo: R$ 1.000,00</p><p className="mt-2 text-xs text-muted-foreground">Frete, pagamento e disponibilidade serão confirmados pela equipe.</p></header>
    {destino ? <section role="status" className="rounded-2xl border bg-card p-7"><CheckCircle2 className="h-10 w-10 text-primary"/><h2 className="mt-4 text-2xl font-semibold">Cadastro recebido!</h2><p className="mt-3 text-muted-foreground">Agora abra o WhatsApp e envie a mensagem preparada com suas respostas para começar a conversa.</p><a href={destino} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary p-3 font-semibold text-primary-foreground">Falar com a equipe no WhatsApp <ArrowRight className="h-4 w-4"/></a></section>
    : <form onSubmit={enviar} onChange={() => { envio.current = null; setErro(""); }} className="space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
      <fieldset disabled={enviando} className="space-y-6">
      <Campo label="O que você procura?"><select name="interesse" required value={interesse} onChange={e => setInteresse(e.target.value)} className={seletor}><option value="" disabled>Selecione</option><option value="revenda">Comprar produtos para revender</option><option value="representante">Trabalhar como representante</option></select></Campo>
      {interesse === "representante" && <div role="status" className="rounded-xl bg-primary/10 p-4"><p>Temos um cadastro específico para representantes comerciais.</p><a className="mt-3 inline-block font-semibold text-primary underline" href="/representantes">Ir para o formulário de representantes</a></div>}
      {interesse === "revenda" && <>
        <Campo label="Onde pretende revender?"><select name="canal" required defaultValue="" className={seletor}><option value="" disabled>Selecione</option>{Object.entries(CANAIS_REVENDA).map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></Campo>
        <div className="grid grid-cols-[1fr_90px] gap-3"><Campo label="Cidade"><Input name="cidade" required minLength={2} maxLength={100} autoComplete="address-level2"/></Campo><Campo label="Estado"><select name="uf" required defaultValue="" className={seletor}><option value="" disabled>UF</option>{UFS.map(uf => <option key={uf}>{uf}</option>)}</select></Campo></div>
        <Campo label="O pedido inicial mínimo é de R$ 1.000,00. Esse valor está dentro do que pretende investir?"><select name="investimento" required value={investimento} onChange={e => setInvestimento(e.target.value)} className={seletor}><option value="" disabled>Selecione</option><option value="sim">Sim, está dentro do que pretendo investir</option><option value="nao">Ainda não está no meu planejamento</option></select></Campo>
        {investimento === "nao" && <p role="status" className="rounded-xl bg-muted p-4 text-sm">Obrigado pelo interesse na MiMo! Quando o pedido inicial de R$ 1.000,00 fizer parte do seu planejamento, volte por aqui para conversar com nossa equipe.</p>}
        {investimento === "sim" && <>
          <Campo label="Quando pretende fazer o primeiro pedido?"><select name="prazo" required defaultValue="" className={seletor}><option value="" disabled>Selecione</option>{Object.entries(PRAZOS_REVENDA).map(([v,n]) => <option key={v} value={v}>{n}</option>)}</select></Campo>
          <Campo label="Seu nome"><Input name="nome" required minLength={3} maxLength={150} autoComplete="name"/></Campo>
          <Campo label="WhatsApp com DDD"><Input name="whatsapp" type="tel" required maxLength={25} placeholder="(11) 99999-9999" autoComplete="tel"/></Campo>
          <div aria-hidden="true" className="absolute -left-[10000px]"><label>Site<Input name="site" tabIndex={-1} autoComplete="off"/></label></div>
          <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" name="consentimento" required/><span>Autorizo a MiMo a usar estas respostas e meu WhatsApp para avaliar meu interesse em revenda e entrar em contato sobre esta solicitação.</span></label>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Como usamos seus dados</summary><p className="mt-2">Nome, WhatsApp, cidade, estado e respostas ficam no painel da equipe MiMo para atender esta solicitação. O link para o WhatsApp leva as respostas preenchidas na mensagem; você decide enviá-la. Você pode solicitar correção ou exclusão dos dados pelo próprio atendimento MiMo.</p></details>
          <Button type="submit" className="min-h-12 w-full" disabled={enviando}>{enviando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Enviando…</> : "Enviar e continuar para o WhatsApp"}</Button>
        </>}
      </>}
      </fieldset>{erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </form>}
  </div></main>;
}
const seletor = "min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm";
function Campo({label,children}: {label: string; children: ReactNode}) { return <label className="grid gap-2 text-sm font-medium"><span>{label}</span>{children}</label>; }


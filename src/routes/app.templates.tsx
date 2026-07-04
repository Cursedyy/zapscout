import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Sparkles, Loader2, Eye, Check, TrendingUp, Trash2, User } from "lucide-react";
import { useStore, usePlano } from "@/store/app-store";
import { renderTemplate, type Template } from "@/data/templates";
import { UpgradeModal } from "@/components/upgrade-modal";
import { toast } from "sonner";

export const Route = createFileRoute("/app/templates")({
  head: () => ({ meta: [{ title: "Biblioteca de Scripts — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TemplatesPage,
});

const EXEMPLO = { nome: "Clínica Sorriso Pleno", cidade: "São Paulo - SP", nicho: "clínica odontológica", avaliacao: 4.6, telefone: "(11) 99999-0000", endereco: "Av. Paulista, 1000" };
const VARS_HINT = "{{nome}}, {{cidade}}, {{nicho}}, {{avaliacao}}, {{telefone}}, {{endereco}}";

type Categoria = "Prospecção" | "Follow-up" | "Reativação";
type ScriptTpl = {
  id: string;
  nome: string;
  nicho: string;
  categoria: Categoria;
  taxaResposta: number;
  mensagem: string;
};

const SCRIPTS: ScriptTpl[] = [
  {
    id: "s1", nome: "Abordagem direta — Academia", nicho: "Academia", categoria: "Prospecção", taxaResposta: 38,
    mensagem: `Olá! Vi a {{nome}} no Google Maps com ótima avaliação ({{avaliacao}}★). Ajudo academias em {{cidade}} a lotar a agenda de matrículas com tráfego pago. Posso te mostrar um case de uma academia parecida em 5 min?`,
  },
  {
    id: "s2", nome: "Primeiro contato — Clínica Odonto", nicho: "Clínica", categoria: "Prospecção", taxaResposta: 42,
    mensagem: `Oi! Encontrei a {{nome}} no Google e percebi que dá pra atrair muito mais pacientes particulares. Trabalho só com clínicas odontológicas em {{cidade}}. Posso te enviar um diagnóstico gratuito?`,
  },
  {
    id: "s3", nome: "Restaurante sem site", nicho: "Restaurante", categoria: "Prospecção", taxaResposta: 27,
    mensagem: `Oi! Vi o {{nome}} no Google Maps — cardápio incrível! Notei que vocês ainda não têm site próprio pra delivery. Posso te mostrar como restaurantes parecidos dobraram pedidos sem depender de iFood?`,
  },
  {
    id: "s4", nome: "Imobiliária — leads quentes", nicho: "Imobiliária", categoria: "Prospecção", taxaResposta: 31,
    mensagem: `Olá! Sou especialista em geração de leads para imobiliárias em {{cidade}}. Vi a {{nome}} e tenho um método que entrega entre 30-50 leads qualificados/mês. Te interessa um teste?`,
  },
  {
    id: "s5", nome: "Lembrete suave (3 dias)", nicho: "Geral", categoria: "Follow-up", taxaResposta: 22,
    mensagem: `Oi! Te mandei uma mensagem há alguns dias sobre marketing para a {{nome}} e imagino que você esteja corrido. Faz sentido a gente conversar essa semana? Prometo ser breve 🙂`,
  },
  {
    id: "s6", nome: "Follow-up com case", nicho: "Geral", categoria: "Follow-up", taxaResposta: 29,
    mensagem: `Olá novamente! Fechei semana passada com uma {{nicho}} parecida com a {{nome}} aqui em {{cidade}} — em 14 dias geramos 23 novos clientes. Posso te mostrar exatamente o que fizemos?`,
  },
  {
    id: "s7", nome: "Reativação — cliente antigo", nicho: "Salão de beleza", categoria: "Reativação", taxaResposta: 18,
    mensagem: `Oi! Faz um tempo que a gente não conversa sobre a {{nome}}. Lancei um novo serviço focado em salões de beleza com resultado garantido em 30 dias. Topa dar uma olhada?`,
  },
  {
    id: "s8", nome: "Volta com oferta — Energia Solar", nicho: "Energia Solar", categoria: "Reativação", taxaResposta: 24,
    mensagem: `Olá! Vi que conversamos há um tempo sobre a {{nome}}. Estamos com uma condição especial pra empresas de energia solar em {{cidade}} esse mês — 30% off no setup. Posso te enviar a proposta?`,
  },
];

const CATEGORIAS: Array<"Todos" | Categoria> = ["Todos", "Prospecção", "Follow-up", "Reativação"];

const CATEGORIA_STYLE: Record<Categoria, string> = {
  "Prospecção": "bg-primary/15 text-primary border-primary/30",
  "Follow-up": "bg-warning/15 text-warning border-warning/30",
  "Reativação": "bg-success/15 text-success border-success/30",
};

function TemplatesPage() {
  const { setTemplateSelecionado, templates, deleteTemplate, templateSelecionado } = useStore();
  const plano = usePlano();
  const [filtro, setFiltro] = useState<"Todos" | Categoria>("Todos");
  const [preview, setPreview] = useState<ScriptTpl | null>(null);
  const [creating, setCreating] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const meusTemplates = useMemo(() => templates.filter((t) => t.custom), [templates]);

  const templateAtual = useMemo(() => {
    return templates.find((t) => t.id === templateSelecionado) || SCRIPTS.find((s) => s.id === templateSelecionado) || null;
  }, [templates, templateSelecionado]);

  const visiveis = useMemo(
    () => filtro === "Todos" ? SCRIPTS : SCRIPTS.filter((s) => s.categoria === filtro),
    [filtro]
  );

  const onCreate = () => {
    if (plano.templates_custom <= 0) { setUpgradeOpen(true); return; }
    setCreating(true);
  };

  const usar = (s: ScriptTpl) => {
    setTemplateSelecionado(s.id);
    toast.success(`"${s.nome}" definido como template padrão ✓`);
  };

  const usarMeu = (t: Template) => {
    setTemplateSelecionado(t.id);
    toast.success(`"${t.nome}" definido como template padrão ✓`);
  };

  const removerMeu = (t: Template) => {
    if (!confirm(`Excluir o template "${t.nome}"?`)) return;
    deleteTemplate(t.id);
    toast.success("Template excluído");
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <PageHeader title="Biblioteca de Scripts" subtitle="Mensagens testadas para abordar leads no WhatsApp">
        <Button onClick={onCreate} className="bg-gradient-primary">
          <Plus className="h-4 w-4" /> Novo Template
        </Button>
      </PageHeader>

      {templateAtual && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Check className="h-4 w-4 text-success" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Template em uso
            </h2>
          </div>
          <Card className="p-4 flex flex-col gap-3 bg-gradient-primary/10 border-primary">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{templateAtual.nome}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{templateAtual.nicho}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {"custom" in templateAtual && templateAtual.custom && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-primary/15 text-primary border-primary/30 whitespace-nowrap">
                    SEU
                  </span>
                )}
                {"categoria" in templateAtual && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${CATEGORIA_STYLE[templateAtual.categoria]}`}>
                    {templateAtual.categoria}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-success/15 text-success border-success/30 whitespace-nowrap">
                  EM USO
                </span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-background/40 p-2 rounded border border-border/50 whitespace-pre-wrap">
              {renderTemplate(templateAtual.mensagem, EXEMPLO)}
            </div>
          </Card>
        </section>
      )}

      {meusTemplates.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Meus templates <span className="text-foreground">({meusTemplates.length})</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {meusTemplates.map((t) => {
              const ativo = t.id === templateSelecionado;
              return (
                <Card key={t.id} className={`p-4 flex flex-col gap-3 bg-gradient-card transition-colors ${ativo ? "border-primary" : "border-primary/30 hover:border-primary/60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{t.nome}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.nicho}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-primary/15 text-primary border-primary/30 whitespace-nowrap">
                        SEU
                      </span>
                      {ativo && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-success/15 text-success border-success/30 whitespace-nowrap">
                          EM USO
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-4 bg-background/40 p-2 rounded border border-border/50 whitespace-pre-wrap">
                    {t.mensagem}
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <Button size="sm" className="flex-1" disabled={ativo} onClick={() => usarMeu(t)}>
                      <Check className="h-3.5 w-3.5" /> {ativo ? "Em uso" : "Usar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => removerMeu(t)} aria-label="Excluir template">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}


      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIAS.map((c) => {
          const active = filtro === c;
          return (
            <button
              key={c}
              onClick={() => setFiltro(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
              }`}
            >
              {c}
              <span className={`ml-1.5 text-[10px] ${active ? "opacity-80" : "opacity-60"}`}>
                ({c === "Todos" ? SCRIPTS.length : SCRIPTS.filter((s) => s.categoria === c).length})
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visiveis.map((s) => {
          const ativo = s.id === templateSelecionado;
          return (
            <Card key={s.id} className={`p-4 flex flex-col gap-3 bg-gradient-card transition-colors ${ativo ? "border-primary" : "border-border hover:border-primary/40"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium leading-tight">{s.nome}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.nicho}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${CATEGORIA_STYLE[s.categoria]}`}>
                    {s.categoria}
                  </span>
                  {ativo && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-success/15 text-success border-success/30 whitespace-nowrap">
                      EM USO
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                <span className="text-muted-foreground">Taxa de resposta:</span>
                <span className="font-semibold text-success">{s.taxaResposta}%</span>
              </div>

              <div className="text-xs text-muted-foreground line-clamp-3 bg-background/40 p-2 rounded border border-border/50">
                {renderTemplate(s.mensagem, EXEMPLO)}
              </div>

              <div className="flex gap-2 mt-auto">
                <Button size="sm" className="flex-1" disabled={ativo} onClick={() => usar(s)}>
                  <Check className="h-3.5 w-3.5" /> {ativo ? "Em uso" : "Usar template"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPreview(s)}>
                  <Eye className="h-3.5 w-3.5" /> Ver preview
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {visiveis.length === 0 && (
        <div className="rounded-xl border border-solid border-border bg-card/40 p-12 text-center text-muted-foreground">
          Nenhum script nessa categoria ainda.
        </div>
      )}

      <PreviewDialog tpl={preview} onClose={() => setPreview(null)} onUsar={(s) => { usar(s); setPreview(null); }} />
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} titulo="Templates personalizados é Pro" descricao={`O plano ${plano.nome} não permite criar templates próprios. Faça upgrade para o Pro.`} />
    </div>
  );
}

function PreviewDialog({ tpl, onClose, onUsar }: { tpl: ScriptTpl | null; onClose: () => void; onUsar: (s: ScriptTpl) => void }) {
  const open = !!tpl;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tpl?.nome}</DialogTitle>
        </DialogHeader>
        {tpl && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${CATEGORIA_STYLE[tpl.categoria]}`}>{tpl.categoria}</span>
              <span className="text-xs text-muted-foreground">Nicho: <span className="text-foreground font-medium">{tpl.nicho}</span></span>
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-success" />
                <span className="text-success font-semibold">{tpl.taxaResposta}%</span> de resposta média
              </span>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mensagem original</Label>
              <div className="mt-1 text-sm whitespace-pre-wrap bg-background/40 p-3 rounded border border-border">{tpl.mensagem}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Preview com lead exemplo</Label>
              <div className="mt-1 text-sm whitespace-pre-wrap bg-primary/5 p-3 rounded border border-primary/30">{renderTemplate(tpl.mensagem, EXEMPLO)}</div>
            </div>
            <Button className="w-full" onClick={() => onUsar(tpl)}>
              <Check className="h-4 w-4" /> Usar este template
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addTemplate } = useStore();
  const plano = usePlano();
  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [descricao, setDescricao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [upgradeIa, setUpgradeIa] = useState(false);

  const reset = () => { setNome(""); setNicho(""); setMensagem(""); setDescricao(""); };

  const gerarIA = async () => {
    if (!plano.ia_templates) { setUpgradeIa(true); return; }
    if (!descricao.trim()) { toast.error("Descreva seu serviço e nicho alvo"); return; }
    setGerando(true);
    await new Promise((r) => setTimeout(r, 1500));
    setMensagem(`Olá! Vi a {{nome}} no Google Maps e adorei conhecer seu trabalho em {{cidade}}. ${descricao.split(".")[0]}. Posso te apresentar em 5 minutos como podemos ajudar {{nicho}} como o seu?`);
    if (!nome) setNome("Template gerado por IA");
    if (!nicho) setNicho("Geral");
    setGerando(false);
    toast.success("Template gerado com IA ✓");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Novo template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Label className="text-xs flex items-center gap-1 mb-2"><Sparkles className="h-3 w-3 text-primary" /> Gerar com IA <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-primary text-primary-foreground">Pro</span></Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Descreva seu serviço e o nicho alvo. Ex: 'Faço sites para clínicas em SP'" />
              <Button size="sm" className="mt-2 bg-gradient-primary" onClick={gerarIA} disabled={gerando}>
                {gerando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Gerar template
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="space-y-2"><Label>Nicho</Label><Input value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="ex: Saúde" /></div>
            </div>
            <div className="space-y-2">
              <Label>Mensagem <span className="text-xs text-muted-foreground">— {VARS_HINT}</span></Label>
              <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={6} />
            </div>
            <Button className="w-full" disabled={!nome || !mensagem} onClick={() => { addTemplate({ nome, nicho: nicho || "Geral", mensagem }); toast.success("Template criado ✓"); onClose(); reset(); }}>
              Salvar template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <UpgradeModal open={upgradeIa} onOpenChange={setUpgradeIa} titulo="Geração com IA é Pro" descricao="Crie templates otimizados em segundos com IA. Disponível nos planos Pro e Agência." />
    </>
  );
}

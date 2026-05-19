import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Check, Sparkles, Loader2 } from "lucide-react";
import { useStore, usePlano } from "@/store/app-store";
import { renderTemplate, variaveisNaoResolvidas, type Template } from "@/data/templates";
import { UpgradeModal } from "@/components/upgrade-modal";
import { toast } from "sonner";

export const Route = createFileRoute("/app/templates")({
  head: () => ({ meta: [{ title: "Templates — ZapScout" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TemplatesPage,
});

const EXEMPLO = { nome: "Clínica Sorriso Pleno", cidade: "São Paulo - SP", nicho: "clínica odontológica", avaliacao: 4.6, telefone: "(11) 99999-0000", endereco: "Av. Paulista, 1000" };
const VARS_HINT = "{{nome}}, {{cidade}}, {{nicho}}, {{avaliacao}}, {{telefone}}, {{endereco}}";

function TemplatesPage() {
  const { templates, templateSelecionado, setTemplateSelecionado, deleteTemplate } = useStore();
  const plano = usePlano();
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const customCount = templates.filter((t) => t.custom).length;

  const onCreate = () => {
    if (customCount >= plano.templates_custom) {
      setUpgradeOpen(true); return;
    }
    setCreating(true);
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 pt-16 md:pt-10 max-w-6xl mx-auto">
      <PageHeader title="Templates" subtitle="Mensagens prontas para abordar leads no WhatsApp">
        <Button onClick={onCreate}><Plus className="h-4 w-4" /> Criar template</Button>
      </PageHeader>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => {
          const selecionado = t.id === templateSelecionado;
          const preview = renderTemplate(t.mensagem, EXEMPLO);
          return (
            <Card key={t.id} className={`p-4 flex flex-col gap-3 ${selecionado ? "border-primary" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{t.nome}</div>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary">{t.nicho}</span>
                </div>
                {selecionado && <span className="text-[10px] inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" /> Padrão</span>}
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-5 bg-background/40 p-2 rounded">{preview}</div>
              <div className="flex gap-2 mt-auto">
                <Button size="sm" variant={selecionado ? "secondary" : "default"} className="flex-1" onClick={() => { setTemplateSelecionado(t.id); toast.success("Template definido como padrão ✓"); }} disabled={selecionado}>
                  {selecionado ? "Atual" : "Usar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}><Pencil className="h-3 w-3" /></Button>
                {t.custom && <Button size="sm" variant="outline" onClick={() => { deleteTemplate(t.id); toast.success("Template removido"); }}><Trash2 className="h-3 w-3" /></Button>}
              </div>
            </Card>
          );
        })}
      </div>

      <EditDialog tpl={editing} open={!!editing} onClose={() => setEditing(null)} />
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} titulo="Templates ilimitados no Pro" descricao={`O plano ${plano.nome} permite ${plano.templates_custom} templates personalizados.`} />
    </div>
  );
}

function EditDialog({ tpl, open, onClose }: { tpl: Template | null; open: boolean; onClose: () => void }) {
  const { updateTemplate } = useStore();
  const [nome, setNome] = useState("");
  const [nicho, setNicho] = useState("");
  const [mensagem, setMensagem] = useState("");

  // initialize when tpl changes
  if (tpl && nome === "" && mensagem === "") {
    setNome(tpl.nome); setNicho(tpl.nicho); setMensagem(tpl.mensagem);
  }

  const preview = renderTemplate(mensagem, EXEMPLO);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setNome(""); setNicho(""); setMensagem(""); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Editar template</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-2"><Label>Nicho</Label><Input value={nicho} onChange={(e) => setNicho(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem <span className="text-xs text-muted-foreground">— use {VARS_HINT}</span></Label>
            <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={6} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="text-xs whitespace-pre-wrap bg-background/40 p-3 rounded border border-border">{preview}</div>
            {variaveisNaoResolvidas(preview).length > 0 && (
              <div className="text-[11px] text-warning">
                Variáveis não reconhecidas: {variaveisNaoResolvidas(preview).map((v) => `{{${v}}}`).join(", ")}
              </div>
            )}
          </div>
          <Button className="w-full" onClick={() => { if (tpl) { updateTemplate(tpl.id, { nome, nicho, mensagem }); toast.success("Template salvo ✓"); onClose(); setNome(""); setNicho(""); setMensagem(""); } }}>
            Salvar alterações
          </Button>
        </div>
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
    setMensagem(`Olá! Vi a {{nome}} no Google Maps e adorei conhecer seu trabalho em {{cidade}}. ${descricao.split(".")[0]}. Posso te apresentar em 5 minutos como podemos ajudar {{nicho}} como o seu? Tenho cases reais para compartilhar.`);
    if (!nome) setNome("Template gerado por IA");
    if (!nicho) setNicho("Geral");
    setGerando(false);
    toast.success("Template gerado com IA ✓");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Criar template</DialogTitle></DialogHeader>
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

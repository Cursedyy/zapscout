import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { gravarLeadMimo, historicoLeadMimo } from '@/lib/mimo-leads.functions';
import { ETAPAS, QUALIFICACOES, PERFIS, ORIGENS, leadMimoSchema, type LeadMimoInput, type MimoLead } from '@/lib/mimo-leads';
import type { Json } from '@/integrations/supabase/types';
import { Loader2, Save } from 'lucide-react';

export function Escolha({label,value,onChange,opcoes,disabled=false}: {label:string;value:string;onChange:(v:string)=>void;opcoes:Record<string,string>;disabled?:boolean}) {
  return <label className="grid min-w-0 gap-1.5 text-sm"><span>{label}</span><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-foreground disabled:opacity-50">{Object.entries(opcoes).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>;
}
export function dataLocal(iso:string) {
  const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function dataExibida(iso:string) { return new Date(iso).toLocaleString('pt-BR'); }
const titulos:Record<string,string> = {nome_empresa:'Empresa',nome_contato:'Contato',telefone:'Telefone',perfil:'Perfil',origem:'Origem',campanha_origem:'Campanha',anuncio_origem:'Anúncio',entrada_em:'Entrada',etapa:'Etapa',qualificacao:'Qualificação',responsavel_id:'Responsável',valor_pedido:'Valor do pedido',conversao_em:'Conversão',motivo_perda:'Motivo da perda',observacoes:'Observações'};
function objeto(v:Json|null):Record<string,Json|undefined> {return v && typeof v==='object' && !Array.isArray(v)?v:{};}
function valorHistorico(key:string,v:Json|undefined,membros:Record<string,string>) {
  if(v===null || v===undefined || v==='')return 'Não informado';
  if(key==='responsavel_id')return membros[String(v)] || 'Membro inativo';
  if(key==='valor_pedido')return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  if(key==='entrada_em'||key==='conversao_em')return dataExibida(String(v));
  const rotulos:Record<string,string>={...ETAPAS,...QUALIFICACOES,...ORIGENS,...PERFIS};return rotulos[String(v)] || String(v);
}
export function MimoLeadEditor({lead,podeEditar,usuarioId,vendedor,membros,onClose,onSaved}: {lead:MimoLead|null;podeEditar:boolean;usuarioId:string;vendedor:boolean;membros:Record<string,string>;onClose:()=>void;onSaved:()=>void}) {
  const [form,setForm]=useState<LeadMimoInput>(()=>lead?{
    id:lead.id,updated_at:lead.updated_at,nome_empresa:lead.nome_empresa,nome_contato:lead.nome_contato,telefone:lead.telefone,
    perfil:lead.perfil as LeadMimoInput['perfil'],origem:lead.origem as LeadMimoInput['origem'],campanha_origem:lead.campanha_origem,anuncio_origem:lead.anuncio_origem,
    entrada_em:lead.entrada_em,etapa:lead.etapa as LeadMimoInput['etapa'],qualificacao:lead.qualificacao as LeadMimoInput['qualificacao'],responsavel_id:lead.responsavel_id,
    valor_pedido:lead.valor_pedido,conversao_em:lead.conversao_em,motivo_perda:lead.motivo_perda,observacoes:lead.observacoes,
  }:{nome_empresa:'',nome_contato:'',telefone:'',perfil:'outro',origem:'outra',campanha_origem:'',anuncio_origem:'',entrada_em:new Date().toISOString(),etapa:'novo',qualificacao:'pendente',responsavel_id:vendedor?usuarioId:null,valor_pedido:null,conversao_em:null,motivo_perda:'',observacoes:''});
  const [erro,setErro]=useState('');
  const salvar=useServerFn(gravarLeadMimo);const historico=useServerFn(historicoLeadMimo);
  const mutation=useMutation({mutationFn:(v:LeadMimoInput)=>salvar({data:v}),onSuccess:onSaved,onError:e=>setErro(e.message)});
  const h=useQuery({queryKey:['mimo-historico',usuarioId,lead?.id],queryFn:()=>lead?historico({data:{id:lead.id}}):Promise.resolve([]),enabled:!!lead});
  function mudar<K extends keyof LeadMimoInput>(key:K,value:LeadMimoInput[K]) {setForm(f=>({...f,[key]:value}));}
  const campo=(key:'nome_empresa'|'nome_contato'|'telefone'|'campanha_origem'|'anuncio_origem'|'motivo_perda',label:string,required=false)=><div className="grid gap-1.5"><Label htmlFor={key}>{label}</Label><Input id={key} value={form[key]} required={required} maxLength={key==='motivo_perda'?2000:key==='telefone'?40:200} onChange={e=>mudar(key,e.target.value)}/></div>;
  return <Dialog open onOpenChange={v=>{if(!v&&!mutation.isPending)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{lead?lead.nome_empresa:'Novo lead MiMo'}</DialogTitle></DialogHeader>
    <Tabs defaultValue="cadastro"><TabsList><TabsTrigger value="cadastro">Cadastro</TabsTrigger>{lead&&<TabsTrigger value="historico">Histórico</TabsTrigger>}</TabsList>
    <TabsContent value="cadastro"><form className="mt-4 space-y-5" onSubmit={e=>{e.preventDefault();setErro('');const valid=leadMimoSchema.safeParse(form);if(!valid.success){setErro(valid.error.issues[0]?.message??'Confira os campos.');return;}mutation.mutate(valid.data);}}>
      <fieldset disabled={!podeEditar||mutation.isPending} className="grid gap-4 sm:grid-cols-2">
        {campo('nome_empresa','Empresa *',true)}{campo('nome_contato','Nome do contato')}{campo('telefone','Telefone / WhatsApp')}
        <Escolha label="Perfil" value={form.perfil} opcoes={PERFIS} onChange={v=>mudar('perfil',v as LeadMimoInput['perfil'])}/>
        <Escolha label="Origem" value={form.origem} opcoes={ORIGENS} onChange={v=>mudar('origem',v as LeadMimoInput['origem'])}/>
        <label className="grid gap-1.5 text-sm">Data de entrada *<Input aria-label="Data de entrada" type="datetime-local" required value={dataLocal(form.entrada_em)} onChange={e=>{if(e.target.value)mudar('entrada_em',new Date(e.target.value).toISOString());}}/></label>
        {campo('campanha_origem','Campanha de origem')}{campo('anuncio_origem','Anúncio de origem')}
        <Escolha label="Etapa comercial" value={form.etapa} opcoes={ETAPAS} onChange={v=>mudar('etapa',v as LeadMimoInput['etapa'])}/>
        <Escolha label="Qualificação" value={form.qualificacao} opcoes={QUALIFICACOES} onChange={v=>mudar('qualificacao',v as LeadMimoInput['qualificacao'])}/>
        <Escolha label="Responsável" value={form.responsavel_id??''} opcoes={{'':'Sem responsável',...membros,...(lead?.responsavel_id&&!membros[lead.responsavel_id]?{[lead.responsavel_id]:'Membro inativo'}:{})}} disabled={vendedor} onChange={v=>mudar('responsavel_id',v||null)}/>
        {form.etapa==='perdido'&&campo('motivo_perda','Motivo da perda *',true)}
        {(form.etapa==='pedido_fechado'||form.conversao_em!==null||form.valor_pedido!==null)&&<>
          <label className="grid gap-1.5 text-sm">Valor do pedido (R$) *<Input aria-label="Valor do pedido" type="number" min="0" step="0.01" required={form.etapa==='pedido_fechado'} value={form.valor_pedido??''} onChange={e=>mudar('valor_pedido',e.target.value===''?null:Number(e.target.value))}/></label>
          <label className="grid gap-1.5 text-sm">Data da conversão *<Input aria-label="Data da conversão" type="datetime-local" required={form.etapa==='pedido_fechado'} value={form.conversao_em?dataLocal(form.conversao_em):''} onChange={e=>mudar('conversao_em',e.target.value?new Date(e.target.value).toISOString():null)}/></label>
        </>}
        <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="observacoes">Observações</Label><Textarea id="observacoes" maxLength={10000} rows={4} value={form.observacoes} onChange={e=>mudar('observacoes',e.target.value)}/></div>
      </fieldset>
      {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Fechar</Button>{podeEditar&&<Button type="submit" disabled={mutation.isPending}>{mutation.isPending?<Loader2 className="animate-spin"/>:<Save/>}Salvar lead</Button>}</div>
    </form></TabsContent>
    {lead&&<TabsContent value="historico" className="mt-4">{h.isPending?<Loader2 className="animate-spin"/>:h.error?<p role="alert">Não foi possível carregar o histórico.</p>:<ol className="space-y-5">{h.data?.map(item=>{const atual=objeto(item.atual),anterior=objeto(item.anterior);const chaves=Object.keys(titulos).filter(k=>JSON.stringify(atual[k])!==JSON.stringify(anterior[k]));return <li key={item.id} className="border-l-2 border-primary pl-4"><p className="text-sm font-medium">{item.acao==='cadastro'?'Cadastro':'Alteração'} · {dataExibida(item.created_at)}</p><p className="mb-2 text-xs text-muted-foreground">{item.alterado_por?membros[item.alterado_por]||'Membro inativo':'Sistema'}</p><dl className="space-y-2 text-sm">{chaves.map(k=><div key={k}><dt className="text-muted-foreground">{titulos[k]}</dt><dd className="break-words whitespace-pre-wrap">{item.anterior&&<span className="text-muted-foreground">{valorHistorico(k,anterior[k],membros)} → </span>}{valorHistorico(k,atual[k],membros)}</dd></div>)}</dl></li>;})}</ol>}</TabsContent>}
    </Tabs>
  </DialogContent></Dialog>;
}
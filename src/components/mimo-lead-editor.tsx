import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { gravarLeadMimo, historicoLeadMimo, verificarDuplicadosMimo } from '@/lib/mimo-leads.functions';
import { MOTIVOS_PERDA, PRIORIDADES, sugerirPrioridade, type MotivoPerda, type Prioridade } from '@/lib/mimo-qualidade';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ETAPAS, QUALIFICACOES, PERFIS, ORIGENS, leadMimoSchema, type LeadMimoInput, type MimoLead } from '@/lib/mimo-leads';
import type { Json } from '@/integrations/supabase/types';
import { Loader2, Save, Lightbulb, AlertTriangle } from 'lucide-react';

export function Escolha({label,value,onChange,opcoes,disabled=false}: {label:string;value:string;onChange:(v:string)=>void;opcoes:Record<string,string>;disabled?:boolean}) {
  return <div className="grid min-w-0 gap-1.5 text-sm"><span>{label}</span><Select value={value||'__vazio'} onValueChange={v=>onChange(v==='__vazio'?'':v)} disabled={disabled}><SelectTrigger aria-label={label} className="h-10 min-w-0"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(opcoes).map(([v,n])=><SelectItem key={v||'__vazio'} value={v||'__vazio'}>{n}</SelectItem>)}</SelectContent></Select></div>;
}
export function dataLocal(iso:string) {
  const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function dataExibida(iso:string) { return new Date(iso).toLocaleString('pt-BR'); }
const titulos:Record<string,string> = {nome_empresa:'Empresa',nome_contato:'Contato',telefone:'Telefone',perfil:'Perfil',origem:'Origem',campanha_origem:'Campanha',anuncio_origem:'Anúncio',entrada_em:'Entrada',etapa:'Etapa',qualificacao:'Qualificação',responsavel_id:'Responsável',valor_pedido:'Valor do pedido',conversao_em:'Conversão',motivo_perda:'Observação da perda',motivo_perda_codigo:'Motivo da perda',email:'E-mail',orcamento_estimado:'Orçamento estimado',prioridade_revisada:'Prioridade revisada',observacoes:'Observações'};
function objeto(v:Json|null):Record<string,Json|undefined> {return v && typeof v==='object' && !Array.isArray(v)?v:{};}
function valorHistorico(key:string,v:Json|undefined,membros:Record<string,string>) {
  if(v===null || v===undefined || v==='')return 'Não informado';
  if(key==='responsavel_id')return membros[String(v)] || 'Membro inativo';
  if(key==='valor_pedido'||key==='orcamento_estimado')return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  if(key==='entrada_em'||key==='conversao_em')return dataExibida(String(v));
  const rotulos:Record<string,string>={...MOTIVOS_PERDA,...PRIORIDADES,...ETAPAS,...QUALIFICACOES,...ORIGENS,...PERFIS};return rotulos[String(v)] || String(v);
}
export function MimoLeadEditor({lead,podeEditar,usuarioId,vendedor,membros,onClose,onSaved}: {lead:MimoLead|null;podeEditar:boolean;usuarioId:string;vendedor:boolean;membros:Record<string,string>;onClose:()=>void;onSaved:()=>void}) {
  const [form,setForm]=useState<LeadMimoInput>(()=>lead?{
    id:lead.id,updated_at:lead.updated_at,nome_empresa:lead.nome_empresa,nome_contato:lead.nome_contato,telefone:lead.telefone,
    perfil:lead.perfil as LeadMimoInput['perfil'],origem:lead.origem as LeadMimoInput['origem'],campanha_origem:lead.campanha_origem,anuncio_origem:lead.anuncio_origem,
    entrada_em:lead.entrada_em,etapa:lead.etapa as LeadMimoInput['etapa'],qualificacao:lead.qualificacao as LeadMimoInput['qualificacao'],responsavel_id:lead.responsavel_id,
    valor_pedido:lead.valor_pedido,conversao_em:lead.conversao_em,motivo_perda:lead.motivo_perda,observacoes:lead.observacoes,
    email:lead.email,motivo_perda_codigo:(lead.motivo_perda_codigo as MotivoPerda|null),orcamento_estimado:lead.orcamento_estimado,prioridade_revisada:(lead.prioridade_revisada as Prioridade|null),
  }:{nome_empresa:'',nome_contato:'',telefone:'',perfil:'outro',origem:'outra',campanha_origem:'',anuncio_origem:'',entrada_em:new Date().toISOString(),etapa:'novo',qualificacao:'pendente',responsavel_id:vendedor?usuarioId:null,valor_pedido:null,conversao_em:null,motivo_perda:'',observacoes:'',email:'',motivo_perda_codigo:null,orcamento_estimado:null,prioridade_revisada:null});
  const [erro,setErro]=useState('');
  const salvar=useServerFn(gravarLeadMimo);const historico=useServerFn(historicoLeadMimo);const verificar=useServerFn(verificarDuplicadosMimo);
  type Dup=Awaited<ReturnType<typeof verificarDuplicadosMimo>>;
  const [duplicados,setDuplicados]=useState<{itens:Dup;chave:string}|null>(null);
  const [verificando,setVerificando]=useState(false);
  const sugestao=sugerirPrioridade({etapa:form.etapa,qualificacao:form.qualificacao,perfil:form.perfil,orcamento_estimado:form.orcamento_estimado,ultimo_contato_whatsapp_em:lead?.ultimo_contato_whatsapp_em??null});
  async function enviar(v:LeadMimoInput){
    const chave=`${v.telefone}|${v.email}`;
    const mudouContato=!lead||lead.telefone!==v.telefone||lead.email!==v.email;
    if(mudouContato&&duplicados?.chave!==chave&&(v.telefone.trim()||v.email.trim())){
      setVerificando(true);
      try{const itens=await verificar({data:{telefone:v.telefone,email:v.email,ignorar:lead?.id??null}});if(itens.length){setDuplicados({itens,chave});return;}}
      catch(e){setErro(e instanceof Error?e.message:'Não foi possível verificar duplicados.');return;}
      finally{setVerificando(false);}
    }
    if(duplicados?.chave===chave&&duplicados.itens.some(d=>d.criterio!=='email')){setErro('Já existe um lead com este telefone. Edite o cadastro existente para preservar o histórico.');return;}
    mutation.mutate(v);
  }
  const mutation=useMutation({mutationFn:(v:LeadMimoInput)=>salvar({data:v}),onSuccess:onSaved,onError:e=>setErro(e.message)});
  const ocupado=mutation.isPending||verificando;
  const h=useQuery({queryKey:['mimo-historico',usuarioId,lead?.id],queryFn:()=>lead?historico({data:{id:lead.id}}):Promise.resolve([]),enabled:!!lead});
  function mudar<K extends keyof LeadMimoInput>(key:K,value:LeadMimoInput[K]) {setForm(f=>({...f,[key]:value}));}
  const campo=(key:'nome_empresa'|'nome_contato'|'telefone'|'campanha_origem'|'anuncio_origem'|'motivo_perda',label:string,required=false)=><div className="grid gap-1.5"><Label htmlFor={key}>{label}</Label><Input id={key} value={form[key]} required={required} maxLength={key==='motivo_perda'?2000:key==='telefone'?40:200} onChange={e=>mudar(key,e.target.value)}/></div>;
  return <Dialog open onOpenChange={v=>{if(!v&&!mutation.isPending)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{lead?lead.nome_empresa:'Novo lead MiMo'}</DialogTitle></DialogHeader>
    <Tabs defaultValue="cadastro"><TabsList><TabsTrigger value="cadastro">Cadastro</TabsTrigger>{lead&&<TabsTrigger value="historico">Histórico</TabsTrigger>}</TabsList>
    <TabsContent value="cadastro"><form className="mt-4 space-y-5" onSubmit={e=>{e.preventDefault();setErro('');const valid=leadMimoSchema.safeParse(form);if(!valid.success){setErro(valid.error.issues[0]?.message??'Confira os campos.');return;}void enviar(valid.data);}}>
      <fieldset disabled={!podeEditar||ocupado} className="grid gap-4 sm:grid-cols-2">
        {campo('nome_empresa','Empresa *',true)}{campo('nome_contato','Nome do contato')}{campo('telefone','Telefone / WhatsApp')}
        <div className="grid gap-1.5"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" maxLength={254} value={form.email} onChange={e=>mudar('email',e.target.value)}/></div>
        <Escolha label="Perfil" value={form.perfil} opcoes={PERFIS} onChange={v=>mudar('perfil',v as LeadMimoInput['perfil'])}/>
        <Escolha label="Origem" value={form.origem} opcoes={ORIGENS} onChange={v=>mudar('origem',v as LeadMimoInput['origem'])}/>
        <label className="grid gap-1.5 text-sm">Data de entrada *<Input aria-label="Data de entrada" type="datetime-local" required value={dataLocal(form.entrada_em)} onChange={e=>{if(e.target.value)mudar('entrada_em',new Date(e.target.value).toISOString());}}/></label>
        {campo('campanha_origem','Campanha de origem')}{campo('anuncio_origem','Anúncio de origem')}
        <Escolha label="Etapa comercial" value={form.etapa} opcoes={ETAPAS} onChange={v=>mudar('etapa',v as LeadMimoInput['etapa'])}/>
        <Escolha label="Qualificação" value={form.qualificacao} opcoes={QUALIFICACOES} onChange={v=>mudar('qualificacao',v as LeadMimoInput['qualificacao'])}/>
        <Escolha label="Responsável" value={form.responsavel_id??''} opcoes={{'':'Sem responsável',...membros,...(lead?.responsavel_id&&!membros[lead.responsavel_id]?{[lead.responsavel_id]:'Membro inativo'}:{})}} disabled={vendedor} onChange={v=>mudar('responsavel_id',v||null)}/>
        <label className="grid gap-1.5 text-sm">Orçamento estimado (R$)<Input aria-label="Orçamento estimado" type="number" min="0" step="0.01" value={form.orcamento_estimado??''} onChange={e=>mudar('orcamento_estimado',e.target.value===''?null:Number(e.target.value))}/></label>
        {form.etapa==='perdido'&&<><Escolha label="Motivo da perda *" value={form.motivo_perda_codigo??''} opcoes={{'':'Escolha o motivo',...MOTIVOS_PERDA}} onChange={v=>mudar('motivo_perda_codigo',(v||null) as MotivoPerda|null)}/>{campo('motivo_perda','Observação complementar')}</>}
        {(form.etapa==='pedido_fechado'||form.conversao_em!==null||form.valor_pedido!==null)&&<>
          <label className="grid gap-1.5 text-sm">Valor do pedido (R$) *<Input aria-label="Valor do pedido" type="number" min="0" step="0.01" required={form.etapa==='pedido_fechado'} value={form.valor_pedido??''} onChange={e=>mudar('valor_pedido',e.target.value===''?null:Number(e.target.value))}/></label>
          <label className="grid gap-1.5 text-sm">Data da conversão *<Input aria-label="Data da conversão" type="datetime-local" required={form.etapa==='pedido_fechado'} value={form.conversao_em?dataLocal(form.conversao_em):''} onChange={e=>mudar('conversao_em',e.target.value?new Date(e.target.value).toISOString():null)}/></label>
        </>}
        <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="observacoes">Observações</Label><Textarea id="observacoes" maxLength={10000} rows={4} value={form.observacoes} onChange={e=>mudar('observacoes',e.target.value)}/></div>
      </fieldset>
      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm"><p className="flex items-center gap-2 font-medium"><Lightbulb className="h-4 w-4"/>Prioridade sugerida <span className="text-xs font-normal text-muted-foreground">(recomendação, não decisão automática)</span></p>
        {sugestao.tipo==='encerrado'?<p className="mt-2 text-muted-foreground">Não se aplica: {sugestao.motivo}</p>
        :sugestao.tipo==='insuficiente'?<p className="mt-2 text-muted-foreground">Dados insuficientes para sugerir. Falta informar: {sugestao.faltam.join(', ')}.</p>
        :<div className="mt-2 space-y-1"><p><strong>{PRIORIDADES[sugestao.nivel]}</strong> · {sugestao.motivos.join(' · ')}</p><p>Próxima ação: {sugestao.proximaAcao}</p></div>}
        <div className="mt-3 max-w-xs"><Escolha label="Prioridade revisada" value={form.prioridade_revisada??''} disabled={vendedor||!podeEditar||ocupado} opcoes={{'':'Não revisada',...PRIORIDADES}} onChange={v=>mudar('prioridade_revisada',(v||null) as Prioridade|null)}/>{vendedor&&<p className="mt-1 text-xs text-muted-foreground">Só administrador ou gestor revisa a prioridade.</p>}</div>
      </div>
      {duplicados&&<Alert variant="destructive"><AlertTriangle className="h-4 w-4"/><AlertTitle>Possível lead duplicado</AlertTitle><AlertDescription><ul className="mt-1 list-disc pl-4">{duplicados.itens.map((d,i)=><li key={d.lead_id??i}>{d.criterio==='email'?'Mesmo e-mail':d.criterio==='telefone'?'Mesmo telefone':'Mesmo telefone e e-mail'}: {d.visivel?`${d.nome_empresa} (${ETAPAS[d.etapa as keyof typeof ETAPAS]??d.etapa})`:'lead de outro responsável'}</li>)}</ul>
        <p className="mt-2">{duplicados.itens.some(d=>d.criterio!=='email')?'Telefone repetido não pode ser cadastrado de novo. Revise o lead existente ou peça ao gestor.':'Revise os dados. Se for outra empresa com o mesmo e-mail, clique em salvar novamente para confirmar.'}</p></AlertDescription></Alert>}
      {erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={ocupado}>Fechar</Button>{podeEditar&&<Button type="submit" disabled={ocupado}>{ocupado?<Loader2 className="animate-spin"/>:<Save/>}Salvar lead</Button>}</div>
    </form></TabsContent>
    {lead&&<TabsContent value="historico" className="mt-4">{h.isPending?<Loader2 className="animate-spin"/>:h.error?<p role="alert">Não foi possível carregar o histórico.</p>:<ol className="space-y-5">{h.data?.map(item=>{const atual=objeto(item.atual),anterior=objeto(item.anterior);const chaves=Object.keys(titulos).filter(k=>JSON.stringify(atual[k])!==JSON.stringify(anterior[k]));return <li key={item.id} className="border-l-2 border-primary pl-4"><p className="text-sm font-medium">{item.acao==='cadastro'?'Cadastro':'Alteração'} · {dataExibida(item.created_at)}</p><p className="mb-2 text-xs text-muted-foreground">{item.alterado_por?membros[item.alterado_por]||'Membro inativo':'Sistema'}</p><dl className="space-y-2 text-sm">{chaves.map(k=><div key={k}><dt className="text-muted-foreground">{titulos[k]}</dt><dd className="break-words whitespace-pre-wrap">{item.anterior&&<span className="text-muted-foreground">{valorHistorico(k,anterior[k],membros)} → </span>}{valorHistorico(k,atual[k],membros)}</dd></div>)}</dl></li>;})}</ol>}</TabsContent>}
    </Tabs>
  </DialogContent></Dialog>;
}
import { useState } from 'react';
import { Plus, Pencil, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { CampoNumero } from '@/components/mimo-pedido-logistica';
import { brindeSchema, caixaTipoSchema, ehGestao, type Brinde, type CaixaTipo } from '@/lib/mimo-tira-regras';
import { dinheiro } from '@/lib/mimo-pedido';

export function CadastrosTira({brindes,caixas,onBrindes,onCaixas,papel,area}:{brindes:Brinde[];caixas:CaixaTipo[];onBrindes:(b:Brinde[])=>void;onCaixas:(c:CaixaTipo[])=>void;papel:string;area:'brindes'|'logistica'}) {
  const [brinde,setBrinde]=useState<Brinde|null>(null);const [caixa,setCaixa]=useState<CaixaTipo|null>(null);const [original,setOriginal]=useState('');const [erro,setErro]=useState('');const gestao=ehGestao(papel);
  return <section className={area === 'logistica' ? "space-y-3" : "space-y-5"}><header className="flex flex-wrap justify-between gap-3"><h3 className="text-lg">{area==='brindes'?'Brindes reutilizáveis':'Tipos de caixa'}</h3>{gestao&&<Button variant="outline" onClick={()=>{setErro('');setOriginal('');if(area==='brindes')setBrinde({id:crypto.randomUUID(),nome:'',unidade:'Unidade',pesoG:null,custoInterno:null,ativo:false,envioSeparado:false});else setCaixa({id:'',nome:'',dimensoes:[1,1,1],displays:0,misturinhas:0,ativo:false});}}><Plus/>{area==='brindes'?'Cadastrar brinde':'Cadastrar caixa'}</Button>}</header>{area==='brindes'?<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Brinde</th><th>Unidade / peso</th><th>Entrega</th>{gestao&&<th>Custo interno</th>}<th>Status</th><th/></tr></thead><tbody>{brindes.map(b=><tr key={b.id} className="border-t border-border"><td className="py-4 pr-4">{b.nome}</td><td className="pr-4">{b.unidade} · {b.pesoG??'—'} g</td><td className="pr-4">{b.envioSeparado?'Envio separado':'Remessa principal'}</td>{gestao&&<td className="pr-4">{b.custoInterno===null?'—':dinheiro(b.custoInterno)}</td>}<td>{b.ativo?'Ativo':'Inativo'}</td><td>{gestao&&<Button variant="ghost" size="icon" aria-label={`Editar brinde ${b.nome}`} onClick={()=>{setErro('');setBrinde({...b});}}><Pencil/></Button>}</td></tr>)}</tbody></table>{!brindes.length&&<p className="py-8 text-center text-sm text-muted-foreground">Nenhum brinde cadastrado.</p>}</div>:(
    <div className="overflow-hidden rounded-lg border bg-card">
      {caixas.length ? (
        <ul aria-label="Tipos de caixa" className="divide-y">
          {caixas.map(c => (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(7rem,1fr)_minmax(7rem,auto)_minmax(0,1.4fr)_auto_auto] sm:px-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{c.nome}</span>
                <span className="text-xs text-muted-foreground">{c.id}</span>
              </div>
              <span className="col-start-1 row-start-2 text-xs tabular-nums text-muted-foreground sm:col-start-2 sm:row-start-1">{c.dimensoes.join(' × ')} cm</span>
              <span className="col-start-1 row-start-3 text-xs text-muted-foreground sm:col-start-3 sm:row-start-1">
                {c.geleias ? `Até ${c.geleias} geleias de 390 g · uso exclusivo` : `${c.displays} displays ou ${c.misturinhas} misturinhas`}
              </span>
              <span className="col-start-2 row-start-1 text-right text-xs text-muted-foreground sm:col-start-4">{c.ativo ? 'Ativa' : 'Inativa'}</span>
              {gestao && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="col-start-2 row-span-2 row-start-2 size-8 justify-self-end sm:col-start-5 sm:row-span-1 sm:row-start-1"
                  aria-label={`Editar caixa ${c.id}`}
                  onClick={() => { setErro(''); setOriginal(c.id); setCaixa(structuredClone(c)); }}
                >
                  <Pencil />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma caixa cadastrada.</p>
      )}
      {caixas.some(c => c.id === 'P') && (
        <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:px-4">
          Na caixa P, o encaixe de 2 displays com 6 misturinhas vale para as dimensões e capacidades originais.
        </p>
      )}
    </div>
  )}
  <Dialog open={!!brinde||!!caixa} onOpenChange={v=>{if(!v){setBrinde(null);setCaixa(null);}}}><DialogContent className="mimo-tira max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>{brinde?'Brinde em edição':'Caixa em edição'}</DialogTitle><DialogDescription>Aplicar mantém a alteração em edição. A gravação depende de Salvar configurações.</DialogDescription></DialogHeader>{brinde&&<><label className="grid gap-1 text-xs">Nome<Input aria-label="Nome do brinde reutilizável" value={brinde.nome} onChange={e=>setBrinde({...brinde,nome:e.target.value})}/></label><label className="grid gap-1 text-xs">Unidade<Input aria-label="Unidade do brinde" value={brinde.unidade} onChange={e=>setBrinde({...brinde,unidade:e.target.value})}/></label><CampoNumero label="Peso do brinde (g)" valor={brinde.pesoG} min={1} onChange={pesoG=>setBrinde({...brinde,pesoG})}/><CampoNumero label="Custo interno do brinde (R$)" moeda valor={brinde.custoInterno} onChange={custoInterno=>setBrinde({...brinde,custoInterno})}/><label className="flex gap-2 text-sm"><input type="checkbox" checked={brinde.envioSeparado??false} onChange={e=>setBrinde({...brinde,envioSeparado:e.target.checked})}/>Envio separado (fora das caixas e do frete principal)</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={brinde.ativo} onChange={e=>setBrinde({...brinde,ativo:e.target.checked})}/>Brinde ativo</label></>}{caixa&&<><label className="grid gap-1 text-xs">Código<Input aria-label="Código da caixa" disabled={!!original} maxLength={4} value={caixa.id} onChange={e=>setCaixa({...caixa,id:e.target.value.toUpperCase()})}/></label><label className="grid gap-1 text-xs">Nome<Input aria-label="Nome da caixa" value={caixa.nome} onChange={e=>setCaixa({...caixa,nome:e.target.value})}/></label><div className="grid grid-cols-3 gap-3">{['Comprimento','Largura','Altura'].map((nome,i)=><CampoNumero key={nome} label={`${nome} (cm)`} valor={caixa.dimensoes[i]??1} min={1} onChange={v=>{const d=[...caixa.dimensoes] as [number,number,number];d[i]=v??1;setCaixa({...caixa,dimensoes:d});}}/>)}</div><div className="grid gap-2 sm:grid-cols-3"><CampoNumero label="Displays" valor={caixa.displays} onChange={v=>setCaixa({...caixa,displays:v??0})}/><CampoNumero label="Misturinhas" valor={caixa.misturinhas} onChange={v=>setCaixa({...caixa,misturinhas:v??0})}/><CampoNumero label="Geleias (exclusiva)" valor={caixa.geleias??0} onChange={v=>setCaixa({...caixa,geleias:v??0})}/></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={caixa.ativo} onChange={e=>setCaixa({...caixa,ativo:e.target.checked})}/>Caixa ativa</label><p className="text-xs text-muted-foreground">Capacidades exigem conferência física; combinações mistas novas não serão presumidas.</p></>}{erro&&<p role="alert" className="text-sm text-destructive">{erro}</p>}<Button onClick={()=>{if(brinde){const r=brindeSchema.safeParse(brinde);if(!r.success){setErro(r.error.issues[0]?.message??'Confira o brinde.');return;}onBrindes(brindes.some(b=>b.id===r.data.id)?brindes.map(b=>b.id===r.data.id?r.data:b):[...brindes,r.data]);setBrinde(null);}else if(caixa){const r=caixaTipoSchema.safeParse(caixa);if(!r.success){setErro(r.error.issues[0]?.message??'Confira a caixa.');return;}if(!original&&caixas.some(c=>c.id===caixa.id)){setErro('Código de caixa repetido.');return;}onCaixas(original?caixas.map(c=>c.id===original?r.data:c):[...caixas,r.data]);setCaixa(null);}}}><Save/>Aplicar à edição</Button></DialogContent></Dialog></section>;
}

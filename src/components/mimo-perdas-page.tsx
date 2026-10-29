import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { perdasMimo, contextoLeadsMimo } from '@/lib/mimo-leads.functions';
import { MOTIVOS_PERDA, resumirPerdas } from '@/lib/mimo-qualidade';

const COLUNAS: Record<string, string> = { ...MOTIVOS_PERDA, sem_codigo: 'Sem motivo padrão (antigo)' };

export function MimoPerdasPage() {
  const [inicio, setInicio] = useState(''); const [fim, setFim] = useState('');
  const buscar = useServerFn(perdasMimo); const ctx = useServerFn(contextoLeadsMimo);
  const filtros = { inicio: inicio ? new Date(`${inicio}T00:00:00`).toISOString() : null, fim: fim ? new Date(`${fim}T23:59:59.999`).toISOString() : null };
  const q = useQuery({ queryKey: ['mimo-perdas', filtros], queryFn: () => buscar({ data: filtros }) });
  const c = useQuery({ queryKey: ['mimo-leads-contexto'], queryFn: () => ctx() });
  const membros = Object.fromEntries((c.data?.membros ?? []).map(m => [m.user_id, m.nome]));
  const r = q.data ? resumirPerdas(q.data.linhas) : null;
  const motivos = r ? Object.keys(COLUNAS).filter(k => r.geral[k]) : [];
  return <section className="px-4 py-6 md:px-8 md:py-8">
    <p className="text-xs uppercase text-muted-foreground">Comercial MiMo</p><h1 className="mt-1 text-2xl font-semibold">Motivos de perda</h1>
    {q.data?.papel === 'vendedor' && <p className="mt-2 text-sm text-muted-foreground">Você vê apenas os leads atribuídos a você.</p>}
    <div className="mt-6 flex flex-wrap gap-3"><label className="grid gap-1.5 text-sm">Perdidos de<Input type="date" aria-label="Perdidos de" value={inicio} onChange={e => setInicio(e.target.value)} /></label><label className="grid gap-1.5 text-sm">até<Input type="date" aria-label="Perdidos até" value={fim} onChange={e => setFim(e.target.value)} /></label></div>
    <p className="mt-2 text-xs text-muted-foreground">Data considerada: última alteração do lead perdido.</p>
    {q.isPending ? <Loader2 className="mt-8 animate-spin" /> : q.error ? <p role="alert" className="mt-8 text-destructive">Não foi possível carregar as perdas.</p> : !r?.total ? <p className="mt-8 text-muted-foreground">Nenhum lead perdido no período.</p> : <>
      <h2 className="mt-8 font-medium">Geral · {r.total} {r.total === 1 ? 'lead' : 'leads'}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{motivos.map(k => <li key={k} className="flex justify-between rounded-md border border-border px-4 py-3 text-sm"><span>{COLUNAS[k]}</span><span className="font-semibold">{r.geral[k]} · {Math.round(r.geral[k] / r.total * 100)}%</span></li>)}</ul>
      <h2 className="mt-8 font-medium">Por vendedor</h2>
      <div className="mt-3 overflow-x-auto border-y border-border"><Table><TableHeader><TableRow><TableHead>Responsável</TableHead>{motivos.map(k => <TableHead key={k}>{COLUNAS[k]}</TableHead>)}<TableHead>Total</TableHead></TableRow></TableHeader>
        <TableBody>{Object.entries(r.porResponsavel).map(([id, m]) => <TableRow key={id}><TableCell>{id === 'sem' ? 'Sem responsável' : membros[id] || 'Membro inativo'}</TableCell>{motivos.map(k => <TableCell key={k}>{m[k] ?? 0}</TableCell>)}<TableCell className="font-semibold">{Object.values(m).reduce((a, b) => a + b, 0)}</TableCell></TableRow>)}</TableBody></Table></div>
    </>}
  </section>;
}

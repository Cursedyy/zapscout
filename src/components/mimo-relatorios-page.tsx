import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Download, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { relatorioMimo } from '@/lib/mimo-relatorio.functions';
import { ROTULO_INDICADOR, csvResumo, csvLeads, csvMeta, csvPedidos, type Relatorio } from '@/lib/mimo-relatorio';
import { ORIGENS, PERFIS } from '@/lib/mimo-leads';

const VAZIO = '—';
const brl = (v: number | null) => (v === null ? VAZIO : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (v: number | null) => (v === null ? VAZIO : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const num = (v: number | null) => (v === null ? VAZIO : v.toLocaleString('pt-BR'));
const dia = (v: string) => v.split('-').reverse().join('/');
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const menosDias = (d: string, n: number) => new Date(Date.parse(d) - n * 86400000).toISOString().slice(0, 10);
const fmt = (k: string, v: number | null) => (k.startsWith('taxa') ? pct(v) : k === 'leadsGerados' || k === 'novosClientes' ? num(v) : brl(v));

function baixar(conteudo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function MimoRelatoriosPage() {
  const fn = useServerFn(relatorioMimo);
  const [filtro, setFiltro] = useState({ inicio: menosDias(hoje(), 6), fim: hoje(), campanha: '', origem: '' as '' | keyof typeof ORIGENS });
  const dur = (Date.parse(filtro.fim) - Date.parse(filtro.inicio)) / 86400000;
  const valido = filtro.inicio && filtro.fim && dur >= 0 && dur <= 91;
  const q = useQuery({ queryKey: ['mimo-relatorio', filtro], queryFn: () => fn({ data: filtro }), enabled: !!valido, placeholderData: keepPreviousData });
  const set = (k: keyof typeof filtro, v: string) => setFiltro(p => ({ ...p, [k]: v }));
  const d = q.data;

  if (d && !d.permitido) return <section className="px-4 py-6 md:px-8 md:py-8"><h1 className="text-2xl font-semibold">Relatórios</h1>
    <p className="mt-3 text-sm text-muted-foreground">Os relatórios gerais e as exportações são exclusivos de administradores e gestores da MiMo. Seus leads continuam disponíveis em Leads.</p></section>;

  const r = d?.permitido ? (d as Relatorio) : null;
  const sufixo = `${filtro.inicio}_${filtro.fim}`;
  const exportar: [string, (r: Relatorio) => string, string][] = [
    ['Resumo', csvResumo, `mimo-resumo_${sufixo}.csv`], ['Leads', csvLeads, `mimo-leads_${sufixo}.csv`],
    ['Meta Ads', csvMeta, `mimo-meta-ads_${sufixo}.csv`], ['Pedidos fechados', csvPedidos, `mimo-pedidos_${sufixo}.csv`],
  ];

  return <section className="px-4 py-6 md:px-8 md:py-8">
    <header><p className="text-xs uppercase text-muted-foreground">Comercial MiMo</p><h1 className="mt-1 text-2xl font-semibold">Relatórios</h1>
      <p className="mt-2 text-sm text-muted-foreground">Mesmas fórmulas do Dashboard. O período anterior tem a mesma duração e termina um dia antes do início escolhido (7 dias = semana anterior).</p></header>

    <div className="mt-6 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor="r-ini">Início</Label><Input id="r-ini" type="date" value={filtro.inicio} max={filtro.fim} onChange={e => set('inicio', e.target.value)} /></div>
      <div><Label htmlFor="r-fim">Fim</Label><Input id="r-fim" type="date" value={filtro.fim} min={filtro.inicio} onChange={e => set('fim', e.target.value)} /></div>
      <div><Label>Campanha</Label><Select value={filtro.campanha || '__todas'} onValueChange={v => set('campanha', v === '__todas' ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__todas">Todas</SelectItem>
          {r?.atual.porCampanha.map(c => <SelectItem key={c.campanha} value={c.campanha}>{c.campanha}</SelectItem>)}
          {filtro.campanha && !r?.atual.porCampanha.some(c => c.campanha === filtro.campanha) && <SelectItem value={filtro.campanha}>{filtro.campanha}</SelectItem>}
        </SelectContent></Select></div>
      <div><Label>Origem</Label><Select value={filtro.origem || '__todas'} onValueChange={v => set('origem', v === '__todas' ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__todas">Todas</SelectItem>
          {Object.entries(ORIGENS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
    </div>

    {!valido && <p role="alert" className="mt-4 text-sm text-destructive">Escolha um período válido de até 13 semanas.</p>}
    {q.isError && <p role="alert" className="mt-4 text-sm text-destructive">{q.error instanceof Error ? q.error.message : 'Não foi possível carregar.'}</p>}
    {q.isLoading && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando relatório…</p>}

    {r && <>
      <div className="mt-6 flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Exportar CSV:</span>
        {exportar.map(([t, f, nome]) => <Button key={t} variant="outline" size="sm" onClick={() => baixar(f(r), nome)}><Download className="mr-1 h-4 w-4" />{t}</Button>)}</div>

      <h2 className="mt-8 font-medium">Comparação com o período anterior ({dia(r.anteriorPeriodo.inicio)} a {dia(r.anteriorPeriodo.fim)})</h2>
      <div className="mt-2 overflow-x-auto"><Table><TableHeader><TableRow>{['Indicador', 'Período', 'Anterior', 'Variação'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{r.comparacao.map(c => <TableRow key={c.indicador}><TableCell className="font-medium">{ROTULO_INDICADOR[c.indicador].replace(/ \((R\$|%|quantidade)\)/, '')}</TableCell>
          <TableCell className="tabular-nums">{fmt(c.indicador, c.atual)}</TableCell><TableCell className="tabular-nums">{fmt(c.indicador, c.anterior)}</TableCell>
          <TableCell className="tabular-nums">{c.variacao === null ? VAZIO : `${c.variacao > 0 ? '+' : ''}${c.variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</TableCell></TableRow>)}</TableBody></Table></div>

      <h2 className="mt-8 font-medium">Evolução semanal</h2>
      <div className="mt-2 overflow-x-auto"><Table><TableHeader><TableRow>{['Semana', 'Investimento', 'Leads', 'CPL', 'Qualificação', 'CPQL', 'Pedidos', 'Conversão', 'CAC de mídia'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{r.semanas.map(s => <TableRow key={s.inicio}><TableCell className="font-medium">{dia(s.inicio).slice(0, 5)} a {dia(s.fim).slice(0, 5)}{s.parcial ? ' (parcial)' : ''}</TableCell>
          <TableCell>{brl(s.investimento)}</TableCell><TableCell>{num(s.leadsGerados)}</TableCell><TableCell>{brl(s.cpl)}</TableCell><TableCell>{pct(s.taxaQualificacao)}</TableCell>
          <TableCell>{brl(s.cpql)}</TableCell><TableCell>{num(s.novosClientes)}</TableCell><TableCell>{pct(s.taxaConversao)}</TableCell><TableCell>{brl(s.cacMidia)}</TableCell></TableRow>)}</TableBody></Table></div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div><h2 className="font-medium">Leads por perfil</h2>{r.atual.leadsPorPerfil.length ? <ul className="mt-2 space-y-1 text-sm">{r.atual.leadsPorPerfil.map(p => <li key={p.perfil} className="flex justify-between border-b border-border py-1"><span>{PERFIS[p.perfil as keyof typeof PERFIS] ?? p.perfil}</span><span className="tabular-nums">{p.total}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nenhum lead no período.</p>}</div>
        <div><h2 className="font-medium">Leads por origem</h2>{r.leadsPorOrigem.length ? <ul className="mt-2 space-y-1 text-sm">{r.leadsPorOrigem.map(p => <li key={p.origem} className="flex justify-between border-b border-border py-1"><span>{ORIGENS[p.origem as keyof typeof ORIGENS] ?? p.origem}</span><span className="tabular-nums">{p.total}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nenhum lead no período.</p>}</div>
      </div>

      <h2 className="mt-8 font-medium">Avisos e limitações</h2>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />Valores ausentes aparecem como "—" e nunca são tratados como zero. CAC de mídia considera só o investimento em anúncios.</li>
        <li className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />Cada período usa os leads que entraram nele; pedidos fechados depois do fim não contam.</li>
        {r.atual.avisos.leadsMeta !== null && <li className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />O Meta informou {num(r.atual.avisos.leadsMeta)} leads. Esse número é só referência e não é somado aos leads do CRM.</li>}
        {!r.atual.avisos.investimentoAplicavel && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Com essa origem não há investimento atribuível; CPL, CPQL e CAC ficam em branco.</li>}
        {r.atual.avisos.investimentoAplicavel && r.atual.avisos.semMeta && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Nenhum dado do Meta Ads importado para este período.</li>}
        {r.atual.avisos.metaParciais > 0 && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{r.atual.avisos.metaParciais} linha(s) do Meta cobrem datas fora do período e ficaram de fora. Importe o relatório por dia para comparações semanais precisas.</li>}
        {(r.atual.avisos.leadsMetaSemCampanha > 0 || r.atual.avisos.clientesSemCampanha > 0) && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Sem campanha informada: {r.atual.avisos.leadsMetaSemCampanha} lead(s) do Meta e {r.atual.avisos.clientesSemCampanha} cliente(s).</li>}
      </ul>
    </>}
  </section>;
}

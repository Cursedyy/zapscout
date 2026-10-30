import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Info, Loader2, LayoutDashboard } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { dashboardMimo } from '@/lib/mimo-dashboard.functions';
import { ORIGENS, PERFIS } from '@/lib/mimo-leads';

const VAZIO = '—';
const brl = (v: number | null) => (v === null ? VAZIO : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (v: number | null) => (v === null ? VAZIO : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const num = (v: number | null) => (v === null ? VAZIO : v.toLocaleString('pt-BR'));
const dia = (v: string) => v.split('-').reverse().join('/');
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const menosDias = (d: string, n: number) => new Date(Date.parse(d) - n * 86400000).toISOString().slice(0, 10);

export function MimoDashboardPage() {
  const fn = useServerFn(dashboardMimo);
  const [filtro, setFiltro] = useState({ inicio: menosDias(hoje(), 29), fim: hoje(), campanha: '', origem: '' as '' | keyof typeof ORIGENS });
  const valido = filtro.inicio && filtro.fim && filtro.inicio <= filtro.fim;
  const q = useQuery({ queryKey: ['mimo-dashboard', filtro], queryFn: () => fn({ data: filtro }), enabled: !!valido, placeholderData: keepPreviousData });
  const set = (k: keyof typeof filtro, v: string) => setFiltro(p => ({ ...p, [k]: v }));
  const d = q.data;

  if (d && !d.permitido) return <section className="px-4 py-6 md:px-8 md:py-8"><h1 className="text-2xl font-semibold">Dashboard</h1>
    <p className="mt-3 text-sm text-muted-foreground">O dashboard gerencial é exclusivo de administradores e gestores da MiMo. Seus leads continuam disponíveis em Leads.</p></section>;

  const i = d?.permitido ? d.indicadores : null;
  const cards: [string, string, string][] = i ? [
    ['Investimento', brl(i.investimento), 'Soma do Meta Ads importado'],
    ['Leads gerados', num(i.leadsGerados), 'Leads únicos no CRM MiMo'],
    ['CPL', brl(i.cpl), 'Investimento ÷ leads gerados'],
    ['Taxa de qualificação', pct(i.taxaQualificacao), `${num(i.qualificados)} qualificados ÷ leads gerados`],
    ['CPQL', brl(i.cpql), 'Investimento ÷ leads qualificados'],
    ['Taxa de conversão', pct(i.taxaConversao), `${num(i.novosClientes)} novos clientes ÷ leads gerados`],
    ['CAC de mídia', brl(i.cacMidia), 'Só investimento em anúncios ÷ novos clientes'],
    ['Pedidos fechados', brl(i.receita), `${num(i.novosClientes)} pedidos no período`],
  ] : [];

  return <section className="px-4 py-6 md:px-8 md:py-8">
    <header><p className="text-xs uppercase text-muted-foreground">Comercial MiMo</p><h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">Período: {valido ? `${dia(filtro.inicio)} a ${dia(filtro.fim)}` : 'inválido'} · Fontes: leads, qualificação e pedidos do CRM MiMo; investimento do Meta Ads importado.</p></header>

    <div className="mt-6 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor="d-ini">Início</Label><Input id="d-ini" type="date" value={filtro.inicio} max={filtro.fim} onChange={e => set('inicio', e.target.value)} /></div>
      <div><Label htmlFor="d-fim">Fim</Label><Input id="d-fim" type="date" value={filtro.fim} min={filtro.inicio} onChange={e => set('fim', e.target.value)} /></div>
      <div><Label>Campanha</Label><Select value={filtro.campanha || '__todas'} onValueChange={v => set('campanha', v === '__todas' ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__todas">Todas</SelectItem>
          {d?.permitido && d.porCampanha.map(c => <SelectItem key={c.campanha} value={c.campanha}>{c.campanha}</SelectItem>)}
          {filtro.campanha && !(d?.permitido && d.porCampanha.some(c => c.campanha === filtro.campanha)) && <SelectItem value={filtro.campanha}>{filtro.campanha}</SelectItem>}
        </SelectContent></Select></div>
      <div><Label>Origem</Label><Select value={filtro.origem || '__todas'} onValueChange={v => set('origem', v === '__todas' ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__todas">Todas</SelectItem>
          {Object.entries(ORIGENS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
    </div>

    {!valido && <p role="alert" className="mt-4 text-sm text-destructive">O início precisa ser anterior ao fim.</p>}
    {q.isError && <p role="alert" className="mt-4 text-sm text-destructive">{q.error instanceof Error ? q.error.message : 'Não foi possível carregar.'}</p>}
    {q.isLoading && <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando indicadores…</p>}

    {d?.permitido && <>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([t, v, s]) => <div key={t} className="rounded-xl border border-border bg-card p-4 shadow-sm"><dt className="text-sm text-muted-foreground">{t}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-primary">{v}</dd><p className="mt-1 text-xs text-muted-foreground">{s}</p></div>)}
      </dl>

      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
        <li className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />CAC de mídia considera apenas o investimento em anúncios; outros custos de aquisição não estão cadastrados.</li>
        <li className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />Os indicadores usam os leads que entraram no período; pedidos fechados depois do fim não contam.</li>
        {d.avisos.leadsMeta !== null && <li className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" />O Meta informou {num(d.avisos.leadsMeta)} leads no período. Esse número é só referência e não é somado ao CRM.</li>}
        {!d.avisos.investimentoAplicavel && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Com essa origem não há investimento atribuível; CPL, CPQL e CAC ficam em branco.</li>}
        {d.avisos.investimentoAplicavel && d.avisos.semMeta && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Nenhum dado do Meta Ads importado para este período.</li>}
        {d.avisos.metaParciais > 0 && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{d.avisos.metaParciais} linha(s) do Meta cobrem datas fora do período e ficaram de fora. Importe o relatório por dia para mais precisão.</li>}
        {(d.avisos.leadsMetaSemCampanha > 0 || d.avisos.clientesSemCampanha > 0) && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Sem campanha informada: {d.avisos.leadsMetaSemCampanha} lead(s) do Meta e {d.avisos.clientesSemCampanha} cliente(s). Eles não aparecem na comparação por campanha.</li>}
      </ul>

      {d.indicadores.leadsGerados === 0 && d.avisos.semMeta ? <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-border bg-card py-12 text-center shadow-sm"><LayoutDashboard className="h-8 w-8 text-primary" />
        <p className="mt-3 font-medium">Ainda não há dados neste período</p><p className="mt-1 text-sm text-muted-foreground">Cadastre leads em Leads ou importe um relatório em Meta Ads.</p></div> : <>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <figure><figcaption className="mb-2 font-medium">Evolução por {d.granularidade === 'mes' ? 'mês' : 'dia'}</figcaption><div className="h-72">
            <ResponsiveContainer><LineChart data={d.serie}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={v => (v.length === 10 ? dia(v).slice(0, 5) : v.split('-').reverse().join('/'))} />
              <YAxis yAxisId="r" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} /><YAxis yAxisId="q" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip formatter={(v: number, n: string) => (n === 'Investimento' ? brl(v) : num(v))} /><Legend />
              <Line yAxisId="r" dataKey="investimento" name="Investimento" stroke="var(--primary)" dot={false} />
              <Line yAxisId="q" dataKey="leads" name="Leads" stroke="var(--chart-2, var(--foreground))" dot={false} />
              <Line yAxisId="q" dataKey="pedidos" name="Pedidos fechados" stroke="var(--chart-3, var(--muted-foreground))" dot={false} />
            </LineChart></ResponsiveContainer></div></figure>
          <figure><figcaption className="mb-2 font-medium">Leads por perfil</figcaption>{d.leadsPorPerfil.length ? <div className="h-72">
            <ResponsiveContainer><BarChart data={d.leadsPorPerfil.map(p => ({ ...p, nome: PERFIS[p.perfil as keyof typeof PERFIS] ?? p.perfil }))} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} /><Tooltip /><Bar dataKey="total" name="Leads" fill="var(--primary)" />
            </BarChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">Nenhum lead no período.</p>}</figure>
        </div>

        <h2 className="mt-8 font-medium">Comparação por campanha</h2>
        {d.porCampanha.length ? <div className="mt-2 overflow-x-auto"><Table><TableHeader><TableRow>
          {['Campanha', 'Investimento', 'Leads', 'Qualificados', 'Clientes', 'CPL', 'CAC de mídia'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{d.porCampanha.map(c => <TableRow key={c.campanha}><TableCell className="font-medium">{c.campanha}</TableCell><TableCell>{brl(c.investimento)}</TableCell>
            <TableCell>{num(c.leads)}</TableCell><TableCell>{num(c.qualificados)}</TableCell><TableCell>{num(c.clientes)}</TableCell><TableCell>{brl(c.cpl)}</TableCell><TableCell>{brl(c.cacMidia)}</TableCell></TableRow>)}</TableBody></Table>
          <p className="mt-2 text-xs text-muted-foreground">A atribuição usa o nome da campanha gravado no lead, que precisa ser igual ao nome no Meta Ads.</p></div>
          : <p className="mt-2 text-sm text-muted-foreground">Sem campanhas no período.</p>}
      </>}
    </>}
  </section>;
}

import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { agruparClientes, type Dashboard, type PeriodoClientes } from '@/lib/mimo-dashboard';

const series = [
  { chave: 'atendidos', nome: 'Atendidos', cor: '#167044' },
  { chave: 'qualificados', nome: 'Qualificados', cor: '#51a332' },
  { chave: 'convertidos', nome: 'Convertidos', cor: '#d18a08' },
] as const;
const periodos = { dia: 'Dia', semana: 'Semana', mes: 'Mês' } as const;
const dataCurta = (dia: string) => dia.slice(8) + '/' + dia.slice(5, 7);
const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export function MimoEvolucaoClientes({ dias }: { dias: Dashboard['evolucaoClientes'] }) {
  const id = useId().replace(/:/g, '');
  const [periodo, setPeriodo] = useState<PeriodoClientes>('semana');
  const pontos = agruparClientes(dias, periodo);
  const rotulo = (chave: unknown) => {
    if (typeof chave !== 'string') return '';
    if (/^\d{4}-\d{2}$/.test(chave)) return mesCurto.format(new Date(chave + '-01T00:00:00Z'));
    return /^\d{4}-\d{2}-\d{2}$/.test(chave) ? dataCurta(chave) : '';
  };
  return <figure className="mt-6 min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
    <figcaption className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Evolução de clientes</h2>
        <p className="mt-1 text-sm text-muted-foreground">Primeiro atendimento, primeira qualificação e fechamento no CRM dos leads que entraram no período.</p></div>
      <div role="group" aria-label="Agrupar evolução de clientes" className="inline-flex rounded-lg border p-0.5">
        {(Object.keys(periodos) as PeriodoClientes[]).map(p => <button key={p} type="button" aria-pressed={periodo === p}
          onClick={() => setPeriodo(p)} className="rounded-md px-3 py-1.5 text-sm font-medium aria-pressed:bg-emerald-800 aria-pressed:text-white focus-visible:outline focus-visible:outline-2">
          {periodos[p]}
        </button>)}
      </div>
    </figcaption>
    <div className="mt-5 h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pontos} accessibilityLayer margin={{ top: 8, right: 12, bottom: 2, left: 0 }}>
          <defs>{series.map(s => <linearGradient key={s.chave} id={id + s.chave} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={s.cor} stopOpacity={0.13}/><stop offset="100%" stopColor={s.cor} stopOpacity={0.015}/>
          </linearGradient>)}</defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="periodo" tickFormatter={rotulo} minTickGap={28} tick={{ fontSize: 11 }} tickLine={false}/>
          <YAxis width={38} allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
          <Tooltip labelFormatter={v => periodo === 'semana' && rotulo(v) ? 'Semana de ' + rotulo(v) : rotulo(v)} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }}/>
          {series.map(s => <Area key={s.chave} type="linear" dataKey={s.chave} name={s.nome} stroke={s.cor} strokeWidth={2.5}
            fill={'url(#' + id + s.chave + ')'} dot={pontos.length <= 35 ? { r: 3, fill: 'var(--card)', strokeWidth: 1.5 } : false}
            activeDot={{ r: 4 }} isAnimationActive={false}/>)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </figure>;
}

import { lazy, Suspense } from 'react';
import { ArrowUpRight, CalendarClock, MessageCircle, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ETAPAS, ORIGENS, PERFIS, QUALIFICACOES, type MimoLead } from '@/lib/mimo-leads';
import { PRIORIDADES, sugerirPrioridade, type Prioridade } from '@/lib/mimo-qualidade';
import { exibirComercial } from '@/lib/mimo-comercial';
import { cn } from '@/lib/utils';

export const carregarChatAtendimento = () => import('./mimo-whatsapp-lead');
const Chat = lazy(() => carregarChatAtendimento().then(module => ({ default: module.WhatsAppLeadMimo })));
const diaContato = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });

const etapasAtivas = new Set(['contato_realizado', 'em_negociacao']);
const etapasFinais = new Set(['pedido_fechado', 'perdido']);
const gruposEntrada = [
  { titulo: 'Novos qualificados', inclui: (lead: MimoLead) => lead.etapa === 'novo' && lead.qualificacao === 'qualificado' },
  { titulo: 'Novos em triagem', inclui: (lead: MimoLead) => lead.etapa === 'novo' && lead.qualificacao === 'pendente' },
  { titulo: 'Não qualificados', inclui: (lead: MimoLead) => lead.etapa === 'novo' && lead.qualificacao === 'nao_qualificado' },
  { titulo: 'Em atendimento', inclui: (lead: MimoLead) => etapasAtivas.has(lead.etapa) },
  { titulo: 'Encerrados', inclui: (lead: MimoLead) => etapasFinais.has(lead.etapa) },
];

function responsavelDoLead(lead: MimoLead, membros: Record<string, string>) {
  return lead.responsavel_id ? membros[lead.responsavel_id] ?? 'Membro inativo' : 'Sem responsável';
}

export function ListaAtendimentoMimo({ leads, membros, funil, selecionado, onSelect, onPrepare }: {
  leads: MimoLead[];
  membros: Record<string, string>;
  funil: boolean;
  selecionado?: string;
  onSelect: (id: string) => void;
  onPrepare: (id: string) => void;
}) {
  if (!leads.length) {
    return <div className="grid min-h-44 place-content-center gap-2 px-4 text-center text-sm text-muted-foreground">
      <Users className="mx-auto size-6 text-primary" aria-hidden="true" /> Nenhum lead encontrado
    </div>;
  }
  const grupos = funil
    ? Object.entries(ETAPAS).map(([etapa, titulo]) => ({ titulo, inclui: (lead: MimoLead) => lead.etapa === etapa }))
    : gruposEntrada;

  return (
    <div className={cn('min-w-0', funil
      ? 'grid grid-cols-[repeat(5,minmax(10.5rem,1fr))] gap-2.5 overflow-x-auto px-3 pb-4'
      : 'max-h-[min(65dvh,38rem)] space-y-4 overflow-y-auto overscroll-contain p-3')}>
      {grupos.map(({ titulo, inclui }) => {
        const itens = leads.filter(inclui);
        if (!funil && !itens.length) return null;
        return (
          <section key={titulo} aria-label={titulo} className={cn('min-w-0', funil && 'rounded-xl border bg-muted/40 p-2')}>
            <h3 className="mb-2 flex items-center justify-between gap-1 px-1 text-xs font-semibold text-foreground">
              {titulo}<span className="rounded-full bg-card px-1.5 py-0.5 tabular-nums text-muted-foreground">{itens.length}</span>
            </h3>
            {itens.length ? <ul className={cn('space-y-1.5', funil && 'max-h-56 overflow-y-auto overscroll-contain')}>
              {itens.map(lead => {
                const atual = selecionado === lead.id;
                return <li key={lead.id}>
                  <button type="button" aria-pressed={atual} onClick={() => onSelect(lead.id)}
                    onPointerEnter={e => { if (e.pointerType === 'mouse') onPrepare(lead.id); }} onFocus={() => onPrepare(lead.id)}
                    className={cn('group w-full rounded-lg border px-2.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      atual ? 'border-primary/50 bg-accent text-accent-foreground' : 'border-transparent bg-card hover:border-border hover:bg-muted/55',
                      funil && !atual && 'border-border')}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold">{lead.nome_empresa}</span>
                      {!funil && lead.ultimo_contato_whatsapp_em && <time className="shrink-0 text-[0.6875rem] text-muted-foreground" dateTime={lead.ultimo_contato_whatsapp_em}>
                        {diaContato.format(new Date(lead.ultimo_contato_whatsapp_em))}
                      </time>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{lead.nome_contato || lead.telefone || responsavelDoLead(lead, membros)}</span>
                    {funil && <span className="mt-2 block truncate text-xs text-muted-foreground">{responsavelDoLead(lead, membros)}</span>}
                  </button>
                </li>;
              })}
            </ul> : <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum lead</p>}
          </section>
        );
      })}
    </div>
  );
}

export function EspacoConversaMimo({ lead, usuarioId, membros, carregando, erro, onRetry, onFicha, onFollowups }: {
  lead?: MimoLead;
  usuarioId: string;
  membros: Record<string, string>;
  carregando: boolean;
  erro: boolean;
  onRetry: () => void;
  onFicha: () => void;
  onFollowups: () => void;
}) {
  if (!lead) {
    return <div className="grid min-h-56 place-content-center justify-items-center gap-2 p-5 text-center text-sm text-muted-foreground lg:min-h-96">
      {carregando ? <p role="status">Carregando lead…</p> : erro ? <>
        <p role="alert">Não foi possível abrir este lead.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>
      </> : <>
        <MessageCircle className="size-8 text-primary" aria-hidden="true" />
        <p>Selecione um lead para abrir o chat e a ficha.</p>
      </>}
    </div>;
  }
  const sugestao = sugerirPrioridade(lead);
  const prioridade = lead.prioridade_revisada
    ? PRIORIDADES[lead.prioridade_revisada as Prioridade]
    : sugestao.tipo === 'sugestao' ? PRIORIDADES[sugestao.nivel] : undefined;
  const dados = [
    ['Responsável', responsavelDoLead(lead, membros)],
    ['Perfil', PERFIS[lead.perfil as keyof typeof PERFIS]],
    ['Origem', ORIGENS[lead.origem as keyof typeof ORIGENS]],
    ['Qualificação', QUALIFICACOES[lead.qualificacao as keyof typeof QUALIFICACOES]],
    ['Prioridade', prioridade],
    ['Último contato', lead.ultimo_contato_whatsapp_em && exibirComercial(lead.ultimo_contato_whatsapp_em)],
  ];
  return <div className="grid min-w-0 content-start gap-3 p-3 @min-[38rem]:grid-cols-[minmax(0,1fr)_minmax(11rem,0.53fr)]">
    <Suspense fallback={<Skeleton role="status" aria-label="Carregando conversa" className="min-h-80 w-full rounded-xl" />}>
      <Chat key={`${usuarioId}:${lead.id}`} leadId={lead.id} usuarioId={usuarioId}
        telefone={lead.telefone} contato={lead.nome_contato || lead.nome_empresa} incorporado />
    </Suspense>
    <aside aria-label="Ficha do lead" className="min-w-0 space-y-4 self-start rounded-xl border bg-background p-3.5 text-sm">
      <header className="space-y-1.5">
        <h3 className="font-semibold">Ficha do lead</h3>
        <p className="font-medium [overflow-wrap:anywhere]">{lead.nome_empresa}</p>
        <Badge variant="outline" className="whitespace-normal bg-accent text-accent-foreground">
          {ETAPAS[lead.etapa as keyof typeof ETAPAS] ?? lead.etapa}
        </Badge>
      </header>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-3 @min-[38rem]:grid-cols-1">
        {dados.map(([rotulo, valor]) => <div key={rotulo} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{rotulo}</dt>
          <dd className="mt-0.5 font-medium [overflow-wrap:anywhere]">{valor || 'Não informado'}</dd>
        </div>)}
      </dl>
      {lead.observacoes?.trim() && <details className="border-t pt-3" open>
        <summary className="cursor-pointer text-xs font-semibold">Observações</summary>
        <p className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-xs [overflow-wrap:anywhere]">{lead.observacoes}</p>
      </details>}
      {sugestao.tipo === 'sugestao' && <div className="rounded-lg bg-secondary p-2.5">
        <h4 className="text-xs font-semibold">Próxima ação sugerida</h4>
        <p className="mt-1 text-xs">{sugestao.proximaAcao}</p>
      </div>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-left" onClick={onFicha}>
          Abrir ficha <ArrowUpRight aria-hidden="true" />
        </Button>
        <Button size="sm" variant="ghost" className="h-auto min-h-8 whitespace-normal text-left" onClick={onFollowups}>
          <CalendarClock aria-hidden="true" /> Follow-ups
        </Button>
      </div>
    </aside>
  </div>;
}

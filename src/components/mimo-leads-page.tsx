import { useEffect, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { keepPreviousData, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Inbox, KanbanSquare, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { contextoMimoOptions } from '@/lib/mimo-contexto';
import { atualizarConsultasMimo } from '@/lib/mimo-cache';
import { abrirLeadComercialMimo } from '@/lib/mimo-comercial.functions';
import { conversaLeadOptions } from '@/lib/mimo-conversa.queries';
import { listarLeadsMimo, type FiltrosMimo } from '@/lib/mimo-leads.functions';
import { filtrosIniciais, leadsMimoOptions } from '@/lib/mimo-leads.queries';
import { ETAPAS, ORIGENS, PERFIS, podeEditarLead, type MimoLead } from '@/lib/mimo-leads';
import { cn } from '@/lib/utils';
import { carregarChatAtendimento, EspacoConversaMimo, ListaAtendimentoMimo } from './mimo-atendimento-lead';
import { MimoCarregando } from './mimo-carregando';
import { Escolha, MimoLeadEditor } from './mimo-lead-editor';
import { FollowupsLeadMimo } from './mimo-lead-followups';

export { filtrosIniciais, leadsMimoOptions } from '@/lib/mimo-leads.queries';
export { contextoMimoOptions } from '@/lib/mimo-contexto';

const visoes = [
  { id: 'entrada', nome: 'Caixa de entrada', Icone: Inbox },
  { id: 'funil', nome: 'Funil comercial', Icone: KanbanSquare },
  { id: 'retornos', nome: 'Fila de retornos', Icone: CalendarClock },
] as const;
type Visao = (typeof visoes)[number]['id'];
const itensPorPagina = 30;

export function MimoLeadsPage() {
  const { data: contexto } = useSuspenseQuery(contextoMimoOptions);
  const client = useQueryClient();
  const [visao, setVisao] = useState<Visao>('entrada');
  const [filtros, setFiltros] = useState(filtrosIniciais);
  const [busca, setBusca] = useState('');
  const parametroLead = useSearch({ from: '/_authenticated/mimo/leads' }).lead;
  const [selecionado, setSelecionado] = useState(parametroLead);
  const [editor, setEditor] = useState<{ lead: MimoLead | null; aba?: 'contexto' | 'followups' } | null>(null);
  const membros = Object.fromEntries(contexto.membros.map(m => [m.user_id, m.nome]));
  const membrosComerciais = Object.fromEntries(
    contexto.membros.filter(m => ['administrador', 'gestor', 'vendedor'].includes(m.papel)).map(m => [m.user_id, m.nome]),
  );
  const listar = useServerFn(listarLeadsMimo);
  const abrir = useServerFn(abrirLeadComercialMimo);
  const lista = useQuery({
    ...leadsMimoOptions(contexto.usuarioId, filtros),
    queryFn: ({ signal }) => listar({ data: filtros, signal }),
    placeholderData: keepPreviousData,
    enabled: visao !== 'retornos',
  });
  const leadNaPagina = lista.data?.leads.find(lead => lead.id === selecionado);
  const detalhe = useQuery({
    queryKey: ['mimo-lead-atendimento', contexto.usuarioId, selecionado],
    queryFn: ({ signal }) => abrir({ data: { id: selecionado! }, signal }),
    enabled: !!selecionado && (!leadNaPagina || visao === 'retornos'),
    staleTime: 15_000,
    retry: false,
  });
  const lead = visao === 'retornos'
    ? detalhe.data ?? (detalhe.isError ? undefined : leadNaPagina)
    : leadNaPagina ?? detalhe.data;
  const total = lista.data?.total ?? 0;
  const temFiltros = filtros.inicio || filtros.fim || filtros.origem || filtros.perfil || filtros.etapa || filtros.responsavel || filtros.busca || busca;

  useEffect(() => {
    if (parametroLead) setSelecionado(parametroLead);
  }, [parametroLead]);

  function prepararConversa(id: string) {
    void carregarChatAtendimento().catch(() => {});
    void client.prefetchQuery(conversaLeadOptions(contexto.usuarioId, id));
  }

  function selecionar(id: string) {
    prepararConversa(id);
    setSelecionado(id);
  }

  function selecionarVisao(nova: Visao) {
    if (nova === visao) return;
    setVisao(nova);
    if (!window.matchMedia('(min-width: 1024px)').matches) setSelecionado(undefined);
  }

  function filtrar<K extends keyof FiltrosMimo>(campo: K, valor: FiltrosMimo[K]) {
    setFiltros(f => ({ ...f, [campo]: valor, pagina: 0 }));
  }

  const dataFiltro = (v: string | null) => v ? new Date(v).toLocaleDateString('sv-SE') : '';
  return (
    <section className="min-w-0 px-3 py-5 sm:px-5 xl:px-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <Button onClick={() => setEditor({ lead: null })}><Plus aria-hidden="true" /> Novo lead</Button>
      </header>

      <div role="group" aria-label="Visualização de leads" className="mt-4 flex flex-wrap gap-1.5">
        {visoes.map(({ id, nome, Icone }) => (
          <Button key={id} type="button" size="sm" variant="outline"
            className={cn(visao === id && 'border-primary/60 bg-accent text-accent-foreground')}
            aria-pressed={visao === id} onClick={() => selecionarVisao(id)}>
            <Icone aria-hidden="true" /> {nome}
          </Button>
        ))}
      </div>

      <div className={cn('mt-4 grid min-w-0 items-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        visao === 'entrada' && 'lg:grid-cols-[minmax(13rem,0.78fr)_minmax(0,2fr)]',
        visao === 'retornos' && 'lg:grid-cols-[minmax(15rem,0.92fr)_minmax(0,2fr)]')}>
        <div className={cn('min-w-0 bg-background/70 lg:self-stretch',
          visao === 'funil' ? 'border-b' : 'lg:border-r',
          selecionado && 'hidden lg:block')}>
          {visao === 'retornos' ? (
            <FollowupsLeadMimo usuarioId={contexto.usuarioId} membros={membrosComerciais}
              fila={{ leads: lista.data?.leads ?? [], selecionado, preparar: prepararConversa }} onOpen={selecionar} />
          ) : (
            <>
              <div className="space-y-3 p-3">
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); filtrar('busca', busca); }}>
                  <Input aria-label="Pesquisar leads" placeholder="Empresa, contato ou telefone" value={busca}
                    onChange={e => setBusca(e.target.value)} maxLength={200} className="min-w-0" />
                  <Button variant="outline" size="icon" type="submit" aria-label="Pesquisar"><Search aria-hidden="true" /></Button>
                </form>
                <details className="rounded-lg border bg-card text-sm">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <SlidersHorizontal aria-hidden="true" className="size-4" />
                    {temFiltros ? 'Filtros · ativos' : 'Filtros'}
                  </summary>
                  <div className={cn('grid gap-2.5 border-t p-2.5', visao === 'funil' ? 'sm:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2')}>
                    <Escolha label="Etapa" value={filtros.etapa} opcoes={{ '': 'Todas', ...ETAPAS }} onChange={v => filtrar('etapa', v)} />
                    <Escolha label="Responsável" value={filtros.responsavel} opcoes={{ '': 'Todos', sem: 'Sem responsável', ...membros }}
                      onChange={v => filtrar('responsavel', v as FiltrosMimo['responsavel'])} />
                    <Escolha label="Origem" value={filtros.origem} opcoes={{ '': 'Todas', ...ORIGENS }} onChange={v => filtrar('origem', v)} />
                    <Escolha label="Perfil" value={filtros.perfil} opcoes={{ '': 'Todos', ...PERFIS }} onChange={v => filtrar('perfil', v)} />
                    <label className="grid min-w-0 gap-1.5">Entrada de<Input type="date" value={dataFiltro(filtros.inicio)}
                      onChange={e => filtrar('inicio', e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null)} /></label>
                    <label className="grid min-w-0 gap-1.5">Entrada até<Input type="date" value={dataFiltro(filtros.fim)}
                      onChange={e => filtrar('fim', e.target.value ? new Date(`${e.target.value}T23:59:59.999`).toISOString() : null)} /></label>
                    {temFiltros && <Button type="button" variant="ghost" size="sm" className="col-span-full w-fit"
                      onClick={() => { setFiltros(filtrosIniciais); setBusca(''); }}>Limpar filtros</Button>}
                  </div>
                </details>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <h2 className="font-semibold">{visao === 'funil' ? 'Etapas comerciais' : 'Conversas'}</h2>
                    {lista.data && <p>{total} {total === 1 ? 'lead' : 'leads'}{visao === 'funil' && total > itensPorPagina && ' · quadro por página'}</p>}
                    {lista.isPlaceholderData && <span role="status" className="text-xs">Atualizando leads…</span>}
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Atualizar leads" disabled={lista.isFetching} onClick={() => void lista.refetch()}>
                    <RefreshCw aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {lista.isPending ? <MimoCarregando /> : lista.isError ? (
                <div className="px-3 pb-4 text-sm" role="alert">
                  Não foi possível carregar os leads. <Button variant="link" onClick={() => void lista.refetch()}>Tentar novamente</Button>
                </div>
              ) : (
                <div aria-busy={lista.isPlaceholderData}>
                  <ListaAtendimentoMimo leads={lista.data.leads} membros={membros} funil={visao === 'funil'}
                    selecionado={selecionado} onSelect={selecionar} onPrepare={prepararConversa} />
                </div>
              )}
              {(total > itensPorPagina || filtros.pagina > 0) && <nav aria-label="Páginas de leads" className="flex items-center justify-between gap-2 border-t px-3 py-2">
                <span className="text-xs text-muted-foreground">Página {filtros.pagina + 1} de {Math.max(1, Math.ceil(total / itensPorPagina))}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" aria-label="Página anterior" disabled={!filtros.pagina || lista.isFetching}
                    onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}><ChevronLeft aria-hidden="true" /></Button>
                  <Button variant="outline" size="icon" aria-label="Próxima página" disabled={lista.isFetching || (filtros.pagina + 1) * itensPorPagina >= total}
                    onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}><ChevronRight aria-hidden="true" /></Button>
                </div>
              </nav>}
            </>
          )}
        </div>
        <div className={cn('@container min-w-0', !selecionado && 'hidden lg:block')}>
          {selecionado && <Button type="button" variant="ghost" size="sm" className="m-2 lg:hidden" onClick={() => setSelecionado(undefined)}>
            <ArrowLeft aria-hidden="true" /> Voltar para a lista
          </Button>}
          <EspacoConversaMimo lead={lead} usuarioId={contexto.usuarioId} membros={membros}
            carregando={!!selecionado && detalhe.isPending} erro={detalhe.isError}
            onRetry={() => void detalhe.refetch()}
            onFicha={() => lead && setEditor({ lead, aba: 'contexto' })}
            onFollowups={() => lead && setEditor({ lead, aba: 'followups' })} />
        </div>
      </div>
      {editor && <MimoLeadEditor key={editor.lead?.id ?? 'novo'} lead={editor.lead} abaInicial={editor.aba}
        usuarioId={contexto.usuarioId} vendedor={contexto.papel === 'vendedor'}
        podeEditar={!editor.lead || podeEditarLead(contexto.papel, contexto.usuarioId, editor.lead.responsavel_id)}
        membros={membros} membrosComerciais={membrosComerciais}
        onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void atualizarConsultasMimo(client); }} />}
    </section>
  );
}

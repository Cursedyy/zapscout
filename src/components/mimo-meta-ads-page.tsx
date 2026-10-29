import { useRef, useState } from 'react';
import { queryOptions, useSuspenseQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { FileUp, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { importarMetaAdsMimo, listarImportacoesMetaMimo } from '@/lib/mimo-meta-ads.functions';
import { analisarCsvMeta, META_MAX_BYTES, ROTULOS_CAMPO, type ResultadoMeta } from '@/lib/mimo-meta-ads';

export const importacoesMetaOptions = queryOptions({ queryKey: ['mimo-meta-importacoes'], queryFn: () => listarImportacoesMetaMimo() });
const brl = (v: number | null) => v === null ? 'vazio' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const int = (v: number | null) => v === null ? 'vazio' : v.toLocaleString('pt-BR');
const dia = (v: string | null) => v ? v.split('-').reverse().join('/') : '—';

export function MimoMetaAdsPage() {
  const { data } = useSuspenseQuery(importacoesMetaOptions);
  const client = useQueryClient();
  const importar = useServerFn(importarMetaAdsMimo);
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string; r: ResultadoMeta } | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => importar({ data: { nome: arquivo!.nome, texto: arquivo!.texto } }),
    onSuccess: (res) => { toast.success(`Importação concluída: ${res.novas} novas, ${res.atualizadas} atualizadas.`); setArquivo(null); void client.invalidateQueries({ queryKey: ['mimo-meta-importacoes'] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível importar.'),
  });
  async function escolher(f: File | undefined) {
    setErroArquivo(null); setArquivo(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setErroArquivo('Escolha um arquivo .csv exportado do Gerenciador de Anúncios.');
    if (f.size > META_MAX_BYTES) return setErroArquivo('O arquivo passa de 2 MB.');
    const texto = await f.text();
    const r = analisarCsvMeta(texto);
    if (r.erroGeral && !r.validas.length && !r.erros.length) return setErroArquivo(r.erroGeral);
    setArquivo({ nome: f.name, texto, r });
  }
  function cancelar() { setArquivo(null); setErroArquivo(null); if (input.current) input.current.value = ''; }
  const r = arquivo?.r;

  return <section className="px-4 py-6 md:px-8 md:py-8">
    <header><p className="text-xs uppercase text-muted-foreground">Comercial MiMo</p><h1 className="mt-1 text-2xl font-semibold">Importar Meta Ads</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Envie o CSV exportado do Gerenciador de Anúncios. Os números ficam separados do CRM: os "leads" do Meta são o que o Meta informou, não leads qualificados nem vendas.</p></header>

    {data.podeImportar ? <div className="mt-6 border-y border-border py-5">
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" id="csv-meta" onChange={e => void escolher(e.target.files?.[0])} />
      <Button asChild variant="outline"><label htmlFor="csv-meta" className="cursor-pointer"><FileUp />Escolher arquivo CSV</label></Button>
      {erroArquivo && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{erroArquivo}</p>}
    </div> : <p className="mt-6 border-y border-border py-5 text-sm text-muted-foreground">Somente administradores e gestores podem importar. Você pode consultar o histórico abaixo.</p>}

    {arquivo && r && <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Prévia: {arquivo.nome}</h2>
        <div className="flex gap-2"><Button variant="outline" onClick={cancelar} disabled={mut.isPending}><X />Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !r.validas.length}>{mut.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Confirmar importação</Button></div></div>
      {r.erroGeral && <p role="alert" className="text-sm text-destructive">{r.erroGeral}</p>}
      <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {[['Linhas no arquivo', r.total], ['Válidas', r.validas.length], ['Com erro', r.erros.length], ['Duplicadas no arquivo', r.duplicadas],
          ['Período', r.periodo ? `${dia(r.periodo.inicio)} a ${dia(r.periodo.fim)}` : '—'], ['Investimento', brl(r.somas.investimento)]].map(([k, v]) =>
          <div key={k as string} className="border border-border p-3"><dt className="text-muted-foreground">{k}</dt><dd className="mt-1 font-semibold">{v}</dd></div>)}
      </dl>
      <p className="text-sm text-muted-foreground">Colunas reconhecidas: {Object.entries(r.colunas).map(([c, n]) => `${ROTULOS_CAMPO[c as keyof typeof ROTULOS_CAMPO]} ("${n}")`).join(', ') || 'nenhuma'}.
        {r.ausentes.length > 0 && <> Não encontradas no arquivo (ficarão <strong>vazias, não zero</strong>): {r.ausentes.map(c => ROTULOS_CAMPO[c]).join(', ')}.</>}
        {' '}Se um dia/campanha/conjunto/anúncio já foi importado antes, os valores serão <strong>substituídos</strong>, nunca somados.</p>
      {r.erros.length > 0 && <details className="border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">{r.erros.length} linha(s) não serão importadas</summary>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto">{r.erros.slice(0, 200).map(e => <li key={e.linha}>Linha {e.linha}: {e.motivo}</li>)}</ul></details>}
      <div className="overflow-x-auto border-y border-border"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Campanha</TableHead><TableHead>Conjunto</TableHead><TableHead>Anúncio</TableHead><TableHead>Investimento</TableHead><TableHead>Impressões</TableHead><TableHead>Alcance</TableHead><TableHead>Cliques</TableHead><TableHead>Leads (Meta)</TableHead></TableRow></TableHeader>
        <TableBody>{r.validas.slice(0, 50).map(l => <TableRow key={l.chave}><TableCell className="whitespace-nowrap">{dia(l.data_inicio)}{l.data_fim !== l.data_inicio && ` a ${dia(l.data_fim)}`}</TableCell><TableCell>{l.campanha}</TableCell><TableCell>{l.conjunto || '—'}</TableCell><TableCell>{l.anuncio || '—'}</TableCell><TableCell>{brl(l.investimento)}</TableCell><TableCell>{int(l.impressoes)}</TableCell><TableCell>{int(l.alcance)}</TableCell><TableCell>{int(l.cliques)}</TableCell><TableCell>{int(l.leads_meta)}</TableCell></TableRow>)}</TableBody></Table></div>
      {r.validas.length > 50 && <p className="text-xs text-muted-foreground">Mostrando 50 de {r.validas.length} linhas válidas.</p>}
    </div>}

    <h2 className="mt-10 text-lg font-semibold">Histórico de importações</h2>
    <div className="mt-3 overflow-x-auto border-y border-border"><Table><TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Arquivo</TableHead><TableHead>Responsável</TableHead><TableHead>Período</TableHead><TableHead>Registros</TableHead><TableHead>Erros</TableHead></TableRow></TableHeader>
      <TableBody>{data.itens.map(i => <TableRow key={i.id}><TableCell className="whitespace-nowrap">{new Date(i.created_at).toLocaleString('pt-BR')}</TableCell><TableCell>{i.arquivo_nome}</TableCell><TableCell>{i.responsavel}</TableCell><TableCell className="whitespace-nowrap">{dia(i.periodo_inicio)} a {dia(i.periodo_fim)}</TableCell><TableCell>{i.linhas_novas} novos · {i.linhas_atualizadas} atualizados</TableCell><TableCell>{i.linhas_com_erro ? <Badge variant="outline">{i.linhas_com_erro}</Badge> : '0'}</TableCell></TableRow>)}
        {!data.itens.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma importação ainda.</TableCell></TableRow>}</TableBody></Table></div>
  </section>;
}

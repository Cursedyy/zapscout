// Meta Ads CSV parsing for MiMo. Pure and shared by browser preview and server import,
// so the server re-validates the same file instead of trusting the preview.

export const META_MAX_BYTES = 2 * 1024 * 1024;
export const META_MAX_LINHAS = 20000;

export type CampoMeta = 'campanha' | 'conjunto' | 'anuncio' | 'data_inicio' | 'data_fim' | 'investimento' | 'impressoes' | 'alcance' | 'cliques' | 'leads_meta';
export const ROTULOS_CAMPO: Record<CampoMeta, string> = {
  campanha: 'Campanha', conjunto: 'Conjunto de anúncios', anuncio: 'Anúncio', data_inicio: 'Data', data_fim: 'Data final',
  investimento: 'Investimento', impressoes: 'Impressões', alcance: 'Alcance', cliques: 'Cliques', leads_meta: 'Leads (Meta)',
};

const ALIASES: Record<CampoMeta, string[]> = {
  campanha: ['nome da campanha', 'campanha', 'campaign name', 'campaign'],
  conjunto: ['nome do conjunto de anuncios', 'conjunto de anuncios', 'ad set name', 'ad set'],
  anuncio: ['nome do anuncio', 'anuncio', 'ad name', 'ad'],
  data_inicio: ['dia', 'data', 'inicio dos relatorios', 'day', 'date', 'reporting starts'],
  data_fim: ['termino dos relatorios', 'fim dos relatorios', 'reporting ends'],
  investimento: ['valor usado (brl)', 'valor usado', 'valor gasto (brl)', 'valor gasto', 'investimento', 'amount spent (brl)', 'amount spent'],
  impressoes: ['impressoes', 'impressions'],
  alcance: ['alcance', 'reach'],
  cliques: ['cliques no link', 'cliques (todos)', 'cliques', 'link clicks', 'clicks (all)', 'clicks'],
  leads_meta: ['leads', 'cadastros', 'leads (formulario)', 'leads (form)'],
};

const norm = (s: string) => s.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = []; let campo = ''; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(v => v.trim() !== ''));
}

/** Returns ISO yyyy-mm-dd or null when invalid. Accepts yyyy-mm-dd and dd/mm/yyyy. */
export function parseData(v: string): string | null {
  const s = v.trim(); let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Empty -> null (absent, not zero). Invalid -> NaN. Accepts "1.234,56", "1234.56", "R$ 10,00". */
export function parseNumero(v: string): number | null {
  let s = v.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (s === '' || s === '-' || s === '—') return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export type LinhaMeta = {
  linha: number; chave: string; campanha: string; conjunto: string; anuncio: string; data_inicio: string; data_fim: string;
  investimento: number | null; impressoes: number | null; alcance: number | null; cliques: number | null; leads_meta: number | null;
};
export type ErroMeta = { linha: number; motivo: string };
export type ResultadoMeta = {
  erroGeral: string | null; colunas: Partial<Record<CampoMeta, string>>; ausentes: CampoMeta[];
  validas: LinhaMeta[]; erros: ErroMeta[]; duplicadas: number; total: number;
  periodo: { inicio: string; fim: string } | null; somas: { investimento: number; impressoes: number; cliques: number; leads_meta: number };
};

export const chaveMeta = (l: Pick<LinhaMeta, 'data_inicio' | 'data_fim' | 'campanha' | 'conjunto' | 'anuncio'>) =>
  [l.data_inicio, l.data_fim, norm(l.campanha), norm(l.conjunto), norm(l.anuncio)].join('|');

const vazio = (erro: string): ResultadoMeta => ({ erroGeral: erro, colunas: {}, ausentes: [], validas: [], erros: [], duplicadas: 0, total: 0, periodo: null, somas: { investimento: 0, impressoes: 0, cliques: 0, leads_meta: 0 } });

export function analisarCsvMeta(texto: string): ResultadoMeta {
  if (!texto.trim()) return vazio('O arquivo está vazio.');
  if (texto.length > META_MAX_BYTES) return vazio('O arquivo passa de 2 MB.');
  if (/[\u0000-\u0008]/.test(texto.slice(0, 2000))) return vazio('O arquivo não parece ser um CSV de texto.');
  const linhas = parseCsv(texto);
  if (linhas.length < 2) return vazio('O arquivo não tem linhas de dados.');
  if (linhas.length - 1 > META_MAX_LINHAS) return vazio(`O arquivo passa de ${META_MAX_LINHAS} linhas.`);
  const cab = linhas[0].map(norm);
  const idx: Partial<Record<CampoMeta, number>> = {}; const colunas: Partial<Record<CampoMeta, string>> = {};
  (Object.keys(ALIASES) as CampoMeta[]).forEach(campo => {
    for (const a of ALIASES[campo]) { const i = cab.indexOf(a); if (i >= 0 && !Object.values(idx).includes(i)) { idx[campo] = i; colunas[campo] = linhas[0][i].replace(/^\uFEFF/, '').trim(); return; } }
  });
  if (idx.campanha === undefined || idx.data_inicio === undefined)
    return { ...vazio('Colunas obrigatórias ausentes: ' + [idx.campanha === undefined && 'Campanha', idx.data_inicio === undefined && 'Data (Dia ou Início dos relatórios)'].filter(Boolean).join(' e ') + '.'), colunas };
  const ausentes = (Object.keys(ALIASES) as CampoMeta[]).filter(c => idx[c] === undefined);
  const validas: LinhaMeta[] = []; const erros: ErroMeta[] = []; const vistas = new Set<string>(); let duplicadas = 0;
  const get = (row: string[], c: CampoMeta) => (idx[c] === undefined ? '' : (row[idx[c]!] ?? '')).trim();
  for (let n = 1; n < linhas.length; n++) {
    const row = linhas[n]; const linha = n + 1; const motivos: string[] = [];
    const campanha = get(row, 'campanha');
    if (!campanha) motivos.push('campanha vazia');
    const di = parseData(get(row, 'data_inicio'));
    if (!di) motivos.push('data inválida');
    const dfTxt = get(row, 'data_fim'); const df = dfTxt ? parseData(dfTxt) : di;
    if (dfTxt && !df) motivos.push('data final inválida');
    if (di && df && df < di) motivos.push('data final antes da inicial');
    const nums: Record<string, number | null> = {};
    for (const c of ['investimento', 'impressoes', 'alcance', 'cliques', 'leads_meta'] as const) {
      const v = parseNumero(get(row, c));
      if (v !== null && Number.isNaN(v)) motivos.push(`${ROTULOS_CAMPO[c].toLowerCase()} inválido`);
      else if (v !== null && c !== 'investimento' && !Number.isInteger(v)) motivos.push(`${ROTULOS_CAMPO[c].toLowerCase()} deve ser inteiro`);
      nums[c] = v !== null && Number.isNaN(v) ? null : v === null ? null : c === 'investimento' ? Math.round(v * 100) / 100 : v;
    }
    if (motivos.length) { erros.push({ linha, motivo: motivos.join(', ') }); continue; }
    const base = { campanha: campanha.slice(0, 300), conjunto: get(row, 'conjunto').slice(0, 300), anuncio: get(row, 'anuncio').slice(0, 300), data_inicio: di!, data_fim: df! };
    const chave = chaveMeta(base);
    if (vistas.has(chave)) { duplicadas++; erros.push({ linha, motivo: 'linha duplicada no arquivo (mesma data, campanha, conjunto e anúncio)' }); continue; }
    vistas.add(chave);
    validas.push({ linha, chave, ...base, investimento: nums.investimento, impressoes: nums.impressoes, alcance: nums.alcance, cliques: nums.cliques, leads_meta: nums.leads_meta });
  }
  const somar = (c: 'investimento' | 'impressoes' | 'cliques' | 'leads_meta') => validas.reduce((s, l) => s + (l[c] ?? 0), 0);
  const periodo = validas.length ? { inicio: validas.reduce((m, l) => l.data_inicio < m ? l.data_inicio : m, validas[0].data_inicio), fim: validas.reduce((m, l) => l.data_fim > m ? l.data_fim : m, validas[0].data_fim) } : null;
  return { erroGeral: validas.length ? null : 'Nenhuma linha válida para importar.', colunas, ausentes, validas, erros, duplicadas, total: linhas.length - 1, periodo,
    somas: { investimento: Math.round(somar('investimento') * 100) / 100, impressoes: somar('impressoes'), cliques: somar('cliques'), leads_meta: somar('leads_meta') } };
}

export async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto.replace(/\r\n/g, '\n').trim()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

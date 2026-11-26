import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import {
  CATALOGO,
  assinaturaFrete,
  calcularPedido,
  itemDeProduto,
  normalizarRemessaPrincipal,
  novoPedido,
  volumesRemessaPrincipal,
  type ItemPedido,
  type Pedido,
} from './mimo-pedido';

const sql = readFileSync('docs/migracoes-preparadas/mimo-tira-brindes-envio-separado.sql', 'utf8');
const sqlOriginal = readFileSync('drizzle/migrations/0014_mimo_tira_pedido.sql', 'utf8');
const produto = CATALOGO.find(p => p.codigo === 'M001');
if (!produto) throw new Error('Produto sintético obrigatório ausente.');
const externo: ItemPedido = {
  id: 'ext', codigo: '', nome: 'Brinde externo sintético', unidade: 'Unidade', tipo: 'outro', quantidade: 3,
  precoOriginal: 0, precoNegociado: 0, desconto: { modo: 'percentual', valor: 0 }, brinde: true,
  custoInterno: null, pesoG: null,
};

describe('SQL de envio separado em banco isolado', () => {
  it('executa limpeza, totais e prontidão sem acessar o banco real', async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE public.mimo_leads(id uuid PRIMARY KEY,empresa_id uuid);`);
      await db.exec(sql);
      expect((await db.query<{ ok: boolean }>('SELECT public.mimo_tira_envio_separado($1::jsonb) ok', [JSON.stringify(externo)])).rows[0]?.ok).toBe(true);
      const proprio = { ...itemDeProduto(produto, 2, true), envioSeparado: true };
      expect((await db.query<{ ok: boolean }>('SELECT public.mimo_tira_envio_separado($1::jsonb) ok', [JSON.stringify(proprio)])).rows[0]?.ok).toBe(false);

      const soExterno: Pedido = {
        ...novoPedido(), leadId: '00000000-0000-4000-8000-000000000001', destinoCep: '01001000',
        endereco: 'Endereço sintético', itens: [externo], status: 'confirmado',
      };
      expect((await db.query<{ ok: boolean }>('SELECT public.mimo_tira_pronto($1::jsonb) ok', [JSON.stringify(soExterno)])).rows[0]?.ok).toBe(true);
      expect((await db.query<{ total: number; frete: number }>('SELECT (public.mimo_tira_totais($1::jsonb)->>\'total\')::int total,(public.mimo_tira_totais($1::jsonb)->>\'frete\')::int frete', [JSON.stringify(soExterno)])).rows[0]).toEqual({ total: 0, frete: 0 });

      const comum = itemDeProduto(produto, 2);
      const antigo: Pedido = {
        ...soExterno, itens: [comum, externo], fretePagador: 'cliente', declarado: 10000, declaradoProvisorio: false,
        volumes: [
          { id: 'misto', caixa: 'P', conteudo: [{ itemId: comum.id, quantidade: 2 }, { itemId: externo.id, quantidade: 3 }], pesoAjustadoG: 9000, confirmado: true },
          { id: 'so-externo', caixa: 'G', conteudo: [{ itemId: externo.id, quantidade: 3 }], pesoAjustadoG: null, confirmado: false },
        ],
      };
      const esperado = volumesRemessaPrincipal(antigo.itens, antigo.volumes);
      const limpoSql = (await db.query<{ volumes: unknown }>('SELECT public.mimo_tira_volumes_principais($1::jsonb) volumes', [JSON.stringify(antigo)])).rows[0]?.volumes;
      expect(limpoSql).toEqual(esperado);
      expect((await db.query<{ ok: boolean }>('SELECT public.mimo_tira_pronto($1::jsonb) ok', [JSON.stringify(antigo)])).rows[0]?.ok).toBe(false);

      const limpo = normalizarRemessaPrincipal(antigo);
      const base: Pedido = { ...limpo, volumes: limpo.volumes.map(v => ({ ...v, confirmado: true })) };
      const pronto: Pedido = {
        ...base, cotacoes: [{ id: 'c', modalidade: 'Manual', prazo: '3 dias', modo: 'remessa', valor: 1500, valoresVolumes: {}, assinatura: assinaturaFrete(base), registradaEm: '2026-11-26T12:00:00.000Z', oficial: true }], cotacaoId: 'c',
      };
      expect((await db.query<{ ok: boolean }>('SELECT public.mimo_tira_pronto($1::jsonb) ok', [JSON.stringify(pronto)])).rows[0]?.ok).toBe(true);
      const totais = calcularPedido(pronto);
      expect((await db.query<{ total: number; produtos: number; frete: number }>('SELECT (public.mimo_tira_totais($1::jsonb)->>\'total\')::int total,(public.mimo_tira_totais($1::jsonb)->>\'produtos\')::int produtos,(public.mimo_tira_totais($1::jsonb)->>\'frete\')::int frete', [JSON.stringify(pronto)])).rows[0]).toEqual({ total: totais.total, produtos: totais.produtos, frete: totais.frete });

      const proprioSemCaixa: Pedido = { ...soExterno, itens: [proprio] };
      expect((await db.query<{ ok: boolean }>('SELECT public.mimo_tira_pronto($1::jsonb) ok', [JSON.stringify(proprioSemCaixa)])).rows[0]?.ok).toBe(false);
    } finally {
      await db.close();
    }
  });
});

function trechoOriginal(inicio: string, fim: string) {
  const a = sqlOriginal.indexOf(inicio);
  const b = sqlOriginal.indexOf(fim, a);
  if (a < 0 || b < 0) throw new Error('Definição original não encontrada.');
  return sqlOriginal.slice(a, b);
}

const empresaTeste = '00000000-0000-4000-8000-000000000010';
const leadTeste = '00000000-0000-4000-8000-000000000011';

async function prepararGuardOriginal(db: PGlite) {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.mimo_leads(id uuid PRIMARY KEY,empresa_id uuid);
    CREATE TABLE public.mimo_tira_pedidos(
      id uuid PRIMARY KEY,empresa_id uuid NOT NULL,lead_id uuid NOT NULL,
      numero bigint GENERATED ALWAYS AS IDENTITY,versao integer NOT NULL DEFAULT 1,
      documento jsonb NOT NULL,pix jsonb,recebimentos jsonb NOT NULL DEFAULT '[]',
      total bigint NOT NULL,produtos bigint NOT NULL,frete bigint NOT NULL,
      status text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    INSERT INTO public.mimo_leads VALUES ('${leadTeste}','${empresaTeste}');`);
  await db.exec([
    trechoOriginal('CREATE FUNCTION public.mimo_tira_assinatura_ok', '-- Elegibilidade operacional independente:'),
    trechoOriginal('-- Elegibilidade operacional independente:', 'CREATE INDEX tira_pedidos_empresa_data'),
    trechoOriginal('CREATE FUNCTION public.mimo_tira_transicao_ok', 'CREATE FUNCTION public.mimo_tira_imutavel()'),
  ].join('\n'));
}

function pedidoComFrete(itens: ItemPedido[]): Pedido {
  const base: Pedido = {
    ...novoPedido(), leadId: leadTeste, destinoCep: '01001000', endereco: 'Endereço sintético',
    itens, volumes: [{ id: 'v1', caixa: 'P', conteudo: [{ itemId: itens[0]!.id, quantidade: itens[0]!.quantidade }], pesoAjustadoG: null, confirmado: true }],
    fretePagador: 'cliente', declarado: 10000, declaradoProvisorio: false,
  };
  return {
    ...base,
    cotacoes: [{ id: 'c', modalidade: 'Manual', prazo: '3 dias', modo: 'remessa', valor: 1500, valoresVolumes: {}, assinatura: assinaturaFrete(base), registradaEm: '2026-11-26T12:00:00.000Z', oficial: true }],
    cotacaoId: 'c',
  };
}

async function inserirSintetico(db: PGlite, documento: Pedido) {
  const id = crypto.randomUUID();
  const t = calcularPedido(documento);
  await db.query(
    `INSERT INTO public.mimo_tira_pedidos(id,empresa_id,lead_id,documento,total,produtos,frete,status)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
    [id, empresaTeste, leadTeste, JSON.stringify(documento), t.total, t.produtos, t.frete, documento.status],
  );
  return id;
}

async function confirmarSintetico(db: PGlite, id: string, documento: Pedido) {
  const confirmado = { ...documento, status: 'confirmado' as const };
  await db.query('UPDATE public.mimo_tira_pedidos SET documento=$2::jsonb,status=$3,versao=versao+1 WHERE id=$1', [id, JSON.stringify(confirmado), confirmado.status]);
}

describe('divergência da validação publicada e correção preparada', () => {
  it('reproduz o erro antigo e salva/confirma com e sem envio separado após a migração', async () => {
    const db = new PGlite();
    try {
      await prepararGuardOriginal(db);
      const comum = itemDeProduto(produto, 2);
      const semBrinde = pedidoComFrete([comum]);
      expect(calcularPedido(semBrinde)).toMatchObject({ produtos: 11340, frete: 1500, total: 12840 });
      expect((await db.query<{ total: number; produtos: number; frete: number }>('SELECT (public.mimo_tira_totais($1::jsonb)->>\'total\')::int total,(public.mimo_tira_totais($1::jsonb)->>\'produtos\')::int produtos,(public.mimo_tira_totais($1::jsonb)->>\'frete\')::int frete', [JSON.stringify(semBrinde)])).rows[0]).toEqual({ total: 12840, produtos: 11340, frete: 1500 });
      const semBrindeId = await inserirSintetico(db, semBrinde);
      await confirmarSintetico(db, semBrindeId, semBrinde);

      const misto = pedidoComFrete([itemDeProduto(produto, 2), externo]);
      expect(calcularPedido(misto)).toMatchObject({ produtos: 11340, frete: 1500, total: 12840 });
      expect((await db.query<{ total: number; produtos: number; frete: number }>('SELECT (public.mimo_tira_totais($1::jsonb)->>\'total\')::int total,(public.mimo_tira_totais($1::jsonb)->>\'produtos\')::int produtos,(public.mimo_tira_totais($1::jsonb)->>\'frete\')::int frete', [JSON.stringify(misto)])).rows[0]).toEqual({ total: 11340, produtos: 11340, frete: 0 });
      await expect(inserirSintetico(db, misto)).rejects.toThrow('totais financeiros inconsistentes');

      const somenteSeparado: Pedido = { ...novoPedido(), leadId: leadTeste, destinoCep: '01001000', endereco: 'Endereço sintético', itens: [externo] };
      const separadoId = await inserirSintetico(db, somenteSeparado);
      await expect(confirmarSintetico(db, separadoId, somenteSeparado)).rejects.toThrow('pedido incompleto ou cotação desatualizada');

      await db.exec(sql);
      const mistoId = await inserirSintetico(db, misto);
      await confirmarSintetico(db, mistoId, misto);
      await confirmarSintetico(db, separadoId, somenteSeparado);
      const semBrindeNovoId = await inserirSintetico(db, semBrinde);
      await confirmarSintetico(db, semBrindeNovoId, semBrinde);
      expect((await db.query<{ status: string }>('SELECT status FROM public.mimo_tira_pedidos WHERE id=$1', [mistoId])).rows[0]?.status).toBe('confirmado');
      expect((await db.query<{ status: string }>('SELECT status FROM public.mimo_tira_pedidos WHERE id=$1', [separadoId])).rows[0]?.status).toBe('confirmado');
    } finally {
      await db.close();
    }
  });
});

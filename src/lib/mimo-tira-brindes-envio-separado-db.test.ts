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

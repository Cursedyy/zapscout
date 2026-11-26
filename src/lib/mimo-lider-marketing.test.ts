import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGINAS_POR_PAPEL, PAPEIS_MIMO, ROTULO_PAPEL, ehMarketing, podeImportarMeta, vePainelGeral } from './mimo-acesso';
import { podeGerenciarCampanhas } from './mimo-campanhas';

describe('cargo Líder de marketing', () => {
  it('existe com rótulo próprio, sem alterar os cargos atuais', () => {
    expect(PAPEIS_MIMO).toEqual(['administrador', 'gestor', 'vendedor', 'marketing', 'lider_marketing', 'administrativo']);
    expect(ROTULO_PAPEL.lider_marketing).toBe('Líder de marketing');
  });
  it('vê exatamente as mesmas páginas que Marketing', () => {
    expect([...PAGINAS_POR_PAPEL.lider_marketing].sort()).toEqual([...PAGINAS_POR_PAPEL.marketing].sort());
  });
  it('não abre pedidos, faturamento, OMIE, equipe, agente nem leads', () => {
    for (const p of ['/mimo/tira-pedido', '/mimo/pedidos', '/mimo/rastreamento', '/mimo/omie', '/mimo/equipe', '/mimo/agente', '/mimo/leads', '/mimo/carteira', '/mimo/automacoes'])
      expect(PAGINAS_POR_PAPEL.lider_marketing).not.toContain(p);
  });
  it('tem as capacidades de marketing: painel, Meta Ads e campanhas', () => {
    expect(ehMarketing('lider_marketing')).toBe(true);
    expect(vePainelGeral('lider_marketing')).toBe(true);
    expect(podeImportarMeta('lider_marketing')).toBe(true);
    expect(podeGerenciarCampanhas('lider_marketing')).toBe(true);
  });
  it('SQL preparado inclui o cargo em todas as regras de marketing do banco, sem aplicá-lo', () => {
    const sql = readFileSync('docs/migracoes-preparadas/mimo-lider-marketing-2-permissoes.sql', 'utf8');
    expect(sql.match(/'marketing'::empresa_papel, 'lider_marketing'::empresa_papel/g)?.length).toBe(12);
    expect(sql).toContain("IN ('marketing','lider_marketing','administrativo')");
    expect(sql.startsWith('-- PREPARADO, NÃO APLICADO')).toBe(true);
  });
});

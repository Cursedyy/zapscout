import { describe, expect, it } from 'vitest';
import {
  adicionarDiaBoleto, assinaturaFrete, calcularPedido, CATALOGO, diaBoletoSchema, diasBoletoSchema, dinheiro, faturamentoSchema,
  itemDeProduto, lerDiaBoleto, novoFaturamento, novoPedido, pagamentoSchema, pedidoSchema, PRAZOS_BOLETO, removerDiaBoleto,
  vencimentosBoleto, type Faturamento, type Pedido,
} from '@/lib/mimo-pedido';
import { CAIXAS_PADRAO, compararVersoes, documentoPorPapel, prepararCaixas, prepararDocumento, snapshotCliente } from '@/lib/mimo-tira-regras';
import { gerarPdfProposta, linhasProposta, mensagemWhatsApp } from '@/lib/mimo-proposta';
import { rascunhoSchema } from '@/lib/mimo-rascunho';

const LEAD = '00000000-0000-4000-8000-000000000001';
const TAXAS = [313, 368, 368, 368, 368, 368, 589, 589, 589, 589, 589, 589];
const produto = CATALOGO.find(p => p.codigo === 'M001');
if (!produto) throw new Error('Produto de teste ausente.');
// Somente dados fictícios: nenhum cliente real.
const FATURAMENTO: Faturamento = {
  razaoSocial: 'Empresa Fictícia de Testes Ltda', cnpj: '00.000.000/0000-00', inscricaoEstadual: 'ISENTO',
  email: 'financeiro@exemplo.invalid', telefone: '(00) 0000-0000',
};
const vazio = (): Faturamento => ({ razaoSocial: '', cnpj: '', inscricaoEstadual: '', email: '', telefone: '' });

function boleto(diasBoleto: string[]): Pedido {
  return { ...novoPedido(), leadId: LEAD, itens: [itemDeProduto(produto!, 2)], pagamento: { ...novoPedido().pagamento, forma: 'boleto', diasBoleto } };
}
/** Documento gravado antes desta mudança: sem faturamento e com prazos do conjunto antigo. */
function documentoAntigo(diasBoleto: string[]): Record<string, unknown> {
  const antigo = JSON.parse(JSON.stringify(boleto(diasBoleto))) as Record<string, unknown>;
  delete antigo.faturamento;
  return antigo;
}

describe('boleto com prazos livres', () => {
  it.each(['1', '9', '14', '30', '40', '45', '60', '99', '100', '179', '180'])('aceita %s dias', d => {
    expect(diaBoletoSchema.safeParse(d).success).toBe(true);
  });
  it.each(['0', '181', '030', '007', '00', '', '1.5', '-1', ' 30', '30 ', '1000', 'abc'])('recusa "%s"', d => {
    expect(diaBoletoSchema.safeParse(d).success).toBe(false);
  });
  it('recusa número em vez de texto', () => expect(diaBoletoSchema.safeParse(30).success).toBe(false));

  it.each([[['30', '45']], [['30', '60']], [['28', '35', '40']], [['30']]])('aceita condições das planilhas: %j', dias => {
    expect(pagamentoSchema.parse({ ...novoPedido().pagamento, forma: 'boleto', diasBoleto: dias }).diasBoleto).toEqual(dias);
  });
  it('aceita de 1 a 6 vencimentos e recusa lista vazia ou com 7', () => {
    expect(diasBoletoSchema.parse(['15', '30', '45', '60', '75', '90'])).toHaveLength(6);
    expect(diasBoletoSchema.safeParse([]).success).toBe(false);
    expect(diasBoletoSchema.safeParse(['15', '30', '45', '60', '75', '90', '105']).success).toBe(false);
  });
  it('recusa vencimentos repetidos', () => {
    const r = pedidoSchema.safeParse(boleto(['30', '30']));
    expect(r.success).toBe(false);
    expect(r.error?.issues.map(i => i.message)).toContain('Vencimentos repetidos.');
    expect(diasBoletoSchema.safeParse(['14', '30', '14']).success).toBe(false);
  });
  it.each(['0', '181', '030'])('recusa o prazo "%s" no pedido', d => {
    expect(pedidoSchema.safeParse(boleto(['14', d])).success).toBe(false);
  });
  it('guarda os vencimentos em ordem crescente de dias', () => {
    expect(pedidoSchema.parse(boleto(['60', '30', '45'])).pagamento.diasBoleto).toEqual(['30', '45', '60']);
    expect(diasBoletoSchema.parse(['100', '9', '45'])).toEqual(['9', '45', '100']);
  });
  it('documentos antigos com 14/21/28/35/42 dias continuam válidos', () => {
    for (const d of PRAZOS_BOLETO) expect(pedidoSchema.parse(documentoAntigo([String(d)])).pagamento.diasBoleto).toEqual([String(d)]);
    expect(pedidoSchema.parse(documentoAntigo(['14', '21', '28', '35', '42'])).pagamento.diasBoleto).toEqual(['14', '21', '28', '35', '42']);
  });
  it('calcula vencimentos e valores para qualquer prazo', () => {
    expect(vencimentosBoleto(1000, ['30', '45'], '2026-01-01')).toEqual([
      { dias: 30, valor: 500, vencimento: '2026-01-31' }, { dias: 45, valor: 500, vencimento: '2026-02-15' },
    ]);
    expect(vencimentosBoleto(1001, ['28', '35', '40'], null)).toEqual([
      { dias: 28, valor: 334, vencimento: null }, { dias: 35, valor: 334, vencimento: null }, { dias: 40, valor: 333, vencimento: null },
    ]);
    expect(vencimentosBoleto(100, ['180'], '2026-01-01')).toEqual([{ dias: 180, valor: 100, vencimento: '2026-06-30' }]);
  });
  it.each(['0', '181', '030'])('recusa o prazo "%s" ao calcular vencimentos', d => {
    expect(() => vencimentosBoleto(1000, [d], null)).toThrow('Prazo de boleto inválido.');
  });
  it('divide o total em até 6 parcelas de boleto sem perder centavos', () => {
    const r = calcularPedido(boleto(['15', '30', '45', '60', '75', '90']));
    expect(r.parcelas).toHaveLength(6);
    expect(r.parcelas.reduce((a, b) => a + b, 0)).toBe(r.total);
  });
});

describe('auxiliares do editor de prazos do boleto', () => {
  it('normaliza o prazo digitado', () => {
    expect(lerDiaBoleto('30')).toBe('30');
    expect(lerDiaBoleto('030')).toBe('30');
    expect(lerDiaBoleto(' 7 ')).toBe('7');
    expect(lerDiaBoleto('180')).toBe('180');
  });
  it.each(['0', '181', '', 'abc', '1.5', '-3', '1000', '1e2'])('recusa o prazo digitado "%s"', t => {
    expect(() => lerDiaBoleto(t)).toThrow(/1 a 180/);
  });
  it('adiciona em ordem, sem repetir e até 6 vencimentos', () => {
    expect(adicionarDiaBoleto(['14'], '30')).toEqual(['14', '30']);
    expect(adicionarDiaBoleto(['45'], '30')).toEqual(['30', '45']);
    expect(() => adicionarDiaBoleto(['30'], '030')).toThrow('O vencimento de 30 dias já está na lista.');
    expect(() => adicionarDiaBoleto(['15', '30', '45', '60', '75', '90'], '120')).toThrow('O boleto aceita até 6 vencimentos.');
    expect(() => adicionarDiaBoleto(['14'], '0')).toThrow(/1 a 180/);
  });
  it('remove sem deixar a lista vazia', () => {
    expect(removerDiaBoleto(['14', '30'], '14')).toEqual(['30']);
    expect(() => removerDiaBoleto(['30'], '30')).toThrow('Mantenha ao menos um vencimento do boleto.');
  });
  it('o resultado dos auxiliares sempre passa no esquema', () => {
    let dias = ['14'];
    for (const t of ['60', '030', '1', '180', '45']) dias = adicionarDiaBoleto(dias, t);
    dias = removerDiaBoleto(dias, '14');
    expect(dias).toEqual(['1', '30', '45', '60', '180']);
    expect(diasBoletoSchema.parse(dias)).toEqual(dias);
  });
});

describe('dados para faturamento', () => {
  it('novo pedido nasce com todos os campos vazios e sobrevive à validação', () => {
    expect(novoPedido().faturamento).toEqual(vazio());
    expect(novoFaturamento()).toEqual(vazio());
    expect(pedidoSchema.parse(novoPedido())).toEqual(novoPedido());
  });
  it('documentos antigos sem faturamento recebem o padrão vazio', () => {
    const [a, b] = [pedidoSchema.parse(documentoAntigo(['14'])), pedidoSchema.parse(documentoAntigo(['14']))];
    expect(a.faturamento).toEqual(vazio());
    expect(a.faturamento).not.toBe(b.faturamento);
  });
  it('rascunhos antigos sem faturamento também recebem o padrão vazio', () => {
    expect(rascunhoSchema.shape.documento.parse(documentoAntigo(['21'])).faturamento).toEqual(vazio());
  });
  it('completa campos ausentes e remove espaços nas pontas', () => {
    expect(faturamentoSchema.parse({ razaoSocial: 'Empresa Fictícia' })).toEqual({ ...vazio(), razaoSocial: 'Empresa Fictícia' });
    expect(faturamentoSchema.parse({
      razaoSocial: '  Empresa Fictícia de Testes Ltda ', cnpj: ' 00.000.000/0000-00 ', inscricaoEstadual: '\tISENTO ',
      email: ' financeiro@exemplo.invalid', telefone: '(00) 0000-0000  ',
    })).toEqual(FATURAMENTO);
  });
  it.each(['00000000000000', '000.000.000-00', '00.000.000/0000-00'])('aceita CNPJ ou CPF em texto livre: %s', cnpj => {
    expect(faturamentoSchema.parse({ cnpj }).cnpj).toBe(cnpj);
  });
  it.each([['razaoSocial', 200], ['cnpj', 30], ['inscricaoEstadual', 40], ['email', 254], ['telefone', 40]] as const)('limita %s a %i caracteres', (campo, max) => {
    expect(faturamentoSchema.safeParse({ [campo]: 'x'.repeat(max) }).success).toBe(true);
    expect(faturamentoSchema.safeParse({ [campo]: 'x'.repeat(max + 1) }).success).toBe(false);
    expect(faturamentoSchema.safeParse({ [campo]: ` ${'x'.repeat(max)} ` }).success).toBe(true);
  });
  it('recusa valores que não são texto', () => {
    expect(faturamentoSchema.safeParse({ cnpj: 12345678000100 }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...novoPedido(), faturamento: null }).success).toBe(false);
  });
  it('não invalida a cotação de frete', () => {
    const p = boleto(['14']);
    const q = { ...p, faturamento: FATURAMENTO, pagamento: { ...p.pagamento, diasBoleto: ['30', '45'] } };
    expect(assinaturaFrete(q)).toBe(assinaturaFrete(p));
    expect(assinaturaFrete(p)).not.toContain('Empresa Fictícia');
  });
});

describe('faturamento no servidor, por papel e no histórico', () => {
  it('o caminho de gravação preserva os dados já sem espaços', () => {
    const entrada = pedidoSchema.parse({ ...boleto(['45', '30']), faturamento: { ...FATURAMENTO, razaoSocial: ` ${FATURAMENTO.razaoSocial} ` } });
    const canonico = prepararDocumento(entrada, 'vendedor', CATALOGO, [], TAXAS, null);
    const documento = { ...prepararCaixas(canonico, CAIXAS_PADRAO, null), cliente: 'Cliente fictício', responsavelId: null };
    expect(documento.faturamento).toEqual(FATURAMENTO);
    expect(documento.pagamento.diasBoleto).toEqual(['30', '45']);
    const lido = pedidoSchema.parse(JSON.parse(JSON.stringify(documento)));
    expect(lido.faturamento).toEqual(FATURAMENTO);
    const editado = prepararDocumento({ ...lido, faturamento: { ...FATURAMENTO, email: 'notas@exemplo.invalid' } }, 'vendedor', CATALOGO, [], TAXAS, lido);
    expect(editado.faturamento.email).toBe('notas@exemplo.invalid');
  });
  it.each(['administrador', 'gestor', 'administrativo', 'vendedor'])('%s lê os dados como os demais dados do cliente', papel => {
    expect(documentoPorPapel({ ...boleto(['30']), faturamento: FATURAMENTO }, papel).faturamento).toEqual(FATURAMENTO);
  });
  it('a proposta emitida guarda os dados para faturamento', () => {
    const s = snapshotCliente({ ...boleto(['30']), responsavelId: '00000000-0000-4000-8000-000000000002', faturamento: FATURAMENTO });
    expect(s.faturamento).toEqual(FATURAMENTO);
    expect(s.responsavelId).toBeNull();
  });
  it('a comparação de versões mostra prazos e dados para faturamento', () => {
    const a = boleto(['14']);
    const b = { ...a, pagamento: { ...a.pagamento, diasBoleto: ['30', '45'] }, faturamento: { ...vazio(), razaoSocial: 'Empresa Fictícia', cnpj: '00000000000000' } };
    const d = compararVersoes(a, b);
    expect(d).toContainEqual({ campo: 'Vencimentos boleto', antes: '14', depois: '30, 45' });
    expect(d).toContainEqual({ campo: 'Razão social', antes: '—', depois: 'Empresa Fictícia' });
    expect(d).toContainEqual({ campo: 'CNPJ ou CPF', antes: '—', depois: '00000000000000' });
    expect(d.map(x => x.campo)).not.toContain('E-mail de faturamento');
    expect(compararVersoes(b, { ...b, faturamento: { ...b.faturamento, telefone: '(00) 0000-0000' } })).toEqual([
      { campo: 'Telefone de faturamento', antes: '—', depois: '(00) 0000-0000' },
    ]);
    expect(compararVersoes(b, structuredClone(b))).toEqual([]);
  });
});

describe('proposta com prazos livres e dados para faturamento', () => {
  const dados = (pedido: Pedido) => ({ numero: '7', versao: 1, cliente: 'Loja Fictícia', pedido });
  it('lista os prazos livres do boleto', () => {
    expect(linhasProposta(dados(boleto(['30', '45'])))).toContain(`Pagamento: Boleto: 30 dias ${dinheiro(5670)}, 45 dias ${dinheiro(5670)}`);
    expect(linhasProposta(dados(boleto(['1', '30'])))).toContain(`Pagamento: Boleto: 1 dia ${dinheiro(5670)}, 30 dias ${dinheiro(5670)}`);
  });
  it('mostra os dados preenchidos logo abaixo do cliente', () => {
    const linhas = linhasProposta(dados({ ...boleto(['30']), faturamento: FATURAMENTO }));
    expect(linhas.slice(1, 8)).toEqual([
      'Cliente: Loja Fictícia', 'Razão social: Empresa Fictícia de Testes Ltda', 'CNPJ ou CPF: 00.000.000/0000-00',
      'Inscrição estadual: ISENTO', 'E-mail de faturamento: financeiro@exemplo.invalid', 'Telefone de faturamento: (00) 0000-0000', '',
    ]);
    expect(mensagemWhatsApp(dados({ ...boleto(['30']), faturamento: { ...vazio(), cnpj: '00000000000000' } }))).toContain('Cliente: Loja Fictícia\nCNPJ ou CPF: 00000000000000\n\n');
  });
  it('omite os dados vazios', () => {
    const linhas = linhasProposta(dados(boleto(['30'])));
    expect(linhas[2]).toBe('');
    expect(linhas.join('\n')).not.toMatch(/Razão social|CNPJ|Inscrição estadual|faturamento:/);
  });
  it('o PDF inclui os dados para faturamento no bloco do cliente', async () => {
    const pdf = await gerarPdfProposta(dados({ ...boleto(['30', '45']), faturamento: FATURAMENTO }));
    const texto = await pdf.text();
    expect(texto).toContain('00.000.000/0000-00');
    expect(texto).toContain('financeiro@exemplo.invalid');
    const semDados = await (await gerarPdfProposta(dados(boleto(['30'])))).text();
    expect(semDados).not.toContain('financeiro@exemplo.invalid');
  });
});

/** Tradução segura de recusas do banco do Tira Pedido em mensagens acionáveis (sem SQL nem dados de clientes). */
export type ErroBanco = { code?: string | null; message?: string | null } | null | undefined;
const MAPA: [RegExp, string][] = [
  [/^conflito$/, 'O pedido foi alterado por outra pessoa. Reabra o pedido para ver a versão atual antes de salvar.'],
  [/^acesso negado$/, 'Seu acesso não permite salvar este pedido (cliente de outro responsável, cargo sem permissão ou acesso inativo).'],
  [/^edição bloqueada$|^pedido encerrado$|valores comerciais bloqueados/, 'Este pedido não pode mais ser editado no estado atual (faturado, enviado, entregue ou cancelado).'],
  [/^estado exige ação própria$/, 'Esse estado não é definido ao salvar. Salve o pedido e use as ações de status.'],
  [/^taxa divergente$|^taxa inválida$/, 'A taxa do cartão mudou nas configurações. Aba Pagamento: escolha de novo as parcelas e salve.'],
  [/^totais financeiros inconsistentes$|^total inválido$/, 'Os totais não conferem com os itens. Revise itens, descontos e frete e salve de novo.'],
  [/^item inválido$/, 'Há item com quantidade ou preço inválido. Aba Itens: confira quantidades e preços.'],
  [/^desconto inválido$|^desconto geral inválido$/, 'Há desconto maior que o valor do item ou do pedido. Aba Itens: reduza o desconto.'],
  [/^frete incompleto$|^frete inválido$|cotação desatualizada/, 'Caixas ou cotação de frete desatualizadas. Aba Logística: confira caixas, pesos e origem e registre uma nova cotação.'],
  [/^responsabilidade do frete obrigatória$/, 'Aba Logística: defina quem paga o frete.'],
  [/^PIX não confirmado$/, 'Confirme o recebimento PIX antes de faturar ou enviar.'],
  [/^faturamento obrigatório$/, 'Informe a data de faturamento.'],
  [/^transição não permitida$/, 'Essa mudança de estado não é permitida a partir do estado atual.'],
  [/^motivo obrigatório$/, 'Informe o motivo do cancelamento (mínimo de 5 caracteres).'],
  [/^cliente de outra empresa$|^documento inconsistente$|^identidade imutável$/, 'Os dados do cliente do pedido não conferem. Reabra o pedido e selecione o cliente de novo.'],
  [/^total inferior aos recebimentos$|^recebimento inválido$/, 'O total ficou menor que os valores já recebidos. Revise os itens ou os recebimentos.'],
];
export function referenciaErro() { return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); }
/**
 * Devolve a mensagem para o usuário. Recusas de pedido incompleto listam as pendências verificáveis.
 * Erros sem mapeamento geram referência registrada com código/mensagem do banco (sem documento nem dados pessoais).
 */
export function mensagemErroTira(erro: ErroBanco, acao: 'salvar' | 'alterar o estado', pendencias: string[] = [], registrar: (d: Record<string, string>) => void = d => console.error('[mimo-tira]', JSON.stringify(d))) {
  const msg = (erro?.message ?? '').trim();
  if (/cotação desatualizada|^frete incompleto$/.test(msg) && pendencias.length) return `Não foi possível ${acao}. Pendências: ${pendencias.join(' • ')}`;
  if (erro?.code === '40001') return MAPA[0]![1];
  for (const [re, texto] of MAPA) if (re.test(msg)) return texto;
  const ref = referenciaErro();
  registrar({ ref, acao, code: String(erro?.code ?? ''), mensagem: msg.slice(0, 200) });
  return `Erro inesperado ao ${acao} o pedido. Seu rascunho foi mantido. Informe a referência ${ref} ao suporte interno.`;
}

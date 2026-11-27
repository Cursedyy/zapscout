// Famílias com caixa e unidade cadastradas na Base Cadastral do Omie.
const unidadesPorCaixa: Record<string, number> = {
  "001": 60,
  "002": 60,
  "003": 60,
  "004": 12,
  "005": 12,
  "006": 12,
  "007": 12,
  "008": 12,
  "009": 12,
  "014": 12,
  "015": 12,
  "016": 12,
  "017": 32,
  "018": 32,
  "019": 32,
  "020": 50,
  "021": 50,
  "022": 50,
  "023": 50,
  "030": 12,
  "031": 12,
  "032": 12,
  "033": 12,
};

export function codigosPorEmbalagemMimo(codigo: string) {
  const familia = /^(?:M|DP|UN)(\d{3})$/.exec(codigo)?.[1];
  if (!familia || !Object.hasOwn(unidadesPorCaixa, familia)) return null;
  return {
    caixa: `M${familia}`,
    unidadesCaixa: unidadesPorCaixa[familia],
    display: Number(familia) <= 3 ? `DP${familia}` : null,
    unidade: `UN${familia}`,
  };
}

export function codigoVendaMimo({ codigo, unidade }: { codigo: string; unidade: string }) {
  const embalagens = codigosPorEmbalagemMimo(codigo);
  if (!embalagens) return codigo || null;

  const descricao = unidade.trim();
  if (/^(?:display|dp)\b/i.test(descricao)) return embalagens.display;
  if (/^(?:unidade|un)\b/i.test(descricao)) return embalagens.unidade;
  if (/^(?:caixa|cx)\b/i.test(descricao)) {
    const quantidade = descricao.match(/\d+/)?.[0];
    if (!quantidade || Number(quantidade) === embalagens.unidadesCaixa) return embalagens.caixa;
  }
  return null;
}

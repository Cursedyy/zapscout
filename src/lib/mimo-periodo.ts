/** Datas comerciais de São Paulo compartilhadas pela tela e pelo preload. */
export function periodoInicialMimo(dias: number, agora = Date.now()) {
  const fim = new Date(agora - 3 * 3600000).toISOString().slice(0, 10);
  const inicio = new Date(Date.parse(fim) - (dias - 1) * 86400000).toISOString().slice(0, 10);
  return { inicio, fim, campanha: '', origem: '' as const };
}

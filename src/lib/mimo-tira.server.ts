// Server-only kill switch: writes stay blocked until the reviewed migration is applied
// after a verified backup and the operator explicitly enables persistence.
export function tiraPersistenciaAtiva() { return process.env['MIMO_TIRA_PERSISTENCIA'] === 'ativa'; }
export function exigirAtivacaoTira() { if (!tiraPersistenciaAtiva()) throw new Error('Gravação do Tira-pedido aguardando ativação autorizada.'); }

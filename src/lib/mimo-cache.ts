import type { QueryClient } from '@tanstack/react-query';

/** Preserva dados visíveis e revalida indicadores relacionados após uma gravação. */
export function atualizarConsultasMimo(client: QueryClient) {
  return client.invalidateQueries({ predicate: q => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('mimo-') });
}

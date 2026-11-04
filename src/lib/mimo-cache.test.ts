import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { atualizarConsultasMimo } from './mimo-cache';
describe('cache após gravações MiMo', () => {
  it('revalida todas as telas relacionadas preservando os dados e o CRM pessoal', async () => {
    const qc = new QueryClient();
    for (const key of ['mimo-dashboard', 'mimo-relatorio', 'mimo-perdas', 'mimo-leads', 'mimo-tira-lista', 'crm-pessoal']) qc.setQueryData([key], { total: 10 });
    await atualizarConsultasMimo(qc);
    for (const key of ['mimo-dashboard', 'mimo-relatorio', 'mimo-perdas', 'mimo-leads', 'mimo-tira-lista']) {
      expect(qc.getQueryState([key])?.isInvalidated).toBe(true);
      expect(qc.getQueryData([key])).toEqual({ total: 10 });
    }
    expect(qc.getQueryState(['crm-pessoal'])?.isInvalidated).toBe(false);
    qc.clear();
  });
});

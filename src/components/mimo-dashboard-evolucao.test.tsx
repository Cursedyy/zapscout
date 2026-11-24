// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MimoEvolucaoClientes } from './mimo-evolucao-clientes';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('desenha as três séries e alterna o período com o tooltip sem seleção', async () => {
  const tamanho = new DOMRect(0, 0, 720, 280);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(tamanho);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  const { container } = render(<MimoEvolucaoClientes dias={[
    { periodo: '2026-10-31', atendidos: 4, qualificados: 2, convertidos: 1 },
    { periodo: '2026-11-01', atendidos: 2, qualificados: 1, convertidos: 0 },
    { periodo: '2026-11-02', atendidos: 6, qualificados: 3, convertidos: 2 },
  ]}/>);
  const curvas = () => container.querySelectorAll('path.recharts-area-curve');
  await waitFor(() => expect(curvas()).toHaveLength(3));
  for (const nome of ['Atendidos', 'Qualificados', 'Convertidos']) expect(screen.getByText(nome)).toBeTruthy();
  const semana = curvas()[0].getAttribute('d');
  fireEvent.click(screen.getByRole('button', { name: 'Dia' }));
  await waitFor(() => expect(curvas()[0].getAttribute('d')).not.toBe(semana));
  fireEvent.click(screen.getByRole('button', { name: 'Mês' }));
  expect(screen.getByRole('button', { name: 'Mês' }).getAttribute('aria-pressed')).toBe('true');
  expect(curvas()).toHaveLength(3);
});

// @vitest-environment happy-dom
import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const s = vi.hoisted(() => ({ load: vi.fn(), dados: vi.fn(), router: {} as any, qc: {} }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => s.router }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => s.qc }));
vi.mock('./mimo-preload-dados', () => ({ preloadDadosMimo: s.dados }));
import { useMimoPreload } from './use-mimo-preload';
beforeEach(() => {
  vi.useFakeTimers(); s.load.mockReset().mockResolvedValue(undefined); s.dados.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
  s.router = {
    routesById: { root: { id: 'root' }, '/mimo/leads': { id: '/mimo/leads' }, '/mimo/carteira': { id: '/mimo/carteira' } },
    matchRoutes: (to: string) => [{ routeId: 'root' }, { routeId: to }], loadRouteChunk: s.load,
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('preload MiMo', () => {
  it('aquece todas as telas permitidas sem esperar a consulta lenta de outra tela', async () => {
    s.dados.mockImplementationOnce(() => new Promise(() => {}));
    renderHook(() => useMimoPreload(['/mimo/leads', '/mimo/carteira']));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(s.load.mock.calls.map(([r]) => r.id)).toEqual(['root', '/mimo/leads', '/mimo/carteira']);
    expect(s.dados).toHaveBeenCalledTimes(1);
  });
  it('prioriza o destino apontado e não permite aquecer uma página fora do cargo', async () => {
    const h = renderHook(() => useMimoPreload(['/mimo/leads', '/mimo/carteira']));
    await act(async () => { h.result.current('/mimo/carteira'); h.result.current('/mimo/equipe'); });
    expect(s.dados).toHaveBeenCalledWith('/mimo/carteira', s.qc);
    expect(s.dados).not.toHaveBeenCalledWith('/mimo/equipe', s.qc);
  });
  it('economia de dados impede transferências automáticas', async () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    renderHook(() => useMimoPreload(['/mimo/leads']));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(s.load).not.toHaveBeenCalled(); expect(s.dados).not.toHaveBeenCalled();
  });
  it('sair do painel cancela a fila que ainda não começou', async () => {
    const h = renderHook(() => useMimoPreload(['/mimo/leads'])); h.unmount();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(s.load).not.toHaveBeenCalled();
  });
  it('falha de um módulo permite nova tentativa no destino', async () => {
    s.load.mockRejectedValueOnce(new Error('rede'));
    const h = renderHook(() => useMimoPreload(['/mimo/leads']));
    await act(async () => { h.result.current('/mimo/leads'); });
    await act(async () => { h.result.current('/mimo/leads'); });
    expect(s.dados).toHaveBeenCalledWith('/mimo/leads', s.qc);
  });
});

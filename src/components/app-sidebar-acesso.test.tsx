// @vitest-environment happy-dom
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), retry: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/app/buscar",
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    children,
    ...props
  }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "sintetico", email: "conta@example.com" }, loading: false }),
}));
vi.mock("@/store/app-store", () => ({
  usePlano: () => ({ id: "free", nome: "teste", buscas_mes: 100 }),
  useStore: () => ({ buscasUsadas: 0, leads: [], campanhas: [], followupDias: [1, 2, 3] }),
}));
vi.mock("@/lib/mimo.functions", () => ({ obterAcessoMimo: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/components/whatsapp-status-pill", () => ({ WhatsAppStatusPill: () => null }));
vi.mock("@/components/notification-bell", () => ({ NotificationBell: () => null }));
import { SidebarInner } from "./app-sidebar";
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("erro de consulta mostra explicação e permite tentar novamente sem conceder acesso", () => {
  mocks.query.mockReturnValue({
    data: undefined,
    isError: true,
    isFetching: false,
    refetch: mocks.retry,
  });
  render(<SidebarInner />);
  expect(screen.getByText("Não foi possível verificar o acesso à MiMo.")).toBeDefined();
  expect(screen.queryByRole("link", { name: "Painel MiMo" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(mocks.retry).toHaveBeenCalledTimes(1);
});
it("recusa real continua ocultando a área restrita", () => {
  mocks.query.mockReturnValue({
    data: { autorizado: false },
    isError: false,
    isFetching: false,
    refetch: mocks.retry,
  });
  render(<SidebarInner />);
  expect(screen.queryByRole("link", { name: "Painel MiMo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
});
it("autorização confirmada mantém o link", () => {
  mocks.query.mockReturnValue({
    data: { autorizado: true },
    isError: false,
    isFetching: false,
    refetch: mocks.retry,
  });
  render(<SidebarInner />);
  expect(screen.getByRole("link", { name: "Painel MiMo" }).getAttribute("href")).toBe("/mimo");
});

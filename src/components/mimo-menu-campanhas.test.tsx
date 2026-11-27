// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PapelMimo } from "@/lib/mimo-acesso";
import { Route } from "@/routes/_authenticated/mimo";

const estado = vi.hoisted(() => ({
  caminho: "/mimo/meta-ads",
  papel: "marketing" as PapelMimo,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useRouteContext: () => ({
      mimoAcesso: { autorizado: true, empresa: "MiMo", nome: "Teste", papel: estado.papel },
    }),
  }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  Outlet: () => null,
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: estado.caminho }, isLoading: false }),
}));
vi.mock("@/lib/use-mimo-preload", () => ({
  useMimoPreload: () => Object.assign(vi.fn(), { cancelar: vi.fn() }),
}));
vi.mock("@/lib/mimo.functions", () => ({ obterAcessoMimo: vi.fn() }));
vi.mock("@/components/mimo-feedback-button", () => ({ MimoFeedbackButton: () => null }));
vi.mock("@/components/notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("@/components/mimo-leads-espera", () => ({ MimoLeadsEspera: () => null }));
vi.mock("@/components/mimo-feedback-nav-indicator", () => ({
  MimoFeedbackNavIndicator: () => null,
}));

function renderMenu(papel: PapelMimo, caminho: string) {
  estado.papel = papel;
  estado.caminho = caminho;
  const Layout = Route.options.component!;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Layout />
    </QueryClientProvider>,
  );
  return within(screen.getByRole("navigation", { name: "Navegação MiMo" }));
}

afterEach(cleanup);

it("Marketing abre e fecha o submenu de Campanhas sem perder a página principal", () => {
  const menu = renderMenu("marketing", "/mimo/meta-ads");
  const toggle = menu.getByRole("button", { name: "Submenu de Campanhas" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(menu.getByRole("link", { name: "Campanhas" }).getAttribute("href")).toBe(
    "/mimo/campanhas",
  );
  expect(menu.queryByRole("link", { name: "Campanha de desenhos" })).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const desenhos = menu.getByRole("link", { name: "Campanha de desenhos" });
  expect(desenhos.getAttribute("href")).toBe("/mimo/campanha-desenhos");
  expect(desenhos.closest("ul")?.id).toBe(toggle.getAttribute("aria-controls"));
  fireEvent.click(toggle);
  expect(menu.queryByRole("link", { name: "Campanha de desenhos" })).toBeNull();
});

it("expande o submenu no link direto para a Liderança de marketing", () => {
  const menu = renderMenu("lider_marketing", "/mimo/campanha-desenhos");
  expect(
    menu.getByRole("button", { name: "Submenu de Campanhas" }).getAttribute("aria-expanded"),
  ).toBe("true");
  expect(menu.getByRole("link", { name: "Campanha de desenhos" })).toBeTruthy();
});

it("mantém o catálogo de campanhas do vendedor sem exibir os desenhos", () => {
  const menu = renderMenu("vendedor", "/mimo/campanhas");
  expect(menu.getByRole("link", { name: "Campanhas" })).toBeTruthy();
  expect(menu.queryByRole("button", { name: "Submenu de Campanhas" })).toBeNull();
  expect(menu.queryByRole("link", { name: "Campanha de desenhos" })).toBeNull();
});

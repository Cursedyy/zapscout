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

const grupo = (menu: ReturnType<typeof renderMenu>, nome: string) =>
  menu.getByRole("button", { name: nome });

it("agrupa as páginas por setor e abre o grupo da página atual", () => {
  const menu = renderMenu("administrador", "/mimo/rastreamento");
  expect(menu.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/mimo");
  for (const nome of ["Comercial", "Pedidos e entregas", "Marketing", "Atendimento", "Gestão"])
    expect(grupo(menu, nome)).toBeTruthy();
  expect(grupo(menu, "Pedidos e entregas").getAttribute("aria-expanded")).toBe("true");
  expect(menu.getByRole("link", { name: "Rastreamento" }).getAttribute("href")).toBe(
    "/mimo/rastreamento",
  );
  expect(grupo(menu, "Comercial").getAttribute("aria-expanded")).toBe("false");
  expect(menu.queryByRole("link", { name: "Leads" })).toBeNull();
});

it("abre e fecha o grupo Marketing mantendo Campanhas e Campanha de desenhos juntos", () => {
  const menu = renderMenu("marketing", "/mimo/meta-ads");
  const toggle = grupo(menu, "Marketing");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const desenhos = menu.getByRole("link", { name: "Campanha de desenhos" });
  expect(desenhos.getAttribute("href")).toBe("/mimo/campanha-desenhos");
  expect(desenhos.closest("ul")?.id).toBe(toggle.getAttribute("aria-controls"));
  expect(menu.getByRole("link", { name: "Campanhas" }).getAttribute("href")).toBe(
    "/mimo/campanhas",
  );
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(menu.queryByRole("link", { name: "Campanha de desenhos" })).toBeNull();
  fireEvent.click(toggle);
  expect(menu.getByRole("link", { name: "Campanha de desenhos" })).toBeTruthy();
});

it("expande o grupo no link direto para a Liderança de marketing", () => {
  const menu = renderMenu("lider_marketing", "/mimo/campanha-desenhos");
  expect(grupo(menu, "Marketing").getAttribute("aria-expanded")).toBe("true");
  expect(menu.getByRole("link", { name: "Campanha de desenhos" })).toBeTruthy();
});

it("mantém o catálogo de campanhas do vendedor sem exibir os desenhos", () => {
  const menu = renderMenu("vendedor", "/mimo/campanhas");
  expect(menu.getByRole("link", { name: "Campanhas" })).toBeTruthy();
  expect(menu.queryByRole("link", { name: "Campanha de desenhos" })).toBeNull();
});

it("mostra como link simples o grupo em que o cargo só abre uma página", () => {
  const menu = renderMenu("vendedor", "/mimo/leads");
  expect(menu.queryByRole("button", { name: "Atendimento" })).toBeNull();
  expect(menu.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe("/mimo/whatsapp");
  expect(menu.queryByRole("link", { name: "Agente de atendimento" })).toBeNull();
});

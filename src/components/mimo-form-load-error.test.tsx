// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DefaultErrorComponent } from "../router";
const route = vi.hoisted(() => ({ pathname: "/influenciadores" }));
vi.mock("../routeTree.gen", () => ({ routeTree: {} }));
vi.mock("@tanstack/react-router", async (original) => {
  const actual = await original<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
      select({ location: { pathname: route.pathname } }),
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["/influenciadores", "/influenciadores/"])(
  "oferece saída pública quando o arquivo de %s não carrega",
  (pathname) => {
    route.pathname = pathname;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <DefaultErrorComponent
        error={new Error("Failed to fetch dynamically imported module")}
        reset={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Não foi possível abrir o formulário" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reabrir formulário" }).getAttribute("href")).toBe(
      "/influenciadores?reabrir=1",
    );
    expect(
      screen.getByRole("link", { name: "Abrir link alternativo" }).getAttribute("href"),
    ).toContain("/influenciadores?campanha=mimo");
    expect(screen.queryByText("Voltar ao painel")).toBeNull();
  },
);
it("preserva o tratamento das áreas privadas", () => {
  route.pathname = "/mimo/influenciadores";
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<DefaultErrorComponent error={new Error("Erro privado")} reset={() => {}} />);
  expect(screen.getByText("Não foi possível carregar esta seção.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Abrir link alternativo" })).toBeNull();
});
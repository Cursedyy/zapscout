// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SessionBootstrap } from "./session-bootstrap";
const state = vi.hoisted(() => ({
  pathname: "/influenciadores",
  auth: vi.fn(),
  persistence: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (v: unknown) => unknown }) =>
    select({ location: { pathname: state.pathname } }),
}));
vi.mock("@/lib/auth-logger", () => ({ installAuthListener: state.auth }));
vi.mock("@/lib/session-persistence", () => ({ installSessionPersistence: state.persistence }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
it.each(["/influenciadores", "/influenciadores/", "/representantes"])(
  "mantém %s independente de sessão e armazenamento",
  async (pathname) => {
    state.pathname = pathname;
    const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    render(
      <>
        <SessionBootstrap />
        <form aria-label="Inscrição pública">
          <input name="nome" />
        </form>
      </>,
    );
    await Promise.resolve();
    expect(state.auth).not.toHaveBeenCalled();
    expect(state.persistence).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  },
);
it.each(["/login", "/app", "/mimo/influenciadores"])(
  "mantém inicialização de sessão em %s",
  async (pathname) => {
    state.pathname = pathname;
    render(<SessionBootstrap />);
    await waitFor(() => expect(state.auth).toHaveBeenCalledOnce());
    expect(state.persistence).toHaveBeenCalledOnce();
  },
);
it("inicializa a sessão ao sair do formulário para uma página da conta", async () => {
  state.pathname = "/influenciadores";
  const { rerender } = render(<SessionBootstrap />);
  expect(state.auth).not.toHaveBeenCalled();
  state.pathname = "/app";
  rerender(<SessionBootstrap />);
  await waitFor(() => expect(state.auth).toHaveBeenCalledOnce());
});
it("falha da telemetria opcional não derruba a página", async () => {
  state.pathname = "/app";
  state.auth.mockImplementation(() => {
    throw new DOMException("Storage denied", "SecurityError");
  });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { getByText } = render(
    <>
      <SessionBootstrap />
      <p>Página acessível</p>
    </>,
  );
  await waitFor(() => expect(warning).toHaveBeenCalledOnce());
  expect(getByText("Página acessível")).toBeTruthy();
});
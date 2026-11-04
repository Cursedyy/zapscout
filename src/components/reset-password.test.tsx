// @vitest-environment happy-dom
import type { AnchorHTMLAttributes, ComponentType, PropsWithChildren } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), clear: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => mocks.navigate,
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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      updateUser: mocks.update,
      getSession: async () => ({ data: { session: {} } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: async () => ({ data: { user: { email: "teste@example.com" } } }),
    },
  },
}));
vi.mock("@/lib/auth-precheck.functions", () => ({ clearResetLockout: mocks.clear }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { Route } from "../routes/reset-password";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ error: null });
  mocks.clear.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
async function abrir() {
  const Page = (Route as unknown as { component: ComponentType }).component;
  const result = render(<Page />);
  await screen.findByRole("button", { name: "Redefinir senha" });
  return { ...result, submit: () => fireEvent.submit(result.container.querySelector("form")!) };
}
function preencher(senha: string, confirmar = senha) {
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: senha } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: confirmar } });
}
describe("definição de senha com orientações claras", () => {
  it("mostra requisitos e distingue dicas antes do envio", async () => {
    await abrir();
    expect(screen.getByText("Pelo menos 8 caracteres.")).toBeDefined();
    expect(screen.getByText(/Senhas comuns ou identificadas como inseguras/)).toBeDefined();
    expect(screen.getByText("Dica:")).toBeDefined();
    preencher("Ficticia!76543");
    expect(screen.getByText("Pelo menos 8 caracteres — atendido.")).toBeDefined();
    expect(screen.getByText("A confirmação deve ser igual à senha — atendido.")).toBeDefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("mostra a recusa real em português e permite tentar uma alternativa", async () => {
    const raw = "Password is known to be weak and easy to guess, please choose a different one";
    mocks.update.mockResolvedValueOnce({ error: { code: "weak_password", message: raw } });
    const page = await abrir();
    preencher("TesteFake123!");
    page.submit();
    await screen.findByText(/Essa senha é comum ou já foi identificada como insegura/);
    expect(screen.queryByText(raw)).toBeNull();
    expect(mocks.clear).not.toHaveBeenCalled();
    preencher("OutraFicticia!76543");
    page.submit();
    await screen.findByText("Senha redefinida!");
    await waitFor(() =>
      expect(mocks.clear).toHaveBeenCalledWith({ data: { email: "teste@example.com" } }),
    );
  });
  it("não envia ao serviço se a confirmação for diferente", async () => {
    const page = await abrir();
    preencher("Ficticia!76543", "OutraFicticia!76543");
    page.submit();
    await screen.findByText("Senhas não coincidem");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

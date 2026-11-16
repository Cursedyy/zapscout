// @vitest-environment happy-dom
import type { AnchorHTMLAttributes, ComponentType, PropsWithChildren } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pre: vi.fn(),
  sign: vi.fn(),
  wait: vi.fn(),
  failure: vi.fn(),
  clear: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => mocks.navigate,
  redirect: vi.fn(),
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
    auth: { signInWithPassword: mocks.sign, getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock("@/lib/auth-precheck.functions", () => ({
  precheckLogin: mocks.pre,
  logLoginFailure: mocks.failure,
  clearLoginLockout: mocks.clear,
}));
vi.mock("@/lib/wait-for-session", () => ({ waitForSession: mocks.wait }));
vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
  describeAuthError: () => ({
    code: "invalid_credentials",
    message: "falha sintética",
    status: 400,
  }),
}));
vi.mock("@/lib/session-persistence", () => ({ setKeepLogged: vi.fn(), getKeepLogged: () => true }));
vi.mock("@/lib/anti-enumeration", async () => ({
  ...(await vi.importActual<typeof import("@/lib/anti-enumeration")>("@/lib/anti-enumeration")),
  randomDelay: async () => {},
}));
vi.mock("@/components/auth-captcha", () => ({ AuthCaptcha: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { Route } from "../routes/login";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.pre.mockResolvedValue({ ok: true });
  mocks.sign.mockResolvedValue({ error: null });
  mocks.wait.mockResolvedValue(true);
  mocks.failure.mockResolvedValue({ ok: true });
  mocks.clear.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function abrir() {
  const Page = (Route as unknown as { component: ComponentType }).component;
  const view = render(<Page />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sintetico@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "SenhaFicticia123!" } });
  return () => fireEvent.submit(view.container.querySelector("form")!);
}
it("verificação presa libera o botão após o prazo e nunca envia a senha depois", async () => {
  vi.useFakeTimers();
  let liberar!: (v: { ok: boolean }) => void;
  mocks.pre.mockImplementation(
    () =>
      new Promise((r) => {
        liberar = r;
      }),
  );
  abrir()();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000);
  });
  expect(screen.getByText("Conexão indisponível")).toBeDefined();
  expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(mocks.sign).not.toHaveBeenCalled();
  await act(async () => {
    liberar({ ok: true });
  });
  expect(mocks.sign).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("falha do precheck não remove as verificações de segurança", async () => {
  mocks.pre.mockRejectedValue(Error("backend indisponível"));
  abrir()();
  expect(await screen.findByText("Conexão indisponível")).toBeDefined();
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("limite ou CAPTCHA confirmado continua impedindo o login", async () => {
  mocks.pre.mockResolvedValue({
    ok: false,
    error: "Resolva o desafio",
    captcha: { token: "sintetico", question: "2+2" },
  });
  abrir()();
  expect(await screen.findByText("Verificação necessária")).toBeDefined();
  expect(mocks.sign).not.toHaveBeenCalled();
});
it("exceção na autenticação libera o botão sem alegar senha incorreta", async () => {
  mocks.sign.mockRejectedValue(Error("rede"));
  abrir()();
  expect(await screen.findByText("Conexão indisponível")).toBeDefined();
  expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("erro 504 da autenticação mostra falha de conexão sem oferecer reenvio de confirmação", async () => {
  mocks.sign.mockResolvedValue({ error: { status: 504 } });
  abrir()();
  expect(await screen.findByText("Conexão indisponível")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Reenviar confirmação" })).toBeNull();
});
it("credenciais recusadas mantêm a mensagem genérica sem revelar se a conta existe", async () => {
  mocks.sign.mockResolvedValue({ error: { status: 400 } });
  abrir()();
  expect(await screen.findByText("Não foi possível entrar")).toBeDefined();
  expect(screen.queryByText("falha sintética")).toBeNull();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("não navega sem confirmar a sessão", async () => {
  mocks.wait.mockResolvedValue(false);
  abrir()();
  expect(await screen.findByText("Sessão ainda indisponível")).toBeDefined();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it("entrada válida confirma a sessão e navega uma vez", async () => {
  abrir()();
  await act(async () => {});
  expect(mocks.sign).toHaveBeenCalledTimes(1);
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app" });
});

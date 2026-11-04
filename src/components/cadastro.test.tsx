// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ComponentType, PropsWithChildren } from "react";

const mocks = vi.hoisted(() => ({
  precheck: vi.fn(),
  signup: vi.fn(),
  resend: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useSearch: () => ({}),
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
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/acesso.functions", () => ({
  validarTokenAcesso: vi.fn(),
  redimirTokenAcesso: vi.fn(),
}));
vi.mock("@/lib/auth-precheck.functions", () => ({ precheckSignup: mocks.precheck }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: mocks.signup, resend: mocks.resend } },
}));
vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: vi.fn(),
  describeAuthError: (e: unknown) => e,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { Route } from "../routes/cadastro";

function form() {
  const Page = (Route as unknown as { component: ComponentType }).component;
  const result = render(<Page />);
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Líder" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "lider@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Senha!12345" } });
  return { ...result, submit: () => fireEvent.submit(result.container.querySelector("form")!) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.precheck.mockResolvedValue({ ok: true });
  mocks.signup.mockResolvedValue({
    data: { user: { identities: [{}] }, session: null },
    error: null,
  });
});
afterEach(cleanup);

describe("cadastro grátis", () => {
  it("mostra falha do precheck e permite tentar novamente", async () => {
    mocks.precheck.mockRejectedValueOnce(new Error("offline"));
    const page = form();
    page.submit();
    await screen.findByText(/Verifique sua conexão e tente novamente/);
    expect(mocks.signup).not.toHaveBeenCalled();
    page.submit();
    await screen.findByText("Confirme seu email");
  });

  it("impede cliques repetidos enquanto a verificação está pendente", async () => {
    let finish!: (value: unknown) => void;
    mocks.precheck.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const page = form();
    page.submit();
    page.submit();
    expect(mocks.precheck).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Criando..." }).hasAttribute("disabled")).toBe(true);
    finish({ ok: true });
    await screen.findByText("Confirme seu email");
    expect(mocks.signup).toHaveBeenCalledTimes(1);
  });

  it("respeita bloqueio explícito sem chamar o cadastro", async () => {
    mocks.precheck.mockResolvedValue({ ok: false, error: "Muitas tentativas" });
    form().submit();
    await screen.findByText("Muitas tentativas");
    expect(mocks.signup).not.toHaveBeenCalled();
  });

  it("entra no aplicativo quando o cadastro já retorna sessão", async () => {
    mocks.signup.mockResolvedValue({
      data: { user: { identities: [{}] }, session: { access_token: "test" } },
      error: null,
    });
    form().submit();
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app", search: { welcome: "true" } }),
    );
    expect(screen.queryByText("Confirme seu email")).toBeNull();
  });

  it("mantém a isca oculta fora dos campos comuns de preenchimento automático", () => {
    const page = form();
    expect(page.container.querySelector('input[name="company"]')).toBeNull();
    expect(
      page.container.querySelector('input[name="signup_website_check"]')?.parentElement?.hidden,
    ).toBe(true);
    expect(screen.getByLabelText("Senha").getAttribute("autocomplete")).toBe("new-password");
  });

  it("libera o reenvio após uma falha de conexão", async () => {
    mocks.resend.mockRejectedValueOnce(new Error("offline"));
    form().submit();
    await screen.findByText("Confirme seu email");
    const resend = screen.getByRole("button", { name: "Reenviar email" });
    fireEvent.click(resend);
    await waitFor(() => expect(resend.hasAttribute("disabled")).toBe(false));
    expect(mocks.resend).toHaveBeenCalledTimes(1);
  });

  it("exibe senha recusada e permite corrigir e reenviar", async () => {
    mocks.signup.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "weak_password", message: "Weak password", status: 422 },
    });
    const page = form();
    page.submit();
    await screen.findByText(/Essa senha foi recusada por ser fraca/);
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Outra!Senha123" } });
    page.submit();
    await screen.findByText("Confirme seu email");
    expect(mocks.signup).toHaveBeenCalledTimes(2);
  });

  it("orienta a entrar quando o serviço informa uma conta existente", async () => {
    mocks.signup.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    form().submit();
    await screen.findByText(/Este email já tem uma conta/);
    expect(screen.getByRole("link", { name: /Entrar na minha conta/ }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("trata duplicata silenciosa sem exibir confirmação de novo cadastro", async () => {
    mocks.signup.mockResolvedValueOnce({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    form().submit();
    await screen.findByText(/Este email já tem uma conta/);
    expect(screen.queryByText("Confirme seu email")).toBeNull();
  });

  it("normaliza o email e envia nome e endereço de confirmação", async () => {
    const page = form();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Lider@Example.COM" } });
    page.submit();
    await screen.findByText("Confirme seu email");
    expect(mocks.precheck).toHaveBeenCalledWith({
      data: { email: "lider@example.com", honeypot: "" },
    });
    expect(mocks.signup).toHaveBeenCalledWith({
      email: "lider@example.com",
      password: "Senha!12345",
      options: {
        data: { nome: "Líder" },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { traduzirErro, mensagemErro, traduzirErroDe, toastErro } from "./traduzir-erro";

// Mock do sonner para inspecionar chamadas de toast.error feitas por toastErro.
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// Import "pós-mock" para pegar a referência mockada.
import { toast } from "sonner";

describe("traduzirErro — mensagens comuns do WhatsApp", () => {
  it("traduz 'the number 55X...@s.whatsapp.net is not on WhatsApp' incluindo o número", () => {
    const out = traduzirErro(
      "the number 5511999998888@s.whatsapp.net is not on WhatsApp",
    );
    expect(out).toBe("O número 5511999998888 não está no WhatsApp.");
  });

  it("traduz variações genéricas de 'not on WhatsApp'", () => {
    expect(traduzirErro("This number is not a WhatsApp user")).toBe(
      "Este número não está no WhatsApp.",
    );
    expect(traduzirErro("number is not registered on whatsapp")).toBe(
      "Este número não está no WhatsApp.",
    );
  });

  it("traduz número inválido / invalid recipient", () => {
    expect(traduzirErro("invalid phone number")).toBe("Número inválido.");
    expect(traduzirErro("invalid recipient")).toBe("Número inválido.");
    expect(traduzirErro("numero invalido")).toBe("Número inválido.");
  });

  it("traduz rate limit / too many requests / 429", () => {
    const msg = "Muitas mensagens em pouco tempo — aguarde antes de tentar novamente.";
    expect(traduzirErro("rate limit exceeded")).toBe(msg);
    expect(traduzirErro("too many requests")).toBe(msg);
    expect(traduzirErro("HTTP 429")).toBe(msg);
  });

  it("traduz sessão expirada / token inválido / 401 / 403", () => {
    const msg = "Sessão do WhatsApp expirada ou token inválido — reconecte o número.";
    expect(traduzirErro("unauthorized")).toBe(msg);
    expect(traduzirErro("invalid token")).toBe(msg);
    expect(traduzirErro("token expired")).toBe(msg);
    expect(traduzirErro("forbidden")).toBe(msg);
    expect(traduzirErro("HTTP 401")).toBe(msg);
    expect(traduzirErro("HTTP 403")).toBe(msg);
  });

  it("traduz desconexão do provedor", () => {
    const msg = "WhatsApp desconectado no provedor — reconecte o número para a fila continuar.";
    expect(traduzirErro("whatsapp disconnected")).toBe(msg);
    expect(traduzirErro("instance disconnected")).toBe(msg);
    expect(traduzirErro("connection closed")).toBe(msg);
  });

  it("traduz timeouts e falhas de rede", () => {
    expect(traduzirErro("timeout")).toBe(
      "Tempo esgotado ao contatar o WhatsApp — tentaremos novamente.",
    );
    expect(traduzirErro("ETIMEDOUT")).toBe(
      "Tempo esgotado ao contatar o WhatsApp — tentaremos novamente.",
    );
    expect(traduzirErro("fetch failed")).toBe(
      "Falha de conexão com o provedor de WhatsApp — tentaremos novamente.",
    );
    expect(traduzirErro("ECONNREFUSED")).toBe(
      "Falha de conexão com o provedor de WhatsApp — tentaremos novamente.",
    );
  });

  it("traduz instância não encontrada", () => {
    expect(traduzirErro("instance not found")).toBe(
      "Instância do WhatsApp não encontrada — refaça a conexão.",
    );
  });

  it("traduz bloqueio / banimento", () => {
    expect(traduzirErro("this number is blocked")).toBe(
      "Este número foi bloqueado pelo WhatsApp.",
    );
    expect(traduzirErro("number banido")).toBe(
      "Este número foi bloqueado pelo WhatsApp.",
    );
  });

  it("traduz erro interno / 500", () => {
    expect(traduzirErro("internal server error")).toBe(
      "Erro interno no provedor de WhatsApp — tentaremos novamente.",
    );
    expect(traduzirErro("HTTP 500")).toBe(
      "Erro interno no provedor de WhatsApp — tentaremos novamente.",
    );
  });
});

describe("traduzirErro — envelopes do provedor", () => {
  it("extrai {\"error\":\"...\"} de dentro de envelope tipo UAZAPI [500]", () => {
    const raw =
      'UAZAPI [500]: {"error":"the number 5511987654321@s.whatsapp.net is not on WhatsApp"}';
    expect(traduzirErro(raw)).toBe(
      "O número 5511987654321 não está no WhatsApp.",
    );
  });

  it("extrai texto simples após 'PROVIDER [status]:'", () => {
    expect(traduzirErro("Evolution [403]: unauthorized")).toBe(
      "Sessão do WhatsApp expirada ou token inválido — reconecte o número.",
    );
  });

  it("devolve msg amigável quando sobrou só o envelope vazio", () => {
    expect(traduzirErro("UAZAPI [418]:")).toBe("Erro no provedor de WhatsApp.");
    expect(traduzirErro("UAZAPI [418]")).toBe("Erro no provedor de WhatsApp.");
  });

  it("traduz um 500 dentro do envelope pela regra genérica /500/", () => {
    // Envelope numérico casa a regra de 500 mesmo com corpo desconhecido.
    expect(traduzirErro("Evolution [500]: something exploded")).toBe(
      "Erro interno no provedor de WhatsApp — tentaremos novamente.",
    );
  });
});

describe("traduzirErro — fallback", () => {
  it("retorna string vazia para null/undefined/vazio", () => {
    expect(traduzirErro(null)).toBe("");
    expect(traduzirErro(undefined)).toBe("");
    expect(traduzirErro("")).toBe("");
    expect(traduzirErro("   ")).toBe("");
  });

  it("mantém a mensagem original quando nenhuma regra bate", () => {
    expect(traduzirErro("mensagem completamente desconhecida XYZ")).toBe(
      "mensagem completamente desconhecida XYZ",
    );
  });

  it("desembrulha envelope mesmo quando o corpo não casa nenhuma regra", () => {
    expect(traduzirErro('UAZAPI [418]: {"error":"teapot mode"}')).toBe(
      "teapot mode",
    );
  });
});

describe("mensagemErro", () => {
  it("usa .message quando é Error", () => {
    expect(mensagemErro(new Error("boom"))).toBe("boom");
  });

  it("aceita string direta", () => {
    expect(mensagemErro("falha crua")).toBe("falha crua");
  });

  it("usa fallback para Error sem message ou string vazia", () => {
    expect(mensagemErro(new Error(""), "fb")).toBe("fb");
    expect(mensagemErro("   ", "fb")).toBe("fb");
  });

  it("lê .message / .error de objetos soltos", () => {
    expect(mensagemErro({ message: "oi" })).toBe("oi");
    expect(mensagemErro({ error: "xxx" })).toBe("xxx");
  });

  it("serializa objeto quando não tem message/error", () => {
    expect(mensagemErro({ foo: 1 })).toBe('{"foo":1}');
  });

  it("cai no fallback para null/undefined/number", () => {
    expect(mensagemErro(null, "fb")).toBe("fb");
    expect(mensagemErro(undefined, "fb")).toBe("fb");
    expect(mensagemErro(42, "fb")).toBe("fb");
  });

  it("fallback padrão é 'Erro inesperado'", () => {
    expect(mensagemErro(null)).toBe("Erro inesperado");
  });
});

describe("traduzirErroDe — extrai + traduz num passo", () => {
  it("traduz Error do catch com regra conhecida", () => {
    expect(traduzirErroDe(new Error("too many requests"))).toBe(
      "Muitas mensagens em pouco tempo — aguarde antes de tentar novamente.",
    );
  });

  it("mantém mensagem crua quando não bate regra", () => {
    expect(traduzirErroDe(new Error("erro custom"))).toBe("erro custom");
  });

  it("usa fallback traduzido quando erro é vazio", () => {
    // fallback não bate nenhuma regra, então volta ele mesmo
    expect(traduzirErroDe(null, "Falha ao salvar")).toBe("Falha ao salvar");
  });
});

describe("toastErro — dispara sonner.toast.error traduzido", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("chama toast.error com a versão traduzida", () => {
    toastErro(new Error("unauthorized"));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Sessão do WhatsApp expirada ou token inválido — reconecte o número.",
      undefined,
    );
  });

  it("usa fallback quando o erro é null", () => {
    toastErro(null, "Falha ao cancelar");
    expect(toast.error).toHaveBeenCalledWith("Falha ao cancelar", undefined);
  });

  it("repassa opções do sonner (ex.: duration)", () => {
    toastErro(new Error("timeout"), "Falha", { duration: 8000 });
    expect(toast.error).toHaveBeenCalledWith(
      "Tempo esgotado ao contatar o WhatsApp — tentaremos novamente.",
      { duration: 8000 },
    );
  });
});

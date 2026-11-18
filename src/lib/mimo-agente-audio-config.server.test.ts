import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ from: vi.fn(), remetente: vi.fn(), transcrever: vi.fn(), confirmar: vi.fn(), respostas: [] as unknown[] }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: f.from } }));
vi.mock("./mimo-agente-worker.server", () => ({ obterRemetenteAgente: f.remetente }));
vi.mock("./uazapi.server", () => ({ uazTranscreverAudio: f.transcrever, uazConfirmarChaveAudio: f.confirmar }));
import { configurarAudioAgente } from "./mimo-agente-audio-config.server";
const membro = { data: { papel: "gestor", ativo: true }, error: null }, config = { data: { vinculo_id: "vinculo" }, error: null };
beforeEach(() => {
  vi.resetAllMocks(); f.respostas = [membro, config, { data: { message_id: "audio-da-instancia" } }, membro, config];
  f.from.mockImplementation(() => {
    const q = { select: vi.fn(() => q), eq: vi.fn(() => q), gte: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => q), maybeSingle: vi.fn(async () => f.respostas.shift()) }; return q;
  });
  f.remetente.mockResolvedValue("token-da-instancia"); f.transcrever.mockResolvedValue("fala privada"); f.confirmar.mockResolvedValue(true);
});
it("testa apenas áudio da empresa e retorna somente confirmação, sem chave ou transcrição", async () => {
  expect(await configurarAudioAgente("empresa", "ator", "chave-privada")).toEqual({ ok: true });
  expect(f.transcrever).toHaveBeenCalledOnce(); expect(f.transcrever).toHaveBeenCalledWith("token-da-instancia", "audio-da-instancia", "chave-privada");
  expect(f.confirmar).toHaveBeenCalledWith("token-da-instancia", "chave-privada");
  const q = f.from.mock.results[2].value;
  expect(q.eq).toHaveBeenCalledWith("empresa_id", "empresa"); expect(q.eq).toHaveBeenCalledWith("vinculo_id", "vinculo"); expect(q.eq).toHaveBeenCalledWith("direcao", "recebida");
});
it("nega membro inativo antes de ler remetente", async () => {
  f.respostas[0] = { data: { papel: "gestor", ativo: false } };
  await expect(configurarAudioAgente("empresa", "ator", "chave")).rejects.toThrow("Acesso negado"); expect(f.remetente).not.toHaveBeenCalled();
});
it("não transmite chave se remetente diverge ou está desconectado", async () => {
  f.remetente.mockResolvedValue(null); await expect(configurarAudioAgente("empresa", "ator", "chave")).rejects.toThrow("identidade"); expect(f.transcrever).not.toHaveBeenCalled();
});
it("não transmite chave sem áudio recente", async () => {
  f.respostas[2] = { data: null }; await expect(configurarAudioAgente("empresa", "ator", "chave")).rejects.toThrow("áudio curto"); expect(f.transcrever).not.toHaveBeenCalled();
});
it("revalida papel e vínculo antes de transmitir a chave", async () => {
  f.respostas[4] = { data: { vinculo_id: "outro" } }; await expect(configurarAudioAgente("empresa", "ator", "chave")).rejects.toThrow("mudou"); expect(f.transcrever).not.toHaveBeenCalled();
});
it("não repete falha nem devolve mensagem sensível do provedor", async () => {
  f.transcrever.mockRejectedValue(Error("chave-privada e fala privada"));
  await expect(configurarAudioAgente("empresa", "ator", "chave-privada")).rejects.toThrow("A chave pode ter sido salva");
  expect(f.transcrever).toHaveBeenCalledOnce(); expect(f.confirmar).not.toHaveBeenCalled();
});
it("não declara sucesso sem confirmar que a chave foi salva", async () => {
  f.confirmar.mockResolvedValue(false); await expect(configurarAudioAgente("empresa", "ator", "chave")).rejects.toThrow("Não foi possível confirmar");
});

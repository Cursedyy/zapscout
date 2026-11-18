import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({rpc:vi.fn(),transcrever:vi.fn(),token:vi.fn()}));
vi.mock("./mimo-agente-db.server",()=>({audioAgente:f.rpc}));
vi.mock("./uazapi.server",()=>({uazTranscreverAudio:f.transcrever}));
import { transcreverAudiosAgente } from "./mimo-agente-audio.server";
const id="00000000-0000-4000-8000-000000000001", chave={id,reserva:id};
const mensagens=[{role:"user" as const,content:"[audio]",messageId:"audio-sintetico"}];
beforeEach(()=>{vi.resetAllMocks();f.token.mockResolvedValue("token-teste");});
it("transcreve somente ID retornado pelo banco e persiste antes de usar",async()=>{
 f.rpc.mockResolvedValueOnce([{id,messageId:"audio-sintetico"}]).mockResolvedValueOnce({texto:"[Transcrição de áudio]\nSou Ana"});f.transcrever.mockResolvedValue("Sou Ana");
 const r=await transcreverAudiosAgente(chave,mensagens,f.token);
 expect(r[0].content).toContain("Sou Ana");expect(mensagens[0].content).toBe("[audio]");
 expect(f.transcrever).toHaveBeenCalledWith("token-teste","audio-sintetico");expect(f.rpc).toHaveBeenLastCalledWith({...chave,evento:id,texto:"Sou Ana"});
});
it.each([null,[]])("reserva inválida ou sem áudios não consulta provedor: %s",async value=>{
 f.rpc.mockResolvedValue(value);expect(await transcreverAudiosAgente(chave,mensagens,f.token)).toEqual(mensagens);expect(f.transcrever).not.toHaveBeenCalled();
});
it("mudança durante transcrição impede usar conteúdo não persistido",async()=>{
 f.rpc.mockResolvedValueOnce([{id,messageId:"audio-sintetico"}]).mockResolvedValueOnce(null);f.transcrever.mockResolvedValue("Sou Ana");
 expect(await transcreverAudiosAgente(chave,mensagens,f.token)).toEqual(mensagens);
});
it("falha ou retorno vazio preserva encaminhamento seguro sem inventar fala",async()=>{
 f.rpc.mockResolvedValue([{id,messageId:"audio-sintetico"}]);f.transcrever.mockRejectedValue(Error("indisponivel"));
 expect(await transcreverAudiosAgente(chave,mensagens,f.token)).toEqual(mensagens);expect(f.transcrever).toHaveBeenCalledTimes(1);
});
it("não transcreve áudios de antes da última resposta",async()=>{
 await transcreverAudiosAgente(chave,[...mensagens,{role:"assistant",content:"Resposta"},{role:"user",content:"Olá"}],f.token);expect(f.rpc).not.toHaveBeenCalled();
});

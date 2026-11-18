import { useRef, useState } from "react";
import { configurarAudioAgenteMimo } from "@/lib/mimo-agente-audio-config.functions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function ConfigAudioAgente() {
  const entrada = useRef<HTMLInputElement>(null);
  const ocupado = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  return <section id="transcricao-audio" className="rounded-xl border bg-card p-5 space-y-3">
    <h2 className="font-semibold">Transcrição de áudios</h2>
    <p className="text-sm text-muted-foreground">Cadastre sua chave OpenAI para o agente entender os áudios. Ela ficará salva na UazAPI do número de atendimento.</p>
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      if (ocupado.current) return;
      const chave = entrada.current?.value.trim() ?? "";
      if (!chave) return;
      ocupado.current = true;
      setSalvando(true); setResultado(null);
      // Clear immediately and never put the credential in React Query/mutation caches or storage.
      if (entrada.current) entrada.current.value = "";
      try {
        await configurarAudioAgenteMimo({ data: { chave } });
        setResultado({ ok: true, texto: "Chave salva e transcrição testada com sucesso. Os próximos áudios já podem ser interpretados pelo agente." });
      } catch {
        setResultado({ ok: false, texto: "Não foi possível concluir o teste. Confira a conexão do atendimento, a chave e o saldo da API. É necessário um áudio recebido nas últimas 48 horas. A chave pode ter sido salva na UazAPI; ela não ficou neste campo." });
      } finally { ocupado.current = false; setSalvando(false); }
    }}>
      <label htmlFor="chave-audio-mimo" className="block text-sm font-medium">Chave OpenAI</label>
      <Input ref={entrada} id="chave-audio-mimo" name="chave-audio-mimo" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={503} required disabled={salvando} placeholder="Cole sua chave aqui" className="max-w-xl" />
      <p className="text-xs text-muted-foreground">O teste usa um áudio já recebido, sem enviar mensagens ao cliente. O uso da API OpenAI é cobrado na sua conta.</p>
      <Button type="submit" disabled={salvando}>{salvando ? "Salvando e testando…" : "Salvar chave e testar áudio"}</Button>
    </form>
    {resultado && <p role={resultado.ok ? "status" : "alert"} className="text-sm">{resultado.texto}</p>}
  </section>;
}

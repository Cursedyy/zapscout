import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { instagramDesenho, LIMITE_DESENHO, tipoArquivoDesenho } from "@/lib/mimo-campanha-desenhos";

export function MimoCampanhaDesenhosForm() {
  const tentativa = useRef("");
  const emAndamento = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [recebido, setRecebido] = useState(false);
  function novoEnvio() {
    tentativa.current = "";
    setErro("");
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (emAndamento.current) return;
    const formulario = new FormData(event.currentTarget);
    const instagram = instagramDesenho.safeParse(formulario.get("instagram"));
    if (!instagram.success) {
      setErro("Informe um @ do Instagram válido.");
      return;
    }
    const arquivo = formulario.get("desenho");
    if (!(arquivo instanceof File) || !arquivo.size) {
      setErro("Selecione uma foto ou um vídeo do seu desenho.");
      return;
    }
    const mime = tipoArquivoDesenho(arquivo);
    if (!mime) {
      setErro("Use uma foto JPG, PNG ou WebP, ou um vídeo MP4 ou MOV.");
      return;
    }
    if (arquivo.size > LIMITE_DESENHO) {
      setErro("O arquivo precisa ter até 25 MB.");
      return;
    }

    emAndamento.current = true;
    setEnviando(true);
    setErro("");
    try {
      tentativa.current ||= crypto.randomUUID();
      const resposta = await fetch("/api/public/mimo-campanha-desenhos", {
        method: "POST",
        headers: {
          "Content-Type": mime,
          "X-Instagram": instagram.data,
          "X-Envio-Id": tentativa.current,
        },
        body: arquivo,
      });
      const resultado = await resposta.json();
      if (typeof resultado?.mensagem !== "string") throw new Error("Resposta inválida");
      if (!resposta.ok) {
        setErro(resultado.mensagem);
        if (resposta.status === 409) tentativa.current = "";
        return;
      }
      setRecebido(true);
    } catch {
      setErro(
        "Não foi possível enviar agora. Seu formulário continua preenchido. Tente novamente.",
      );
    } finally {
      emAndamento.current = false;
      setEnviando(false);
    }
  }

  return (
    <main className="mimo-app grid min-h-dvh place-items-center bg-background px-4 py-8 sm:py-16">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm md:grid-cols-[.9fr_1.1fr]">
        <header className="flex flex-col justify-center bg-[#ffdfad] p-7 text-[#462408] sm:p-10">
          <ImageUp aria-hidden="true" className="mb-7 size-10" strokeWidth={1.5} />
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Envie seu desenho para a MiMo
          </h1>
          <p className="mt-4 max-w-xs text-base leading-relaxed">
            Compartilhe uma foto ou um vídeo do seu desenho e deixe seu @ do Instagram para a equipe
            identificar o envio.
          </p>
        </header>
        <div className="p-7 sm:p-10">
          {recebido ? (
            <div role="status" className="flex h-full min-h-52 flex-col justify-center gap-3">
              <CheckCircle2 aria-hidden="true" className="size-9 text-primary" />
              <h2 className="text-xl font-semibold">Desenho recebido!</h2>
              <p className="text-sm text-muted-foreground">
                Obrigada por participar da campanha da MiMo.
              </p>
            </div>
          ) : (
            <form
              method="post"
              action="/api/public/mimo-campanha-desenhos"
              encType="multipart/form-data"
              onSubmit={(event) => void enviar(event)}
              aria-busy={enviando}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="desenho-instagram">Seu @ do Instagram</Label>
                <Input
                  id="desenho-instagram"
                  name="instagram"
                  placeholder="@seuperfil"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={31}
                  required
                  disabled={enviando}
                  onChange={novoEnvio}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desenho-arquivo">Foto ou vídeo do desenho</Label>
                <Input
                  id="desenho-arquivo"
                  name="desenho"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
                  className="h-auto py-2.5"
                  aria-describedby="desenho-formatos"
                  required
                  disabled={enviando}
                  onChange={novoEnvio}
                />
                <p id="desenho-formatos" className="text-xs leading-relaxed text-muted-foreground">
                  JPG, PNG, WebP, MP4 ou MOV. Até 25 MB.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                A equipe MiMo usará o perfil e o arquivo para esta campanha.
              </p>
              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando && <Loader2 aria-hidden="true" className="animate-spin" />}
                {enviando ? "Enviando desenho…" : "Enviar desenho"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

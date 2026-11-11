import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const LINK_CONVITE_MIMO = "https://zapscout.com.br/influenciadores?campanha=mimo";
export function ConviteInfluenciadoresMimo() {
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [mostrarLink, setMostrarLink] = useState(false);

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(LINK_CONVITE_MIMO);
      setMensagem("Link copiado! Envie para quem também pode fazer parte da MiMo.");
      setMostrarLink(false);
    } catch {
      setMostrarLink(true);
      setMensagem("Selecione e copie o link abaixo para enviar seu convite.");
    }
  }
  async function compartilhar() {
    if (ocupado) return;
    setOcupado(true);
    setMensagem("");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Seja uma influenciadora MiMo",
          text: "Também quer fazer parte dos lançamentos MiMo? Cadastre seu perfil pelo link:",
          url: LINK_CONVITE_MIMO,
        });
      } else {
        await copiar();
      }
    } catch (erro) {
      if (!(erro && typeof erro === "object" && "name" in erro && erro.name === "AbortError"))
        await copiar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section
      aria-labelledby="convite-mimo-titulo"
      className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center sm:p-8"
    >
      <h2 id="convite-mimo-titulo" className="text-xl font-semibold">
        Conhece outros criadores?
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Compartilhe o convite e ajude outras pessoas a fazer parte dessa história com a MiMo.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button type="button" disabled={ocupado} onClick={compartilhar}>
          <Share2 className="h-4 w-4" />
          Compartilhar convite
        </Button>
        <Button type="button" variant="outline" disabled={ocupado} onClick={copiar}>
          <Copy className="h-4 w-4" />
          Copiar link
        </Button>
      </div>
      {mensagem && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {mensagem}
        </p>
      )}
      {mostrarLink && (
        <label className="mt-3 block text-left text-sm">
          Link do convite
          <Input
            className="mt-2"
            value={LINK_CONVITE_MIMO}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}

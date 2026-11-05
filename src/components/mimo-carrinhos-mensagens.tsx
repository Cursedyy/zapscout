import { mensagensRecuperacaoMimo, emailRecuperacaoMimo } from "@/lib/mimo-carrinhos-mensagens";
const modelo = mensagensRecuperacaoMimo("Cliente", "https://loja.example.invalid/checkout/previa", [
  "loja.example.invalid",
]);
export function MimoCarrinhosMensagens() {
  return (
    <details className="rounded-xl border bg-card p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Prévia das mensagens · Cupom MIMOCONSULTOR
      </summary>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-semibold">WhatsApp</h2>
          <p className="text-muted-foreground">Rascunho para revisão; nome e link são exemplos.</p>
          <div className="whitespace-pre-wrap rounded-2xl border bg-[#FFFCF7] p-5 leading-relaxed">
            {modelo.whatsapp}
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">E-mail</h2>
          <p>
            <strong>Assunto:</strong> {modelo.assunto}
          </p>
          <iframe
            title="Prévia do e-mail MiMo"
            sandbox=""
            srcDoc={emailRecuperacaoMimo(modelo, null)}
            className="h-[760px] w-full rounded-2xl border bg-white"
          />
        </section>
      </div>
      <p className="mt-3 text-muted-foreground">
        Nenhuma mensagem será enviada por esta prévia. Conexões, descadastro e teste ainda precisam
        ser concluídos.
      </p>
    </details>
  );
}

export function respostaInscricaoInfluenciador(status: number, mensagem: string, nativa: boolean) {
  if (!nativa)
    return Response.json({ mensagem }, { status, headers: { "Cache-Control": "no-store" } });
  const escapar = (texto: string) =>
    texto.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
    );
  const titulo = status === 200 ? "Recebemos sua inscrição!" : "Confira sua inscrição";
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo} | MiMo</title><style>body{margin:0;background:#fffaf5;color:#382819;font:16px/1.6 Arial,sans-serif}main{max-width:540px;margin:8vh auto;padding:24px}section{padding:24px;background:#fff;border:1px solid #ead7c6;border-radius:20px}h1{font-size:28px;line-height:1.2}a{color:#9a4515}p{overflow-wrap:anywhere}</style></head><body><main><p><strong>MiMo. Esse Pode!</strong></p><section><h1>${titulo}</h1><p>${escapar(mensagem)}</p>${status === 200 ? "" : "<p>Use o botão Voltar do navegador para revisar suas respostas antes de tentar novamente.</p>"}<a href="/influenciadores?campanha=mimo">Voltar ao formulário</a></section></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
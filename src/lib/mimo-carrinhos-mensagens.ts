import { linkCarrinhoSeguro } from "./mimo-carrinhos";
export const CUPOM_RECUPERACAO_MIMO = { codigo: "MIMOCONSULTOR", percentual: 10 } as const;
const html = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function mensagensRecuperacaoMimo(nome: string, link: string, hosts: readonly string[]) {
  const destino = linkCarrinhoSeguro(link, hosts);
  if (!destino) throw Error("Link do carrinho não autorizado.");
  const primeiroNome =
    nome
      .trim()
      .replace(/[\r\n\t]+/g, " ")
      .split(/\s+/)[0]
      .slice(0, 60) || "tudo bem";
  const saudacao = primeiroNome === "tudo bem" ? "Olá! Tudo bem?" : `Olá, ${primeiroNome}!`;
  const whatsapp = `${saudacao} 🧡\n\nAqui é da MiMo! Seu carrinho ficou salvo e a gente trouxe um mimo para você: 10% de desconto com o cupom *MIMOCONSULTOR*.\n\nRetome sua compra por aqui:\n${destino}\n\nDigite o cupom na hora de finalizar. Se precisar de ajuda, é só responder esta mensagem.`;
  const assunto = "Seu carrinho merece um mimo: 10% de desconto 🧡";
  const texto = `${saudacao}\n\nSeu carrinho está te esperando na MiMo. Para deixar esse reencontro ainda melhor, use o cupom MIMOCONSULTOR e ganhe 10% de desconto.\n\nRetomar meu carrinho: ${destino}\n\nDigite o cupom na hora de finalizar. Se precisar de ajuda, responda este e-mail.\n\nCom carinho,\nEquipe MiMo`;
  return { saudacao, link: destino, whatsapp, assunto, texto };
}
/** Modelo visual. O envio exige um link de descadastro assinado, que a prévia não cria. */
export function emailRecuperacaoMimo(
  mensagem: ReturnType<typeof mensagensRecuperacaoMimo>,
  descadastro: { url: string; origem: string } | null,
) {
  let rodape =
    '<p style="font-size:12px;color:#8d6a52">Prévia · link de descadastro será incluído antes de qualquer envio.</p>';
  if (descadastro) {
    const u = new URL(descadastro.url),
      origin = new URL(descadastro.origem);
    if (
      u.protocol !== "https:" ||
      origin.protocol !== "https:" ||
      u.origin !== origin.origin ||
      u.username ||
      u.password ||
      u.pathname !== "/api/public/mimo-carrinhos-descadastro"
    )
      throw Error("Link de descadastro não autorizado.");
    rodape = `<p style="font-size:12px;color:#8d6a52">Não quer receber lembretes? <a href="${html(u.href)}" style="color:#612808">Deixar de receber</a>.</p>`;
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#fffcf7;font-family:Arial,sans-serif;color:#612808"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #f0dec9;border-radius:24px"><tr><td style="padding:32px"><div style="font-size:36px;font-weight:800;letter-spacing:-2px">MiMo<span style="color:#fc6c12">.</span></div><p style="font-size:14px;color:#8d6a52">Um carinho para sua próxima escolha.</p><h1 style="font-size:30px;line-height:1.2;margin-top:32px">Seu carrinho merece<br>um mimo 🧡</h1><p style="font-size:16px;line-height:1.7">${html(mensagem.saudacao)}</p><p style="font-size:16px;line-height:1.7">Seu carrinho está te esperando na MiMo. Para deixar esse reencontro ainda melhor, use o cupom abaixo e ganhe <strong>10% de desconto</strong>.</p><div style="margin:24px 0;padding:24px;background:#fff4e9;border:1px dashed #fc6c12;border-radius:16px;text-align:center"><p style="margin:0 0 8px;font-size:13px">SEU MIMO DE 10%</p><strong style="font-size:24px;letter-spacing:2px">MIMOCONSULTOR</strong></div><p style="text-align:center;margin:32px 0"><a href="${html(mensagem.link)}" style="display:inline-block;padding:16px 26px;border-radius:14px;background:#fc6c12;color:#fff;text-decoration:none;font-size:16px;font-weight:bold">Retomar meu carrinho</a></p><p style="font-size:14px;line-height:1.7">Digite o cupom na hora de finalizar. Se precisar de ajuda, responda este e-mail.</p><p style="font-size:16px;line-height:1.7">Com carinho,<br><strong>Equipe MiMo</strong></p><hr style="border:0;border-top:1px solid #f0dec9;margin-top:32px">${rodape}</td></tr></table></td></tr></table></body></html>`;
}

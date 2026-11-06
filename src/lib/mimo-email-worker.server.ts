import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CarrinhoRegistro } from "./mimo-carrinhos";
import { linkCarrinhoSeguro } from "./mimo-carrinhos";
import { rpcEmail } from "./mimo-email-db.server";
import {
  acessoGmail,
  configGmail,
  emailGmailSchema,
  enviarGmail,
  linkDescadastroGmail,
  mimeGmail,
} from "./mimo-gmail.server";
import { configOAuthNuvem, obterConfigNuvem } from "./mimo-nuvemshop-oauth.server";
import { coletarNuvem, conferirCompraNuvem } from "./mimo-nuvemshop.server";
import { mensagensRecuperacaoMimo, emailRecuperacaoMimo } from "./mimo-carrinhos-mensagens";
type DB = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      mimo_nuvem_carrinhos: {
        Row: CarrinhoRegistro & { empresa_id: string; loja_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      mimo_nuvem_sincronizar: {
        Args: { _empresa: string; _loja: string; _ator: string; _carrinhos: Json; _pedidos: Json };
        Returns: undefined;
      };
    };
  };
};
const db = supabaseAdmin as unknown as SupabaseClient<DB>;
const trabalhoSchema = z.object({
  id: z.string().uuid(),
  reserva: z.string().uuid(),
  checkout_id: z.string(),
  token_hash: z.string().regex(/^[a-f0-9]{64}$/),
  email: emailGmailSchema,
});
async function carrinhoEmail(empresa: string, loja: string, checkout: string) {
  const r = await db
    .from("mimo_nuvem_carrinhos")
    .select("*")
    .eq("empresa_id", empresa)
    .eq("loja_id", loja)
    .eq("checkout_id", checkout)
    .maybeSingle();
  if (r.error || !r.data) throw Error("Carrinho indisponível.");
  return r.data;
}
export async function executarEmailMimo(manual?: {
  empresa: string;
  ator: string;
  checkout: string;
}) {
  const ambiente = configOAuthNuvem(),
    gmailCfg = configGmail();
  if (!ambiente || !gmailCfg || ambiente.empresa !== gmailCfg.empresa) return "sem_configuracao";
  if (manual && manual.empresa !== ambiente.empresa) throw Error("Empresa divergente.");
  const processamento = manual
    ? { ator: manual.ator, loja: ambiente.loja }
    : z
        .object({ ator: z.string().uuid(), loja: z.string() })
        .nullable()
        .parse(await rpcEmail("mimo_email_processamento", { _empresa: ambiente.empresa }));
  if (!processamento || processamento.loja !== ambiente.loja) return "desativada";
  const nuvem = await obterConfigNuvem(ambiente.empresa, processamento.ator);
  if (!nuvem || nuvem.empresa !== ambiente.empresa || nuvem.loja !== ambiente.loja)
    throw Error("Conexão da loja indisponível.");
  // Uma coleta integral bem-sucedida precede a reserva em ambos os modos.
  {
    const lote = await coletarNuvem(nuvem);
    const r = await db.rpc("mimo_nuvem_sincronizar", {
      _empresa: ambiente.empresa,
      _loja: nuvem.loja,
      _ator: processamento.ator,
      _carrinhos: lote.carrinhos as unknown as Json,
      _pedidos: lote.pedidos as unknown as Json,
    });
    if (r.error) throw Error("Não foi possível atualizar a loja.");
  }
  const raw = await rpcEmail("mimo_email_reservar", {
    _empresa: ambiente.empresa,
    _loja: nuvem.loja,
    _ator: processamento.ator,
    _checkout: manual?.checkout ?? null,
  });
  if (!raw) return "vazia";
  const f = trabalhoSchema.parse(raw);
  const concluir = (estado: string, message: string | null = null, motivo: string | null = null) =>
    rpcEmail("mimo_email_concluir", {
      _id: f.id,
      _reserva: f.reserva,
      _estado: estado,
      _message: message,
      _motivo: motivo,
    });
  const [gmail, c] = await Promise.all([
    acessoGmail(ambiente.empresa, processamento.ator),
    carrinhoEmail(ambiente.empresa, nuvem.loja, f.checkout_id),
  ]);
  if (
    c.token_hash !== f.token_hash ||
    emailGmailSchema.safeParse(c.email).data !== f.email ||
    !linkCarrinhoSeguro(c.url, nuvem.hosts)
  ) {
    await concluir("bloqueada", null, "destino_indisponivel");
    return "bloqueada";
  }
  const descadastro = await linkDescadastroGmail(gmail.cfg, {
    id: f.id,
    empresa: ambiente.empresa,
    email: f.email,
  });
  const modelo = mensagensRecuperacaoMimo(c.nome, c.url!, nuvem.hosts);
  const rawEmail = mimeGmail({
    remetente: gmail.cfg.remetente,
    destino: f.email,
    id: f.id,
    assunto: modelo.assunto,
    texto: modelo.texto + `\n\nParar os lembretes por e-mail: ${descadastro}`,
    html: emailRecuperacaoMimo(modelo, { url: descadastro, origem: gmail.cfg.origem }),
    descadastro,
  });
  if (await conferirCompraNuvem(nuvem, f.token_hash)) {
    await concluir("bloqueada", null, "compra_identificada");
    return "bloqueada";
  }
  if (
    (await rpcEmail("mimo_email_autorizar", {
      _id: f.id,
      _reserva: f.reserva,
      _versao: gmail.versao,
    })) !== true
  )
    return "bloqueada";
  try {
    const id = await enviarGmail(gmail.token, rawEmail);
    await concluir("enviada", id);
    return "enviada";
  } catch {
    await concluir("incerta", null, "aceite_incerto");
    return "incerta";
  }
}
export async function testarEmailMimo(
  empresa: string,
  ator: string,
  data: { email: string; checkout: string; id: string },
) {
  const nuvem = await obterConfigNuvem(empresa, ator);
  if (!nuvem || nuvem.empresa !== empresa) throw Error("Conecte a loja antes do teste.");
  const [gmail, c] = await Promise.all([
    acessoGmail(empresa, ator),
    carrinhoEmail(empresa, nuvem.loja, data.checkout),
  ]);
  const modelo = mensagensRecuperacaoMimo(c.nome, c.url!, nuvem.hosts);
  const raw = mimeGmail({
    remetente: gmail.cfg.remetente,
    destino: data.email,
    id: data.id,
    assunto: "[TESTE INTERNO MiMo] " + modelo.assunto,
    texto:
      "TESTE INTERNO. O link abaixo é um exemplo de carrinho; esta mensagem não foi enviada ao cliente.\n\n" +
      modelo.texto,
    html:
      "<p><strong>TESTE INTERNO.</strong> Exemplo de mensagem para revisão pela equipe.</p>" +
      emailRecuperacaoMimo(modelo, null),
  });
  if (
    (await rpcEmail("mimo_email_teste_reservar", {
      _empresa: empresa,
      _ator: ator,
      _id: data.id,
      _email: data.email,
      _versao: gmail.versao,
    })) !== true
  )
    return "ja_processado";
  try {
    const id = await enviarGmail(gmail.token, raw);
    await rpcEmail("mimo_email_teste_concluir", {
      _empresa: empresa,
      _ator: ator,
      _id: data.id,
      _message: id,
    });
    return "enviada";
  } catch {
    await rpcEmail("mimo_email_teste_concluir", {
      _empresa: empresa,
      _ator: ator,
      _id: data.id,
      _message: null,
    });
    return "incerta";
  }
}

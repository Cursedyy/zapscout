import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { exigirMimo } from "./mimo-leads.server";
import { normalizarTelefoneMimo } from "./mimo-leads";
import { hashTokenMimo } from "./mimo-whatsapp";
import {
  UazApiError,
  uazConnect,
  uazInitInstance,
  uazStatus,
  uazUpdateWebhook,
} from "./uazapi.server";
import { publicWebhookUrl } from "./whatsapp.functions";
export function servidorUazapiSeguro(valor = process.env.UAZAPI_BASE_URL) {
  try {
    const url = new URL(valor?.trim() ?? "");
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
export function qrSeguroMimo(qr: unknown) {
  if (!qr) return null;
  if (
    typeof qr !== "string" ||
    qr.length > 1_000_000 ||
    !/^(data:image\/png;base64,)?[A-Za-z0-9+/=\r\n]+$/.test(qr)
  )
    throw new UazApiError("resposta", "pareamento");
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}
export function mensagemFalhaConexaoMimo(
  error: unknown,
  etapa: "status" | "pareamento" | "webhook" | "criar instância",
) {
  const prefixo = `Não foi possível concluir ${etapa === "status" ? "a consulta de status" : etapa === "webhook" ? "a configuração do recebimento" : etapa === "criar instância" ? "a criação da instância" : "o pareamento"}.`;
  if (!(error instanceof UazApiError)) return prefixo + " Tente novamente.";
  if (error.tipo === "configuracao")
    return prefixo + " A configuração do serviço precisa ser conferida na hospedagem.";
  if (error.tipo === "tempo")
    return prefixo + " O servidor de WhatsApp não respondeu dentro do prazo.";
  if (error.tipo === "rede")
    return (
      prefixo +
      " A hospedagem não conseguiu conectar ao servidor de WhatsApp. Confira o endereço UAZAPI_BASE_URL e a comunicação com o serviço."
    );
  if (error.tipo === "resposta")
    return prefixo + " O serviço retornou uma resposta incompatível com a integração.";
  if (error.status === 401 || error.status === 403)
    return (
      prefixo +
      ` O servidor recusou a credencial (HTTP ${error.status}). Confira se a credencial pertence ao servidor configurado.`
    );
  if (error.status === 404)
    return (
      prefixo + " A instância ou a rota não foi encontrada no servidor configurado (HTTP 404)."
    );
  if (error.status === 409)
    return (
      prefixo +
      " Já existe uma operação em andamento no servidor (HTTP 409). Atualize o status antes de tentar novamente."
    );
  if (error.status === 429)
    return (
      prefixo + " O serviço limitou as requisições (HTTP 429). Aguarde antes de tentar novamente."
    );
  return prefixo + ` O servidor respondeu HTTP ${error.status ?? "indisponível"}.`;
}
type Contexto = { supabase: SupabaseClient<Database>; userId: string };
export async function acessoConexaoMimo(c: Contexto) {
  const a = await exigirMimo(c.supabase, c.userId);
  if (a.papel !== "administrador")
    throw Error("Somente o administrador da MiMo pode gerenciar o WhatsApp.");
  return a;
}
export function numeroConectado(valor?: string | null) {
  try {
    return normalizarTelefoneMimo((valor ?? "").split("@")[0].split(":")[0]);
  } catch {
    return null;
  }
}
function assinatura(
  empresa: string,
  usuario: string,
  hash: string,
  numero: string,
  expira: string,
) {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw Error("Não foi possível preparar a confirmação do número.");
  return createHmac("sha256", chave)
    .update(
      JSON.stringify({ uso: "mimo-whatsapp-vincular-1", empresa, usuario, hash, numero, expira }),
    )
    .digest("hex");
}
export function desafioNumeroMimo(
  empresa: string,
  usuario: string,
  hash: string,
  numero: string,
  agora = Date.now(),
) {
  const expira = String(agora + 10 * 60_000);
  return `${expira}.${assinatura(empresa, usuario, hash, numero, expira)}`;
}
export function verificarDesafioNumeroMimo(
  desafio: string,
  empresa: string,
  usuario: string,
  hash: string,
  numero: string,
  agora = Date.now(),
) {
  const [expira, mac] = desafio.split(".");
  if (
    !/^\d+$/.test(expira ?? "") ||
    Number(expira) < agora ||
    Number(expira) > agora + 11 * 60_000 ||
    !/^[a-f0-9]{64}$/.test(mac ?? "")
  )
    throw Error("A confirmação expirou. Atualize a conexão e confira o número novamente.");
  if (
    !timingSafeEqual(
      Buffer.from(assinatura(empresa, usuario, hash, numero, expira), "hex"),
      Buffer.from(mac, "hex"),
    )
  )
    throw Error("O número ou a conexão mudou. Confira novamente antes de ativar.");
}
async function recursos(c: Contexto) {
  const a = await acessoConexaoMimo(c);
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return { a, db };
}
async function perfil(db: SupabaseClient<Database>, usuario: string) {
  const r = await db
    .from("profiles")
    .select("uazapi_instance_token,wa_provider,wa_method")
    .eq("id", usuario)
    .single();
  if (r.error || !r.data) throw Error("Não foi possível localizar sua conexão do ZapScout.");
  return r.data;
}
const compativel = (p: { wa_provider: string | null; wa_method: string | null }) =>
  (!p.wa_provider || p.wa_provider === "uazapi") && (!p.wa_method || p.wa_method === "qrcode");
async function identidade(db: SupabaseClient<Database>, usuario: string, token: string) {
  const [p, i] = await Promise.all([
    db.from("profiles").select("id").eq("uazapi_instance_token", token),
    db.from("uazapi_instancias").select("user_id").eq("token", token),
  ]);
  if (
    p.error ||
    i.error ||
    p.data?.length !== 1 ||
    p.data[0].id !== usuario ||
    i.data?.some((x) => x.user_id !== usuario)
  )
    throw Error("Não foi possível confirmar o proprietário desta conexão.");
}
export async function estadoConexaoMimo(c: Contexto) {
  const { a, db } = await recursos(c);
  const [p, vinculos] = await Promise.all([
    perfil(db, c.userId),
    c.supabase
      .from("mimo_whatsapp_vinculos")
      .select("id,numero_comercial,ativo,confirmado_em,owner_id")
      .eq("empresa_id", a.empresaId)
      .order("created_at", { ascending: false }),
  ]);
  if (vinculos.error) throw Error("Não foi possível carregar os números da MiMo.");
  const lista = (vinculos.data ?? []).map((v) => ({
    id: v.id,
    numero: v.numero_comercial,
    ativo: v.ativo,
    confirmadoEm: v.confirmado_em,
    minhaConexao: v.owner_id === c.userId,
  }));
  const disponivel =
    !!process.env.UAZAPI_BASE_URL &&
    !!process.env.UAZAPI_WEBHOOK_SECRET &&
    (!!p.uazapi_instance_token || !!process.env.UAZAPI_ADMIN_TOKEN);
  const base = {
    disponivel,
    servidor: servidorUazapiSeguro() ?? "Endereço não configurado ou inválido",
    compativel: compativel(p),
    vinculos: lista,
    status: "disconnected",
    numero: null as string | null,
    desafio: null as string | null,
    qrcode: null as string | null,
    erro: "",
  };
  if (!base.compativel || !p.uazapi_instance_token || !disponivel) return base;
  await identidade(db, c.userId, p.uazapi_instance_token);
  try {
    const s = await uazStatus(p.uazapi_instance_token, AbortSignal.timeout(7000));
    const numero = s.status === "connected" ? numeroConectado(s.profileNumber) : null;
    const hash = await hashTokenMimo(p.uazapi_instance_token);
    return {
      ...base,
      status: s.status,
      numero,
      qrcode: s.status === "connected" ? null : qrSeguroMimo(s.qrcode),
      desafio: numero ? desafioNumeroMimo(a.empresaId, c.userId, hash, numero) : null,
    };
  } catch (error) {
    return {
      ...base,
      status: "unknown",
      erro: mensagemFalhaConexaoMimo(error, "status"),
    };
  }
}
const emConexao = new Map<string, Promise<{ status: string; qrcode: string | null }>>();
export async function iniciarConexaoMimo(c: Contexto) {
  const { a, db } = await recursos(c);
  if (!process.env.UAZAPI_BASE_URL || !process.env.UAZAPI_WEBHOOK_SECRET)
    throw Error("O serviço de WhatsApp precisa ser configurado pela administração do ZapScout.");
  const existente = emConexao.get(c.userId);
  if (existente) return existente;
  const tarefa = (async () => {
    let p = await perfil(db, c.userId);
    if (!compativel(p))
      throw Error(
        "Sua conta usa outro provedor de WhatsApp. A conexão por QR Code da MiMo usa o ZapScout Cloud.",
      );
    let tokenRecusado: string | null = null;
    if (p.uazapi_instance_token) {
      await identidade(db, c.userId, p.uazapi_instance_token);
      try {
        const atual = await uazStatus(p.uazapi_instance_token, AbortSignal.timeout(7000));
        if (atual.status === "connected") return { status: atual.status, qrcode: null };
      } catch (error) {
        if (error instanceof UazApiError && error.tipo === "http" && error.status === 401) {
          tokenRecusado = p.uazapi_instance_token;
        } else {
          throw Error(mensagemFalhaConexaoMimo(error, "status"));
        }
      }
    }
    if (!p.uazapi_instance_token || tokenRecusado) {
      let criada: { token: string };
      try {
        criada = await uazInitInstance(`zapscout_${c.userId.slice(0, 8)}`);
      } catch (error) {
        throw Error(mensagemFalhaConexaoMimo(error, "criar instância"));
      }
      let gravar = db
        .from("profiles")
        .update({
          uazapi_instance_token: criada.token,
          uazapi_instance_status: "connecting",
          wa_provider: "uazapi",
          wa_method: "qrcode",
        })
        .eq("id", c.userId);
      gravar = tokenRecusado
        ? gravar.eq("uazapi_instance_token", tokenRecusado)
        : gravar.is("uazapi_instance_token", null);
      gravar =
        p.wa_provider === null
          ? gravar.is("wa_provider", null)
          : gravar.eq("wa_provider", p.wa_provider);
      gravar =
        p.wa_method === null ? gravar.is("wa_method", null) : gravar.eq("wa_method", p.wa_method);
      const salvo = await gravar.select("id").maybeSingle();
      if (salvo.error) throw Error("Não foi possível registrar a conexão.");
      p = await perfil(db, c.userId);
      if (!compativel(p))
        throw Error("A configuração mudou em outra tela. Nenhuma conexão foi substituída.");
    }
    const token = p.uazapi_instance_token;
    if (!token) throw Error("Conexão indisponível.");
    await identidade(db, c.userId, token);
    const hash = await hashTokenMimo(token);
    const hashes = tokenRecusado ? [hash, await hashTokenMimo(tokenRecusado)] : [hash];
    const pausa = await db
      .from("mimo_whatsapp_vinculos")
      .update({ ativo: false })
      .eq("empresa_id", a.empresaId)
      .eq("owner_id", c.userId)
      .in("token_sha256", hashes);
    if (pausa.error) throw Error("Não foi possível preparar a captura com segurança.");
    try {
      await uazUpdateWebhook(token, publicWebhookUrl(), ["messages"]);
    } catch (error) {
      throw Error(mensagemFalhaConexaoMimo(error, "webhook"));
    }
    try {
      const s = await uazConnect(token);
      return { status: s.status, qrcode: qrSeguroMimo(s.qrcode) };
    } catch (error) {
      throw Error(mensagemFalhaConexaoMimo(error, "pareamento"));
    }
  })();
  emConexao.set(c.userId, tarefa);
  try {
    return await tarefa;
  } finally {
    if (emConexao.get(c.userId) === tarefa) emConexao.delete(c.userId);
  }
}
export async function ativarConexaoMimo(c: Contexto, numero: string, desafio: string) {
  const { a, db } = await recursos(c),
    p = await perfil(db, c.userId);
  if (!p.uazapi_instance_token || !compativel(p) || !process.env.UAZAPI_WEBHOOK_SECRET)
    throw Error("Conecte o WhatsApp por QR Code antes de ativar a captura.");
  await identidade(db, c.userId, p.uazapi_instance_token);
  let atual;
  try {
    atual = await uazStatus(p.uazapi_instance_token, AbortSignal.timeout(7000));
  } catch {
    throw Error("Não foi possível conferir o número conectado. Atualize o status.");
  }
  const confirmado = numeroConectado(atual.profileNumber),
    hash = await hashTokenMimo(p.uazapi_instance_token);
  if (atual.status !== "connected" || !confirmado || numero !== confirmado)
    throw Error("O número conectado mudou. Confira e confirme novamente.");
  verificarDesafioNumeroMimo(desafio, a.empresaId, c.userId, hash, confirmado);
  const anterior = await db
    .from("mimo_whatsapp_vinculos")
    .select("id,empresa_id,owner_id,instancia_id")
    .eq("token_sha256", hash)
    .maybeSingle();
  if (
    anterior.error ||
    (anterior.data &&
      (anterior.data.empresa_id !== a.empresaId ||
        anterior.data.owner_id !== c.userId ||
        anterior.data.instancia_id !== null))
  )
    throw Error("Esta conexão já possui outro vínculo. Nenhuma configuração foi substituída.");
  try {
    await uazUpdateWebhook(p.uazapi_instance_token, publicWebhookUrl(), ["messages"]);
  } catch {
    throw Error("Não foi possível ativar o recebimento de mensagens.");
  }
  await acessoConexaoMimo(c);
  const dados = {
    empresa_id: a.empresaId,
    owner_id: c.userId,
    instancia_id: null,
    numero_comercial: confirmado,
    token_sha256: hash,
    ativo: true,
    confirmado_por: c.userId,
    confirmado_em: new Date().toISOString(),
  };
  const salvo = anterior.data
    ? await db
        .from("mimo_whatsapp_vinculos")
        .update(dados)
        .eq("empresa_id", a.empresaId)
        .eq("owner_id", c.userId)
        .eq("id", anterior.data.id)
        .select("id")
        .single()
    : await db.from("mimo_whatsapp_vinculos").insert(dados).select("id").single();
  if (salvo.error || !salvo.data)
    throw Error("Não foi possível ativar a captura. Atualize a página e confira o vínculo.");
  await db
    .from("mimo_whatsapp_diagnosticos")
    .insert({ empresa_id: a.empresaId, vinculo_id: salvo.data.id, codigo: "captura_ativada" });
  return { ativo: true };
}
export async function pausarConexaoMimo(c: Contexto, id: string) {
  const { a, db } = await recursos(c);
  const r = await db
    .from("mimo_whatsapp_vinculos")
    .update({ ativo: false })
    .eq("empresa_id", a.empresaId)
    .eq("id", id)
    .select("id")
    .single();
  if (r.error || !r.data) throw Error("Vínculo indisponível.");
  await db
    .from("mimo_whatsapp_diagnosticos")
    .insert({ empresa_id: a.empresaId, vinculo_id: id, codigo: "captura_pausada" });
  return { ativo: false };
}

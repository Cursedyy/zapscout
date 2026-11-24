import { describe, expect, it } from "vitest";
import { assuntoCriativoAgente, configInicialAgente, contextoCriativoAgente, respostaDeterministicaAgente } from "./mimo-agente";
import { referenciaAnuncioMimo } from "./mimo-whatsapp";

const base = { sourceId: "ad_sintetico_1", sourceUrl: "https://fb.me/sintetico", sourceType: "ad" };
const uaz = (ref: Record<string, unknown>, json = false) => {
  const content = { text: "Olá bom dia", contextInfo: { externalAdReply: ref } };
  return { messageid: "m1", chatid: "5511900000000@s.whatsapp.net", content: json ? JSON.stringify(content) : content };
};
const ola = [{ role: "user" as const, content: "Olá bom dia" }];

describe("criativo de origem do anúncio", () => {
  it("lê título/descrição do conteúdo bruto da UAZAPI (objeto e JSON)", () => {
    const ref = { ...base, title: "Distribua MiMo! Procuramos distribuidores", body: "Seja revendedor" };
    for (const json of [false, true]) {
      const r = referenciaAnuncioMimo(uaz(ref, json));
      expect(r).toMatchObject({ id: "ad_sintetico_1", titulo: "Distribua MiMo! Procuramos distribuidores", tipo: "ad", fonte: "metadado_whatsapp" });
    }
  });
  it("aceita referral da Cloud API com headline", () => {
    const r = referenciaAnuncioMimo({ referral: { source_id: "x", source_url: "https://www.instagram.com/p/x", headline: "Revenda MiMo", source_type: "ad" } });
    expect(assuntoCriativoAgente(r)).toBe("revenda");
  });
  it("classifica criativos diferentes e não adivinha quando ambíguo ou ausente", () => {
    const a = (titulo?: string) => assuntoCriativoAgente({ id: "x", url: "https://fb.me/x", fonte: "metadado_whatsapp", ...(titulo ? { titulo } : {}) });
    expect(a("Procuramos distribuidores")).toBe("revenda");
    expect(a("Seja representante comercial MiMo")).toBe("representacao");
    expect(a("Chamada para influenciadores")).toBe("influencia");
    expect(a("Conheça nossos biscoitos")).toBeNull();
    expect(a("Revenda ou seja representante")).toBeNull();
    expect(a()).toBeNull();
    expect(assuntoCriativoAgente({ titulo: "Procuramos distribuidores" })).toBeNull();
    expect(assuntoCriativoAgente(null)).toBeNull();
    expect(referenciaAnuncioMimo({ content: { text: "oi" } })).toBeNull();
  });
  it("criativo de distribuidores abre a conversa de revenda", () => {
    const r = respostaDeterministicaAgente(configInicialAgente, ola, {}, false, true, false, "revenda");
    expect(r?.resposta).toMatch(/distribuição e revenda/);
    expect(r?.resposta).not.toMatch(/ou ser representante\?/);
  });
  it("sem metadado faz só a pergunta curta, sem fabricar origem", () => {
    const r = respostaDeterministicaAgente(configInicialAgente, ola, {}, false, true, false, null);
    expect(r?.resposta).toMatch(/Gostaria de revender nossa marca ou ser representante\?/);
    expect(r?.resposta).not.toMatch(/distribui/);
    expect(contextoCriativoAgente(null)).toBe("");
  });
  it("pedido explícito pelo marketing prevalece sobre criativo de revenda", () => {
    const m = [...ola, { role: "assistant" as const, content: "Bom dia, tudo bem? Que bom que você se interessou pela distribuição e revenda MiMo." }, { role: "user" as const, content: "Gostaria de falar no setor de marketing" }];
    const r = respostaDeterministicaAgente(configInicialAgente, m, {}, false, true, false, "revenda");
    expect(r?.motivo).toBe("parceria_influencia");
  });
});

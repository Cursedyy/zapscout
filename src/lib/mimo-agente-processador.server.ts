import type { ConfigAgente, ResultadoAgente } from "./mimo-agente";
export type DependenciasAgente = {
  config: ConfigAgente;
  gerar: () => Promise<ResultadoAgente | null>;
  validar: () => Promise<boolean>;
  presenca: (ativa: boolean) => Promise<void>;
  esperar: (ms: number) => Promise<void>;
  agora?: () => number;
  remetente: () => Promise<boolean>;
  autorizar: (r: ResultadoAgente) => Promise<boolean>;
  enviar: (texto: string) => Promise<string | null>;
  concluir: (estado: "enviada" | "incerta" | "falha" | "cancelar", id?: string, motivo?: string) => Promise<void>;
};
// Dependency boundary lets concurrency tests stop processing at every external await.
export async function processarRespostaAgente(d: DependenciasAgente) {
  let etapa = "validacao";
  // Retry only read-only checks on a transport exception, never a refusal or a send.
  async function conferir(nome: string, ler: () => Promise<boolean>) {
    etapa = nome;
    try {
      return await ler();
    } catch {
      await d.esperar(300);
      return ler();
    }
  }
  const validar = () => conferir("validacao", d.validar);
  const remetente = () => conferir("remetente", d.remetente);
  let autorizado = false;
  try {
    if (!(await validar())) {
      await d.concluir("cancelar");
      return;
    }
    etapa = "preparo_resposta";
    const r = await d.gerar();
    if (!r || !(await validar())) {
      await d.concluir("cancelar");
      return;
    }
    if (!(await remetente())) throw Error("agente_remetente_divergente");
    if (!(await validar())) {
      await d.concluir("cancelar");
      return;
    }
    // Owner's decision (27/11/2026): reply right away, with no simulated "typing" wait.
    // The digitando* settings stay in the versioned config but no longer delay the send.
    // Identity and atomic authorization are repeated just before sending; no provider delay.
    if (!(await remetente())) throw Error("agente_remetente_divergente");
    etapa = "autorizacao";
    if (!(await d.autorizar(r))) {
      await d.concluir("cancelar");
      return;
    }
    autorizado = true;
    etapa = "envio";
    const id = await d.enviar(r.resposta);
    etapa = "confirmacao";
    await d.concluir(id ? "enviada" : "incerta", id ?? undefined);
  } catch (error) {
    const nome = error instanceof Error ? error.name : "";
    const motivo = etapa + "_" + (/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(nome) ? nome : "Error");
    await d.concluir(autorizado ? "incerta" : "falha", undefined, motivo);
  }
}

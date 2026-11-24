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
  const agora = d.agora ?? (() => performance.now());
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
  let autorizado = false,
    presenca = false;
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
    if (d.config.digitando) {
      presenca = true;
      await d.presenca(true).catch(() => {});
      const duracao = Math.min(
        d.config.digitandoMaxMs,
        Math.max(2500, d.config.digitandoMinMs, r.resposta.length * 25),
      );
      const inicio = agora();
      while (agora() - inicio < duracao) {
        await d.esperar(Math.min(250, duracao - (agora() - inicio)));
        if (!(await validar())) {
          await d.concluir("cancelar");
          return;
        }
      }
      // Keep composing visible through final identity and authorization checks.
      // Sending clears it at the provider; finally also clears every canceled path.
    }
    // Identity and atomic authorization are repeated after typing; send has no provider delay.
    if (!(await remetente())) throw Error("agente_remetente_divergente");
    // Refresh the bounded presence lease after slow identity checks, before authorization.
    if (presenca) await d.presenca(true).catch(() => {});
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
  } finally {
    if (presenca) await d.presenca(false).catch(() => {});
  }
}

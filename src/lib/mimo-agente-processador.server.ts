import type { ConfigAgente, ResultadoAgente } from "./mimo-agente";
export type DependenciasAgente = {
  config: ConfigAgente;
  gerar: () => Promise<ResultadoAgente>;
  validar: () => Promise<boolean>;
  presenca: (ativa: boolean) => Promise<void>;
  esperar: (ms: number) => Promise<void>;
  remetente: () => Promise<boolean>;
  autorizar: (r: ResultadoAgente) => Promise<boolean>;
  enviar: (texto: string) => Promise<string | null>;
  concluir: (estado: "enviada" | "incerta" | "falha" | "cancelar", id?: string) => Promise<void>;
};
// Dependency boundary lets concurrency tests stop processing at every external await.
export async function processarRespostaAgente(d: DependenciasAgente) {
  let autorizado = false,
    presenca = false;
  try {
    if (!(await d.validar())) {
      await d.concluir("cancelar");
      return;
    }
    const r = await d.gerar();
    if (!(await d.validar())) {
      await d.concluir("cancelar");
      return;
    }
    if (!(await d.remetente())) throw Error("agente_remetente_divergente");
    if (!(await d.validar())) {
      await d.concluir("cancelar");
      return;
    }
    if (d.config.digitando) {
      presenca = true;
      await d.presenca(true);
      const duracao = Math.min(
        d.config.digitandoMaxMs,
        Math.max(d.config.digitandoMinMs, r.resposta.length * 25),
      );
      for (let t = 0; t < duracao; t += 250) {
        await d.esperar(Math.min(250, duracao - t));
        if (!(await d.validar())) {
          await d.concluir("cancelar");
          return;
        }
      }
      await d.presenca(false);
      presenca = false;
    }
    // Identity and atomic authorization are repeated after typing; send has no provider delay.
    if (!(await d.remetente())) throw Error("agente_remetente_divergente");
    if (!(await d.autorizar(r))) {
      await d.concluir("cancelar");
      return;
    }
    autorizado = true;
    const id = await d.enviar(r.resposta);
    await d.concluir(id ? "enviada" : "incerta", id ?? undefined);
  } catch {
    await d.concluir(autorizado ? "incerta" : "falha");
  } finally {
    if (presenca) await d.presenca(false).catch(() => {});
  }
}

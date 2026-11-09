import { it, expect, vi } from "vitest";
import { processarRespostaAgente, type DependenciasAgente } from "./mimo-agente-processador.server";
import { configInicialAgente, finalizarResultadoAgente } from "./mimo-agente";
function deps(): DependenciasAgente {
  return {
    config: { ...configInicialAgente, digitandoMinMs: 1500, digitandoMaxMs: 1500 },
    gerar: vi.fn(async () =>
      finalizarResultadoAgente(
        configInicialAgente,
        [{ role: "user", content: "oi" }],
        {},
        { resposta: "Olá! Qual seu interesse?", dados: {}, encaminhar: false },
      ),
    ),
    validar: vi.fn(async () => true),
    presenca: vi.fn(async () => {}),
    esperar: vi.fn(async () => {}),
    remetente: vi.fn(async () => true),
    autorizar: vi.fn(async () => true),
    enviar: vi.fn(async () => "provider-id"),
    concluir: vi.fn(async () => {}),
  };
}
it("envia uma vez, sem delay no envio, após autorização final", async () => {
  const d = deps();
  await processarRespostaAgente(d);
  expect(d.enviar).toHaveBeenCalledTimes(1);
  expect(d.presenca).toHaveBeenNthCalledWith(1, true);
  expect(d.presenca).toHaveBeenNthCalledWith(2, false);
  expect(d.concluir).toHaveBeenCalledWith("enviada", "provider-id");
});
it("nova mensagem durante geração descarta resposta", async () => {
  const d = deps();
  vi.mocked(d.validar).mockResolvedValueOnce(true).mockResolvedValue(false);
  await processarRespostaAgente(d);
  expect(d.enviar).not.toHaveBeenCalled();
  expect(d.concluir).toHaveBeenCalledWith("cancelar");
});
it("assumir durante digitando cancela presença e envio", async () => {
  const d = deps();
  vi.mocked(d.validar)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true)
    .mockResolvedValue(false);
  await processarRespostaAgente(d);
  expect(d.presenca).toHaveBeenLastCalledWith(false);
  expect(d.enviar).not.toHaveBeenCalled();
});
it("pausa ou versão alterada na autorização impede envio", async () => {
  const d = deps();
  vi.mocked(d.autorizar).mockResolvedValue(false);
  await processarRespostaAgente(d);
  expect(d.enviar).not.toHaveBeenCalled();
  expect(d.concluir).toHaveBeenCalledWith("cancelar");
});
it.each([null, undefined])("aceite sem ID é incerto e não se repete", async (id) => {
  const d = deps();
  vi.mocked(d.enviar).mockResolvedValue(id ?? null);
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("incerta", undefined);
  expect(d.enviar).toHaveBeenCalledTimes(1);
});
it("erro após envio não repete a mensagem", async () => {
  const d = deps();
  vi.mocked(d.enviar).mockRejectedValue(Error("rede"));
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("incerta");
  expect(d.enviar).toHaveBeenCalledTimes(1);
});
it("falha de modelo entrega à equipe", async () => {
  const d = deps();
  vi.mocked(d.gerar).mockRejectedValue(Error("limite"));
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("falha");
  expect(d.enviar).not.toHaveBeenCalled();
});

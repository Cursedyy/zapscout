import { it, expect, vi } from "vitest";
import { processarRespostaAgente, type DependenciasAgente } from "./mimo-agente-processador.server";
import { configInicialAgente, finalizarResultadoAgente } from "./mimo-agente";
import { ErroIAAgente } from "./mimo-agente-diagnostico";
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
it("mantém Digitando visível até enviar e limpa presença depois do aceite", async () => {
  const d = deps();
  const ordem: string[] = [];
  d.presenca = vi.fn(async (ativa) => { ordem.push(ativa ? "digitando" : "parado"); });
  d.autorizar = vi.fn(async () => { ordem.push("autorizar"); return true; });
  d.enviar = vi.fn(async () => { ordem.push("enviar"); return "provider-id"; });
  await processarRespostaAgente(d);
  expect(ordem).toEqual(["digitando", "autorizar", "enviar", "parado"]);
});
it("desliga Digitando se a identidade mudar durante a conferência final", async () => {
  const d = deps();
  vi.mocked(d.remetente).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await processarRespostaAgente(d);
  expect(d.presenca).toHaveBeenLastCalledWith(false);
  expect(d.enviar).not.toHaveBeenCalled();
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
  expect(d.concluir).toHaveBeenCalledWith("incerta", undefined, "processamento_falhou");
  expect(d.enviar).toHaveBeenCalledTimes(1);
});
it("falha de modelo entrega à equipe", async () => {
  const d = deps();
  vi.mocked(d.gerar).mockRejectedValue(Error("limite"));
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("falha", undefined, "processamento_falhou");
  expect(d.enviar).not.toHaveBeenCalled();
});
it("registra falta de crédito sem enviar, repetir ou mascarar como falha genérica", async () => {
  const d = deps();
  vi.mocked(d.gerar).mockRejectedValue(new ErroIAAgente("ia_creditos_esgotados"));
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("falha", undefined, "ia_creditos_esgotados");
  expect(d.gerar).toHaveBeenCalledTimes(1);
  expect(d.enviar).not.toHaveBeenCalled();
});

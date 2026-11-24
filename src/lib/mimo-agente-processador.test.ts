import { it, expect, vi } from "vitest";
import { processarRespostaAgente, type DependenciasAgente } from "./mimo-agente-processador.server";
import { configInicialAgente, finalizarResultadoAgente } from "./mimo-agente";
function deps(): DependenciasAgente {
  let tempo = 0;
  return {
    agora: () => tempo,
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
    esperar: vi.fn(async (ms) => { tempo += ms; }),
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
  expect(d.presenca).toHaveBeenNthCalledWith(3, false);
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
  expect(d.concluir).toHaveBeenCalledWith("incerta", undefined, "envio_Error");
  expect(d.enviar).toHaveBeenCalledTimes(1);
});
it("falha de modelo entrega à equipe", async () => {
  const d = deps();
  vi.mocked(d.gerar).mockRejectedValue(Error("limite"));
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("falha", undefined, "preparo_resposta_Error");
  expect(d.enviar).not.toHaveBeenCalled();
});

it("mantém Digitando visível até enviar e limpa presença depois do aceite", async () => {
  const d = deps();
  const ordem: string[] = [];
  d.presenca = vi.fn(async (ativa) => { ordem.push(ativa ? "digitando" : "parado"); });
  d.autorizar = vi.fn(async () => { ordem.push("autorizar"); return true; });
  d.enviar = vi.fn(async () => { ordem.push("enviar"); return "provider-id"; });
  await processarRespostaAgente(d);
  expect(ordem).toEqual(["digitando", "digitando", "autorizar", "enviar", "parado"]);
});
it("desliga Digitando se a identidade mudar durante a conferência final", async () => {
  const d = deps();
  vi.mocked(d.remetente).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await processarRespostaAgente(d);
  expect(d.presenca).toHaveBeenLastCalledWith(false);
  expect(d.enviar).not.toHaveBeenCalled();
});

it("conta o tempo das consultas para não alongar a simulação além da presença", async () => {
  const d = deps();
  let tempo = 0;
  d.config.digitandoMinMs = 8000;
  d.config.digitandoMaxMs = 8000;
  d.agora = () => tempo;
  d.esperar = vi.fn(async (ms) => { tempo += ms; });
  d.validar = vi.fn(async () => { tempo += 1500; return true; });
  const inicio: number[] = [];
  d.presenca = vi.fn(async (ativa) => { if (ativa) inicio.push(tempo); });
  await processarRespostaAgente(d);
  expect(inicio[1] - inicio[0]).toBeLessThan(10000);
  expect(d.enviar).toHaveBeenCalledTimes(1);
});
it("renova a presença após conferência lenta sem adiar o envio autorizado", async () => {
  const d = deps();
  let tempo = 0;
  let ate = 0;
  let chamadas = 0;
  d.agora = () => tempo;
  d.esperar = vi.fn(async (ms) => { tempo += ms; });
  d.remetente = vi.fn(async () => { if (++chamadas === 2) tempo += 16000; return true; });
  d.presenca = vi.fn(async (ativa) => { ate = ativa ? tempo + 15000 : 0; });
  d.autorizar = vi.fn(async () => { expect(ate).toBeGreaterThan(tempo); return true; });
  d.enviar = vi.fn(async () => { expect(ate).toBeGreaterThan(tempo); return "provider-id"; });
  await processarRespostaAgente(d);
  expect(d.enviar).toHaveBeenCalledTimes(1);
  expect(ate).toBe(0);
});
it("falha no indicador de digitação mantém o envio autorizado", async () => {
  const d = deps();
  vi.mocked(d.presenca).mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("presenca"));
  await processarRespostaAgente(d);
  expect(d.presenca).toHaveBeenLastCalledWith(false);
  expect(d.autorizar).toHaveBeenCalledTimes(1);
  expect(d.enviar).toHaveBeenCalledTimes(1);
});
it("recupera uma consulta transitória antes do envio e respeita a nova validação", async () => {
  const d = deps();
  vi.mocked(d.validar).mockRejectedValueOnce(Error("rede")).mockResolvedValueOnce(false);
  await processarRespostaAgente(d);
  expect(d.concluir).toHaveBeenCalledWith("cancelar");
  expect(d.enviar).not.toHaveBeenCalled();
});
it("recupera a consulta de identidade sem repetir o envio", async () => {
  const d = deps();
  vi.mocked(d.remetente).mockRejectedValueOnce(Error("rede"));
  await processarRespostaAgente(d);
  expect(d.enviar).toHaveBeenCalledTimes(1);
  expect(d.concluir).toHaveBeenCalledWith("enviada", "provider-id");
});
it("configuração sem Digitando envia sem presença e sem espera", async () => {
  const d = deps();
  d.config.digitando = false;
  await processarRespostaAgente(d);
  expect(d.presenca).not.toHaveBeenCalled();
  expect(d.esperar).not.toHaveBeenCalled();
  expect(d.enviar).toHaveBeenCalledTimes(1);
});

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
it("nova mensagem durante geração descarta resposta", async () => {
  const d = deps();
  vi.mocked(d.validar).mockResolvedValueOnce(true).mockResolvedValue(false);
  await processarRespostaAgente(d);
  expect(d.enviar).not.toHaveBeenCalled();
  expect(d.concluir).toHaveBeenCalledWith("cancelar");
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
it("envia uma vez, logo após a autorização final, sem Digitando nem espera", async () => {
  const d = deps();
  expect(d.config.digitando).toBe(true);
  const ordem: string[] = [];
  d.autorizar = vi.fn(async () => { ordem.push("autorizar"); return true; });
  d.enviar = vi.fn(async () => { ordem.push("enviar"); return "provider-id"; });
  await processarRespostaAgente(d);
  expect(ordem).toEqual(["autorizar", "enviar"]);
  expect(d.presenca).not.toHaveBeenCalled();
  expect(d.esperar).not.toHaveBeenCalled();
  expect(d.concluir).toHaveBeenCalledWith("enviada", "provider-id");
});
it("não envia se a identidade mudar na conferência final", async () => {
  const d = deps();
  vi.mocked(d.remetente).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await processarRespostaAgente(d);
  expect(d.enviar).not.toHaveBeenCalled();
  expect(d.concluir).toHaveBeenCalledWith("falha", undefined, "remetente_Error");
});

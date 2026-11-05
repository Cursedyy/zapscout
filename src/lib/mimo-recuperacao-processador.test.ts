import { expect, it, vi } from "vitest";
import {
  processarLembreteMimo,
  type DependenciasRecuperacao,
} from "./mimo-recuperacao-processador.server";
const dentro = new Date("2026-11-06T13:00:00Z");
function preparar(): DependenciasRecuperacao {
  return {
    reservar: vi.fn(async () => ({ id: "fila", reserva: "reserva" })),
    preparar: vi.fn(async () => ({ telefone: "5511999999999", texto: "Sintético" })),
    conferirCompra: vi.fn(async () => false),
    autorizar: vi.fn(async () => true),
    bloquear: vi.fn(async () => {}),
    enviar: vi.fn(async () => ({ messageId: "aceito" })),
    concluir: vi.fn(async () => {}),
    incerto: vi.fn(async () => {}),
  };
}
it("permite processamento também à noite", async () => {
  const d = preparar();
  expect(await processarLembreteMimo(d, new Date("2026-11-06T23:00:00Z"))).toBe("enviada");
  expect(d.reservar).toHaveBeenCalledOnce();
  expect(d.enviar).toHaveBeenCalledOnce();
});
it("consulta canônica falhou: nenhum envio é autorizado", async () => {
  const d = preparar();
  vi.mocked(d.conferirCompra).mockRejectedValue(Error("rede"));
  await expect(processarLembreteMimo(d, dentro)).rejects.toThrow("rede");
  expect(d.autorizar).not.toHaveBeenCalled();
  expect(d.enviar).not.toHaveBeenCalled();
});
it("compra identificada bloqueia o lembrete", async () => {
  const d = preparar();
  vi.mocked(d.conferirCompra).mockResolvedValue(true);
  expect(await processarLembreteMimo(d, dentro)).toBe("bloqueada");
  expect(d.bloquear).toHaveBeenCalledWith(
    { id: "fila", reserva: "reserva" },
    "compra_identificada",
  );
  expect(d.enviar).not.toHaveBeenCalled();
});
it("supressão na verificação final impede envio", async () => {
  const d = preparar();
  vi.mocked(d.autorizar).mockResolvedValue(false);
  expect(await processarLembreteMimo(d, dentro)).toBe("bloqueada");
  expect(d.enviar).not.toHaveBeenCalled();
});
it.each(["timeout", "sem_id", "persistencia"])(
  "aceite ambíguo (%s) nunca é repetido",
  async (tipo) => {
    const d = preparar();
    if (tipo === "timeout") vi.mocked(d.enviar).mockRejectedValue(Error("rede"));
    if (tipo === "sem_id") vi.mocked(d.enviar).mockResolvedValue({ messageId: null });
    if (tipo === "persistencia") vi.mocked(d.concluir).mockRejectedValue(Error("banco"));
    expect(await processarLembreteMimo(d, dentro)).toBe("incerta");
    expect(d.enviar).toHaveBeenCalledTimes(1);
    expect(d.incerto).toHaveBeenCalledOnce();
  },
);
it("envia somente depois de consultar compra e autorizar no banco", async () => {
  const d = preparar();
  expect(await processarLembreteMimo(d, dentro)).toBe("enviada");
  expect(vi.mocked(d.preparar).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(d.conferirCompra).mock.invocationCallOrder[0],
  );
  expect(vi.mocked(d.conferirCompra).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(d.autorizar).mock.invocationCallOrder[0],
  );
  expect(vi.mocked(d.autorizar).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(d.enviar).mock.invocationCallOrder[0],
  );
  expect(d.concluir).toHaveBeenCalledWith({ id: "fila", reserva: "reserva" }, "aceito");
});

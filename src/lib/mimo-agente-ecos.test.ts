import { expect, it } from "vitest";
import { idEnvioMimo } from "./mimo-whatsapp";
it("reconcilia ID do envio e do eco somente para o remetente confirmado", () => {
  expect(idEnvioMimo("5511888888888:3EB0SINTETICO", "5511888888888")).toBe("3EB0SINTETICO");
  expect(idEnvioMimo("3EB0SINTETICO", "5511888888888")).toBe("3EB0SINTETICO");
  expect(idEnvioMimo("5511777777777:3EB0SINTETICO", "5511888888888")).toBe("5511777777777:3EB0SINTETICO");
  expect(idEnvioMimo("5511888888888:outra:mensagem", "5511888888888")).toBe("5511888888888:outra:mensagem");
  expect(idEnvioMimo("5511888888888:", "5511888888888")).toBe("5511888888888:");
  expect(idEnvioMimo("5511888888888:3EB0SINTETICO", "invalido")).toBe("5511888888888:3EB0SINTETICO");
});

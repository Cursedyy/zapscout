import { expect, it } from "vitest";
import { buildCodexTask, codexRequestSchema, consumirCodex, lerSseCodex } from "./mimo-codex";
const encoder = new TextEncoder();
const fluxo = (texto: string, tamanho = 1) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const bytes = encoder.encode(texto);
      for (let n = 0; n < bytes.length; n += tamanho) c.enqueue(bytes.slice(n, n + tamanho));
      c.close();
    },
  });
it("reaproveita tarefa limitada, recusa edição vazia, dados ocultos e campos privilegiados", () => {
  const base = { mode: "generate", prompt: "Gere uma função de soma." };
  expect(codexRequestSchema.parse(base).language).toBe("typescript");
  for (const v of [
    { ...base, mode: "edit" },
    { ...base, code: "oculto" },
    { ...base, tools: [] },
    { ...base, prompt: "x".repeat(4001) },
    { ...base, mode: "edit", code: "x".repeat(20001) },
  ])
    expect(codexRequestSchema.safeParse(v).success).toBe(false);
  const task = buildCodexTask(
    codexRequestSchema.parse({ ...base, mode: "edit", code: "const x = 1;" }),
  );
  expect(task).toContain("CÓDIGO ATUAL");
  expect(task).toContain("texto revisável");
});
it("decodifica UTF-8 fragmentado, CRLF, comentários e data multilinha", async () => {
  const frames = [];
  for await (const f of lerSseCodex(
    fluxo(': keepalive\r\nevent: delta\r\ndata: {"type":"delta",\r\ndata: "text":"ação"}\r\n\r\n'),
  ))
    frames.push(f);
  expect(frames).toEqual([{ event: "delta", data: '{"type":"delta",\n"text":"ação"}' }]);
});
it("consome somente texto e exige terminal explícito", async () => {
  const delta = 'event: delta\ndata: {"type":"delta","text":"const ok = true;"}\n\n';
  let texto = "";
  await consumirCodex(
    fluxo(delta + 'event: complete\ndata: {"type":"complete"}\n\n'),
    (d) => (texto += d),
    new AbortController().signal,
  );
  expect(texto).toBe("const ok = true;");
  await expect(consumirCodex(fluxo(delta), () => {}, new AbortController().signal)).rejects.toThrow(
    /incompleta/,
  );
});
it.each([
  'event: delta\ndata: {"type":"delta","text":"truncado"}',
  "event: delta\ndata: {malformado}\n\n",
  'event: complete\ndata: {"type":"complete"}\n\n',
  'event: delta\ndata: {"type":"error","message":"interno"}\n\n',
])("não converte transmissão inválida em sucesso %#", async (conteudo) => {
  await expect(
    consumirCodex(fluxo(conteudo, 11), () => {}, new AbortController().signal),
  ).rejects.toThrow();
});
it("limita frame e respeita cancelamento", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await expect(consumirCodex(fluxo(""), () => {}, ctrl.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  const excessivo = `data: ${"x".repeat(256 * 1024 + 1)}`;
  await expect(
    consumirCodex(fluxo(excessivo, 10000), () => {}, new AbortController().signal),
  ).rejects.toThrow(/limite/);
});

import { describe, it, expect } from "vitest";
import { pedidoAnexo, assinaturaAnexo } from "./ia-anexos";
describe("anexos solicitados pelo cliente", () => {
  it("seleciona catálogo quando solicitado", () => { expect(pedidoAnexo("Pode me mandar o catálogo?" )).toBe("catalogo"); expect(pedidoAnexo("Quero o PDF")).toBe("catalogo"); });
  it("seleciona imagens quando solicitadas", () => { expect(pedidoAnexo("Quero ver fotos dos produtos")).toBe("imagem"); });
  it("não envia anexos sem solicitação ou quando recusados", () => { expect(pedidoAnexo("Oi, tudo bem?")).toBeNull(); expect(pedidoAnexo("Não quero catálogo")).toBeNull(); expect(pedidoAnexo("Não mande fotos")).toBeNull(); });
  it("rejeita arquivos disfarçados e aceita cabeçalhos PDF e PNG", () => {
    expect(assinaturaAnexo(new TextEncoder().encode("<script>"), "application/pdf")).toBe(false);
    expect(assinaturaAnexo(new TextEncoder().encode("%PDF-1.4"), "application/pdf")).toBe(true);
    expect(assinaturaAnexo(new Uint8Array([137,80,78,71,13,10,26,10]), "image/png")).toBe(true);
  });
});
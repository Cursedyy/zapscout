import { describe, expect, it } from "vitest";
import { configInicialAgente, respostaDeterministicaAgente } from "./mimo-agente";
import { mensagemRevenda, revendaSchema } from "./mimo-revenda";
import { respostaFichaRevendaAgente, resumoFichaRevendaAgente, validarFichaRevendaAgente } from "./mimo-agente-revenda";
import type { FichaRevenda } from "./mimo-revenda-db";

const agora = new Date("2026-11-17T20:00:00Z");
const id = "00000000-0000-4000-8000-000000000001";
const respostas = revendaSchema.parse({ envio_id: id, interesse: "revenda", canal: "comecando", cidade: "Cidade de Teste", uf: "RS", investimento: "sim", prazo: "pesquisando", nome: "Cliente Sintético", whatsapp: "11988887777", consentimento: true });
const ficha: FichaRevenda = { id, empresa_id: "empresa-a", lead_id: "lead-a", telefone: "5511988887777", respostas: { ...respostas, whatsapp: "5511988887777" }, minimo_centavos: 150000, created_at: "2026-11-17T19:59:00Z" };
const contexto = () => validarFichaRevendaAgente(ficha, "empresa-a", ficha.telefone, agora)!;
const mensagens = (content: string) => [{ role: "user" as const, content }];

it("reconhece a mensagem real do formulário e encaminha sem nova coleta", () => {
  const r = respostaFichaRevendaAgente(configInicialAgente, mensagens(mensagemRevenda(respostas)), {}, contexto(), agora)!;
  expect(r).toMatchObject({ estado: "humano", encaminhar: true, motivo: "formulario_revenda" });
  expect(r.resposta).toContain("Recebi seu formulário");
  expect(r.resposta).not.toMatch(/informe|qual seu|representante|R\$/i);
  expect(r.resumo).toContain("Ainda estou pesquisando");
  expect(r.resumo).toContain("Não comprova compra ou pagamento");
});
it("aproveita a ficha mesmo se o lead substituir a mensagem pronta por uma saudação", () => {
  expect(respostaFichaRevendaAgente(configInicialAgente, mensagens("Bom dia"), {}, contexto(), agora)?.estado).toBe("humano");
});
it("não acredita apenas na alegação de que preencheu o formulário", () => {
  expect(respostaFichaRevendaAgente(configInicialAgente, mensagens(mensagemRevenda(respostas)), {}, null, agora)).toBeNull();
});
it("preserva dados corrigidos na conversa e não fabrica evidências de WhatsApp", () => {
  const dados = { nome: { valor: "Nome corrigido", evidencia: "Meu nome é Nome corrigido" } };
  expect(respostaFichaRevendaAgente(configInicialAgente, mensagens("Meu nome é Nome corrigido"), dados, contexto(), agora)?.dados).toEqual(dados);
});
it("inclui todos os campos comerciais no resumo sem afirmar pedido fechado", () => {
  const t = resumoFichaRevendaAgente(contexto());
  for (const s of ["Cliente Sintético", "Cidade de Teste/RS", "Estou começando", "R$ 1.500", "Ainda estou pesquisando", "declarado pelo interessado"]) expect(t).toContain(s);
});
it("aceita a ficha nova e mostra o valor de R$ 1.000 realmente aceito", () => {
  const nova = validarFichaRevendaAgente({ ...ficha, minimo_centavos: 100000 }, "empresa-a", ficha.telefone, agora)!;
  expect(resumoFichaRevendaAgente(nova)).toContain("R$ 1.000,00");
});
it("mantém a disponibilidade humana sem promessa de resposta imediata", () => {
  const c = { ...configInicialAgente, horarios: [], disponibilidade: "A equipe continua amanhã." };
  expect(respostaFichaRevendaAgente(c, mensagens("Olá"), {}, contexto(), agora)?.resposta).toContain(c.disponibilidade);
});
it.each(["Pare de me enviar mensagens", "Preciso de suporte", "Meu pedido não chegou", "Quero para consumo próprio", "Quero ser representante", "Sou influencer", "Prefiro não informar", "[audio]", "Tenho alergia ao leite"])("prioriza a intenção atual: %s", texto => {
  expect(respostaFichaRevendaAgente(configInicialAgente, mensagens(texto), {}, contexto(), agora)).toBeNull();
  const normal = respostaDeterministicaAgente(configInicialAgente, mensagens(texto), {});
  expect(normal).not.toBeNull();
  if (texto.startsWith("Pare")) expect(normal?.estado).toBe("bloqueada");
});
describe("vínculo privado da ficha", () => {
  it("aceita exclusivamente a variante brasileira do nono dígito", () => {
    expect(validarFichaRevendaAgente(ficha, "empresa-a", "551188887777", agora)).not.toBeNull();
    expect(validarFichaRevendaAgente(ficha, "empresa-a", "551188887778", agora)).toBeNull();
  });
  it("não mistura empresas, telefones nem mínimos adulterados", () => {
    expect(validarFichaRevendaAgente(ficha, "empresa-b", ficha.telefone, agora)).toBeNull();
    expect(validarFichaRevendaAgente({ ...ficha, minimo_centavos: 1 }, "empresa-a", ficha.telefone, agora)).toBeNull();
    expect(validarFichaRevendaAgente({ ...ficha, respostas: { ...respostas, investimento: "nao" } }, "empresa-a", ficha.telefone, agora)).toBeNull();
  });
  it("não reutiliza formulários antigos, futuros ou sem data válida", () => {
    for (const created_at of ["2026-01-01T00:00:00Z", "2026-12-01T00:00:00Z", "inválido"]) expect(validarFichaRevendaAgente({ ...ficha, created_at }, "empresa-a", ficha.telefone, agora)).toBeNull();
  });
});

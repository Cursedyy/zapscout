// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MimoRevendaForm } from "./mimo-revenda-form";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const escolher=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const pergunta="O pedido inicial mínimo é de R$ 1.500. Esse valor está dentro do que pretende investir?";
it("mostra mínimo antes de pedir contato e separa representantes",()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);render(<MimoRevendaForm/>);
 expect(screen.getByText("Pedido inicial mínimo: R$ 1.500")).toBeDefined();
 escolher("O que você procura?","representante");expect(screen.getByRole("link").getAttribute("href")).toBe("/representantes");
 expect(screen.queryByLabelText("WhatsApp com DDD")).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
it("não oferece WhatsApp nem coleta contato de quem não aceita o mínimo",()=>{
 render(<MimoRevendaForm/>);escolher("O que você procura?","revenda");escolher(pergunta,"nao");
 expect(screen.queryByRole("button")).toBeNull();expect(screen.queryByLabelText("Seu nome")).toBeNull();expect(screen.getByRole("status").textContent).toContain("R$ 1.500");
});
function preencher(){const v=render(<MimoRevendaForm/>);escolher("O que você procura?","revenda");escolher("Onde pretende revender?","comecando");escolher("Cidade","Cidade sintética");escolher("Estado","RS");escolher(pergunta,"sim");escolher("Quando pretende fazer o primeiro pedido?","agora");escolher("Seu nome","Pessoa sintética");escolher("WhatsApp com DDD","11999991234");fireEvent.click(screen.getByRole("checkbox"));return v.container.querySelector("form")!;}
it("só oferece o link após persistência; retry preserva identidade do envio",async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(Error("Rede indisponível")).mockResolvedValueOnce(Response.json({whatsapp:"https://wa.me/555391280424?text=teste"}));vi.stubGlobal("fetch",fetch);
 const form=preencher();fireEvent.submit(form);await screen.findByRole("alert");expect(screen.queryByRole("link")).toBeNull();
 const primeiro=JSON.parse(fetch.mock.calls[0][1].body);fireEvent.submit(form);
 await waitFor(()=>expect(screen.getByRole("link").getAttribute("href")).toBe("https://wa.me/555391280424?text=teste"));
 expect(JSON.parse(fetch.mock.calls[1][1].body).envio_id).toBe(primeiro.envio_id);expect(primeiro.investimento).toBe("sim");
});


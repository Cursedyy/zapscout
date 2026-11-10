import { afterEach, expect, it, vi } from "vitest";
import { uazUpdateWebhook } from "./uazapi.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("configura recebimento pelo endpoint documentado sem incluir envios da API", async () => {
  vi.stubEnv("UAZAPI_BASE_URL", "https://uazapi.example.test");
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await uazUpdateWebhook("test-instance", "https://zapscout.example.test/api/public/uazapi-webhook");
  expect(fetchMock).toHaveBeenCalledWith("https://uazapi.example.test/webhook", expect.objectContaining({
    body: JSON.stringify({ url: "https://zapscout.example.test/api/public/uazapi-webhook", events: ["messages"], enabled: true, excludeMessages: ["wasSentByApi", "isGroupYes"] }),
  }));
});

it("MiMo inclui ecos da API para distinguir o agente de mensagens manuais",async()=>{
 vi.stubEnv("UAZAPI_BASE_URL","https://uazapi.example.test");const f=vi.fn(async()=>new Response("{}",{status:200}));vi.stubGlobal("fetch",f);
 await uazUpdateWebhook("token","https://zapscout.example.test/api/public/uazapi-webhook",["messages"],{incluirEnviosApi:true});
 expect(f).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({body:JSON.stringify({url:"https://zapscout.example.test/api/public/uazapi-webhook",events:["messages"],enabled:true,excludeMessages:["isGroupYes"]})}));
});

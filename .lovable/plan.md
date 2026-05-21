## Integração WhatsApp Nativo Multi-Provedor

Vou implementar um sistema completo de conexão WhatsApp dentro do ZapScout, suportando 3 provedores (UazAPI, Evolution API, Meta Business) com 2 métodos de conexão (QR Code e API Key própria).

### Contexto atual

O projeto **já possui** uma integração UAZAPI funcional com backend real:
- `src/routes/app.whatsapp.tsx` — página de conexão via QR
- `src/lib/whatsapp.functions.ts` — server functions (connect/status/disconnect/sendNow)
- `src/lib/uazapi.server.ts` — wrapper da API UAZAPI
- Tabela `profiles` com `uazapi_instance_token`, `uazapi_numero`, `uazapi_instance_status`
- Webhook em `src/routes/api/public/uazapi-webhook.ts`
- `WhatsAppButton` que abre wa.me (não usa a API ainda)

Vou **preservar** o backend UAZAPI existente e estender para os outros provedores + modo "minha própria API Key".

### Mudanças

**1. Schema do banco** (migração)
Adicionar em `profiles`:
- `wa_provider` text — `uazapi` | `evolution` | `meta`
- `wa_method` text — `qrcode` | `apikey`
- `wa_server_url` text — server URL (Evolution / UazAPI próprio)
- `wa_api_key` text — API key do usuário (Evolution/UazAPI próprio)
- `wa_instance_name` text
- `wa_meta_phone_id` text
- `wa_meta_token` text
- `wa_meta_business_id` text
- `wa_display_name` text

(Mantém os campos `uazapi_*` existentes; usados quando provider=uazapi+qrcode managed.)

**2. Server functions** (`src/lib/whatsapp.functions.ts`)
- Estender `sendNow` para roteamento por provedor (UazAPI gerenciada → uazSendText; UazAPI/Evolution custom → fetch direto; Meta → graph.facebook.com)
- Nova fn `saveWhatsAppCredentials({ provider, method, ...creds })` valida e salva no profile
- Nova fn `verifyWhatsAppCredentials()` faz ping ao provider e retorna status + número detectado
- Nova fn `getWhatsAppConfig()` retorna config atual (sem expor secrets crus além do necessário)

**3. Página `/app/whatsapp`** (refazer `src/routes/app.whatsapp.tsx`)
- Header com status pill (Conectado/Desconectado + número)
- 3 cards de seleção de provedor (UazAPI/Evolution/Meta) com badges coloridas
- Toggle método: QR Code (UazAPI/Evolution) | API Key (todos)
- **Modo QR (UazAPI gerenciada):** mantém fluxo atual (connectWhatsApp → exibe QR → polling)
- **Modo API Key:** formulário específico por provedor + botão "Verificar conexão"
- Tutorial cards na primeira visita (por provedor)
- Bloco "Conectado" com avatar/número/desconectar/enviar teste

**4. Integração com disparos** (`src/components/whatsapp-button.tsx`)
- Ler config via `useQuery(getWhatsAppConfig)`
- Se conectado: chamar `sendNow` (envio real pela API, toast "Enviado!")
- Se desconectado: comportamento atual (abre wa.me) + hint "Conecte para envio direto"
- Estados visuais: idle / enviando / enviado

**5. Sidebar** (`src/components/app-sidebar.tsx`)
- Novo bloco abaixo do menu: status WhatsApp (dot verde animado/vermelho), número, link para `/app/whatsapp`

**6. Disparo em lote** (já existe em campanhas, vou apenas garantir uso da nova `sendNow` — sem refazer UI)

### Detalhes técnicos

- Roteamento de envio em `sendNow`:
  ```ts
  switch(profile.wa_provider) {
    case 'uazapi': uazSendText(token, numero, texto)
    case 'evolution': POST {wa_server_url}/message/sendText/{wa_instance_name}
    case 'meta': POST graph.facebook.com/v18.0/{phone_id}/messages
  }
  ```
- Credenciais salvas server-side (Supabase) com RLS — não em localStorage, mais seguro que o prompt original
- `verifyWhatsAppCredentials` retorna `{ ok, numero, displayName, error }`
- QR Code real continua via UAZAPI server-managed (já funciona); QR custom fica como TODO para Evolution
- Fallback wa.me preservado para resiliência

### Arquivos editados/criados

- ➕ migração SQL: novos campos em `profiles`
- ✏️ `src/lib/whatsapp.functions.ts` — saveCredentials, verifyCredentials, getConfig, sendNow multi-provider
- ✏️ `src/routes/app.whatsapp.tsx` — UI completa multi-provedor
- ✏️ `src/components/whatsapp-button.tsx` — usa sendNow quando conectado
- ✏️ `src/components/app-sidebar.tsx` — status pill
- ➕ `src/components/whatsapp-status-pill.tsx` — componente reutilizável

Posso seguir com a implementação?
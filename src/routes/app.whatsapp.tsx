import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MessageCircle,
  QrCode,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  connectWhatsApp,
  statusWhatsApp,
  disconnectWhatsApp,
  getWhatsAppConfig,
  verifyWhatsAppCredentials,
  saveWhatsAppCredentials,
} from "@/lib/whatsapp.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AquecimentoCard } from "@/components/aquecimento-card";
import { FilaEnviosManuaisCard } from "@/components/fila-envios-manuais-card";

export const Route = createFileRoute("/app/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — ZapScout" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WhatsAppPage,
});

type ProviderId = "uazapi" | "evolution" | "meta";
type Method = "qrcode" | "apikey";

const PROVIDERS: Array<{
  id: ProviderId;
  nome: string;
  descricao: string;
  badge: string;
  cor: string;
  docs: string;
  qrSupported: boolean;
}> = [
  {
    id: "uazapi",
    nome: "ZapScout Cloud",
    descricao: "Recomendado · Multi-dispositivo",
    badge: "Popular",
    cor: "#8A47EA",
    docs: "/app/whatsapp",
    qrSupported: true,
  },
  {
    id: "evolution",
    nome: "Evolution API",
    descricao: "Open source · Self-hosted",
    badge: "Open Source",
    cor: "#3B82F6",
    docs: "https://doc.evolution-api.com",
    qrSupported: false,
  },
  {
    id: "meta",
    nome: "Meta Business",
    descricao: "API oficial do WhatsApp",
    badge: "Oficial",
    cor: "#25D366",
    docs: "https://developers.facebook.com/docs/whatsapp",
    qrSupported: false,
  },
];

function WhatsAppPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const configFn = useServerFn(getWhatsAppConfig);
  const { data: config } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => configFn(),
    refetchInterval: 8000,
  });

  const [provider, setProvider] = useState<ProviderId>("uazapi");
  const [method, setMethod] = useState<Method>("qrcode");

  useEffect(() => {
    if (config?.provider) setProvider(config.provider as ProviderId);
    if (config?.method) setMethod(config.method as Method);
  }, [config?.provider, config?.method]);

  // Quando provider muda, ajusta método se necessário
  useEffect(() => {
    const p = PROVIDERS.find((x) => x.id === provider);
    if (p && !p.qrSupported && method === "qrcode") setMethod("apikey");
  }, [provider, method]);

  const disconnect = useServerFn(disconnectWhatsApp);
  const handleDisconnect = async () => {
    try {
      await disconnect();
      toast.success("WhatsApp desconectado");
      qc.invalidateQueries({ queryKey: ["wa-config"] });
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desconectar");
    }
  };

  const connected = !!config?.connected;
  const providerSelecionado = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Conexão do WhatsApp"
        subtitle="Envie mensagens diretamente pela plataforma, sem abrir o WhatsApp Web."
      />

      {/* Status atual */}
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
        <div
          className={cn(
            "grid place-items-center h-12 w-12 rounded-xl",
            connected ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
          )}
        >
          {connected ? <CheckCircle2 className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-muted-foreground">Status</div>
          <div className="font-semibold">
            {connected ? "Conectado" : "Desconectado"}
            {connected && config?.provider && (
              <span className="ml-2 text-xs text-muted-foreground">
                via {PROVIDERS.find((p) => p.id === config.provider)?.nome}
              </span>
            )}
          </div>
          {connected && (config?.numero || config?.displayName) && (
            <div className="text-xs text-muted-foreground truncate">
              {config?.displayName && <span>{config.displayName} · </span>}
              {config?.numero && <span className="font-mono">+{config.numero}</span>}
            </div>
          )}
        </div>
        {connected && (
          <Button variant="outline" size="sm" onClick={handleDisconnect}>
            <LogOut className="h-4 w-4 mr-2" /> Desconectar
          </Button>
        )}
      </div>

      {!connected && (
        <>
          {/* Seletor de provedor */}
          <div>
            <div className="text-sm font-medium mb-3">1. Escolha o provedor</div>
            <div className="grid sm:grid-cols-3 gap-3">
              {PROVIDERS.map((p) => {
                const active = provider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={cn(
                      "text-left rounded-xl border-2 p-4 transition-all",
                      active
                        ? "shadow-md"
                        : "border-border bg-card hover:border-muted-foreground/30",
                    )}
                    style={
                      active
                        ? { borderColor: p.cor, backgroundColor: `${p.cor}10` }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div
                        className="grid place-items-center h-9 w-9 rounded-lg text-white"
                        style={{ backgroundColor: p.cor }}
                      >
                        <MessageCircle className="h-5 w-5" />
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${p.cor}20`, color: p.cor }}
                      >
                        {p.badge}
                      </span>
                    </div>
                    <div className="font-semibold">{p.nome}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.descricao}</div>
                    <a
                      href={p.docs}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-2"
                    >
                      Ver documentação <ExternalLink className="h-3 w-3" />
                    </a>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seletor de método */}
          <div>
            <div className="text-sm font-medium mb-3">2. Método de conexão</div>
            <div className="flex flex-wrap gap-2">
              {providerSelecionado.qrSupported && (
                <button
                  onClick={() => setMethod("qrcode")}
                  className={cn(
                    "px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                    method === "qrcode"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-secondary/50",
                  )}
                >
                  <QrCode className="h-4 w-4 inline mr-2" />
                  Escanear QR Code
                </button>
              )}
              <button
                onClick={() => setMethod("apikey")}
                className={cn(
                  "px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors",
                  method === "apikey"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-secondary/50",
                )}
              >
                <ShieldCheck className="h-4 w-4 inline mr-2" />
                Usar minha API Key
              </button>
            </div>
          </div>

          {/* Área de conexão */}
          <div className="rounded-2xl border border-border bg-card p-6">
            {method === "qrcode" && provider === "uazapi" && (
              <QrConnectUazapi onUseApiKey={() => setMethod("apikey")} />
            )}
            {method === "apikey" && (
              <ApiKeyForm provider={provider} onSaved={() => qc.invalidateQueries({ queryKey: ["wa-config"] })} />
            )}
          </div>

          {/* Tutorial */}
          <TutorialCard provider={provider} />
        </>
      )}

      {connected && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <strong className="text-foreground">Tudo pronto.</strong> Os disparos do ZapScout agora
          saem pelo WhatsApp conectado. Para trocar de provedor ou número, clique em Desconectar.
        </div>
      )}

      <AquecimentoCard connected={connected} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// QR Code (UazAPI gerenciada)
// ---------------------------------------------------------------------------
function QrConnectUazapi({ onUseApiKey }: { onUseApiKey: () => void }) {
  const connect = useServerFn(connectWhatsApp);
  const status = useServerFn(statusWhatsApp);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [estado, setEstado] = useState<string>("desconectado");

  const refresh = useCallback(async () => {
    try {
      const s = await status();
      setEstado(s.status);
      if (s.qrcode) setQr(s.qrcode);
      if (s.status === "connected") setQr(null);
    } catch (e) {
      console.error(e);
    }
  }, [status]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3500);
    return () => clearInterval(t);
  }, [refresh]);

  const [erroLotado, setErroLotado] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    setErroLotado(false);
    try {
      const r = await connect();
      setEstado(r.status);
      if (r.qrcode) setQr(r.qrcode);
      toast.success("QR Code gerado. Escaneie pelo WhatsApp.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao conectar";
      if (/lotado|Maximum number|429|instances/i.test(msg)) {
        setErroLotado(true);
        toast.error("Servidor compartilhado lotado. Use sua API Key ou tente novamente.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-center">
      <h3 className="font-semibold mb-1">Escaneie com seu WhatsApp</h3>
      <p className="text-xs text-muted-foreground mb-4">
        WhatsApp → Aparelhos conectados → Conectar aparelho
      </p>
      {erroLotado && (
        <div className="mb-4 text-left rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <span className="text-sm font-semibold text-warning">
              Servidor compartilhado lotado
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            O servidor gratuito atingiu o limite de conexões simultâneas. Você tem duas opções:
          </p>
          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium mb-1">Opção 1 — Use sua própria API Key</p>
              <p className="text-xs text-muted-foreground mb-2">
                Se você já tem uma instância UazAPI/Evolution própria, conecte usando suas credenciais.
              </p>
              <Button size="sm" onClick={onUseApiKey}>
                <ShieldCheck className="h-4 w-4 mr-2" /> Usar minha API Key
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium mb-1">Opção 2 — Aguarde e tente novamente</p>
              <p className="text-xs text-muted-foreground mb-2">
                Quando outro usuário desconectar, uma vaga abrirá automaticamente.
              </p>
              <Button size="sm" variant="outline" onClick={handleConnect} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Tentar novamente
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto h-56 w-56 rounded-xl border-2 border-solid border-border grid place-items-center mb-4 overflow-hidden bg-background">
        {qr ? (
          <img
            src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
            alt="QR Code WhatsApp"
            className="h-full w-full object-contain"
          />
        ) : estado === "connecting" || estado === "qrcode" ? (
          <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
        ) : (
          <QrCode className="h-14 w-14 text-muted-foreground" />
        )}
      </div>
      <div className="flex justify-center gap-2">
        <Button onClick={handleConnect} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
          {qr ? "Gerar novo QR" : "Gerar QR Code"}
        </Button>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Status: <span className="font-mono">{estado}</span></p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário de API Key
// ---------------------------------------------------------------------------
function ApiKeyForm({ provider, onSaved }: { provider: ProviderId; onSaved: () => void }) {
  const verify = useServerFn(verifyWhatsAppCredentials);
  const save = useServerFn(saveWhatsAppCredentials);

  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    // limpa quando troca provider
    setServerUrl("");
  }, [provider]);

  const handleVerify = async () => {
    setVerificando(true);
    try {
      const payload =
        provider === "meta"
          ? { provider: "meta" as const, phoneNumberId, accessToken, businessAccountId }
          : { provider, serverUrl, apiKey, instanceName };
      const res = await verify({ data: payload });
      if (!res.ok) {
        toast.error(`Falha na verificação: ${res.error ?? "credenciais inválidas"}`);
        return;
      }
      await save({ data: payload });
      toast.success(
        `WhatsApp conectado!${res.numero ? ` (${res.numero})` : ""}`,
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na verificação");
    } finally {
      setVerificando(false);
    }
  };

  const podeSalvar =
    provider === "meta"
      ? phoneNumberId.length > 4 && accessToken.length > 20 && businessAccountId.length > 4
      : serverUrl.length > 8 && apiKey.length > 8 && instanceName.length > 0;

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <h3 className="font-semibold text-center">
        Credenciais{" "}
        {provider === "uazapi" ? "ZapScout Cloud" : provider === "evolution" ? "Evolution API" : "Meta Business"}
      </h3>

      {(provider === "uazapi" || provider === "evolution") && (
        <>
          <div>
            <Label htmlFor="server">URL do servidor</Label>
            <Input
              id="server"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://seu-servidor.com"
            />
          </div>
          <div>
            <Label htmlFor="apikey">API Key</Label>
            <div className="relative">
              <Input
                id="apikey"
                type={showSecret ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="inst">Nome da instância</Label>
            <Input
              id="inst"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="minha-instancia"
            />
          </div>
        </>
      )}

      {provider === "meta" && (
        <>
          <div>
            <Label htmlFor="phone">Phone Number ID</Label>
            <Input
              id="phone"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="123456789012345"
            />
          </div>
          <div>
            <Label htmlFor="token">Access Token</Label>
            <div className="relative">
              <Input
                id="token"
                type={showSecret ? "text" : "password"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAA••••••••"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="biz">Business Account ID</Label>
            <Input
              id="biz"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="987654321098765"
            />
          </div>
          <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Requer conta Meta Business verificada com número aprovado.</span>
          </div>
        </>
      )}

      <Button onClick={handleVerify} disabled={!podeSalvar || verificando} className="w-full">
        {verificando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
        Verificar e conectar
      </Button>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
        Suas credenciais são salvas com segurança no seu perfil. Nunca compartilhe sua API Key.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tutoriais
// ---------------------------------------------------------------------------
function TutorialCard({ provider }: { provider: ProviderId }) {
  const content =
    provider === "uazapi"
      ? {
          titulo: "Como conectar pelo ZapScout Cloud",
          passos: [
            "Clique em Conectar para gerar o QR Code",
            "Abra o WhatsApp no celular → Aparelhos conectados",
            "Escaneie o QR Code e pronto",
          ],
          tempo: "1 minuto",
        }
      : provider === "evolution"
        ? {
            titulo: "Como conectar com Evolution API",
            passos: [
              "Tenha um servidor com Evolution API rodando",
              "Copie a URL do servidor e a API Key global",
              "Informe o nome da sua instância e conecte",
            ],
            tempo: "depende do seu servidor",
          }
        : {
            titulo: "Como conectar com Meta Business",
            passos: [
              "Acesse developers.facebook.com",
              "Crie um app do tipo Business e configure o WhatsApp",
              "Copie Phone Number ID, Access Token e Business Account ID",
            ],
            tempo: "1-3 dias (aprovação Meta)",
          };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="font-medium text-sm mb-2">{content.titulo}</div>
      <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
        {content.passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <div className="text-[11px] text-muted-foreground mt-2">Tempo estimado: {content.tempo}</div>
    </div>
  );
}

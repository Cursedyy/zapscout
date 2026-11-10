import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, QrCode, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { MimoCarregando } from "./mimo-carregando";
import {
  estadoWhatsAppMimo,
  conectarWhatsAppMimo,
  ativarWhatsAppMimo,
  pausarWhatsAppMimo,
  trocarWhatsAppMimo,
} from "@/lib/mimo-whatsapp.functions";

export function MimoWhatsAppPage() {
  const estado = useServerFn(estadoWhatsAppMimo),
    conectar = useServerFn(conectarWhatsAppMimo),
    ativar = useServerFn(ativarWhatsAppMimo),
    pausar = useServerFn(pausarWhatsAppMimo),
    trocar = useServerFn(trocarWhatsAppMimo);
  const [qr, setQr] = useState<string | null>(null),
    [confirmado, setConfirmado] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [confirmarTroca, setConfirmarTroca] = useState(false);
  const q = useQuery({
    queryKey: ["mimo-whatsapp-conexao"],
    queryFn: () => estado(),
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const estado = query.state.data;
      return qr ||
        estado?.status === "connecting" ||
        (estado?.status === "connected" && !estado.numero)
        ? 12000
        : false;
    },
    retry: false,
  });
  useEffect(() => {
    setConfirmado(false);
    if (q.data?.status === "connected") {
      setQr(null);
      setAviso("");
    } else if (q.data?.qrcode) setQr(q.data.qrcode);
  }, [q.data?.numero, q.data?.status, q.data?.qrcode]);
  async function executar(fn: () => Promise<void>) {
    setErro("");
    setAviso("");
    setOcupado(true);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  }
  if (q.isPending) return <MimoCarregando />;
  if (q.isError || !q.data)
    return (
      <section className="p-6">
        <p role="alert">Não foi possível carregar a conexão da MiMo.</p>
        <Button className="mt-3" onClick={() => void q.refetch()}>
          Tentar novamente
        </Button>
      </section>
    );
  const d = q.data;
  const atual = d.vinculos.find((v) => v.minhaConexao && v.numero === d.numero && v.ativo);
  return (
    <section className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header>
        <p className="text-xs font-medium uppercase text-primary">Entrada de contatos</p>
        <h1 className="mt-1 text-3xl">WhatsApp MiMo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Conecte o número comercial e confirme a entrada automática de novos contatos no menu
          Leads.
        </p>
      </header>
      <div className="space-y-5 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MessageCircle className="text-primary" />
            <div>
              <h2 className="font-medium">Sua conexão ZapScout Cloud</h2>
              <p className="text-sm text-muted-foreground">
                {d.status === "connected"
                  ? d.numero
                    ? `Número conectado: +${d.numero}`
                    : "Conectado. Aguardando identificação do número."
                  : d.status === "connecting"
                    ? "Aguardando leitura do QR Code"
                    : d.status === "unknown"
                      ? "Status não confirmado"
                      : "WhatsApp desconectado"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            disabled={ocupado || q.isFetching}
            onClick={() => void q.refetch()}
          >
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} />
            Atualizar status
          </Button>
        </div>
        {d.status === "connected" && (
          <Button
            variant="outline"
            disabled={ocupado || q.isFetching || !d.numero || !d.desafio}
            onClick={() => setConfirmarTroca(true)}
          >
            Trocar número
          </Button>
        )}
        <AlertDialog open={confirmarTroca} onOpenChange={setConfirmarTroca}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Trocar o WhatsApp conectado?</AlertDialogTitle>
              <AlertDialogDescription>
                O número atual será desconectado desta conta ZapScout. A captura de leads, o agente
                e a recuperação por WhatsApp ficarão pausados. Depois, leia o QR Code com o celular
                do novo número, confirme o número comercial e reative os serviços que deseja usar.
                Seus leads e históricos serão preservados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!d.numero || !d.desafio) return;
                  void executar(async () => {
                    setQr(null);
                    setConfirmado(false);
                    const r = await trocar({
                      data: {
                        numero: d.numero!,
                        desafio: d.desafio!,
                        confirmado: true,
                      },
                    });
                    if (r.qrcode) setQr(r.qrcode);
                    setAviso(
                      "Troca iniciada. Conecte o novo número pelo QR Code e confirme-o abaixo. O agente e a recuperação por WhatsApp continuam pausados até a reativação.",
                    );
                  });
                }}
              >
                Desconectar e gerar QR Code
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {d.servidor && (
          <p className="break-all text-xs text-muted-foreground">
            Servidor configurado: {d.servidor}
          </p>
        )}
        {!d.disponivel && (
          <p role="status" className="text-sm text-muted-foreground">
            O serviço de conexão precisa ser configurado pela administração do ZapScout.
          </p>
        )}
        {!d.compativel && (
          <p role="status" className="text-sm text-muted-foreground">
            Sua conta usa outro provedor. O pareamento da MiMo nesta tela usa a conexão ZapScout
            Cloud por QR Code.
          </p>
        )}
        {d.erro && (
          <p role="alert" className="text-sm text-destructive">
            {d.erro}
          </p>
        )}
        {d.status !== "connected" && (
          <Button
            disabled={ocupado || !d.disponivel || !d.compativel}
            onClick={() =>
              void executar(async () => {
                const r = await conectar();
                setQr(r.qrcode);
                setAviso(
                  r.qrcode
                    ? "No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho."
                    : "Atualize o status para conferir a conexão.",
                );
              })
            }
          >
            <QrCode />
            {ocupado ? "Preparando conexão…" : qr ? "Atualizar QR Code" : "Conectar WhatsApp"}
          </Button>
        )}
        {qr && (
          <div className="space-y-3">
            <img
              className="h-64 w-64 rounded-lg bg-white p-3"
              src={qr}
              alt="QR Code para conectar o WhatsApp comercial"
            />
            <p className="text-sm text-muted-foreground">
              Leia com o WhatsApp comercial. A captura só será ativada após a confirmação do número
              abaixo.
            </p>
          </div>
        )}
        {d.status === "connected" && d.numero && !atual && (
          <div className="space-y-4 border-t pt-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={confirmado}
                disabled={ocupado}
                onChange={(e) => setConfirmado(e.target.checked)}
              />
              <span>
                Confirmo que <strong>+{d.numero}</strong> é o número comercial da MiMo e autorizo
                cadastrar os novos contatos recebidos como leads da empresa.
              </span>
            </label>
            <Button
              disabled={ocupado || !confirmado || !d.desafio || !d.disponivel || !d.compativel}
              onClick={() =>
                void executar(async () => {
                  await ativar({
                    data: { numero: d.numero!, desafio: d.desafio!, confirmado: true },
                  });
                  setAviso(
                    "Captura ativada. Envie uma nova mensagem de teste de outro número e confira o menu Leads.",
                  );
                })
              }
            >
              {ocupado ? "Ativando…" : "Ativar leads automáticos"}
            </Button>
          </div>
        )}
        {atual && (
          <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm">
            Leads automáticos ativos para +{d.numero}. Novas mensagens recebidas podem cadastrar o
            contato sem duplicar telefones.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Esta conexão é a mesma usada pela sua conta ZapScout. A ativação começa com novas
          mensagens; os cadastros e configurações de IA já existentes permanecem como estão.
        </p>
      </div>
      {aviso && (
        <p role="status" className="text-sm text-primary">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <section className="space-y-3">
        <h2 className="text-lg">Números vinculados à MiMo</h2>
        {!d.vinculos.length ? (
          <p className="text-sm text-muted-foreground">Nenhum número confirmado ainda.</p>
        ) : (
          d.vinculos.map((v) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              key={v.id}
            >
              <div>
                <p className="font-medium">+{v.numero}</p>
                <p className="text-xs text-muted-foreground">
                  {v.ativo ? "Captura ativa" : "Captura pausada"} · Confirmado em{" "}
                  {new Date(v.confirmadoEm).toLocaleString("pt-BR")}
                </p>
              </div>
              {v.ativo && (
                <Button
                  variant="outline"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(async () => {
                      await pausar({ data: { id: v.id } });
                      setAviso("Captura pausada. O WhatsApp continua conectado à sua conta.");
                    })
                  }
                >
                  Pausar captura
                </Button>
              )}
            </div>
          ))
        )}
      </section>
    </section>
  );
}

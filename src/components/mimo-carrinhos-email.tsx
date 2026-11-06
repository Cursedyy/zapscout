import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  conectarGmailMimo,
  configurarEmailMimo,
  enviarEmailManualMimo,
  enviarTesteEmailMimo,
  obterPainelEmailMimo,
} from "@/lib/mimo-email.functions";
import type { DiagnosticoCarrinho } from "@/lib/mimo-carrinhos-diagnostico";
import { mensagensRecuperacaoMimo } from "@/lib/mimo-carrinhos-mensagens";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
const motivos: Record<string, string> = {
  historico: "E-mail: carrinho anterior à ativação. Envio manual disponível.",
  pausada: "E-mails automáticos pausados. Envio manual disponível.",
  fila: "E-mail elegível para o lembrete automático. O envio manual não duplica o lembrete.",
  enviada: "E-mail aceito pelo Gmail. Não será reenviado.",
  incerta: "E-mail com aceite incerto. Revise o atendimento; não repita o envio.",
  reservada: "E-mail em processamento.",
  enviando: "E-mail em processamento.",
  bloqueada: "E-mail bloqueado pela verificação de segurança.",
  resposta: "E-mail bloqueado por descadastro ou resposta já registrada no atendimento.",
  compra: "Compra identificada: e-mail bloqueado.",
  sem_destino: "Sem e-mail válido ou link disponível.",
  expirado: "Carrinho sem atualização há 30 dias: e-mail indisponível.",
  aguardando: "E-mail aguardando duas horas desde a última atualização.",
  sem_configuracao: "Conecte o Gmail e conclua o teste interno antes de enviar e-mails.",
};
export function MimoEmailResumo({ checkoutTeste }: { checkoutTeste?: string }) {
  const obter = useServerFn(obterPainelEmailMimo),
    conectar = useServerFn(conectarGmailMimo),
    configurar = useServerFn(configurarEmailMimo),
    testar = useServerFn(enviarTesteEmailMimo);
  const [email, setEmail] = useState(""),
    [idTeste] = useState(() => crypto.randomUUID()),
    [retorno, setRetorno] = useState<string | null>(null);
  useEffect(() => setRetorno(new URLSearchParams(window.location.search).get("gmail")), []);
  const qc = useQueryClient();
  const atualizar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mimo-email-painel"] }),
      qc.invalidateQueries({ queryKey: ["mimo-carrinhos"] }),
    ]);
  };
  const q = useQuery({
    queryKey: ["mimo-email-painel"],
    queryFn: () => obter(),
    refetchInterval: 30000,
  });
  const conexao = useMutation({
    mutationFn: () => conectar(),
    retry: false,
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const config = useMutation({
    mutationFn: (ativo: boolean) => configurar({ data: { ativo } }),
    retry: false,
    onSuccess: atualizar,
  });
  const teste = useMutation({
    mutationFn: () => testar({ data: { email, checkout: checkoutTeste!, id: idTeste } }),
    retry: false,
    onSettled: atualizar,
  });
  const d = q.data;
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 text-sm"
      aria-label="Recuperação por e-mail"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">
          E-mail · {d?.ativo ? "Recuperação ativa" : "Envios automáticos desativados"}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={!d?.configurada || !d.disponivel || conexao.isPending || config.isPending}
          onClick={() => conexao.mutate()}
        >
          {conexao.isPending
            ? "Abrindo Google…"
            : d?.conectado
              ? "Reautorizar Gmail"
              : "Conectar Gmail"}
        </Button>
      </div>
      <p className="text-muted-foreground">
        Um e-mail por carrinho, após duas horas, com o cupom MIMOCONSULTOR e opção de descadastro.
      </p>
      {q.isPending && <p>Consultando conexão de e-mail…</p>}
      {q.isError && <p role="alert">Não foi possível consultar o e-mail.</p>}
      {d && (!d.configurada || !d.disponivel) && (
        <p>A preparação da conexão do Gmail ainda precisa ser concluída pela equipe responsável.</p>
      )}
      {retorno === "sucesso" && (
        <p role="status">Gmail autorizado. Faça um teste interno antes de ativar os e-mails.</p>
      )}
      {retorno === "falha" && (
        <p role="alert">
          Não foi possível concluir a autorização. Use a conta remetente da MiMo e inicie novamente
          por esta tela.
        </p>
      )}
      {d?.conectado && (
        <>
          <p>Remetente: {d.remetente}</p>
          <p>
            Envios aceitos: {d.enviadas} · Na fila: {d.pendentes} · Incertos: {d.incertas}
          </p>
          <div className="space-y-2 rounded-lg border p-3">
            <label className="block" htmlFor="mimo-email-teste">
              E-mail da equipe para receber o teste interno
            </label>
            <Input
              id="mimo-email-teste"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="equipe@exemplo.com"
              disabled={teste.isPending}
            />
            <p className="text-muted-foreground">
              O teste usa o texto e o link do carrinho #{checkoutTeste ?? "—"} como exemplo e será
              enviado somente ao endereço informado acima.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={
                !d.configurada ||
                !checkoutTeste ||
                !email.trim() ||
                teste.isPending ||
                teste.isSuccess
              }
              onClick={() => teste.mutate()}
            >
              {teste.isPending ? "Enviando teste…" : "Enviar teste interno por e-mail"}
            </Button>
            {teste.isSuccess && (
              <p role="status">
                {teste.data.resultado === "enviada"
                  ? "Teste aceito pelo Gmail. Confira a caixa de entrada e o spam antes de ativar."
                  : teste.data.resultado === "incerta"
                    ? "Aceite do teste incerto. Confira a caixa de entrada; não repita automaticamente."
                    : "Este teste já foi processado. Confira sua caixa de entrada."}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={config.isPending || (!d.ativo && (!d.pilotoOk || !d.configurada))}
            onClick={() => config.mutate(!d.ativo)}
          >
            {config.isPending
              ? "Atualizando…"
              : d.ativo
                ? "Pausar e-mails"
                : "Recebi o teste; ativar e-mails"}
          </Button>
          {d.inicioEm && (
            <p className="text-xs text-muted-foreground">
              Corte da automação:{" "}
              {new Date(d.inicioEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{" "}
              (Brasília). Carrinhos criados antes ficam disponíveis somente para envio manual.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Os envios aceitos não confirmam recebimento ou leitura. As respostas por e-mail chegam à
            caixa da equipe; esta conexão não lê mensagens do Gmail.
          </p>
        </>
      )}
      {[conexao, config, teste].map((m, i) =>
        m.isError ? (
          <p role="alert" key={i} className="text-destructive">
            {m.error.message}
          </p>
        ) : null,
      )}
    </section>
  );
}
export function MimoEmailEnvioManual({
  id,
  nome,
  email,
  url,
  diagnostico,
}: {
  id: string;
  nome: string;
  email: string;
  url: string | null;
  diagnostico?: DiagnosticoCarrinho | null;
}) {
  const [revisando, setRevisando] = useState(false);
  const enviar = useServerFn(enviarEmailManualMimo),
    qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => enviar({ data: { checkout: id } }),
    retry: false,
    onSettled: async () => {
      setRevisando(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mimo-carrinhos"] }),
        qc.invalidateQueries({ queryKey: ["mimo-email-painel"] }),
      ]);
    },
  });
  const permitido = !!diagnostico?.podeEnviar && !!email && !!url;
  const modelo =
    revisando && url ? mensagensRecuperacaoMimo(nome, url, [new URL(url).hostname]) : null;
  return (
    <div className="space-y-2 border-t pt-3 text-sm">
      <p>
        {motivos[diagnostico?.motivo ?? ""] ??
          "Diagnóstico de e-mail indisponível. Atualize a página."}
      </p>
      {diagnostico?.enviadaEm && (
        <p className="text-muted-foreground">
          {diagnostico.manual ? "E-mail manual" : "E-mail automático"} em{" "}
          {new Date(diagnostico.enviadaEm).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
          (Brasília).
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!permitido || m.isPending || m.isSuccess}
        onClick={() => setRevisando(true)}
      >
        {m.isPending ? "Enviando e-mail…" : "Enviar e-mail manual"}
      </Button>
      {revisando && permitido && modelo && (
        <section
          aria-label={`Revisar e-mail do carrinho ${id}`}
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
        >
          <p className="font-medium">
            Enviar para {nome || "este cliente"} · {email}
          </p>
          <p>
            <strong>Assunto:</strong> {modelo.assunto}
          </p>
          <p className="whitespace-pre-wrap">{modelo.texto}</p>
          <p className="text-muted-foreground">
            O e-mail incluirá um link de descadastro. Compras, descadastro e envios anteriores serão
            verificados novamente.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
              Confirmar e-mail
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={m.isPending}
              onClick={() => setRevisando(false)}
            >
              Cancelar
            </Button>
          </div>
        </section>
      )}
      {m.isSuccess && (
        <p role="status">
          {m.data.resultado === "enviada"
            ? "E-mail aceito pelo Gmail. O recebimento depende do provedor."
            : m.data.resultado === "incerta"
              ? "Aceite do e-mail incerto. Não repita; revise o atendimento."
              : "O e-mail não foi enviado. Consulte o diagnóstico atualizado do carrinho."}
        </p>
      )}
      {m.isError && (
        <p role="alert" className="text-destructive">
          {m.error.message}
        </p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, ChevronDown, Headset, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assumirLeadEmEsperaMimo, qualificarLeadMimo } from "@/lib/mimo-leads.functions";
import { leadsEmEsperaMimoOptions, leadsPendentesMimoOptions } from "@/lib/mimo-leads.queries";
import { atualizarConsultasMimo } from "@/lib/mimo-cache";
import {
  gravarAlertaAtivo,
  lerAlertaAtivo,
  notificarNovosLeads,
  novosLeads,
  pedirPermissaoNotificacao,
  tocarAlertaNovoLead,
} from "@/lib/mimo-alerta-espera";

function tempoDeEspera(entrada: string) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(entrada).getTime()) / 60000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `há ${horas} h` : `há ${Math.floor(horas / 24)} d`;
}

/** Fila visível enquanto o lead não tem responsável; ao atender, ele passa a ser do vendedor. */
export function MimoLeadsEspera() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const { data } = useQuery(leadsEmEsperaMimoOptions);
  const { data: pendentesData } = useQuery(leadsPendentesMimoOptions);
  const [dispensados, setDispensados] = useState<string[]>([]);
  const [alertasAtivos, setAlertasAtivos] = useState(false);
  const filaConhecida = useRef<Set<string> | null>(null);
  const pendentesConhecidos = useRef<Set<string> | null>(null);
  useEffect(() => setAlertasAtivos(lerAlertaAtivo()), []);
  // Avisa (som + notificação) só para leads que acabaram de aparecer nesta sessão.
  useEffect(() => {
    if (!data) return;
    const { novos, conhecidos } = novosLeads(filaConhecida.current, data.leads);
    filaConhecida.current = conhecidos;
    if (!novos.length || !alertasAtivos) return;
    tocarAlertaNovoLead();
    notificarNovosLeads(
      novos,
      (id) => navegar({ to: "/mimo/leads", search: { lead: id } }),
      "espera",
    );
  }, [data, alertasAtivos, navegar]);
  useEffect(() => {
    if (!pendentesData) return;
    const { novos, conhecidos } = novosLeads(
      pendentesConhecidos.current,
      pendentesData.leads,
    );
    pendentesConhecidos.current = conhecidos;
    if (!novos.length || !alertasAtivos) return;
    tocarAlertaNovoLead();
    notificarNovosLeads(
      novos,
      (id) => navegar({ to: "/mimo/leads", search: { lead: id } }),
      "pendente",
    );
  }, [pendentesData, alertasAtivos, navegar]);
  async function alternarAlertas() {
    const ativo = !alertasAtivos;
    setAlertasAtivos(ativo);
    gravarAlertaAtivo(ativo);
    if (!ativo) return toast.info("Alertas de novos leads desativados.");
    const permissao = await pedirPermissaoNotificacao();
    tocarAlertaNovoLead();
    if (permissao === "denied")
      return toast.info("Som ativado. O navegador bloqueou as notificações.");
    if (permissao === "granted") return toast.success("Alertas ativados: som e notificação.");
    toast.success("Som ativado para novos leads.");
  }
  const qualificar = useMutation({
    mutationFn: (v: { id: string; qualificacao: "qualificado" | "nao_qualificado" }) =>
      qualificarLeadMimo({ data: v }),
    onSuccess: async (_resultado, v) => {
      toast.success(
        v.qualificacao === "qualificado"
          ? "Lead qualificado. Ele saiu da lista de pendências."
          : "Lead marcado como não qualificado.",
      );
      await atualizarConsultasMimo(cliente);
    },
    onError: (erro) => toast.error(erro.message),
  });
  const assumir = useMutation({
    mutationFn: (id: string) => assumirLeadEmEsperaMimo({ data: { id } }),
    onSuccess: async (_resultado, id) => {
      toast.success("Lead assumido. Abrindo o cadastro…");
      navegar({ to: "/mimo/leads", search: { lead: id } });
      await atualizarConsultasMimo(cliente);
    },
    onError: async (erro) => {
      toast.error(erro.message);
      // Outro vendedor pode ter assumido antes: recarrega a fila.
      await atualizarConsultasMimo(cliente);
    },
  });
  const emEspera = useMemo(
    () => (data?.leads ?? []).filter((lead) => !dispensados.includes(lead.id)),
    [data, dispensados],
  );
  // Já são meus, mas seguem sem qualificação: ficam visíveis até eu classificar.
  const pendentes = useMemo(
    () => (pendentesData?.leads ?? []).filter((lead) => !dispensados.includes(lead.id)),
    [pendentesData, dispensados],
  );
  if (!emEspera.length && !pendentes.length) return null;
  const total = emEspera.length + pendentes.length;
  return (
    <section
      aria-label="Leads em espera para atendimento"
      className="fixed right-4 bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl sm:right-6"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p aria-live="polite" className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex size-2 rounded-full bg-primary/60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {total === 1 ? "1 lead aguardando" : `${total} leads aguardando`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={alertasAtivos}
            aria-label={
              alertasAtivos ? "Desativar alerta de novos leads" : "Ativar alerta de novos leads"
            }
            title={
              alertasAtivos ? "Alerta de novos leads ativado" : "Alertar quando entrar lead novo"
            }
            onClick={() => void alternarAlertas()}
          >
            {alertasAtivos ? (
              <Bell aria-hidden="true" className="size-4" />
            ) : (
              <BellOff aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fechar fila de espera"
            onClick={() =>
              setDispensados((atuais) => [
                ...atuais,
                ...emEspera.map((lead) => lead.id),
                ...pendentes.map((lead) => lead.id),
              ])
            }
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>
      <div className="max-h-72 overflow-y-auto">
        {emEspera.length > 0 && (
          <div>
            <h3 className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Em espera para atendimento
            </h3>
            <ul className="divide-y divide-border">
              {emEspera.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {lead.nome_empresa || lead.telefone || "Novo lead"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.telefone || "sem telefone"} · esperando {tempoDeEspera(lead.entrada_em)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={assumir.isPending}
                    onClick={() => assumir.mutate(lead.id)}
                  >
                    <Headset aria-hidden="true" className="size-4" />
                    Atender
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pendentes.length > 0 && (
          <div className={emEspera.length > 0 ? "border-t border-border" : undefined}>
            <h3 className="bg-muted/40 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Meus leads sem qualificação
            </h3>
            <ul className="divide-y divide-border">
              {pendentes.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {lead.nome_empresa || lead.telefone || "Lead"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.telefone || "sem telefone"} · entrou {tempoDeEspera(lead.entrada_em)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Abrir cadastro de ${lead.nome_empresa || lead.telefone || "lead"}`}
                      onClick={() => navegar({ to: "/mimo/leads", search: { lead: lead.id } })}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={qualificar.isPending}>
                          Qualificar
                          <ChevronDown aria-hidden="true" className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            qualificar.mutate({ id: lead.id, qualificacao: "qualificado" })
                          }
                        >
                          Qualificado
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            qualificar.mutate({ id: lead.id, qualificacao: "nao_qualificado" })
                          }
                        >
                          Não qualificado
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <footer className="border-t border-border px-4 py-2">
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
          <Link to="/mimo/leads" search={{}}>
            Ver todos os leads
          </Link>
        </Button>
      </footer>
    </section>
  );
}

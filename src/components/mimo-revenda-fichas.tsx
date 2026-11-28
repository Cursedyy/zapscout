import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fichasRevenda } from "@/lib/mimo-revenda.functions";
import { CANAIS_REVENDA, PRAZOS_REVENDA, formatarMinimoRevenda } from "@/lib/mimo-revenda";
export function FichasRevenda({leadId,usuarioId}: {leadId:string;usuarioId:string}) {
  const ler = useServerFn(fichasRevenda);
  const q = useQuery({ queryKey: ["mimo-revenda",usuarioId,leadId], queryFn: () => ler({data:{lead_id:leadId}}) });
  if (q.isPending) return <p className="mt-4 text-sm text-muted-foreground">Carregando formulário de revenda…</p>;
  if (q.error) return <p role="alert" className="mt-4 text-sm">Não foi possível carregar o formulário de revenda. <button className="underline" onClick={() => void q.refetch()}>Tentar novamente</button></p>;
  if (!q.data?.length) return null;
  return <section className="mt-5 space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Formulário de revenda · respostas do interessado</h3>{q.data.map(f => {
    const r = f.respostas as Record<string,string>;
    return <article key={f.id} className="space-y-1 border-t pt-3 text-sm"><p className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString("pt-BR")}</p><p><strong>Nome:</strong> {r.nome}</p><p><strong>Local:</strong> {r.cidade}/{r.uf}</p><p><strong>Onde pretende revender:</strong> {CANAIS_REVENDA[r.canal as keyof typeof CANAIS_REVENDA] ?? r.canal}</p><p><strong>Pedido inicial:</strong> confirmou que {formatarMinimoRevenda(f.minimo_centavos)} está dentro do que pretende investir.</p><p><strong>Prazo:</strong> {PRAZOS_REVENDA[r.prazo as keyof typeof PRAZOS_REVENDA] ?? r.prazo}</p>{r.utm_campaign && <p><strong>Campanha informada no link:</strong> {r.utm_campaign}</p>}<p className="text-xs text-muted-foreground">Informações autodeclaradas. Não representam pedido, pagamento ou aprovação de crédito.</p></article>;
  })}</section>;
}


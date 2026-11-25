import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { contarFeedbacksMimoNaoLidos } from "@/lib/mimo-feedback.functions";
import { CHAVE_NOTIFICACOES_NAO_LIDAS, EVENTO_NOTIFICACOES_ATUALIZADAS } from "@/lib/notificacoes";

export function MimoFeedbackNavIndicator() {
  const contar = useServerFn(contarFeedbacksMimoNaoLidos);
  const consulta = useQuery({
    queryKey: [...CHAVE_NOTIFICACOES_NAO_LIDAS, "feedback", "/mimo/feedbacks"],
    queryFn: () => contar(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const { refetch } = consulta;

  useEffect(() => {
    const atualizar = () => void refetch();
    window.addEventListener(EVENTO_NOTIFICACOES_ATUALIZADAS, atualizar);
    return () => window.removeEventListener(EVENTO_NOTIFICACOES_ATUALIZADAS, atualizar);
  }, [refetch]);

  if (!consulta.data) return null;

  return (
    <span
      className="ml-auto size-2.5 shrink-0 rounded-full bg-destructive ring-2 ring-destructive/20"
      role="status"
      aria-label="Novos feedbacks"
    />
  );
}

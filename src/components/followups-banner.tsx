import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Clock, ArrowRight } from "lucide-react";
import { contarAgendadosHoje } from "@/lib/sequencias.functions";
import { supabase } from "@/integrations/supabase/client";

export function FollowupsBanner() {
  const contar = useServerFn(contarAgendadosHoje);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const { data } = useQuery({
    queryKey: ["followups-hoje"],
    queryFn: () => contar(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    enabled: authed,
  });
  const total = data?.total ?? 0;
  if (total === 0) return null;

  return (
    <Link
      to="/app/sequencias"
      className="mx-4 sm:mx-6 md:mx-10 mt-3 md:mt-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
    >
      <Clock className="h-4 w-4 text-primary shrink-0" />
      <span>
        <strong className="tabular-nums">{total}</strong> follow-up{total > 1 ? "s" : ""} agendado{total > 1 ? "s" : ""} para hoje
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
    </Link>
  );
}

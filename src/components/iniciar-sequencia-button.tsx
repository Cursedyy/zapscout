import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { toastErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listSequencias, iniciarSequencia } from "@/lib/sequencias.functions";
import { Play, Plus } from "lucide-react";

/** Botão dropdown que dispara uma sequência para um lead. Requer leadId UUID (CRM). */
export function IniciarSequenciaButton({ leadId, leadNome }: { leadId: string; leadNome: string }) {
  const qc = useQueryClient();
  const listSeqs = useServerFn(listSequencias);
  const iniciar = useServerFn(iniciarSequencia);
  const [loading, setLoading] = useState(false);

  const { data } = useQuery({ queryKey: ["sequencias"], queryFn: () => listSeqs() });
  const sequencias = data?.sequencias ?? [];

  const handleStart = async (seqId: string, seqNome: string) => {
    setLoading(true);
    try {
      await iniciar({ data: { sequenciaId: seqId, leadIds: [leadId] } });
      toast.success(`${leadNome} adicionado à sequência "${seqNome}"`);
      qc.invalidateQueries({ queryKey: ["execucoes"] });
    } catch (e) {
      toastErro(e, "Falha ao iniciar sequência");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={loading} className="flex-1">
          <Play className="h-3 w-3" /> Sequência
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sequencias.length === 0 ? (
          <DropdownMenuItem disabled>Nenhuma sequência criada</DropdownMenuItem>
        ) : (
          sequencias.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => handleStart(s.id, s.nome)}>
              <span className="truncate">{s.nome}</span>
              <span className="ml-auto text-xs text-muted-foreground">{s.etapas.length} et.</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/sequencias">
            <Plus className="h-3 w-3" /> Nova sequência
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

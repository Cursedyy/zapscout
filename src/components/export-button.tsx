import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { usePlano } from "@/store/app-store";
import { UpgradeModal } from "./upgrade-modal";
import { toast } from "sonner";
import type { MockLead } from "@/data/mock-leads";

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function ExportButton({ leads, filename = "leads.csv", extra }: { leads: MockLead[]; filename?: string; extra?: (l: MockLead) => Record<string, unknown> }) {
  const plano = usePlano();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const onClick = () => {
    if (!plano.leads_export) { setUpgradeOpen(true); return; }
    const csv = toCsv(leads.map((l) => ({
      Nome: l.nome, Telefone: l.telefone, Endereco: l.endereco, Cidade: l.cidade,
      Site: l.site ?? "", Avaliacao: l.avaliacao, TotalAvaliacoes: l.totalAvaliacoes, Nicho: l.nicho,
      ...(extra ? extra(l) : {}),
    })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado ✓");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={onClick}>
        <Download className="h-4 w-4" /> Exportar CSV
      </Button>
      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        titulo="Exportação disponível no Pro"
        descricao={`Você encontrou ${leads.length} leads prontos para exportar. Faça upgrade para baixar em CSV.`}
      />
    </>
  );
}

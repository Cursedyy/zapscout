import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  icon: Icon, label, value, hint, color,
}: { icon: LucideIcon; label: string; value: string | number; hint: string; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-4 w-4 ${color}`} /> {label}
      </div>
      <div className="text-2xl font-display font-bold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </Card>
  );
}

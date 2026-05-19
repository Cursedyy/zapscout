import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function UpgradeModal({
  open, onOpenChange, titulo, descricao,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  descricao: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 grid place-items-center h-12 w-12 rounded-full bg-primary/15 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> {titulo}
          </DialogTitle>
          <DialogDescription className="text-center">{descricao}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mt-2">
          <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button asChild className="flex-1">
            <Link to="/planos" onClick={() => onOpenChange(false)}>Ver planos</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

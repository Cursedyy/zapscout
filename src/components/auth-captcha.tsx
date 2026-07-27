import { ShieldQuestion } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Captcha = { question: string; token: string };

type Props = {
  captcha: Captcha | null;
  answer: string;
  onAnswerChange: (v: string) => void;
};

/**
 * Desafio de segurança adaptativo — só aparece após tentativas falhas repetidas.
 */
export function AuthCaptcha({ captcha, answer, onAnswerChange }: Props) {
  if (!captcha) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <Label htmlFor="captcha-answer" className="flex items-center gap-2 text-sm">
        <ShieldQuestion className="h-4 w-4 text-primary" />
        Verificação de segurança
      </Label>
      <p className="text-sm text-muted-foreground">
        Quanto é <strong className="text-foreground">{captcha.question}</strong>?
      </p>
      <Input
        id="captcha-answer"
        inputMode="numeric"
        autoComplete="off"
        required
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="Sua resposta"
      />
    </div>
  );
}

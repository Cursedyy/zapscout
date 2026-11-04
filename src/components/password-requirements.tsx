import { Check, Circle } from "lucide-react";

/** Apenas o comprimento e a confirmação podem ser conferidos no navegador. */
export function PasswordRequirements({
  senha,
  confirmar,
  id,
}: {
  senha: string;
  confirmar?: string;
  id: string;
}) {
  const tamanho = senha.length >= 8;
  const igual = Boolean(senha && confirmar === senha);
  return (
    <div id={id} className="space-y-2 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Requisitos da senha</p>
      <ul className="space-y-1">
        <li
          className={
            tamanho ? "flex items-center gap-1 text-emerald-600" : "flex items-center gap-1"
          }
        >
          {tamanho ? (
            <Check aria-hidden="true" className="h-3 w-3" />
          ) : (
            <Circle aria-hidden="true" className="h-3 w-3" />
          )}
          Pelo menos 8 caracteres{tamanho ? " — atendido" : ""}.
        </li>
        {confirmar !== undefined && (
          <li
            className={
              igual ? "flex items-center gap-1 text-emerald-600" : "flex items-center gap-1"
            }
          >
            {igual ? (
              <Check aria-hidden="true" className="h-3 w-3" />
            ) : (
              <Circle aria-hidden="true" className="h-3 w-3" />
            )}
            A confirmação deve ser igual à senha{igual ? " — atendido" : ""}.
          </li>
        )}
        <li>Senhas comuns ou identificadas como inseguras podem ser recusadas ao salvar.</li>
      </ul>
      <p>
        <span className="font-medium">Dica:</span> combine letras maiúsculas e minúsculas, números e
        símbolos, como ! ou @. Essa combinação ajuda, mas não garante a aprovação de uma senha muito
        conhecida.
      </p>
    </div>
  );
}

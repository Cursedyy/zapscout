export type PasswordError = {
  message?: string;
  code?: string;
  name?: string;
  reasons?: readonly string[];
};

export function senhaRecusada(error: PasswordError): boolean {
  return (
    error.code?.toLowerCase() === "weak_password" ||
    error.name === "AuthWeakPasswordError" ||
    /weak[_\s-]*password|password.*(?:weak|at least|contain|characters)|easy to guess|pwned/i.test(
      error.message ?? "",
    )
  );
}

/** Traduz a recusa do provedor sem alterar a política de senhas. */
export function mensagemErroSenha(error: PasswordError): string {
  const message = error.message ?? "";
  if (senhaRecusada(error)) {
    const mensagens: string[] = [];
    if (error.reasons?.includes("length") || /password.*at least/i.test(message)) {
      const minimo = Math.max(8, Number(message.match(/at least\s+(\d+)/i)?.[1] ?? 8));
      mensagens.push(`A senha precisa ter pelo menos ${minimo} caracteres.`);
    }
    if (
      error.reasons?.includes("characters") ||
      /password.*(?:contain|include).*(?:character|letter|number|symbol)/i.test(message)
    ) {
      mensagens.push(
        "O serviço solicitou mais tipos de caracteres. Inclua uma letra maiúscula, uma minúscula, um número e um símbolo, como ! ou @.",
      );
    }
    if (error.reasons?.includes("pwned") || /known|easy to guess|pwned/i.test(message)) {
      mensagens.push(
        "Essa senha é comum ou já foi identificada como insegura. Mesmo com 8 ou mais caracteres, ela pode ser recusada. Escolha outra senha exclusiva; evite sequências, nomes da empresa e senhas de outros sites.",
      );
    }
    return (
      mensagens.join(" ") ||
      "Essa senha foi recusada por ser fraca. Use pelo menos 8 caracteres e escolha uma combinação exclusiva. Misturar letras, números e símbolos ajuda, mas senhas muito conhecidas ainda podem ser recusadas."
    );
  }
  return message || "Não foi possível redefinir a senha. Tente novamente.";
}

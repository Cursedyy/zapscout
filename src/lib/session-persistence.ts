// Persistência opcional da sessão Supabase.
// Quando o usuário desmarca "Manter-me conectado", removemos o token do
// localStorage ao fechar a aba/navegador — efetivamente tornando a sessão
// equivalente a sessionStorage sem precisar mexer no cliente Supabase.

const KEEP_KEY = "zs:keepLogged";

export function setKeepLogged(keep: boolean) {
  try {
    localStorage.setItem(KEEP_KEY, keep ? "1" : "0");
  } catch {}
}

export function getKeepLogged(): boolean {
  try {
    // Default: manter conectado (comportamento atual)
    return localStorage.getItem(KEEP_KEY) !== "0";
  } catch {
    return true;
  }
}

function clearSupabaseAuthTokens() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

let installed = false;
export function installSessionPersistence() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const handler = () => {
    if (!getKeepLogged()) clearSupabaseAuthTokens();
  };
  window.addEventListener("pagehide", handler);
  window.addEventListener("beforeunload", handler);
}

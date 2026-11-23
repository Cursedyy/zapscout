const CHAVE_PREFERENCIA = "mimo-alerta-fila-espera";

/** Preferência fica no navegador: cada vendedor escolhe se quer ser avisado. */
export function lerAlertaAtivo() {
  try {
    return localStorage.getItem(CHAVE_PREFERENCIA) === "1";
  } catch {
    return false;
  }
}

export function gravarAlertaAtivo(ativo: boolean) {
  try {
    localStorage.setItem(CHAVE_PREFERENCIA, ativo ? "1" : "0");
  } catch {
    // Modo privado ou storage bloqueado: o alerta vale só para esta sessão.
  }
}

let contextoAudio: AudioContext | null = null;

/** Bipe curto de dois tons, sem depender de arquivo de áudio. */
export function tocarAlertaNovoLead() {
  if (typeof window === "undefined") return;
  const Construtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Construtor) return;
  contextoAudio ??= new Construtor();
  const contexto = contextoAudio;
  void contexto
    .resume()
    .then(() => {
      const inicio = contexto.currentTime;
      [880, 1180].forEach((frequencia, indice) => {
        const oscilador = contexto.createOscillator();
        const volume = contexto.createGain();
        const comeco = inicio + indice * 0.16;
        oscilador.type = "sine";
        oscilador.frequency.value = frequencia;
        volume.gain.setValueAtTime(0, comeco);
        volume.gain.linearRampToValueAtTime(0.08, comeco + 0.02);
        volume.gain.exponentialRampToValueAtTime(0.0001, comeco + 0.14);
        oscilador.connect(volume).connect(contexto.destination);
        oscilador.start(comeco);
        oscilador.stop(comeco + 0.15);
      });
    })
    .catch(() => {
      // Navegador bloqueou o áudio antes de qualquer interação do usuário.
    });
}

export type LeadParaAlerta = { id: string; nome_empresa: string | null; telefone: string | null };

export async function pedirPermissaoNotificacao() {
  if (typeof Notification === "undefined") return "indisponivel" as const;
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Compara a lista atual com a anterior e devolve só quem acabou de aparecer. */
export function novosLeads<T extends { id: string }>(conhecidos: Set<string> | null, atuais: T[]) {
  if (!conhecidos) {
    return { novos: [] as T[], conhecidos: new Set(atuais.map((lead) => lead.id)) };
  }
  const novos = atuais.filter((lead) => !conhecidos.has(lead.id));
  for (const lead of atuais) conhecidos.add(lead.id);
  return { novos, conhecidos };
}

/** Notifica o vendedor mesmo com a aba em segundo plano; clique abre o lead. */
export function notificarNovosLeads(
  leads: LeadParaAlerta[],
  aoAbrir: (id: string) => void,
  origem: "espera" | "pendente" = "espera",
) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const [primeiro] = leads;
  if (!primeiro) return;
  const nome = primeiro.nome_empresa || primeiro.telefone || "Novo lead";
  const emEspera = origem === "espera";
  const titulo = emEspera
    ? leads.length === 1
      ? "Novo lead em espera"
      : `${leads.length} novos leads em espera`
    : leads.length === 1
      ? "Lead seu sem qualificação"
      : `${leads.length} leads seus sem qualificação`;
  const corpo = emEspera
    ? leads.length === 1
      ? `${nome} aguarda atendimento.`
      : `${nome} e mais ${leads.length - 1} aguardam atendimento.`
    : leads.length === 1
      ? `${nome} está com você e segue sem qualificação.`
      : `${nome} e mais ${leads.length - 1} estão com você sem qualificação.`;
  try {
    const notificacao = new Notification(titulo, { body: corpo, tag: "mimo-fila-espera" });
    notificacao.onclick = () => {
      window.focus();
      aoAbrir(primeiro.id);
      notificacao.close();
    };
  } catch {
    // Chrome no Android só aceita via Service Worker; o pop-up segue como aviso.
  }
}

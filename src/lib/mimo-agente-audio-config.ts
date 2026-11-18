export const mensagensAudio = {
  chave_invalida: "A chave precisa começar com sk- e estar completa, sem espaços no meio. Copie novamente a chave criada na plataforma OpenAI.",
  conexao: "Não foi possível validar a conexão do número de atendimento. Aguarde alguns instantes e tente novamente. A chave não foi enviada.",
  consulta_audio: "Não foi possível consultar os áudios recebidos. A chave não foi enviada.",
  sem_audio: "Envie um áudio curto ao WhatsApp de atendimento e tente novamente. É necessário um áudio recebido nas últimas 48 horas. A chave ainda não foi enviada.",
  vinculo_alterado: "O número de atendimento mudou durante a configuração. Atualize esta página antes de tentar novamente.",
  chave_nao_salva: "A UazAPI não confirmou a gravação da chave. A transcrição ainda não está configurada.",
  chave_salva_sem_transcricao: "A chave foi salva na UazAPI, mas o provedor não retornou a transcrição. Confira na plataforma OpenAI se a chave permite transcrição e se há saldo disponível.",
  tempo: "O provedor demorou além do limite do teste. A chave pode ter sido salva; ainda não foi possível confirmar a transcrição.",
  provedor: "O provedor recusou ou não conseguiu concluir o teste. A chave pode ter sido salva; ainda não foi possível confirmar a transcrição.",
  acesso: "Não foi possível autenticar esta operação. Atualize a página e entre novamente se necessário. A configuração exige acesso de administrador ou gestor.",
} as const;
export type CodigoAudio = keyof typeof mensagensAudio;
export type ResultadoAudio = { ok: true } | { ok: false; codigo: CodigoAudio };
export const formatoChaveAudio = /^sk-[A-Za-z0-9_-]{20,500}$/;

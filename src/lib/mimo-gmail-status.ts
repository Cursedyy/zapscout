export const MENSAGENS_GMAIL = {
  sucesso: "Gmail autorizado. Faça um teste interno antes de ativar os e-mails.",
  configuracao: "A configuração do Gmail precisa ser concluída na hospedagem.",
  navegador:
    "A autorização não corresponde a este navegador. Inicie a conexão nesta tela e conclua no mesmo navegador.",
  negada: "A autorização do Gmail foi cancelada ou recusada no Google.",
  estado_expirado: "A tentativa expirou ou já foi utilizada. Inicie uma nova conexão nesta tela.",
  empresa: "A autorização não corresponde à empresa configurada.",
  loja: "A conexão da loja precisa estar configurada antes de autorizar o Gmail.",
  verificador:
    "Não foi possível validar esta tentativa. Inicie novamente; se persistir, confira a chave de criptografia na hospedagem.",
  rede_google:
    "O servidor não conseguiu conectar ao Google. Tente uma nova autorização mais tarde.",
  tempo_google: "O Google não respondeu dentro do prazo. Inicie uma nova autorização.",
  invalid_client:
    "O Google recusou o ID ou o segredo do cliente. Confira se o ID e o segredo salvos na hospedagem pertencem ao mesmo cliente Web e publique novamente.",
  invalid_grant:
    "O Google recusou o código desta autorização. Inicie uma nova conexão; se persistir, confira o URI de redirecionamento do cliente Web.",
  unauthorized_client:
    "O cliente Google não está autorizado para este fluxo. Confira se ele é do tipo Aplicativo da Web.",
  invalid_scope:
    "O Google não aceitou os escopos solicitados. Confira as permissões do aplicativo.",
  google_http:
    "O Google não concluiu a autorização. Confira o cliente OAuth e as permissões da conta.",
  resposta_google:
    "O Google retornou uma autorização incompleta. Inicie novamente e conceda a permissão de envio.",
  permissao_envio:
    "A permissão de enviar e-mails não foi concedida. Autorize o envio ao conectar o Gmail.",
  identidade:
    "O Google não confirmou a identidade do remetente. Use a conta remetente configurada da MiMo.",
  remetente:
    "A conta autorizada é diferente do remetente configurado. Selecione matheusconsultor@mimoessepode.com no Google.",
  gravar_credencial:
    "A autorização chegou, mas não foi possível salvar a conexão. Confira o acesso de gestão e tente novamente.",
  reserva_indisponivel:
    "Não foi possível finalizar esta tentativa no banco. Aguarde sua expiração antes de iniciar outra conexão.",
  falha_interna:
    "Não foi possível concluir a conexão do Gmail. Inicie uma nova tentativa nesta tela.",
} as const;
export type ResultadoGmail = keyof typeof MENSAGENS_GMAIL;
export function resultadoGmailSeguro(valor: unknown): ResultadoGmail | null {
  return typeof valor === "string" && Object.hasOwn(MENSAGENS_GMAIL, valor)
    ? (valor as ResultadoGmail)
    : null;
}

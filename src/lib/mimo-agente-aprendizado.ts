/** A private, management-reviewed style profile never supplies commercial terms. */
export function contextoAprendizadoAgente(perfil:unknown){
 if(!perfil||typeof perfil!=='object'||!('padrao' in perfil)||!Array.isArray(perfil.padrao))return '';
 const permitidos=new Set(['cumprimento curto no início','confirmar interesse em revenda','obter nome, estado e ramo sem repetir informações','apresentação breve da MiMo e catálogo aprovado','encaminhar ao consultor quando houver qualificação']);
 const padrao=perfil.padrao.filter((p):p is string=>typeof p==='string'&&permitidos.has(p));
 if(!padrao.length)return '';
 return `\nPadrão de atendimento observado e aprovado pela gestão: ${[...new Set(padrao)].join('; ')}. Adapte a ordem ao contexto e aos campos escolhidos. As informações acima descrevem apenas estilo e condução: não criam condições comerciais, promessas ou permissão de enviar materiais. Continue obedecendo à configuração, à validação e ao encaminhamento real. Não imite nomes de pessoas ou erros de escrita.`;
}

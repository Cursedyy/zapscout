export type MensagemObservada={id:string;direcao:'recebida'|'enviada';texto:string};
export type SinalQuente={quente:boolean;motivos:string[];evidencias:{evento:string;trecho:string}[]};
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const limpar=(s:string)=>s.replace(/https?:\/\/\S+/gi,'[link]').replace(/[\u0000-\u001f]/g,' ').trim();
const ufs=/\b(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/;
const estados=/\b(?:acre|alagoas|amapa|amazonas|bahia|ceara|distrito federal|espirito santo|goias|maranhao|mato grosso|minas gerais|paraiba|parana|pernambuco|piaui|rio de janeiro|rio grande do norte|rio grande do sul|rondonia|roraima|santa catarina|sao paulo|sergipe|tocantins)\b/;
const ramo=/\b(?:emporio|loja|supermercado|mercadinho|mercado|farmacia|conveniencia|distribui(?:dor|dora|cao)|vendedor(?:a)? extern[oa]|comerciante|ecommerce|e-commerce|negocio online|vendas online|pela internet|comecando|comecar do zero|(?:trabalh(?:ar|o)|vend(?:er|o)|revend(?:er|o)) (?:em|de) casa)\b/;
const revenda=/\b(?:quero|gostaria|pretendo|interesse em|vou|ja|trabalho com|para)\b.{0,65}\b(?:revend[aeor]*|distribui[a-z]*)\b|\b(?:revendo|revendedor|revendedora)\b/;
const intencao=/\b(?:quero|vou|vamos|gostaria de|podemos|preciso)\s+(?:(?:fazer|fechar|montar|efetuar)\s+(?:o |um |meu |esse |este |nosso )?pedido|comprar (?:para |pra )?revender)|\b(?:como (?:faco|fazer|fecho|fechar).{0,20}pedido|pode (?:montar|fechar).{0,20}pedido)\b/;
/** Only customer statements count. The salesperson's pitch is never buying evidence. */
export function detectarLeadQuente(mensagens:MensagemObservada[]):SinalQuente{
 const recebidas=mensagens.filter(m=>m.direcao==='recebida'&&m.texto.trim()&&!/^\[(?:audio|anexo)/i.test(m.texto));
 if(!recebidas.length)return {quente:false,motivos:[],evidencias:[]};
 const ultimaEnvio=mensagens.map(m=>m.direcao).lastIndexOf('enviada');
 const bloco=mensagens.slice(ultimaEnvio+1).filter(m=>m.direcao==='recebida');
 const atuais=bloco.length?bloco:[recebidas.at(-1)!];
 const atual=normal(atuais.map(m=>m.texto).join(' '));
 if(/\b(?:nao (?:tenho|temos|quero|ha).{0,15}interesse|sem interesse|nao quero (?:mais |comprar|revender)|pare de|nao (?:mande|envie)|retire meu|remova meu|cancelar pedido|rastreio|pedido atrasado|meu pedido nao|consumo proprio|para meu (?:filho|filha)|pra minha casa|so para casa|reclamacao)\b/.test(atual))return {quente:false,motivos:[],evidencias:[]};
 const compra=atuais.find(m=>intencao.test(normal(m.texto))&&!/\b(?:nao|talvez|quem sabe|ano que vem|mes que vem)\b/.test(normal(m.texto)));
 const todos=normal(recebidas.map(m=>m.texto).join(' '));
 if(!compra&&/\b(?:divulgacao|sorteio|doacao|patrocinio|influenciador|influencer|radio|redes sociais)\b/.test(atual))return {quente:false,motivos:[],evidencias:[]};
 let interesse:MensagemObservada|undefined;
 let perguntaRevenda=false;
 for(const m of mensagens){
  if(m.direcao==='enviada'){perguntaRevenda=/\b(?:revend|revender|revenda|revendedor)/.test(normal(m.texto))&&m.texto.includes('?');continue;}
  const t=normal(m.texto);
  if(revenda.test(t)||(perguntaRevenda&&/^(?:sim\b|claro\b|tenho interesse\b|gostaria\b)/.test(t)))interesse=m;
  if(/\b(?:nao tenho interesse|sem interesse|nao quero revender)\b/.test(t))interesse=undefined;
  perguntaRevenda=false;
 }
 const local=[...recebidas].reverse().find(m=>{
  const t=normal(m.texto);
  const index=mensagens.indexOf(m);
  const pergunta=mensagens.slice(0,index).filter(x=>x.direcao==='enviada').at(-1);
  // Lowercase UF is accepted only in a location answer requested by the agent.
  const ufResposta=!!pergunta && /\bestado\b/.test(normal(pergunta.texto)) && t.split(/[\n,;]/).some(l=>/^(?:[a-z][a-z .'-]{1,70}[- /]+)?(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)[.! ]*$/.test(l.trim()) && !/\b(?:se|para|quero|talvez|nao)\b.*\b(?:for|tiver|der|manda|envia)\b/.test(l));
  return ufResposta||estados.test(t)||/pará/i.test(m.texto)||ufs.test(m.texto.replace(/\bSE\s+(?:FOR|EU|VOCE|TIVER|DER)\b/g,''))||/\b(?:sou (?:do|de)|estado[: ]|moro (?:no|em))\s*(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/.test(t);
 });
 const perfil=[...recebidas].reverse().find(m=>ramo.test(normal(m.texto)));
 if(compra){return {quente:true,motivos:['intencao_de_pedido'],evidencias:[{evento:compra.id,trecho:limpar(compra.texto).slice(0,220)}]};}
 if(interesse&&local&&perfil&&!/\b(?:talvez revenda|quem sabe.{0,15}revend)\b/.test(todos)){
  const unicos=[...new Map([interesse,local,perfil].map(m=>[m.id,m])).values()];
  return {quente:true,motivos:['revenda_confirmada','estado_informado','perfil_comercial_informado'],evidencias:unicos.map(m=>({evento:m.id,trecho:limpar(m.texto).slice(0,220)}))};
 }
 return {quente:false,motivos:[],evidencias:[]};
}
export function textoAlertaQuente(nome:string,telefone:string,sinal:SinalQuente){
 const encaminhamento=sinal.motivos.includes('encaminhamento_equipe');
 if(!/^\d{12,15}$/.test(telefone)||(!sinal.quente&&!encaminhamento))throw Error('Alerta inválido');
 const motivo=encaminhamento?'A IA encaminhou esta conversa para atendimento humano. Qualificação comercial ainda não confirmada.':sinal.motivos.includes('intencao_de_pedido')?'Pediu para fazer ou fechar um pedido.':'Confirmou revenda e informou estado e perfil comercial.';
 // Keep the customer's own statements; a WhatsApp/CRM display name can differ.
 // Location/name fields can precede the business profile in the stored evidence.
 // Prioritize commercial context before applying the bounded message limit.
 const contexto=/\b(?:casa|revend\w*|vend\w*|loja|emporio|distribui\w*|mercado|supermercado|farmacia|internet|online|comec\w*|trabalh\w*|pedido|compr\w*|invest\w*|orcamento|preco|prazo|frete|duvida|acucar|alerg\w*)\b|r\$/;
 const relatos=[...new Set(sinal.evidencias.map(e=>limpar(e.trecho.replace(/\r?\n+/g,' · ')).slice(0,220)).filter(t=>t && !/^(?:sim|claro|ok|tenho interesse|gostaria)[.! ]*$/i.test(t)))]
  .sort((a,b)=>Number(contexto.test(normal(b)))-Number(contexto.test(normal(a))))
  .slice(0,5);
 const detalhes=relatos.length
  ? 'Informado pelo cliente:\n'+relatos.map(t=>'• “'+t+'”').join('\n')
  : 'Nome no cadastro: '+(limpar(nome).slice(0,80)||'Não informado');
 return `MiMo · ${encaminhamento?'atendimento encaminhado à equipe':'lead para atendimento'}\n${detalhes}\n${motivo}\nContato: https://wa.me/${telefone}\nConfira a conversa antes de negociar.`;
}


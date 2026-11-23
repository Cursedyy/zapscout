import { contatoPorEnganoAgente, retirarMarcadorDeAudioAgente, type DadosAgente } from "./mimo-agente";

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
 const textosAtuais=atuais.map(m=>m.texto);
 if(contatoPorEnganoAgente(textosAtuais.join('\n')))return {quente:false,motivos:[],evidencias:[]};
 const atual=normal(textosAtuais.join(' '));
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
const cortesia = /^(?:sim|claro|ok|tenho interesse|gostaria|obrigad[oa])[.! ]*$/i;
const perguntaCliente = /\?|^(?:qual|quais|quanto|como|quando|onde)\b|\b(?:(?:preciso|quero|queria|gostaria de) saber|queria ver|duvidas? (?:sobre|de))\b/;
const pedidoInicial = /\b(?:valor inicial|investimento inicial|pedido minimo|valor minimo|para comecar)\b/;
const linhaDeProdutos = /\b(?:que tipo de (?:mimo|produto[s]?)|quais (?:sao )?(?:os )?produtos|o que (?:e a mimo|a mimo (?:vende|oferece)|voces (?:vendem|oferecem)))\b/;
const precosDeProdutos = /\b(?:quanto (?:e|custa[m]?|fica|sai)|precos?|quais (?:sao )?os valores|qual (?:e )?o valor)\b/;
const outrosValores = /\b(?:frete|estorno|reembolso|devolucao|taxa de entrega)\b/;
const trabalharEmCasa = /\b(?:vend\w*|revend\w*|trabalh\w*|fazer) (?:em|de|a partir de) casa\b/;
const sinalDesconfianca = /\b(?:caloteir\w*|golpe|fraude|desconfi\w*|enganad\w*)\b/;
const desinteresse = /\b(?:sem interesse|nao (?:tenho interesse|quero revender|vou revender)|consumo proprio)\b/;

function trechoDoAviso(texto: string | undefined, limite: number) {
  const limpo = limpar(retirarMarcadorDeAudioAgente(texto ?? ""))
    .replace(/www\.\S+|\b\w+(?:[.-]\w+)*@[\w.-]+\.[a-z]{2,}\b/gi, "[link]")
    .replace(/[~*_\x60\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length <= limite) return limpo;
  const inicio = limpo.slice(0, limite - 1);
  const fimDaPalavra = inicio.lastIndexOf(" ");
  return (fimDaPalavra > 0 ? inicio.slice(0, fimDaPalavra) : inicio) + "…";
}

export function textoAlertaQuente(
  nome: string,
  telefone: string,
  sinal: SinalQuente,
  { dados, lead }: { dados?: DadosAgente; lead?: string } = {},
) {
  const encaminhamento = sinal.motivos.includes("encaminhamento_equipe");
  if (!/^\d{12,15}$/.test(telefone) || (!sinal.quente && !encaminhamento)) {
    throw Error("Alerta inválido");
  }

  const relatos = [...new Set(
    sinal.evidencias.map(e => trechoDoAviso(e.trecho, 160)).filter(t => t && !cortesia.test(t)),
  )];
  const nomeDeclarado = trechoDoAviso(dados?.nome?.valor, 80);
  const nomeCadastro = trechoDoAviso(nome, 80);
  const local = trechoDoAviso(dados?.cidade_uf?.valor, 100);
  const perfil = trechoDoAviso(dados?.estabelecimento?.valor, 100);
  const interesse = trechoDoAviso(dados?.revenda?.valor, 100);
  const necessidade = trechoDoAviso(dados?.necessidade?.evidencia, 160);
  const problema = trechoDoAviso(dados?.problema?.evidencia, 160);
  const pergunta = [relatos[0], necessidade, problema, ...relatos.slice(1)]
    .find(t => {
      const normalizado = normal(t ?? "");
      return perguntaCliente.test(normalizado) || linhaDeProdutos.test(normalizado) || precosDeProdutos.test(normalizado);
    });
  const perguntaNormal = normal(pergunta ?? "");
  const sobreProdutos = linhaDeProdutos.test(perguntaNormal);
  const sobrePrecos = precosDeProdutos.test(perguntaNormal) && !outrosValores.test(perguntaNormal);
  const duvidaProdutosEPrecos = sobreProdutos && sobrePrecos && !pedidoInicial.test(perguntaNormal);

  const pediuPedido = sinal.motivos.includes("intencao_de_pedido");
  const querRevender = sinal.motivos.includes("revenda_confirmada") ||
    (!relatos.some(t => desinteresse.test(normal(t))) &&
      [interesse, ...relatos].some(t => /^revenda[.! ]*$/.test(normal(t)) || revenda.test(normal(t))));
  const deCasa = [perfil, ...relatos].some(t => trabalharEmCasa.test(normal(t)));
  const atencao = encaminhamento && sinalDesconfianca.test(normal(relatos[0] ?? ""));
  const contexto = pediuPedido ? "Quer fazer ou fechar um pedido."
    : querRevender ? (deCasa ? "Quer revender de casa." : "Quer revender produtos da MiMo.")
    : "";

  const relatoComplementar = !perfil && !local && relatos.find(t => {
    if (t === pergunta) return false;
    const n = normal(t);
    const informaLocal = estados.test(n) || ufs.test(t);
    return informaLocal || ramo.test(n) || trabalharEmCasa.test(n);
  });
  const proximoPasso = pediuPedido ? "Confirmar os itens e as quantidades do pedido."
    : pedidoInicial.test(perguntaNormal) ? "Explicar o investimento e as condições do pedido inicial."
    : duvidaProdutosEPrecos ? "Apresentar a linha da MiMo e confirmar quais itens o cliente quer cotar."
    : sobreProdutos ? "Apresentar a linha de produtos da MiMo."
    : sobrePrecos ? "Confirmar os itens de interesse e informar os valores."
    : pergunta ? "Responder à dúvida citada e alinhar a continuidade."
    : querRevender ? "Apresentar as condições de revenda e combinar o próximo passo."
    : "Abrir a conversa e retomar o atendimento com o cliente.";

  const ficha = lead && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(lead)
    ? "Ficha: https://zapscout.com.br/mimo/leads?lead=" + lead
    : "";
  return [
    encaminhamento ? "MiMo · atendimento encaminhado à equipe" : "MiMo · lead para atendimento",
    nomeDeclarado ? "Cliente: " + nomeDeclarado : nomeCadastro ? "Nome no cadastro: " + nomeCadastro : "",
    contexto ? "Contexto: " + contexto : "",
    perfil && !(deCasa && querRevender && trabalharEmCasa.test(normal(perfil))) ? "Atuação informada: " + perfil : "",
    local ? "Local informado: " + local : "",
    relatoComplementar ? "Detalhe informado: “" + relatoComplementar + "”" : "",
    duvidaProdutosEPrecos ? "Dúvida do cliente: Quer entender o que a MiMo oferece e saber os preços."
      : pergunta ? "Pergunta do cliente: “" + pergunta + "”" : "",
    atencao ? "Atenção: o cliente sinalizou desconfiança. Acolher e esclarecer a dúvida." : "",
    encaminhamento ? "Qualificação comercial ainda não confirmada." : "",
    "Próximo passo: " + proximoPasso,
    "WhatsApp: https://wa.me/" + telefone,
    ficha,
  ].filter(Boolean).join("\n");
}


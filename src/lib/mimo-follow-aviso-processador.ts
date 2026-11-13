export type AvisoInternoDeps = {
  preparar: () => Promise<{token:string;numero:string;texto:string}|null>;
  autorizar: () => Promise<boolean>;
  enviar: (token:string,numero:string,texto:string) => Promise<{id?:string}>;
  finalizar: (aceita:boolean,id:string|null) => Promise<void>;
};
/** No retry after crossing the durable send boundary, including a lost acknowledgement. */
export async function processarAvisoInterno(d:AvisoInternoDeps) {
  const envio=await d.preparar();
  if(!envio) return 'contexto_pendente';
  if(!await d.autorizar()) return 'cancelada';
  try {
    const result=await d.enviar(envio.token,envio.numero,envio.texto);
    if(!result.id || result.id.length>200){await d.finalizar(false,null);return 'incerta';}
    await d.finalizar(true,result.id);return 'aceita';
  } catch {
    // A failed finalization also leaves an interrupted send for database expiry review.
    try {await d.finalizar(false,null);}catch{/* durable enviando expires to incerta */}
    return 'incerta';
  }
}

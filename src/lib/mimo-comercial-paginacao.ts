/** Respect the API row cap and reject incomplete totals instead of showing partial conversion. */
export async function lerPaginasComerciais<T>(buscar:(de:number,ate:number)=>PromiseLike<{data:T[]|null;count:number|null;error:unknown}>,max=20000){
 const itens:T[]=[];let total:number|null=null;
 do {
  const r=await buscar(itens.length,itens.length+999);
  if(r.error||r.count===null||r.count<0||r.count>max)throw Error('Consulta incompleta. Reduza o período e tente novamente.');
  if(total!==null&&total!==r.count)throw Error('Os registros mudaram durante a consulta. Atualize os indicadores.');
  total=r.count;
  const pagina=r.data??[];
  if((!pagina.length&&itens.length<total)||itens.length+pagina.length>total)throw Error('Consulta incompleta. Atualize os indicadores.');
  itens.push(...pagina);
 }while(itens.length<(total??0));
 return itens;
}

import {it,expect,vi} from 'vitest';
import {lerPaginasComerciais} from './mimo-comercial-paginacao';
it('lê todos os registros mesmo quando a API retorna menos que a página pedida',async()=>{
 const todos=Array.from({length:1001},(_,id)=>({id}));
 const buscar=vi.fn(async(de:number)=>({data:todos.slice(de,de+500),count:todos.length,error:null}));
 expect((await lerPaginasComerciais(buscar)).length).toBe(1001);expect(buscar.mock.calls.map(c=>c[0])).toEqual([0,500,1000]);
});
it('não apresenta resultados parciais quando falha ou muda o total',async()=>{
 await expect(lerPaginasComerciais(async()=>({data:[],count:2,error:null}))).rejects.toThrow('incompleta');
 let n=0;await expect(lerPaginasComerciais(async()=>({data:[1],count:++n===1?2:3,error:null}))).rejects.toThrow('mudaram');
});
it('recusa volume superior ao limite e contagem desconhecida',async()=>{
 await expect(lerPaginasComerciais(async()=>({data:[],count:20001,error:null}))).rejects.toThrow('Reduza');
 await expect(lerPaginasComerciais(async()=>({data:[],count:null,error:null}))).rejects.toThrow('incompleta');
});

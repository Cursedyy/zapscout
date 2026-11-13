import {it,expect,vi} from 'vitest';
import {processarAvisoInterno,type AvisoInternoDeps} from './mimo-follow-aviso-processador';
const deps=()=>({preparar:vi.fn<AvisoInternoDeps['preparar']>(async()=>({token:'sintetico',numero:'5511999999999',texto:'Aviso sintético'})),autorizar:vi.fn(async()=>true),enviar:vi.fn<AvisoInternoDeps['enviar']>(async()=>({id:'aceite-sintetico'})),finalizar:vi.fn(async()=>{})});
it('exige contexto e autorização antes do envio',async()=>{
 const d=deps();d.preparar.mockResolvedValueOnce(null);expect(await processarAvisoInterno(d)).toBe('contexto_pendente');expect(d.autorizar).not.toHaveBeenCalled();expect(d.enviar).not.toHaveBeenCalled();
 const cancelada=deps();cancelada.autorizar.mockResolvedValueOnce(false);expect(await processarAvisoInterno(cancelada)).toBe('cancelada');expect(cancelada.enviar).not.toHaveBeenCalled();
});
it('registra aceite somente com identificador retornado',async()=>{const d=deps();expect(await processarAvisoInterno(d)).toBe('aceita');expect(d.finalizar).toHaveBeenCalledWith(true,'aceite-sintetico');expect(d.enviar).toHaveBeenCalledTimes(1);});
it('timeout ou resposta sem identificador ficam incertos sem repetir',async()=>{
 const d=deps();d.enviar.mockRejectedValueOnce(Error('timeout'));expect(await processarAvisoInterno(d)).toBe('incerta');expect(d.finalizar).toHaveBeenCalledWith(false,null);expect(d.enviar).toHaveBeenCalledTimes(1);
 const semId=deps();semId.enviar.mockResolvedValueOnce({});expect(await processarAvisoInterno(semId)).toBe('incerta');expect(semId.enviar).toHaveBeenCalledTimes(1);
});
it('falha após aceite não repete envio e preserva revisão de ambiguidade',async()=>{const d=deps();d.finalizar.mockRejectedValue(Error('banco'));expect(await processarAvisoInterno(d)).toBe('incerta');expect(d.enviar).toHaveBeenCalledTimes(1);});

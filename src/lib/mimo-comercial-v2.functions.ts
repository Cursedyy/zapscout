import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {auxiliarSchema,confirmarAuxiliarSchema,slotSchema,avisoConfigSchema} from './mimo-comercial-v2';
export const painelNumerosMimo=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {painelComercialV2}=await import('./mimo-comercial-v2.server');return painelComercialV2(context);
});
export const consultarAuxiliarMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>auxiliarSchema.parse(v)).handler(async({context,data})=>{
 const {estadoAuxiliar}=await import('./mimo-comercial-v2.server');return estadoAuxiliar(context,data);
});
export const parearAuxiliarMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>auxiliarSchema.parse(v)).handler(async({context,data})=>{
 const {parearAuxiliar}=await import('./mimo-comercial-v2.server');return parearAuxiliar(context,data);
});
export const criarAuxiliarMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>slotSchema.parse(v)).handler(async({context,data})=>{
 const {criarAuxiliar}=await import('./mimo-comercial-v2.server');return criarAuxiliar(context,data.slot);
});
export const confirmarNumeroAuxiliarMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>confirmarAuxiliarSchema.parse(v)).handler(async({context,data})=>{
 const {confirmarAuxiliar}=await import('./mimo-comercial-v2.server');return confirmarAuxiliar(context,data);
});
export const configurarAvisosMimo=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(v=>avisoConfigSchema.parse(v)).handler(async({context,data})=>{
 const {configurarAviso}=await import('./mimo-comercial-v2.server');return configurarAviso(context,data);
});
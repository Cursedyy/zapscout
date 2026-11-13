import {it,expect} from 'vitest';
import {referenciaAnuncioMimo} from './mimo-whatsapp';
const ref={sourceId:'sintetico',sourceUrl:'https://facebook.com/exemplo'};
it.each([{referral:ref},{message:{contextInfo:{externalAdReply:ref}}},{message:{extendedTextMessage:{contextInfo:{externalAdReply:ref}}}}])('aceita forma já suportada do provider %j',item=>expect(referenciaAnuncioMimo(item)?.id).toBe('sintetico'));
it('candidato inválido não esconde evidência válida documentada',()=>expect(referenciaAnuncioMimo({referral:{},message:{contextInfo:{externalAdReply:ref}}})?.id).toBe('sintetico'));
it.each([{sourceId:'id',sourceUrl:'https://facebook.com.evil.test/a'},{sourceId:'id',sourceUrl:'https://user:secret@facebook.com/a'},{sourceId:'id',sourceUrl:'http://facebook.com/a'}])('nega metadado hostil %j',referral=>expect(referenciaAnuncioMimo({referral})).toBeNull());
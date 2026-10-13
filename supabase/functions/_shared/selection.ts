import { Fault } from './runtime.ts';
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
async function key(){return crypto.subtle.importKey('raw',new TextEncoder().encode(Deno.env.get('PLACE_SELECTION_SECRET')!),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signSelection(value:Record<string,unknown>){const payload=encode(new TextEncoder().encode(JSON.stringify(value)));return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),new TextEncoder().encode(payload))));}
export async function readSelection(token:string){
 try{const [payload,sig,...extra]=token.split('.');if(extra.length||!await crypto.subtle.verify('HMAC',await key(),decode(sig),new TextEncoder().encode(payload)))throw 0;const value=JSON.parse(new TextDecoder().decode(decode(payload)));return {target:{type:'place' as const,placeId:value.placeId,name:value.name,address:value.address,lng:value.lng,lat:value.lat},identityId:value.identityId as string,expiresAt:new Date(value.expiresAt).toISOString()};}catch{throw new Fault('VALIDATION_ERROR');}
}
export async function verifySelection(token:string,identityId:string,allowExpired=false){
 const value=await readSelection(token);if(value.identityId!==identityId||(!allowExpired&&Date.parse(value.expiresAt)<Date.now()))throw new Fault('VALIDATION_ERROR');return value.target;
}

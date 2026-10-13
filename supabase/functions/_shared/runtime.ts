import { createClient } from '@supabase/supabase-js';
import { errorStatuses, type ErrorCode } from '../../../shared/contracts.ts';
import { canonicalJson } from '../../../shared/validation.ts';
export const bucket = 'photos';
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
export class Fault extends Error { constructor(public code: ErrorCode, public details?: unknown) { super(code); } }
export async function rpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
 const { data, error } = await admin.rpc(name, args);
 if(error) throw new Fault(error.code === 'P0001' && error.message in errorStatuses ? error.message as ErrorCode : 'INTERNAL_ERROR');
 return data as T;
}
export async function sha256(input: string | Uint8Array): Promise<string> {
 const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function participantHash(req: Request) {
 const token=req.headers.get('X-Participant-Token') ?? '';
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Fault('IDENTITY_REQUIRED');
 let decoded: string;try {decoded=atob(token.replace(/-/g,'+').replace(/_/g,'/')+'=');} catch {throw new Fault('IDENTITY_REQUIRED');}
 if(decoded.length!==32) throw new Fault('IDENTITY_REQUIRED');
 return await sha256(token);
}
export async function identity(req: Request,prepare=false) {
 return await rpc<{identityId:string,expiresAt:string,hasProfile:boolean}>(prepare?'gateway_session':'gateway_identity',{p_token_hash:await participantHash(req)});
}
export async function administrator(req: Request) {
 const auth=req.headers.get('Authorization') ?? '';
 if(!auth.startsWith('Bearer ')) throw new Fault('ADMIN_SESSION_EXPIRED');
 const {data,error}=await admin.auth.getUser(auth.slice(7));
 if(error || !data.user) throw new Fault('ADMIN_SESSION_EXPIRED');
 return data.user.id;
}
export async function body(req: Request): Promise<unknown> {
 if(!(req.headers.get('Content-Type') ?? '').startsWith('application/json')) throw new Fault('VALIDATION_ERROR');
 const reader=req.body?.getReader();if(!reader) throw new Fault('VALIDATION_ERROR');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new Fault('VALIDATION_ERROR');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Fault('VALIDATION_ERROR');}
}
export async function command(data: Record<string,unknown>) {return {...data,payloadHash:await sha256(canonicalJson(data))};}
export async function rate(scope:string,key:string,limit=30,seconds=60){await rpc('gateway_rate',{p_scope:scope,p_key_hash:await sha256(key),p_limit:limit,p_seconds:seconds});}
export function json(data:unknown,status=200){return Response.json({data},{status});}
export function handler(run:(req:Request)=>Promise<Response>) {return async(req:Request)=>{
 const requestId=crypto.randomUUID();const origin=req.headers.get('Origin');const allowed=(Deno.env.get('ALLOWED_ORIGINS')??'').split(',').includes(origin??'');
 const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Request-Id':requestId});
 if(origin && allowed){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');}
 if(req.method==='OPTIONS'){
 const requested=req.headers.get('Access-Control-Request-Headers')?.toLowerCase().split(',').map(x=>x.trim()) ?? [];
 if(!allowed || requested.some(x=>!['authorization','apikey','content-type','x-participant-token'].includes(x)))return new Response(null,{status:403,headers});
 headers.set('Access-Control-Allow-Headers','authorization, apikey, content-type, x-participant-token');headers.set('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');return new Response(null,{status:204,headers});
 }
 try{
 if(origin && !allowed)throw new Fault('FORBIDDEN');
 const result=await run(req);headers.forEach((v,k)=>result.headers.set(k,v));
 if(result.headers.get('Content-Type')?.includes('application/json')){const value=await result.json();return Response.json({requestId,...value},{status:result.status,headers:result.headers});}
 return result;
 }catch(error){const fault=error instanceof Fault?error:new Fault('INTERNAL_ERROR');console.error(JSON.stringify({requestId,code:fault.code}));if(fault.code==='RATE_LIMITED')headers.set('Retry-After','60');return Response.json({requestId,error:{code:fault.code,message:messages[fault.code]??'요청을 마치지 못했어요. 잠시 후 다시 시도해 주세요.'}},{status:errorStatuses[fault.code],headers});}
 };}
const messages:Partial<Record<ErrorCode,string>>={VALIDATION_ERROR:'입력 내용을 확인해 주세요.',IDENTITY_REQUIRED:'참여 정보를 준비한 뒤 다시 시도해 주세요.',IDENTITY_EXPIRED:'참여 정보가 만료됐어요. 새 참여자로 시작해 주세요.',ADMIN_SESSION_EXPIRED:'다시 로그인해 주세요.',FORBIDDEN:'이 작업을 할 권한이 없어요.',TARGET_GONE:'삭제된 항목이에요. 다른 항목을 선택해 주세요.',PHOTO_GONE:'사진이 삭제됐어요.',ALREADY_REGISTERED:'이미 내 최애에 담긴 곳이에요.',VERSION_CONFLICT:'내용이 변경됐어요. 최신 내용을 확인해 주세요.',RATE_LIMITED:'잠시 기다린 뒤 다시 시도해 주세요.',CAPACITY_REACHED:'사진 저장 공간이 부족해요. 사진을 제거하고 다시 시도할 수 있어요.'};

import { z } from 'zod';
import { BACKUP_ERROR_CODES, errorStatuses, type ErrorCode } from '../../../shared/contracts.ts';
import * as v from '../../../shared/validation.ts';
import {admin,administrator,body,bucket,command,Fault,handler,identity,participantHash,json,rate,rpc} from '../_shared/runtime.ts';
import {signSelection,readSelection} from '../_shared/selection.ts';
function parse<T>(schema:z.ZodType<T>,value:unknown):T {const r=schema.safeParse(value);if(!r.success)throw new Fault('VALIDATION_ERROR');return r.data;}
const backupSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('heartbeat'),leaseToken:v.uuid}).strict(),
 z.object({action:z.literal('snapshot'),leaseToken:v.uuid,snapshotAt:z.string().datetime(),dataEpoch:v.uuid,migrationVersion:z.string().min(1)}).strict(),
 z.object({action:z.literal('complete'),leaseToken:v.uuid,snapshotAt:z.string().datetime(),dataEpoch:v.uuid,migrationVersion:z.string().min(1),objectCount:z.number().int().nonnegative(),totalBytes:z.string().regex(/^\d+$/),manifestSha256:z.string().regex(/^[a-f0-9]{64}$/),archiveSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
 z.object({action:z.literal('fail'),leaseToken:v.uuid,errorCode:z.enum(BACKUP_ERROR_CODES)}).strict()
]);
export const serve=handler(async req=>{
 const url=new URL(req.url);const route=url.pathname.replace(/^\/functions\/v1\/api/,'').replace(/^\/api/,'');const method=req.method;
 const photo=route.match(/^\/photos\/([^/]+)$/);
 if(photo&&method==='GET'){const assetId=parse(v.uuid,photo[1]);const size=parse(z.enum(['thumb','full']),url.searchParams.get('size')??'full');const {objectKey}=await rpc('gateway_photo',{p_asset_id:assetId,p_size:size});const {data,error}=await admin.storage.from(bucket).download(objectKey);if(error||!data)throw new Fault('PHOTO_GONE');return new Response(data,{headers:{'Content-Type':'image/jpeg'}});}
 if(route.startsWith('/admin/')){
 const actor=await administrator(req);
 if(method==='GET'){
 const preview=route.match(/^\/admin\/targets\/([^/]+)\/deletion-preview$/);
 const action=preview?'deletion-preview':route.slice(7);if(!['catalog','participants','targets','operations','deletion-preview'].includes(action))throw new Fault('VALIDATION_ERROR');
 return json(await rpc('gateway_admin_read',{p_actor:actor,p_action:action,p_id:preview?parse(v.uuid,preview[1]):null,p_query:url.searchParams.get('q')??'',p_cursor:url.searchParams.get('cursor')}));
 }
 if(route==='/admin/backups'&&method==='POST')return json(await rpc('gateway_start_backup',{p_actor:actor,p_payload:parse(z.object({requestKey:v.uuid}).strict(),await body(req))}),201);
 const backup=route.match(/^\/admin\/backups\/([^/]+)$/);if(backup&&method==='PATCH')return json(await rpc('gateway_update_backup',{p_actor:actor,p_id:parse(v.uuid,backup[1]),p_payload:parse(backupSchema,await body(req))}));
 const match=route.match(/^\/admin\/(teams|categories|participants|courses|favorites|targets)(?:\/([^/]+))?(?:\/(team))?$/);if(!match)throw new Fault('VALIDATION_ERROR');
 const [,resource,id,suffix]=match;let action:string;let schema:z.ZodType;
 if(method==='POST'&&['teams','categories'].includes(resource)&&!id){action=resource==='teams'?'create_team':'create_category';schema=resource==='teams'?z.object({requestKey:v.uuid,name:v.text(30)}).strict():v.catalogCreateSchema.extend({kind:z.enum(['PLACE','COURSE'])}).strict();}
 else if(method==='PATCH'&&id&&['teams','categories','participants','courses'].includes(resource)&& (resource==='participants'?suffix==='team':suffix===undefined)){action=resource==='participants'?'edit_participant_team':resource==='courses'?'edit_course':resource==='teams'?'edit_team':'edit_category';schema=resource==='participants'?v.teamEditSchema:resource==='courses'?v.courseEditSchema:v.catalogEditSchema;}
 else if(method==='DELETE'&&id&&['favorites','targets'].includes(resource)){action=resource==='targets'?'delete_target':'delete_favorite';schema=resource==='targets'?v.targetDeleteSchema:v.deleteSchema;}
 else throw new Fault('VALIDATION_ERROR');
 const input=parse(schema,await body(req)) as Record<string,unknown>;const catalogCommand=['create_team','create_category','edit_team','edit_category'].includes(action);const businessInput=catalogCommand?{...input,name:(input.name as string).normalize('NFC'),normalizedName:v.normalizeName(input.name as string)}:input;
 await rate('admin-command',actor);return json(await rpc('gateway_admin_command',{p_actor:actor,p_payload:await command({...businessInput,action,...(id?{id:parse(v.uuid,id)}:{})})}));
 }
 if(route==='/session'&&method==='POST'){await rate('session-total','global',3000,86400);return json(await identity(req,true));}
 if(route==='/favorites'&&method==='POST'){
 const tokenHash=await participantHash(req);let payload:Record<string,unknown>={};let selectionIdentity:string|null=null;let selectionExpires:string|null=null;let invalid=false;
 try{const input=parse(v.createFavoriteSchema,await body(req));const selected=input.target.type==='place'?await readSelection(input.target.selectionToken):null;payload=await command({...input,target:selected?.target??input.target});selectionIdentity=selected?.identityId??null;selectionExpires=selected?.expiresAt??null;}catch(error){if(error instanceof Fault&&error.code==='VALIDATION_ERROR')invalid=true;else throw error;}
 const outcome=await rpc<{data?:{replayed:boolean},error?:{code:string}}>('gateway_submit_favorite',{p_token_hash:tokenHash,p_payload:payload,p_selection_identity:selectionIdentity,p_selection_expires_at:selectionExpires,p_validation_error:invalid});
 if(outcome.error)throw new Fault(outcome.error.code in errorStatuses?outcome.error.code as ErrorCode:'INTERNAL_ERROR');if(!outcome.data)throw new Fault('INTERNAL_ERROR');return json(outcome.data,outcome.data.replayed?200:201);
 }
 const session=await identity(req);const actor=session.identityId;
 if(route==='/me'&&method==='GET')return json(await rpc('gateway_me',{p_actor:actor}));
 if(route==='/me/favorites'&&method==='GET')return json(await rpc('gateway_my_favorites',{p_actor:actor,p_cursor:url.searchParams.get('cursor')}));
 if(route==='/places/search'&&method==='GET'){
 const q=parse(v.text(100),url.searchParams.get('q'));const page=parse(z.coerce.number().int().min(1).max(45),url.searchParams.get('page')??1);await rate('search',actor);
 const search=new URL('https://dapi.kakao.com/v2/local/search/keyword.json');search.searchParams.set('query',q);search.searchParams.set('page',String(page));search.searchParams.set('size','15');search.searchParams.set('x','127.0632');search.searchParams.set('y','37.5088');search.searchParams.set('sort','distance');
 const response=await fetch(search,{headers:{Authorization:'KakaoAK '+Deno.env.get('KAKAO_REST_KEY')},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Fault('DEPENDENCY_UNAVAILABLE');const result=await response.json();
 const places=await Promise.all(result.documents.map(async(p:any)=>{const value={placeId:p.id,name:p.place_name,address:p.road_address_name||p.address_name,lng:Number(p.x),lat:Number(p.y),identityId:actor,expiresAt:Date.now()+1800000};return {...value,selectionToken:await signSelection(value)};}));return json({places,isEnd:result.meta.is_end});
 }
 if(route==='/uploads'&&method==='POST'){
 await rate('media',actor,20);const payload=await command(parse(v.uploadSchema,await body(req)));const asset=await rpc('gateway_reserve_media',{p_actor:actor,p_payload:payload});
 const expiresAt=new Date(Date.now()+2*3600000+60000).toISOString();await rpc('gateway_extend_upload',{p_actor:actor,p_asset_id:asset.assetId,p_expires_at:expiresAt});
 const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(asset.rawObjectKey,{upsert:false});if(error||!data)throw new Fault('DEPENDENCY_UNAVAILABLE');const publicBase=Deno.env.get('PUBLIC_SUPABASE_URL');const signedUrl=publicBase?publicBase.replace(/\/$/,'')+new URL(data.signedUrl).pathname+new URL(data.signedUrl).search:data.signedUrl;return json({...asset,signedUrl,token:data.token,path:data.path,uploadExpiresAt:expiresAt});
 }
 await rate('participant-command',actor);
 if(route==='/me'&&method==='PATCH')return json(await rpc('gateway_edit_profile',{p_actor:actor,p_payload:await command(parse(v.profileSchema,await body(req)))}));
 const favorite=route.match(/^\/favorites\/([^/]+)$/);
 if(favorite&&['PATCH','DELETE'].includes(method)){const payload=await command({...parse(method==='PATCH'?v.editFavoriteSchema:v.deleteSchema,await body(req)),id:parse(v.uuid,favorite[1])});return json(await rpc(method==='PATCH'?'gateway_edit_favorite':'gateway_delete_favorite',{p_actor:actor,p_payload:payload}));}
 throw new Fault('VALIDATION_ERROR');
});
Deno.serve(serve);

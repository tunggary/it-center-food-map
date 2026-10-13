import {finalizeSchema} from '../../../shared/validation.ts';
import {admin,body,bucket,Fault,handler,identity,json,rate,rpc,sha256} from '../_shared/runtime.ts';
import {normalizeImage} from './image.ts';
export const serve=handler(async req=>{
 if(req.method!=='POST')throw new Fault('VALIDATION_ERROR');const session=await identity(req);await rate('media',session.identityId,20);
 const input=finalizeSchema.safeParse(await body(req));if(!input.success)throw new Fault('VALIDATION_ERROR');
 const claim=await rpc('gateway_claim_media',{p_actor:session.identityId,p_asset_id:input.data.assetId});
 if(claim.state==='ready')return json(claim);if(claim.state==='pending')return json(claim,202);
 try{
 const {data,error}=await admin.storage.from(bucket).download(claim.rawObjectKey);if(error||!data)throw new Fault('DEPENDENCY_UNAVAILABLE');if(data.size>524288)throw new Fault('MEDIA_TOO_LARGE');
 const {full,thumb}=await normalizeImage(new Uint8Array(await data.arrayBuffer()));
 const [fullHash,thumbHash]=await Promise.all([sha256(full),sha256(thumb)]);
 // Object keys and writer lease are recorded by claim before any upload; immutable upsert=false.
 const uploaded=await Promise.all([admin.storage.from(bucket).upload(claim.finalObjectKey,full,{contentType:'image/jpeg',upsert:false}),admin.storage.from(bucket).upload(claim.thumbObjectKey,thumb,{contentType:'image/jpeg',upsert:false})]);
 if(uploaded.some(x=>x.error))throw new Fault('DEPENDENCY_UNAVAILABLE');
 return json(await rpc('gateway_complete_media',{p_actor:session.identityId,p_payload:{assetId:input.data.assetId,leaseToken:claim.leaseToken,fullBytes:full.length,thumbBytes:thumb.length,fullSha256:fullHash,thumbSha256:thumbHash}}));
 }catch(error){await rpc('gateway_fail_media',{p_actor:session.identityId,p_asset_id:input.data.assetId,p_lease_token:claim.leaseToken}).catch(()=>{});if(error instanceof Fault)throw error;throw new Fault(error instanceof Error&&error.message==='MEDIA_TOO_LARGE'?'MEDIA_TOO_LARGE':'VALIDATION_ERROR');}
});
Deno.serve(serve);

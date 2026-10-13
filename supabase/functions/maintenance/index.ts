import {admin,bucket,Fault,handler,json,rpc,sha256} from '../_shared/runtime.ts';
async function authorized(req:Request){const a=await sha256(req.headers.get('X-Maintenance-Secret')??'');const secret=Deno.env.get('MAINTENANCE_SECRET');if(!secret)throw new Fault('FORBIDDEN');const b=await sha256(secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);if(diff)throw new Fault('FORBIDDEN');}
export const serve=handler(async req=>{
 if(req.method!=='POST')throw new Fault('FORBIDDEN');await authorized(req);
 const claims=await rpc<{objectKey:string,leaseToken:string}[]>('gateway_claim_cleanup',{p_limit:100});
 for(const claim of claims){const {error}=await admin.storage.from(bucket).remove([claim.objectKey]);let success=false;if(!error){const probe=await admin.storage.from(bucket).download(claim.objectKey);success=!!probe.error&&(String((probe.error as any).statusCode)==='404'||String((probe.error as any).statusCode)==='400'&&probe.error.message==='Object not found');}
 await rpc('gateway_finish_cleanup',{p_payload:{...claim,success}});}
 if(new URL(req.url).searchParams.get('reconcile')==='true'){
 // Enumerate the complete private bucket recursively; partial pages never mark reconciliation complete.
 const stack=[''];let failed=false;while(stack.length){const prefix=stack.pop()!;let offset=0;while(true){const {data,error}=await admin.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error||!data){failed=true;break;}const objects=[];for(const item of data){const objectKey=prefix?prefix+'/'+item.name:item.name;if(!item.id)stack.push(objectKey);else objects.push({objectKey,byteSize:item.metadata?.size??0});}if(objects.length)await rpc('gateway_reconcile_media',{p_payload:{objects,complete:false}});if(data.length<100)break;offset+=data.length;}}
 if(!failed)await rpc('gateway_reconcile_media',{p_payload:{objects:[],complete:true}});
 }
 return json({claimed:claims.length});
});
Deno.serve(serve);

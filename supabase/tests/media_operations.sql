\set ON_ERROR_STOP on
begin;
-- Keep existing local QA fixtures intact: truncation is rolled back with each test.
truncate app_private.favorites cascade;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERTION: %',p_message;end if;end$$;
do $$declare actor uuid;other uuid;asset jsonb;claim jsonb;request uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();second uuid:=gen_random_uuid();run jsonb;held bigint;k text;begin
actor:=(public.gateway_session(repeat('b',64))->>'identityId')::uuid;other:=(public.gateway_session(repeat('c',64))->>'identityId')::uuid;
asset:=public.gateway_reserve_media(actor,jsonb_build_object('requestKey',request,'payloadHash','upload','byteSize',1024));
perform pg_temp.assert((public.gateway_reserve_media(actor,jsonb_build_object('requestKey',request,'payloadHash','upload','byteSize',1024))->>'assetId')=asset->>'assetId','duplicate reservation');
select sum(reserved_bytes) into held from app_private.media_objects;perform pg_temp.assert(held=1114112,'initial reserved bytes');
begin perform public.gateway_claim_media(other,(asset->>'assetId')::uuid);raise exception 'missing owner rejection';exception when raise_exception then if sqlerrm<>'PHOTO_GONE' then raise;end if;end;
claim:=public.gateway_claim_media(actor,(asset->>'assetId')::uuid);perform pg_temp.assert(claim->>'state'='processing','claim');perform pg_temp.assert(public.gateway_claim_media(actor,(asset->>'assetId')::uuid)->>'state'='pending','concurrent processing');
perform public.gateway_complete_media(actor,jsonb_build_object('assetId',asset->>'assetId','leaseToken',claim->>'leaseToken','fullBytes',1000,'thumbBytes',100,'fullSha256',repeat('a',64),'thumbSha256',repeat('b',64)));
perform pg_temp.assert((select sum(reserved_bytes) from app_private.media_objects)=524288+1100,'raw reservation remains');
begin perform public.gateway_photo((asset->>'assetId')::uuid,'full');raise exception 'temporary public access';exception when raise_exception then if sqlerrm<>'PHOTO_GONE' then raise;end if;end;
perform pg_temp.assert(jsonb_array_length(public.gateway_claim_cleanup())=0,'signed raw expiry');
insert into app_private.admin_users(auth_user_id) values(admin),(second);
run:=public.gateway_start_backup(admin,jsonb_build_object('requestKey',request));perform pg_temp.assert(public.gateway_start_backup(admin,jsonb_build_object('requestKey',request))->>'id'=run->>'id','backup replay');
begin perform public.gateway_start_backup(second,jsonb_build_object('requestKey',gen_random_uuid()));raise exception 'parallel backups';exception when raise_exception then if sqlerrm<>'BACKUP_IN_PROGRESS' then raise;end if;end;
update app_private.media_objects set upload_expires_at=now()-interval '1 second' where variant='raw';perform pg_temp.assert(jsonb_array_length(public.gateway_claim_cleanup())=0,'backup cleanup hold');
perform public.gateway_update_backup(admin,(run->>'id')::uuid,jsonb_build_object('action','fail','leaseToken',run->>'lease_token','errorCode','OPERATOR_CANCELLED'));
claim:=public.gateway_claim_cleanup()->0;k:=claim->>'objectKey';perform pg_temp.assert(k is not null,'cleanup resumes');
perform public.gateway_finish_cleanup(jsonb_build_object('objectKey',k,'leaseToken',claim->>'leaseToken','success',false));perform pg_temp.assert((select reserved_bytes from app_private.media_objects where object_key=k)=524288,'failed delete holds capacity');
update app_private.cleanup_jobs set next_attempt_at=now() where object_key=k;claim:=public.gateway_claim_cleanup()->0;perform public.gateway_finish_cleanup(jsonb_build_object('objectKey',k,'leaseToken',claim->>'leaseToken','success',true));perform public.gateway_finish_cleanup(jsonb_build_object('objectKey',k,'leaseToken',claim->>'leaseToken','success',true));perform pg_temp.assert((select sum(reserved_bytes) from app_private.media_objects)=1100,'capacity release once');
perform public.gateway_reconcile_media(jsonb_build_object('objects',jsonb_build_array(jsonb_build_object('objectKey',k,'byteSize',1024)),'complete',true));perform pg_temp.assert((select reserved_bytes from app_private.media_objects where object_key=k)=1024,'late raw restored capacity');
end$$;
rollback;

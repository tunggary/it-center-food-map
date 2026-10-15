\set ON_ERROR_STOP on
begin;
truncate app_private.favorites cascade;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERTION: %',p_message;end if;end$$;
do $$
declare actor uuid;result jsonb;payload jsonb;target uuid;fav uuid;events_before bigint;revision_before bigint;
begin
actor:=(public.gateway_session(repeat('e',64))->>'identityId')::uuid;
payload:=jsonb_build_object('requestKey',gen_random_uuid(),'payloadHash','empty-message','target',jsonb_build_object('type','course','name','문구 선택 검증','points','[[127,37],[127.001,37.001]]'::jsonb),'profile',jsonb_build_object('nickname','선택검증','teamId','10000000-0000-4000-8000-000000000001'),'categoryId','20000000-0000-4000-8000-000000000003','message','','photos','[]'::jsonb);
result:=public.gateway_create_favorite(actor,payload);fav:=(result->>'resourceId')::uuid;target:=(result->>'targetId')::uuid;
perform pg_temp.assert((select message='' from app_private.favorites where id=fav),'empty string stored');
perform pg_temp.assert((public.gateway_create_favorite(actor,payload)->>'replayed')::boolean,'empty command replay');
perform pg_temp.assert(public.read_target(target)->'favorites'->0->>'message'='','public read empty string');
perform pg_temp.assert(public.gateway_my_favorites(actor)->'favorites'->0->>'message'='','owner read empty string');
perform pg_temp.assert((public.read_target(target)->>'totalCount')::int=1,'empty registration counted');
perform pg_temp.assert((select cnt=1 and rnk=1 from app_private.rankings(null,null) where target_id=target),'empty registration ranked');
perform pg_temp.assert(not(public.read_announcement(result->>'revision')->>'skip')::boolean,'empty registration announced');
select count(*) into events_before from app_private.registration_events;
select revision into revision_before from app_private.app_state where id=1;
perform public.gateway_edit_favorite(actor,jsonb_build_object('id',fav,'requestKey',gen_random_uuid(),'payloadHash','add-message','expectedVersion',1,'categoryId','20000000-0000-4000-8000-000000000003','message','한마디 추가','photos','[]'::jsonb));
perform public.gateway_edit_favorite(actor,jsonb_build_object('id',fav,'requestKey',gen_random_uuid(),'payloadHash','clear-message','expectedVersion',2,'categoryId','20000000-0000-4000-8000-000000000003','message','','photos','[]'::jsonb));
perform pg_temp.assert((select message='' and version=3 from app_private.favorites where id=fav),'clear existing introduction');
perform pg_temp.assert((select count(*)=events_before from app_private.registration_events),'editing creates no announcement');
perform pg_temp.assert((public.read_target(target)->>'totalCount')::int=1,'editing keeps count');
perform pg_temp.assert((select revision=revision_before+2 from app_private.app_state where id=1),'editing increments revision');
begin update app_private.favorites set message=null where id=fav;raise exception 'NULL accepted';exception when not_null_violation then null;end;
begin update app_private.favorites set message=repeat('x',8193) where id=fav;raise exception 'oversize accepted';exception when check_violation then null;end;
update app_private.favorites set message=repeat('x',8192) where id=fav;
end$$;
rollback;

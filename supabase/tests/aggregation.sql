\set ON_ERROR_STOP on
begin;
-- Keep existing local QA fixtures intact: truncation is rolled back with each test.
truncate app_private.favorites cascade;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERTION: %',p_message;end if;end$$;
do $$declare actors uuid[]:='{}';r jsonb;t uuid[]:='{}';i int;j int;admin uuid:=gen_random_uuid();preview jsonb;payload jsonb;begin
for i in 1..3 loop actors:=array_append(actors,(public.gateway_session(lpad(i::text,64,'0'))->>'identityId')::uuid);end loop;
for i in 1..3 loop
for j in 1..(case when i=3 then 1 else 2 end) loop
payload:=jsonb_build_object('requestKey',gen_random_uuid(),'payloadHash',i::text||j::text,'categoryId','20000000-0000-4000-8000-000000000001','message','집계','photos','[]'::jsonb,'target',jsonb_build_object('type','place','placeId','FIX-'||i,'name','집계 장소 '||i,'lng',127+i*0.001,'lat',37));
if public.gateway_me(actors[j]) is null then payload:=payload||jsonb_build_object('profile',jsonb_build_object('nickname','동명','teamId','10000000-0000-4000-8000-000000000001'));end if;r:=public.gateway_create_favorite(actors[j],payload);if j=1 then t:=array_append(t,(r->>'targetId')::uuid);end if;
end loop;end loop;
perform pg_temp.assert((select string_agg(v->>'rank',',' order by (v->>'rank')::int) from jsonb_array_elements(public.read_explore()->'rankingPage') v)='1,1,3','competition ranking');
perform pg_temp.assert((public.read_target(t[1])->>'totalCount')::int=2,'photo-independent count');
perform pg_temp.assert((select count(*) from app_private.targets where provider='kakao' and place_id='FIX-1')=1,'same provider id consolidation');
insert into app_private.admin_users(auth_user_id) values(admin);
preview:=public.gateway_admin_read(admin,'deletion-preview',t[1]);
r:=public.gateway_create_favorite(actors[3],jsonb_build_object('requestKey',gen_random_uuid(),'payloadHash','late','categoryId','20000000-0000-4000-8000-000000000001','message','늦은 등록','photos','[]'::jsonb,'target',jsonb_build_object('type','existing','targetId',t[1]),'profile',jsonb_build_object('nickname','세 번째','teamId','10000000-0000-4000-8000-000000000002')));
begin perform public.gateway_admin_command(admin,jsonb_build_object('action','delete_target','id',t[1],'requestKey',gen_random_uuid(),'payloadHash','delete-old','expectedVersion',preview->'version','expectedCount',preview->'count'));raise exception 'unconfirmed delete';exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
preview:=public.gateway_admin_read(admin,'deletion-preview',t[1]);perform public.gateway_admin_command(admin,jsonb_build_object('action','delete_target','id',t[1],'requestKey',gen_random_uuid(),'payloadHash','delete-new','expectedVersion',preview->'version','expectedCount',preview->'count'));
begin perform public.read_target(t[1]);raise exception 'missing target was readable';exception when raise_exception then if sqlerrm<>'TARGET_GONE' then raise;end if;end;
perform pg_temp.assert(not exists(select 1 from app_private.favorites where target_id=t[1]),'whole delete atomic');
begin perform public.gateway_identity(repeat('f',64));raise exception 'missing identity accepted';exception when raise_exception then if sqlerrm<>'IDENTITY_REQUIRED' then raise;end if;end;
perform pg_temp.assert(not exists(select 1 from app_private.browser_identities where token_hash=repeat('f',64)),'lookup did not create identity');
end$$;
rollback;

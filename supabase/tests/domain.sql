\set ON_ERROR_STOP on
begin;
-- Keep existing local QA fixtures intact: truncation is rolled back with each test.
truncate app_private.favorites cascade;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERTION: %',p_message;end if;end$$;
select pg_temp.assert(not has_schema_privilege('anon','app_private','usage'),'anon private schema access');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'gateway_%' and(has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))),'gateway access');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'gateway_%' or p.proname like 'read_%') and not 'search_path=""'=any(p.proconfig)),'unsafe search path');
do $$declare actor uuid;result jsonb;again jsonb;target uuid;fav uuid;request uuid:=gen_random_uuid();payload jsonb;admin uuid:=gen_random_uuid();version integer;begin
actor:=(public.gateway_session(repeat('a',64))->>'identityId')::uuid;
perform pg_temp.assert(public.gateway_me(actor) is null,'session created a profile');
payload:=jsonb_build_object('requestKey',request,'payloadHash','hash1','target',jsonb_build_object('type','course','name','테스트 산책','points','[[127,37],[127.001,37.001]]'::jsonb),'profile',jsonb_build_object('nickname','참여자','teamId','10000000-0000-4000-8000-000000000001'),'categoryId','20000000-0000-4000-8000-000000000003','message','함께 걸어요','photos','[]'::jsonb);
result:=public.gateway_create_favorite(actor,payload);again:=public.gateway_create_favorite(actor,payload);fav:=(result->>'resourceId')::uuid;target:=(result->>'targetId')::uuid;
perform pg_temp.assert(again->>'resourceId'=result->>'resourceId' and(again->>'replayed')::boolean,'idempotent result');
perform pg_temp.assert((select count(*) from app_private.registration_events where favorite_id=fav)=1,'duplicate event');
perform pg_temp.assert((public.read_target(target)->>'totalCount')::int=1,'detail count');
perform pg_temp.assert((public.read_explore(null,null)->'rankingPage'->0->>'rank')::int=1,'ranking');
begin perform public.gateway_create_favorite(actor,payload||jsonb_build_object('payloadHash','different'));raise exception 'missing payload conflict';exception when raise_exception then if sqlerrm<>'REQUEST_KEY_CONFLICT' then raise;end if;end;
insert into app_private.admin_users(auth_user_id) values(admin);
version:=((public.gateway_me(actor))->>'version')::int;
perform public.gateway_admin_command(admin,jsonb_build_object('action','edit_participant_team','requestKey',gen_random_uuid(),'payloadHash','team','id',(public.gateway_me(actor)->>'id'),'teamId','10000000-0000-4000-8000-000000000002','expectedVersion',version));
perform pg_temp.assert(jsonb_array_length(public.read_explore('10000000-0000-4000-8000-000000000001',null)->'pins')=0,'team changed old aggregate');
perform pg_temp.assert(jsonb_array_length(public.read_explore('10000000-0000-4000-8000-000000000002',null)->'pins')=1,'team changed new aggregate');
begin perform public.gateway_delete_favorite(actor,jsonb_build_object('id',fav,'requestKey',gen_random_uuid(),'payloadHash','bad','expectedVersion',99));raise exception 'missing version conflict';exception when raise_exception then if sqlerrm<>'VERSION_CONFLICT' then raise;end if;end;
perform public.gateway_delete_favorite(actor,jsonb_build_object('id',fav,'requestKey',gen_random_uuid(),'payloadHash','del','expectedVersion',1));
perform pg_temp.assert(jsonb_array_length(public.read_explore()->'pins')=0,'zero count excluded');
perform pg_temp.assert((public.read_target(target)->>'totalCount')::int=0,'zero target remains');
perform pg_temp.assert((public.read_announcement(result->>'revision')->>'skip')::boolean,'deleted announcement skips');
begin perform public.gateway_create_favorite(actor,payload);raise exception 'missing gone result';exception when raise_exception then if sqlerrm<>'RESULT_GONE' then raise;end if;end;
end$$;
rollback;

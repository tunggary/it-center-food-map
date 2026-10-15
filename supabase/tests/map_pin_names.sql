\set ON_ERROR_STOP on
begin;
truncate app_private.favorites cascade;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'ASSERTION: %',message; end if; end$$;
do $$
declare actor uuid; team uuid; category uuid; course_category uuid; tid uuid; i int; snapshot jsonb;
begin
 select id into team from app_private.teams order by id limit 1;
 select id into category from app_private.categories where kind='PLACE' order by id limit 1;
 select id into course_category from app_private.categories where kind='COURSE' order by id limit 1;
 insert into app_private.browser_identities(token_hash) values(encode(extensions.gen_random_bytes(32),'hex')) returning id into actor;
 insert into app_private.participants(identity_id,nickname,team_id) values(actor,'클러스터 시험',team) returning id into actor;
 for i in 1..22 loop
  if i=22 then
   insert into app_private.targets(kind,name,lng,lat,route_json,approximate_length_m) values('COURSE','묶음 코스',127,37,'{"type":"LineString","coordinates":[[127,37],[127.1,37.1]]}',100) returning id into tid;
  else
   insert into app_private.targets(kind,name,provider,place_id,lng,lat) values('PLACE','묶음 장소 '||i,'kakao',gen_random_uuid()::text,127,37) returning id into tid;
  end if;
  insert into app_private.favorites(participant_id,target_id,category_id,kind,message) values(actor,tid,case when i=22 then course_category else category end,case when i=22 then 'COURSE' else 'PLACE' end,'');
 end loop;
 snapshot:=public.read_explore();
 perform pg_temp.assert(jsonb_array_length(snapshot->'pins')=22 and jsonb_array_length(snapshot->'rankingPage')=20,'all pins independent of ranking pagination');
 perform pg_temp.assert((select bool_and(pin->>'name'=t.name and (pin->>'count')::int=1) from jsonb_array_elements(snapshot->'pins') pin join app_private.targets t on t.id=(pin->>'targetId')::uuid),'every pin includes current name and count');
 perform pg_temp.assert(public.read_explore(null,null,2)->'pins'=snapshot->'pins','page two preserves all named pins');
 perform pg_temp.assert(public.read_booth()->'pins'=snapshot->'pins','booth inherits named pins');
 perform pg_temp.assert(jsonb_array_length(public.read_explore(team,course_category)->'pins')=1,'course filter unchanged');
 perform pg_temp.assert((public.read_booth(course_category)->'pins'->0->>'name')='묶음 코스','filtered booth course name');
 perform pg_temp.assert(public.read_explore(gen_random_uuid())->'pins'='[]'::jsonb,'empty filter unchanged');
end$$;
select pg_temp.assert(proowner='foodmap_gateway'::regrole and prosecdef and proconfig=array['search_path=""'], 'owner and security boundary preserved') from pg_proc where oid='public.read_explore(uuid,uuid,integer)'::regprocedure;
select pg_temp.assert(not has_table_privilege('anon','app_private.targets','SELECT'),'no new table access');
set local role anon;
select pg_temp.assert(jsonb_array_length(public.read_explore()->'pins')=22,'anonymous public read');
rollback;

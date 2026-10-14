\set ON_ERROR_STOP on
begin;
-- All fixtures are transaction-local; existing QA data is restored on rollback.
truncate app_private.favorites cascade;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_ok,false) then raise exception 'ASSERTION: %',p_message;end if;end$$;
do $$
declare actors uuid[]:='{}';target_ids uuid[]:='{}';actor uuid;tid uuid;team uuid;category uuid;course_category uuid;i int;j int;r jsonb;page jsonb;cursor text;rev text;
begin
 select id into team from app_private.teams order by id limit 1;
 select id into category from app_private.categories where kind='PLACE' order by id limit 1;
 select id into course_category from app_private.categories where kind='COURSE' order by id limit 1;
 for i in 1..22 loop
  insert into app_private.browser_identities(token_hash) values(encode(extensions.gen_random_bytes(32),'hex')) returning id into actor;
  insert into app_private.participants(identity_id,nickname,team_id) values(actor,'순위 검증 '||i,team) returning id into actor;
  actors:=array_append(actors,actor);
 end loop;
 for i in 1..5 loop
  if i=3 then
   insert into app_private.targets(kind,name,lng,lat,route_json,approximate_length_m) values('COURSE','순위 검증 코스',127,37,'[[127,37],[127.1,37.1]]',123) returning id into tid;
  else
   insert into app_private.targets(kind,name,provider,place_id,address,lng,lat) values('PLACE','순위 검증 장소 '||i,'kakao',gen_random_uuid()::text,'서울',127,37) returning id into tid;
  end if;
  target_ids:=array_append(target_ids,tid);
  if i<5 then
   for j in 1..(22-i) loop
    insert into app_private.favorites(participant_id,target_id,category_id,kind,message) values(actors[j],tid,case when i=3 then course_category else category end,case when i=3 then 'COURSE' else 'PLACE' end,'순위 검증');
   end loop;
  end if;
 end loop;
 for i in 1..4 loop
  r:=public.read_target(target_ids[i]);
  perform pg_temp.assert((r->>'overallRank')::int=i and (r->>'overallRankTied')::boolean=false,'single global rank '||i);
  perform pg_temp.assert((r->>'totalCount')::int=22-i,'same snapshot count');
 end loop;
 r:=public.read_target(target_ids[5]);
 perform pg_temp.assert(r->'overallRank'='null'::jsonb and (r->>'overallRankTied')::boolean=false,'unranked zero registrations');
 r:=public.read_target(target_ids[2],null,course_category);
 perform pg_temp.assert((r->>'filteredCount')::int=0 and (r->>'totalCount')::int=20 and (r->>'overallRank')::int=2,'category filter does not alter global rank');
 r:=public.read_target(target_ids[2],gen_random_uuid(),null);
 perform pg_temp.assert((r->>'filteredCount')::int=0 and (r->>'overallRank')::int=2,'team filter does not alter global rank');
 page:=public.read_target(target_ids[1]);cursor:=page->>'nextCursor';rev:=page->>'revision';
 perform pg_temp.assert(jsonb_array_length(page->'favorites')=20 and cursor is not null,'detail page size');
 r:=public.read_target(target_ids[1],null,null,cursor,rev);
 perform pg_temp.assert(jsonb_array_length(r->'favorites')=1 and r->'nextCursor'='null'::jsonb and r->'overallRank'=page->'overallRank','cursor rank and count preserved');
 begin perform public.read_target(target_ids[1],null,null,cursor,'-1');raise exception 'revision guard missing';exception when raise_exception then if sqlerrm<>'SNAPSHOT_CHANGED' then raise;end if;end;
 perform app_private.bump(); -- Fixtures bypass the gateway command that normally advances revision.
 insert into app_private.favorites(participant_id,target_id,category_id,kind,message) values(actors[21],target_ids[2],category,'PLACE','공동 1위');
 for i in 1..3 loop
  r:=public.read_target(target_ids[i]);
  perform pg_temp.assert((r->>'overallRank')::int=case when i<=2 then 1 else 3 end,'competition rank 1,1,3');
  perform pg_temp.assert((r->>'overallRankTied')::boolean=(i<=2),'global tie flag');
 end loop;
 insert into app_private.favorites(participant_id,target_id,category_id,kind,message) values(actors[20],target_ids[3],course_category,'COURSE','공동 3위'),(actors[19],target_ids[4],category,'PLACE','공동 3위'),(actors[20],target_ids[4],category,'PLACE','공동 3위');
 r:=public.read_target(target_ids[3]);
 perform pg_temp.assert((r->>'overallRank')::int=3 and (r->>'overallRankTied')::boolean,'course shares global third place');
 delete from app_private.favorites where target_id=target_ids[2] and participant_id=actors[21];
 r:=public.read_target(target_ids[2]);
 perform pg_temp.assert((r->>'overallRank')::int=2 and (r->>'overallRankTied')::boolean,'place and course share global second place after deletion');
 perform pg_temp.assert((r->>'revision')::bigint>rev::bigint,'revision changes with registrations');
 delete from app_private.targets where id=target_ids[5];
 begin perform public.read_target(target_ids[5]);raise exception 'deleted target readable';exception when raise_exception then if sqlerrm<>'TARGET_GONE' then raise;end if;end;
 perform pg_temp.assert((select pg_get_userbyid(proowner)='foodmap_gateway' from pg_proc where oid='public.read_target(uuid,uuid,uuid,text,text)'::regprocedure),'gateway owner preserved');
 perform pg_temp.assert(has_function_privilege('anon','public.read_target(uuid,uuid,uuid,text,text)','EXECUTE'),'anonymous read preserved');
end$$;
rollback;

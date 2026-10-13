-- Non-production performance fixture. Execute only through scripts/seed-load-fixture.py.
begin;
create temporary table load_teams as select i,gen_random_uuid() id from generate_series(1,30) i;
create temporary table load_categories as select i,gen_random_uuid() id from generate_series(1,10) i;
create temporary table load_people as select i,gen_random_uuid() identity_id,gen_random_uuid() id from generate_series(1,100) i;
create temporary table load_targets as select i,gen_random_uuid() id from generate_series(1,1000) i;
insert into app_private.teams(id,name,normalized_name) select id,'부하 팀 '||i,'부하 팀 '||i from load_teams;
insert into app_private.categories(id,name,normalized_name,kind) select id,'부하 분류 '||i,'부하 분류 '||i,'PLACE' from load_categories;
insert into app_private.browser_identities(id,token_hash) select identity_id,md5(identity_id::text)||md5(id::text) from load_people;
insert into app_private.participants(id,identity_id,nickname,team_id) select p.id,p.identity_id,'부하 참여자 '||p.i,t.id from load_people p join load_teams t on t.i=(p.i-1)%30+1;
insert into app_private.targets(id,kind,name,provider,place_id,lng,lat) select id,'PLACE','부하 장소 '||i,'kakao','LOAD-'||id,127+(i%100)*0.0001,37+(i/100)*0.0001 from load_targets;
insert into app_private.favorites(participant_id,target_id,category_id,kind,message) select p.id,t.id,c.id,'PLACE','부하 검증용 등록' from load_targets t cross join generate_series(1,10) j join load_people p on p.i=(t.i+j)%100+1 join load_categories c on c.i=j;
update app_private.app_state set revision=revision+1,updated_at=now() where id=1;
commit;

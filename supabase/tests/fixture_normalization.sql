\set ON_ERROR_STOP on
begin;
do $$begin
begin
insert into app_private.teams(name,normalized_name) values('b팀','b팀');
raise exception 'FIXTURE_NORMALIZATION: b팀 duplicate was accepted';
exception when unique_violation then null;
end;
begin
insert into app_private.teams(name,normalized_name) values('c팀','c팀');
raise exception 'FIXTURE_NORMALIZATION: c팀 duplicate was accepted';
exception when unique_violation then null;
end;
end$$;
rollback;

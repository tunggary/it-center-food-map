-- Reapply only application ownership and ACLs after --no-owner restoration.
do $$begin
 if not exists(select 1 from pg_roles where rolname='foodmap_gateway') then create role foodmap_gateway nologin;end if;
 if exists(select 1 from pg_roles where rolname='foodmap_gateway' and(rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then raise exception 'Unsafe gateway owner role';end if;
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='foodmap_gateway') then raise exception 'Gateway owner must not inherit provider roles';end if;
end$$;
grant foodmap_gateway to postgres;
revoke all on schema app_private from public,anon,authenticated;
grant usage,create on schema public,app_private to foodmap_gateway;
do $$declare item record;begin
 for item in select tablename from pg_tables where schemaname='app_private' loop
  execute format('alter table app_private.%I owner to foodmap_gateway',item.tablename);
  execute format('alter table app_private.%I enable row level security',item.tablename);
 end loop;
 for item in select p.oid,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' or(n.nspname='public' and(p.proname like 'read_%' or p.proname like 'gateway_%')) loop
  execute format('alter function %s owner to foodmap_gateway',item.signature);
  execute format('alter function %s set search_path to %L',item.signature,'');
  execute format('revoke all on function %s from public,anon,authenticated',item.signature);
  if item.nspname='public' then
   if item.proname in('read_revision','read_catalog','read_explore','read_target','read_booth','read_events','read_announcement') then
    execute format('grant execute on function %s to anon,authenticated,service_role',item.signature);
   elsif item.proname like 'gateway_%' then
    execute format('grant execute on function %s to service_role',item.signature);
   end if;
  end if;
 end loop;
end$$;
revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on all sequences in schema app_private from public,anon,authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke create on schema public,app_private from foodmap_gateway;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema app_private revoke execute on functions from public;
alter default privileges for role foodmap_gateway in schema public revoke execute on functions from public;
alter default privileges for role foodmap_gateway in schema app_private revoke execute on functions from public;
alter role service_role set statement_timeout='1500ms';
alter role service_role set lock_timeout='1000ms';
-- Abort restoration before committing if the documented boundary is missing.
do $$begin
 if(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('read_revision','read_catalog','read_explore','read_target','read_booth','read_events','read_announcement'))<>7 then raise exception 'Missing public read contract';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where (n.nspname='app_private' or(n.nspname='public' and(p.proname like 'read_%' or p.proname like 'gateway_%'))) and(r.rolname<>'foodmap_gateway' or not 'search_path=""'=any(p.proconfig))) then raise exception 'Invalid function owner or search path';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'gateway_%' and(has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or not has_function_privilege('service_role',p.oid,'EXECUTE'))) then raise exception 'Invalid gateway ACL';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('read_revision','read_catalog','read_explore','read_target','read_booth','read_events','read_announcement') and(not p.prosecdef or not has_function_privilege('anon',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'Invalid public read ACL';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where (n.nspname='app_private' or(n.nspname='public' and(p.proname like 'read_%' or p.proname like 'gateway_%'))) and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'Public execute remains';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relkind='r' and(not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))) then raise exception 'Invalid private table boundary';end if;
end$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';

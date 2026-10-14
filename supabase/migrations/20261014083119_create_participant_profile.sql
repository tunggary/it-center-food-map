-- Profile creation is independent of favorite registration, using the existing command ledger.
create function public.gateway_create_profile(p_actor uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare participant app_private.participants;result jsonb;
begin
 perform app_private.require_identity(p_actor);
 perform 1 from app_private.app_state where id=1 for update;
 -- Recheck after acquiring the domain lock (including revocation during the wait).
 perform app_private.require_identity(p_actor);
 result:=app_private.replay('participant',p_actor,p_payload);
 if result is not null then return result;end if;
 if exists(select 1 from app_private.participants where identity_id=p_actor) then
  perform app_private.fail('VERSION_CONFLICT');
 end if;
 if not exists(select 1 from app_private.teams where id=(p_payload->>'teamId')::uuid and selectable)
   or p_payload->>'nickname' is null or length(btrim(p_payload->>'nickname'))=0 then
  perform app_private.fail('VALIDATION_ERROR');
 end if;
 insert into app_private.participants(identity_id,nickname,team_id)
 values(p_actor,p_payload->>'nickname',(p_payload->>'teamId')::uuid) returning * into participant;
 return app_private.record('participant',p_actor,p_payload,'create_profile',participant.id);
end$$;
revoke all on function public.gateway_create_profile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gateway_create_profile(uuid,jsonb) to service_role;
grant create on schema public to foodmap_gateway;
alter function public.gateway_create_profile(uuid,jsonb) owner to foodmap_gateway;
revoke create on schema public from foodmap_gateway;
notify pgrst,'reload schema';

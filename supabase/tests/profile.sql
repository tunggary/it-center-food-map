begin;
do $$
declare actor uuid;other uuid;result jsonb;again jsonb;payload jsonb;before_favorites bigint;before_targets bigint;before_events bigint;
begin
 select count(*) into before_favorites from app_private.favorites;
 select count(*) into before_targets from app_private.targets;
 select count(*) into before_events from app_private.registration_events;
 actor:=(public.gateway_session(encode(sha256(gen_random_uuid()::text::bytea),'hex'))->>'identityId')::uuid;
 payload:=jsonb_build_object('requestKey',gen_random_uuid(),'payloadHash','profile-test','nickname','프로필 검증','teamId','10000000-0000-4000-8000-000000000001');
 result:=public.gateway_create_profile(actor,payload);
 again:=public.gateway_create_profile(actor,payload);
 assert result->>'resourceId'=again->>'resourceId' and (again->>'replayed')::boolean;
 assert public.gateway_me(actor)->>'nickname'='프로필 검증';
 assert (select count(*) from app_private.participants where identity_id=actor)=1;
 assert (select count(*) from app_private.favorites)=before_favorites;
 assert (select count(*) from app_private.targets)=before_targets;
 assert (select count(*) from app_private.registration_events)=before_events;
 begin
  perform public.gateway_create_profile(actor,payload||jsonb_build_object('requestKey',gen_random_uuid(),'nickname','상대 탭'));
  raise exception 'duplicate profile accepted';
 exception when sqlstate 'P0001' then assert SQLERRM='VERSION_CONFLICT';end;
 assert public.gateway_me(actor)->>'nickname'='프로필 검증';
 begin
  perform public.gateway_create_profile(actor,payload||jsonb_build_object('payloadHash','different'));
  raise exception 'changed replay accepted';
 exception when sqlstate 'P0001' then assert SQLERRM='REQUEST_KEY_CONFLICT';end;
 other:=(public.gateway_session(encode(sha256(gen_random_uuid()::text::bytea),'hex'))->>'identityId')::uuid;
 update app_private.teams set selectable=false where id='10000000-0000-4000-8000-000000000001';
 begin
  perform public.gateway_create_profile(other,payload);
  raise exception 'inactive team accepted';
 exception when sqlstate 'P0001' then assert SQLERRM='VALIDATION_ERROR';end;
 assert public.gateway_me(other) is null;
 update app_private.browser_identities set revoked_at=now() where id=actor;
 begin
  perform public.gateway_create_profile(actor,payload);
  raise exception 'revoked token accepted';
 exception when sqlstate 'P0001' then assert SQLERRM='IDENTITY_EXPIRED';end;
 assert not has_function_privilege('anon','public.gateway_create_profile(uuid,jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','public.gateway_create_profile(uuid,jsonb)','EXECUTE');
 assert has_function_privilege('service_role','public.gateway_create_profile(uuid,jsonb)','EXECUTE');
 raise notice 'PASS: standalone profile, replay, conflict, inactive team, expiry, no favorite/event, privileges';
end$$;
rollback;

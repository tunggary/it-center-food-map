-- One HTTP round trip; failed business writes roll back without refunding rate attempts.
create function public.gateway_submit_favorite(
 p_token_hash text,p_payload jsonb,p_selection_identity uuid default null,
 p_selection_expires_at timestamptz default null,p_validation_error boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare identity app_private.browser_identities;result jsonb;code text;
begin
 -- Read without holding an identity row lock before app_state; the existing write gateway rechecks ownership.
 select * into identity from app_private.browser_identities where token_hash=p_token_hash;
 if not found then perform app_private.fail('IDENTITY_REQUIRED');end if;
 perform app_private.require_identity(identity.id);
 perform public.gateway_rate('participant-command',encode(pg_catalog.sha256(convert_to(identity.id::text,'UTF8')),'hex'),30,60);
 -- Preserve successful authentication's daily refresh, using the domain lock before the identity lock.
 if identity.last_seen_at<now()-interval '1 day' then
  begin
   perform 1 from app_private.app_state where id=1 for update;
   update app_private.browser_identities set expires_at=now()+interval '180 days',last_seen_at=now()
    where id=identity.id and revoked_at is null and expires_at>now() and last_seen_at<now()-interval '1 day';
  exception when query_canceled or lock_not_available then
   return jsonb_build_object('error',jsonb_build_object('code','DEPENDENCY_UNAVAILABLE'));
  end;
 end if;
 if p_validation_error then return jsonb_build_object('error',jsonb_build_object('code','VALIDATION_ERROR'));end if;
 -- A subtransaction keeps the outer rate charge when any business operation fails.
 begin
  if p_payload#>>'{target,type}'='place' and p_selection_identity is distinct from identity.id then perform app_private.fail('VALIDATION_ERROR');end if;
  result:=public.gateway_replay(identity.id,p_payload);
  if result is not null then return jsonb_build_object('data',result);end if;
  if p_payload#>>'{target,type}'='place' and(p_selection_expires_at is null or p_selection_expires_at<=clock_timestamp()) then perform app_private.fail('VALIDATION_ERROR');end if;
  result:=public.gateway_create_favorite(identity.id,p_payload);
  return jsonb_build_object('data',result);
 exception
  when sqlstate 'P0001' then
   get stacked diagnostics code=MESSAGE_TEXT;
   if code not in('VALIDATION_ERROR','IDENTITY_REQUIRED','IDENTITY_EXPIRED','FORBIDDEN','TARGET_GONE','PHOTO_GONE','ALREADY_REGISTERED','VERSION_CONFLICT','SNAPSHOT_CHANGED','REQUEST_KEY_CONFLICT','RESULT_GONE','CAPACITY_REACHED','RATE_LIMITED') then code:='INTERNAL_ERROR';end if;
   return jsonb_build_object('error',jsonb_build_object('code',code));
  when query_canceled or lock_not_available then
   return jsonb_build_object('error',jsonb_build_object('code','DEPENDENCY_UNAVAILABLE'));
  when others then
   return jsonb_build_object('error',jsonb_build_object('code','INTERNAL_ERROR'));
 end;
end$$;
revoke all on function public.gateway_submit_favorite(text,jsonb,uuid,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.gateway_submit_favorite(text,jsonb,uuid,timestamptz,boolean) to service_role;
grant create on schema public to foodmap_gateway;
alter function public.gateway_submit_favorite(text,jsonb,uuid,timestamptz,boolean) owner to foodmap_gateway;
revoke create on schema public from foodmap_gateway;
notify pgrst,'reload schema';

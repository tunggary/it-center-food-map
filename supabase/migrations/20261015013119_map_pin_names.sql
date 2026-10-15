SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.read_explore (
  p_team_id     uuid    DEFAULT NULL::uuid,
  p_category_id uuid    DEFAULT NULL::uuid,
  p_rank_page   integer DEFAULT 1
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$with r as(select * from app_private.rankings(p_team_id,p_category_id)),page as(select * from r order by cnt desc,target_id limit 20 offset (greatest(1,p_rank_page)-1)*20) select jsonb_build_object('revision',s.revision::text,'dataEpoch',s.data_epoch,'filters',jsonb_build_object('teamId',p_team_id,'categoryId',p_category_id),'pins',coalesce((select jsonb_agg(jsonb_build_object('targetId',target_id,'kind',kind,'name',name,'lng',lng,'lat',lat,'count',cnt) order by target_id) from r),'[]'::jsonb),'rankingPage',coalesce((select jsonb_agg(jsonb_build_object('targetId',target_id,'kind',kind,'name',name,'count',cnt,'rank',rnk) order by cnt desc,target_id) from page),'[]'::jsonb),'hasMore',(select count(*) from r)>greatest(1,p_rank_page)*20) from app_private.app_state s where id=1$function$;


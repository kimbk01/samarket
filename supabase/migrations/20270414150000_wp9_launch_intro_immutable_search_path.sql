-- WP-9 / 보안 린트 — launch_intro_publications_immutable search_path 고정
--
-- Supabase security advisor(function_search_path_mutable): 이 트리거 함수가
-- search_path 미설정이라 search_path 하이재킹 표면이 있다. 함수 본문은 어떤
-- 객체도 참조하지 않으므로 search_path 를 빈 문자열로 고정한다(가장 안전).
--
-- 동작 불변: 여전히 모든 쓰기(tg_op)에서 예외를 던져 publications 불변 유지.
-- apply-gated. CREATE OR REPLACE 멱등.

CREATE OR REPLACE FUNCTION public.launch_intro_publications_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'launch_intro_publications is immutable (%)', tg_op;
end;
$function$;

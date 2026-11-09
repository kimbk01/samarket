-- 배달 오픈 관리 — 배달 도메인 「정식 운영 / 매장 모집」 전환 (Owner 「배달 on/off·매장 모집 배너」 2026-11-10)
-- 광고 배너·광고 팝업(store_banner_ad_campaigns·platform_popup_*)과 별개 저장소.
--   delivery_launch_settings       1행 (id = 1). 기본값 mode='open' → 이 마이그레이션만으로 고객 화면은 바뀌지 않는다.
--   delivery_launch_settings_logs  저장할 때마다 전후 값·저장자·시각 (추가만).
--   save_delivery_launch_settings_cas  읽은 revision 일 때만 저장, 다르면 stale_revision (다른 관리자 저장 덮어쓰기 방지).
-- 접근: 서버(service_role)만. anon·authenticated 는 테이블·함수 모두 권한 없음 — 공개 화면은 서버 API 가 필요한 값만 내보낸다.
-- 운영 적용: Owner 승인 후. 롤백: 아래 DROP 3줄.
--   DROP FUNCTION IF EXISTS public.save_delivery_launch_settings_cas(bigint, text, date, boolean, boolean, jsonb, uuid);
--   DROP TABLE IF EXISTS public.delivery_launch_settings_logs;
--   DROP TABLE IF EXISTS public.delivery_launch_settings;

CREATE TABLE IF NOT EXISTS public.delivery_launch_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode text NOT NULL DEFAULT 'open' CHECK (mode IN ('open', 'recruiting')),
  -- 오픈 기념 무료 종료일(필리핀 날짜). NULL = 무료 없음 (Owner 2026-11-10: 나중에 어드민 입력)
  free_until date NULL,
  popup_enabled boolean NOT NULL DEFAULT true,
  fab_enabled boolean NOT NULL DEFAULT true,
  -- 배너·팝업 이미지 URL 과 언어별 문구 (ko·en). 형식은 lib/delivery/launch/delivery-launch-contract.ts
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  revision bigint NOT NULL DEFAULT 0,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.delivery_launch_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.delivery_launch_settings_logs (
  id bigserial PRIMARY KEY,
  revision bigint NOT NULL,
  actor_id uuid NULL,
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_launch_settings_logs_created_idx
  ON public.delivery_launch_settings_logs (created_at DESC);

ALTER TABLE public.delivery_launch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_launch_settings_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_launch_settings FROM anon, authenticated;
REVOKE ALL ON public.delivery_launch_settings_logs FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.delivery_launch_settings_logs_id_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_delivery_launch_settings_cas(
  p_expected_revision bigint,
  p_mode text,
  p_free_until date,
  p_popup_enabled boolean,
  p_fab_enabled boolean,
  p_content jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.delivery_launch_settings%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_new_revision bigint;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_expected_revision');
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('open', 'recruiting') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mode');
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_content');
  END IF;

  INSERT INTO public.delivery_launch_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_row FROM public.delivery_launch_settings WHERE id = 1 FOR UPDATE;

  IF v_row.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stale_revision',
      'current_revision', v_row.revision,
      'expected_revision', p_expected_revision
    );
  END IF;

  v_before := jsonb_build_object(
    'mode', v_row.mode,
    'free_until', v_row.free_until,
    'popup_enabled', v_row.popup_enabled,
    'fab_enabled', v_row.fab_enabled,
    'content', v_row.content
  );
  v_new_revision := v_row.revision + 1;

  UPDATE public.delivery_launch_settings
  SET mode = p_mode,
      free_until = p_free_until,
      popup_enabled = coalesce(p_popup_enabled, true),
      fab_enabled = coalesce(p_fab_enabled, true),
      content = p_content,
      revision = v_new_revision,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = 1;

  v_after := jsonb_build_object(
    'mode', p_mode,
    'free_until', p_free_until,
    'popup_enabled', coalesce(p_popup_enabled, true),
    'fab_enabled', coalesce(p_fab_enabled, true),
    'content', p_content
  );

  INSERT INTO public.delivery_launch_settings_logs (revision, actor_id, before_json, after_json)
  VALUES (v_new_revision, p_actor_id, v_before, v_after);

  RETURN jsonb_build_object('ok', true, 'revision', v_new_revision);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_delivery_launch_settings_cas(bigint, text, date, boolean, boolean, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_delivery_launch_settings_cas(bigint, text, date, boolean, boolean, jsonb, uuid)
  TO service_role;

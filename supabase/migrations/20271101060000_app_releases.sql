-- 앱 업데이트 v2 (Owner 「권장안 승인」 2026-11-01 · D-V1) — 스토어 출시 기록 (자동 수집 · 어드민 입력 없음).
-- 서버 예약 작업(app-releases-sync)만 쓴다. 회원은 서버 API 로만 읽는다(RLS deny all).

CREATE TABLE IF NOT EXISTS public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  version_name text NOT NULL CHECK (char_length(version_name) BETWEEN 1 AND 32),
  version_code integer NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  notes_ko text NULL,
  notes_en text NULL,
  store_url text NULL,
  rollout_status text NULL,
  source text NOT NULL CHECK (source IN ('play_api', 'itunes_lookup', 'device_seen')),
  notified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_releases_platform_version_uniq UNIQUE (platform, version_name)
);

CREATE INDEX IF NOT EXISTS app_releases_platform_released_idx
  ON public.app_releases (platform, released_at DESC);

COMMENT ON TABLE public.app_releases IS
  '스토어 출시 기록 — Play Developer API / App Store 조회 / 기기 보고 버전으로 자동 수집. 업데이트 내역·업데이트 안내 알림의 원본.';

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_releases_deny_all ON public.app_releases;
CREATE POLICY app_releases_deny_all ON public.app_releases FOR ALL USING (false) WITH CHECK (false);

-- down: DROP TABLE IF EXISTS public.app_releases;

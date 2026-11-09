-- 배달 오픈 관리 — 매장 확인 허용 계정 (Owner 「특정 아이디는 팝업이 안 보이게, 지정하면 매장 확인 가능」 2026-11-10 · 설계 v3.2 §3-4-3)
-- 매장 모집 중에도 이 계정(및 활성 관리자)은 배달 화면을 정식 운영 화면으로 본다(주문은 막힘 — 확인용).
-- 접근: 서버(service_role)만. 추가·삭제는 어드민 API 가 감사 로그를 남긴다.
-- 운영 적용: Owner 승인 후. 롤백: DROP TABLE IF EXISTS public.delivery_launch_reviewers;

CREATE TABLE IF NOT EXISTS public.delivery_launch_reviewers (
  user_id uuid PRIMARY KEY,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 80),
  added_by uuid NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.delivery_launch_reviewers IS
  'Accounts that see the delivery screens as "open" while recruiting (view only, orders still blocked). Server (service_role) only.';

ALTER TABLE public.delivery_launch_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_launch_reviewers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_launch_reviewers TO service_role;

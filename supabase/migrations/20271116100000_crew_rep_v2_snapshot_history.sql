-- CREW REP S2 (crew_rep_v2) — Owner 2026-11-16 「S2 진행해」
-- 설계: docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md §4.2~§4.4
-- 더하기만 한다(열·표 추가, 정책 행 추가). 기존 열·행은 지우지 않는다.

-- 1) 스냅샷: 축 점수·제재 감점
ALTER TABLE public.member_trust_snapshots
  ADD COLUMN IF NOT EXISTS axis_trade numeric,
  ADD COLUMN IF NOT EXISTS axis_manner numeric,
  ADD COLUMN IF NOT EXISTS axis_participation numeric,
  ADD COLUMN IF NOT EXISTS sanction_penalty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sanction_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.member_trust_snapshots.manner_battery_percent IS
  'CREW REP 점수 0~100 (crew_rep_v2 부터). 열 이름은 읽기 호환을 위해 유지.';

-- 2) 점수 이력 — 재계산 때 점수가 바뀌면 1행
CREATE TABLE IF NOT EXISTS public.member_trust_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score_before numeric,
  score_after numeric NOT NULL,
  axis_trade numeric,
  axis_manner numeric,
  axis_participation numeric,
  sanction_penalty numeric NOT NULL DEFAULT 0,
  cause text NOT NULL
    CHECK (cause IN ('event', 'reversal', 'admin', 'daily_recompute', 'policy_migration')),
  cause_event_id uuid,
  policy_version text NOT NULL,
  calculated_as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_trust_score_history_member_created_idx
  ON public.member_trust_score_history (member_id, created_at DESC);

COMMENT ON TABLE public.member_trust_score_history IS
  'CREW REP 점수 변경 이력 (서버 service role 만 쓰기·읽기). 원장 SSOT 는 trust_events.';

ALTER TABLE public.member_trust_score_history ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = anon·authenticated 접근 불가. 회원 화면은 서버 API 로만 제공한다(S6).

-- 3) 정책 행: crew_rep_v2 활성, manner_trade_v1 비활성 (계산 권한은 lib/trust/crew-rep-policy.ts)
UPDATE public.trust_score_policy SET active = false, effective_to = now()
  WHERE policy_version = 'manner_trade_v1' AND active = true;

INSERT INTO public.trust_score_policy (
  policy_version, active, range_min, range_max, neutral_score, window_days,
  trade_active, community_active, delivery_active, calculator_kind, calculator_params
) VALUES (
  'crew_rep_v2', true, 0, 100, 50, 365, true, true, true,
  'crew_rep_three_axis',
  jsonb_build_object(
    'axis_k', jsonb_build_object('trade', 10, 'manner', 20, 'participation', 40),
    'axis_weight', jsonb_build_object('trade', 0.5, 'manner', 0.3, 'participation', 0.2),
    'decay', jsonb_build_object('full_days', 180, 'half_mult', 0.5, 'window_days', 365),
    'pair_rule', jsonb_build_object('cooldown_days', 30, 'lifetime_max', 3),
    'participation_weekly_cap', 5,
    'suspension_cap', 39,
    'manual_adjustment_cap', 10,
    'authority', 'lib/trust/crew-rep-policy.ts'
  )
)
ON CONFLICT (policy_version) DO UPDATE SET active = true, effective_to = NULL;

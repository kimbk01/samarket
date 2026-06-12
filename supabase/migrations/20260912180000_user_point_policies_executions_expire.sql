-- 사용자 포인트: 정책·실행·만료·감사 테이블 (mock → DB)

BEGIN;

-- ---------------------------------------------------------------------------
-- board_point_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_point_policies (
  id text PRIMARY KEY,
  board_key text NOT NULL UNIQUE,
  board_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  write_reward_type text NOT NULL DEFAULT 'fixed',
  write_fixed_point integer NOT NULL DEFAULT 0,
  write_random_min integer NOT NULL DEFAULT 0,
  write_random_max integer NOT NULL DEFAULT 0,
  write_cooldown_seconds integer NOT NULL DEFAULT 0,
  comment_reward_type text NOT NULL DEFAULT 'fixed',
  comment_fixed_point integer NOT NULL DEFAULT 0,
  comment_random_min integer NOT NULL DEFAULT 0,
  comment_random_max integer NOT NULL DEFAULT 0,
  comment_cooldown_seconds integer NOT NULL DEFAULT 0,
  like_reward_point integer NOT NULL DEFAULT 0,
  report_reward_point integer NOT NULL DEFAULT 0,
  max_free_user_point_cap integer NOT NULL DEFAULT 0,
  event_multiplier_enabled boolean NOT NULL DEFAULT false,
  admin_memo text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- point_probability_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_probability_rules (
  id text PRIMARY KEY,
  policy_id text NOT NULL REFERENCES public.board_point_policies(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  min_point integer NOT NULL,
  max_point integer NOT NULL,
  probability_percent integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_point_probability_rules_policy
  ON public.point_probability_rules (policy_id, sort_order);

-- ---------------------------------------------------------------------------
-- point_event_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_event_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  write_multiplier numeric NOT NULL DEFAULT 1,
  comment_multiplier numeric NOT NULL DEFAULT 1,
  target_boards text[] NOT NULL DEFAULT '{}',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- point_policy_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_policy_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type text NOT NULL,
  related_id text NOT NULL,
  action_type text NOT NULL,
  admin_id text NOT NULL DEFAULT '',
  admin_nickname text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_policy_logs_created
  ON public.point_policy_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- point_expire_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_expire_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expire_after_days integer NOT NULL,
  min_balance_to_expire integer NULL,
  exclude_entry_types text[] NOT NULL DEFAULT '{}',
  allow_user_view boolean NOT NULL DEFAULT true,
  auto_expire_enabled boolean NOT NULL DEFAULT true,
  run_cycle text NOT NULL DEFAULT 'daily',
  admin_memo text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- point_expire_executions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_expire_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_date date NOT NULL,
  policy_id uuid NOT NULL REFERENCES public.point_expire_policies(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  target_user_nickname text NOT NULL DEFAULT '',
  total_candidate_point integer NOT NULL DEFAULT 0,
  expired_point integer NOT NULL DEFAULT 0,
  remaining_point integer NOT NULL DEFAULT 0,
  execution_status text NOT NULL DEFAULT 'success',
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_expire_executions_date
  ON public.point_expire_executions (execution_date DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- point_expire_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_expire_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.point_expire_executions(id) ON DELETE CASCADE,
  ledger_entry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_nickname text NOT NULL DEFAULT '',
  expired_point integer NOT NULL,
  expires_at timestamptz NOT NULL,
  action_type text NOT NULL,
  actor_type text NOT NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- point_reward_executions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_reward_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_key text NOT NULL UNIQUE,
  board_key text NOT NULL,
  action_type text NOT NULL,
  target_id text NOT NULL,
  target_type text NOT NULL,
  user_id uuid NOT NULL,
  user_nickname text NOT NULL DEFAULT '',
  user_type text NOT NULL DEFAULT 'free',
  reward_type text NOT NULL DEFAULT 'fixed',
  base_point integer NOT NULL DEFAULT 0,
  applied_multiplier numeric NOT NULL DEFAULT 1,
  final_point integer NOT NULL DEFAULT 0,
  capped boolean NOT NULL DEFAULT false,
  cooldown_blocked boolean NOT NULL DEFAULT false,
  duplicate_blocked boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_point_reward_executions_user_created
  ON public.point_reward_executions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_reward_executions_board_action
  ON public.point_reward_executions (board_key, action_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- point_reclaim_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_reclaim_policies (
  id text PRIMARY KEY,
  target_type text NOT NULL,
  trigger_type text NOT NULL,
  reclaim_mode text NOT NULL DEFAULT 'full',
  reclaim_percent integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, trigger_type)
);

-- ---------------------------------------------------------------------------
-- point_reward_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_reward_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.point_reward_executions(id) ON DELETE CASCADE,
  related_ledger_id uuid NULL,
  action_type text NOT NULL,
  board_key text NOT NULL,
  target_id text NOT NULL,
  target_type text NOT NULL,
  user_id uuid NOT NULL,
  point_amount integer NOT NULL,
  balance_after integer NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_reward_logs_created
  ON public.point_reward_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- point_action_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.point_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL DEFAULT '',
  actor_nickname text NOT NULL DEFAULT '',
  target_user_id uuid NOT NULL,
  target_user_nickname text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Seeds (mock 기본값)
-- ---------------------------------------------------------------------------
INSERT INTO public.board_point_policies (
  id, board_key, board_name, is_active,
  write_reward_type, write_fixed_point, write_random_min, write_random_max, write_cooldown_seconds,
  comment_reward_type, comment_fixed_point, comment_random_min, comment_random_max, comment_cooldown_seconds,
  like_reward_point, report_reward_point, max_free_user_point_cap, event_multiplier_enabled
) VALUES
  ('bpp-1', 'general', '자유게시판', true,
   'fixed', 5, 0, 0, 60,
   'fixed', 2, 0, 0, 30,
   0, 0, 500, true),
  ('bpp-2', 'qna', 'Q&A', true,
   'random', 0, 3, 10, 120,
   'fixed', 1, 0, 0, 20,
   0, 0, 300, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.point_probability_rules (
  id, policy_id, target_type, min_point, max_point, probability_percent, sort_order
) VALUES
  ('ppr-1', 'bpp-2', 'write', 3, 5, 60, 1),
  ('ppr-2', 'bpp-2', 'write', 6, 10, 40, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.point_event_policies (
  id, title, is_active, start_at, end_at,
  write_multiplier, comment_multiplier, target_boards, note
) VALUES (
  'c1000001-0001-4000-8000-000000000001',
  '이벤트 배율',
  true,
  now() - interval '2 days',
  now() + interval '28 days',
  1.5, 1.2,
  ARRAY['general', 'qna'],
  '이벤트 기간 포인트 배율'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.point_expire_policies (
  id, policy_name, is_active, expire_after_days,
  exclude_entry_types, allow_user_view, auto_expire_enabled, run_cycle, admin_memo
) VALUES (
  'd1000001-0001-4000-8000-000000000001',
  '기본 만료 정책',
  true,
  365,
  ARRAY['charge', 'admin_adjust'],
  true,
  true,
  'daily',
  '충전·관리자조정 제외, 365일 후 만료'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.point_reclaim_policies (
  id, target_type, trigger_type, reclaim_mode, reclaim_percent, is_active
) VALUES
  ('prp-1', 'post', 'delete', 'full', 100, true),
  ('prp-2', 'comment', 'delete', 'full', 100, true),
  ('prp-3', 'post', 'report_confirmed', 'full', 100, true)
ON CONFLICT (id) DO NOTHING;

-- RLS: service role API 전용 (authenticated 직접 접근 차단)
ALTER TABLE public.board_point_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_probability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_event_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_policy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_expire_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_expire_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_expire_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_reward_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_reclaim_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_reward_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_action_logs ENABLE ROW LEVEL SECURITY;

COMMIT;

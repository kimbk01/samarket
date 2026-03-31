-- ============================================================================
-- 모임 전용 LINE UI 오픈채팅 엔진 (meeting_open_chat_*)
-- - public.open_chat_rooms(필라이프) / community_chat_* / chat_rooms 와 분리
-- - 서비스 롤 API + RLS 활성화(정책은 후속). anon/authenticated 직접 쓰기 차단 목적
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.meetings') IS NULL THEN
    RAISE EXCEPTION 'public.meetings does not exist. Apply neighborhood_community migrations first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 방
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  thumbnail_url text,
  join_type text NOT NULL DEFAULT 'free',
  password_hash text,
  max_members integer NOT NULL DEFAULT 300,
  is_active boolean NOT NULL DEFAULT true,
  is_searchable boolean NOT NULL DEFAULT true,
  allow_rejoin_after_kick boolean NOT NULL DEFAULT true,
  owner_user_id uuid NOT NULL,
  last_message_preview text,
  last_message_at timestamptz,
  active_member_count integer NOT NULL DEFAULT 0,
  pending_join_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_open_chat_rooms_join_type_check CHECK (
    join_type IN ('free', 'password', 'approval', 'password_approval')
  ),
  CONSTRAINT meeting_open_chat_rooms_max_members_check CHECK (max_members >= 2 AND max_members <= 2000),
  CONSTRAINT meeting_open_chat_rooms_active_member_count_check CHECK (active_member_count >= 0),
  CONSTRAINT meeting_open_chat_rooms_pending_join_count_check CHECK (pending_join_count >= 0),
  CONSTRAINT meeting_open_chat_rooms_password_consistency CHECK (
    (join_type IN ('password', 'password_approval') AND password_hash IS NOT NULL)
    OR (join_type IN ('free', 'approval'))
  )
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_rooms_meeting_created_idx
  ON public.meeting_open_chat_rooms (meeting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_open_chat_rooms_owner_idx
  ON public.meeting_open_chat_rooms (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_open_chat_rooms_searchable_active_idx
  ON public.meeting_open_chat_rooms (meeting_id, is_searchable, is_active)
  WHERE is_searchable = true AND is_active = true;

COMMENT ON TABLE public.meeting_open_chat_rooms IS '모임 LINE형 오픈채팅 방 메타. chat_rooms 미연동';

-- ---------------------------------------------------------------------------
-- 멤버 (방별 오픈 프로필)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  open_nickname text NOT NULL,
  open_profile_image_url text,
  intro_message text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  last_read_message_id uuid,
  last_read_at timestamptz,
  muted_until timestamptz,
  kicked_at timestamptz,
  banned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id),
  CONSTRAINT meeting_open_chat_members_role_check CHECK (role IN ('owner', 'sub_admin', 'member')),
  CONSTRAINT meeting_open_chat_members_status_check CHECK (
    status IN ('active', 'pending', 'left', 'kicked', 'banned')
  )
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_members_room_status_idx
  ON public.meeting_open_chat_members (room_id, status, joined_at DESC);

CREATE INDEX IF NOT EXISTS meeting_open_chat_members_user_idx
  ON public.meeting_open_chat_members (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_open_chat_members_one_owner_idx
  ON public.meeting_open_chat_members (room_id)
  WHERE role = 'owner' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS meeting_open_chat_members_room_nickname_active_idx
  ON public.meeting_open_chat_members (room_id, lower(open_nickname))
  WHERE status = 'active';

COMMENT ON TABLE public.meeting_open_chat_members IS '방별 오픈 닉네임·프로필. 실명/전화 비저장';

-- ---------------------------------------------------------------------------
-- 메시지
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid,
  member_id uuid REFERENCES public.meeting_open_chat_members(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'text',
  content text NOT NULL DEFAULT '',
  reply_to_message_id uuid REFERENCES public.meeting_open_chat_messages(id) ON DELETE SET NULL,
  is_blinded boolean NOT NULL DEFAULT false,
  blinded_reason text,
  blinded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT meeting_open_chat_messages_type_check CHECK (
    message_type IN ('text', 'image', 'file', 'notice', 'system', 'reply')
  )
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_messages_room_created_idx
  ON public.meeting_open_chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_open_chat_messages_reply_idx
  ON public.meeting_open_chat_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

ALTER TABLE public.meeting_open_chat_members
  DROP CONSTRAINT IF EXISTS meeting_open_chat_members_last_read_fk;

ALTER TABLE public.meeting_open_chat_members
  ADD CONSTRAINT meeting_open_chat_members_last_read_fk
  FOREIGN KEY (last_read_message_id) REFERENCES public.meeting_open_chat_messages(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 첨부
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.meeting_open_chat_messages(id) ON DELETE CASCADE,
  file_type text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  file_size bigint,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_open_chat_attachments_file_type_check CHECK (file_type IN ('image', 'file'))
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_attachments_message_idx
  ON public.meeting_open_chat_attachments (message_id, sort_order ASC);

-- ---------------------------------------------------------------------------
-- 입장 신청
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  intro_message text NOT NULL DEFAULT '',
  open_nickname text NOT NULL,
  open_profile_image_url text,
  status text NOT NULL DEFAULT 'pending',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_open_chat_join_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_join_requests_room_status_idx
  ON public.meeting_open_chat_join_requests (room_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_open_chat_join_requests_one_pending_idx
  ON public.meeting_open_chat_join_requests (room_id, user_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 신고
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.meeting_open_chat_messages(id) ON DELETE SET NULL,
  reporter_user_id uuid NOT NULL,
  target_user_id uuid,
  report_reason text NOT NULL,
  report_detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_open_chat_reports_status_check CHECK (
    status IN ('pending', 'reviewed', 'actioned', 'rejected')
  )
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_reports_room_status_idx
  ON public.meeting_open_chat_reports (room_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 차단
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  banned_by uuid NOT NULL,
  banned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_bans_room_idx
  ON public.meeting_open_chat_bans (room_id, banned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_open_chat_bans_active_unique_idx
  ON public.meeting_open_chat_bans (room_id, user_id)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 공지
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.meeting_open_chat_messages(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  is_pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_notices_room_pinned_idx
  ON public.meeting_open_chat_notices (room_id, is_pinned DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- 운영 로그
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_open_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.meeting_open_chat_rooms(id) ON DELETE CASCADE,
  actor_user_id uuid,
  target_user_id uuid,
  action_type text NOT NULL,
  action_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_open_chat_logs_room_created_idx
  ON public.meeting_open_chat_logs (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meeting_open_chat_logs_action_idx
  ON public.meeting_open_chat_logs (room_id, action_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (정책은 후속)
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_open_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_open_chat_logs ENABLE ROW LEVEL SECURITY;

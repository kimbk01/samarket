-- ============================================================================
-- 커뮤니티 모임 전용 오픈채팅 엔진 (카카오 오픈채팅형)
-- - 거래/매장/필라이프 open_chat(chat_rooms 연동)과 완전 분리
-- - 메시지 저장소: community_chat_messages (기존 chat_messages 미사용)
-- - meeting_id 로 모임에 귀속. 정식 API는 서비스 롤 + 서버 권한 검증 권장
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
CREATE TABLE IF NOT EXISTS public.community_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  thumbnail_url text,
  join_type text NOT NULL DEFAULT 'public',
  password_hash text,
  max_members integer NOT NULL DEFAULT 300,
  is_searchable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  owner_user_id uuid NOT NULL,
  report_threshold integer,
  joined_count integer NOT NULL DEFAULT 0,
  pending_join_count integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_rooms_join_type_check CHECK (join_type IN ('public', 'password', 'approval')),
  CONSTRAINT community_chat_rooms_status_check CHECK (status IN ('active', 'closed', 'archived')),
  CONSTRAINT community_chat_rooms_max_members_check CHECK (max_members >= 2 AND max_members <= 2000),
  CONSTRAINT community_chat_rooms_joined_count_check CHECK (joined_count >= 0),
  CONSTRAINT community_chat_rooms_pending_join_count_check CHECK (pending_join_count >= 0),
  CONSTRAINT community_chat_rooms_password_consistency CHECK (
    (join_type = 'password' AND password_hash IS NOT NULL)
    OR (join_type <> 'password' AND password_hash IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS community_chat_rooms_meeting_created_idx
  ON public.community_chat_rooms (meeting_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_rooms_owner_idx
  ON public.community_chat_rooms (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_rooms_searchable_status_idx
  ON public.community_chat_rooms (meeting_id, is_searchable, status)
  WHERE is_searchable = true AND status = 'active';

COMMENT ON TABLE public.community_chat_rooms IS '모임(meeting) 전용 오픈채팅 방 메타. chat_rooms 미연동';

-- ---------------------------------------------------------------------------
-- 멤버 (방별 닉네임·아바타, 역할)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  nickname text NOT NULL,
  avatar_url text,
  member_status text NOT NULL DEFAULT 'joined',
  last_read_message_id uuid,
  last_read_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  kicked_at timestamptz,
  kicked_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id),
  CONSTRAINT community_chat_room_members_role_check CHECK (role IN ('owner', 'sub_admin', 'member')),
  CONSTRAINT community_chat_room_members_status_check CHECK (member_status IN ('joined', 'left', 'kicked'))
);

CREATE INDEX IF NOT EXISTS community_chat_room_members_room_status_idx
  ON public.community_chat_room_members (room_id, member_status, joined_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_room_members_user_idx
  ON public.community_chat_room_members (user_id, member_status);

CREATE UNIQUE INDEX IF NOT EXISTS community_chat_room_members_one_owner_idx
  ON public.community_chat_room_members (room_id)
  WHERE role = 'owner' AND member_status = 'joined';

CREATE UNIQUE INDEX IF NOT EXISTS community_chat_room_members_room_joined_nickname_idx
  ON public.community_chat_room_members (room_id, lower(nickname))
  WHERE member_status = 'joined';

COMMENT ON TABLE public.community_chat_room_members IS '방별 채팅 닉네임·프로필. 실명/전화 비저장·비노출';

-- ---------------------------------------------------------------------------
-- 메시지 (FK to members deferred: reply may reference deleted — use ON DELETE SET NULL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  sender_user_id uuid,
  message_type text NOT NULL DEFAULT 'text',
  body text NOT NULL DEFAULT '',
  reply_to_message_id uuid REFERENCES public.community_chat_messages(id) ON DELETE SET NULL,
  related_notice_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_blinded boolean NOT NULL DEFAULT false,
  blind_reason text,
  blinded_by uuid,
  blinded_at timestamptz,
  deleted_at timestamptz,
  deleted_by_sender_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_messages_type_check CHECK (
    message_type IN ('text', 'image', 'file', 'notice', 'system', 'reply')
  )
);

CREATE INDEX IF NOT EXISTS community_chat_messages_room_created_idx
  ON public.community_chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_messages_reply_idx
  ON public.community_chat_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

COMMENT ON TABLE public.community_chat_messages IS '모임 오픈채팅 전용 메시지. 블라인드 시 행 유지·is_blinded 로 숨김';

-- FK from members.last_read_message_id after messages exist
ALTER TABLE public.community_chat_room_members
  DROP CONSTRAINT IF EXISTS community_chat_room_members_last_read_fk;

ALTER TABLE public.community_chat_room_members
  ADD CONSTRAINT community_chat_room_members_last_read_fk
  FOREIGN KEY (last_read_message_id) REFERENCES public.community_chat_messages(id) ON DELETE SET NULL;

-- related_notice_id FK after notices table
-- (added below after community_chat_notices)

-- ---------------------------------------------------------------------------
-- 첨부
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'community-meeting-chat',
  storage_path text NOT NULL,
  original_filename text,
  mime_type text,
  byte_size bigint,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_message_attachments_kind_check CHECK (kind IN ('image', 'file'))
);

CREATE INDEX IF NOT EXISTS community_chat_message_attachments_message_idx
  ON public.community_chat_message_attachments (message_id, sort_order ASC);

-- ---------------------------------------------------------------------------
-- 신고
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.community_chat_messages(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL,
  category text NOT NULL,
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_reports_category_check CHECK (
    category IN (
      'spam', 'abuse', 'sexual', 'illegal', 'advertisement',
      'impersonation', 'harassment', 'other'
    )
  ),
  CONSTRAINT community_chat_reports_status_check CHECK (
    status IN ('pending', 'dismissed', 'action_blind', 'action_kick', 'action_ban')
  )
);

CREATE INDEX IF NOT EXISTS community_chat_reports_room_status_idx
  ON public.community_chat_reports (room_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_reports_message_idx
  ON public.community_chat_reports (message_id);

CREATE UNIQUE INDEX IF NOT EXISTS community_chat_reports_one_per_reporter_idx
  ON public.community_chat_reports (room_id, message_id, reporter_user_id);

-- ---------------------------------------------------------------------------
-- 차단 (방 재입장 제한)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  ban_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid
);

CREATE INDEX IF NOT EXISTS community_chat_bans_room_created_idx
  ON public.community_chat_bans (room_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS community_chat_bans_active_unique_idx
  ON public.community_chat_bans (room_id, user_id)
  WHERE released_at IS NULL;

-- ---------------------------------------------------------------------------
-- 공지 (채팅 내 notice 타입 메시지와 별도 메타; 고정/관리용)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_pinned boolean NOT NULL DEFAULT false,
  pin_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_chat_notices_room_pinned_idx
  ON public.community_chat_notices (room_id, is_active, is_pinned DESC, pin_order ASC, created_at DESC);

ALTER TABLE public.community_chat_messages
  DROP CONSTRAINT IF EXISTS community_chat_messages_related_notice_fk;

ALTER TABLE public.community_chat_messages
  ADD CONSTRAINT community_chat_messages_related_notice_fk
  FOREIGN KEY (related_notice_id) REFERENCES public.community_chat_notices(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 입장 신청 (승인방)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nickname text NOT NULL,
  request_message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_chat_join_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS community_chat_join_requests_room_status_idx
  ON public.community_chat_join_requests (room_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS community_chat_join_requests_one_pending_idx
  ON public.community_chat_join_requests (room_id, user_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 운영 로그
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.community_chat_rooms(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action_type text NOT NULL,
  target_user_id uuid,
  target_message_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_chat_logs_room_created_idx
  ON public.community_chat_logs (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_chat_logs_action_idx
  ON public.community_chat_logs (room_id, action_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: 정책은 후속 마이그레이션에서 멤버십 기준으로 추가.
-- 현재는 활성화만 하여 anon/authenticated 직접 접근 차단(서비스 롤은 우회).
-- ---------------------------------------------------------------------------
ALTER TABLE public.community_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_chat_logs ENABLE ROW LEVEL SECURITY;

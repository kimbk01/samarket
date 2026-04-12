-- 그룹 채팅(100+ 멤버) 전용 축 — chat_* 와 분리
-- 문서: docs/group-chat-schema.md, docs/group-chat-realtime.md
-- Realtime: Database → Replication 에 group_messages 추가 후 클라 구독

-- ---------------------------------------------------------------------------
-- 1) group_rooms (last_message_id FK 는 group_messages 생성 후 부여)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  message_seq bigint NOT NULL DEFAULT 0,
  member_count integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT group_rooms_member_count_check CHECK (member_count >= 0),
  CONSTRAINT group_rooms_message_seq_check CHECK (message_seq >= 0)
);

CREATE INDEX IF NOT EXISTS group_rooms_last_message_at_desc_idx
  ON public.group_rooms (last_message_at DESC NULLS LAST);

COMMENT ON TABLE public.group_rooms IS '다자 그룹 채팅 방 메타 (거래 chat_rooms 와 별도 축)';

-- ---------------------------------------------------------------------------
-- 2) group_room_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.group_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  muted_until timestamptz,
  last_read_message_id uuid,
  last_read_seq bigint NOT NULL DEFAULT 0,
  notification_muted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_room_members_role_check CHECK (role IN ('owner', 'moderator', 'member')),
  CONSTRAINT group_room_members_last_read_seq_check CHECK (last_read_seq >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS group_room_members_room_user_active_idx
  ON public.group_room_members (room_id, user_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS group_room_members_user_room_idx
  ON public.group_room_members (user_id, room_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS group_room_members_room_idx
  ON public.group_room_members (room_id)
  WHERE left_at IS NULL;

COMMENT ON TABLE public.group_room_members IS '그룹 방 멤버십·읽음 커서(last_read_seq)';

-- ---------------------------------------------------------------------------
-- 3) group_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.group_rooms (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  message_type text NOT NULL DEFAULT 'text',
  body text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL,
  deleted_at timestamptz,
  hidden_by_moderator boolean NOT NULL DEFAULT false,
  CONSTRAINT group_messages_seq_positive CHECK (seq > 0),
  CONSTRAINT group_messages_room_seq_uniq UNIQUE (room_id, seq)
);

CREATE INDEX IF NOT EXISTS group_messages_room_created_id_keyset_idx
  ON public.group_messages (room_id, created_at DESC NULLS LAST, id DESC NULLS LAST);

COMMENT ON TABLE public.group_messages IS '그룹 방 메시지; seq 는 방 단위 단조(앱/트리거에서 동기)';

-- last_message_id → group_messages
ALTER TABLE public.group_rooms
  DROP CONSTRAINT IF EXISTS group_rooms_last_message_id_fkey;
ALTER TABLE public.group_rooms
  ADD CONSTRAINT group_rooms_last_message_id_fkey
  FOREIGN KEY (last_message_id) REFERENCES public.group_messages (id) ON DELETE SET NULL;

ALTER TABLE public.group_room_members
  DROP CONSTRAINT IF EXISTS group_room_members_last_read_message_id_fkey;
ALTER TABLE public.group_room_members
  ADD CONSTRAINT group_room_members_last_read_message_id_fkey
  FOREIGN KEY (last_read_message_id) REFERENCES public.group_messages (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4) group_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_audit_log (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.group_rooms (id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_audit_log_room_created_idx
  ON public.group_audit_log (room_id, created_at DESC);

COMMENT ON TABLE public.group_audit_log IS '그룹 방 모더레이션·관리 감사 로그';

-- ---------------------------------------------------------------------------
-- 5) RLS (authenticated 멤버만 메시지 조회 등 — 상세 정책은 운영에 맞게 확장)
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_rooms_select_member ON public.group_rooms;
CREATE POLICY group_rooms_select_member ON public.group_rooms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_room_members m
      WHERE m.room_id = group_rooms.id
        AND m.user_id = (SELECT auth.uid())
        AND m.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS group_room_members_select_self ON public.group_room_members;
CREATE POLICY group_room_members_select_self ON public.group_room_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_room_members m2
      WHERE m2.room_id = group_room_members.room_id
        AND m2.user_id = (SELECT auth.uid())
        AND m2.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS group_messages_select_member ON public.group_messages;
CREATE POLICY group_messages_select_member ON public.group_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_room_members m
      WHERE m.room_id = group_messages.room_id
        AND m.user_id = (SELECT auth.uid())
        AND m.left_at IS NULL
    )
  );

DROP POLICY IF EXISTS group_audit_log_select_member ON public.group_audit_log;
CREATE POLICY group_audit_log_select_member ON public.group_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_room_members m
      WHERE m.room_id = group_audit_log.room_id
        AND m.user_id = (SELECT auth.uid())
        AND m.left_at IS NULL
    )
  );

-- INSERT/UPDATE/DELETE 는 서비스 롤 API 권장 — 직접 클라이언트 쓰기가 필요하면 별도 정책 추가
--
-- 메시지 삽입 시: 동일 트랜잭션에서 group_rooms.message_seq 증가 + group_messages.seq 부여 +
-- last_message_* 갱신은 애플리케이션 또는 후속 트리거 마이그레이션에서 처리.
-- Supabase Realtime: `group_messages` 를 publication 에 추가한 뒤 클라에서 room_id 필터 구독.

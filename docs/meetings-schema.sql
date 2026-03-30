-- =============================================================================
-- SAMarket 모임(Meetings) 스키마
-- 필라이프 게시글 연계 모임 커뮤니티 구조
-- 현재 코드베이스의 실제 테이블 기준 (Supabase)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. meetings
--    필라이프 게시글(community_posts)에 연결되는 모임 본체
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  location_text     text NOT NULL DEFAULT '',
  meeting_date      timestamptz NOT NULL,
  max_members       int NOT NULL DEFAULT 10,
  -- 참여 방식: open(바로) | approve(승인제) | password(비번) | invite_only(초대)
  entry_policy      text NOT NULL DEFAULT 'open'
                      CHECK (entry_policy IN ('open','approve','password','invite_only')),
  join_policy       text NOT NULL DEFAULT 'open',   -- 레거시 호환 컬럼
  requires_approval boolean NOT NULL DEFAULT false,
  has_password      boolean NOT NULL DEFAULT false,
  password_hash     text,
  -- 상태: open | closed | ended | cancelled
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','closed','ended','cancelled')),
  is_closed         boolean NOT NULL DEFAULT false,
  -- 집계 캐시 (트리거 또는 주기적 갱신)
  joined_count      int NOT NULL DEFAULT 0,
  pending_count     int NOT NULL DEFAULT 0,
  banned_count      int NOT NULL DEFAULT 0,
  notice_count      int NOT NULL DEFAULT 0,
  last_notice_at    timestamptz,
  -- 연결된 채팅방 (chat_rooms.id, room_type='group_meeting')
  chat_room_id      uuid REFERENCES chat_rooms(id) ON DELETE SET NULL,
  created_by        uuid NOT NULL REFERENCES auth.users(id),
  host_user_id      uuid NOT NULL REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. meeting_members
--    모임 참여자 관리 (참여 = 이 테이블 + chat_room_participants)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  -- 역할: host | co_host | member
  role            text NOT NULL DEFAULT 'member'
                    CHECK (role IN ('host','co_host','member')),
  -- 상태: joined | pending | left | kicked | banned
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('joined','pending','left','kicked','banned')),
  status_reason   text,                             -- 초대: 'host_invited' 등
  attendance_status text DEFAULT 'unknown'
                    CHECK (attendance_status IN ('attending','absent','excused','unknown')),
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  requested_at    timestamptz DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 3. meeting_notices
--    모임 공지
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_notices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL REFERENCES auth.users(id),
  title           text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  visibility      text NOT NULL DEFAULT 'members'
                    CHECK (visibility IN ('members','public')),
  is_pinned       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. meeting_join_requests
--    승인제(approve/invite_only) 모임 가입 요청
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_join_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  intro_message   text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 5. meeting_events
--    모임 운영 로그 (참여, 강퇴, 승인 등)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES auth.users(id),
  target_user_id  uuid REFERENCES auth.users(id),
  event_type      text NOT NULL,   -- 'join','leave','kick','ban','approve','close' 등
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 6. meeting_member_bans (강퇴/차단 전용)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_member_bans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  banned_by       uuid REFERENCES auth.users(id),
  reason          text,
  released_at     timestamptz,     -- NULL = 아직 차단중
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

-- =============================================================================
-- RLS 정책 (초안)
-- =============================================================================

-- meetings: 공개 모임은 누구나 조회, 변경은 host/co_host만
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_select_open" ON meetings
  FOR SELECT USING (status = 'open' OR auth.uid() = host_user_id OR auth.uid() = created_by);

CREATE POLICY "meetings_update_host" ON meetings
  FOR UPDATE USING (auth.uid() = host_user_id OR auth.uid() = created_by);

-- meeting_members: 본인 멤버십은 누구나 조회
ALTER TABLE meeting_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_members_select_self" ON meeting_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "meeting_members_select_joined" ON meeting_members
  FOR SELECT USING (
    status = 'joined' AND
    EXISTS (
      SELECT 1 FROM meeting_members mm2
      WHERE mm2.meeting_id = meeting_members.meeting_id
        AND mm2.user_id = auth.uid()
        AND mm2.status = 'joined'
    )
  );

CREATE POLICY "meeting_members_insert_self" ON meeting_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- meeting_notices: 멤버는 읽기 가능, 작성은 host/co_host
ALTER TABLE meeting_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_notices_select" ON meeting_notices
  FOR SELECT USING (
    is_active = true AND (
      visibility = 'public' OR
      EXISTS (
        SELECT 1 FROM meeting_members mm
        WHERE mm.meeting_id = meeting_notices.meeting_id
          AND mm.user_id = auth.uid()
          AND mm.status = 'joined'
      )
    )
  );

-- =============================================================================
-- 샘플 데이터 INSERT
-- (개발/스테이징 환경에서만 실행. 실제 UUID는 환경에 맞게 교체)
-- =============================================================================

-- 샘플 필라이프 게시글 (community_posts가 없으면 먼저 삽입 필요)
-- INSERT INTO community_posts (id, ...) VALUES (...);

-- 샘플 모임
INSERT INTO meetings (
  id, post_id, title, description, location_text, meeting_date,
  max_members, entry_policy, requires_approval, status,
  created_by, host_user_id, joined_count
) VALUES (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000009',
  '토요일 삼겹살 번개',
  'Quezon City · Diliman 근처에서 편하게 삼겹살 번개 모임입니다.' || chr(10) ||
  '고기 좋아하시는 분, 이웃과 친해지고 싶으신 분 모두 환영해요!' || chr(10) ||
  '초보 환영 🎉 편하게 오세요.',
  'Diliman 한식당 인근',
  '2026-03-29T19:00:00+08:00',
  12, 'open', false, 'open',
  '00000000-0000-4000-8000-000000000001',  -- SAMPLE_AUTHOR_ID
  '00000000-0000-4000-8000-000000000001',
  3
) ON CONFLICT (id) DO NOTHING;

-- 샘플 참여자 3명 (host + 이웃 A + 이웃 B)
INSERT INTO meeting_members (meeting_id, user_id, role, status) VALUES
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'host',   'joined'),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'member', 'joined'),
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'member', 'joined')
ON CONFLICT (meeting_id, user_id) DO NOTHING;

-- chat_rooms 생성 (group_meeting 타입)
INSERT INTO chat_rooms (
  id, room_type, meeting_id, related_post_id,
  initiator_id, participants_count, request_status
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  'group_meeting',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000009',
  '00000000-0000-4000-8000-000000000001',
  3, 'accepted'
) ON CONFLICT (id) DO NOTHING;

-- meetings.chat_room_id 연결
UPDATE meetings
  SET chat_room_id = '40000000-0000-4000-8000-000000000001'
WHERE id = '30000000-0000-4000-8000-000000000001';

-- chat_room_participants 등록
INSERT INTO chat_room_participants (room_id, user_id, is_active) VALUES
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', true),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', true),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', true)
ON CONFLICT (room_id, user_id) DO NOTHING;

-- 시스템 메시지
INSERT INTO chat_messages (room_id, sender_id, message_type, body) VALUES
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'system', 'SAMarket 샘플님이 모임을 만들었습니다.'),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'text',   '삼겹살 번개 오실 분들은 간단히 인사 남겨 주세요. 토요일 저녁 7시 Diliman 한식당 근처예요!'),
  ('40000000-0000-4000-8000-000000000001', null,                                   'system', '샘플 이웃 A님이 참여했습니다.'),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'text',   '반갑습니다! 저 2명 갑니다 😊'),
  ('40000000-0000-4000-8000-000000000001', null,                                   'system', '샘플 이웃 B님이 참여했습니다.'),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'text',   '저도 참가할게요! 혼자인데 괜찮나요?'),
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'text',   '물론이죠! 혼자도 환영해요 😄');

-- =============================================================================
-- joined_count 자동 갱신 트리거 (선택)
-- =============================================================================
CREATE OR REPLACE FUNCTION update_meeting_joined_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE meetings SET
    joined_count  = (SELECT COUNT(*) FROM meeting_members WHERE meeting_id = COALESCE(NEW.meeting_id, OLD.meeting_id) AND status = 'joined'),
    pending_count = (SELECT COUNT(*) FROM meeting_members WHERE meeting_id = COALESCE(NEW.meeting_id, OLD.meeting_id) AND status = 'pending'),
    updated_at    = now()
  WHERE id = COALESCE(NEW.meeting_id, OLD.meeting_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_meeting_members_count
  AFTER INSERT OR UPDATE OR DELETE ON meeting_members
  FOR EACH ROW EXECUTE FUNCTION update_meeting_joined_count();

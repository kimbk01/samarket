-- ============================================================================
-- Philife meeting room upgrade
-- 목적:
-- - 현재 meetings 기반을 유지하면서 당근형 모임방 운영 기능을 올린다.
-- - 비밀번호/승인제/초대제/공지/참여요청/모임단위 차단/운영로그 기반을 추가한다.
-- - 기존 join_policy / meeting_members.status / group_meeting 채팅 구조와 호환된다.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.meetings') IS NULL THEN
    RAISE EXCEPTION 'public.meetings does not exist. Apply earlier community/philife migrations first.';
  END IF;
  IF to_regclass('public.meeting_members') IS NULL THEN
    RAISE EXCEPTION 'public.meeting_members does not exist. Apply earlier community/philife migrations first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- meetings: 운영 정책 확장
-- ---------------------------------------------------------------------------
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS entry_policy text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS requires_approval boolean;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_waitlist boolean NOT NULL DEFAULT false;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS allow_member_invite boolean NOT NULL DEFAULT false;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS joined_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS pending_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS banned_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS notice_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS last_notice_at timestamptz;

UPDATE public.meetings
SET entry_policy = CASE
  WHEN COALESCE(join_policy, 'open') = 'approve' THEN 'approve'
  ELSE 'open'
END
WHERE entry_policy IS NULL OR btrim(entry_policy) = '';

UPDATE public.meetings
SET requires_approval = CASE
  WHEN entry_policy IN ('approve', 'invite_only') THEN true
  ELSE false
END
WHERE requires_approval IS NULL;

UPDATE public.meetings
SET joined_count = stats.joined_count,
    pending_count = stats.pending_count
FROM (
  SELECT
    meeting_id,
    count(*) FILTER (WHERE status = 'joined')::int AS joined_count,
    count(*) FILTER (WHERE status = 'pending')::int AS pending_count
  FROM public.meeting_members
  GROUP BY meeting_id
) AS stats
WHERE stats.meeting_id = public.meetings.id;

ALTER TABLE public.meetings ALTER COLUMN entry_policy SET DEFAULT 'open';
ALTER TABLE public.meetings ALTER COLUMN entry_policy SET NOT NULL;
ALTER TABLE public.meetings ALTER COLUMN requires_approval SET DEFAULT false;
ALTER TABLE public.meetings ALTER COLUMN requires_approval SET NOT NULL;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_entry_policy_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_entry_policy_check
  CHECK (entry_policy IN ('open', 'approve', 'password', 'invite_only'));

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_joined_count_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_joined_count_check
  CHECK (joined_count >= 0);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_pending_count_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_pending_count_check
  CHECK (pending_count >= 0);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_banned_count_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_banned_count_check
  CHECK (banned_count >= 0);

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_notice_count_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_notice_count_check
  CHECK (notice_count >= 0);

CREATE INDEX IF NOT EXISTS meetings_entry_policy_idx ON public.meetings (entry_policy);
CREATE INDEX IF NOT EXISTS meetings_status_entry_policy_idx ON public.meetings (status, entry_policy);

-- ---------------------------------------------------------------------------
-- meeting_members: 역할/상태/운영 이력 확장
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS rejected_by uuid;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS kicked_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS kicked_by uuid;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS left_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS last_status_changed_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS joined_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS attendance_checked_at timestamptz;
ALTER TABLE public.meeting_members ADD COLUMN IF NOT EXISTS attendance_checked_by uuid;
ALTER TABLE public.meeting_members ALTER COLUMN joined_at DROP NOT NULL;

UPDATE public.meeting_members
SET requested_at = COALESCE(requested_at, created_at, now())
WHERE requested_at IS NULL;

UPDATE public.meeting_members
SET joined_at = NULL
WHERE status = 'pending';

UPDATE public.meeting_members
SET joined_at = COALESCE(joined_at, created_at, now())
WHERE status = 'joined' AND joined_at IS NULL;

UPDATE public.meeting_members
SET approved_at = COALESCE(approved_at, joined_at, created_at, now())
WHERE status = 'joined' AND approved_at IS NULL;

UPDATE public.meeting_members
SET last_status_changed_at = COALESCE(last_status_changed_at, created_at, now())
WHERE last_status_changed_at IS NULL;

UPDATE public.meeting_members
SET left_at = COALESCE(left_at, created_at, now())
WHERE status = 'left' AND left_at IS NULL;

UPDATE public.meeting_members
SET kicked_at = COALESCE(kicked_at, created_at, now())
WHERE status = 'kicked' AND kicked_at IS NULL;

ALTER TABLE public.meeting_members DROP CONSTRAINT IF EXISTS meeting_members_role_check;
ALTER TABLE public.meeting_members ADD CONSTRAINT meeting_members_role_check
  CHECK (role IN ('host', 'co_host', 'member'));

ALTER TABLE public.meeting_members DROP CONSTRAINT IF EXISTS meeting_members_status_check;
ALTER TABLE public.meeting_members ADD CONSTRAINT meeting_members_status_check
  CHECK (status IN ('joined', 'left', 'kicked', 'pending', 'banned', 'rejected'));

ALTER TABLE public.meeting_members DROP CONSTRAINT IF EXISTS meeting_members_attendance_status_check;
ALTER TABLE public.meeting_members ADD CONSTRAINT meeting_members_attendance_status_check
  CHECK (attendance_status IN ('unknown', 'attending', 'absent', 'excused'));

CREATE INDEX IF NOT EXISTS meeting_members_meeting_status_idx ON public.meeting_members (meeting_id, status);
CREATE INDEX IF NOT EXISTS meeting_members_meeting_role_status_idx ON public.meeting_members (meeting_id, role, status);
CREATE INDEX IF NOT EXISTS meeting_members_pending_idx ON public.meeting_members (meeting_id, requested_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 새 운영 테이블
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  request_message text NOT NULL DEFAULT '',
  password_verified boolean NOT NULL DEFAULT false,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_join_requests DROP CONSTRAINT IF EXISTS meeting_join_requests_status_check;
ALTER TABLE public.meeting_join_requests ADD CONSTRAINT meeting_join_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS meeting_join_requests_meeting_idx ON public.meeting_join_requests (meeting_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS meeting_join_requests_user_idx ON public.meeting_join_requests (user_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS meeting_join_requests_one_pending_idx
  ON public.meeting_join_requests (meeting_id, user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.meeting_member_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  blocked_by uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS meeting_member_bans_meeting_idx ON public.meeting_member_bans (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_member_bans_user_idx ON public.meeting_member_bans (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS meeting_member_bans_active_unique_idx
  ON public.meeting_member_bans (meeting_id, user_id)
  WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS public.meeting_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'members',
  is_pinned boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_notices DROP CONSTRAINT IF EXISTS meeting_notices_visibility_check;
ALTER TABLE public.meeting_notices ADD CONSTRAINT meeting_notices_visibility_check
  CHECK (visibility IN ('members', 'public'));

CREATE INDEX IF NOT EXISTS meeting_notices_meeting_idx ON public.meeting_notices (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_notices_meeting_pinned_idx ON public.meeting_notices (meeting_id, is_pinned, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS public.meeting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  actor_user_id uuid,
  target_user_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_events DROP CONSTRAINT IF EXISTS meeting_events_type_check;
ALTER TABLE public.meeting_events ADD CONSTRAINT meeting_events_type_check
  CHECK (
    event_type IN (
      'join_requested',
      'join_approved',
      'join_rejected',
      'member_joined',
      'member_left',
      'member_kicked',
      'member_banned',
      'member_unbanned',
      'notice_created',
      'notice_updated',
      'notice_deleted',
      'meeting_closed',
      'meeting_reopened',
      'meeting_ended',
      'meeting_cancelled'
    )
  );

CREATE INDEX IF NOT EXISTS meeting_events_meeting_idx ON public.meeting_events (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_events_meeting_type_idx ON public.meeting_events (meeting_id, event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 운영 권한/상태 보조 함수
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_meeting(p_meeting_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.id = p_meeting_id
      AND (
        m.host_user_id = p_user_id
        OR public.is_platform_admin(p_user_id)
        OR EXISTS (
          SELECT 1
          FROM public.meeting_members mm
          WHERE mm.meeting_id = m.id
            AND mm.user_id = p_user_id
            AND mm.status = 'joined'
            AND mm.role IN ('host', 'co_host')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_joined_meeting_member(p_meeting_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_members mm
    WHERE mm.meeting_id = p_meeting_id
      AND mm.user_id = p_user_id
      AND mm.status = 'joined'
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_meeting_room_stats(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.meetings m
  SET
    joined_count = COALESCE((
      SELECT count(*)::int
      FROM public.meeting_members mm
      WHERE mm.meeting_id = m.id
        AND mm.status = 'joined'
    ), 0),
    pending_count = COALESCE((
      SELECT count(*)::int
      FROM public.meeting_members mm
      WHERE mm.meeting_id = m.id
        AND mm.status = 'pending'
    ), 0),
    banned_count = COALESCE((
      SELECT count(*)::int
      FROM public.meeting_member_bans mb
      WHERE mb.meeting_id = m.id
        AND mb.released_at IS NULL
        AND (mb.expires_at IS NULL OR mb.expires_at > now())
    ), 0),
    notice_count = COALESCE((
      SELECT count(*)::int
      FROM public.meeting_notices mn
      WHERE mn.meeting_id = m.id
        AND mn.is_active = true
    ), 0),
    last_notice_at = (
      SELECT max(mn.created_at)
      FROM public.meeting_notices mn
      WHERE mn.meeting_id = m.id
        AND mn.is_active = true
    ),
    updated_at = now()
  WHERE m.id = p_meeting_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- meetings / members 호환 + 상태 기본값
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meetings_sync_room_policy_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entry_policy IS NULL OR btrim(NEW.entry_policy) = '' THEN
    NEW.entry_policy := CASE
      WHEN COALESCE(NEW.join_policy, 'open') = 'approve' THEN 'approve'
      ELSE 'open'
    END;
  END IF;

  IF NEW.entry_policy = 'open' THEN
    NEW.join_policy := 'open';
    NEW.requires_approval := false;
  ELSIF NEW.entry_policy = 'approve' THEN
    NEW.join_policy := 'approve';
    NEW.requires_approval := true;
  ELSIF NEW.entry_policy = 'invite_only' THEN
    NEW.join_policy := 'approve';
    NEW.requires_approval := true;
  ELSE
    NEW.join_policy := CASE WHEN COALESCE(NEW.requires_approval, false) THEN 'approve' ELSE 'open' END;
    NEW.requires_approval := COALESCE(NEW.requires_approval, false);
  END IF;

  IF NEW.password_hash IS NOT NULL AND btrim(NEW.password_hash) = '' THEN
    NEW.password_hash := NULL;
  END IF;

  IF NEW.status IN ('closed', 'ended', 'cancelled') THEN
    NEW.is_closed := true;
  ELSE
    NEW.is_closed := false;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_sync_closed ON public.meetings;
DROP TRIGGER IF EXISTS trg_meetings_sync_room_policy_legacy ON public.meetings;
CREATE TRIGGER trg_meetings_sync_room_policy_legacy
  BEFORE INSERT OR UPDATE OF status, entry_policy, join_policy, requires_approval, password_hash
  ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.meetings_sync_room_policy_legacy();

CREATE OR REPLACE FUNCTION public.meeting_members_apply_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.requested_at IS NULL THEN
    NEW.requested_at := COALESCE(NEW.created_at, now());
  END IF;

  IF NEW.last_status_changed_at IS NULL OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    NEW.last_status_changed_at := now();
  END IF;

  IF NEW.status = 'pending' THEN
    NEW.joined_at := NULL;
  ELSIF NEW.status = 'joined' THEN
    NEW.joined_at := COALESCE(NEW.joined_at, now());
    NEW.approved_at := COALESCE(NEW.approved_at, NEW.joined_at, now());
  ELSIF NEW.status = 'left' THEN
    NEW.left_at := COALESCE(NEW.left_at, now());
  ELSIF NEW.status = 'kicked' THEN
    NEW.kicked_at := COALESCE(NEW.kicked_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_members_apply_defaults ON public.meeting_members;
CREATE TRIGGER trg_meeting_members_apply_defaults
  BEFORE INSERT OR UPDATE OF status, role
  ON public.meeting_members
  FOR EACH ROW
  EXECUTE FUNCTION public.meeting_members_apply_defaults();

-- ---------------------------------------------------------------------------
-- 참여 제약: 상태 / 차단 / 승인제 / 정원
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_meeting_member_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cap int;
  joined_n int;
  st text;
  v_entry_policy text;
  v_requires_approval boolean;
  v_banned boolean;
BEGIN
  SELECT
    m.max_members,
    m.status,
    m.entry_policy,
    m.requires_approval
  INTO cap, st, v_entry_policy, v_requires_approval
  FROM public.meetings m
  WHERE m.id = NEW.meeting_id;

  IF st IN ('closed', 'ended', 'cancelled') THEN
    RAISE EXCEPTION 'meeting_closed' USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_member_bans mb
    WHERE mb.meeting_id = NEW.meeting_id
      AND mb.user_id = NEW.user_id
      AND mb.released_at IS NULL
      AND (mb.expires_at IS NULL OR mb.expires_at > now())
  ) INTO v_banned;

  IF v_banned THEN
    RAISE EXCEPTION 'meeting_banned' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'joined'
     AND COALESCE(NEW.role, 'member') = 'member'
     AND COALESCE(v_requires_approval, false) = true
     AND v_entry_policy IN ('approve', 'invite_only')
     AND COALESCE(NEW.approved_at, NULL) IS NULL
  THEN
    RAISE EXCEPTION 'meeting_approval_required' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'joined' THEN
      SELECT count(*)::int INTO joined_n
      FROM public.meeting_members
      WHERE meeting_id = NEW.meeting_id
        AND status = 'joined';

      IF joined_n >= COALESCE(cap, 999999) THEN
        RAISE EXCEPTION 'meeting_full' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'joined' AND (OLD.status IS DISTINCT FROM 'joined') THEN
    SELECT count(*)::int INTO joined_n
    FROM public.meeting_members
    WHERE meeting_id = NEW.meeting_id
      AND status = 'joined'
      AND id IS DISTINCT FROM NEW.id;

    IF joined_n + 1 > COALESCE(cap, 999999) THEN
      RAISE EXCEPTION 'meeting_full' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_members_cap ON public.meeting_members;
CREATE TRIGGER trg_meeting_members_cap
  BEFORE INSERT OR UPDATE OF status, approved_at
  ON public.meeting_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_meeting_member_cap();

-- ---------------------------------------------------------------------------
-- 카운터 / 공지 / 차단 / 채팅 participant 동기화
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_meeting_chat_participant(
  p_meeting_id uuid,
  p_user_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_existing_id uuid;
BEGIN
  IF to_regclass('public.chat_room_participants') IS NULL THEN
    RETURN;
  END IF;

  SELECT chat_room_id INTO v_room_id
  FROM public.meetings
  WHERE id = p_meeting_id;

  IF v_room_id IS NULL THEN
    RETURN;
  END IF;

  IF p_status = 'joined' THEN
    SELECT id INTO v_existing_id
    FROM public.chat_room_participants
    WHERE room_id = v_room_id
      AND user_id = p_user_id
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.chat_room_participants (
        room_id,
        user_id,
        role_in_room,
        is_active,
        hidden,
        joined_at,
        unread_count
      )
      VALUES (
        v_room_id,
        p_user_id,
        'member',
        true,
        false,
        now(),
        0
      );
    ELSE
      UPDATE public.chat_room_participants
      SET
        is_active = true,
        hidden = false,
        left_at = NULL
      WHERE id = v_existing_id;
    END IF;
  ELSE
    UPDATE public.chat_room_participants
    SET
      is_active = false,
      left_at = COALESCE(left_at, now())
    WHERE room_id = v_room_id
      AND user_id = p_user_id;
  END IF;

  UPDATE public.chat_rooms cr
  SET participants_count = (
    SELECT count(*)::int
    FROM public.chat_room_participants p
    WHERE p.room_id = cr.id
      AND COALESCE(p.is_active, true) = true
      AND COALESCE(p.hidden, false) = false
  )
  WHERE cr.id = v_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_meeting_members_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_meeting_id uuid;
BEGIN
  v_meeting_id := COALESCE(NEW.meeting_id, OLD.meeting_id);
  PERFORM public.refresh_meeting_room_stats(v_meeting_id);

  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_meeting_chat_participant(OLD.meeting_id, OLD.user_id, 'left');
    RETURN OLD;
  END IF;

  IF NEW.status = 'joined' THEN
    PERFORM public.sync_meeting_chat_participant(NEW.meeting_id, NEW.user_id, 'joined');
  ELSE
    PERFORM public.sync_meeting_chat_participant(NEW.meeting_id, NEW.user_id, NEW.status);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_meeting_members_changed ON public.meeting_members;
CREATE TRIGGER trg_after_meeting_members_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.meeting_members
  FOR EACH ROW
  EXECUTE FUNCTION public.after_meeting_members_changed();

CREATE OR REPLACE FUNCTION public.after_meeting_notices_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_meeting_room_stats(COALESCE(NEW.meeting_id, OLD.meeting_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_after_meeting_notices_changed ON public.meeting_notices;
CREATE TRIGGER trg_after_meeting_notices_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.meeting_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.after_meeting_notices_changed();

CREATE OR REPLACE FUNCTION public.after_meeting_member_bans_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_meeting_room_stats(COALESCE(NEW.meeting_id, OLD.meeting_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_after_meeting_member_bans_changed ON public.meeting_member_bans;
CREATE TRIGGER trg_after_meeting_member_bans_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.meeting_member_bans
  FOR EACH ROW
  EXECUTE FUNCTION public.after_meeting_member_bans_changed();

CREATE OR REPLACE FUNCTION public.touch_meeting_room_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_join_requests_touch ON public.meeting_join_requests;
CREATE TRIGGER trg_meeting_join_requests_touch
  BEFORE UPDATE ON public.meeting_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_meeting_room_timestamp();

DROP TRIGGER IF EXISTS trg_meeting_notices_touch ON public.meeting_notices;
CREATE TRIGGER trg_meeting_notices_touch
  BEFORE UPDATE ON public.meeting_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_meeting_room_timestamp();

-- ---------------------------------------------------------------------------
-- 운영 이벤트 자동 기록
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_meeting_member_status_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE
      WHEN NEW.status = 'pending' THEN 'join_requested'
      WHEN NEW.status = 'joined' THEN 'member_joined'
      ELSE NULL
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_event_type := CASE NEW.status
      WHEN 'joined' THEN CASE WHEN OLD.status = 'pending' THEN 'join_approved' ELSE 'member_joined' END
      WHEN 'rejected' THEN 'join_rejected'
      WHEN 'left' THEN 'member_left'
      WHEN 'kicked' THEN 'member_kicked'
      WHEN 'banned' THEN 'member_banned'
      ELSE NULL
    END;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.meeting_events (
      meeting_id,
      actor_user_id,
      target_user_id,
      event_type,
      payload
    ) VALUES (
      COALESCE(NEW.meeting_id, OLD.meeting_id),
      COALESCE(NEW.approved_by, NEW.rejected_by, NEW.kicked_by, NULL),
      COALESCE(NEW.user_id, OLD.user_id),
      v_event_type,
      jsonb_build_object(
        'status', COALESCE(NEW.status, OLD.status),
        'role', COALESCE(NEW.role, OLD.role)
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_meeting_member_status_event ON public.meeting_members;
CREATE TRIGGER trg_log_meeting_member_status_event
  AFTER INSERT OR UPDATE OF status ON public.meeting_members
  FOR EACH ROW
  EXECUTE FUNCTION public.log_meeting_member_status_event();

CREATE OR REPLACE FUNCTION public.log_meeting_notice_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.meeting_events (meeting_id, actor_user_id, event_type, payload)
    VALUES (NEW.meeting_id, NEW.author_user_id, 'notice_created', jsonb_build_object('notice_id', NEW.id, 'title', NEW.title));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.meeting_events (meeting_id, actor_user_id, event_type, payload)
    VALUES (NEW.meeting_id, NEW.author_user_id, 'notice_updated', jsonb_build_object('notice_id', NEW.id, 'title', NEW.title));
    RETURN NEW;
  END IF;

  INSERT INTO public.meeting_events (meeting_id, actor_user_id, event_type, payload)
  VALUES (OLD.meeting_id, OLD.author_user_id, 'notice_deleted', jsonb_build_object('notice_id', OLD.id, 'title', OLD.title));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_meeting_notice_event ON public.meeting_notices;
CREATE TRIGGER trg_log_meeting_notice_event
  AFTER INSERT OR UPDATE OR DELETE
  ON public.meeting_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.log_meeting_notice_event();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_member_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_join_requests_select_v1 ON public.meeting_join_requests;
CREATE POLICY meeting_join_requests_select_v1 ON public.meeting_join_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS meeting_join_requests_insert_self_v1 ON public.meeting_join_requests;
CREATE POLICY meeting_join_requests_insert_self_v1 ON public.meeting_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS meeting_join_requests_update_manage_v1 ON public.meeting_join_requests;
CREATE POLICY meeting_join_requests_update_manage_v1 ON public.meeting_join_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS meeting_member_bans_select_v1 ON public.meeting_member_bans;
CREATE POLICY meeting_member_bans_select_v1 ON public.meeting_member_bans
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS meeting_member_bans_manage_v1 ON public.meeting_member_bans;
CREATE POLICY meeting_member_bans_manage_v1 ON public.meeting_member_bans
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS meeting_notices_select_v1 ON public.meeting_notices;
CREATE POLICY meeting_notices_select_v1 ON public.meeting_notices
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
    OR (
      visibility = 'public'
      AND EXISTS (
        SELECT 1
        FROM public.meetings m
        WHERE m.id = meeting_notices.meeting_id
          AND (
            m.status = 'open'
            OR m.host_user_id = auth.uid()
            OR public.has_joined_meeting_member(m.id, auth.uid())
          )
      )
    )
    OR public.has_joined_meeting_member(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS meeting_notices_manage_v1 ON public.meeting_notices;
CREATE POLICY meeting_notices_manage_v1 ON public.meeting_notices
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
  );

DROP POLICY IF EXISTS meeting_events_select_v1 ON public.meeting_events;
CREATE POLICY meeting_events_select_v1 ON public.meeting_events
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_meeting(meeting_id, auth.uid())
    OR public.has_joined_meeting_member(meeting_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 마지막 카운터 정합성 재계산
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.meetings LOOP
    PERFORM public.refresh_meeting_room_stats(r.id);
  END LOOP;
END $$;

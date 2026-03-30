-- ============================================================================
-- Philife open chat schema + direct-client RLS
-- 목적:
-- - 기존 chat_rooms / chat_messages 엔진은 재사용하고, 오픈채팅 전용 메타/권한/운영 테이블을 분리한다.
-- - 서비스 역할 API가 정식 진입점이며, 아래 RLS는 authenticated 클라이언트의 직접 조회를 안전하게 제한한다.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.chat_rooms') IS NULL THEN
    RAISE EXCEPTION 'public.chat_rooms does not exist. Apply chat schema migrations first.';
  END IF;

  IF to_regclass('public.chat_room_participants') IS NULL THEN
    RAISE EXCEPTION 'public.chat_room_participants does not exist. Apply chat schema migrations first.';
  END IF;

  IF to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_platform_admin(uuid) does not exist. Apply community engine migrations first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 오픈채팅 메타 테이블
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.open_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  thumbnail_url text,
  visibility text NOT NULL DEFAULT 'public',
  requires_approval boolean NOT NULL DEFAULT false,
  max_members integer NOT NULL DEFAULT 300,
  allow_search boolean NOT NULL DEFAULT true,
  invite_code text,
  entry_question text,
  status text NOT NULL DEFAULT 'active',
  owner_user_id uuid NOT NULL,
  created_by uuid NOT NULL,
  linked_chat_room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  joined_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  banned_count integer NOT NULL DEFAULT 0,
  notice_count integer NOT NULL DEFAULT 0,
  last_notice_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_visibility_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_visibility_check
  CHECK (visibility IN ('public', 'private'));

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_status_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_status_check
  CHECK (status IN ('active', 'hidden', 'suspended', 'archived'));

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_max_members_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_max_members_check
  CHECK (max_members >= 2 AND max_members <= 2000);

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_joined_count_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_joined_count_check
  CHECK (joined_count >= 0);

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_pending_count_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_pending_count_check
  CHECK (pending_count >= 0);

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_banned_count_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_banned_count_check
  CHECK (banned_count >= 0);

ALTER TABLE public.open_chat_rooms DROP CONSTRAINT IF EXISTS open_chat_rooms_notice_count_check;
ALTER TABLE public.open_chat_rooms ADD CONSTRAINT open_chat_rooms_notice_count_check
  CHECK (notice_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS open_chat_rooms_linked_chat_room_id_idx
  ON public.open_chat_rooms (linked_chat_room_id);

CREATE UNIQUE INDEX IF NOT EXISTS open_chat_rooms_invite_code_idx
  ON public.open_chat_rooms (invite_code)
  WHERE invite_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS open_chat_rooms_status_visibility_search_idx
  ON public.open_chat_rooms (status, visibility, allow_search, created_at DESC);

CREATE INDEX IF NOT EXISTS open_chat_rooms_owner_idx
  ON public.open_chat_rooms (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS open_chat_rooms_created_by_idx
  ON public.open_chat_rooms (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.open_chat_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nickname text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'joined',
  requested_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  kicked_at timestamptz,
  kicked_by uuid,
  left_at timestamptz,
  joined_at timestamptz,
  last_status_changed_at timestamptz,
  last_read_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  status_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

ALTER TABLE public.open_chat_members DROP CONSTRAINT IF EXISTS open_chat_members_role_check;
ALTER TABLE public.open_chat_members ADD CONSTRAINT open_chat_members_role_check
  CHECK (role IN ('owner', 'moderator', 'member'));

ALTER TABLE public.open_chat_members DROP CONSTRAINT IF EXISTS open_chat_members_status_check;
ALTER TABLE public.open_chat_members ADD CONSTRAINT open_chat_members_status_check
  CHECK (status IN ('joined', 'pending', 'left', 'kicked', 'rejected'));

CREATE INDEX IF NOT EXISTS open_chat_members_room_status_idx
  ON public.open_chat_members (room_id, status, joined_at DESC);

CREATE INDEX IF NOT EXISTS open_chat_members_user_status_idx
  ON public.open_chat_members (user_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS open_chat_members_one_owner_idx
  ON public.open_chat_members (room_id)
  WHERE role = 'owner' AND status = 'joined';

CREATE UNIQUE INDEX IF NOT EXISTS open_chat_members_room_joined_nickname_idx
  ON public.open_chat_members (room_id, lower(nickname))
  WHERE status = 'joined';

CREATE TABLE IF NOT EXISTS public.open_chat_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nickname text NOT NULL,
  request_message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_chat_join_requests DROP CONSTRAINT IF EXISTS open_chat_join_requests_status_check;
ALTER TABLE public.open_chat_join_requests ADD CONSTRAINT open_chat_join_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS open_chat_join_requests_room_status_idx
  ON public.open_chat_join_requests (room_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS open_chat_join_requests_user_status_idx
  ON public.open_chat_join_requests (user_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS open_chat_join_requests_one_pending_idx
  ON public.open_chat_join_requests (room_id, user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.open_chat_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.open_chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE INDEX IF NOT EXISTS open_chat_bans_room_created_idx
  ON public.open_chat_bans (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS open_chat_bans_user_created_idx
  ON public.open_chat_bans (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS open_chat_bans_active_unique_idx
  ON public.open_chat_bans (room_id, user_id)
  WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS public.open_chat_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.open_chat_rooms(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'members',
  is_pinned boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_chat_notices DROP CONSTRAINT IF EXISTS open_chat_notices_visibility_check;
ALTER TABLE public.open_chat_notices ADD CONSTRAINT open_chat_notices_visibility_check
  CHECK (visibility IN ('members', 'public'));

CREATE INDEX IF NOT EXISTS open_chat_notices_room_created_idx
  ON public.open_chat_notices (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS open_chat_notices_room_pinned_idx
  ON public.open_chat_notices (room_id, is_pinned, is_active, created_at DESC);

COMMENT ON TABLE public.open_chat_rooms IS '필라이프 오픈채팅 메타. 실제 메시지 저장은 chat_rooms / chat_messages 재사용';
COMMENT ON TABLE public.open_chat_members IS '오픈채팅 멤버십. 방별 닉네임/역할/참여 상태와 chat_room_participants 동기화 기준';
COMMENT ON TABLE public.open_chat_join_requests IS '승인형 오픈채팅 가입 신청';
COMMENT ON TABLE public.open_chat_bans IS '오픈채팅 강퇴/차단 이력';
COMMENT ON TABLE public.open_chat_notices IS '오픈채팅 공지';

-- ---------------------------------------------------------------------------
-- 권한/상태 헬퍼 함수
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_open_chat_room(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.open_chat_rooms r
    WHERE r.id = p_room_id
      AND (
        r.owner_user_id = p_user_id
        OR public.is_platform_admin(p_user_id)
        OR EXISTS (
          SELECT 1
          FROM public.open_chat_members m
          WHERE m.room_id = r.id
            AND m.user_id = p_user_id
            AND m.status = 'joined'
            AND m.role IN ('owner', 'moderator')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_joined_open_chat_member(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.open_chat_members m
    WHERE m.room_id = p_room_id
      AND m.user_id = p_user_id
      AND m.status = 'joined'
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_open_chat_room_stats(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.open_chat_rooms r
  SET
    joined_count = COALESCE((
      SELECT count(*)::int
      FROM public.open_chat_members m
      WHERE m.room_id = r.id
        AND m.status = 'joined'
    ), 0),
    pending_count = COALESCE((
      SELECT count(*)::int
      FROM public.open_chat_join_requests jr
      WHERE jr.room_id = r.id
        AND jr.status = 'pending'
    ), 0),
    banned_count = COALESCE((
      SELECT count(*)::int
      FROM public.open_chat_bans b
      WHERE b.room_id = r.id
        AND b.released_at IS NULL
        AND (b.expires_at IS NULL OR b.expires_at > now())
    ), 0),
    notice_count = COALESCE((
      SELECT count(*)::int
      FROM public.open_chat_notices n
      WHERE n.room_id = r.id
        AND n.is_active = true
    ), 0),
    last_notice_at = (
      SELECT max(n.created_at)
      FROM public.open_chat_notices n
      WHERE n.room_id = r.id
        AND n.is_active = true
    ),
    updated_at = now()
  WHERE r.id = p_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_open_chat_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_chat_rooms_apply_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_code IS NOT NULL AND btrim(NEW.invite_code) = '' THEN
    NEW.invite_code := NULL;
  END IF;

  IF NEW.description IS NULL THEN
    NEW.description := '';
  END IF;

  IF NEW.entry_question IS NOT NULL AND btrim(NEW.entry_question) = '' THEN
    NEW.entry_question := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_chat_members_apply_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nickname IS NULL OR btrim(NEW.nickname) = '' THEN
    RAISE EXCEPTION 'open_chat_nickname_required' USING ERRCODE = 'check_violation';
  END IF;

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
  ELSIF NEW.status = 'rejected' THEN
    NEW.rejected_at := COALESCE(NEW.rejected_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_open_chat_member_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max_members integer;
  v_status text;
  v_visibility text;
  v_requires_approval boolean;
  v_joined_count integer;
  v_banned boolean;
BEGIN
  SELECT
    r.max_members,
    r.status,
    r.visibility,
    r.requires_approval
  INTO v_max_members, v_status, v_visibility, v_requires_approval
  FROM public.open_chat_rooms r
  WHERE r.id = NEW.room_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'open_chat_room_not_found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status IN ('hidden', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'open_chat_room_unavailable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.open_chat_bans b
    WHERE b.room_id = NEW.room_id
      AND b.user_id = NEW.user_id
      AND b.released_at IS NULL
      AND (b.expires_at IS NULL OR b.expires_at > now())
  ) INTO v_banned;

  IF v_banned THEN
    RAISE EXCEPTION 'open_chat_user_banned' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'joined'
     AND COALESCE(NEW.role, 'member') = 'member'
     AND v_visibility = 'private'
     AND NEW.approved_at IS NULL
  THEN
    RAISE EXCEPTION 'open_chat_private_join_forbidden' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'joined'
     AND COALESCE(NEW.role, 'member') = 'member'
     AND COALESCE(v_requires_approval, false) = true
     AND NEW.approved_at IS NULL
  THEN
    RAISE EXCEPTION 'open_chat_approval_required' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'joined' THEN
      SELECT count(*)::int
      INTO v_joined_count
      FROM public.open_chat_members m
      WHERE m.room_id = NEW.room_id
        AND m.status = 'joined';

      IF v_joined_count >= COALESCE(v_max_members, 999999) THEN
        RAISE EXCEPTION 'open_chat_room_full' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'joined'
     AND (OLD.status IS DISTINCT FROM 'joined')
  THEN
    SELECT count(*)::int
    INTO v_joined_count
    FROM public.open_chat_members m
    WHERE m.room_id = NEW.room_id
      AND m.status = 'joined'
      AND m.id IS DISTINCT FROM NEW.id;

    IF v_joined_count + 1 > COALESCE(v_max_members, 999999) THEN
      RAISE EXCEPTION 'open_chat_room_full' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_open_chat_chat_participant(
  p_room_id uuid,
  p_user_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_room_id uuid;
  v_existing_id uuid;
BEGIN
  SELECT linked_chat_room_id
  INTO v_chat_room_id
  FROM public.open_chat_rooms
  WHERE id = p_room_id;

  IF v_chat_room_id IS NULL THEN
    RETURN;
  END IF;

  IF p_status = 'joined' THEN
    SELECT id
    INTO v_existing_id
    FROM public.chat_room_participants
    WHERE room_id = v_chat_room_id
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
        v_chat_room_id,
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
    WHERE room_id = v_chat_room_id
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
  WHERE cr.id = v_chat_room_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_open_chat_members_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  v_room_id := COALESCE(NEW.room_id, OLD.room_id);
  PERFORM public.refresh_open_chat_room_stats(v_room_id);

  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_open_chat_chat_participant(OLD.room_id, OLD.user_id, 'left');
    RETURN OLD;
  END IF;

  IF NEW.status = 'joined' THEN
    PERFORM public.sync_open_chat_chat_participant(NEW.room_id, NEW.user_id, 'joined');
  ELSE
    PERFORM public.sync_open_chat_chat_participant(NEW.room_id, NEW.user_id, NEW.status);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_open_chat_join_requests_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_open_chat_room_stats(COALESCE(NEW.room_id, OLD.room_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.after_open_chat_notices_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_open_chat_room_stats(COALESCE(NEW.room_id, OLD.room_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.after_open_chat_bans_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_open_chat_room_stats(COALESCE(NEW.room_id, OLD.room_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_open_chat_member_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL
     OR public.is_platform_admin(v_actor)
     OR public.can_manage_open_chat_room(OLD.room_id, v_actor)
  THEN
    RETURN NEW;
  END IF;

  IF v_actor <> OLD.user_id THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.room_id IS DISTINCT FROM OLD.room_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.kicked_at IS DISTINCT FROM OLD.kicked_at
     OR NEW.kicked_by IS DISTINCT FROM OLD.kicked_by
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.status_reason IS DISTINCT FROM OLD.status_reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'joined' AND NEW.status = 'left') THEN
      RAISE EXCEPTION 'open_chat_member_status_forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.last_status_changed_at IS DISTINCT FROM OLD.last_status_changed_at THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'left' AND NEW.left_at IS NULL THEN
    NEW.left_at := now();
  ELSIF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    RAISE EXCEPTION 'open_chat_member_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_open_chat_join_request_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL
     OR public.is_platform_admin(v_actor)
     OR public.can_manage_open_chat_room(OLD.room_id, v_actor)
  THEN
    RETURN NEW;
  END IF;

  IF v_actor <> OLD.user_id THEN
    RAISE EXCEPTION 'open_chat_join_request_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.room_id IS DISTINCT FROM OLD.room_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.review_reason IS DISTINCT FROM OLD.review_reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'open_chat_join_request_update_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'pending' AND NEW.status = 'cancelled')
  THEN
    RAISE EXCEPTION 'open_chat_join_request_status_forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_open_chat_rooms_apply_defaults ON public.open_chat_rooms;
CREATE TRIGGER trg_open_chat_rooms_apply_defaults
  BEFORE INSERT OR UPDATE
  ON public.open_chat_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.open_chat_rooms_apply_defaults();

DROP TRIGGER IF EXISTS trg_open_chat_members_apply_defaults ON public.open_chat_members;
CREATE TRIGGER trg_open_chat_members_apply_defaults
  BEFORE INSERT OR UPDATE OF nickname, role, status, approved_at, last_read_at, is_muted
  ON public.open_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION public.open_chat_members_apply_defaults();

DROP TRIGGER IF EXISTS trg_open_chat_members_enforce ON public.open_chat_members;
CREATE TRIGGER trg_open_chat_members_enforce
  BEFORE INSERT OR UPDATE OF status, role, approved_at
  ON public.open_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_open_chat_member_rules();

DROP TRIGGER IF EXISTS trg_open_chat_members_touch ON public.open_chat_members;
CREATE TRIGGER trg_open_chat_members_touch
  BEFORE UPDATE ON public.open_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_open_chat_timestamp();

DROP TRIGGER IF EXISTS trg_open_chat_members_guard_client_update ON public.open_chat_members;
CREATE TRIGGER trg_open_chat_members_guard_client_update
  BEFORE UPDATE ON public.open_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_open_chat_member_client_update();

DROP TRIGGER IF EXISTS trg_open_chat_join_requests_touch ON public.open_chat_join_requests;
CREATE TRIGGER trg_open_chat_join_requests_touch
  BEFORE UPDATE ON public.open_chat_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_open_chat_timestamp();

DROP TRIGGER IF EXISTS trg_open_chat_join_requests_guard_client_update ON public.open_chat_join_requests;
CREATE TRIGGER trg_open_chat_join_requests_guard_client_update
  BEFORE UPDATE ON public.open_chat_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_open_chat_join_request_client_update();

DROP TRIGGER IF EXISTS trg_open_chat_notices_touch ON public.open_chat_notices;
CREATE TRIGGER trg_open_chat_notices_touch
  BEFORE UPDATE ON public.open_chat_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_open_chat_timestamp();

DROP TRIGGER IF EXISTS trg_after_open_chat_members_changed ON public.open_chat_members;
CREATE TRIGGER trg_after_open_chat_members_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.open_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION public.after_open_chat_members_changed();

DROP TRIGGER IF EXISTS trg_after_open_chat_join_requests_changed ON public.open_chat_join_requests;
CREATE TRIGGER trg_after_open_chat_join_requests_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.open_chat_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.after_open_chat_join_requests_changed();

DROP TRIGGER IF EXISTS trg_after_open_chat_notices_changed ON public.open_chat_notices;
CREATE TRIGGER trg_after_open_chat_notices_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.open_chat_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.after_open_chat_notices_changed();

DROP TRIGGER IF EXISTS trg_after_open_chat_bans_changed ON public.open_chat_bans;
CREATE TRIGGER trg_after_open_chat_bans_changed
  AFTER INSERT OR UPDATE OR DELETE
  ON public.open_chat_bans
  FOR EACH ROW
  EXECUTE FUNCTION public.after_open_chat_bans_changed();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.open_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_chat_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_chat_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_chat_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_chat_rooms_select_visible_v1 ON public.open_chat_rooms;
CREATE POLICY open_chat_rooms_select_visible_v1 ON public.open_chat_rooms
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(id, auth.uid())
    OR public.has_joined_open_chat_member(id, auth.uid())
    OR (
      status = 'active'
      AND visibility = 'public'
    )
    OR EXISTS (
      SELECT 1
      FROM public.open_chat_join_requests jr
      WHERE jr.room_id = open_chat_rooms.id
        AND jr.user_id = auth.uid()
        AND jr.status = 'pending'
    )
  );

DROP POLICY IF EXISTS open_chat_rooms_insert_owner_v1 ON public.open_chat_rooms;
CREATE POLICY open_chat_rooms_insert_owner_v1 ON public.open_chat_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS open_chat_rooms_update_manage_v1 ON public.open_chat_rooms;
CREATE POLICY open_chat_rooms_update_manage_v1 ON public.open_chat_rooms
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_members_select_v1 ON public.open_chat_members;
CREATE POLICY open_chat_members_select_v1 ON public.open_chat_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
    OR (
      status = 'joined'
      AND public.has_joined_open_chat_member(room_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS open_chat_members_insert_self_v1 ON public.open_chat_members;
CREATE POLICY open_chat_members_insert_self_v1 ON public.open_chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
  );

DROP POLICY IF EXISTS open_chat_members_insert_manage_v1 ON public.open_chat_members;
CREATE POLICY open_chat_members_insert_manage_v1 ON public.open_chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_members_update_self_or_manage_v1 ON public.open_chat_members;
CREATE POLICY open_chat_members_update_self_or_manage_v1 ON public.open_chat_members
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_join_requests_select_v1 ON public.open_chat_join_requests;
CREATE POLICY open_chat_join_requests_select_v1 ON public.open_chat_join_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_join_requests_insert_self_v1 ON public.open_chat_join_requests;
CREATE POLICY open_chat_join_requests_insert_self_v1 ON public.open_chat_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS open_chat_join_requests_update_self_or_manage_v1 ON public.open_chat_join_requests;
CREATE POLICY open_chat_join_requests_update_self_or_manage_v1 ON public.open_chat_join_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_bans_select_v1 ON public.open_chat_bans;
CREATE POLICY open_chat_bans_select_v1 ON public.open_chat_bans
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_bans_manage_v1 ON public.open_chat_bans;
CREATE POLICY open_chat_bans_manage_v1 ON public.open_chat_bans
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

DROP POLICY IF EXISTS open_chat_notices_select_v1 ON public.open_chat_notices;
CREATE POLICY open_chat_notices_select_v1 ON public.open_chat_notices
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
    OR public.has_joined_open_chat_member(room_id, auth.uid())
    OR (
      visibility = 'public'
      AND EXISTS (
        SELECT 1
        FROM public.open_chat_rooms r
        WHERE r.id = open_chat_notices.room_id
          AND r.status = 'active'
          AND r.visibility = 'public'
      )
    )
  );

DROP POLICY IF EXISTS open_chat_notices_manage_v1 ON public.open_chat_notices;
CREATE POLICY open_chat_notices_manage_v1 ON public.open_chat_notices
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.can_manage_open_chat_room(room_id, auth.uid())
  );

COMMENT ON POLICY open_chat_rooms_select_visible_v1 ON public.open_chat_rooms IS
  '활성 공개방은 누구나 조회, 비공개/운영 메타는 참여자·운영자·관리자·대기 신청자만 조회';
COMMENT ON POLICY open_chat_members_select_v1 ON public.open_chat_members IS
  '운영자는 전체 멤버 상태를 보고, 일반 참여자는 joined 멤버만 조회';
COMMENT ON POLICY open_chat_join_requests_select_v1 ON public.open_chat_join_requests IS
  '가입 신청은 본인/운영자/관리자만 조회';
COMMENT ON POLICY open_chat_bans_manage_v1 ON public.open_chat_bans IS
  '차단 이력은 운영자/관리자만 관리';
COMMENT ON POLICY open_chat_notices_select_v1 ON public.open_chat_notices IS
  '공지 조회는 공개 공지 또는 참여/운영 권한 기준';

-- ---------------------------------------------------------------------------
-- 기존 데이터 정합성 초기화
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.open_chat_rooms LOOP
    PERFORM public.refresh_open_chat_room_stats(r.id);
  END LOOP;
END $$;

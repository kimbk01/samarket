-- Apple 결제로 충전한 Point 는 디지털 광고·홍보에만 (Owner 2026-11-05 조건부 승인)
-- 근거: App Review Guidelines 3.1.1(앱 안 디지털 기능 = 인앱 결제) · 3.1.3(e)(실물·앱 밖 서비스 = 인앱 결제 금지)
--
-- 계약
--   - 지갑·원장 그대로: point_ledger 합계 = 총잔액, profiles.points = 투영. 새 화폐·새 잔액 없음.
--   - 회원별 「Apple 충전분 남은 금액」 R(≥ 0)만 따로 센다. 일반 Point = 총잔액 − R.
--     기존 음수 잔액 정책(관리자 회수·커뮤니티 회수·소멸)은 그대로 — 그 차감은 R 을 건드리지 않으므로 일반 Point 가 음수일 수 있다.
--     「R ≤ 총잔액」은 강제하지 않는다. 합계 관계 R + 일반 Point = 총잔액 은 정의상 항상 성립한다.
--   - R 변화는 point_ledger INSERT 한 곳(트리거)에서만. 모든 지급·차감 함수가 원장을 거친다(2026-11-05 운영 함수 조사:
--     원장 INSERT 18개 함수 · 원장 UPDATE 는 expired_amount / actor_id 만 · TS 직접 INSERT 는 금액 0 감사 행만).
--   - 사용처
--       디지털(광고·홍보): feed_ad_request · promotion_order · trade_post_ad · ad_application 의 차감 → Apple 충전분부터 사용,
--         차감마다 Apple 충전분 사용액을 기록 → 보류 해제·환불은 그 차감 건(같은 신청·주문)에 쓴 Apple 충전분까지만 되돌린다.
--       제한 차감(상품권 · 매장 주문 할인 · 목록에 없는 새 유형): 일반 Point(총잔액 − R, 0 미만은 0) 안에서만. 넘으면 거절(전체).
--       기존 규칙 유지(R 불변): 관리자 지급·회수(admin_manual · 소멸 포함) · 커뮤니티 보상 회수 · 계좌이체 충전 · 보상.
--       Apple 환불 회수(apple_iap_refund) → R 감소(남은 R 까지) · 환불 취소 반영(apple_iap_refund_reversal) → 그 회수가 R 에서
--         가져간 만큼 복원 — 둘 다 같은 Apple 거래(related_id = 결제 시도 id)에 연결.
--   - 기존 데이터: Apple 충전 0건 → 모든 회원 R 행 없음(= 0). 기존 거래 재분류·원장 수정 없음, 기존 동작 변화 없음.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Apple 충전분 남은 금액 (회원별 1행 · Apple 충전이 처음 지급될 때 생긴다)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.point_apple_fund_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  restricted integer NOT NULL DEFAULT 0 CHECK (restricted >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- R 을 바꾼 원장 줄마다 1행 (감사 · 디지털 차감의 Apple 충전분 사용액과 되돌린 금액)
CREATE TABLE IF NOT EXISTS public.point_apple_fund_events (
  ledger_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('apple_credit', 'apple_recover', 'apple_reverse', 'digital_use', 'digital_restore')),
  related_type text NOT NULL,
  link_key text,
  amount integer NOT NULL CHECK (amount >= 0),
  restored integer NOT NULL DEFAULT 0,
  restricted_after integer NOT NULL CHECK (restricted_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_apple_fund_events_restored_chk CHECK (restored >= 0 AND restored <= amount),
  CONSTRAINT point_apple_fund_events_restored_use_only_chk CHECK (restored = 0 OR kind = 'digital_use')
);
CREATE INDEX IF NOT EXISTS point_apple_fund_events_open_use_idx
  ON public.point_apple_fund_events (user_id, related_type, link_key, created_at)
  WHERE kind = 'digital_use' AND amount > restored;

ALTER TABLE public.point_apple_fund_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_apple_fund_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.point_apple_fund_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.point_apple_fund_events FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_point_apple_fund_balances_block_client_role_writes ON public.point_apple_fund_balances;
CREATE TRIGGER trg_point_apple_fund_balances_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.point_apple_fund_balances
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
DROP TRIGGER IF EXISTS trg_point_apple_fund_events_block_client_role_writes ON public.point_apple_fund_events;
CREATE TRIGGER trg_point_apple_fund_events_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.point_apple_fund_events
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 원장 줄 분류
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.point_apple_fund_class(
  p_entry_type text,
  p_related_type text,
  p_related_id text,
  p_amount integer
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rt text := btrim(coalesce(p_related_type, ''));
  v_et text := btrim(coalesce(p_entry_type, ''));
  v_digital boolean := v_rt IN ('feed_ad_request', 'promotion_order', 'trade_post_ad', 'ad_application');
BEGIN
  IF coalesce(p_amount, 0) = 0 THEN
    RETURN 'none';
  END IF;
  IF p_amount > 0 THEN
    IF v_rt = 'point_charge' AND v_et = 'charge' AND EXISTS (
      SELECT 1 FROM public.point_charge_requests r
       WHERE r.id::text = btrim(coalesce(p_related_id, ''))
         AND r.payment_method IN ('apple_iap', 'apple_iap_sandbox')
    ) THEN
      RETURN 'apple_credit';
    END IF;
    IF v_rt = 'apple_iap_refund_reversal' THEN
      RETURN 'apple_reverse';
    END IF;
    IF v_digital AND v_et IN ('ad_hold_release', 'ad_refund', 'refund') THEN
      RETURN 'digital_restore';
    END IF;
    RETURN 'general_credit';
  END IF;
  IF v_digital AND v_et IN ('ad_hold', 'ad_purchase', 'ad_charge', 'spend', 'promotion_extend') THEN
    RETURN 'digital_use';
  END IF;
  IF v_rt = 'apple_iap_refund' THEN
    RETURN 'apple_recover';
  END IF;
  IF v_rt IN ('admin_manual', 'community_reclaim') THEN
    RETURN 'exempt_debit';
  END IF;
  -- 상품권 · 매장 주문 할인 · 목록에 없는 새 유형 → Apple 충전분 사용 금지
  RETURN 'restricted_debit';
END;
$fn$;

-- 디지털 차감과 그 해제·환불을 같은 신청·주문으로 묶는 키 (운영 related_id 형식 2026-11-05 조사). 못 찾으면 NULL.
CREATE OR REPLACE FUNCTION public.point_apple_fund_link_key(p_related_type text, p_related_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v text := btrim(coalesce(p_related_id, ''));
  v_rt text := btrim(coalesce(p_related_type, ''));
  v_ref text;
  v_out text;
BEGIN
  IF v = '' THEN
    RETURN NULL;
  END IF;
  IF v_rt = 'feed_ad_request' THEN
    v_ref := split_part(v, ':', 2);
    IF v ~ '^(hold|capture|hold_insert_fail_release):' THEN
      RETURN 'req:' || v_ref;
    END IF;
    IF v ~ '^(release|compensate):' THEN
      SELECT 'req:' || h.request_id::text INTO v_out FROM public.feed_ad_point_holds h WHERE h.id::text = v_ref;
      RETURN v_out;
    END IF;
    IF v ~ '^(renew|renew-refund|feed-ad-end-refund):' THEN
      SELECT 'req:' || c.request_id::text INTO v_out
        FROM public.feed_ad_campaigns c WHERE c.id::text = v_ref AND c.request_id IS NOT NULL;
      RETURN v_out;
    END IF;
    RETURN NULL;
  END IF;
  IF v_rt = 'promotion_order' THEN
    IF v ~ '^release:' THEN
      SELECT 'order:' || h.promotion_order_id::text INTO v_out
        FROM public.promotion_point_holds h WHERE h.id::text = split_part(v, ':', 2);
      RETURN v_out;
    END IF;
    RETURN 'order:' || regexp_replace(v, '^(hold|capture|refund):', '');
  END IF;
  IF v_rt = 'trade_post_ad' THEN
    IF v ~ '^release:' THEN
      SELECT 'ad:' || h.trade_post_ad_id::text INTO v_out
        FROM public.trade_ad_point_holds h WHERE h.id::text = split_part(v, ':', 2);
      RETURN v_out;
    END IF;
    RETURN 'ad:' || regexp_replace(v, '^(hold|charge|finalize|refund):', '');
  END IF;
  -- ad_application: 차감·실패 환급 모두 related_id = 광고 신청 id
  RETURN v_rt || ':' || v;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 원장 INSERT 트리거 — R 갱신 · 제한 차감 거절
--    잠금 순서: 호출 함수가 profiles 행을 먼저 잠그고(기존 계약), 여기서 회원의 R 행을 잠근다 → 순서 고정.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.point_ledger_apple_fund_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_class text;
  v_r integer;
  v_take integer := 0;
  v_left integer;
  v_x integer;
  v_key text;
  v_sum integer;
  v_avail integer;
  v_ev record;
BEGIN
  IF NEW.user_id IS NULL OR NEW.amount IS NULL THEN
    RETURN NEW;
  END IF;
  v_class := public.point_apple_fund_class(NEW.entry_type, NEW.related_type, NEW.related_id, NEW.amount);
  IF v_class IN ('none', 'general_credit', 'exempt_debit') THEN
    RETURN NEW;
  END IF;

  IF v_class = 'apple_credit' THEN
    INSERT INTO public.point_apple_fund_balances AS b (user_id, restricted)
    VALUES (NEW.user_id, NEW.amount)
    ON CONFLICT (user_id) DO UPDATE SET restricted = b.restricted + EXCLUDED.restricted, updated_at = now()
    RETURNING b.restricted INTO v_r;
    INSERT INTO public.point_apple_fund_events (ledger_id, user_id, kind, related_type, amount, restricted_after)
    VALUES (NEW.id, NEW.user_id, 'apple_credit', NEW.related_type, NEW.amount, v_r);
    RETURN NEW;
  END IF;

  SELECT restricted INTO v_r FROM public.point_apple_fund_balances WHERE user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Apple 충전을 받은 적 없는 회원: 지킬 것도 되돌릴 것도 없다 (기존 동작 그대로)
    RETURN NEW;
  END IF;

  IF v_class = 'restricted_debit' THEN
    IF v_r > 0 THEN
      v_sum := public.sum_user_point_ledger(NEW.user_id);
      v_avail := greatest(0, v_sum - v_r);
      IF -NEW.amount > v_avail THEN
        RAISE EXCEPTION 'point_apple_funds_restricted'
          USING ERRCODE = 'P0001',
                DETAIL = jsonb_build_object('total', v_sum, 'apple_only', v_r, 'available', v_avail,
                                            'required', -NEW.amount)::text;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_class = 'apple_reverse' THEN
    -- 환불 취소 반영: 같은 Apple 거래의 회수가 Apple 충전분에서 가져간 만큼만 되돌린다 (회수 기록이 없으면 전액)
    v_key := NEW.related_id;
    SELECT e.amount INTO v_x
      FROM public.point_apple_fund_events e
     WHERE e.user_id = NEW.user_id AND e.kind = 'apple_recover' AND e.link_key = v_key
     ORDER BY e.created_at DESC
     LIMIT 1;
    v_take := least(NEW.amount, coalesce(v_x, NEW.amount));
    v_r := v_r + v_take;
  ELSIF v_class = 'apple_recover' THEN
    v_key := NEW.related_id;
    v_take := least(v_r, -NEW.amount);
    v_r := v_r - v_take;
  ELSIF v_class = 'digital_use' THEN
    v_take := least(v_r, -NEW.amount);
    v_r := v_r - v_take;
    v_key := public.point_apple_fund_link_key(NEW.related_type, NEW.related_id);
  ELSIF v_class = 'digital_restore' THEN
    v_key := public.point_apple_fund_link_key(NEW.related_type, NEW.related_id);
    v_left := NEW.amount;
    -- 연결 키를 못 찾은 형식은 같은 유형의 남은 Apple 사용분에서 되돌린다 (Apple 충전분이 일반 Point 로 새지 않게)
    FOR v_ev IN
      SELECT e.ledger_id, e.amount - e.restored AS open_amount
        FROM public.point_apple_fund_events e
       WHERE e.user_id = NEW.user_id AND e.kind = 'digital_use' AND e.related_type = NEW.related_type
         AND e.amount > e.restored
         AND (v_key IS NULL OR e.link_key = v_key)
       ORDER BY e.created_at, e.ledger_id
       FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_x := least(v_ev.open_amount, v_left);
      UPDATE public.point_apple_fund_events SET restored = restored + v_x WHERE ledger_id = v_ev.ledger_id;
      v_left := v_left - v_x;
      v_take := v_take + v_x;
    END LOOP;
    v_r := v_r + v_take;
  END IF;

  UPDATE public.point_apple_fund_balances SET restricted = v_r, updated_at = now() WHERE user_id = NEW.user_id;
  INSERT INTO public.point_apple_fund_events (ledger_id, user_id, kind, related_type, link_key, amount, restricted_after)
  VALUES (NEW.id, NEW.user_id, v_class, NEW.related_type, v_key, v_take, v_r);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_point_ledger_apple_fund_guard ON public.point_ledger;
CREATE TRIGGER trg_point_ledger_apple_fund_guard
  BEFORE INSERT ON public.point_ledger
  FOR EACH ROW EXECUTE FUNCTION public.point_ledger_apple_fund_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 회원·서버 표시용 — 총 Point · Apple 충전분(광고·홍보 전용) · 상품권·주문에 쓸 수 있는 Point
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.point_apple_fund_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH t AS (
    SELECT public.sum_user_point_ledger(p_user_id) AS total,
           coalesce((SELECT b.restricted FROM public.point_apple_fund_balances b WHERE b.user_id = p_user_id), 0) AS apple_only
  )
  SELECT jsonb_build_object('total', t.total, 'apple_only', t.apple_only,
                            'general_available', greatest(0, t.total - t.apple_only))
    FROM t;
$fn$;

REVOKE ALL ON FUNCTION public.point_apple_fund_class(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_apple_fund_link_key(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_ledger_apple_fund_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.point_apple_fund_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.point_apple_fund_summary(uuid) TO service_role;
GRANT SELECT ON public.point_apple_fund_balances TO service_role;
GRANT SELECT ON public.point_apple_fund_events TO service_role;

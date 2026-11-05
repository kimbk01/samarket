-- Re-enable Point source control after 20271107110000_apple_iap_rollback.sql.
--
-- 해제 기간의 원장 변동은 출처 기록에 없다. 잔액(원장)은 건드리지 않고, 회원별 Apple 전용 잔액을
-- 현재 총잔액(0 이상) 이하로만 줄인다 — 늘리지 않으므로 해제 기간에 쓴 금액을 다시 막지 않는다.
-- 해제 기간에 환불된 광고 사용분은 Apple 전용으로 되돌리지 않는다 (일반 Point 로 남음).
SET lock_timeout = '5s';

BEGIN;

LOCK TABLE public.point_ledger IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.point_apple_fund_balances b
   SET restricted = GREATEST(0, public.sum_user_point_ledger(b.user_id)),
       updated_at = now()
 WHERE b.restricted > GREATEST(0, public.sum_user_point_ledger(b.user_id));

DROP TRIGGER IF EXISTS trg_point_ledger_apple_fund_guard ON public.point_ledger;
CREATE TRIGGER trg_point_ledger_apple_fund_guard
  BEFORE INSERT ON public.point_ledger
  FOR EACH ROW EXECUTE FUNCTION public.point_ledger_apple_fund_guard();

COMMIT;

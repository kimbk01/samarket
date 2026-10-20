-- 배달 오너 감사 1-D 권한·DB 방어 (문서 G-1 §4-D, Owner D-0 · 2026-10-20) — N-1 · N-3 · N-2 · N-4A · N-5
-- 근거(운영 읽기 전용 조회 2026-10-21 PHT):
--   * 대상 테이블 전부 anon/authenticated/service_role 에 INSERT·UPDATE·DELETE·TRUNCATE GRANT 잔존, 소유자 postgres.
--   * N-1 store_inquiries: store_inquiries_update_owner(UPDATE, 컬럼 제한 없음) + store_inquiries_insert_buyer(INSERT) 정책.
--     앱 쓰기는 전부 service_role 서버 API (app/api/stores/[slug]/inquiries, app/api/me/stores/[storeId]/inquiries/**).
--   * N-3 store_business_verifications: store_biz_ver_update_owner_admin(WITH CHECK 없음 → 오너 자기 승인 가능)
--     + store_biz_ver_insert_owner. 0행 · 앱 코드 참조 0건. (ACC-05 기능은 D-17 결정 후 RPC 로만 — 이 파일 범위 밖)
--   * N-2 user_addresses: insert/update/delete_own 정책 → 회원이 canonical_lgu_id 직접 위조 가능.
--     앱 쓰기는 전부 service_role (lib/addresses/user-address-service.ts 호출부 = tryGetSupabaseForStores / service client).
--   * N-4A Coin·출금·상품권 매출 원장: 쓰기 정책 없음(클라 DML 은 지금도 RLS 거부) 이지만 GRANT·TRUNCATE(RLS·행 트리거 우회) 잔존.
--     작성 함수 전부 SECURITY DEFINER · 소유자 postgres 확인 (coin_withdrawal_request/_mark_paid/_reject,
--     convert_store_economic_points_to_business_cash, credit_coin_from_confirmed_sale/_settlement, credit_store_economic_points_inflow,
--     ensure_store_economic_point_account, reverse_coin_credits_for_order, gift_certificate_* (recognize/redemption_reverse/cash_out_*),
--     create_store_order_atomic, approve/reject_business_cash_charge_request, delivery_alert_apply_auto_action_effect).
--     SECURITY INVOKER 작성 함수 0건. TS 서버 직접 쓰기: business_cash_charge_requests(canonical-business-cash-writer),
--     store_settlements(adjust/cancel/ensure-store-settlement), business_cash_conversion_rate_policies(conversion-policy)
--     → 이 3개는 service_role 쓰기 유지(TRUNCATE 만 회수, N-4B 는 FIN-04·FIN-06 이후).
--   * N-5 운영 정책 stores_public_read_approved / store_products_owner_all 이 internal.is_admin_user() 를 호출하는데
--     anon 에 EXECUTE 가 없어 anon 직접 SELECT 는 이미 permission denied for function 으로 실패 중.
--     제품 경로의 anon 직접 조회 0건(공개 목록·상세 = service_role 서버, 브라우저 Realtime 은 관리자 세션만) →
--     노출 확대 금지 원칙에 따라 GRANT EXECUTE 대신 anon SELECT 를 명시 회수(동작 동일: 거부, 오류 원인만 명시화).
--     internal.is_admin_user()·is_platform_admin() 정의는 저장소에 없던 운영 드리프트 → 아래에 운영 원문 그대로 고정.
-- 유지: SELECT 권한·SELECT 정책(오너·구매자·관리자 조회). SECURITY DEFINER 함수는 소유자(postgres) 권한으로 계속 동작.
--       service_role 은 거부 트리거 통과(current_user 판정). 데이터 변경 없음 (D-5).
-- 재사용: public.block_client_role_direct_writes() (20270602100000) — 새 트리거 함수 0.
-- 함수 본문에는 비 ASCII 주석을 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백:
--   DROP TRIGGER IF EXISTS trg_store_inquiries_block_client_role_writes ON public.store_inquiries;
--   DROP TRIGGER IF EXISTS trg_store_business_verifications_block_client_role_writes ON public.store_business_verifications;
--   DROP TRIGGER IF EXISTS trg_user_addresses_block_client_role_writes ON public.user_addresses;
--   DROP TRIGGER IF EXISTS trg_<N-4A 각 테이블>_block_client_role_writes ON public.<테이블>;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.store_inquiries, public.store_business_verifications, public.user_addresses,
--     public.store_economic_point_accounts, public.store_economic_point_ledger, public.coin_withdrawal_requests,
--     public.gift_certificate_revenue_ledger, public.business_cash_charge_requests,
--     public.business_cash_conversion_rate_policies, public.store_settlements TO anon, authenticated, service_role;
--   GRANT SELECT ON public.stores, public.store_products TO anon;
--   정책 복원 (운영 원문):
--   CREATE POLICY store_inquiries_update_owner ON public.store_inquiries FOR UPDATE
--     USING (EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id AND s.owner_user_id = auth.uid()))
--     WITH CHECK (EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id AND s.owner_user_id = auth.uid()));
--   CREATE POLICY store_inquiries_insert_buyer ON public.store_inquiries FOR INSERT
--     WITH CHECK (from_user_id = auth.uid() AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_inquiries.store_id
--       AND s.approval_status = 'approved' AND s.is_visible = true));
--   CREATE POLICY store_biz_ver_update_owner_admin ON public.store_business_verifications FOR UPDATE
--     USING (internal.is_admin_user() OR owner_user_id = auth.uid());
--   CREATE POLICY store_biz_ver_insert_owner ON public.store_business_verifications FOR INSERT
--     WITH CHECK (owner_user_id = auth.uid() AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_business_verifications.store_id
--       AND s.owner_user_id = auth.uid()));
--   CREATE POLICY user_addresses_insert_own ON public.user_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY user_addresses_update_own ON public.user_addresses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY user_addresses_delete_own ON public.user_addresses FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- N-5 (드리프트 고정): internal 스키마 관리자 판정 함수 — 운영 원문 그대로 (권한도 운영과 동일: anon EXECUTE 없음)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$ select exists (select 1 from public.admin_memberships m where m.user_id=auth.uid() and m.status='active' and m.role in ('admin','super_admin')) $fn$;

CREATE OR REPLACE FUNCTION internal.is_platform_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        AND m.role IN ('admin', 'super_admin')
    );
$fn$;

REVOKE ALL ON FUNCTION internal.is_admin_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION internal.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.is_admin_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.is_platform_admin(uuid) TO authenticated, service_role;

-- N-5: anon 직접 SELECT 명시 거부 (이미 함수 권한 오류로 실패하던 경로 — 노출 범위 변화 없음)
REVOKE SELECT ON public.stores FROM anon;
REVOKE SELECT ON public.store_products FROM anon;

-- ---------------------------------------------------------------------------
-- N-1 store_inquiries
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_inquiries FROM anon, authenticated;
REVOKE TRUNCATE ON public.store_inquiries FROM service_role;
DROP POLICY IF EXISTS store_inquiries_update_owner ON public.store_inquiries;
DROP POLICY IF EXISTS store_inquiries_insert_buyer ON public.store_inquiries;
DROP TRIGGER IF EXISTS trg_store_inquiries_block_client_role_writes ON public.store_inquiries;
CREATE TRIGGER trg_store_inquiries_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

-- ---------------------------------------------------------------------------
-- N-3 store_business_verifications (권한 부분만 — 제출·심사 RPC 는 ACC-05/D-17)
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_business_verifications FROM anon, authenticated;
REVOKE TRUNCATE ON public.store_business_verifications FROM service_role;
DROP POLICY IF EXISTS store_biz_ver_update_owner_admin ON public.store_business_verifications;
DROP POLICY IF EXISTS store_biz_ver_insert_owner ON public.store_business_verifications;
DROP TRIGGER IF EXISTS trg_store_business_verifications_block_client_role_writes ON public.store_business_verifications;
CREATE TRIGGER trg_store_business_verifications_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_business_verifications
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

-- ---------------------------------------------------------------------------
-- N-2 user_addresses
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_addresses FROM anon, authenticated;
REVOKE TRUNCATE ON public.user_addresses FROM service_role;
DROP POLICY IF EXISTS user_addresses_insert_own ON public.user_addresses;
DROP POLICY IF EXISTS user_addresses_update_own ON public.user_addresses;
DROP POLICY IF EXISTS user_addresses_delete_own ON public.user_addresses;
DROP TRIGGER IF EXISTS trg_user_addresses_block_client_role_writes ON public.user_addresses;
CREATE TRIGGER trg_user_addresses_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_addresses
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

-- ---------------------------------------------------------------------------
-- N-4A Coin·출금·상품권 매출 원장 · 캐시 충전 요청 · 전환율 정책 · 레거시 정산
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.store_economic_point_accounts,
  public.store_economic_point_ledger,
  public.coin_withdrawal_requests,
  public.gift_certificate_revenue_ledger,
  public.business_cash_charge_requests,
  public.business_cash_conversion_rate_policies,
  public.store_settlements
FROM anon, authenticated;

REVOKE TRUNCATE ON
  public.store_economic_point_accounts,
  public.store_economic_point_ledger,
  public.coin_withdrawal_requests,
  public.gift_certificate_revenue_ledger,
  public.business_cash_charge_requests,
  public.business_cash_conversion_rate_policies,
  public.store_settlements
FROM service_role;

-- TS 직접 작성자가 없는 4개 원장: service_role 직접 쓰기도 회수 (SECURITY DEFINER RPC 만 작성)
REVOKE INSERT, UPDATE, DELETE ON
  public.store_economic_point_accounts,
  public.store_economic_point_ledger,
  public.coin_withdrawal_requests,
  public.gift_certificate_revenue_ledger
FROM service_role;

DROP TRIGGER IF EXISTS trg_store_economic_point_accounts_block_client_role_writes ON public.store_economic_point_accounts;
CREATE TRIGGER trg_store_economic_point_accounts_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_economic_point_accounts
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_store_economic_point_ledger_block_client_role_writes ON public.store_economic_point_ledger;
CREATE TRIGGER trg_store_economic_point_ledger_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_economic_point_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_coin_withdrawal_requests_block_client_role_writes ON public.coin_withdrawal_requests;
CREATE TRIGGER trg_coin_withdrawal_requests_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.coin_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_gift_certificate_revenue_ledger_block_client_role_writes ON public.gift_certificate_revenue_ledger;
CREATE TRIGGER trg_gift_certificate_revenue_ledger_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.gift_certificate_revenue_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_business_cash_charge_requests_block_client_role_writes ON public.business_cash_charge_requests;
CREATE TRIGGER trg_business_cash_charge_requests_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_cash_charge_requests
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_bc_conversion_rate_policies_block_client_role_writes ON public.business_cash_conversion_rate_policies;
CREATE TRIGGER trg_bc_conversion_rate_policies_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.business_cash_conversion_rate_policies
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_store_settlements_block_client_role_writes ON public.store_settlements;
CREATE TRIGGER trg_store_settlements_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.store_settlements
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

# DIBAY ADMIN — 배달 운영 관리 전수 감사 및 통합 설계안

**상태:** 감사·설계안 제출 (Owner 검토 대기) · **코드 / DB / 메뉴 / 배포 변경 없음**
**기준:** `origin/main` @ `e2d206bf` (2026-10-18) · 읽기 전용 코드 추적 (운영 DB 조회·쓰기 없음)
**선행 SSOT (보존 대상):** `components/admin/admin-menu.ts` · `docs/admin/platform-admin-ia-lock.md` · `docs/dibay-admin-real-operation-cut-j-ia-separation-hard-lock.md` · `docs/admin/dibay-admin-ia-owner-approved-amendment.md` (M1) · CUT C/E/F · `docs/store-commission-cash-settlement-ssot.md` · `docs/admin-store-order-ops-ssot.md` · `lib/stores/store-order-process-model.ts`

판정 표기: **PROVEN**(코드로 확인) · **DEFECT**(확인된 결함) · **MISSING**(기능 없음) · **NOT_PROVEN**(미검증)

> 이 문서는 **① 현재 상황(감사) → ② 개선안(설계) → ③ Owner 승인 필요 사항** 순서로 구성한다.
> 보고서 A–G 는 각 장에 매핑된다 (A·B·C·F → ①, D·E → ②, G → ②·③).

---

## 요약 (Executive summary)

| 항목 | 값 |
|---|---|
| Admin 메뉴 leaf 전체 | **174** (공개 164 · 숨김 legacy 광고 10) |
| 배달 워크스페이스 leaf | **34** (그중 `partial` 9) |
| 배달 운영 관련 메뉴 leaf (워크스페이스 밖 포함) | **59** = 배달 34 + 재무 10 + 광고 7 + 고객지원 3 + 회원 2 + 대시보드 1 + 메신저 참조 1 + 프로모션(오너 요청) 1 |
| 메뉴 미등재 실가동 화면 | **9** (매장 캐시 충전 승인, 배달 문의, 매장 상세 `/admin/business/[id]`, 광고 상세 `/admin/delivery-ads/[id]`, 광고 상품 설정, 노출 인벤토리, 파트너, 1st-party 신규, legacy 광고신청 상세) |
| ① 완전 중복 | **6** |
| ② 역할상 필요한 분리 (유지) | **6** |
| ③ 기능 분산 | **6** |
| ④ 연결 누락 | **10** |
| ⑤ 결함·누락 | **34** (금전·권한 10 · 매장 10 · 주문 4 · 지원 2 · 재무 4 · 광고 3 · UI 1) |
| 개발자 용어 노출 | **45+ 곳** (§1.6) |

**가장 시급한 5가지**
1. **금전·제재 작업에 서버 권한 등급이 없다.** 수수료율 변경·매장 운영 중지·캐시 충전 승인·환불 승인·유료 광고 연장·런타임 토글을 *모든* 관리자가 실행할 수 있다. 메뉴 역할 필터는 클라이언트 전용이고 `viewer` 역할은 생성되지 않는다.
2. **수수료 정책에 변경 이력·감사 로그가 없고**, 예약 변경이 비원자 2회 호출이라 실패 시 정책 공백 → **주문이 조리 단계로 못 넘어가는 장애** 가능.
3. **레거시 "지급 예정 정산" writer 가 여전히 동작**한다 (SSOT: 주문별 지급 없음과 모순, F13).
4. **입점 심사 흐름 결함**: 상태 전이 가드 없음(거절→승인 가능), 보완 후 재심사 경로 없음, 「재개(노출 복구)」가 노출을 복구하지 않음, 결정 시 사장님 자동 알림 없음.
5. **공통 Admin UI/CTA 표준 문서가 없다.** 배달 화면 9개 중 공통 표 0, 공통 확인 팝업 0; 원시 영문 상태·오류 코드 노출.

---

# ① 현재 상황 (감사 결과)

## 1.1 보고서 A — 배달 관련 관리자 메뉴 전체 현황

공통: 페이지 레이아웃은 `app/admin/layout.tsx` 에서 "관리자 여부"만 서버 확인. API 가드는 `isRouteAdmin()`(활성 admin membership 여부) / `requireAdminApiUser()`(동일 수준) / `requireAdminPermission(key)` / `requireSuperAdmin()` 4종이 혼재.

### A-1. 배달 워크스페이스 (34 leaf)

| # | 메뉴명 (표시) | 위치 | URL | 실제 기능 | 주요 API → DB | 가드 | 상태 | 의견 |
|---|---|---|---|---|---|---|---|---|
| 1 | 배달 대시보드 | 배달 | `/admin/delivery` | 도메인 카운트 + 액션큐 카드 | `loadDeliveryDomainDashboard` → `store_orders`, `stores`, action-queue | admin | 정상 | 유지·지표 확장 |
| 2 | 주문 목록 | 운영 › 주문 운영 | `/admin/stores/orders` | 전체 주문, 기간 현황 (#65/#66) | `/api/admin/store-orders/ops` → RPC `admin_store_order_ops_page/summary/facts` | admin | 정상 | 유지 |
| 3 | 주문 액션 | 〃 | `/admin/store-orders` | `needs_admin_attention` 예외 큐 (같은 `AdminOrderOpsScreen`) | 동일 RPC | admin | partial | 유지·명칭 변경 |
| 4 | 취소 요청 | 〃 | `/admin/stores/orders/cancellations` | 동일 화면 고정 필터 | 동일 | admin | 정상 | 유지 |
| 5 | 환불 요청 | 〃 | `/admin/stores/orders/refunds` | 동일 화면 고정 필터 | 동일 | admin | 정상 | 유지 |
| 6 | 감사 로그 | 〃 | `/admin/stores/orders/logs` | 주문 감사 기록 | `audit_logs` | admin | 정상 | 명칭 변경 |
| 7 | 주문 채팅 | 〃 | `/admin/order-chats` | 주문 채팅 모니터 (`/admin/chats/business` 별칭) | order-chat | admin | 정상 | 유지 |
| 8 | 입점 심사 | 운영 | `/admin/stores` | 신청 목록 + 인라인 심사 패널 | `/api/admin/stores`, PATCH `/api/admin/stores/[id]` → `stores` | `isRouteAdmin` | partial | 유지 (M1) · 결함 수정 |
| 9 | 메뉴·상품 검수 | 운영 | `/admin/store-products` | 매장 상품 검수 | `store_products` (감사 로그 O) | `isRouteAdmin` | partial | 유지 |
| 10 | HOME 구성 | 운영 | `/admin/stores-home-shelves` | 매장 홈 선반 CMS | stores home shelves | admin | 정상 | 섹션 이동 |
| 11–12 | 1차 / 2차 업종 | 운영 › 업종 관리 | `/admin/stores/application-settings?focus=category\|topic` | 업종 분류 | `/api/admin/stores/taxonomy` | admin | 정상 | 섹션 이동 |
| 13 | BROWSE 노출 정책 | 운영 | `/admin/stores-category-policy` | 목록 노출 정책 | — | admin | 정상 | 섹션 이동·명칭 |
| 14 | 쿠폰 운영 센터 | 운영 | `/admin/store-coupon-control` | 매장 쿠폰 승인/중지/회수 | `store_coupon_campaigns`, `coupon_audit_events` | admin | 정상·**결함** | 섹션 이동 |
| 15 | 상품권 관리 | 운영 | `/admin/gift-certificates` | 상품권 운영 탭 | gift ops (일부 POST 410) | business | 정상 | 섹션 이동 |
| 16 | 기획 프로모션 | 운영 | `/admin/store-discovery` | 플랫폼 기획 노출 | `store_discovery_campaigns` | admin | 정상 | 섹션 이동 |
| 17 | 운영 콘솔 | 운영 | `/admin/ops-console` | 알림·자동액션·라이더·복구 종합 | `/api/admin/ops-console/summary` + RPC `admin_delivery_operations_dashboard` | admin | 정상·**결함** | 유지·중복 정리 |
| 18 | 운영 통계 | 운영 | `/admin/delivery-operations` | KPI + 복구 센터 | **동일 RPC** + `/recovery` | admin | 정상 | 유지 (통계 전용화) |
| 19 | 라이더 | 운영 | `/admin/delivery-riders` | 라이더 운영 (실테이블) | `delivery_riders`, `store_order_deliveries` | admin | 정상 | 유지 |
| 20 | 운영 알림 | 운영 | `/admin/delivery-alerts` | 규칙 기반 배달 경고 | `delivery_operation_alert_events/rules` | admin | 정상 | 명칭 |
| 21 | 액션 큐 | 운영 | `/admin/order-notifications` | **전 도메인** 관리자 할 일 큐 (주문 아님) | `/api/admin/admin-bell` | admin | 정상 | 위치·명칭 변경 |
| 22 | 자동 액션 | 운영 | `/admin/delivery-auto-actions` | 자동 조치 승인 큐 | `delivery_operation_alert_actions` | admin | 정상·**결함** | 명칭 |
| 23 | 결제 이벤트 | 운영 | `/admin/store-payment-events` | 결제 webhook 수신 로그 (읽기) | `store_payment_events` | `isRouteAdmin` | partial | 설정/기술 영역 이동 |
| 24 | 정산 | 관리 | `/admin/store-settlements` | **수수료·캐시 원장** (지급 아님) + 수수료 조정 결정 | `/api/admin/store-commission-ledger/*` → SQL 함수들 | `business` | partial | 명칭 변경 |
| 25 | 신고 | 관리 | `/admin/store-reports` | 매장 신고 처리 | `store_reports` | `isRouteAdmin` | partial·**결함** | 매장 섹션 |
| 26 | 리뷰 | 관리 | `/admin/store-reviews` | 매장 리뷰 관리 | store reviews | `isRouteAdmin` | partial | 매장 섹션 |
| 27 | 매장 운영 | 배달 | `/admin/business` (+ `[id]` 12탭 허브) | 승인 매장 목록·KPI·매장 360 | `/api/admin/business/ops-list` → `stores`, `store_sales_permissions`, `store_sale_fee_obligations` … | `isRouteAdmin` | 정상·**결함** | 유지 (M1) |
| 28 | 수수료 정책 | 정책 | `/admin/store-fee-policies` | **수수료 권위 테이블** 편집 | `store_fee_policies` 직접 insert/update | `isRouteAdmin` | 정상·**결함** | 유지·보강 |
| 29 | 거리 정책 | 정책 | `/admin/delivery-distance` | 전역 거리 정책 + 매장 반경 | `admin_settings` (감사 O) | `isRouteAdmin` | 정상·**결함** | 유지 |
| 30 | 알림 | 매장설정 | `/admin/stores/application-settings?menu=alerts` | 매장 알림 설정 | `/api/admin/delivery/settings` | admin | 정상 | 명칭 |
| 31 | 하단 메뉴 | 매장설정 | `/admin/stores/bottom-nav` | 배달 하단 내비 | — | admin | 정상 | 화면 구성 섹션 |
| 32 | 커머스 수치 | 매장설정 | `/admin/commerce-settings` | 정산 수수료(죽은 값)·지급일 등 | `admin_settings` | `isRouteAdmin` | partial·**결함** | 정리 |
| 33 | 런타임 상태 | 플랫폼 | `/admin/runtime-health` | pg_cron·자동액션 토글 | `admin_settings` (감사 X) | admin | **결함** | 시스템으로 이동 |
| 34 | 릴리즈 게이트 | 플랫폼 | `/admin/delivery-release-gate` | 출시 수동 점검 | `delivery_release_gate_manual_checks` (감사 X) | admin | **결함** | 시스템으로 이동 |

### A-2. 워크스페이스 밖 배달 관련 메뉴 (25 leaf)

| 워크스페이스 | 메뉴 (URL) | 배달과의 관계 | 비고 |
|---|---|---|---|
| 재무 | 재무 관제 `/admin/finance` · 전체 거래 `/finance/transactions` · 매장별 `/finance/stores` · 주문별 정산 `/finance/orders` · 이전 매장 운영 원장 보관함 `?wallet=COIN` · Cash `?wallet=CASH` · 수수료 / 미납 `/finance/outstanding` · 광고 지출 `/finance/ads` · 출금 `/finance/withdrawals` · 재무 설정 `/finance/settings` | 매장 캐시·코인·미납·출금 | 가드 `business` · 라벨 결함 다수 |
| 광고 / 노출 | 전체 광고 · 상위노출 · 광고 승인 · 노출 관리 · 노출 위치 현황 · 광고 상품/가격 · 광고 이력 (`/admin/advertising/*`) | 배달 매장 광고 포함 | 실제 배달 광고 *쓰기* 는 숨김 `/admin/delivery-ads/[id]` |
| 고객지원 | 고객지원 관제 `/admin/support` · 이전 문의 기록 · 관리자 알림함 `/admin/inbox` | 주문·사장님 문의 | `support_cases` (OWNER/MEMBER, `STORE_ORDER` 참조) |
| 회원 | 회원관리 `/admin/users` · 로그감사 (audit_logs) `/admin/audit-logs` | 사장님 계정·감사 | |
| 대시보드 | `/admin` (Action Center) | 처리 필요 카드 | KPI 는 거래 중심 |
| 메신저 | 주문 채팅 (참조) `/admin/order-chats?from=messenger` | 동일 화면 참조 | |
| 프로모션 | 오너 요청 `/admin/platform-event-owner-requests` | 사장님 이벤트 요청 | |

### A-3. 메뉴 미등재 · 리다이렉트 분류 (PROVEN)

- **리다이렉트 전용:** `/admin/delivery-orders/**` 전부 → `/admin/stores/orders/**` · `/admin/store-point-*`, `/admin/store-points` → `/admin/finance/transactions?wallet=COIN` · `/admin/delivery-ads` → `/admin/advertising` · `/admin/store-banner-ads`, `/admin/store-insertions` → legacy 광고 허브 · `/admin/platform-inquiries` → 지원 아카이브 · `/admin/order-notifications/settings` → `/admin/settings/notifications`.
- **2단 리다이렉트 (DEFECT 경미):** `/admin/delivery-orders/settlements` → `/admin/stores/orders/settlements` → `/admin/store-settlements`; `/admin/delivery-orders/reports` → … → `/admin/store-reports`.
- **미등재 실가동:** `/admin/delivery-ads/cash-charges`(매장 캐시 충전 승인) · `/admin/store-inquiries`(배달 문의, 의도적 숨김) · `/admin/business/[id]` · `/admin/delivery-ads/[campaignId]` · `/admin/delivery-ads/commercial-settings` · `/inventory` · `/partner` · `/first-party/new` · `/admin/ad-applications/[id]`(legacy, 확인 없는 쓰기).
- **`/admin/stores/[id]` 는 없음** — 매장 상세의 정식 경로는 `/admin/business/[id]`.

## 1.2 보고서 C — 배달 운영 전체 흐름도 (실제 연결 · 단절 지점)

```
[사장님 입점 신청]  POST /api/me/stores → stores.approval_status='pending' (계정당 1회, 전화·사업자번호 중복 차단)
      │
      ▼
[입점 심사 /admin/stores]  start_review → under_review
      ├─ request_revision → revision_requested ──✖ 재제출해도 pending 으로 복귀 안 함, 큐에서도 제외 (DEFECT)
      ├─ reject_store → rejected ──✖ 재신청 불가 (계정당 1회 규칙)
      └─ approve_store → approved, is_visible=false
             │   ✖ 사장님 자동 알림 없음 (수동 "오너에게 알림"만)
             ▼
      [판매 승인] store_sales_permissions.approve_sales   ← 별도 수동 단계
             ▼
      [노출 켜기] is_visible=true                          ← 별도 수동 단계  (3단계 안내 UI 없음)
             ▼
[매장 운영 /admin/business/[id]]  12탭 허브: 주문·취소·환불·수수료 원장·재무·상품·리뷰·신고·감사·광고·지원 링크
      │   ✖ 광고 링크 storeId 무시 · 문의 필터 없음 · 「신고」 탭이 심사 패널 렌더 · 영업시간 편집 UI 없음
      ▼
[주문]  구매자 주문 → 매장이 접수/조리/배달/완료 (매장이 결정)
      │   관리자: /admin/stores/orders 상세 → 개입 패널(취소·환불 결정, 강제 취소) — expected_status CAS + 사유 + 재입력 ✔
      │   ✖ 레거시 결정 API 들은 expected_status 선택 (D5)
      ▼
[결제]  고객 → 매장 직접 결제 (PG 환불 없음, payment_status='paid' 기록만)
      ▼
[수수료]  DB 트리거 trg_store_orders_commission_lifecycle — 조리 진입 시 1회 부과
      │   정책: store_fee_policies (매장 → 2차업종 → 1차업종 → 플랫폼 기본) ← /admin/store-fee-policies
      │   매장 캐시에서 min(잔액, 수수료) 차감, 나머지는 미납 store_sale_fee_obligations
      │   취소·환불 후 → review_required → /admin/store-settlements 「수수료 결정」 ✔
      │   ✖ 정책 변경 이력·감사 없음 · 예약 변경 비원자 · 권한 등급 없음
      ▼
[매장 캐시·미납]  캐시 충전 승인(/admin/delivery-ads/cash-charges, 메뉴 없음) 또는 Coin→Cash 전환 시 미납 자동 정리
      │   전역 주문 차단 게이트 store_cash_order_gate (기본 off)
      │   ✖ 매장별 차단/면제·탕감·독촉 없음 · 미납 액션큐 없음
      ▼
[지급]  주문별 지급 없음 (정상, PATCH 410)
      ✖ 레거시 ensureStoreSettlementForCompletedOrder 가 store_settlements 'scheduled' 행 계속 생성 (F13)
      ✖ 플랫폼 지급 대상(platform payable, 플랫폼 쿠폰 등) 처리 CTA 없음
      ✔ 코인 출금: 반려/지급완료 RPC FOR UPDATE + idempotency (✖ audit_logs 없음)

[광고]  사장님 제출 → 매장 캐시 선차감 → /admin/delivery-ads/[id] 승인/반려 RPC (FOR UPDATE + expected_updated_at) → cron 노출 시작/종료
      ✖ 차감·전환 비원자 · 반려 환불이 트랜잭션 밖(실패 은닉) · 워크스페이스 드로어는 CAS 값 서버가 채움(무력화)
      ✖ 중도 종료 환불 규칙 없음 · 고아 차감 환불 UI 없음

[지원·신고]  주문 문의 → support_cases ✔ / 매장 문의 store_inquiries → 사장님만 답변(관리자 조회만)
      ✖ 신고 「조치 완료」가 실제 제재로 이어지지 않음 · 매장 상세 링크 없음
```

### 업무 흐름별 판정

| 흐름 | 판정 | 근거 |
|---|---|---|
| A. 입점 신청·승인 | **결함** | 전이 가드·재심사·자동 알림·확인 팝업 부재 (`app/api/admin/stores/[id]/route.ts:188-236`) |
| B. 매장 운영 | **부분** | 허브 존재·링크 다수 ✔ / 링크 필터·탭·영업시간·300건 상한 결함 |
| C. 주문 | **정상(신규) + 결함(레거시)** | 개입 패널 CAS ✔ / D5 · 운영콘솔 메모 덮어쓰기 |
| D. 수수료 | **결함** | 권한·이력·비원자 예약 변경 |
| E. 결제·정산 | **부분 / 운영 NOT_PROVEN** | 원장·트리거 ✔ / 레거시 writer·payable 미구현; SSOT 마이그레이션 운영 적용 여부 NOT_PROVEN (`store-commission-cash-settlement-ssot.md:4`) |
| F. 광고 | **결함** | 환불 트랜잭션·동시성·이중 쓰기 경로 |
| G. 고객지원·분쟁·알림 | **부분** | support 연동 ✔ / 신고→제재·미납 알림·inbox 이벤트 누락 |

## 1.3 보고서 B — 중복 · 분산 · 연결 · 결함 분석

### ① 완전 중복 (6)

| ID | 현재 위치 | 원인 | 영향 | 개선 | 보존 방법 |
|---|---|---|---|---|---|
| DUP-1 | 심사 패널 `AdminStoreReviewPanel` 이 `/admin/stores`, `/admin/business/[id]` 기본 탭·신고 탭 **3곳** | 컴포넌트 재사용을 탭마다 반복 | 확인 팝업 정책 불일치 (`/admin/stores` 는 없음, 상세는 `dibayConfirm`) | 패널 1개 유지, 확인 정책을 패널 내부로 이동 · 신고 탭은 신고 목록으로 교체 | API·writer 그대로 |
| DUP-2 | 운영 콘솔 ↔ 운영 통계 (동일 RPC `admin_delivery_operations_dashboard` + 동일 recovery API), 콘솔이 자동액션·알림 액션도 재구현 | 단계적 확장 | 같은 조치를 3화면에서 실행 | 콘솔 = 실시간 상황판(조치), 통계 = 읽기 전용; 콘솔의 자동액션/알림 조치는 해당 화면 딥링크로 | 페이지·API 보존 |
| DUP-3 | 배달 광고 쓰기: UI 2 (`/admin/advertising` 드로어, `/admin/delivery-ads/[id]`) + API 2 (`advertising-workspace/action`, `delivery-ads/[id]/actions`) | CUT C 이행 중 | 동시성 보호 차이, 감사 경로 이원화 | 쓰기 권위 = `/admin/delivery-ads/[id]` 1곳, 드로어는 "상세에서 처리" 링크 | 드로어 읽기 유지 |
| DUP-4 | 수수료율: `store_fee_policies`(권위) vs `/admin/commerce-settings` 「정산 수수료(만분율)」 `store_settlement_fee_bp` vs env | 레거시 잔존 | 운영자 오인 (편집해도 효과 없음) | 커머스 수치의 해당 필드 숨김/읽기전용 + "수수료는 수수료 정책에서" 안내 | 값·컬럼 보존 |
| DUP-5 | 미납 조회: `/admin/finance/outstanding`(원시 조회, 100건) vs 정산 캐시 탭 (SQL 함수) | 화면 이원화 | 수치 불일치 위험 | 재무 미납 화면을 SQL 함수 기반으로 통일 또는 캐시 탭 딥링크 | 둘 다 보존 |
| DUP-6 | 액션큐 카운트가 `/admin`, `/admin/delivery`, `/admin/customer-platform`, `/admin/order-notifications` 4곳 | 대시보드 증식 | 같은 숫자 4번 | registry 1개 유지(이미 SSOT), 화면은 역할 구분 명시 | 그대로 |

### ② 역할상 필요한 분리 — 유지 (6)

| ID | 대상 | 유지 근거 |
|---|---|---|
| SEP-1 | 입점 심사 `/admin/stores` ↔ 매장 운영 `/admin/business` | Owner M1 승인 (병합 금지). 단, 쓰기 패널 정책은 통일 |
| SEP-2 | 주문 목록 ↔ 처리 필요 주문 ↔ 취소/환불 | 동일 `AdminOrderOpsScreen` 의 필터 뷰 (#65) |
| SEP-3 | 신고 표시 큐(관찰) `/admin/reports` ↔ 매장 신고 `/admin/store-reports` | 테이블 분리, 전자는 읽기 전용 개요 |
| SEP-4 | 배달 › 수수료 원장 ↔ 재무 워크스페이스 | CUT J: 재무는 공통 운영 영역 |
| SEP-5 | 기획 프로모션 ↔ 유료 광고 | 데이터 분리, 화면에 명시돼 있음 |
| SEP-6 | 쿠폰·상품권 ↔ 광고 | 다른 writer·감사 테이블 |

### ③ 기능 분산 (6)

| ID | 업무 | 현재 이동 경로 | 영향 | 개선 |
|---|---|---|---|---|
| SPR-1 | 신규 매장 영업 개시 | 승인 → 판매 승인 → 노출 켜기 (3개 버튼, 안내 없음) | 승인했는데 매장이 안 보임 | 심사 패널에 "영업 개시 체크리스트" (O7) |
| SPR-2 | 매장 캐시 충전 승인 | 메뉴 없음 → 재무/대시보드 카드 링크로만 | 업무 발견 불가 | 재무 › 매장 재화에 leaf 편입 |
| SPR-3 | 매장 정산 확인 | 배달›정산 / 재무›주문별 정산 / 재무›수수료·미납 / 재무›매장별 | 4메뉴 왕복 | 배달 «수수료·정산» 섹션 + 재무 딥링크 카드 |
| SPR-4 | 광고 상품 가격 수정 | `/admin/advertising/products`(읽기) → 숨김 commercial-settings | 숨김 화면 의존 | 상품/가격 화면에 "가격 수정" CTA 명시 (경로 보존) |
| SPR-5 | 개발자 도구 | 배달 › 플랫폼 (런타임 상태·릴리즈 게이트) | 운영자에게 위험 토글 노출 | 시스템 › 플랫폼 시스템 (master) 으로 이동 |
| SPR-6 | 배달 메뉴 탐색 | «운영» 섹션에 22 leaf 평면 나열 (주문·콘텐츠·혜택·모니터링 혼재) | 인지 부하 | 업무별 6섹션 재편 (§2.1) |

### ④ 연결 누락 (10)

| ID | 출발 → 도착 | 현재 | 개선 |
|---|---|---|---|
| LNK-1 | 매장 허브 → 광고 | `?storeId` 전달하지만 대상 화면이 읽지 않음 (`AdminAdvertisingWorkspace.tsx:190` `storeId:null`) | 광고 목록이 `storeId` 필터 수용 |
| LNK-2 | 매장 허브 → 매장 문의 | 링크 없음, `/admin/store-inquiries` store 필터 없음 | 필터 + 링크 |
| LNK-3 | 매장 허브 → 코인/포인트 | query 무시 (`business-control-center-links.ts:57`) | 재무 거래 `storeId` 필터 |
| LNK-4 | 매장 신고 → 매장 상세/운영 중지 | 없음 | 신고 카드에 "매장 상세" · "운영 중지 검토" |
| LNK-5 | 주문 상세 → 결제 이벤트 / 라이더 / 회원 프로필 / 매장 주문목록 | 없음 | 딥링크 4종 |
| LNK-6 | 광고 상세 → 매장 상세·주문 | 없음 (재무·지원만) | 매장 상세 링크 |
| LNK-7 | 재무 광고 지출 → 환불 원장 | `refundTransactionId` 로드하지만 미표시 | 컬럼·링크 |
| LNK-8 | 홈 선반 / 광고 상세 뒤로가기 | 숨김 legacy 허브 `/admin/delivery-ads/manage` 로 이동 | `/admin/advertising` 으로 |
| LNK-9 | 정산·신고 레거시 URL | 2단 리다이렉트 | 1단으로 단축 (URL 보존) |
| LNK-10 | 배달 문의 | 메뉴 미등재 (액션큐 카드로만) | 매장 섹션에 편입 |

### ⑤ 결함 · 누락 (34)

**금전·권한·무결성 (10)**

| ID | 내용 | 증거 |
|---|---|---|
| DEF-1 | 금전·제재 API 서버 권한 등급 없음 (수수료 변경, 운영 중지, 캐시 충전 승인, 환불 승인, 유료 연장, 런타임 토글, 대량 푸시). `business` 키는 operator 기본 보유. `viewer` 미생성, 메뉴 필터 클라 전용 | `store-fee-policies/[id]/route.ts:150`, `stores/[id]/route.ts:118`, `delivery-ads/business-cash/charge-requests/[id]:12`, `approve-refund:18`, `AdminSidebar.tsx:20` |
| DEF-2 | 수수료 정책: 감사 로그 0, `updated_by` 없음, 즉시 변경이 덮어쓰기, 「이력」 탭은 현재 행 정렬일 뿐 | `app/api/admin/store-fee-policies/**` (appendAuditLog 0건), `AdminStoreFeePoliciesPage.tsx:301-312` |
| DEF-3 | 예약 수수료 변경 = 클라이언트 2회 호출 (구 정책 `ends_at` PATCH → 신규 POST). 실패 시 정책 공백 → 트리거 `store_commission_policy_missing` → **주문 조리 진입 차단** | `AdminStoreFeePoliciesPage.tsx:259-295` |
| DEF-4 | 레거시 `store_settlements` 'scheduled' writer 동작 중 + 「정산 지급 예정(결제일+N일)」 설정 + `auto_hold_settlement` (F13) | `lib/stores/ensure-store-settlement.ts:107-131`, `apply-store-order-status-transition.ts:477`, migration `20260513153000…:280-288` |
| DEF-5 | 광고 반려 환불이 RPC 커밋 후 별도 호출, 실패 시 `console.error` 만 · 응답 ok | `admin-delivery-ad-writer.ts:266-283` |
| DEF-6 | 광고 워크스페이스 액션의 `expectedUpdatedAt` 을 서버가 현재값으로 채움 → 동시 처리 보호 무력화 | `advertising-workspace/action/route.ts:333-338` |
| DEF-7 | 사장님 광고 제출: 캐시 차감과 상태 전환 비원자 (고아 차감) | `me/stores/[storeId]/delivery-ads/.../actions/route.ts:190-200` |
| DEF-8 | 레거시 주문 결정 API (`PATCH store-orders/[id]`, `/approve-refund`, `/cancel-request`) `expected_status` 선택 → CAS 생략 (D5) | `admin-store-order-intervention.ts:102` |
| DEF-9 | 쿠폰 승인이 현재 상태 무관 업데이트, DB 오류 미확인 후 감사 기록 · 회수된 쿠폰 재활성 가능 | `api/admin/store-coupons/route.ts:107-121` |
| DEF-10 | 감사 로그 없음: 코인 출금, 캐시 충전 승인(라우트), 서비스 지역, 런타임 상태, 릴리즈 게이트, 복구 실행 | 각 route (appendAuditLog 0건) |

**입점·매장 (10)**

| ID | 내용 | 증거 |
|---|---|---|
| DEF-11 | 승인 상태 전이 가드 없음 (거절→승인, `resume_store` 로 거절 매장 승인 가능). 상태값이 DB enum/CHECK 아님 (NOT_PROVEN: CHECK 존재) | `stores/[id]/route.ts:188-236` |
| DEF-12 | 「재개(노출 복구)」 라벨과 달리 `is_visible` 미복구 | `stores/[id]/route.ts:231-235`, `admin.ts:2367` |
| DEF-13 | 매장 상세 「신고」 탭이 심사 패널을 렌더 | `AdminBusinessDetailPage.tsx:633-647` |
| DEF-14 | `/admin/business` 승인 필터 "처리 필요(actionable)" 가 문자 그대로 비교 → 항상 0건 | `load-admin-business-list.ts:290`, `admin-store-review-model.ts:67` |
| DEF-15 | `/admin/stores` 최신 300건 상한 후 집계 → 카운트 오류, 거리 정책 화면에서 매장 누락 | `api/admin/stores/route.ts:74` |
| DEF-16 | 보완 요청 후 재제출 → pending 복귀 없음·큐 제외 / 거절 후 재신청 불가 | `me/stores/[storeId]/route.ts:24`, `admin-ops-actionable-status.ts:9`, `me/stores/route.ts:128-145` |
| DEF-17 | 심사 결정 시 사장님 자동 알림 없음 | notify route 수동 전용 |
| DEF-18 | 영업시간 편집 UI 없음 (`set_business_hours` API 만 존재) | `AdminBusinessDetailPage.tsx:592-602` |
| DEF-19 | 이력 라벨 오매핑 (보완 요청·심사 시작 → "프로필 수정") · 판매 승인 감사 before 값 placeholder | `AdminBusinessDetailPage.tsx:95-103`, `stores/[id]/route.ts:608` |
| DEF-20 | `/admin/stores` 승인·거절·운영 중지 확인 팝업 없음, 거절·보완·중지 사유 선택사항 | `AdminStoreReviewPanel.tsx:136-138,244-275` |

**주문 (4)**

| ID | 내용 | 증거 |
|---|---|---|
| DEF-21 | 운영 콘솔 주의/재배정 모달이 빈 메모로 시작 → 저장 시 `admin_note` 덮어쓰기 (`prev_rider:<uuid>`) | `AdminOpsConsolePage.tsx:463-466,1027,1056` |
| DEF-22 | 확인 없는 상태 변경: 복구 일괄 실행, 자동액션 on/off(오류 미처리), 라이더 재배정, 런타임 토글 | `DeliveryOperationsDashboardPage.tsx:269-294`, `AdminDeliveryAutoActionsPage.tsx:157-175` |
| DEF-23 | 「환불 승인」은 상태 기록일 뿐 돈 이동 없음 — 확인 문구는 *반려* 에만 "돈의 이동은 없습니다" | `admin-store-order-intervention-contract.ts:89` |
| DEF-24 | 미사용 레거시 주문 UI ~30개 (`components/admin/delivery-orders/*`, `AdminStoreOrdersPage.tsx`), 410 API 호출 잔존 | import 0건 |

**지원·알림 (2)**

| ID | 내용 |
|---|---|
| DEF-25 | 매장 신고 「조치 완료」가 매장·상품 상태에 아무 영향 없음, 매장 링크 없음, 원시 status/ID 표시 (`store-reports/[reportId]/route.ts:64-75`) |
| DEF-26 | 미납 수수료·주문 차단 게이트 액션큐 항목 없음 · 관리자 알림함에 입점 신청·매장 신고·취소 이벤트 없음 (`admin-notification-kinds.ts:12-15`) |

**재무 (4)**

| ID | 내용 |
|---|---|
| DEF-27 | 실가동 Coin 원장 메뉴명이 「이전 매장 운영 원장 보관함」 (`admin.ts:1102`), 화면 내 탭명은 "Coin" |
| DEF-28 | 「주문별 정산」 = UUID 입력 폼, "정산 지급 목록 열기" 문구가 SSOT(지급 없음)와 모순 (`AdminFinanceOrdersIndexView.tsx:31-51`) |
| DEF-29 | 플랫폼 지급 대상(payable) 처리 CTA 없음 · 미납 매장별 차단/면제/탕감 없음 · 미납 화면 액션 0 |
| DEF-30 | 캐시 충전 반려 사유 하드코딩 `"admin_rejected"` (`AdminDeliveryAdCashChargeQueuePage.tsx:110`) |

**광고 (3)**

| ID | 내용 |
|---|---|
| DEF-31 | 중도 강제 종료 환불 규칙 없음 · 고아 차감 환불(`refund_orphan_funding`) UI 없음 |
| DEF-32 | legacy `/admin/ad-applications/[id]` 입금확인·승인·반려·종료 버튼 확인 없이 실행 (`AdminAdActionPanel.tsx:55-86`) |
| DEF-33 | 유료 연장(캐시 차감)이 `business` 권한 미요구 (`delivery-ads/[id]/extend/route.ts:35,90`) |

**UI (1)**

| ID | 내용 |
|---|---|
| DEF-34 | 플랫폼 Admin UI/CTA 표준 문서 없음 · 배달 9개 화면 중 `AdminTable` 0, `AdminActionConfirmDialog` 0 · Admin 토스트/빈 상태/오류 상태 공통 컴포넌트 없음 · 필터 URL 유지 방식 화면별 상이 |

## 1.4 보고서 F — 운영 관리자 업무 시나리오

| # | 시나리오 | 경로 | 관리자 화면만으로 완료? | 장애 요소 |
|---|---|---|---|---|
| 1 | 신규 매장 입점 | `/admin/stores` 심사 → 승인 → (판매 승인) → (노출) → `/admin/business/[id]` | **부분** | 서류는 패널 필드로만 확인(별도 첨부 검증 NOT_PROVEN) · 확인 팝업 없음 · 3단계 안내 없음 · 사장님 알림 수동 · 보완 후 재심사 불가 |
| 2 | 매장 운영 | `/admin/business` 검색 → 상세 → 운영 중지/재개 → 이력 탭 | **부분** | 「처리 필요」 필터 0건 · 재개해도 노출 안 됨 · 이력 라벨 오류·UUID·원시 JSON · 영업시간 편집 불가 |
| 3 | 주문 문제 | `/admin/stores/orders` → 상세 → 개입 패널(취소/환불 결정) → 수수료 원장 링크 | **가능** | 결제 이벤트 링크 없음 · "환불 승인"이 실제 환불처럼 읽힘 · 레거시 API 우회 경로 존재 |
| 4 | 수수료 관리 | 매장 상세 수수료 탭 / `/admin/store-fee-policies` → 변경 | **가능하나 위험** | 권한 등급·승인 절차 없음 · 변경 이력 없음 · 예약 변경 비원자 · 운영 DB 트리거 적용 NOT_PROVEN |
| 5 | 매장 정산 | 매장 상세 → `/admin/store-settlements?store_id` (원장·검토·캐시·예외·payable 탭) → 재무 매장별 | **부분** | "지급 처리" 단계는 모델상 없음(정상) · payable 지급 CTA 없음 · 레거시 지급예정 행 혼재 · 4메뉴 분산 |
| 6 | 광고 운영 | `/admin/advertising/applications` → 「검토하기」 → `/admin/delivery-ads/[id]` 승인 → cron 노출 → 성과(상세) → 종료 | **부분** | 반려 환불 실패 은닉 · 중도 종료 환불 규칙 없음 · 매장→광고 필터 미작동 · 운영 E2E NOT_PROVEN |

실제 운영 데이터를 변경하는 실행은 하지 않았다. 런타임 동작(알림 발송, cron, 트리거 실행)은 전부 **NOT_PROVEN** 이며 코드 경로로만 판정했다.

## 1.5 공통 Admin UI/UX/CTA 현황

| 영역 | 존재하는 공통 자산 | 배달 화면 사용률 (샘플 9) |
|---|---|---|
| 페이지 헤더 | `AdminPageHeader` (~175 파일) | 8/9 (`AdminOrderOpsScreen` 제외) |
| 표 | `AdminTable` (~33 파일) | **0/9** |
| 상태 배지 | `AdminStatusBadge`(상품 전용), `AdminToneBadge`, `AdminModerationStatusBadge` | 상태 라벨 맵 도메인별 산재 (`admin-store-order-status-labels.ts`, `useDoAdminStatusLabels.ts`, `support-status-label.ts`) — 매장·신고·리뷰용 없음 |
| 확인 팝업 | `components/admin/ui/AdminActionConfirmDialog.tsx` (사유 입력 옵션) · `dibayConfirm` | **0/9** (수수료 원장·수수료 정책은 자체 모달) |
| 토스트 / 빈 상태 / 오류 상태 | 없음 | — |
| 필터 URL 유지 | 없음 (화면별 `useSearchParams`) | — |
| 역할별 노출 | `filterMenuByRole` (2개 그룹만 역할 지정) | 서버 강제 없음 |

## 1.6 개발자 용어 노출 (대표 45+ 곳, 범주별)

| 범주 | 예시 (file:line) |
|---|---|
| 메뉴명 | "로그감사 (audit_logs)" `admin.ts:960` · "Cash" `admin.ts:1106` · "HOME 구성" · "BROWSE 노출 정책" · "런타임 상태" · "릴리즈 게이트" · "신고 표시 큐 (관찰)" · "이전 매장 운영 원장 보관함" · 「재무 관제」 그룹·leaf 동명 |
| DB 컬럼·테이블명 | 라이더 `delivery_status`, `rider_id`, `assigned_at`… `AdminDeliveryRidersPage.tsx:500-520` · "(stores.approval_status)", "business_hours_json" `admin-business.ts:174-191` · "(store_discovery_campaigns)", "prior_weight (m)" `admin-store-discovery.ts:7-17` · 재무 제표 hint "store_sale_fee_obligations" |
| 함수·마이그레이션·PR | "RPC 미배포" `admin-delivery-operations.ts:6-7` · `scan_store_order_sla_warnings` · 마이그레이션 파일명 `AdminDeliveryAutoActionsPage.tsx:264` · "(#58)" `AdminOrderDetailView.tsx:492` |
| 영문 헤더·필드 | "Fee Due / Cash Paid / Remaining" `AdminFinanceOutstandingView.tsx:98-102` · "enabled / rate / interval (h)" `AdminFinanceSettingsView.tsx:108-141` · "Funding Rail / Finance TX" `AdminFinanceAdsView.tsx:91-95` · "source / event / provider" 결제 이벤트 · "inherit / enabled / disabled" 거리 override |
| 원시 코드·ID·JSON | 매장 `sales_status`, 주문 `orderStatus` 원시값 · 신고/리뷰 `{r.status}` · `adminId.slice(0,8)` · `JSON.stringify(after_json)` · `JSON.stringify(payload)` · "UUID" placeholder · `action_failed_500`, `HTTP 409`, `json.error` 노출 · `READY / PARTIAL` 배지 |
| 개념어 | Ledger/원장 · lifecycle · inventory · webhook · projection · "Admin SSOT" · "writer" · "canonical request columns" |

---

# ② 개선안 (설계)

> 원칙: **CUT J 워크스페이스 순서·형제 관계 불변**, 기존 URL·딥링크 **전부 보존**, API·writer **병합 금지**, 신규 DB 는 Owner 승인 항목에 한정.
> 운영자에게는 하나의 배달 관리 체계로 보이되, 재무·광고·고객지원은 **공통 워크스페이스 소유를 유지하고 딥링크 카드로 연결**한다 (CUT J "CROSS-DOMAIN = deep-links only").

## 2.1 보고서 D — 통합 메뉴 IA 설계안

### 비교한 방식

| 방식 | 내용 | 판단 |
|---|---|---|
| (a) 전면 통합 | 재무·광고·지원 기능을 배달 아래로 이동 | **불가** — CUT J inv.4·6·9, B-X1 거부 |
| (b) 배달 내부 섹션 재편 + 공통 영역 딥링크 | 배달 34 leaf 를 업무별 섹션으로 재배치, 재무/광고/지원은 카드·링크 | **권장** |
| (c) 라벨만 수정 | 구조 유지, 용어만 교체 | 분산(SPR-6) 미해결 |

### 제안 최종 메뉴 트리 (배달 워크스페이스)

```
배달
├─ 배달 운영 현황                 /admin/delivery                     (대시보드 확장 §2.4)
├─ 매장
│   ├─ 입점 심사                  /admin/stores                       (M1 유지)
│   ├─ 매장 운영                  /admin/business                     (M1 유지, 매장 360 허브 = /admin/business/[id])
│   ├─ 메뉴·상품 검수             /admin/store-products
│   ├─ 매장 문의                  /admin/store-inquiries              ★ 편입 (LNK-10)
│   ├─ 매장 신고                  /admin/store-reports
│   └─ 매장 리뷰                  /admin/store-reviews
├─ 주문
│   ├─ 전체 주문                  /admin/stores/orders
│   ├─ 처리 필요 주문             /admin/store-orders                 (구 「주문 액션」)
│   ├─ 취소 요청                  /admin/stores/orders/cancellations
│   ├─ 환불 요청                  /admin/stores/orders/refunds
│   ├─ 주문 처리 기록             /admin/stores/orders/logs           (구 「감사 로그」)
│   └─ 주문 채팅                  /admin/order-chats
├─ 배달 현장
│   ├─ 실시간 상황판              /admin/ops-console                  (구 「운영 콘솔」)
│   ├─ 배달 통계                  /admin/delivery-operations          (구 「운영 통계」)
│   ├─ 라이더                     /admin/delivery-riders
│   ├─ 배달 경고                  /admin/delivery-alerts              (구 「운영 알림」)
│   └─ 자동 조치 승인             /admin/delivery-auto-actions        (구 「자동 액션」)
├─ 수수료·정산
│   ├─ 수수료 정책                /admin/store-fee-policies
│   ├─ 수수료 내역·검토           /admin/store-settlements            (구 「정산」)
│   └─ [카드] 재무 바로가기 → 매장 캐시 충전 승인 · 매장별 재무 · 미납 현황   (leaf 아님, 재무 소유)
├─ 혜택·프로모션
│   ├─ 쿠폰 운영                  /admin/store-coupon-control
│   ├─ 상품권                     /admin/gift-certificates
│   ├─ 기획 프로모션              /admin/store-discovery
│   └─ [카드] 배달 광고 → /admin/advertising (광고 워크스페이스 소유)
├─ 매장 홈 화면 구성
│   ├─ 홈 화면 구성               /admin/stores-home-shelves          (구 「HOME 구성」)
│   ├─ 1차 업종 / 2차 업종        /admin/stores/application-settings?…focus=category|topic
│   ├─ 매장 목록 노출 정책        /admin/stores-category-policy       (구 「BROWSE 노출 정책」)
│   └─ 하단 메뉴                  /admin/stores/bottom-nav
└─ 배달 설정
    ├─ 배달 거리 정책             /admin/delivery-distance
    ├─ 매장 알림 설정             /admin/stores/application-settings?menu=alerts
    ├─ 커머스 기본값              /admin/commerce-settings            (죽은 수수료 필드 숨김)
    └─ 결제 수신 기록             /admin/store-payment-events         (구 「결제 이벤트」)
```

**배달 밖으로 이동 (경로 보존)**

| 메뉴 | 현재 | 제안 | 근거 |
|---|---|---|---|
| 런타임 상태 · 릴리즈 게이트 | 배달 › 플랫폼 | 시스템 › 플랫폼 시스템 (master 전용) | SPR-5, 위험 토글 |
| 액션 큐 `/admin/order-notifications` | 배달 › 운영 | **선택 (O3)**: A) 배달 유지 + 「전체 처리 대기함」 개명 / B) 고객지원 워크스페이스(관리자 알림함 옆) | 전 도메인 큐이며 주문 전용 아님 |

**다른 워크스페이스 라벨·편입 (경로 보존)**

| 워크스페이스 | 현재 | 제안 |
|---|---|---|
| 재무 | 이전 매장 운영 원장 보관함 | **매장 코인 내역** |
| 재무 | Cash | **매장 캐시 내역** |
| 재무 | 주문별 정산 | **주문별 금액 추적** (+ "지급 목록" 문구 제거) |
| 재무 | 수수료 / 미납 | **수수료 미납 현황** |
| 재무 | 그룹명 「재무 관제」(leaf 와 동명) | 그룹명 **매장 재화** |
| 재무 | (없음) | ★ **매장 캐시 충전 승인** `/admin/delivery-ads/cash-charges` 편입 (SPR-2) |
| 회원 | 로그감사 (audit_logs) | **관리자 작업 기록** |
| 회원 | 신고 표시 큐 (관찰) | **전체 신고 현황 (조회 전용)** |

### 현재 → 개선 1:1 매핑 (배달 34 leaf)

| 현재 (섹션 › 메뉴) | 개선 (섹션 › 메뉴) | 조치 |
|---|---|---|
| 배달 대시보드 | 배달 운영 현황 | 유지·개명 |
| 운영›주문 운영›주문 목록 | 주문›전체 주문 | 위치 변경·개명 |
| 〃 주문 액션 | 주문›처리 필요 주문 | 위치 변경·개명 |
| 〃 취소 요청 / 환불 요청 | 주문›동일 | 위치 변경 |
| 〃 감사 로그 | 주문›주문 처리 기록 | 개명 |
| 〃 주문 채팅 | 주문›주문 채팅 | 위치 변경 |
| 운영›입점 심사 | 매장›입점 심사 | 위치 변경 |
| 운영›메뉴·상품 검수 | 매장›메뉴·상품 검수 | 위치 변경 |
| 운영›HOME 구성 | 매장 홈 화면 구성›홈 화면 구성 | 위치·개명 |
| 운영›업종 관리›1차/2차 | 매장 홈 화면 구성›1차/2차 업종 | 위치 변경 |
| 운영›BROWSE 노출 정책 | 매장 홈 화면 구성›매장 목록 노출 정책 | 위치·개명 |
| 운영›쿠폰 운영 센터 | 혜택·프로모션›쿠폰 운영 | 위치·개명 |
| 운영›상품권 관리 | 혜택·프로모션›상품권 | 위치 변경 |
| 운영›기획 프로모션 | 혜택·프로모션›기획 프로모션 | 위치 변경 |
| 운영›운영 콘솔 | 배달 현장›실시간 상황판 | 위치·개명·중복 정리 (DUP-2) |
| 운영›운영 통계 | 배달 현장›배달 통계 | 위치·개명 |
| 운영›라이더 | 배달 현장›라이더 | 위치 변경 |
| 운영›운영 알림 | 배달 현장›배달 경고 | 위치·개명 |
| 운영›액션 큐 | (O3) | 위치·개명 |
| 운영›자동 액션 | 배달 현장›자동 조치 승인 | 위치·개명 |
| 운영›결제 이벤트 | 배달 설정›결제 수신 기록 | 위치·개명 |
| 관리›정산 | 수수료·정산›수수료 내역·검토 | 위치·개명 |
| 관리›신고 / 리뷰 | 매장›매장 신고 / 매장 리뷰 | 위치·개명 |
| 매장 운영 | 매장›매장 운영 | 위치 변경 |
| 정책›수수료 정책 | 수수료·정산›수수료 정책 | 위치 변경 |
| 정책›거리 정책 | 배달 설정›배달 거리 정책 | 위치·개명 |
| 매장설정›알림 | 배달 설정›매장 알림 설정 | 위치·개명 |
| 매장설정›하단 메뉴 | 매장 홈 화면 구성›하단 메뉴 | 위치 변경 |
| 매장설정›커머스 수치 | 배달 설정›커머스 기본값 | 위치·개명 |
| 플랫폼›런타임 상태 / 릴리즈 게이트 | 시스템›플랫폼 시스템 | 워크스페이스 이동 |
| (미등재) 배달 문의 | 매장›매장 문의 | 편입 |

**결과:** 배달 leaf 34 → 33 (런타임·릴리즈 2 이동, 매장 문의 1 편입; 액션 큐는 O3 결과에 따라 ±1), 섹션 5 → 8 (업무 단위), 신규 URL 0, 삭제 0.

### 유지 / 통합 후보 / 위치 변경 / 공통 연결

- **유지 (구조·기능 그대로):** 입점 심사·매장 운영(M1), 주문 화면 6종(`AdminOrderOpsScreen` 뷰), 수수료 정책, 수수료 내역·검토, 쿠폰·상품권·기획 프로모션, 거리 정책.
- **통합 후보 (기능 축소 없이 쓰기 경로 단일화):** DUP-1 심사 패널 정책, DUP-2 콘솔↔통계 역할 분리, DUP-3 광고 쓰기 권위 1곳, DUP-4 죽은 수수료 필드, DUP-5 미납 조회.
- **위치 변경 후보:** §1:1 매핑의 "위치 변경" 전부 + 런타임·릴리즈 → 시스템.
- **공통 시스템으로 연결 (복제 금지):** 재무(캐시·코인·미납·출금), 광고(신청·노출·상품), 고객지원(주문 문의·사장님 문의), 알림(관리자 알림함·푸시), 회원(사장님 계정), 감사(작업 기록).
- **메뉴를 늘리지 않고 해결:** LNK-1~9 (딥링크·필터), 영업 개시 체크리스트, 매장 허브 탭 보강, 재무/광고 카드.

### URL · 딥링크 보존

1. 모든 `path` 문자열 불변 — `admin-menu.ts` 에서 노드 **위치·섹션 key·라벨 key** 만 변경.
2. 메뉴 `key` 유지 (즐겨찾기·`findAdminMenuByKey`·테스트 계약 보존). 새 섹션 key 만 추가.
3. 기존 redirect 체인 유지, 2단 리다이렉트만 최종 목적지로 단축 (같은 최종 URL).
4. `matchPaths` 로 이동 전 경로 활성 판정 유지. Action Center·카드의 `withAdminReturnTo` 링크 불변.
5. 게이트 갱신: `verify:admin-real-operation-cut-j-ia-separation-hard-lock`, `lib/admin/__tests__/*menu*contract*` 를 같은 PR 에서 함께 수정 (CUT J 문서 "separate authorization updates both together").

### 권한별 메뉴 표시 정책 (제안)

| 메뉴 영역 | master (super_admin) | admin (manager) | operator | viewer* |
|---|---|---|---|---|
| 조회 화면 전체 | ✔ | ✔ | ✔ | ✔ (읽기) |
| 입점 승인·거절·보완 / 상품 검수 | ✔ | ✔ | ✔ | — |
| 매장 운영 중지·재개 / 판매 권한 | ✔ | ✔ | — (요청만) | — |
| 주문 개입 (취소·환불 결정) | ✔ | ✔ | ✔ | — |
| 강제 취소 · 환불 처리 완료 기록 | ✔ | ✔ | — | — |
| 수수료 정책 변경 · 수수료 조정 결정 | ✔ | — (O1) | — | — |
| 캐시 충전 승인 · 코인 출금 지급 · 유료 광고 연장 | ✔ | ✔ (O1) | — | — |
| 런타임 상태 · 릴리즈 게이트 · 데이터 초기화 | ✔ | — | — | — |

\* viewer 는 현재 생성되지 않음 → 도입 여부 O1. **메뉴 숨김은 보조이며, 강제는 서버 `requireAdminPermission` / `requireSuperAdmin` 로 한다.**

## 2.2 보고서 E — Admin UI/UX/CTA SSOT (기존 자산 기준)

신규 디자인 체계를 만들지 않고 **기존 컴포넌트를 표준으로 지정**하는 문서 `docs/admin/admin-ui-cta-ssot.md` (승인 후 작성)를 제안한다.

### 화면 구성 표준

| 요소 | 표준 | 비고 |
|---|---|---|
| 헤더 | `AdminPageHeader` (제목 = 메뉴명과 동일) | "입점 심사" 메뉴 ↔ "매장 심사 (커머스)" 제목 불일치 해소 |
| 목록 | `AdminTable` + 모바일 카드 폴백 (CUT G 태블릿 가로 준수) | |
| 상태 | **상태 라벨 레지스트리** `lib/admin/status-labels/*` (도메인별 맵 통합 export: 매장 승인·판매·주문·신고·리뷰·광고·출금·충전) → `AdminToneBadge` | 미등록 코드는 "알 수 없는 상태" + 기술 정보 |
| 확인 | `AdminActionConfirmDialog` (`window.confirm` 금지) | |
| 결과 피드백 | 공통 결과 배너 (성공/실패) — 신규 경량 컴포넌트 1개 | 토스트 부재 보완 |
| 빈/오류/권한 | `AdminEmptyState` · `AdminErrorState` · 기존 `AdminAccessDeniedPanel` | "데이터 없음" ≠ "불러오기 실패" |
| 필터 | URL 쿼리 유지 훅 1개 (`useAdminListQuery`) | 뒤로가기 시 필터 유지 |
| 기술 정보 | 접이식 「기술 정보」 영역 (UUID·원시 JSON·오류 코드·감사 ID) — master 기본 펼침 가능 | 삭제가 아닌 노출 수준 분리 |

### CTA 사전 (명칭 · 확인 등급)

| 등급 | 조건 | CTA (표준 명칭) |
|---|---|---|
| L0 | 이동·조회 | 상세 보기 · 주문 상세 · 매장 상세 · 수수료 내역 · 닫기 · 목록으로 |
| L1 | 되돌릴 수 있는 변경 | 저장 · 변경 · 운영 재개 · 노출 켜기 · 확인 처리 |
| L2 | 상대방에게 영향·되돌리기 어려움 → **확인 + 사유 필수(2자+)** | 거절 · 보완 요청 · 운영 중지 · 판매 중지 · 승인 취소 · 신고 조치 · 광고 중지 |
| L3 | 금전·대량·파괴적 → **확인 + 사유 + 대상 재입력 + 멱등키 + 처리 중 잠금** | 수수료 정책 변경 · 수수료 조정 결정 · 캐시 충전 승인 · 지급 완료 처리 · 강제 취소 · 환불 처리 완료 기록 · 일괄 복구 실행 · 시스템 토글 |

모든 L1+ CTA 공통 계약: ① 서버 권한 검사 ② 상태 조건(expected_status / expected_updated_at, 서버가 채우지 않음) ③ 성공 시 재조회 + 액션큐 갱신 이벤트 ④ 실패 시 한국어 사유 (오류 코드 → 문구 맵, 원문은 기술 정보) ⑤ `audit_logs` 기록 (actor·before·after·reason).

### 운영자 용어 사전 (발췌)

| 기술 표현 | 운영자 표현 |
|---|---|
| Ledger / 원장 | 거래 내역 · 수수료 내역 |
| Cash / Coin / Point | 매장 캐시 / 매장 코인 / 회원 포인트 |
| Settlement (현 모델) | 수수료 정산 (지급 아님) |
| obligation / outstanding | 미납 수수료 |
| payable | 플랫폼 지급 대상 |
| lifecycle / inventory | 진행 상태 / 노출 자리 |
| webhook / payment event | 결제 수신 기록 |
| rule_key / auto action | 규칙 이름 / 자동 조치 |
| RPC 미배포 · migration needed | 기능 준비 중 (시스템 관리자 문의) |
| UUID | 주문번호 · 매장명 (+ 복사 버튼, ID 는 기술 정보) |
| approved / suspended … | 승인됨 / 운영 중지 … (레지스트리) |
| HOME / BROWSE | 홈 화면 / 매장 목록 |

## 2.3 금전 무결성 보강 설계 (DB 변경 최소)

| 대상 | 설계 | DB 영향 |
|---|---|---|
| 수수료 예약 변경 (DEF-3) | 서버 RPC 1개로 "구 정책 종료 + 신규 생성" 원자 처리 | 함수 추가 (Owner 승인) |
| 수수료 이력 (DEF-2) | 최소안: API 에 `appendAuditLog`(before/after) + `updated_by`. 확장안: `store_fee_policy_versions` 테이블 | 최소안 DB 무변경 · 확장안 O5 |
| 레거시 지급예정 writer (DEF-4) | `ensureStoreSettlementForCompletedOrder` 호출 중단, 지급일 설정 숨김, `auto_hold_settlement` 비활성 | 코드만 (데이터 보존) — O4 |
| 광고 반려 환불 (DEF-5) | 환불 실패 시 응답에 경고 + 액션큐 "환불 실패" 항목 / 장기: RPC 내부 원자화 | 장기안 DB |
| 광고 동시성 (DEF-6) | 드로어가 화면 로드 시점 `expectedUpdatedAt` 전송 | 없음 |
| 레거시 주문 결정 API (DEF-8) | `expected_status` 필수화 (UI 미사용 확인됨) | 없음 |
| 쿠폰 승인 (DEF-9) | 현재 상태 조건 업데이트 + 오류 확인 후 감사 | 없음 |
| 매장 상태 전이 (DEF-11) | 서버 전이표 (`pending→under_review→approved/rejected/revision_requested`, `approved↔suspended`) | 없음 (CHECK 제약은 별도 승인) |

## 2.4 배달 운영 통합 대시보드 설계 (`/admin/delivery` 확장, 신규 화면 없음)

| 지표 | 데이터 출처 | 집계 기준 | 실시간성 | 권한 | 이동 CTA | 구현 가능 |
|---|---|---|---|---|---|---|
| 입점 심사 대기 | `stores.approval_status in (pending, under_review)` | 현재 | 실시간 (Realtime 존재) | 전체 | 입점 심사 | ✔ |
| 보완 재제출 대기 | `revision_requested` + 수정일 | 현재 | 조회 시 | 전체 | 입점 심사 | DEF-16 수정 후 |
| 운영 중 / 영업 중지 / 제재 매장 | `stores` + `store_sales_permissions` | 현재 | 조회 시 | 전체 | 매장 운영 (필터) | ✔ (현 대시보드 일부 존재) |
| 신규 주문 · 처리 지연 주문 | `admin_store_order_ops_summary` / `needs_admin_attention` | 오늘 / 현재 | 조회 시 | 전체 | 처리 필요 주문 | ✔ |
| 취소·환불 요청 | 주문 상태 `cancel_requested`, `refund_requested` | 현재 | 조회 시 | 전체 | 취소/환불 요청 | ✔ |
| 매장별 매출 (주문 금액) | `store_orders` 합계 (고객→매장 직접 결제) | 기간 | 조회 시 | admin+ | 재무 매장별 | ✔ (※ 플랫폼 매출 아님 명시) |
| 플랫폼 수수료 | 수수료 원장 SQL 함수 | 기간 | 조회 시 | admin+ | 수수료 내역 | ✔ (운영 DB 적용 NOT_PROVEN) |
| ~~정산 대기 금액~~ → **미납 수수료 잔액** | `store_sale_fee_obligations` open 합 | 현재 | 조회 시 | admin+ | 수수료 미납 현황 | ✔ (지급 모델 없음 → 지표 교체) |
| 수수료 검토 대기 (취소·환불) | `review_required` | 현재 | 조회 시 | admin+ | 수수료 내역·검토 | ✔ |
| 매장 캐시 충전 승인 대기 | `business_cash_charge_requests.status=PENDING` | 현재 | 조회 시 | admin+ | 매장 캐시 충전 승인 | ✔ |
| 광고 승인 대기 | delivery ad `SUBMITTED/IN_REVIEW` | 현재 | 조회 시 | 전체 | 광고 승인 | ✔ |
| 고객 문의·분쟁 미처리 | `support_cases` (STORE_ORDER/OWNER) + `store_inquiries` open | 현재 | 조회 시 | 전체 | 고객지원 / 매장 문의 | ✔ |
| 배달 경고 | `delivery_operation_alert_events` open | 현재 | 조회 시 | 전체 | 배달 경고 | ✔ |
| 정산 보류·오류 | 수수료 원장 예외 탭 / integrity report | 현재 | 조회 시 | admin+ | 수수료 내역(예외) | 부분 (레거시 "held" 지표 제외) |

모든 카운트는 기존 action-queue registry 를 재사용 (DUP-6 증식 방지). 신규 집계는 registry 항목 추가로만 한다.

## 2.5 보고서 G — 구현 전 최종 설계 및 영향도

### 우선순위 · 구현 순서

| 단계 | 범위 | 주요 수정 파일 | API/DB 영향 | 위험 |
|---|---|---|---|---|
| **P0 금전·권한** | DEF-1, 2(최소안), 5(경고), 6, 8, 9, 10, 11, 33 | `app/api/admin/store-fee-policies/**`, `stores/[id]/route.ts`, `delivery-ads/**`, `advertising-workspace/action`, `store-orders/[orderId]/**`, `store-coupons`, `coin-withdrawals`, `business-cash-charges`, `runtime-health`, `delivery-release-gate`, `stores/[id]/delivery-service-areas`, `lib/admin/require-admin-permission.ts` | 가드·감사·조건부 업데이트 (DB 무변경) | 권한 강화로 기존 operator 작업 차단 → O1 선결 |
| **P0' 수수료 원자화** | DEF-3 | 신규 RPC + `AdminStoreFeePoliciesPage.tsx` | **DB 함수 추가** | 마이그레이션 → O5·O13 |
| **P1 운영 결함** | DEF-12~21, 25, 30, 32, LNK-4 | `AdminStoreReviewPanel.tsx`, `AdminBusinessDetailPage.tsx`, `load-admin-business-list.ts`, `api/admin/stores/route.ts`, `me/stores/[storeId]/route.ts`, `AdminOpsConsolePage.tsx`, `AdminStoreReportsPage.tsx`, `AdminDeliveryAdCashChargeQueuePage.tsx` | 코드만 (DEF-16 재심사·DEF-17 알림은 정책 O6) | 사장님 앱 흐름 영향 (DEF-16) |
| **P1' 레거시 정산 정리** | DEF-4, DUP-4 | `ensure-store-settlement.ts`, `record-store-order-payment.ts`, `apply-store-order-status-transition.ts`, `AdminCommerceSettingsPage`, auto action 설정 | 코드만 (데이터 보존) | O4 |
| **P2 IA 재배치** | §2.1 | `components/admin/admin-menu.ts`, `lib/i18n/catalog/admin*.ts`, `lib/admin/admin-real-operation-cut-j-*.ts`, 메뉴 계약 테스트, `lib/admin-menu-config.ts` 퀵링크 | 없음 | CUT J 게이트 동시 갱신 (O2) |
| **P2' 딥링크** | LNK-1~3, 5~9 | `AdminAdvertisingWorkspace.tsx`, `AdminDeliveryAdsControlPlane`, `AdminStoreInquiriesPage.tsx`, `AdminOrderDetailView.tsx`, `AdminDeliveryAdDetailWorkspace.tsx`, `AdminFinanceAdsView.tsx`, `AdminStoresHomeShelvesPage.tsx`, redirect page 2개 | GET 필터 파라미터 추가 | 낮음 |
| **P3 UI SSOT·용어** | DEF-34, §1.6, DEF-22·23 | SSOT 문서, `lib/admin/status-labels/*`, 공통 상태/결과 컴포넌트, 대상 화면 문구 | 없음 | 문구 변경량 큼 → 화면 단위 분할 |
| **P4 신규 기능 (정책 필요)** | DEF-18 영업시간 UI, DEF-29 payable·미납 개별 조치, DEF-31 광고 환불, §2.4 대시보드, 영업 개시 체크리스트, 액션큐·inbox 이벤트(DEF-26) | 다수 | 일부 DB | O6~O10 |
| **P5 정리** | DEF-24 레거시 컴포넌트, orphan GET `/api/admin/store-settlements`, legacy `store-point-*` API | 삭제 대상 목록 | 없음 | **삭제는 O12 승인 후**, `admin-dead-code-register.md` 등재 선행 |

### 기존 기능 보존 계획
- URL·메뉴 key·redirect·writer·RPC 전부 유지; 변경은 가드 강화·조건부 업데이트·감사 추가·라벨·위치에 한정.
- 매장 수수료 금액은 **DB 트리거만** 쓴다는 SSOT 유지 (TS 에서 금액 계산·되돌리기 추가 금지).
- 주문 상태 UI 는 `lib/stores/store-order-process-model.ts` 만 수정.
- 광고·프로모션 registry 분리(CUT C), Placement Map 읽기 전용(CUT F) 유지.

### 공통 시스템 재사용
action-queue registry (대시보드·액션큐) · `support_cases` (문의) · `admin_notifications` (알림함 이벤트 추가) · `audit_logs` (`appendAuditLog`) · `AdminActionConfirmDialog` · `AdminPageHeader`/`AdminTable` · 재무 SQL 함수.

### 기존 작업과의 충돌 위험

| 영역 | 상태 | 위험 |
|---|---|---|
| #65 / #66 주문 운영 (설계 v3) | 병합 완료 | `AdminOrderOpsScreen` 계약 유지 필요 — 낮음 |
| #58 수수료·캐시 SSOT | 코드 병합, **운영 DB 마이그레이션 적용 NOT_PROVEN** | P0'·대시보드 수수료 지표 선결 (O13) |
| #67 알림 긴급 복구 | 병합 완료 | 알림함 이벤트 추가 시 카테고리 계약 확인 |
| CUT J / M1 / CUT C·E·F·G·H | 하드락 | P2 는 Owner 수정 승인(O2) 없이는 금지 |
| 열린 PR (#42, #68 Android) | 진행 중 | Admin 과 무관 — 충돌 없음 |
| 데이터 초기화 (CUT H) | 하드락 | 레거시 정산 행 삭제 금지 (보존) |

### 테스트 · 운영 검증 계획
1. 단계별 PR: `npm run lint`, `npx tsc`, `npx vitest run lib/admin/__tests__`, `npm run verify:routes`, `npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock`, `npm run verify:native-version-bump` (웹 전용 확인).
2. P0: 권한별(master/manager/operator) API 403 계약 테스트, 동시성 409 테스트, 감사 로그 기록 테스트.
3. P1: 매장 상태 전이표 단위 테스트, 재개 시 노출 복구, 필터·300건 상한 회귀.
4. P2: 메뉴 계약 테스트 (path 유일성·key 보존·이동 전 URL 활성 판정).
5. 운영 검증: **스테이징에서만** 시나리오 1–6 재실행 (`docs/staging-delivery-e2e-scenario.md`), 운영 데이터 변경 금지.

---

# ③ Owner 승인 필요 사항

| ID | 결정 사항 | 선택지 | 권장 |
|---|---|---|---|
| **O1** | 금전·제재 작업 권한 등급 | (a) 수수료 정책·조정 = super_admin, 캐시 승인·출금·유료 연장·운영 중지·강제 취소 = manager 이상 (b) 전부 super_admin (c) 현행 유지 · `viewer` 도입 여부 | (a) + viewer 도입 |
| **O2** | 배달 IA 재배치 (CUT J 제한 수정 "J-AMD-3": 워크스페이스 순서 불변, 배달 내부 섹션 재편, 런타임·릴리즈 → 시스템, 매장 문의·캐시 충전 승인 메뉴 편입, 라벨 변경) | 승인 / 부분 승인 / 보류 | 승인 |
| **O3** | 「액션 큐」(전 도메인 처리 대기함) 위치 | A) 배달 유지·개명 B) 고객지원 워크스페이스 이동 | B |
| **O4** | 레거시 "지급 예정 정산" writer·지급일 설정·`auto_hold_settlement` 중단 (데이터 보존) | 승인 / 보류 | 승인 |
| **O5** | 수수료 정책 변경 이력 | 최소안(감사 로그) / 확장안(버전 테이블 + 원자 RPC, DB 변경) | 최소안 즉시 + 확장안 후속 |
| **O6** | 입점 재심사 정책 | 보완 재제출 시 pending 자동 복귀 · 거절 후 재신청 허용 여부·기간 · 결정 시 사장님 자동 알림 | 자동 복귀 + 알림 + 재신청 허용(사유 표기) |
| **O7** | 승인 후 영업 개시 절차 | (a) 체크리스트 UI (승인→판매→노출 유지) (b) 승인 시 판매·노출 자동 | (a) |
| **O8** | 광고 중도 종료·반려 환불 규칙 | 일할 환불 / 미환불 / 사안별 · 고아 차감 환불 UI 공개 여부 | 정책 확정 후 P4 |
| **O9** | 미납 수수료 운영 | 매장별 주문 차단·면제, 탕감(write-off), 사장님 독촉 알림 | 매장별 차단 + 독촉 알림 |
| **O10** | 플랫폼 지급 대상(payable, 플랫폼 쿠폰 등) 처리 방식 | 지급 완료 기록 CTA / 캐시 적립 / 보류 | 결정 필요 |
| **O11** | 「환불 승인」 명칭 | 「환불 처리 완료 기록」 등 실제 의미 반영 | 변경 |
| **O12** | 레거시 코드·API 삭제 허용 (주문 UI ~30개, orphan GET, store-point API) | 삭제 / 등재만 | 등재 후 단계 삭제 |
| **O13** | 수수료·캐시 SSOT 마이그레이션(`20270510120000`) 운영 적용 여부 확인 | Owner 직접 확인 | **P0' 착수 전 필수** |

## 이번 감사의 미검증(NOT_PROVEN) 목록 — 숨기지 않음
- 운영 DB 의 수수료 트리거·SQL 함수 실제 적용 여부, F10(₱225 불일치)·Coin 과발행 처리 (SSOT §0-4, Owner 결정 대기)
- 런타임 동작: cron 광고 전환, 알림 발송, Realtime, 동시 세션 이중 부과/환불 방지
- `stores.approval_status` CHECK 제약 존재 (마이그레이션에 base `CREATE TABLE stores` 없음)
- 입점 제출 서류(첨부) 검증 화면의 실제 사용 여부
- `/admin/store-orders`, `/admin/store-payment-events` 가 `partial` 인 사유 (메뉴에 근거 없음)
- 복구 실행 RPC 의 실행자 기록 여부
- L2–L4 권한·태블릿 운영 (CUT E carry)

---
*감사 방법: `admin-menu.ts` 트리 파싱(leaf 174) + `app/admin/**/page.tsx` 290개 대조 + 영역별 페이지→컴포넌트→API→DB/RPC→가드→CTA 추적, 주요 결함은 코드 재확인(수수료 정책 감사·가드, `resume_store`, 매장 상세 신고 탭, `actionable` 필터, Coin 라벨, 런타임 감사).*

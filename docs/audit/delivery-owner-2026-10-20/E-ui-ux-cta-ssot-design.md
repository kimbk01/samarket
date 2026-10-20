# 문서 E — 통합 UI / UX / CTA / SSOT 설계서 (제안 · Owner 승인 전)

- 이 문서는 **설계안**이다. 구현·URL 변경·배포는 Owner 승인 후 문서 F 순서로 진행한다.
- 원칙: **기존 URL 전부 유지**, 메뉴 정의는 `lib/business/owner-nav-registry.ts` 단일 원천에서 드로어·제목·활성·뒤로가기를 모두 파생, 새 화면은 승인 결정이 있을 때만.
- 상세 근거: `appendix/IA.md` §3-A(CTA 36버튼 매트릭스)·§3-B(현행 트리)·§3-C(제안)·§3-D(중복 통합).

## 1. 현행 메뉴 (as-is)

- 하단 5탭: 주문 · 상품 · **홈**(중앙) · 고객 · 관리
- 우측 드로어(모든 해상도, PC 고정 사이드바 없음): 운영 · 상품 · 고객 · 매장 · 정산 · 프로모션 · 성장 · 시스템 (23항목)
- 드로어에 없는 화면: `/settings`, 광고 하위 화면, `/ads/event-promotions`(진입점 없음), 고객센터 하위, `/apply`, 슬러그 알림 2종
- Finance 내부 8탭: 거래내역 · 주문별 정산 · 수수료/미납 · Coin · Cash · 광고 지출 · 전환 · 출금

문제 요약: 제목 누락·오타(IA-09), 하위 화면 활성 누락(IA-10), 뒤로가기 부모 오류(IA-11), 같은 토글 3곳(IA-12), 정산 용어 충돌(IA-13), 알림 설정 정체성(IA-14), `stores[0]` 사용(IA-08), 레거시 리다이렉트 쿼리 유실(IA-07).

## 2. 제안 IA — 12그룹 (URL 보존)

레거시 플랫폼 공통 패턴(문서 A (b))과 DIBAY 계약(직접 결제·캐시 차감 수수료)을 같이 반영했다. 국내 3사의 실제 메뉴명은 공개 자료로 확인되지 않아(`REFERENCE_NOT_VERIFIED`) 이름을 그대로 가져오지 않았다.

| # | 그룹 | 포함 URL (기존 그대로) | 하단탭 | 변경 요지 |
|---|---|---|---|---|
| 01 | 홈 | `/stores/owner` | 홈 | 대시보드: 처리 대기(신규·취소요청·지연) 카운트를 **서버 상태 필터 목록**과 같은 숫자로(ORD-05 후) |
| 02 | 주문 관리 | `/orders` (탭: 신규·진행·완료·취소/환불), `/order-chats`, `/order-chat/[orderId]` | 주문 | 주문 채팅을 고객 그룹에서 주문 하위로 이동. 검색·기간·더 보기 |
| 03 | 상품 관리 | `/products`, `/products/new`, `/products/[id]/edit`, `/menu-categories`, (`/menu` 레거시) | 상품 | 품절·노출 즉시 토글 유지, 재고 0 → 품절 자동(PRD-10) |
| 04 | 매장 운영 | `/ops-status`, `/basic-info`, `/settings`, 공개 매장 미리보기 | 관리 | 노출·영업 토글 **SSOT = `/settings`**, 헤더·ops-status 는 표시+링크만. 임시 영업중지(자동 재개)는 결정 D-9 |
| 05 | 배달 관리 | `/profile` (이름: "영업·배달 설정") 의 배달 섹션 앵커 `#delivery`, 배달 지역 V2 편집 | 관리 | 신규 URL 없이 앵커. 독립 페이지·지도 핀은 결정 D-10 |
| 06 | 매출·정산 | `/settlements`(수수료·캐시 원장), `/finance?section=outstanding`, `?section=transactions` | 관리 | **"주문별 정산" 탭 폐지**, "지급 현황" 용어 제거(SSOT: 주문별 지급 없음) |
| 07 | 코인·캐시 | `/finance?section=coin|cash|convert|withdraw|ads`, (`/business-cash`, `/points` 레거시) | 관리 | 충전·전환·출금 확인창·고정 멱등키(FIN-04) |
| 08 | 광고·홍보 | `/ads`, `/ads/new/*`, `/ads/[campaignId]`, `/ads/partner`, `/ads/popup/[id]`, `/ads/event-promotions(/[id])`, `/coupons`, `/banners`, `/notices` | 관리 | 쿠폰·배너·공지를 이 그룹으로, 이벤트 프로모션 진입점 신설 |
| 09 | 상품권 | `/gift-certificates`(+`?view=`) | 관리 | 매출은 06·07 로 링크 |
| 10 | 고객 관리 | `/customer-care`, `/inquiries`, `/reviews` | 고객 | 매장↔고객 응대만 |
| 11 | 알림 | `/notifications`, `/notification-settings`, (`/stores/[slug]/owner/*` → 리다이렉트) | 관리 | "내 계정 알림 설정" 으로 명시(사용자 단위) |
| 12 | 설정·지원 | `/customer-care/customer-center`(+하위), `/apply`, 계약·권한 안내, 내 정보로 | 관리 | 플랫폼 고객센터를 매장 고객 응대와 분리. 직원 계정은 결정 D-8 |

구현 방식: `OWNER_NAV_REGISTRY` 의 `drawerSection` 을 12개로 교체하고 항목마다 `parentId`·`titleKey`·`activePrefixes` 를 추가 → 드로어·페이지 제목·활성 하이라이트·뒤로가기를 레지스트리에서 파생(IA-09/10/11 동시 해소). URL 변경 0.

### 반응형

| 폭 | 레이아웃 |
|---|---|
| < 768px (폰) | 현행 유지: 상단 헤더 + 하단 5탭 + 우측 드로어 |
| 768–1279px (태블릿) | 하단 5탭 유지, 드로어를 좌측 오버레이로 |
| ≥ 1280px (PC) | **좌측 고정 사이드바**(12그룹, 접기 가능) + 하단탭 숨김 — 결정 D-11 |

## 3. 중복 통합 계획 (삭제가 아니라 캐노니컬 지정)

| 중복 | 캐노니컬 | 근거 | 조치 |
|---|---|---|---|
| `/my/business/*`, `/mypage/business/*` (24) | `/stores/owner/*` | `owner-routes.ts` 계약, 가드·셸 전부 캐노니컬 | 리다이렉트 유지 + **쿼리 전체 보존**, `/my/business/store-order-chat` → 실재 경로로 |
| `/stores/[slug]/owner/notifications`·`notification-settings` | `/stores/owner/notifications`·`/notification-settings` | 인바운드 링크 0, 같은 사용자 단위 API | 서버 리다이렉트(slug→storeId) |
| `/stores/[slug]/owner/orders`, `/stores/owner/edit` | `/orders?storeId=`, `/profile?storeId=` | — | storeId 보존 |
| `/finance?section=orders` ≡ `transactions` | `transactions` | 같은 컴포넌트 분기 | `orders` 탭 제거 |
| 노출/영업 토글 3곳 | `/settings` | 같은 PATCH | 나머지는 상태 표시 + 링크 |
| `/customer-care/messages`·`/inquiries` (클라 replace) | `/customer-care/customer-center?tab=` | — | 서버 리다이렉트 |
| `/profile` vs `/settings` | 둘 다 유지 | 역할이 다름 | 이름 변경: profile → "영업·배달 설정", settings → "매장 관리" |
| 고아 컴포넌트 18, 고아 라우트 3 | — | 인바운드 0 | 결정 D-12 후 삭제 |

## 4. 공통 UI 기준 (기존 토큰 규정 적용)

| 항목 | 기준 | 현행 위반 |
|---|---|---|
| 색 | `app/design-tokens.css` `--sam-*`, DIBAY 그린 `--sam-primary #0B421A`, 상태색 토큰 | hex 186·팔레트 클래스 369, 사이드바 `--biz-*` 별도 톤(IA-19) |
| 반경 | 화면에 붙은 카드·섹션·버튼·입력 `rounded-ui-rect`(4px), 시트·다이얼로그는 오버레이 계약, 원·pill 만 `rounded-full` | 비표준 반경 42 |
| 셸 | 매장 어드민 셸(`.cursor/rules/samarket-store-admin-ui-shell.mdc`): 섹션 + 하단 저장/취소 바, `OwnerStoreProfileForm`·`OwnerStoreBasicInfoForm` 패턴 | 쿠폰·배너·공지·리뷰 화면 미적용 |
| 확인창 | `OwnerStoreAdminConfirmModal` 하나, busy 전달 필수 | 쿠폰 목록·리뷰 답글 삭제·Coin 출금 확인 없음 |
| 피드백 | 공통 토스트 1종(성공·실패), 인라인 오류는 폼 필드 | 상품 허브만 자체 토스트, 다수 화면 실패 무음(IA-06/16/17/23) |
| 상태 화면 | 로딩(스켈레톤) · 빈 화면(다음 행동 CTA) · 오류(재시도) · **권한 없음/정지/심사중**(사유 + 허용 화면 링크) 4종 공통 컴포넌트 | 가드 모달이 모든 경우를 덮음(IA-01) |
| 용어 | 한국어 운영 용어 표준: 접수/거절/조리 시작/배달 출발/배달 완료/취소 요청/환불 · "수수료·캐시 원장"(정산 대신, 결정 D-13) · "Coin 환전"(출금) · "캐시" | "주문별 정산", "지급 현황", 영문 혼재 |
| 다국어 | 알림 문구 i18n 키 사용 | 리뷰 답글 알림 한국어 하드코딩(OPS-10) |

## 5. UX 기준

| 기준 | 설계 |
|---|---|
| 주문 처리 빠른 접근 | 홈·하단 주문 탭에서 신규 접수 1탭, 접수 시트에서 조리시간 선택(현행 유지) + 독촉 알림 가동(ORD-02) |
| 화면 이동 최소화 | 주문 카드 안에서 접수·단계 진행·취소 결정·채팅 진입 |
| 필터·검색 상태 유지 | 주문 탭·검색어·페이지를 URL 쿼리에 보존, 레거시 리다이렉트도 쿼리 보존 |
| 새로고침 = 최신 | 서버 상태 필터 조회, 공용 캐시 세대 증가(OPS-02) |
| 오류 시 기존 데이터 유지 | 리뷰·문의 저장 실패 시 목록을 지우지 않음(IA-15) |
| 중복 클릭 방지 | 모든 쓰기 CTA busy + 서버 멱등키(폼 단위 1회 생성) |
| 뒤로가기 | 레지스트리 `parentId` 기반 |
| 재입력 방지 | 기본정보 저장 시 변경 필드만 전송(LOC-013) |

## 6. CTA 기준과 적용 대상

모든 쓰기 CTA 는 아래 8가지를 만족해야 PASS 로 본다. 현행 36버튼 판정은 `appendix/IA.md` §3-A.

1. 라벨 = 실제 결과 2. 비활성 조건(권한·상태·미변경) 3. 위험 작업 확인창 4. 성공·실패 메시지 5. busy + 서버 멱등 6. 저장 후 서버 값으로 갱신 7. 사유 필수 작업은 사유 입력 8. **서버가 소유·승인·정지 상태를 모두 검사**

| CTA | 현행 미충족 | 설계 |
|---|---|---|
| 쿠폰 일시정지/재개/종료/재발행 | 3·4·5·8 + 상태 전이 | 확인창, 상태 전이표 서버 강제(CAS), 재발행 멱등 |
| 리뷰 답글 삭제 | 3·4 | 확인창, 실패 메시지 |
| 문의 답변 | 4 | 실패 메시지 |
| 노출·영업·메신저 토글 | 3(노출 OFF)·4·5 | 결정 D-14(확인창 범위), 실패 시 원복+토스트 |
| Cash 충전·Coin 전환·Coin 출금 | 3(출금)·5 | 확인창, 폼 단위 고정 키, 충전 참조번호 |
| 상품권 판매 신청 | 5 | 멱등키 |
| 배너·공지·광고 신청 | 8 | 공통 오너 쓰기 게이트(승인·정지) |
| 주문 단계 변경 | 4(일부 경로) | 실패 메시지 공통화 |

## 7. SSOT 통합표

| 데이터 | 권위 원천 (유일) | 현재 이탈 | 설계 |
|---|---|---|---|
| 매장 상태(승인·정지·노출·영업) | `stores` — **쓰기는 서버 API·관리자 함수만** | REST 직접 쓰기(P0-1), 오너 카드 원값(OPS-04), 탈퇴 미반영(ACC-03) | REVOKE + 보호 트리거, 실효 상태 함수 1개를 오너·구매자 공용 |
| 오너 접근 가능 여부 | (신규) `resolveOwnerStoreAccess(store)` 1개 — UI 가드와 API 게이트가 같은 함수 | UI 가드와 정책 파일 불일치(IA-01), API 승인 미검사(IA-03) | 공통 게이트 |
| 활성 매장 | `resolveOwnerActiveStoreRow` | `stores[0]`(IA-08), 가드 계정 단위(IA-02) | 전 화면 리졸버 사용 |
| 메뉴·제목·활성·뒤로가기 | `owner-nav-registry.ts` | 제목·뒤로가기·활성 별도 파일 | 레지스트리 파생 |
| 상품 가격·옵션·품절 | `store_products` (쓰기 API 경유) + 주문 시 `create_store_order_atomic` 재검증 | REST 직접 쓰기(P0-2), 검수 미검사(PRD-03), 캐시 로컬 무효화(OPS-02) | REVOKE, RPC 검수 검사, 공용 세대 |
| 주문 상태 | `store_orders.order_status` (쓰기 `applyStoreOrderStatusTransition` + DB 함수) | 관리자 CAS(ORD-04), 배달 상태 별도(DLV-02) | CAS 기대값 전달, 배달→주문 동기화 |
| 배달 가능 여부 | `evaluateDeliveryServiceArea` | fail-open(LOC-003), 판정 스냅샷 없음(LOC-004) | fail-closed, 주문에 스냅샷 저장 |
| 매장 위치 | `stores.lat/lng` (오너 API·관리자) | REST 직접(P0-1), 감사 없음(LOC-007) | REVOKE, 변경 감사 |
| 결제·환불 | `store_orders` 상태·`payment_status` (+ 상품권 환불 RPC) | 부수효과 비원자(FIN-05, ADS-21, GFT-05) | 한 DB 트랜잭션 |
| 수수료 | `store_sale_fee_obligations` (트리거) | **트리거 비활성(P0-5)**, 레거시 스냅샷 수정(FIN-06), 재무제표 레거시 원천(FIN-07) | 트리거 활성 + 레거시 읽기 전용 |
| 코인·캐시 잔액 | `store_economic_point_*` / `business_cash_*` 원장 | Cash 1곳 불일치·정정 없음(FIN-08), 권한 잔존(FIN-09) | 정정 함수, REVOKE |
| 미납·순잔액·주문 가능 | `store_cash_position` | 오너 TS 집계(FIN-11), 레거시 차단 플래그(FIN-15) | SQL 함수 단일 |
| 광고 집행 상태·가격 | `lifecycle_status` + `delivery_ad_campaign_commercial_snapshots` | 기간·인벤토리 독립 변경(ADS-02), `is_active` 호환 컬럼 | 스냅샷 고정 |
| 쿠폰 상태 | `lifecycle_state` | `is_active` 이중(ADS-23), 오너 덮어쓰기(IA-04) | lifecycle 파생 |
| 상품권 잔액·사용 | `gift_certificate_instances` + `gift_certificate_ledger` | 역처리 가드 없음(GFT-01) | 상태 가드 |
| 플랫폼 보유분 지급 | (미정) | Coin gross / gift net / payable 분류 3원천(FIN-03) | 결정 D-2 후 단일 레일 |
| 정산 예정·확정·지급 | **해당 없음**(직접 결제) — 수수료·캐시 원장이 대체 | 레거시 `store_settlements` 501건·"주문별 정산" 용어 | 레거시 읽기 전용 + 용어 정리 |
| 알림 설정 | `owner_notification_settings(user_id)` | 매장 단위처럼 표시(IA-14) | 문구·위치 정리 |

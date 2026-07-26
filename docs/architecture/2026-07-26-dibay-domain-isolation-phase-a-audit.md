# DIBAY 도메인 독립화 — Phase A 감사 (2026-07-26)

> 코드 수정 전 전수 감사. 근거는 실제 `page.tsx` / layout / import / lifecycle 경로.
> 작업 전 HEAD: `226ca71bc` (또는 이후 main tip).

## 1. 고정 캐노니컬

| 도메인 | 캐노니컬 | Surface (`resolve-main-surface`) |
|---|---|---|
| Community | `/philife` (+ `/`·`/home`·`/community` INTENTIONAL_ALIAS) | `community` |
| Trade | `/market` (+ `/post`·`/write`·`/products`·`/shop`) | `trade` |
| Delivery Customer | `/stores`, `/orders` | `delivery` |
| Delivery Owner | `/stores/owner` | `delivery` (셸은 Owner 전용) |
| Messenger | `/community-messenger` | `chat` |
| MyPage | `/mypage` | `mypage` |
| Platform Admin | `/admin` | `(main)` 밖 · `AdminGuard` |

## 2. Route — P0 핵심 수치

| 항목 | 값 | 판정 |
|---|---|---|
| `/my/business/*` REAL RENDER | **15** | DUPLICATE_RENDER / LEGACY_RENDER |
| `/my/business/*` SERVER_REDIRECT | 4 (hub/edit/menu/store-order-chat) | OK |
| `/mypage/business/*` REAL RENDER | **0** | 전부 SERVER_REDIRECT |
| `/stores/owner/*` 구현 | 대부분 `export { default } from my/business/...` | 캐논 URL이 레거시 파일을 재노출 |
| Community home dual Surface | Instant/KeepAlive 미배선 | hub↔hub dual-feed P0 **없음** |
| `/admin` vs Owner | 경로·가드·셸 분리 | 혼합 P0 **없음** |

### `/my/business` REAL RENDER 15

`apply`, `banners`, `basic-info`, `inquiries`, `menu-categories`, `notices`, `ops-status`, `products`, `products/new`, `products/[productId]/edit`, `profile`, `reviews`, `settings`, `settlements`, `store-orders`

계약(`lib/business/owner-routes.ts`)은 redirect-only를 요구하나 구현 불일치.

## 3. Shell / lifecycle

| 항목 | 결과 |
|---|---|
| Instant dual panel | `pendingPushNode={null}`, dual intent Set empty |
| KeepAlive multi-hub | 파일 삭제 + verify forbid |
| Root 전역 RT (participants/call/notifications) | 제품 allowlist 상주 → P1 |
| Owner badge 180s poll | BottomNav 구독 시 도메인 이탈 후에도 생존 → P1 |
| non-hub push exiting clone | 전환 윈도우 일시 dual tree → P1 |

## 4. Import / Store (요약)

| 등급 | 이슈 |
|---|---|
| P0 | `/my/business` 실렌더 + owner page re-export 역전 |
| P1 | `lib/stores` 고객/오너 물리 혼재, trade↔messenger 결합, root RT 상주 |
| P2 | KeepAlive 네이밍, orphan Instant panel 파일, `/philife` 중첩 UiScope |

## 5. Phase 진행 상태 (2026-07-26 동일 세션)

| Phase | 상태 | 내용 |
|---|---|---|
| A | DONE | 본 문서 |
| B | DONE | `verify:legacy-owner-render-ban`, `verify:canonical-owner-routes` |
| C-owner | DONE | `/stores/owner` 구현 소유 · `/my/business/**` 19/19 redirect-only · layout shell 제거 |
| C2-mypage | DONE | `/my/**` REAL_RENDER **0** — ads/trust/offers/points*/store-inquiries/blocked-users + client→server store-orders |
| Gates | DONE | mypage-legacy / delivery-customer-owner / delivery-cache / global-runtime / messenger-legacy |
| D Store FULL split | **BLOCKED** | owner-hub-badge·owner-lite·lib/stores 혼재 — cutover ①~⑧ 필요. 이번: cart mount `/stores/owner` 제외만 |
| group-chat/[roomId] | KEEP experimental | CM private_group과 다른 축 — index만 CM redirect |
| Phase F | NOT READY | 실기기 QA 전; FULL delivery split 미완 |

## 6. Delivery FULL split cutover (후속)

1. Import/verify bans 강화 + cart mount exclude (부분 완료)
2. Role-prefixed client caches
3. Row RT 훅 buyer/owner 분기
4. Notifications→owner invalidate를 Owner surface로 이전
5. owner-lite facade 분리
6. owner-hub-badge → app hub badge rename + Delivery slice 분리
7. lib/stores 물리 폴더 customer/owner/shared
8. Zustand/Context mount 1:1

## 7. Delivery Runtime Cutover ①~③ (2026-07-26)

| 단계 | 결과 | 권위 |
|---|---|---|
| ① import boundary | Customer/Owner role root runtime import 게이트 강화. `import type` 허용, runtime Store/Cache/Realtime 금지. Owner-admin entry debt는 파일 1개 exact allowlist. | `verify:delivery-customer-owner-boundary` |
| ② cache namespace | Customer detail/events/list → `delivery-customer:*`; Owner list/detail key contract → `delivery-owner:*`. 기존 `me:store-order:*` / `owner-orders-list:*` writer 제거, fallback read·dual-write 없음. | `delivery-order-cache-namespace.ts` |
| ③ row realtime | 공통 transport 위 Customer/Owner/Admin adapter 분리. 채널 role prefix, Owner store identity 검증, 동일 payload signature 재적용 0. 각 adapter는 자기 surface refresh callback만 실행. | `useCustomerStoreOrderRowRealtime`, `useOwnerStoreOrderRowRealtime` |

### 의도적으로 남은 다음 cutover

- ④ notifications → owner invalidate 스코프
- ⑤ owner-lite 역할 분리
- ⑥ owner-hub-badge 권위 분리
- ⑦ owner-hub 180초 poll 제거
- ⑧ 물리 파일 경계 정리

**판정:** CUTOVER ①~③ 코드 완료 후보. 실기기 측정 전이므로 Phase F NOT READY.

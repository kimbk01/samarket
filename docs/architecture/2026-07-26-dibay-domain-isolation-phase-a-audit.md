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
| C-mypage-partial | PARTIAL | `/my/benefits`, `/my/recent-viewed` → `/mypage/*` redirect + hub 링크 교정 |
| C-mypage-full | TODO | 나머지 `/my/*` 실렌더(~offers/points/ads/trust/…) 대응표·이관 |
| D+ | TODO | Customer/Owner Store·cache·RT 분리, root RT allowlist 재평가 |

## 6. 회귀 위험

- `/stores/owner`가 `my/business` re-export인 채 redirect만 적용하면 **무한 리다이렉트** → **반전 완료로 해소**
- `my/business/layout`의 `BusinessAdminShell`이 redirect 페이지에서도 마운트되면 Owner shell 누수 → **passthrough layout으로 해소**
- hub 링크가 계속 `/my/benefits`를 가리키면 hop 1회 남음 → **주요 진입 링크를 `/mypage/*`로 교정**

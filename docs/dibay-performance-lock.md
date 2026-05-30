# DIBAY 성능 구조 Lock (수정 금지·소유권)

> **목적**: “빠르게 보이게” 패치하는 대신 **이미 검증된 구조를 역행하지 않게** 고정한다.  
> **근거 감사**: [dibay-system-audit.md](./dibay-system-audit.md).  
> **상태 소유권 (2차)**: [dibay-state-ownership-map.md](./dibay-state-ownership-map.md) — writer 수·목표 OWNER.  
> **운영 절차**: [samarket-native-feel-charter.md](./samarket-native-feel-charter.md), [samarket-perf-change-protocol.mdc](../.cursor/rules/samarket-perf-change-protocol.mdc).

---

## 0. Lock의 의미

| 용어 | 뜻 |
|------|-----|
| **LOCK** | 되돌리면 `verify:*`·회귀 guard·changelog **필수** |
| **OWN** | 해당 계층만 수정 가능; 다른 계층이 같은 데이터를 쓰면 **버그** |
| **LIMIT** | 수치 한도; 초과 시 기능 추가가 아니라 **페이로드·구독 축소** |
| **WRITER** | 동일 상태에 `setData`/`set`/직접 patch 하는 독립 모듈 — **목표 1** |

---

## 0-2. Ownership lock (2차 — 신규 패치 금지)

아래는 **구조 통합 라운드(R2-*)** 완료 전까지 **추가 writer·merge helper·cache tier 금지**.

| ID | 상태 | 현재 writer | 목표 OWNER | 금지 |
|----|------|-------------|------------|------|
| **M-OWN-1** | 홈 room list (`chats`/`groups`) | **1** (`applyHomeListPatch`) | **`lib/community-messenger/home-list-patch.ts`** — R2-M1 lock | 새 `setData` merge, `patchBootstrap*`·`prev.chats.map` 직접 호출 (`verify:messenger-home-list-owner`) |
| **M-OWN-2** | hub list row in Zustand | **0** (필드 제거) | **messages/active/runtime only** — R2-M3 lock | hub 필드·`useChatStore`·`applyRoomSummaryPatched` (`verify:messenger-realtime-store-scope` + `verify:messenger-dead-hub-cleanup`) |
| **M-OWN-3** | unread | bootstrap row + store + guard + read-ui | reducer 내부 `resolveUnreadWithLocalReadGuard` only | stale mask, duplicate optimistic layer |
| **D-OWN-1** | owner `orders[]` | `load()` + RT `onChange→load` + 45s poll | **하나**: row-patch **or** reload policy | dead hook + reload 동시 유지 |
| **D-OWN-2** | store detail load | `loadSplitDetail` + `loadSplitDetailSilent` | 단일 `loadStoreDetail({ silent })` | 세 번째 load variant |
| **T-OWN-1** | trade/market feed | `getPostsForHome` vs `/api/trade/feed` | 문서화된 dual **or** 단일 API (제품 결정) | 셋째 feed fetch |
| **A-OWN-1** | admin dashboard | RSC seed + page poll | `setPayload` only + visibility-gated poll | 페이지별 신규 15s interval |

**Realtime Registry (미구현)**: `subscribeWithRetry` 신규 call site 추가 **금지** — R2-M3에서 coordinator 1개 후만.

---

## 1. 수정 금지 구조 (절대 역행)

### 1.1 메신저

| ID | 금지 | 정상 경로 | 문서 |
|----|------|-----------|------|
| M-L1 | `room_client_legacy` 정상 경로 | `room_client_block` + critical instant | [messenger-performance-architecture.md](./messenger-performance-architecture.md) |
| M-L2 | shell-after-route (라우트 후에만 shell) | **PASS0 pre-route overlay** | 동일 |
| M-L3 | same-room `key={roomId}` 강제 remount | subtree persistent | `cm-room-subtree-stability.ts` |
| M-L4 | 5s 이내 reentry foreground GET | `evaluateCmRoomForegroundBootstrap` → skip | `cm-room-bootstrap-lock.ts` |
| M-L5 | **클라이언트** room bump publish | **서버만** `publish-messenger-room-bump` | [messenger-realtime-policy.md](./messenger-realtime-policy.md) |
| M-L6 | blocking bootstrap이 shell 이후 | shell → PASS2 viewport → idle secondary | architecture doc |
| M-L7 | `critical_patch`가 room row **전체 replace** | `mergeMessengerRoomSummaryForHomeSyncCriticalPatch` | changelog 2026-05-05 |

### 1.2 거래·커뮤니티

| ID | 금지 | 정상 경로 | 검증 |
|----|------|-----------|------|
| T-L1 | `getItemDetailPageData`에서 `loadTradeDetailRelatedBundle` await | Suspense + `getTradeDetailRelatedData` | `verify:trade-hot-path-contract` |
| T-L2 | `openCreateTradeChat`가 `createOrGetChatRoom` 동기 대기 | 즉시 compose `replace` | `.mdc` trade-post-detail |
| T-L3 | `getPostsForHome`에 AbortSignal로 prewarm 이중화 | 단일 비행·고정 키 | `trade-home-list-invariants.mdc` |
| T-L4 | 메신저 방에서 BottomNav 경로 외 스위치 | `conditional-app-shell-flags` | chat-detail-bottom-nav |
| T-L5 | read-only 하단 탭 hub 교차·메신저 진입 시 **교육용 Cross-domain/Messenger Confirm blocking** | **Phase A (2026-05-30):** safe navigation → `resolveBottomNavTransitionConfirmCopy` null·즉시 `commitMainBottomNavRoute`. **유지:** `useInlineWriteSheetNavigationGuard`·cart/checkout Confirm. **Phase B scaffold:** `main-bottom-nav-risky-navigation.ts` (probe only). **금지:** tab id 우회(3안)·write guard 제거 | `main-bottom-nav-transition-copy.ts`, `BottomNav.tsx`, `main-bottom-nav-interaction-contract.ts` |

### 1.3 배달

| ID | 금지 | 정상 경로 |
|----|------|-----------|
| D-L1 | 옵션 시트 open 시 **menu subtree** 동반 re-render | portal + `StoreDetailBottomStripSheetGate` (DS2b) |
| D-L2 | cart mutation 후 snapshot **useEffect만** | `publishCommerceCartSnapshot` 동기 bus (DS3) |
| D-L3 | cart conflict가 `StoreDetailPublic` state | `StoreCartConflictPortal` + ui-store |
| D-L4 | BN3/BN5 **region suffix 불일치** prewarm | `storeHomeFeedSuffixFromPrimaryRegion` |

---

## 2. Realtime 규칙

| 규칙 | 내용 |
|------|------|
| **단일 의미** | 같은 이벤트를 HTTP poll + RT + bootstrap이 **서로 다른 shape**으로 쓰지 않음 — merge 함수 명시 |
| **구독 수명** | `subscribeWithRetry` → 반드시 `stop()`; grace teardown은 **홈 meta만** (`MESSENGER_HOME_REALTIME_DEFERRED_STOP_GRACE_MS`, 기본 4s) |
| **이름 충돌** | duplicate channel name은 **관측**(`duplicate_instance_same_name`); 새 채널 추가 시 registry 검토 |
| **거래 상태** | 판매 상태 변경 → 서버 `community_messenger` room summary 동기화 (클라 추측 patch 금지) |
| **읽음** | 방 open: `mark_read` + `setLocalReadGuard` 20s; stale unread mask로 덮지 않음 |

---

## 3. Hydration 규칙

| 도메인 | 규칙 |
|--------|------|
| 메신저 방 | PASS0 **zero-fetch**; hydrate는 PASS2 **patch-only** (`cm-room-bootstrap-patch-only`) |
| 거래 상세 | RSC: 본문+판매자 최소; related는 **스트림** |
| `/market` default | RSC `initialHomeTradeFeed` + Suspense; 필터 탭은 클라 only |
| `/philife` | RSC 셸; 피드는 `fetchNeighborhoodFeedShortTtl` (1200ms server TTL) |
| `/stores/[slug]` | **의도적** `initialApiResponse=null` — 서버 선조회로 TTFB 막지 않음 |
| `/stores/[slug]/cart` | SSR monolith 허용 — **checkout 분리 시 재검토** |

---

## 4. Fetch 규칙

| 패턴 | 적용 |
|------|------|
| **단일 비행** | `runSingleFlight` / `*Deduped` / route `singleflight` — 키 문서화 |
| **Abort** | 메신저 silent home-sync: 상위 abort 시 merge skip; **거래 홈 prewarm에는 abort 금지** |
| **Tier** | `home-sync`: `critical` → (400ms) → `full`; critical은 `hydrateProfilesLabelsOnly` |
| **Fallback 체인** | posts schema / `posts_masked` — **새 fallback 추가 금지**; 스키마·뷰 수정으로 근본 해결 |
| **Prewarm** | pointerdown·idle warm은 **실제 fetch URL·캐시 키**와 동일 suffix |

---

## 5. Route 규칙

- 사용자 UI: **`app/(main)/`** 만 (`AGENTS.md`).
- `app/_*` 금지 — URL 404.
- 하단 탭 경로: `lib/main-menu/bottom-nav-config.ts` 단일.
- 메신저 방: 경로 플래그가 shell/BottomNav **유일 권한**.

---

## 6. Cache ownership

| 데이터 | OWNER (쓰기) | READERS | TTL |
|--------|--------------|---------|-----|
| Messenger bootstrap full/critical/minimal | API success → `primeBootstrapCache` | home hook, warm, logout clear | 5min memory+session |
| Home-sync route | `home-sync/route.ts` singleflight | silent fetch | 800ms client reentry |
| Trade home posts | `getPostsForHome` | HomeProductList | 45s |
| Philife neighborhood feed | `runNeighborhoodFeedWithShortTtl` | CommunityFeed, prewarm | 1200ms |
| Store delivery API | `store-delivery-api-client` | detail, cart, browse | 12–120s per endpoint |
| Browse list | `stores-browse-response-cache` | browse route | 45s, max 200 keys |
| Store taxonomy | `fetchStoresTaxonomyDeduped` | hub, browse metadata | 120s client |
| Room snapshot | `room-snapshot-cache` | open, mark_read | 5s foreground reuse |

**금지**: 동일 payload에 TTL만 다른 캐시 **추가** — 기존 OWNER에 tier/키 통합.

---

## 7. State ownership

| UI 상태 | OWNER |
|---------|-------|
| 메신저 방 목록 행 | `use-community-messenger-home-bootstrap` state + RT store **merge 함수만** |
| unread 배지 (방) | `local-read-guard` + server mark_read |
| 장바구니 라인 | `StoreCommerceCartContext` + snapshot bus |
| 옵션 시트 open | `store-product-sheet` store / portal |
| 오너 주문 행 | **운영**: `OwnerStoreOrdersView` — reload; row-patch 훅 통합 전 **dead** |

---

## 8. Bootstrap limits

출처: `MESSENGER_PERF_DESIGN_LIMITS`, [messenger-bootstrap-and-payload-limits.md](./messenger-bootstrap-and-payload-limits.md).

| 한도 | 값 |
|------|-----|
| 방 입장 API 수 (ok/warn/critical) | 3 / 5 / 8 |
| bootstrap gzip | 80 / 150 / 250 KB |
| virtualization 전 메시지 수 | 50 / 80 / 120 |
| critical room cap | 30 (`COMMUNITY_MESSENGER_BOOTSTRAP_CRITICAL_ROOM_CAP`) |
| RT tracked rooms | 280 prune |

---

## 9. Rerender limits

| 구간 | 한도 | guard |
|------|------|-------|
| `room_shell_visible_ms` | >200ms warn | `cm-messenger-perf-regression-guard` |
| `composer_visible_ms` | >300ms warn | 동일 |
| option select/price | ≤30ms (배달 UX) | `delivery-option-*-trace` |
| cart optimistic | ≤50ms | `delivery-cart-optimistic-ms` |
| menu subtree during sheet | **0** `render_while_sheet_open` | DS2 trace |

---

## 10. Payload limits

- home-sync·bootstrap: **헤더** `x-samarket-critical-payload-kb` 관측 유지.
- philife feed: `philife_feed_*` 단계 로그 — 직렬화·enrich 분리.
- browse: `logBrowsePerfSteps` — taxonomy∥stores 병렬 유지.

---

## 11. 변경 시 필수 절차

1. `.mdc` 계약 읽기 → `git diff` + CONTRACT 주석.
2. `npm run verify:parity-gates` (거래/메신저 해당 시).
3. `docs/trade-perf-hot-path-changelog.md` **한 줄 append** (개선·역행 모두).
4. lock 문서와 충돌 시 **lock 문서 먼저** 갱신 또는 역행 사유 명시.

**앱 부트 API (2026-05-30 완료)**: profile lite · hub badge · notifications · auth/session cold-path — [dibay-app-boot-api-perf-lock.md](./dibay-app-boot-api-perf-lock.md). 해당 4 route semantics·warm SLO 역행 시 **회귀**로 처리.

**하단 탭 nav-perf Confirm Phase A FINAL LOCK (2026-05-30)**: read-only hub 교차·메신저 진입 — cross-domain/messenger Confirm blocking 제거 (+600~900ms 회수). dirty write sheet·cart/checkout guard 유지. 측정: `node scripts/measure-bottom-nav-confirm-immediacy.mjs` (`bn6_phase_a_safe_nav`, confirm gate 7/7). Phase B risky probe(cart/upload/chat)는 **승인 전 scaffold only**. remaining blocker (Phase A 무관): vitest/vite `ERR_REQUIRE_ESM` → `verify:messenger-home`·`verify:i18n-key-exposure`.

---

## 12. 명시적 허용 (임시가 아닌 구조)

- **Quiet window 500ms** — 입장 직후 저우선 작업 defer (`CM_ROOM_ENTRY_QUIET_WINDOW_MS`).
- **home-sync 800ms client TTL** — reentry 중복 네트워크 방지 (merge 게이트는 호출측).
- **Owner 45s poll** — Realtime miss 보완 (**단**, row-patch 통합 후 poll 축소 검토).

이 허용은 [dibay-architecture-cleanup.md](./dibay-architecture-cleanup.md)에서 **삭제 후보**로 별도 표시한다.

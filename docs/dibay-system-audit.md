# DIBAY 전체 시스템 마스터 감사 (2026-05-16)

> **범위**: SAMarket/DIBAY 모노레포 — 메신저·배달·거래/커뮤니티·관리자/오너.  
> **성격**: 코드·문서·실측 기반 **진단 스냅샷**. 수정 우선순위는 [dibay-architecture-cleanup.md](./dibay-architecture-cleanup.md), 잠금 규칙은 [dibay-performance-lock.md](./dibay-performance-lock.md).  
> **2차 (ownership)**: [dibay-state-ownership-map.md](./dibay-state-ownership-map.md) — writer 수·dead path·R2 라운드.  
> **연속 문서**: [samarket-performance-track-state.md](./samarket-performance-track-state.md), [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md), [samarket-parity-execution-order.md](./samarket-parity-execution-order.md).

---

## 1. 전체 시스템 수준 (한 줄)

| 도메인 | 참조 수준 | 체크시트 완료율 | 구조 성숙도 | 체감(SLO) |
|--------|-----------|-----------------|-------------|-----------|
| 메신저 | 카카오톡 | **0/5 → 0%** | shell-first·zero-fetch **lock 문서화** | `composer_wall` warm **1.6–5.1s** (목표 ≤1s 경고) |
| 거래+커뮤니티 | 당근마켓 | **0/5 → 0%** | 핫패스 **검증 스크립트·changelog 강함** | `/post` cold **~1617ms**, warm **~53–65ms** |
| 배달·스토어 | 배민/요기요 | **0/5 → 0%** | dibaY trace·dedupe **양호** | DS1 메뉴 fetch **871→278/10/25ms**; DS3 cart **측정 대기** |
| 관리자/오너 | 실운영 콘솔 | **별도 SLO 없음** | 기능 풍부 | **15–60s 폴링** 다수, 테이블 가상화 **없음** |

**판정**: 네 도메인 모두 **코드·계약은 부분 lock**, **체감 완료(헌장 [4])는 미달**. “최종 구조”는 메신저 PASS0·거래 P1·배달 DS1/2에 **근거가 있으나** 도메인 체크시트 `[x]`는 증거 3회·합의 전까지 열지 않는다.

---

## 2. A. 메신저 (카카오톡 기준)

### 2.1 아키텍처 요약

```
탭/목록 tap → PASS0 pre-route shell (zero-fetch)
           → route + CommunityMessengerRoomClient (persistent subtree)
           → room_client_block bootstrap / 5s zero-fetch reentry
           → Realtime: subscribe-with-retry × N + room-bump (서버 publish only)
           → home: critical bootstrap → silent home-sync → +400ms full supplement
```

| 계층 | 단일 소유(의도) | 실제 분산 |
|------|-----------------|-----------|
| 방 목록 상태 | `use-community-messenger-home-bootstrap` + Zustand `messenger-realtime-store` | bootstrap-cache, home-sync, RT patch, multi-tab-bus, local-read-guard |
| 서버 읽기 | `lib/community-messenger/service.ts` (**~15,246 LOC**) | critical-stage, home-sync route, HS3/HS5 RPC, trade enrich |
| Realtime | `subscribe-with-retry.ts`, home channels, room bundle | **10+ 독립 구독 생명주기** |

### 2.2 실측 ms (문서·테스트 출처)

| # | 지표 | 측정값 | 목표(문서) | 출처 |
|---|------|--------|------------|------|
| 1 | room open `composer_wall_ms` | **5094 / 1596 / 1696** | 경고 **1000** | Playwright 2026-04-21, checksheet §2 |
| 2 | CTV→input (breakdown) | **0ms** ×3 | — | 라운드 M, track-state |
| 3 | FMR−CTV | **~16–21ms** | (과거 H **78.7ms**) | 라운드 M |
| 4 | `list_bootstrap_align` (동기만) | 설계 **5–30ms** | ≤30ms | `MESSENGER_PERF_REFERENCE_ROOM_OPEN_MS` |
| 5 | `home_sync_fetch_ms` (클라 1 RTT) | **~2000–2100ms** 반복 | ≤600ms | 라운드 R, checksheet |
| 6 | `room_shell_visible_ms` (prod-like warm) | **2–3ms** | — | [messenger-performance-baseline.md](./messenger-performance-baseline.md) |
| 7 | `composer_visible_ms` warm / cold | **2–3 / ~201ms** | guard **300ms** | baseline + `cm-messenger-perf-regression-guard` |
| 8 | zero-fetch reentry 5s TTL | **foreground_fetch_skipped: true** | 필수 | baseline |
| 9 | store-owner-hub-badge (탭 경합) | **~974ms** | — | 라운드 R |
| 10 | bootstrap payload | 설계 한도 **80–250KB gzip** | `MESSENGER_PERF_DESIGN_LIMITS` | thresholds.ts |

### 2.3 카카오톡 대비 부족 요소 (구체)

| 카카오 기대 | 현재 | 갭 유형 |
|-------------|------|---------|
| 탭 후 즉시 입력 | breakdown 0ms, **wall SLO 미달** | **측정·합의** (구조는 개선됐으나 체감 미완) |
| 목록·말풍선 즉시 | critical→full 2단계, home-sync **2s** | **서버 RTT·enrich** |
| 배지·읽음 즉시 정합 | local-read-guard 20s + 다중 writer | **상태 소유권 분산** |
| 단일 안정 Realtime | duplicate channel name·grace teardown | **구독 경제** |
| 재진입·뒤로가기 | zero-fetch 5s lock 있음, E2E `[ ]` | **검증 공백** |

### 2.4 구조 문제 · 반복 수정 · 회귀

- **다중 list writer**: bootstrap seed → `mergeHomeSyncIntoBootstrap` → RT `applyRoomSummaryPatched` → mark_read — changelog에 **critical_patch가 trade meta 덮어쓰기** 반복(2026-05-05, 05-10).
- **거대 service.ts**: home-sync·trade enrich·bootstrap이 한 파일 → compile/heap 라운드가 **관측만**으로 분리됨(2026-05-13 v8 dynamic import).
- **bootstrap single-flight 키 분산**: `lite` / `critical` / `list-bootstrap-warm` — warm과 lite **경합 시 이중 HTTP** 가능.
- **Realtime**: Fast Refresh·auth·visibility 시 home channel churn — `cm-rt-loop-diagnosis` 추가가 **증상 관측**이지 단일 registry는 아님.

### 2.5 메모리·retain (메신저)

| 위치 | 메커니즘 | prod 위험 |
|------|----------|-----------|
| `service.ts` 14+ Map 캐시 | process-lifetime | **서버리스 인스턴스** 장기 시 RSS |
| `messenger-realtime-store` + `seenIncomingMessageIdsByRoom` | cap **280** prune | 브라우저 |
| `roomBumpEntries` global Map | 채널 per entry | **stop 누락 시 leak** |
| `subscribe-with-retry` dev | 5s `setInterval` | dev-only |
| `background-hydration-scheduler` singleton | dispose 수동 | visibility listener 잔류 |
| `bootstrap-cache` sessionStorage | 5min TTL | 탭별 JSON |

---

## 3. B. 배달 (배민/요기요 기준)

### 3.1 라우트·경계

| 경로 | RSC | 데이터 |
|------|-----|--------|
| `/stores` | 셸 → **StoresHub (client)** | `home-feed`, taxonomy, BN prewarm |
| `/stores/[slug]` | **initialApiResponse=null** → StoreDetailPublic | split: summary/menus/banners/notices + legacy fallback |
| `/stores/[slug]/cart` | **SSR monolith** `fetchStorePublicInitialOnServer` | blocking |
| `/stores/browse/*` | metadata SSR taxonomy; body client | `fetchStoresBrowseDeduped` + 서버 45s Map 캐시 |

### 3.2 실측 ms

| # | 지표 | 값 | 출처 |
|---|------|-----|------|
| 1 | `menu_fetch_ms` | **871 → 278/10/25** | DS1 |
| 2 | `tap_to_menu_first_visible_ms` | **910** (1회만) | DS1, 3회 미기록 |
| 3 | option sheet open | **3ms** ×3 | DS2, 목표 ≤80ms |
| 4 | select/price/validation | **0–1ms** | DS2 |
| 5 | add submit | **0ms** | DS2 |
| 6 | BN3 `routeSettledMs` | **140/87/79** | track-state |
| 7 | BN3 home-feed after pointer | **8/8/8ms** | track-state |
| 8 | taxonomy slowest | **375→319ms** (BN4) | track-state |
| 9 | browse curl warm | **0.544s → 0.396s** | SB1 |
| 10 | DS3 cart traces | **전부 대기 (—)** | track-state |

### 3.3 배민 대비 부족

- **첫 페인트에 메뉴**: DS1로 fetch 분리됐으나 **E2E·실기기·tap_to_menu 3회** 없음.
- **뒤로가기·재진입**: `StoresDeliveryLayoutShell` scroll restore 있음, 체크시트 증거 없음.
- **checkout**: `/checkout` → `/cart` redirect, **CHECKOUT trace 미착수**.
- **오너 콘솔**: Realtime 후 **전체 reload** (`OwnerStoreOrdersView`); row-patch 훅은 **dead code**.

### 3.4 중복·위험 구조

- Monolith `GET /api/stores/[slug]` vs split 4 API + `loadSplitDetail` / `loadSplitDetailSilent` **~180줄 이중**.
- Taxonomy: DB dedupe + `browse-mock/queries` **이중 원천**.
- Browse: 서버 45s 캐시 + 클라 sub-cache.
- `store-delivery-api-client` Map: **키 수 상한 없음**.

---

## 4. C. 거래/커뮤니티 (당근 기준)

### 4.1 핫패스 (검증됨)

- `getItemDetailPageData`: related·room-id·판매자 제안 **RSC 크리티컬 제외**.
- related: `Suspense` + `getTradeDetailRelatedData` 단일 경유.
- `openCreateTradeChat`: **비대기** compose replace.
- `npm run verify:trade-hot-path-contract` — 역행 시 CI 실패.

### 4.2 실측

| 경로 | cold | warm (2–3) |
|------|------|-------------|
| `/market` TTFB | — | **55.7 / 65.9 / 77.3 ms** |
| `/post/[id]` | **1616.9 ms** | **65.1 / 53.3 ms** |
| philife feed TTL | 서버+클라 **1200ms** in-flight/TTL | changelog 2026-05-10 |
| 거래 홈 클라 캐시 | **45s** sessionStorage | `getPostsForHome` |

### 4.3 당근 대비 부족

- **무한 스크롤**: `/market` HomeProductList는 **단일 페이지 + rAF 확장**; Philife만 IO loadMore.
- **가상화 없음**: CommunityFeed **~1,442 LOC**, 긴 DOM retain.
- **API 이원화**: `/api/philife/posts` vs `/api/trade/feed` — 캐시 키·정책 분리.
- 체크시트 5항목 **전부 `[ ]`**.

---

## 5. D. 관리자/오너

### 5.1 폴링 (실제 코드)

| 컴포넌트 | 주기 |
|----------|------|
| `AdminDashboardPage` | 30s |
| `AdminOpsConsolePage` | 15s (2 interval) |
| `DeliveryOrdersDashboardClient` | 15s |
| `DeliveryOperationsDashboardPage` | 45s |
| `AdminDeliveryAlertsPage` | 60s |
| `AdminStoreOrdersPage` | 30s |
| `OwnerStoreOrdersView` | 45s + Realtime full reload |

### 5.2 구조 리스크

- `AdminOpsConsolePage` **~1,364 LOC** — God component.
- 테이블 **virtualization 없음** (admin grep 무일치).
- Recharts 대신 CSS 막대 — 가볍지만 **30s poll 시 전체 리렌더**.
- **parity 게이트·SLO 없음** — 거래/메신저와 운영 기준 불균형.

---

## 6. 메모리 병목 (2단계 요약)

| 분류 | 예시 | dev-only | prod 위험 |
|------|------|----------|-------------|
| Next dev HMR | module graph·heap inflation | **예** | 해당 없음 |
| Node heap (home-sync) | `getHeapStatistics` dev 진단 | dev | serverless cold compile |
| Browser retain | Feed DOM, cart localStorage, RT store cap 280 | — | **예** |
| Supabase WS | 10+ subscribe scopes, room bump Map | churn 로그 | **연결 수·재구독** |
| Server Map 캐시 | CM service 14 Maps, browse 200 key sweep | — | **인스턴스 RSS** |
| Event-loop | 15–60s admin intervals 누적 | — | **다탭 운영자** |

**retain 위치(우선순위)**: `service.ts` server Maps → `CommunityFeed` list nodes → `StoreCommerceCartContext` localStorage → `subscribe-with-retry` channels → `dedupeAt` in `delivery-perf-trace.ts`.

---

## 7. Double Check (1차 대비)

| 검증 | 1차 주장 | 재검증 |
|------|----------|--------|
| 메신저 shell 2–3ms | baseline prod-like | **PASS** — 단, dev `composer_wall` 1.5s+와 **별 축** (fake fast 아님, 지표 분리됨) |
| DS2 option 0–3ms | trace only | **PASS** — menu subtree `render_while_sheet_open` DS2c로 격리; **세션 누적 count≠per-open** 문서화됨 |
| 거래 P1 완료 | verify script | **PASS** — 체감 0%는 **의도적** (헌장 [4]) |
| home-sync 2s 개선 | 라운드 R | **부분** — target 600ms 대비 **여전히 critical**; HS5 병렬은 구조 개선, E2E 미완 |
| 오너 row-patch | explore agent | **dead path** 확인 — 운영은 reload |
| Admin “가벼움” | CSS charts | **hidden retain** — poll storm·full table DOM |

---

## 8. 유지보수·Realtime 위험 (종합)

1. **계약은 문서+스크립트로 강함**(거래, 메신저 PASS0) ↔ **체감 체크시트 0%**.
2. **changelog 70+행** — 동일 테마( related 위치, home-sync merge, auth refresh, prewarm 키) **반복**.
3. **측정 축 혼동**: `shell_visible` vs `composer_wall` vs `home_sync_fetch` — lock 문서에 분리돼 있으나 운영 보고 시 혼동 재발.
4. **legacy 호환 층**이 prod에 남음: monolith store API, `room_client_legacy`, posts schema fallback chain.

---

## 9. 다음 단계 (구조 고정 우선, 코드 수정은 별 라운드)

1. [dibay-performance-lock.md](./dibay-performance-lock.md) — 수정 금지 목록 운영.
2. [dibay-regression-watch.md](./dibay-regression-watch.md) — CI·수동 측정 임계.
3. [dibay-architecture-cleanup.md](./dibay-architecture-cleanup.md) — legacy 삭제·통합 순서.
4. 마스터 순서 [samarket-parity-execution-order.md](./samarket-parity-execution-order.md) **0→5** 유지; 라운드당 **원인 1개**.

**금지**: debounce/cache 덧칠로 본 문서 갭을 닫는 것 — 각 갭은 **소유권·단일 writer·단일 API** 로만 닫는다.

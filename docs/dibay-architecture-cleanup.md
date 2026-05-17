# DIBAY Architecture Cleanup (통합·삭제·Lock 계획)

> **전제**: [dibay-system-audit.md](./dibay-system-audit.md) 진단 완료. **2차(2026-05-16)**: [dibay-state-ownership-map.md](./dibay-state-ownership-map.md).  
> **코드 수정은 라운드당 원인 1개** — 본 문서는 순서·의존성만 정의한다.  
> **Lock**: [dibay-performance-lock.md](./dibay-performance-lock.md) · **Watch**: [dibay-regression-watch.md](./dibay-regression-watch.md).

---

## 1. 왜 반복 수정이 발생하는가 (구조 원인)

| # | 원인 | 증상 | 대표 파일/이력 |
|---|------|------|----------------|
| 1 | **다중 list writer** (bootstrap, home-sync, RT, read) | stale unread, trade meta 소실 | `merge-critical-home-sync-room-summary`, changelog 2026-05-05 |
| 2 | **거대 모듈** (~15k LOC service, ~1.4k Feed/Admin) | compile·heap·리뷰 불가 → 관측 패치만 추가 | `service.ts`, `CommunityFeed.tsx` |
| 3 | **API 이원화** (monolith vs split, philife vs trade feed) | 캐시 미스·중복 fetch | stores slug, `/api/trade/feed` |
| 4 | **legacy fallback 체인** (posts schema, posts_masked) | 동일 500 반복 수정 | trade-post-list-preview |
| 5 | **dead code path** (미배선 최적화) | “이미 만들어 둔” 패치 재발명 | `useOwnerStoreOrdersRealtime` |
| 6 | **측정 축 혼동** | shell PASS인데 wall FAIL → 또 패치 | baseline vs composer_wall |
| 7 | **prewarm 키 drift** | 탭 빠른데 데이터 늦음 | BN3/S1 suffix |
| 8 | **admin SLO 공백** | poll·full table이 거래 UX와 경합 | 15–60s intervals |

---

## 2. 왜 회귀가 발생하는가

- **LOCK 문서와 코드 분리**: messenger architecture lock은 있으나 **배달·admin lock 없음** → DS1/2 역행 위험.
- **changelog는 많으나 admin/owner 미포함** → 운영 화면만 되돌려도 체감 저하.
- **verify 스크립트 범위**: 거래·메신저 홈만 — browse·owner는 **수동**.
- **critical_patch / related 위치**가 과거 3회 이상 왕복 ([trade-perf-hot-path-changelog.md](./trade-perf-hot-path-changelog.md)).

---

## 3. 왜 다시 느려지는가

| 메커니즘 | 예 |
|----------|-----|
| 첫 RSC에 비핵심 합류 | post detail cold 1.6s (완화됐으나 cold 여전히 높음) |
| home-sync full tier 2s | 메신저 탭·Philife 경합 |
| Owner full reload on RT | 오너 대시보드 체감 |
| Admin poll storm | 15s × N tabs |
| Map 캐시 무상한 | store-delivery-api-client |
| dev 번들 stale | DS2 `value_ms` 없음 → 무효 측정 |

---

## 4. 왜 메모리가 증가하는가

| retain | 위치 | cleanup 방향 |
|--------|------|--------------|
| server Map caches | `service.ts` | cap + eviction policy 라운드 |
| Feed DOM | `CommunityFeed` | virtualization 라운드 (마스터 순서 5) |
| RT store + seen ids | `messenger-realtime-store` | cap 280 유지·감사 |
| room bump Map | bump subscription | assert stop on unmount |
| cart JSON | localStorage | bucket limit |
| dedupeAt maps | delivery-perf-trace | session reset hook |
| interval timers | admin/owner | `document.visibilityState` gate |

---

## 5. 왜 Realtime이 불안정해지는가

- **10+ subscribeWithRetry** — stop 누락·grace 경쟁.
- **duplicate channel name** — false failure → retry storm (완화됐으나 registry 없음).
- **Fast Refresh / auth refresh** — home channel recreate (진단만).
- **클라 bump 금지** 위반 시 이중 이벤트 (정책 lock).

---

## 6. 삭제 대상 legacy (우선순위) — 2차 grep 확인

| 항목 | 상태 | 왜 dead | 원인 |
|------|------|---------|------|
| `OwnerOrdersPageClient` + `useOwnerStoreOrdersRealtime` | **dead** | `app/**` import **0**; 운영은 `OwnerStoreOrdersView` only | row-patch 구현 후 **라우트 미배선** |
| ~~`useChatStore` + `chat-store-from-server.ts`~~ | **삭제됨 (R2-M3)** | — | — |
| `loadSplitDetail` / `loadSplitDetailSilent` | **duplicate** | `StoreDetailPublic.tsx` ~180줄 이중; silent = page-show restore | silent 경로 추가 시 **복사** |
| layered bootstrap primers | **drift** | `primeBootstrapCache` 호출 6+ 모듈 | 라운드마다 success path에 **또 prime** |
| `merge-critical-home-sync-room-summary` 외 list patch | ** proliferating** | RT·bus·Home 각자 `setData` | reducer 없이 **증상 merge** |

| 항목 | 조건 | 리스크 |
|------|------|--------|
| `useOwnerStoreOrdersRealtime` + `OwnerOrdersPageClient` | **승격 or 삭제** (R2-D1) | 낮음 |
| ~~`useChatStore` + `chat-store-from-server`~~ | **R2-M3 삭제 완료** | — |
| `loadSplitDetailSilent` vs `loadSplitDetail` | 동작 동치 테스트 후 (R2-D2) | 중간 |
| `room_client_legacy` 정상 경로 사용처 | grep 0 | 낮음 (이미 fallback only) |
| `posts_masked` 직접 조회 (preview) | 마이그레이션 정합 후 | DB |
| browse `browse-mock/queries` taxonomy | DB taxonomy 단일화 후 | UI copy |
| 중복 admin poll on hidden tab | visibility gate 후 interval 제거 | 운영 SLA 합의 |

**삭제 전**: 사용처 grep + `verify:parity-gates` + changelog **역행 사유** 없음 확인.

---

## 7. 통합할 layers

### 7.1 메신저

| From | To | 목표 |
|------|-----|------|
| 4+ list writers | **단일 reducer** (`applyHomeListPatch`) | unread/meta 단일 진실 |
| `service.ts` blobs | `bootstrap/`, `home-sync/`, `trade-enrich/` packages | compile 분리 |
| bootstrap SF keys | **하나의 warm→lite 정렬** | 이중 HTTP 제거 |
| RT subscriptions | **MessengerRealtimeRegistry** (refcount) | churn cap |

### 7.2 배달

| From | To |
|------|-----|
| monolith + split | split only + monolith **cart SSR만** |
| taxonomy mock + DB | DB only |
| browse server + client cache | server authoritative + client ETag optional |
| owner reload + dead row-patch | **하나** (patch + debounced enrich) |

### 7.3 거래/커뮤니티

| From | To |
|------|-----|
| philife/posts + trade/feed | 문서화된 **단일 feed contract** 또는 명시적 dual with shared cache key |
| CommunityFeed monolith | feed loader + virtual list + card |

### 7.4 Admin

| From | To |
|------|-----|
| per-page poll | shared `AdminLiveDataBus` + WS where possible |
| full table render | paginate mandatory >500 rows |

---

## 8. Route 정리

| 현재 | 목표 |
|------|------|
| `/checkout` → `/cart` | CHECKOUT 전용 route 또는 cart phase 명시 |
| `/stores/[slug]/owner/orders` redirect | 단일 owner orders URL 문서화 |
| `/home` → `/philife` | 외부 링크만 유지, 내부는 philife |

---

## 9. State ownership 정리 (목표 OWN)

→ [dibay-performance-lock.md](./dibay-performance-lock.md) §6–7.  
**실행**: 각 라운드에서 “이번에 OWNER 밖 쓰기 제거” 1건.

---

## 10. Realtime ownership 정리

1. Inventory: `subscribeWithRetry` grep 전수.
2. 홈: meta + room bundle → **한 coordinator**.
3. 방: bump + postgres_changes → room lifecycle hook 1개.
4. 문서: [messenger-realtime-policy.md](./messenger-realtime-policy.md) 에 registry 추가.

---

## 11. Hydration 구조 정리

| 라운드 후보 | 원인 1개 예시 |
|-------------|----------------|
| H1 | `/stores/[slug]` menus **RSC seed** (키 = menus cache) |
| H2 | `/post` cold 1.6s — shared layout data 분리 |
| H3 | cart SSR monolith → split + seed cache |

---

## 12. Lock 해야 할 핵심 구조 (이미 vs 미래)

| 구조 | 상태 |
|------|------|
| Messenger PASS0 / zero-fetch | **LOCKED** (architecture doc) |
| Trade P1 related Suspense | **LOCKED** (verify script) |
| DS1 menus apply parallel | **LOCKED** (DS2 depends) |
| DS2 option portal | **LOCKED** |
| DS3 cart bus | **LOCKED** (측정 대기) |
| Browse server cache | **LOCK** after SB1 UI 3-run |
| Admin poll | **UNLOCKED** — cleanup 대상 |
| Feed virtualization | **UNLOCKED** — 순서 5 |

---

## 13. 실행 순서 (마스터 순서 + **2차 ownership 우선**)

**2차 라운드 (구조만, 속도 패치 금지)** — [dibay-state-ownership-map.md](./dibay-state-ownership-map.md) §H:

```
R2-M1  applyHomeListPatch reducer (list writer 7+ → 1) — **코드 완료** · `verify:messenger-home-list-owner`
R2-M2  messenger-realtime-store hub list 제거 (messages only) — **완료** · `verify:messenger-realtime-store-scope`  
R2-M3  deprecated hub fields + dead store 삭제 — **완료** · `verify:messenger-dead-hub-cleanup`
R2-D1  owner orders: row-patch 승격 OR dead 삭제 (reload 1정책)
R2-D2  loadSplitDetail 단일화
R2-T1  feed API dual 계약 문서 or 단일화
R2-A1  admin poll visibility / coordinator
--- 이후 기존 마스터 순서 ---
0 verify:parity-gates
1 셸·탭
2 거래 cold post
3 배달 DS3 측정 → CHECKOUT
4 home-sync ≤600ms, composer_wall (측정 — reducer 후)
5 virtualization
```

**병렬 금지**: R2-* 한 번에 하나. **금지**: R2-M1 전에 cache/debounce/새 merge helper.

[samarket-parity-execution-order.md](./samarket-parity-execution-order.md) 속도 축은 **ownership 라운드 이후** 측정 재개.

---

## 14. 완료 정의 (cleanup done)

- [ ] Dead path 제거 목록 grep clean
- [ ] `service.ts` < 5k LOC per package or documented exception
- [ ] Admin visible-only poll
- [ ] 도메인 체크시트 **각 1개 이상 `[x]`** (3회 측정·합의)
- [ ] [dibay-regression-watch.md](./dibay-regression-watch.md) baseline 행 채움

---

## 15. 금지 (cleanup 중에도)

- fallback SELECT tier 추가
- global singleton Map 무제한 추가
- debounce만으로 poll storm 숨기기
- verify 스크립트 assertion 삭제
- LOCK ID 역행 without changelog

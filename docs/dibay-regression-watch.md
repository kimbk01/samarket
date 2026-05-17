# DIBAY Regression Watch (임계값·관측·판정)

> **사용**: 라운드 종료·PR·prod-like 세션 전 **체크리스트**. 수치는 [dibay-system-audit.md](./dibay-system-audit.md) 실측에서 가져왔고, 목표는 [messenger-performance-targets.md](./messenger-performance-targets.md) 등과 정합한다.  
> **Ownership (2차)**: [dibay-state-ownership-map.md](./dibay-state-ownership-map.md).  
> **판정 언어**: 성공 / 보류 / 무효 — [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) [5].

---

## 0. 측정 환경 (공통)

| 항목 | 규칙 |
|------|------|
| prod-like | `npm run build` && `npm run start` — **dev HMR 수치로 최종 판정 금지** |
| 반복 | 동일 조건 **3회**; 이상치 1회는 dev 경합으로 표기 |
| 게이트 | `npm run verify:parity-gates` 최소 통과 |
| 로그인 | fake cookie vs 실로그인 **분리 기록** |

---

## 1. Regression threshold — 메신저

### 1.1 방 입장 (카카오 축)

| metric | 목표 p95 | 경고 | 치명 | 현재 베이스라인 (참고) | 관측 |
|--------|----------|------|------|------------------------|------|
| `room_shell_visible_ms` | ≤200 (guard) | — | — | **2–3ms** warm | `cm-room-entry-timing-session` |
| `composer_visible_ms` | ≤300 (guard) | — | — | **2–3ms** warm, **~201ms** cold | regression guard |
| `composer_wall_ms` | ≤1000 | — | — | **1596–5094ms** (dev e2e) | Playwright spec |
| CTV→input | 0ms band | — | — | **0ms** ×3 | breakdown spec |
| `list_bootstrap_align` | **5–30ms** | 50 | 90 | 설계 대역 | `chat.unread_sync` |
| `bootstrap_fetch` HIT | 0–100ms | — | — | — | client perf |
| `bootstrap_fetch` MISS | 200–500ms | 1000 | 2000 | — | client perf |
| `home_sync_fetch_ms` | ≤600 | 1200 | 2000 | **~2000ms** (과거) | silent tier |
| `silent_fail_fallback_bootstrap_ms` | ≤2000 | 4000 | 8000 | — | env default 8000 |

### 1.2 Realtime · 구독

| metric | 목표 | 경고 | 치명 | 관측 |
|--------|------|------|------|------|
| `subscription_failure_rate` | ≤0.1% | 1% | 5% | `MESSENGER_PERF_REFERENCE_RATIOS` |
| reconnect session rate | ≤1% | 3% | 5% | 동일 |
| home channel churn / 30s | **baseline 수립 필요** | +50% vs baseline | +100% | `[cm-rt-loop-summary]` |
| `duplicate_instance_same_name` | 0 on prod path | any | — | subscribe-with-retry |
| room bump listener leak | 0 after leave | — | retain>0 | `roomBumpEntries` size (dev) |

### 1.3 정합 (false negative 방지)

| check | PASS 조건 |
|-------|-----------|
| same-room dual open | 동일 lastMessage·unread |
| unread after read | badge 0 within `badge_list_align` 0–10ms band |
| critical_patch | `contextMeta`·trade label 유지 |
| zero-fetch 5s | `foreground_fetch_skipped: true` |

**회귀 시**: `trade-perf-hot-path-changelog.md` append + `cm-perf-regression` warn 종류 기록.

---

## 2. Regression threshold — 배달

| metric | 목표 | 경고 | 현재 (참고) | trace tag |
|--------|------|------|-------------|-----------|
| `menu_fetch_ms` | ≤500 | 871+ | **278/10/25** | `menu-visible-breakdown` |
| `tap_to_menu_first_visible_ms` | 300–350 (방향) | 910+ | **910** (1회) | 동일 |
| option sheet open | ≤80 | — | **3** | `delivery-option-sheet-open-ms` |
| option select/price | ≤30 | — | **0–1** | `delivery-option-select-ms` |
| add optimistic | ≤50 | — | **0** | `delivery-option-add-submit-ms` |
| cart optimistic | ≤50 | — | **—** (DS3 대기) | `delivery-cart-optimistic-ms` |
| qty/delete patch | ≤30 | — | **—** | `delivery-cart-qty-patch-ms` |
| menu subtree during sheet | **0** | any | DS2c 진단 | `render_while_sheet_open` |
| BN3 `routeSettledMs` | ≤150 | 500 | **79–140** | nav-perf |
| browse warm TTFB | ≤400ms | 544ms+ | **~396ms** | curl SB1 |

---

## 3. Regression threshold — 거래/커뮤니티

| metric | 목표 | 경고 | 현재 (참고) | 방법 |
|--------|------|------|-------------|------|
| `/market` warm TTFB | ≤100ms | 200ms | **55–77ms** | curl -L |
| `/post/[id]` warm TTFB | ≤100ms | 500ms | **53–65ms** | curl |
| `/post/[id]` cold TTFB | ≤800ms | 1600ms | **1617ms** | curl |
| related load | non-blocking first byte | await in RSC | Suspense | verify script |
| philife feed duplicate window | ≤1 per 1500ms | 2+ | TTL 1200ms | header/log |
| home posts duplicate fetch | 0 extra | 2+ | single-flight | Network |
| feed scroll FPS | ≥55 | 45 | **미측정** | Performance panel |

---

## 4. Regression threshold — 관리자/오너

| metric | 목표 | 경고 | 현재 |
|--------|------|------|------|
| dashboard poll while hidden | **0 requests** | any | 미검증 |
| ops console 15s interval | ≤1 req/s visible | storm | 15s × tabs |
| table row DOM (10k rows) | virtualized or paginated | full render | **no virtual** |
| owner order patch | row-level | full reload | **full reload** |
| chart rerender on poll | subtree only | full page | likely full |

---

## 5. Memory threshold

| metric | dev | prod risk | action |
|--------|-----|-----------|--------|
| Node RSS (home-sync route) | `[dev-heap] home-sync high heap` | serverless | dynamic import v8 only dev |
| browser heap (30min messenger) | baseline TBD | session leak | RT cap 280, bump stop |
| `getCommunityMessengerServiceCacheFootprint()` | log Maps | instance warm | cap/evict policy |
| cart localStorage size | — | >500KB warn | bucket prune |
| websocket channels (client) | `activeCountTop` | >20 warn | registry |
| admin interval count | — | >3 simultaneous | visibility gate |

---

## 6. WebSocket threshold

| rule | 값 |
|------|-----|
| Max independent `subscribeWithRetry` scopes per surface | **검토 중** — 현재 10+ |
| Home meta deferred stop grace | 4s default (`NEXT_PUBLIC_MESSENGER_HOME_RT_DEFERRED_STOP_GRACE_MS`) |
| Room bump channels per open room | 1–2 (canonical+raw) |
| Reconnect storm | 3 failures / 60s → alert (`messenger-production-slo.md`) |

---

## 7. Bootstrap / hydration / rerender (요약 watch)

```bash
# Parity gates (필수)
npm run verify:parity-gates

# Trade hot path (거래 파일 touch 시)
npm run verify:trade-hot-path-contract

# TypeScript
npx tsc --noEmit
```

| watch | trigger |
|-------|---------|
| `reentry_foreground_fetch_not_skipped` | 5s reentry |
| `subtree_remounted` | same room |
| `room_client_legacy` | non-fallback |
| `render_while_sheet_open` | store detail + sheet |
| `trade-post-list-preview` 500 | schema/view drift |

---

## 8. Route transition threshold

| transition | metric | 목표 | 참고 |
|------------|--------|------|------|
| BottomNav → `/stores` | `routeSettledMs` | ≤150ms | **79–140** BN3 |
| BottomNav → `/market` | first list visible | 즉시 | RSC seed |
| list → room | `composer_wall_ms` | ≤1000 | 미달 |
| store detail back | scroll restore | <100ms | layout shell — **측정 TBD** |

---

## 8-2. Ownership regression (2차 — 구조 라운드 필수)

| check | PASS | FAIL (역행) |
|-------|------|-------------|
| 홈 room list writer count | **1** `applyHomeListPatch` | 새 `setData` in watched files — `npm run verify:messenger-home-list-owner` |
| R2-M1 merged | 2026-05-16 | `lib/community-messenger/home-list-patch.ts` + 6 call sites |
| hub list in `messenger-realtime-store` | messages/active only | `seedBootstrap` mutates list for hub UI — `verify:messenger-realtime-store-scope` |
| R2-M2 merged | 2026-05-16 | store scope log `[cm-rt-store-scope]`; list unread UI bootstrap-only |
| R2-M3 merged | 2026-05-16 | hub fields removed; `useChatStore` deleted; `verify:messenger-dead-hub-cleanup` |
| hub field grep in realtime-store | 0 | `roomSummariesById` / `unreadByRoomId` in store file |
| unread patch paths | 1 guard + reducer | new optimistic mask file |
| owner orders on RT event | row patch **or** reload, not both | `onChange→load` + row-patch hook |
| dead path grep | `OwnerOrdersPageClient` 0 imports after delete | file remains |
| `useChatStore` grep | 0 calls | revived usage |
| new `subscribeWithRetry` site | 0 without registry PR | +1 file |
| new admin `setInterval` | 0 without visibility gate | Ops-style 15s add |
| monolith store fetch in detail | 0 on happy path | split+fallback+monolith triple |

**측정 (R2-M1 후)**: dev에서 `setData` 호출 스택 샘플링 — list patch가 `applyHomeListPatch` 외 **0건**.

---

## 9. False optimization 검증 (Double Check)

| 신호 | 의미 | 조치 |
|------|------|------|
| `shell_visible` PASS + `composer_wall` FAIL | **fake fast** shell | wall 축으로 판정 |
| curl warm only | 네트워크만 개선 | nav-perf 3회 추가 |
| trace 0ms but 느린 체감 | main thread block elsewhere | Performance long task |
| cache TTL hit without key align | **masking** miss | prewarm suffix audit |
| admin poll reduced but data stale | 운영 리스크 | stale SLA 별도 |

---

## 10. 라운드 종료 기록 템플릿

```markdown
| metric | run1 | run2 | run3 | threshold | 판정 |
|--------|------|------|------|-----------|------|
| ...    |      |      |      |           | 성공/보류/무효 |
```

판정이 **보류**면 동일 원인 후보 **반복 금지** (헌장 [5]); 새 트랙·새 원인 1개로 연다.

---

## 11. CI·스크립트 매핑

| 스크립트 | 잠금 대상 |
|----------|-----------|
| `verify:trade-hot-path-contract` | T-L1, T-L2 |
| `verify:messenger-home` | 홈 bootstrap 계약 |
| `verify:parity-gates` | 위 + tsc |
| `cm-messenger-perf-regression-guard.test.ts` | shell/composer 200/300ms |
| `messenger-room-entry-perf-breakdown.spec.ts` | CTV→input |
| `delivery-menu-visible-trace.test.ts` | menu trace shape |

**없는 것 = 자유롭게 수정 가능이 아님** — [dibay-performance-lock.md](./dibay-performance-lock.md) LOCK 표를 따른다.

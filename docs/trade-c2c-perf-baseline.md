# 디바이(C2C) 거래 — 실측 baseline 절차

표준 계측 키: `lib/trade/trade-c2c-perf-metrics.ts`  
디버그 켜기: `sessionStorage.setItem("samarket:debug:runtime", "1")` 또는 `localStorage.setItem("samarket.perf.log", "1")`

## 시나리오 (각 3회, 중앙값 기록)

| # | 시나리오 | 경로 | 주요 키 |
|---|----------|------|---------|
| 1 | 거래 목록 콜드 | `/market` | `trade_list_total_ms`, `trade_list_payload_bytes` |
| 2 | 상품 상세 | `/post/[id]` | `trade_detail_total_ms` |
| 3 | 채팅 신규 진입 | 상세 → 채팅하기 | `trade_chat_open_total_ms`, `trade_chat_bootstrap_ms` |
| 4 | 채팅 재진입 | 기존 방 → 이어가기 | `trade_chat_duplicate_room_guard_ms` |
| 5 | ko/en 전환 | 상세·compose에서 언어 토글 | UI 깨짐·키 노출 없음 |
| 6 | low-end Android | 동일 1~4 (Chrome remote debug) | heap·subscribe count |

## 읽기

- 브라우저: `globalThis.__samarketAppWidePhaseLastMs`
- 콘솔: `[perf][client][trade_c2c]`
- Realtime: `trade_realtime_subscribe_count` / `unsubscribe_count`

## 서버 (채팅 resolve)

`TRADE_ENTRY_PERF_LOG=1` → `[trade-entry-perf] entry_resolve_route`

## P3 realtime 추가 키 (2026-05-27)

`duplicate_subscribe_count`, `visible_trade_room_count`, `trade_realtime_debounce_unsubscribe_count`, `trade_realtime_active_room_pinned_count` — `[perf][client][trade_c2c]` 스냅샷에 포함.

## 기록 템플릿

| 날짜 | 시나리오 | ko/en | p50 ms | payload B | 메모 |
|------|----------|-------|--------|-----------|------|

### 2026-05-27 (로컬 dev · `qqqq@manual.local` · 390×844 · 1회)

| 항목 | 값 (ms / count / MB) | 비고 |
|------|----------------------|------|
| trade_list_total_ms | **7650** | **proxy** `trade_list_hydration_complete_ms` (RSC `initialHomeTradeFeed` 로 `recordTradeListTotalMs` 미발화) |
| trade_list_payload_bytes | — | 동일 이유로 클라 `getPostsForHome` JSON 크기 미기록 |
| trade_detail_total_ms | **177** | `/post/[id]` |
| trade_chat_open_total_ms | **9380** | 상세 → 채팅하기 |
| trade_chat_bootstrap_ms | **9377** | compose/방 진입 |
| trade_chat_duplicate_room_guard_ms | — | `trade-chats` 목록 0건·재진입 미수행 |
| trade_realtime_subscribe_count | **11** | P3 viewport subscribe |
| trade_realtime_unsubscribe_count | **4** | |
| trade_realtime_debounce_unsubscribe_count | **4** | |
| trade_memory_heap_used_mb | **307** | Chromium `performance.memory` |

**재현:**

```bash
npm run dev
node scripts/capture-trade-c2c-baseline.mjs
# 목록만: node scripts/capture-trade-market-only.mjs
```

산출물: `tests/e2e/.artifacts/trade-c2c-baseline.json`

**로그인:** Supabase `signInWithPassword` + `sb-*-auth-token` 쿠키 (`/api/test-login` 은 410).

## i18n 게이트

```bash
npm run check:i18n
node scripts/check-hardcoded-korean.mjs components/post/PostDetailView.tsx
```

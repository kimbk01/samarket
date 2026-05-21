# Messenger client first-paint lock (회귀 방지)

**범위:** lite HTTP 응답 **이후** 클라이언트 merge / render / 첫 행만.  
**금지 (이 lock 으로 변경하지 않음):** 서버 bootstrap API, bundle RPC, trade enrich, unread semantics, realtime, room UI 구조.

**구현 단일 출처:** `lib/community-messenger/cm-client-first-paint-lock.ts`  
**측정:** `npm run measure:cm-client-first-paint` (exit 0 = PASS, 1 = FAIL)

## Baseline (고정)

| Metric | Max | 비고 |
|--------|-----|------|
| `bootstrap_response_received` → `first_room_row_rendered` | **50ms** | |
| → `skeleton_removed` | **80ms** | |
| → `list_interactive` | **100ms** | |
| lite 이후 `CommunityMessengerHomeListPane` re-render | **≤ 2** | |
| Server `GET ?lite=1&fresh=1` (Node fetch, 동일 쿠키) | **≤ 350ms 권장** | 초과 시 **warn only** (스크립트 exit 는 클라 FAIL 만) |

### 기록된 PASS 스냅샷 (2026-05, 로컬 dev)

| Run | first_row | skeleton | interactive | re_renders | server lite |
|-----|-----------|----------|-------------|------------|-------------|
| 1 | 47ms | 47ms | 47ms | 2 | ~296ms |
| 2 | 16ms | 17ms | 17ms | 2 | ~309ms |
| 3 | 18ms | 18ms | 19ms | 2 | ~292ms |

## 로그

| Prefix | 용도 |
|--------|------|
| `[cm-client-first-paint]` | 마크·`session_complete` |
| `[cm-client-merge-breakdown]` | merge 단계 breakdown (Playwright 표) |
| `[cm-client-first-paint-lock]` | baseline 초과 **dev `console.warn` 1회/탭** |

## 활성화 (dev)

```js
sessionStorage.setItem("samarket:debug:runtime", "1");
// 측정: lite 네트워크 강제
sessionStorage.setItem("samarket:cm:force-lite-network", "1");
// Playwright 3-run 전용 — idle 대신 즉시 lite merge (프로덕션 기본은 requestIdleCallback)
sessionStorage.setItem("samarket:cm:eager-lite-merge", "1");
```

또는 `NEXT_PUBLIC_SAMARKET_CM_CLIENT_FIRST_PAINT=1`.

## 회귀 시 확인 순서

1. `node scripts/measure-cm-client-first-paint-3run.mjs` — 3 run 모두 PASS 인지.
2. 브라우저 `[cm-client-merge-breakdown]` — `bootstrap_reference_stable`, `unchanged_room_count`, `hydration_overlap`.
3. 클라 patch 경로만 변경했는지 (`applyHomeListPatch`, `lite-merge-gate`, `merge-*-preserve-refs`) — 서버/RPC/unread/realtime 미변경.

## 관련 문서·코드

- `docs/messenger-bootstrap-lite-client-first-paint.md` — 마크 정의
- `lib/community-messenger/cm-client-first-paint-perf.ts`
- `lib/community-messenger/cm-client-merge-breakdown.ts`
- `lib/community-messenger/home/lite-merge-gate.ts`
- `lib/community-messenger/home/merge-bootstrap-lists-preserve-refs.ts`

## 수정 시 금지 패턴

- `bootstrap_apply_full` 에서 방 배열 전체 replace / deep clone
- lite merge 전 `home_sync` flush 로 첫 paint 지연
- critical DOM 이 `bootstrap_response_received` 전에 first_row mark (세션 오염)
- 동일 탭에서 lite fetch 세션 이중 생성으로 breakdown 앵커 유실

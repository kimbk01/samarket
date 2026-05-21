# Messenger bootstrap lite — client first paint (측정 전용)

서버 `GET /api/community-messenger/bootstrap?lite=1` (~300ms) **이후** 화면까지의 클라이언트 병목을 분리한다.  
**서버 API·bundle RPC·trade enrich·unread·response shape 는 변경하지 않는다.**

## 활성화

- `NODE_ENV=development` (기본 on), 또는
- `sessionStorage.setItem('samarket:debug:runtime','1')`, 또는
- `NEXT_PUBLIC_SAMARKET_CM_CLIENT_FIRST_PAINT=1`

브라우저 콘솔 필터: `[cm-client-first-paint]`

## 마크

| Mark | 의미 |
|------|------|
| `bootstrap_fetch_start` | lite `fetch` / 캐시 단락 시작 |
| `bootstrap_response_received` | lite HTTP 응답 수신(또는 캐시 hit) |
| `room_list_state_apply_start` | `setData` 직전 (lite merge) |
| `room_list_state_apply_end` | `data` 커밋 후 `useLayoutEffect` |
| `first_room_row_rendered` | `[data-messenger-chat-row]` DOM |
| `unread_badge_rendered` | `[data-cm-unread-badge]` DOM |
| `skeleton_removed` | `[data-cm-home-skeleton]` 없음 |
| `list_interactive` | 첫 행 `[role=button"]` |

`session_complete` 이벤트에 `deltas_from_response_ms`·PASS/FAIL 포함.

## PASS (클라이언트)

| Metric | Max |
|--------|-----|
| `response_received` → `first_room_row_rendered` | 50ms |
| `response_received` → `skeleton_removed` | 80ms |
| `response_received` → `list_interactive` | 100ms |
| lite 응답 이후 `CommunityMessengerHomeListPane` 리렌더 | ≤ 2 |

서버: `total_api_ms` ~300ms 유지 — `[cm-bootstrap-v2]` 와 별도.

## 3회 측정 절차

1. dev 서버, 로그인 계정으로 `/community-messenger` 진입.
2. Application → Session Storage에서 `samarket.messenger.bootstrap.v1` 삭제(또는 시크릿 창).
3. 하드 리로드 3회 — 각 reload 후 콘솔의 `event:"session_complete"` 1줄 기록.
4. 또는 콘솔: `window.__cmClientFirstPaintDump()`

```bash
node scripts/measure-cm-client-first-paint-3run.mjs
```

## 경로 해석

| `path` | 의미 |
|--------|------|
| `lite_network` | `GET ?lite=1` 네트워크 |
| `lite_cache_hit` | `peekBootstrapCache` 단락 — 네트워크 병목 제외 |

일반 홈 진입은 **critical-first → deferred lite** 이므로, 체감 첫 행은 critical 타이밍이고 `session_complete` 는 **lite merge 이후** 갱신 지연을 본다.

## 병목 분류 (수정 없이)

| 증상 | 분류 |
|------|------|
| `response → apply_end` 큼 | JSON parse·`applyHomeListPatch`·React commit |
| `apply_end → first_room_row` 큼 | 리스트 트리 마운트·`primaryListItems` derive |
| `re_render_count` > 2 | critical seed + lite merge + silent/home-sync |
| `skeleton_removed` 지연 | `listAwaitingCritical` / critical vs lite 순서 |
| `lite_cache_hit` 인데 느림 | 순수 클라 CPU·re-render |

구현: `lib/community-messenger/cm-client-first-paint-perf.ts`  
회귀 lock·baseline: `docs/messenger-client-first-paint-lock.md` · `lib/community-messenger/cm-client-first-paint-lock.ts`

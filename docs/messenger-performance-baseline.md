# 메신저 성능 베이스라인 (lock)

**목적:** Community 메신저 방 진입 구조가 **카카오/텔레그램 계열 체감**에 도달한 시점의 **good-case 스냅샷**.  
이후 변경은 [messenger-performance-architecture.md](./messenger-performance-architecture.md) 계약을 유지한 채 **회귀만 방지**한다.

**측정 환경:** production-like — `npm run build` 후 `npm run start` (dev StrictMode·HMR 수치로 최종 판정 금지).  
**트레이스(선택):** `NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY=1` 또는 `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1`.

---

## Good-case (2026-05, 구조 lock 시점)

| 구간 | warm / reentry | cold (first paint) | 비고 |
|------|----------------|-------------------|------|
| `room_shell_visible_ms` | **2–3 ms** | **2–3 ms** | PASS0 pre-route overlay · shell-first |
| `composer_visible_ms` | **2–3 ms** | **~201 ms** | warm: PASS0 fake frame finalize · cold: 실제 hydrate |
| viewport (message list / PASS2) | — | **~118 ms** | patch-later · subtree persistent |
| zero-fetch reentry (5s TTL) | **foreground_fetch_skipped: true** | — | `CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS` = 5s |

### 판정 요약

- **shell-first:** 라우트 전 overlay에서 shell·composer frame 마일스톤 확정.
- **patch-later:** blocking full bootstrap 없이 critical block → idle secondary.
- **subtree persistent:** same-room React subtree remount 최소화.
- **zero-fetch reentry:** 5초 이내 스냅샷 재사용 시 foreground GET 생략.
- **non-blocking mark-read:** 입장 직후 읽음·부가 작업은 quiet window / priority mode 이후.

---

## 회귀 경고 임계값 (코드)

[`cm-messenger-perf-regression-guard.ts`](../lib/community-messenger/room/cm-messenger-perf-regression-guard.ts) · TTL 상수 [`cm-bootstrap-constants.ts`](../lib/community-messenger/room/cm-bootstrap-constants.ts) — prod에서 `console.warn("[cm-perf-regression]", …)` (1분 dedupe):

| kind | 조건 |
|------|------|
| `room_client_legacy` | `cmReqSrc=room_client_legacy` proceed |
| `shell_visible_slow` | `room_shell_visible_ms` > **200** |
| `composer_visible_slow` | `composer_visible_ms` > **300** |
| `subtree_remounted` | same-room surface remount (Strict Mode 제외) |
| `reentry_foreground_fetch_not_skipped` | 5s 이내 캐시 재진입인데 `foreground_fetch_skipped: false` |

---

## 절대 회귀 금지 (요약)

- `room_client_legacy` 재도입 (정상 경로)
- blocking bootstrap이 shell 이후로 밀림 (shell-after-route)
- same-room **subtree remount** 구조 복귀
- zero-fetch reentry 제거
- `room_client_legacy` · full rerender · route `key={roomId}` 강제 remount

상세: [messenger-performance-architecture.md](./messenger-performance-architecture.md).

---

## 다음 트랙 (메신저 이후)

1. Delivery (배민/요기요 수준)
2. Community feed virtualization
3. Trade detail ultra-fast hydration
4. Global route persistence

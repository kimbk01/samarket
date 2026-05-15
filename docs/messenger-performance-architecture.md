# Community 메신저 — 성능 아키텍처 (lock)

**상태:** 구조 완성 · **유지/회귀 방지** 단계.  
**베이스라인 수치:** [messenger-performance-baseline.md](./messenger-performance-baseline.md)  
**운영 목표 표:** [messenger-performance-targets.md](./messenger-performance-targets.md)

이 문서는 **현재 구현된** shell-first·PASS·zero-fetch·subtree persistence 계약을 고정한다.  
큰 구조 변경보다 regression guard · instrumentation 정리 · perf lock 이 우선이다.

---

## 1. 절대 회귀 금지

| 금지 | 의미 |
|------|------|
| `room_client_legacy` 정상 경로 재도입 | 첫 foreground는 `room_client_block` (critical instant). legacy는 block 실패·TTL 만료 등 **예외 fallback**만. |
| blocking bootstrap 재도입 | shell/composer frame 이 보인 뒤에도 전체 타임라인·enrich 가 첫 페인트를 막지 않음. |
| shell-after-route | shell이 라우트·RSC 이후에만 그려지는 구조 (현재: **pre-route overlay PASS0**). |
| subtree remount | same-room에서 `CommunityMessengerRoomClient`·Phase2·timeline·composer **persistent mount** 파괴. |
| full rerender | 방 재입장 시 전체 트리 초기화·`key={roomId}` 강제 remount. |

---

## 2. PASS0 / PASS1 / PASS2 (shell-first)

```text
[탭/목록 tap]
    → timing session acquire (tap t0)
    → PASS0: pre-route shell overlay (CommunityMessengerRoomShellChromeFrame)
         · header placeholder + viewport placeholder + fake composer (data-cm-composer)
         · shell_visible_ms / composer_visible_ms finalize (overlay paint)
    → route transition + CommunityMessengerRoomClient mount
    → PASS1: header seed + composer frame (Phase2, persistent layer)
    → PASS2: message viewport hydrate (virtual list, patch-only timeline)
    → idle: secondary bootstrap, history, enrich
```

| Pass | UI | 데이터 | 주요 파일 |
|------|-----|--------|-----------|
| **PASS0** | Chrome only, `aria-hidden` overlay | 없음 (zero-fetch) | `CommunityMessengerRoomOpeningOverlayHost`, `CommunityMessengerRoomShellChromeFrame`, `cm-pre-route-shell-instrumentation` |
| **PASS1** | Header + composer shell | placeholder / cached snapshot seed | `CommunityMessengerRoomPhase2`, `CommunityMessengerRoomPhase2Composer` |
| **PASS2** | Message timeline viewport | bootstrap critical block or cache | `CommunityMessengerRoomPhase2MessageTimeline`, `messenger-room-bootstrap-refresh` |

**PASS0 in-route:** pre-route overlay가 이미 shell을 finalize 했으면 in-route PASS0 shell 로그·중복 finalize skip.

---

## 3. Zero-fetch reentry

**목표:** 5초(`CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS`) 이내 같은 방 재진입 시 **foreground bootstrap GET 생략**.

- `evaluateCmRoomForegroundBootstrap` → `action: "skip"` + `reuse_snapshot`
- `logCmRoomReentryZeroFetch` — `foreground_fetch_skipped: true`, `used_cached_snapshot: true`
- Lock: `cm-room-bootstrap-lock.ts` (`resolveForegroundReentryReuse`, `CM_FOREGROUND_BOOTSTRAP_REUSE_MS`)
- 회귀: 5s 이내 캐시인데 `foreground_fetch_skipped: false` → `[cm-perf-regression] reentry_foreground_fetch_not_skipped`

**첫 cold 진입:** `room_client_block` instant+critical. legacy(`room_client_legacy`)는 **fallback only** — 발생 시 regression warn.

---

## 4. Subtree persistence

**목표:** same-room navigation에서 React subtree **remount 최소화**.

- `cm-room-subtree-stability.ts` — surface별 attach generation, Strict Mode 800ms guard
- `registerCmRoomSubtreeReactLifecycle` — room client mount/unmount
- `shouldSkipCmRoomSubtreeSurfaceAttach` — 동일 mount gen에서 shell/viewport/composer attach 1회
- Timeline / Pass3: `hidden` / `contents` + placeholder — pass&lt;2 에도 **unmount 하지 않음**
- Route: room page에서 불필요한 `key={rid}` 제거 (same room remount 방지)
- 회귀: real remount → `[cm-perf-regression] subtree_remounted`

---

## 5. Timing session · sanitize · reuse

**파일:** `cm-room-entry-timing-session.ts`

| 개념 | TTL / 규칙 |
|------|------------|
| Tap emit sanitize | `CM_ROOM_ENTRY_TAP_TTL_MS` (3s) — stale metric drop |
| Session reuse | `CM_ROOM_SESSION_REUSE_TTL_MS` (15s) — completed session 재사용 |
| Post-freeze hold | `CM_ROOM_SESSION_POST_FREEZE_HOLD_MS` (3s) |
| Strict acquire guard | 120ms — double acquire 억제 |

- `acquireCmRoomEntryTimingSession` — nav_tap · subtree_mount · session_reuse
- `resetCmRoomEntryTraceSession` — **finalized** shell/composer 마일스톤 보존 (phase1 mount가 pre-route 값 삭제하지 않음)
- `cm-room-entry-instrumentation.ts` — finalize 후 overwrite 금지

---

## 6. Room priority mode · quiet window

**Priority mode** (`cm-room-entry-priority-mode.ts`): 입장 직후 홈 sync·monitoring·trade meta·analytics·unread badge 등 **일시 정지** — 메인 스레드·네트워크를 shell/composer/viewport에 양보.

**Quiet window** (`cm-room-entry-timing.ts`, `CM_ROOM_ENTRY_QUIET_WINDOW_MS` = 500ms): tap 직후 저우선순위 작업 defer · resume 후 실행 카운트.

**Patch-only hydration** (`cm-room-entry-priority-mode.ts`): bootstrap 응답이 기존 snapshot 대비 **diff/patch** 만 적용 — full replace로 timeline 전체 rerender 방지. 로그: `[cm-room-bootstrap-patch-only]` (verbose).

---

## 7. Bootstrap · non-blocking mark-read

- **Foreground:** `messenger-room-bootstrap-refresh.ts` + `cm-room-bootstrap-lock.ts`
- **Critical block:** `cmReqSrc=room_client_block` — seed messages + minimal member
- **Secondary:** rAF×2 후 idle queue — full enrich (첫 페인트 차단 금지)
- **Silent / realtime:** priority mode 중 realtime-trigger silent skip 가능
- **Mark-read:** `use-messenger-room-open-mark-read-effect.ts` — 입장 정렬·비차단 (blocking bootstrap에 묶지 않음)

---

## 8. Instrumentation (prod vs debug)

### Production에 남기는 것

- `[cm-perf-regression]` — `console.warn`, 60s dedupe ([`cm-messenger-perf-regression-guard.ts`](../lib/community-messenger/room/cm-messenger-perf-regression-guard.ts))
- subtree remount · legacy bootstrap · threshold 위반

### Verbose (dev 또는 trace env)

`cmMessengerPerfVerboseLog` — 다음 태그 등:

- `[cm-room-entry-v2]`, `[cm-cold-entry-path]`, `[cm-pre-route-shell]`
- `[cm-room-subtree-stability]`, `[cm-room-bootstrap-lock]`, `[cm-room-reentry-zero-fetch]`
- `[cm-room-timing-session]`, `[cm-room-entry-quiet-window]`

**켜기:** `NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_ENTRY=1` · `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1`  
**개발:** `NODE_ENV=development` 시 verbose 기본 on.

---

## 9. 관련 코드 인덱스

| 영역 | 경로 |
|------|------|
| Pre-route overlay | `components/community-messenger/room/CommunityMessengerRoomOpeningOverlayHost.tsx` |
| PASS0 chrome | `components/community-messenger/room/CommunityMessengerRoomShellChromeFrame.tsx` |
| Room client | `components/community-messenger/CommunityMessengerRoomClient.tsx` |
| Phase2 shell | `components/community-messenger/room/CommunityMessengerRoomPhase2.tsx` |
| Entry instrumentation | `lib/community-messenger/room/cm-room-entry-instrumentation.ts` |
| Regression guard | `lib/community-messenger/room/cm-messenger-perf-regression-guard.ts` |
| Mobile viewport | `docs/community-messenger-mobile-room-viewport.md` |
| Realtime policy | `docs/messenger-realtime-policy.md` |

---

## 10. 최종 판정

현재 Community 메신저 방 진입은:

- **shell-first** (PASS0 overlay)
- **patch-later** (secondary idle enrich)
- **subtree persistent**
- **zero-fetch reentry** (5s TTL)
- **non-blocking mark-read**

까지 완료되어, 단순 CRUD 채팅이 아닌 **카카오/텔레그램식 체감 구조** 단계에 도달했다.  
이후 메신저 작업은 기능 확장보다 **회귀 방지·베이스라인 유지**를 우선한다.

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

---

## 11. MP-AUDIT 핫패스 lock (회귀 방지)

**자동 검증:** `npm run verify:messenger-hot-path-contract`  
**런타임 감사(3회):** `node scripts/measure-messenger-parity-audit.mjs` — 산출 `docs/perf/messenger-parity-audit-latest.json`

| ID | 금지·필수 | 의미 |
|----|-----------|------|
| MP-AUDIT-1 | warm cache → `bootstrap_full_seed` 승격 | 첫 홈 진입 `Failed to load` 고정 방지 |
| MP-AUDIT-2 | 홈 클라 bootstrap fetch ≤ **2** (`home_bootstrap_client_fetch_total`) | warm+foreground 중복 GET 금지 |
| MP-AUDIT-3 | 텍스트 POST bump **`after()`** | ACK 에 bump·배지 RTT 합산 금지 |
| MP-AUDIT-4 | atomic send **RPC 단일** — 사전 `loadTradeProductChatExitSnapshotForMessengerRoom` 금지 | 거래 가드는 `community_messenger_send_text_message` 에만 |
| MP-AUDIT-5 | `list_prefetch`·`room_client_block` **single-flight 합류** | `room_bootstrap_get_count` 과다·primed skip 누락 금지 |
| MP-AUDIT-6 | POST canonical resolve **parse·rate·phone 과 병렬** | 멤버십 왕복을 ACK 직전 직렬 대기에 두지 않음 |
| MP-AUDIT-7 | send POST **auth·parse·params 병렬** + service import 선시작 + phone verified **positive cache** | ACK 직전 profiles SELECT·번들 로드 직렬 대기 금지 |
| MP-AUDIT-8 | `community_messenger_send_text_message` — non-trade `product_chats` 스킵·insert 경로 participants 단일 스캔·client_message_id 인덱스 | RPC ACK 왕복·중복 스캔 금지 |
| MP-AUDIT-9 | `display_room_messages_ready` — **4s setTimeout fallback 금지** (rAF×2 + ≤480ms safety) | merge→display 인위 지연 금지 |
| MP-AUDIT-10 | pass2 row commit 시 **FMR + display_ready** (heavy 대기 금지) | merge→display ≤100ms 목표·FMR null 금지 |
| MP-AUDIT-13 | send RPC insert 경로 **participants 선조회 제거** — unread `UPDATE … RETURNING` 으로 `recipient_user_ids` | ACK 전 participants 이중 스캔 금지 |
| MP-AUDIT-13b | POST send 응답 **`x-samarket-send-*-ms`** 헤더 | 클라 RTT 와 서버 handler 분리 관측 |
| MP-AUDIT-14 | atomic send **postAckEffects** — notify·mirror·hub invalidate 는 route **`after()`** 만 | ACK handler 에 in-app notify·동기 invalidate 금지 |

### 런타임 목표 (H축 — 체크시트 `[x]` 별도 합목)

| 지표 | 목표 | 현재 베이스라인 |
|------|------|----------------|
| `x-samarket-send-handler-ms` (서버 handler) | ≤ 200ms prod warm | **prod warm p95 196ms** (min 42 · max 196, 6샘플, MP-AUDIT-14, `docs/perf/messenger-ack-warm-prod-latest.json`) |
| `ack_ms` (클라 왕복) | ≤ 200ms (참고) | prod warm p95 **354ms** — RTT·클라 스택 별도 축 |
| `ack_ms` (dev warm) | — | dev warm **159–318ms**, avg≈240 (MP-AUDIT-7/8 후) |
| `home_bootstrap_client_fetch_total` | ≤ 2 | 2 (PASS) |
| `room_bootstrap_get_count` | ≤ 1.5 avg | ~1.3 (PASS) |
| `failed_count` (홈 첫 진입) | 0 | 0 (PASS) |

**기능 정책 불변:** `messenger_voice_*`·통화 게이트·거래 가드 **동작**은 속도 작업으로 바꾸지 않는다. 위 표는 **구조·왕복 수** lock 이다.

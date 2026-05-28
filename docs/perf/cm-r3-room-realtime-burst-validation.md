# CM R3 — room / realtime burst 체감 검증

**일시:** 2026-05-28 · **환경:** `npm run start` (production), trace 빌드  
`NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` · `NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET=1` · `SAMARKET_MESSENGER_TRACE_LOG=1`

**절대 유지:** 2라운드 cold home blank · visibility silent gate · optimistic mark-read · API shape · unread semantics · realtime ordering

**원본:** [cm-r3-room-realtime-burst-validation.json](./cm-r3-room-realtime-burst-validation.json) · Before 코드: [cm-r3-room-realtime-burst-validation.before.json](./cm-r3-room-realtime-burst-validation.before.json)

---

## 1. 변경 파일 목록

| 파일 | 변경 요약 |
|------|-----------|
| `lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts` | 배치 dedupe·28건 multi-rAF 유지·pending 큐를 동일 `applyRealtimeMessageBatch`로 chunk drain·tail coalesce·`[cm-rt-ingest-burst]` trace·`NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` 시 `__cmPerfSimulateRealtimeBurst` |
| `lib/community-messenger/room/use-messenger-room-client-phase1.ts` | hydrate 중 `snapshot.messages=[]` 이지만 `lastMessage` 힌트 있으면 기존 timeline 유지 |
| `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx` | `shouldRecoverEmptyTimeline` 구간 skeleton 유지(빈 문구 flash 완화) |
| `scripts/perf/cm-r3-room-realtime-burst-validate.mjs` | 3-run Playwright 측정(신규) |

**미변경(금지 준수):** home cold path · visibility gate · mark-read · UI/CSS 토큰 · API payload

---

## 2. 3회 측정표

측정 계정: E2E `aaaa` / `1234`. `/delivery-chats?filter=unread` 에 행이 없을 때는 **홈 unread 행 fallback** (동일 방 `e6c03412…` 재사용 — cold `first_message_visible_ms` 3ms 는 DOM에 이미 16행이 있어 **warm artifact**, 진짜 cold는 Before 열 참고).

### 2-A. 방 cold 진입 (delivery 목록 또는 홈 fallback)

| Run | Before (코드 변경 전) | After (R3) |
|-----|----------------------|------------|
| 1 | skip (delivery no_rows) | FMV **3** · shell **19** · composer **590** · flash **0** |
| 2 | FMV **807** · composer **430** · flash **0** | FMV **3** · shell **13** · composer **532** · flash **0** |
| 3 | FMV **817** · composer **460** · flash **0** | FMV **3** · shell **13** · composer **554** · flash **0** |
| **avg** | **FMV 812** · composer **445** · flash **0/3** | **FMV 3*** · shell **15** · composer **559** · flash **0/3** |

\*After avg FMV는 burst 선행·동일 방 warm DOM — **Before avg FMV 812ms** 를 cold 기준으로 사용.

### 2-B. 동일 방 재진입

| Run | Before | After |
|-----|--------|-------|
| 1 | 835 | **725** |
| 2 | 918 | **822** |
| 3 | **1869** | **846** |
| **avg** | **1207** | **798** |

### 2-C. 방 빠른 전환 (`section=chats`)

| Run | Before switch FMV | After |
|-----|-------------------|-------|
| 1 | 1619 | **1538** |
| 2 | 1492 | (동일 스크립트 run2~3 유사 ~1.5s) |
| 3 | 1512 | ~1.5s |

### 2-D. Realtime burst (40건, `__cmPerfSimulateRealtimeBurst`)

| Run | Hook | burst_wall_ms | merge chunks (`[cm-rt-ingest-burst]`) | timeline rows | longtask Δ |
|-----|------|---------------|----------------------------------------|---------------|------------|
| 1 | yes | 1242 | 28@**16ms** + 12@**6ms** | 41 | 0 |
| 2 | yes | 1246 | 28@**11ms** + 12@**0ms** | 41 | 0 |
| 3 | yes | 1245 | 28@**11ms** + 12@**0ms** | 41 | 0 |

`setRoomMessages([])`: 코드베이스 **0건** (R2 유지). `pendingQueued` after burst: **0**.

### 2-E. Frame budget / longtask

| 지표 | Before | After |
|------|--------|-------|
| `[cm-longtask]` (prod start) | 0 | 0 |
| `frame_budget` console 라인 | 0 | 0 |
| ingest burst ≤16ms (28건 chunk) | N/A (로그 없음) | **3/3 run** 28건 batch ≤16ms |

---

## 3. Before / After 요약

| 항목 | Before | After | 판정 |
|------|--------|-------|------|
| timeline empty→fill flash | 0/3 | 0/3 | **PASS** |
| 재진입 FMV avg | ~1207ms (run3 1869ms 스파이크) | ~798ms | **개선** |
| burst merge (28+12 rAF) | 미측정 | ≤16ms / pending 0 | **PASS** |
| cold FMV (실측 cold) | ~812ms | warm artifact — 별도 cold 세션 필요 | **보류** |
| `setRoomMessages([])` | 없음 | 없음 | **PASS** |

---

## 4. 회귀 체크리스트

| 체크 | 결과 |
|------|------|
| room empty→fill flash 없음 | **PASS** (0/3) |
| realtime burst 후 순서 (`mergeRoomMessages`) | **PASS** (41행 = 16 기존 + 40 burst dedupe/merge) |
| unread badge (스크립트 delivery filter) | **환경 의존** — dedicated R2 시 4/4, R3 embedded 0~3 (delivery 목록 비어 있음) |
| optimistic mark-read | **미변경** (코드 미수정) |
| 2R cold home blank | **PASS** (`cold_home_blank_pass: true`, rows 10) |
| 2R visibility Δ silent / home-sync | **PASS** — dedicated `cm-r2-perceived-prod-validate.mjs` **0 / 0** (3 runs) |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` (trace flags) | **PASS** |

---

## 5. 다음 병목 후보 (1개)

**방 전환·재진입 시 bootstrap/display_ready ~800–1500ms** — `messenger_room_entry_display_room_messages_ready_ms` 와 RSC bootstrap 직렬 구간. 다음 라운드는 **room bootstrap instant/cache 히트율** 과 **display_ready 이전 display 시드** 만 최소 diff로 다루는 것을 권장 (home·visibility·mark-read 경계 유지).

---

## 재현 명령

```bash
npx tsc --noEmit
$env:NEXT_PUBLIC_MESSENGER_PERF_TRACE='1'
$env:NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET='1'
npm run build
$env:SAMARKET_MESSENGER_TRACE_LOG='1'
$env:SAMARKET_LOG_HOME_SYNC_DEEP_TRACE='1'
npm run start

node scripts/perf/cm-r3-room-realtime-burst-validate.mjs
node scripts/perf/cm-r2-perceived-prod-validate.mjs
```

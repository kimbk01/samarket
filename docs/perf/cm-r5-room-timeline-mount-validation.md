# CM R5 — Phase2 timeline mount prod-like 실측 검증

**캡처:** 2026-05-28 (trace build + `npm run start` + Playwright 3-run)  
**코드 변경:** 없음 (측정·문서만)  
**판정:** **NEEDS_MORE_WORK**

---

## 1. R4 vs R5 실측표

| 지표 | R4 prod | R5 prod | Δ | PASS 목표 |
|------|---------|---------|---|-----------|
| cold `first_message_render_ms` | **897.5** | **775.5** | **−13.6%** | ≤500ms 또는 −30% |
| cold `display_ready_ms` | 897.5 | **774** (run2–3 avg) | −13.7% | FMR과 분리 |
| warm 재진입 (DOM FMV probe) | 988.7 | **924.7** | −6.5% | ≤150ms 또는 −50% |
| cold DOM FMV probe | 6* | **3.5** | — | — |
| `room_shell_visible_ms` | 13.7 | **14** | ≈0 | — |
| `composer_visible_ms` | 562.7 | **676** | +20% | — |
| empty flash | 0/3 | **0/3** | ✓ | 0/3 |
| burst chunk | 28+12 | **28+12** | ✓ | 유지 |

\*R4 cold FMV probe avg (run2–3만 유효)

**해석:** R5 구조 수정(Phase2Body defer 제거·seed direct·heavy idle)으로 **FMR은 R4 대비 약 14% 개선**되었으나, **500ms / −30% 목표 미달**. warm 재진입도 **150ms·−50% 미달**. DOM 첫 행 probe(~3ms)와 FMR(~776ms) **괴리는 R4와 동일 패턴** — 메트릭 게이트가 여전히 heavy/display 경로에 묶임.

---

## 2. Mount breakdown 표

| 필드 | R5 수집 |
|------|---------|
| `phase2_body_mount_ms` | **미수집** |
| `timeline_component_mount_ms` | **미수집** |
| `timeline_first_row_dom_ms` | **미수집** |
| `virtualizer_ready_ms` | **미수집** |
| `heavy_live_mount_ms` | **미수집** |
| `hydration_pass_at_seed` | **미수집** |

**원인:** `[cm-room-r5-mount-breakdown]`이 `console.debug`로만 emit → Playwright `page.on('console')` 기본 수집 대상 아님. 3-run 모두 `logs.cmRoomR5Mount: []`.

**대안(다음 라운드, 코드 변경 시):** `console.info` 승격 또는 `window.__cmR5MountBreakdown` + 스크립트 `page.evaluate` 읽기 (측정 전용).

---

## 3. FMR source 분포

| source | 비율 |
|--------|------|
| seed / bootstrap / virtualizer / unknown | **미수집** (breakdown 로그 0건) |

---

## 4. `display_ready` blocker 분석

| 항목 | 관측 |
|------|------|
| `display_ready_blocker` 로그 | **0건** |
| FMR vs `display_ready_ms` (run2) | 728 vs **727** (Δ1ms) |
| FMR vs `display_ready_ms` (run3) | 823 vs **821** (Δ2ms) |
| `phase2BodyDefer` 제거 확인 | 로그로 **불가**; FMR·display 여전히 동시 finalize |
| DOM vs FMR (run2–3) | DOM **3–4ms**, FMR **728–823ms** |

**결론:** Phase2Body 즉시 mount는 **FMR ~122ms 단축**에 기여한 것으로 보이나, **display_ready와 FMR 분리·`fmr_source=seed` 증가는 실측으로 확인 불가**. 병목은 여전히 **~700ms 구간**(composer ~500–680ms 이후 FMR).

---

## 5. 회귀 체크리스트

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | **PASS** |
| `npm run build` (trace) | **PASS** |
| empty flash | **0/3 PASS** |
| burst 28+12 | **3/3 PASS** |
| R2 visibility (`cm-r2-perceived-prod-validate.mjs`) | **0/0 PASS** |
| R3 embedded visibility (참고) | silent Δ3, home_sync Δ2 (flaky) |
| `cached_seed_hit` / `bootstrap_cache_hit` | **0** (R4와 동일 under-count) |
| unread / mark-read / ordering | 자동 미검 — 수동 스모크 권장 |

---

## 6. 최종 판정

### **NEEDS_MORE_WORK**

| # | 기준 | 결과 |
|---|------|------|
| 1 | warm FMR ≤150ms 또는 −50% | **FAIL** (924.7ms, −6.5%) |
| 2 | cold FMR ≤500ms 또는 −30% | **FAIL** (775.5ms, −13.6%) |
| 3 | empty flash 0/3 | **PASS** |
| 4 | `phase2BodyDefer` 제거 확인 | **미검증** |
| 5 | burst 28+12 | **PASS** |
| 6 | R2 visibility 0/0/0 | **PASS** (전용 스크립트) |
| 7 | build/tsc | **PASS** |

**PARTIAL 성과:** cold FMR **~122ms 개선**, burst·empty flash·R2 visibility 유지.

---

## 7. 다음 병목 (1개)

**`MessengerRoomPhase1TimelineHeavyHost` / virtualizer ready** — Phase2Body는 앞당겨졌으나 FMR이 여전히 `display_room_messages_ready`·heavy bundle commit(~700ms+)에 동기화됨. R6: heavy attach를 FMR 이후로 더 분리하거나, direct seed paint와 virtualizer **upgrade** 경로를 메트릭·DOM 모두에서 일치시키기.

---

## 부록: 실행 환경

```text
npx tsc --noEmit                          → PASS
NEXT_PUBLIC_MESSENGER_PERF_TRACE=1 build  → PASS
SAMARKET_MESSENGER_TRACE_LOG=1 start
node scripts/perf/cm-r3-room-realtime-burst-validate.mjs
node scripts/perf/cm-r2-perceived-prod-validate.mjs
```

원시 JSON: [cm-r5-room-timeline-mount-validation.json](./cm-r5-room-timeline-mount-validation.json), [cm-r3-room-realtime-burst-validation.json](./cm-r3-room-realtime-burst-validation.json), [cm-r2-perceived-latency-prod-validation.json](./cm-r2-perceived-latency-prod-validation.json)

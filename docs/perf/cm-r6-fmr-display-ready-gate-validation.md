# CM R6 — FMR / display_ready 게이트 분리

**상태:** 구현 완료 · 1차 prod 측정(부분) · **재빌드 후 재측정 권장**  
**판정:** **PARTIAL** (게이트 분리·계측 수집 OK, cold DOM 행 flaky·FMR 목표 미달)

## 1. 변경 파일

| 파일 | 역할 |
|------|------|
| `lib/community-messenger/room/cm-room-r6-display-ready-instrumentation.ts` | **신규** — DOM FMR vs heavy display_ready 분리, `console.log` + `__cmPerfEvents` |
| `lib/community-messenger/room/cm-room-r5-timeline-mount-instrumentation.ts` | `console.log` (Playwright 수집) |
| `components/.../CommunityMessengerRoomClientPhase2Body.tsx` | virtualizer layoutEffect **FMR 제거** |
| `components/.../CommunityMessengerRoomPhase2MessageTimeline.tsx` | DOM 시 `recordCmRoomDomFirstMessageVisible`, `timelinePaintMessages` 시드 paint |
| `lib/.../use-messenger-room-client-phase1.ts` | heavy ready **DOM 이후** 스케줄 |
| `lib/runtime/samarket-runtime-debug.ts` | `MESSENGER_PERF_TRACE` 시 phase 기록·E2E mirror |
| `scripts/perf/cm-r3-room-realtime-burst-validate.mjs` | R6 로그·phase·`__cmPerfEvents` 수집 |

## 2. R5 vs R6 (1차 실측 2026-05-28)

| 지표 | R5 | R6 (1차, run2–3 cold) | 비고 |
|------|-----|------------------------|------|
| `first_message_render_ms` | **775.5** | null* | *cold probe `final_message_rows:0` (flaky) |
| `timeline_heavy_ready_ms` | _(동일 키 없음)_ | **686–712** | legacy `display_ready`와 동일 시점 |
| `dom_first_message_visible_ms` | 미수집 | **682** (로그 1건, burst 후) | `fmr_gate_reason: dom_intersection` |
| `display_ready_ms` | ~774 | **687–712** | heavy bundle 이후 |
| DOM probe (Playwright) | 3.5ms | run별 0행 다수 | 환경 flaky |
| `[cm-room-r6-display-gate]` | 0건 | **수집됨** | |
| empty flash | 0/3 | **0/3** | |
| burst 28+12 | PASS | **PASS** | |

**구조적 분리:** heavy ready(≈516ms)가 DOM 메트릭(≈682ms)보다 **먼저** 찍힌 샘플 1건 → `scheduleCmRoomTimelineHeavyReadyAfterDom` 으로 **DOM 이후 display_ready 기록** 보강(커밋 반영).

## 3. DOM vs FMR vs display_ready 분해

| 단계 | 의도 시점 | R6 1차 관측 |
|------|-----------|-------------|
| DOM row probe | ~3–50ms | probe 0행 다수 / 로그상 682ms |
| `first_message_visible_ms` / FMR | DOM visible | 로그 `fmr_recorded_ms: 682` |
| `heavy_host_mount_ms` | idle after viewport | ~505ms |
| `virtualizer_ready_ms` | heavy bundle | ~513ms |
| `timeline_heavy_ready_ms` | heavy 완료 | ~516–712ms |

## 4. gate reason (로그 샘플)

| 필드 | 값 |
|------|-----|
| `fmr_gate_reason` | `dom_intersection` |
| `display_ready_gate_reason` | `timeline_heavy_bundle` |
| `was_dom_visible_before_display_ready` | false → **DOM 지연 시 heavy가 먼저** (후속 패치로 DOM 우선 기록) |

## 5. 회귀

| 항목 | R6 1차 |
|------|--------|
| tsc / build | **PASS** |
| empty flash | **0/3** |
| burst 28+12 | **PASS** |
| R2 visibility (embedded) | Δ3/Δ2 (전용 스크립트 미재실행) |
| R6 로그 수집 | **PASS** |

## 6. 판정 · 다음 병목

### **PARTIAL**

- 계측·게이트 분리 코드·Playwright 로그 수집 **달성**
- 체감 목표(FMR ≤50ms warm, cold −30%)는 **1차 cold 0행·DOM 682ms** 로 **미달**
- **재측정:** trace `npm run build` 후 `cm-r3` 3-run, run2–3에서 `dom_first_message_visible_ms` vs `timeline_heavy_ready_ms` 간격 확인

### 다음 병목 (1개)

**타임라인 첫 paint가 heavy bundle attach 전에 `timelinePaintMessages`로 commit 되지 않는 구간** — virtualizer upgrade 전 direct row mount 시점을 entry pass2와 동기화(R7).

## 측정 명령

```powershell
npx tsc --noEmit
$env:NEXT_PUBLIC_MESSENGER_PERF_TRACE='1'
$env:NEXT_PUBLIC_MESSENGER_PERF_TRACE_FRAME_BUDGET='1'
npm run build
$env:SAMARKET_MESSENGER_TRACE_LOG='1'
npm run start
node scripts/perf/cm-r3-room-realtime-burst-validate.mjs
node scripts/perf/cm-r2-perceived-prod-validate.mjs
```

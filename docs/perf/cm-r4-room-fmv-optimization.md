# CM R4 — room bootstrap / FMV 최적화

**구현 요약:** cached seed · hot snapshot · `hydrationPass=3` · primed `setRoomMessages` · peek bootstrap short-circuit · timeline fingerprint merge skip.

**Prod 검증:** 2026-05-28 · trace build · `npm run start` · Playwright 3-run.  
**원본:** [cm-r4-room-fmv-prod-validation.json](./cm-r4-room-fmv-prod-validation.json) · [cm-r3-room-realtime-burst-validation.json](./cm-r3-room-realtime-burst-validation.json) · [cm-r2-perceived-latency-prod-validation.json](./cm-r2-perceived-latency-prod-validation.json)

---

## Prod 검증 — 최종 판정: **추가수정필요**

| 목표 | 결과 |
|------|------|
| warm 재진입 FMV ≤150ms | **미달** — probe avg **988.7ms** (1126 / 1042 / 798) |
| cold FMV/FMR ≤500ms | **미달** — `first_message_render_ms` avg **897.5ms** |
| empty flash 0/3 | **PASS** |
| `cached_seed_hit` / `bootstrap_cache_hit` v2 관측 | **0/39** (계측 시점 이슈, 아래 참고) |
| R2 visibility 0/0/0 (전용 스크립트) | **PASS** |
| R2 cold home blank | **PASS** |
| R3 burst 28+12 chunk | **PASS** (ingest 6 lines / 3 runs) |
| `tsc` / `build` | **PASS** |

---

## 1. 3회 실측표

### Cold 방 진입 (동일 room `e6c03412…`, run2–3은 burst·이전 run으로 DOM warm)

| Run | FMV probe (DOM row) | `first_message_render_ms` | `display_ready_ms` | shell | composer | rows | flash |
|-----|---------------------|---------------------------|--------------------|-------|----------|------|-------|
| 1 | — | — | — | 17 | 557 | 0 | 0 |
| 2 | 4 | 911 | 911 | 12 | 584 | 16 | 0 |
| 3 | 8 | 884 | 884 | 12 | 547 | 16 | 0 |
| **avg** | **6*** | **897.5** | **897.5** | **13.7** | **562.7** | — | **0/3** |

\*probe FMV는 이미 16행이 DOM에 있을 때 측정되어 **과소** — 신뢰 지표는 **`first_message_render_ms` / `display_ready_ms`**.

### Warm 재진입 (목록 → 동일 room URL)

| Run | FMV probe | flash |
|-----|-----------|-------|
| 1 | 1126 | 0 |
| 2 | 1042 | 0 |
| 3 | 798 | 0 |
| **avg** | **988.7** | **0/3** |

### Realtime burst (40건 hook)

| Run | wall_ms | timeline rows | chunk |
|-----|---------|---------------|-------|
| 1–3 | ~1250 | 41 | 28@14–16ms + 12@6ms |

---

## 2. R3 vs R4 FMV 비교

| 지표 | R3 Before | R4 After (본 검증) | Δ |
|------|-----------|---------------------|---|
| warm 재진입 FMV probe avg | **798** | **988.7** | ▲ (측정 경로·동일 방 burst 선행) |
| cold `first_message_render_ms` avg | **~863** | **897.5** | ≈ 유지 (개선 없음) |
| cold FMV probe (warm DOM) | ~812 | 6* | probe만 과소 |
| empty flash | 0/3 | 0/3 | 유지 |
| shell visible | ~15ms | **13.7ms** | 유지 |
| composer | ~445–559ms | **562.7ms** | 유사 |

**해석:** R4 구조 변경으로 **warm DOM에 seed 16행 즉시 존재**(run2–3)하나, **계측상 FMR/display_ready는 여전히 ~880–910ms** — virtualizer·Phase2 commit 축이 FMV 상한. 재진입 probe는 R3 대비 악화로 보이나, 스크립트가 **burst 직후 동일 room**을 재사용하는 warm/cold 혼선 영향 큼.

---

## 3. cache hit 비율

| 필드 | v2 로그 true 비율 | 비고 |
|------|-------------------|------|
| `used_cached_snapshot` | **0/39** | `[cm-room-entry-v2]`가 shell/composer finalize 시점에 1회 emit — bootstrap meta **이후** 설정 |
| `cached_seed_hit` | **0/39** | 동일 |
| `bootstrap_cache_hit` | **0/39** | 동일 |
| DOM seed (16 rows cold run2–3) | **2/3 cold** | 기능은 partial 동작, **관측 미반영** |
| `roomBootstrapTimelineFingerprint` skip | **미수집** | `[cm-room-bootstrap-patch-only]` verbose — Playwright console 미포착 |

---

## 4. 회귀 체크리스트

| 항목 | 결과 |
|------|------|
| R2 cold home blank | **PASS** (`blankFlash=false`, rows>0) |
| R2 visibility Δ silent / home-sync | **PASS** **0 / 0** (3 runs, `cm-r2-perceived-prod-validate.mjs`) |
| R3 burst chunk 28+12 | **PASS** |
| empty→fill flash | **PASS** 0/3 |
| unread / ordering / mark-read / API | 코드 미변경 · 스크립트 미검증 |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` (trace) | **PASS** |

---

## 5. 판정

**추가수정필요** — empty flash·R2 회귀·burst는 유지. **FMV 목표(150ms warm / 500ms cold) 미달.** FMR ~900ms 병목 잔존. v2 `cached_seed_hit` 계측은 emit 순서 수정 또는 `getMessengerHomeVerificationSnapshot` 필드 노출 필요(제품 코드 변경은 별 라운드).

---

## 6. 다음 병목 (1개)

**`first_message_render_ms` ≈ `display_ready_ms` ≈ 900ms** — Phase2 virtualizer 첫 `getVirtualItems()`·heavy bundle mount가 seed paint 이후에도 지연. 다음 후보: **seed 시 `timelineHeavyLive`·viewport mount를 shell pass와 동일 틱으로 당기기**(virtualization 유지, display gating만).

---

## 구현 파일 (R4)

`messenger-room-initial-snapshot-authority.ts` · `fetch-community-messenger-room-bootstrap-client.ts` · `messenger-room-bootstrap-refresh.ts` · `merge-community-messenger-foreground-bootstrap.ts` · `use-messenger-room-client-phase1.ts` · `CommunityMessengerRoomClientPhase2Body.tsx` · `cm-room-entry-instrumentation.ts`

---

## 재현

```powershell
Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
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

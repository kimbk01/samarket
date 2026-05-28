# CM-R10 — virtualizer upgrade commit stall 축소

**라운드**: CM-R10-virtualizer-upgrade-stall  
**상태**: prod-like 측정 완료(3-run, cold 2회 no_rows)  
**기준선**: [cm-r8-seed-rows-stability-validation.json](./cm-r8-seed-rows-stability-validation.json) (commit stall ~2555–2560ms)

## 변경 요약

virtualizer가 `getTotalSize()`/`getVirtualItems()`로 측정된 직후 **즉시** `resolveUseDirectMessengerTimelineLayout`이 virtualized로 바뀌며 DOM·measure·scroll이 한 커밋에 몰리던 경로를 분리했다.

| 단계 | 동작 |
|------|------|
| **scheduled** | heavy live + measured range → `virtualizer_upgrade_scheduled` |
| **metadata** (2× rAF) | direct tail DOM 유지, `getVirtualItems`/`getTotalSize`로 metadata만 준비 |
| **virtualized** (`requestIdleCallback` timeout 48ms) | `holdDirectDom=false` → 1회 DOM 스왑 |
| **commit** | tail 12행만 `measureElement`, 나머지 estimate·skip (`measure_cap_skipped_count`) |
| **done** | `scrollAnchorDeferred=false`, `firstCommitRowsLocked` 해제 |

## 수정 파일

| 파일 | 내용 |
|------|------|
| `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx` | 2단계 upgrade·hold direct·측정 cap·R10 계측·entryLight defer |
| `components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx` | `directLayout` memo·upgrade 시 avatar/link/media defer |
| `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx` | `virtualizer_upgrade_scheduled` 1회 로그 |
| `lib/community-messenger/room/use-messenger-room-trade-dock-scroll-anchor.ts` | upgrade 중 `scrollAnchorDeferred` 스킵 |
| `lib/community-messenger/room/use-messenger-room-store-order-dock-scroll-anchor.ts` | 동일 |

## 필수 계측 이벤트 (`__cmPerfEvents`)

- `virtualizer_upgrade_scheduled` → `virtualizer_upgrade_scheduled_ms`
- `virtualizer_upgrade_metadata` → `virtualizer_row_map_start_ms` / `virtualizer_row_map_end_ms`
- `virtualizer_upgrade_begin` → `virtualizer_upgrade_start_ms`, `virtualizer_upgrade_commit_start_ms`
- `virtualizer_upgrade_commit_done` → `virtualizer_upgrade_commit_end_ms`, `virtualizer_measure_*`, `virtualizer_scroll_anchor_*`, `virtualizer_upgrade_blocker`, `measure_cap_skipped_count`

### `virtualizer_upgrade_blocker` (R10)

`row_map_cost` · `measurement_cost` · `scroll_anchor_cost` · `state_replace_cost` · `heavy_row_component_cost` · `layout_thrash` · `unknown`

## 측정 명령

```powershell
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

## PASS 기준 (R10)

| 항목 | R8 기준 | R10 목표 |
|------|---------|----------|
| commit stall (`commit_begin`→`commit_end`) | ~2555ms | **≥30% 감소** (~≤1788ms) |
| `did_mount_with_zero_rows` | false | 유지 |
| `direct_layout_used` | true | 유지 |
| `rows_replace_count` max | 2 | 감소 |
| R3 burst / R2 visibility | 28+12, 0/0 | 유지 |

## 측정 결과

| run | commit_span_ms | virtualizer_upgrade_blocker | rows_replace_max |
|-----|----------------|----------------------------|------------------|
| 1 | no_rows (cold skipped) | - | 1 |
| 2 | no_rows (cold skipped) | - | 1 |
| 3 | 2549 (`694→3243`) | `unknown` | 2 |

**판정**: **FAIL** (commit stall 30% 감소 기준 미달)

- R8 기준: 2555–2560ms  
- R10 측정: 2549ms (약 0.2% 개선, 목표 30% 미달)
- `virtualizer_upgrade_commit_done.commit_span_ms`: 1ms (upgrade attach 자체는 거의 무비용)
- 병목은 여전히 pre-upgrade 구간(`timeline_rows_prepare`~`first_row_commit_end`)에 집중

## 회귀 체크리스트

- [x] API / bootstrap payload / unread / realtime ordering / mark-read / R2 gate / R3 burst — 코드 경로 미변경
- [x] R4–R8 direct·seed 경로 유지 (`holdDirectDom`은 measured 후 스왑만 지연)
- [x] `tsc --noEmit` PASS
- [x] `npm run build` PASS
- [x] empty flash 0/3, burst 28+12, R2 visibility 0/0

## 다음 병목 (1개)

측정 PASS 후에도 stall이 남으면: **virtualized 전환 후 idle 배치로 head 행 virtual item 확장**(현재 tail 12 cap은 첫 커밋만) 또는 **phase1 `timelineHeavyLive` 부착 시점**과 upgrade scheduled 간격.

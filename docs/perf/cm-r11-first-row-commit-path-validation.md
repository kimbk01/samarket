# CM-R11 — first row commit path 검증

**라운드**: CM-R11-first-row-commit-path  
**측정 시각(UTC)**: 2026-05-28T18:10:40.400Z  
**상태**: 코드 변경 없이 최종 검증/문서 마감

## 1) 변경 파일 목록

- `lib/community-messenger/room/use-messenger-room-client-phase1.ts`
- `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx`

## 2) tsc/build 결과

- `npx tsc --noEmit` → **PASS**
- `npm run build` (trace env) → **PASS**
- `npm run start` (trace env) → **정상 기동 확인**

## 3) R10 vs R11 first row commit span 비교

| 항목 | R10 | R11 |
|---|---:|---:|
| `commit_begin → commit_end` | 2549ms (`694→3243`) | 캡처에서 숫자 미기록(null) |
| `first_row_commit_span_ms` | (신규 계측 없음) | **493ms, 497ms** (유효 2 run 평균 495ms) |
| 감소율(495ms vs 2549ms) | - | **약 80.6% 감소** |

## 4) first row commit path breakdown

### run2 (유효)
- `rows_prepare_start_ms/end_ms`: `995 / 995`
- `row_map_start_ms/end_ms`: `977 / 991`
- `first_row_render_start_ms/end_ms`: `945 / 945`
- `first_row_ref_attach_ms`: `981`
- `first_row_layout_effect_ms`: `982`
- `first_row_dom_query_start_ms/end_ms`: `null / null`
- `first_row_commit_span_ms`: `493`

### run3 (유효)
- `rows_prepare_start_ms/end_ms`: `1039 / 1039`
- `row_map_start_ms/end_ms`: `1018 / 1034`
- `first_row_render_start_ms/end_ms`: `986 / 986`
- `first_row_ref_attach_ms`: `1022`
- `first_row_layout_effect_ms`: `1023`
- `first_row_dom_query_start_ms/end_ms`: `null / null`
- `first_row_commit_span_ms`: `497`

### timelineHeavyLive attach timing
- 이벤트: `timeline_heavy_attach_scheduler`
- 관측: `entry_slice_defer=true`, `scheduler_mode="same_tick_raf"` (run2/run3 모두 확인)
- 해석: R10의 2.5s fallback 대기 경로는 더 이상 스케줄러 기본 경로가 아님

## 5) first_row_blocker 판정

- 수집값: `first_row_blocker="unknown"` (유효 run 2개 모두)
- 판정: blocker 라벨은 아직 확정 실패(계측값은 확보되나 분류 임계 조건 미충족)

## 6) R2/R3 회귀 체크

- `did_mount_with_zero_rows=false` 유지 (유효 run에서 확인)
- `direct_layout_used=true` 계열 유지 (`direct_layout_rows_source="direct:bootstrap"` 관측)
- `rows_replace_count` max: **1** (R10 max 2 대비 증가 없음)
- `empty flash`: 0/3 유지 (`timeline_empty_flash_rate=0`)
- burst: `batchLen 28 + 12` 유지 (duration 23/15/16ms + 0ms)
- R2 visibility: `silent_refresh_delta=0`, `home_sync_delta=0`
- unread/order/mark-read 회귀: 측정 스크립트 에러/회귀 신호 없음

## 7) 최종 판정

**PARTIAL**

- PASS 충족:
  - `tsc` PASS
  - `build` PASS
  - `first_row_commit_span_ms`는 R10 commit stall 대비 30% 이상 감소(약 80.6%)
  - fallback 2.5s 대기 제거 효과(`same_tick_raf`) 확인
  - R2/R3 회귀 조건 유지
- 미충족:
  - `first_row_blocker`가 `unknown`으로 남아 분류 확정 실패
  - `commit_begin→commit_end` 숫자는 이번 캡처에서 null이라 동일 산식 비교가 완전하지 않음

## 8) 다음 병목 1개

- **`first_row_blocker` 분류 정확도 향상**: `first_row_dom_query_*`가 null로 남는 경로(직접 ref/IO 경로)를 계측 경로 통합해 `unknown`을 구조적 분류값으로 전환.

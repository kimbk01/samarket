# CM-R15 — row_not_found 고정 fixture 보강 및 분기 재측정

## 1) 생성/사용한 fixture 목록

- `empty_room` — `perf_r15:empty_room` (`[PERF-R15] empty room`, 메시지 0개)
- `cold_seeded_room` — `perf_r15:cold_seeded_16` (`[PERF-R15] cold seeded 16`, 텍스트 16개)
- `delivery_unread_room` — `store_order:perf_r15_delivery_unread` (`[PERF-R15] 배달 unread fixture`, unread 3)
- `media_room` — `perf_r15:media_room` (`[PERF-R15] media fixture`, image 타입 메시지 포함)
- `fast_switch_room_a` — `perf_r15:fast_switch_a`
- `fast_switch_room_b` — `perf_r15:fast_switch_b`

모든 fixture는 테스트 계정(`aaaa`) 기준 direct_key 네임스페이스(`perf_r15:*` 또는 `store_order:perf_r15_*`)로만 생성/갱신했다.

## 2) 실행 시나리오 목록

- `cold_room_entry`
- `empty_room_entry`
- `delivery_unread_room_entry`
- `media_room_entry`
- `fast_switch_a_b_a`
- `burst_then_reentry`
- `visibility_restore_then_entry`

## 3) row_not_found_* 분포

- `row_not_found_no_rows`: **2**
- `row_not_found_parent_hidden`: **0**
- `row_not_found_query_too_early`: **0**
- `row_not_found_selector_mismatch`: **0**
- `row_not_found_unknown`: **0**

관측된 blocker reason:
- `source=layout_effect query=not_found`: 2

## 4) 미재현 분기 목록

- `row_not_found_parent_hidden`
- `row_not_found_query_too_early`
- `row_not_found_selector_mismatch`

이번 R15 fixture 기준에서는 위 3개 분기가 미재현이었다.

## 5) 회귀 체크리스트

- `npx tsc --noEmit`: PASS
- trace `npm run build`: PASS
- `cm-r15-row-not-found-fixture-validate`: 실행 완료
- `cm-r2-perceived-prod-validate`:
  - `visibility_silent_refresh_delta = 0`
  - `visibility_home_sync_delta = 0`
- `cm-r3-room-realtime-burst-validate`:
  - `timeline_empty_flash_rate = 0`
  - `reentry_empty_flash_rate = 0`
  - `burst 28+12 = 유지`
  - `visibility_silent_delta = 1`, `visibility_home_sync_delta = 2` (비가산 회귀 신호)

## 6) 다음 조치 필요 여부

- **필요**
  - 분기 재현성 관점: `parent_hidden/query_too_early/selector_mismatch`를 강제할 수 있는 fixture 상태(뷰포트 hidden 컨테이너, query 타이밍 제어, selector mismatch 유도)를 별도 실험 harness로 분리해야 한다.
  - 회귀 관점: R3 visibility delta(1/2) 상승 원인을 fixture 추가(방 개수 증가) 영향인지, 별도 home-sync 트리거 노이즈인지 분리 측정이 필요하다.

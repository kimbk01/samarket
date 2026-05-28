# CM-R13 — row_not_found / commit_span null 계측 누락 보정

## 1) 변경 파일 목록

- `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx`
- `docs/perf/cm-r13-row-not-found-instrumentation.md`
- `docs/perf/cm-r13-row-not-found-instrumentation.json`

## 2) null 제거 결과

- `first_row_commit_span_ms` null: **0건** (2/2 이벤트 숫자 기록)
- `rows_prepare_start_ms` null: **0건** (2/2 이벤트 숫자 기록)
- `row_not_found_unknown`: **0건**

## 3) row_not_found 세부 분포

- `row_not_found_no_rows`: 0
- `row_not_found_parent_hidden`: 0
- `row_not_found_query_too_early`: 0
- `row_not_found_selector_mismatch`: 0
- `row_not_found_unknown`: 0

이번 3회 측정에서는 `row_not_found` 경로 자체가 재현되지 않았고, 재현된 경로는 `none_intersection_path` 2건이다.

## 4) commit_span_source 분포

- `direct_row`: 2
- `layout_effect_fallback`: 0
- `query_fallback`: 0
- `no_row_fallback`: 0

## 5) rows_prepare_source 분포

- `finalize_fallback`: 2
- `timeline_rows_prepare_effect`: 0

## 6) 회귀 체크리스트

- `npx tsc --noEmit`: PASS
- trace build(`npm run build`): PASS
- empty flash: 0/3 유지
- burst: 28+12 유지
- R2 visibility: 0/0 유지
- delivery unread badge: 0 유지

## 7) 다음 병목 1개

- `layout_effect + dom_query(not_found)` 경로를 강제로 재현하는 테스트 시나리오가 없어, R13에서 추가한 세부 reason(`row_not_found_*`) 분포를 실측으로 채우지 못함. 다음 라운드는 이 경로 재현 케이스를 먼저 확보해 샘플을 수집하는 것이 우선이다.

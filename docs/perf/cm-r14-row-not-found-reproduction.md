# CM-R14 — row_not_found 강제 재현 시나리오 확보

## 1) 변경 파일 목록

- `scripts/perf/cm-r14-row-not-found-reproduction.mjs`
- `docs/perf/cm-r14-row-not-found-reproduction.md`
- `docs/perf/cm-r14-row-not-found-reproduction.json`

## 2) 현재 상태 요약

- R13 이후 계측 누락(null)은 정리된 상태에서, R14는 **성능 구조 변경 없이 재현 시나리오 확보**만 수행했다.
- `row_not_found`는 7개 시나리오 중 **1개(cold_room_entry)** 에서 재현됐다.
- 재현된 세부 reason은 모두 `row_not_found_no_rows`였다.

## 3) 원인 1개 (코드 역추적)

- `row_not_found`는 `CommunityMessengerRoomPhase2MessageTimeline`에서 `firstRowQueryResult === "not_found"`일 때만 분류된다.
- 세부 분기는 다음 순서로 결정된다.
  - `firstRowRowsCountAtQuery <= 0 && firstRowRowsCountAtLayoutEffect <= 0` → `row_not_found_no_rows`
  - `firstRowParentHidden` → `row_not_found_parent_hidden`
  - `firstRowQueryAttempted && firstRowRowsCountAtLayoutEffect > 0 && firstRowRowsCountAtQuery === 0` → `row_not_found_query_too_early`
  - selector mismatch fallback → `row_not_found_selector_mismatch`
  - 그 외 → `row_not_found_unknown`

## 4) 수정/실행 파일 목록

- 시나리오 실행 스크립트: `scripts/perf/cm-r14-row-not-found-reproduction.mjs`
- 회귀 검증 스크립트: `scripts/perf/cm-r3-room-realtime-burst-validate.mjs`, `scripts/perf/cm-r2-perceived-prod-validate.mjs`

## 5) 수행 내용

- 요청된 7개 시나리오를 R14 전용 스크립트에서 명시적으로 각각 1회 실행했다.
- 시나리오별로 다음 필드를 수집했다.
  - `first_row_query_result`
  - `first_row_blocker_reason`
  - `row_not_found_*`
  - `first_row_rows_count_at_query`
  - `first_row_container_found`
  - `first_row_parent_hidden`
  - `first_row_query_selector`
  - `first_row_commit_span_source`
- 추가로 `tsc/build` 및 R3/R2 회귀를 확인했다.

## 6) 3회 측정 결과 표

| 항목 | Run1 | Run2 | Run3 |
|------|------|------|------|
| R3 empty flash | 0 | 0 | 0 |
| R3 burst | 28+12 | 28+12 | 28+12 |
| R2 visibility silent delta | 0 | 0 | 0 |
| R2 visibility home_sync delta | 0 | 0 | 0 |

## 7) 수정 전/후 비교

- R13: 3회 측정에서 `row_not_found` 미재현.
- R14: 강제 시나리오 실행 후 `cold_room_entry`에서 `row_not_found_no_rows` 재현 확인.
- 나머지 시나리오는 이번 데이터셋에서 미재현(또는 매칭 가능한 room 부재)으로 확인.

## 8) 판정

- **PARTIAL**
  - 달성: 요청한 7개 시나리오 실행, `row_not_found` 재현 1건 확보, 세부 reason 기록 완료
  - 미달: `row_not_found_parent_hidden` / `row_not_found_query_too_early` / `row_not_found_selector_mismatch`는 미재현

## 9) 트랙 유지 / 종료 여부

- **유지**
  - R14 목표(재현 시나리오 확보)는 부분 달성.
  - 남은 세부 reason 재현을 위해 테스트 데이터 fixture 보강이 필요하다.

## 10) 다음 후보 1개

- `delivery unread / empty / media`에 대해 **고정 room fixture**(항상 존재하는 unread, 0메시지, 미디어 포함 방)를 seed하여 R14 시나리오를 동일 조건으로 반복 가능한 상태로 만든 뒤, `row_not_found_*` 미재현 분기를 재측정한다.

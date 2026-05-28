# CM-R12 — first_row_blocker normalization

## 1) 변경 파일 목록

- `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx`

## 2) R11 vs R12 계측 안정성 비교

- R11: `first_row_blocker=unknown` 지속, `first_row_dom_query_*` null 다수, 경로별 기록 불균일
- R12: `first_row_visible_normalized` 이벤트로 경로 통합
  - `first_row_visible_source` 전 run 기록
  - `first_row_query_result` 전 run 기록
  - `first_row_blocker_reason` 전 run 기록
  - `unknown`은 normalized 이벤트 기준 0건

## 3) first_row_visible_source 분포

- `intersection_observer`: 1
- `layout_effect`: 2
- `ref_callback`: 0
- `dom_query`: 0
- `direct_probe`: 0

## 4) first_row_blocker 분포

- `none_intersection_path`: 1
- `row_not_found`: 2
- `unknown`: 0

## 5) first_row_query_result 분포

- `skipped`: 1
- `not_found`: 2
- `found`: 0

## 6) commit span 유지 여부

- R11 기준: `first_row_commit_span_ms` 493 / 497 (avg 495)
- R12 캡처: `first_row_commit_span_ms` 숫자 이벤트 미수집(null)
- 대체 지표(`commit_begin → commit_end`):
  - 관측값: `750 → 819` (약 69ms)
  - R10(2549ms)·R11(495ms) 대비는 개선 방향
- 판정: **first_row_commit_span_ms 자체는 유지 확인 불가(부분 미달)**

## 7) 회귀 체크리스트

- `npx tsc --noEmit`: PASS
- `npm run build`(trace): PASS
- empty flash: 0/3 유지
- burst: 28+12 유지 (run별 duration 7/0, 17/0, 12/0ms)
- R2 visibility: 0/0 유지
- `did_mount_with_zero_rows=false` 유지 (관측 구간)
- `direct_layout_rows_source` direct 경로 유지 (관측 구간)
- `rows_replace_count` max 1 유지
- unread/order/mark-read 회귀 신호 없음

## 8) 다음 병목 1개

- `first_row_visible_source=layout_effect` + `query_result=not_found` 경로에서 `rows_prepare_start_ms`/`first_row_commit_span_ms`가 null로 남는 문제(정규화는 완료됐지만 span 산식 입력이 비어 있음).

## 최종 판정

- **PARTIAL**
  - 달성: unknown 제거, source/query/blocker_reason 정규화, 회귀 없음
  - 미달: `first_row_commit_span_ms` 숫자 수집 안정화

# CM R16 — row_not_found harness + R3 visibility delta 분리

## 1) harness 구현 파일 목록

- `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx`
  - `forced_case`(`parent_hidden` | `query_too_early` | `selector_mismatch`) 추적 필드 추가
  - `localStorage("cm.r16.forceRowNotFoundCase")` / query(`cmR16ForceRowNotFoundCase`) 기반 harness 입력
  - forced case에서 ref/intersection 단축 경로를 차단하고 DOM query 기반 `row_not_found_*` 분기 강제
  - `first_row_visible_normalized`/`first_row_commit_path`/`first_row_dom_query` 이벤트에 `forced_case` 포함
  - `first_row_blocker_reason`에 `forced_case=*` 포함해 reason-케이스 매칭 가능
- `scripts/perf/cm-r16-row-not-found-harness-validate.mjs`
  - fixture 정리/준비 + forced case 재현 + R3 visibility split(3조건) 자동 실행
  - 결과를 `docs/perf/cm-r16-row-not-found-harness-validation.json`으로 기록

## 2) forced_case별 재현 결과

- `parent_hidden` → 재현 성공 (`row_not_found_parent_hidden`)
- `query_too_early` → 재현 성공 (`row_not_found_query_too_early`)
- `selector_mismatch` → 재현 성공 (`row_not_found_selector_mismatch`)
- `row_not_found_unknown` → 0건
- reason 매칭:
  - `forced_case=parent_hidden source=layout_effect query=not_found`
  - `forced_case=query_too_early source=layout_effect query=not_found`
  - `forced_case=selector_mismatch source=layout_effect query=not_found`

## 3) row_not_found_* 분포

- `row_not_found_parent_hidden`: 2
- `row_not_found_query_too_early`: 2
- `row_not_found_selector_mismatch`: 2
- `row_not_found_no_rows`: 0
- `row_not_found_unknown`: 0

## 4) R3 visibility delta 분리 결과

`cm-r16-row-not-found-harness-validation.json`의 `r3_visibility_split` 기준:

- baseline(no fixture): `visibility_silent_delta=3`, `visibility_home_sync_delta=2`
- with fixture: `visibility_silent_delta=5`, `visibility_home_sync_delta=2`
- after fixture room access: `visibility_silent_delta=5`, `visibility_home_sync_delta=2`

판정:

- `visibility_home_sync_delta`는 fixture 유무/접근 여부와 무관하게 고정(2)
- `visibility_silent_delta`는 fixture가 있는 조건에서 상승(3 → 5)하고 fixture 접근 후 동일 유지(5)
- 따라서 R15에서 관측된 visibility delta 흔들림은 **fixture count/fixture presence 영향이 개입**된 것으로 분리됨

## 5) 회귀 체크리스트

- `npx tsc --noEmit`: PASS
- `npm run build` (trace env): PASS
- `node scripts/perf/cm-r16-row-not-found-harness-validate.mjs`: PASS (forced_case 3종 재현, unknown=0)
- `node scripts/perf/cm-r3-room-realtime-burst-validate.mjs`: 실행 완료
- `node scripts/perf/cm-r2-perceived-prod-validate.mjs`: 실행 완료

참고:

- 현재 R3 결과의 `burst_28_plus_12=false`는 R16 harness 스코프(분기 재현/visibility delta 분리) 밖의 별도 이슈로 분리 추적 필요

## 6) 다음 조치 필요 여부

- 필요함(권장):
  1. R17에서 fixture count/fixture direct_key 패턴이 `visibility_silent_delta`에 미치는 경로(특히 home sync fetch/silent refresh count)를 독립 변수 1개로 고정해 재검증
  2. R16 harness는 유지하고, CI/로컬 재현시 `forced_case`별 회귀 스모크(3케이스 + unknown=0)를 반복 체크

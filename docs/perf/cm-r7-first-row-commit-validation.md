# CM R7 — first row commit prod-like 실측 검증

**상태:** prod-like 3-run 측정 완료  
**판정:** **NEEDS_MORE_WORK**

## 1) R6 vs R7 first_row_dom_visible 비교

- R6 기준(cold 샘플): `first_row_dom_visible_ms ≈ 682`
- R7 cold(유효 샘플 1/3): `3233ms`
- 변화량: **+2551ms (+374%) 악화**
- cold 목표(≤500ms 또는 R6 대비 30% 개선) **미달**
- warm 목표(≤150ms 또는 R6 대비 50% 개선) **판정 불가**(warm에서 first_row 계측값 미수집)

## 2) Commit path breakdown (R7 cold runIndex=3)

- `room_open_ms`: 481
- `phase1_seed_available_ms`: 485
- `timeline_mount_begin_ms`: 686
- `timeline_rows_prepare_ms`: 687
- `first_row_commit_begin_ms`: 684
- `first_row_commit_end_ms`: 3232
- `first_row_dom_visible_ms`: 3233
- commit begin→end 구간: **2548ms**

## 3) render_source 분포

- `render_source=bootstrap`: 3회 관측
- 그 외 source: 관측 없음
- 단, first row 자체가 유효 완료된 cold는 1회라 표본이 작음

## 4) direct_layout_used 비율

- 관측된 snapshot 기준: `true 3 / 3 (100%)`
- cold 유효 first-row 완료 기준: `true 1 / 1`

## 5) DOM visible vs heavy ready 순서

- 유효 cold 샘플(run3): `first_row_dom_visible_ms=3233`, `timeline_heavy_ready_ms=3234`
- 순서: **DOM visible이 1ms 먼저 발생**(목표 방향은 맞음)
- 하지만 절대 시간은 3.2s대로 매우 느림

## 6) 회귀 체크리스트

- build: **PASS**
- tsc: **PASS**
- empty flash: **0/3 유지**
- burst: **28+12 유지** (3/3 모두 40=28+12)
- R2 visibility: **0/0 유지** (`cm-r2-perceived-prod-validate`)
- unread/order/mark-read: 자동 스크립트 기준 이상 징후 없음 (`delivery_room_unread`는 3/3 모두 `no_rows`로 skip)

## 7) 종합 판정

**NEEDS_MORE_WORK**

근거:
1. 핵심 지표 `first_row_dom_visible_ms`가 R6 대비 개선이 아니라 크게 악화.
2. cold 3회 중 2회는 `final_message_rows=0`으로 first row 계측 자체가 무효.
3. direct layout / DOM-before-heavy 순서는 성립했지만, 실제 사용자 체감 구간 단축으로 이어지지 않음.

## 8) 다음 병목(1개만)

**단일 병목 제안:** cold 진입 시 `final_message_rows=0`로 시작하는 시드 전달 경로(phase1 seed 준비→timeline 입력) 불안정성.

- 이유: 현재 지연의 대부분은 row commit 자체 최적화보다 “첫 row를 그릴 데이터가 제때 존재하지 않는 상태”에서 발생.
- 다음 라운드는 row-map 미세 최적화보다 먼저, seed 존재/유효성의 cold 3/3 보장을 1차 게이트로 두는 것이 우선.

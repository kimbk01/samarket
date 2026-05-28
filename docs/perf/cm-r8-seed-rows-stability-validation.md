# CM R8 — seed rows 전달 경로 안정화 검증

**상태:** prod-like 3-run 측정 완료  
**판정:** **PARTIAL_PASS_NEEDS_MORE_WORK**

## 1) 변경 파일 목록

- `lib/community-messenger/room/use-messenger-room-client-phase1.ts`
- `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx`
- `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx`

## 2) R7 vs R8 commit stall 비교

- R7 기준(사용자 제공): `commit_begin -> commit_end ≈ 2548ms`
- R8 관측 샘플:
  - run1: `934 -> 3489` => **2555ms**
  - run2: `652 -> 3212` => **2560ms**
- 결론: **stall 구간은 아직 유의미 개선 없음** (R8 핵심은 zero-rows 경로 제거/안정화는 달성, stall은 후속 필요)

## 3) rows lifecycle breakdown

- `phase1_seed_message_count`: 16 (cold run 기준)
- `bootstrap_message_count`: 16
- `display_message_count`: 16
- `final_message_rows_count`: 16로 first non-zero 진입 확인
- `first_nonzero_rows_ms`: 관측 샘플 **954ms / 673ms**
- `direct_layout_rows_source` 변화:
  - 초기: `direct:bootstrap`
  - heavy upgrade 후: `virtualized:virtualizer_upgrade`

## 4) zero_rows mount 여부

- `did_mount_with_zero_rows=true`: **관측 0회**
- `did_mount_with_zero_rows=false`: 관측됨(여러 샘플)
- 결론: R7의 cold `final_message_rows=0` 선마운트 경로는 **재현되지 않음**

## 5) rows_replace_count

- 관측 패턴: `0 -> 1 -> 2`
- 최댓값: `2`
- 해석: first commit 이전 고정으로 초반 `zero -> replace`는 제거됐지만, direct->virtualized upgrade 시점의 replace는 남아 있음

## 6) render_source 분포

- `cm_room_r7_first_row_commit_snapshot` 기준: `bootstrap` 우세
- R8 rows lifecycle(`direct_layout_rows_source`) 기준: `direct:bootstrap` 이후 `virtualized:virtualizer_upgrade`로 전환
- 결론: **초기 렌더 source는 seed/bootstrap 경로 유지**, heavy attach 이후 업그레이드 전환

## 7) 회귀 체크리스트

- `npx tsc --noEmit`: **PASS**
- `npm run build` (trace env): **PASS**
- `node scripts/perf/cm-r3-room-realtime-burst-validate.mjs`: **PASS**
- `node scripts/perf/cm-r2-perceived-prod-validate.mjs`: **PASS**
- `direct_layout_used=true` 유지: **관측됨**
- `empty flash 0/3`: **유지**
- `burst 28+12`: 기존 스크립트 기준 **유지**
- `R2 visibility 0/0`: **유지**
- unread/order/mark-read 회귀: 자동 측정 기준 **미관측**

## 8) 다음 병목 1개만 제안

**단일 병목 제안:** direct layout first commit 이후 `virtualizer upgrade`로 넘어가는 시점의 commit span(약 2.5s) 축.

- 이유: zero-rows 선마운트는 제거됐지만, commit stall은 여전히 `first_row_commit_begin -> end`에서 유지됨.
- 다음 라운드는 `upgrade attach 시점`의 row measure/batch commit 경로 1축만 분리 계측/완화하는 것이 우선.

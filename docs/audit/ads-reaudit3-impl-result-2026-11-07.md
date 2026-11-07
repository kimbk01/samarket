# 광고 3차 구현 결과 (Owner 「설계안대로 진행」 2026-11-07 · 20:00 PHT 기준)

- 브랜치 `fix/ads-reaudit3-admin-ssot` · 커밋 `d64439375` (origin/main `8eef5d1bd` 위) · **main 미반영 · 운영 DB 미적용**
- 설계: `ads-reaudit3-defect-design-2026-11-07.md` · `ads-admin-ssot-design-2026-11-07.md`

## 검증 (코드 PASS 만 · Production·실기 NOT_PROVEN)
| 항목 | 결과 |
|---|---|
| typecheck:build / typecheck:test | PASS / PASS |
| vitest 전체 2,917 파일 | 2,911 PASS · 실패 4 → 3건 수정 후 PASS · 1건(apple-siwa-token) 단독 재실행 PASS(무관 일시 실패) |
| eslint 변경 파일 | 오류 0 |
| verify routes·trade-hot-path·design-system·admin cut a/c/d/e/f/g/j | 전부 PASS |
| 운영 롤백 시험 (ckdosyydvgzqwpbwuhon · 전부 되돌림) | m1-01~09 · r2-210001(M1-02 본문 포함) · r2-210002 · r1-220000 = **12개 ROLLBACK_OK** · 시험 뒤 운영에 새 칸·함수·인덱스 0 확인 |

## 마이그레이션 12개 (적용 순서 = 파일 번호)
200001 D-01 연장 · 200002 D-14 피드 감사 · 200003 D-11 커뮤니티 처리 · 200004 D-13 인덱스 · 200005 D-17 신고 · 200006 D-20① · 200007 D-20② · 200008 D-21 · 200009 D-04 삭제 차단 · 210001 삭제/삭제 취소 · 210002 삭제 표시 광고 재노출 차단(통합 때 추가) · 220000 원장.
**웹은 DB 적용 뒤 main 반영** (연장·피드 정지/재개/종료·삭제·원장이 새 함수를 부름).

## 설계와 다르게 정한 것 (Owner 확인)
1. 보류 결제(포인트 hold·배달/팝업 선결제 SECURED)가 있는 검토 대기 광고는 삭제 거부 → 「먼저 반려(돌려줌) 후 삭제」. 숨기면 환급 경로가 사라지기 때문.
2. 노출 중 사장님 유료 팝업 삭제 거부 — 팝업 종료 환급 함수가 없음(운영 해당 0건).
3. 인트로 초안 삭제는 기존 편집 화면(스토리지 정리 때문) · 게시본만 공용 삭제.
4. 마이 배너 삭제 취소 = 「정지」로 복귀.
5. 운영자 광고(팝업·PTR·운영자 피드·이벤트 배너)는 고객 문의 참조 종류에 넣지 않음 — 고객이 참조할 주인이 없어 권한 검사가 없음. 바로 가기는 `?search=<id>`.

## 원인 확정 · 작업자 잘못
- D-04 원인 = 이전 Claude 세션의 2026-10-29 SQL 직접 삭제(audit_logs `f53a0b99…`) — 결제 확인 없이 캠페인 5행 삭제 → SECURED 고아 4건. 200009 트리거로 재발 차단.

## 남은 것 (승인 필요)
- B: 운영 DB 적용 12개 · W: main 반영 1회 · G: 데이터 정리(`scratchpad/db3/cleanup-d04.sql` D-04 4건 보관 처리 · `grant-operators.sql` 운영자 2명 권한 · 설계 §4 QA 정리 목록) · 실기 1회(Cursor v6).
- 범위 밖 보고만: 「홍보글관리」·「홍보 발송」 등 3개 키(뜻 다름) · 배달 상세 목적지 수정 버튼이 화면에 없음 · 캐시 충전 대기열 제목 하드코딩 · 배달 배너 1건 매장 이름 없음.

## 반영 기록 (2026-11-07 PHT)
- 19:36 운영 DB 마이그레이션 12개 적용(이력 12행) · 19:37 main `d64439375` 반영(Production 빌드 확인 시점 BUILDING — NOT_PROVEN).
- 20:2x G 데이터 정리 (Owner 「데이터 정리 진행」) — 시험 실행(되돌림) 후 실제 실행 · 백업 `scratchpad/db3/backup-g-before.jsonl` 33행:
  | 대상 | 처리 | 결과 |
  |---|---|---|
  | 검토 대기 QA 팝업 5 | 관리자 전이 pending_review→rejected (계약 표에 pending→ended 없음) | rejected 5 |
  | 기간 지난 정지 QA 팝업 6(사장님 1건 = legacy_test 매장 · 결제 SECURED 그대로) | paused→ended | ended 6 |
  | 기간 지난 active·paused 피드 15 | admin_feed_ad_end (미리보기 환급 0 확인 후) | 남은 0 · 포인트 원장 새 행 0 |
  | QA push 배포(이벤트 QA-PUSH-INVALID-muargwa6) | 끄기 | false/disabled |
  | 알림 시드 「홍보」 2 | label_ko → 상위노출 | 「홍보」 남은 0 |
  | D-04 고아 결제 4 | 캠페인 4행 ARCHIVED 로 복원(환급 없음) | 결제 SECURED 4 그대로 · 고아 0 |
  | 운영자 2명 권한 | admin_staff_permissions 저장(기본값 + point) | 2행 |
  - 감사 29행(팝업 11 · 피드 종료 함수 15 · push 1 · 권한 2) + 배달 감사(D-04).
  - 하지 않은 것: 시험 이벤트 행 20건(`[CURSOR-QA-PTR]` 캠페인) — 삭제하지 않음. 캠페인이 종료된 QA 캠페인이라 통계 대상은 그 캠페인뿐.

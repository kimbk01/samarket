# DIBAY CREW REP — SSOT (crew_rep_v2)

**정책 버전:** `crew_rep_v2` (Owner 2026-11-16 「S2 진행해」) · 이전 `manner_trade_v1`(Manner Battery)은 이 문서로 대체한다.
**설계·근거:** `docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md` §4·§7

## 단일 정의
| 관심사 | 권한 |
|---|---|
| 정책 값(가중치·K·상한·기간) | `lib/trust/crew-rep-policy.ts` |
| 계산기(순수 함수) | `lib/trust/crew-rep-calculator.ts` |
| 원장(사건 이력) | `trust_events` — 지우지 않고 `status=reversed` 로만 되돌림 |
| 기록기 | `recordTrustEvent` / `reverseTrustEvent` (`lib/trust/trust-event-ledger.ts`) · 참여도 동기화기 `lib/trust/crew-rep-participation-sync.ts`(매일, S3) · 매너·제재 동기화기 `lib/trust/crew-rep-manner-sync.ts`(매일, S4) · 허위 신고 판정 `/api/admin/users/:id/false-reports`(어드민, S4) · 거래 평가 동기화기 `lib/trust/crew-rep-trade-rating-sync.ts`(매일, S5) |
| 투영(읽기 권한) | `member_trust_snapshots` (`manner_battery_percent` = CREW REP 점수, 열 이름은 호환 유지) |
| 점수 이력 | `member_trust_score_history` (service role 만) |
| 매일 재계산 | `/api/cron/crew-rep-daily-recompute` 03:00 PHT (`0 19 * * *` UTC) |
| 화면 표기 | `lib/trust/crew-rep.ts` + `components/trust/CrewRep.tsx` (`82 / 100`, 6단 등급) |

## 계산식
```
축 X = 50 + 50 × (X⁺ − X⁻) / (X⁺ + X⁻ + K_X)      K_T=10 · K_M=20 · K_P=40
CREW REP = 50 + 0.5(T−50) + 0.3(M−50) + 0.2(P−50) − S + 수동조정(합계 ±10)
         → 0~100, 이용 정지 중이면 최대 39
사건 기여 = 기본점 × r(평가자 가중) × w(거래 확인 가중) × d(기간 가중)
d: 0~180일 1.0 · 181~365일 0.5 · 그 뒤 0     날짜·주·월 경계 = PHT
```

## 사건표 (기본점)
- **T 거래 신뢰:** 거래 평가 좋아요 +1.0 · 보통 +0.2 · 아쉬워요 −1.0 (같은 두 회원 30일 1회·평생 3회) · 거래 사기 확정 −3.0.
  옛 `trade_review_*` 는 같은 규칙(w 1.0). `trade_completed` 는 점수 0 — 깨끗한 활동 월의 상호작용으로만 인정.
- **M 매너·약속:** 깨끗한 활동 월 +1.0(끝난 달, 상호작용 1건 이상·확정 위반 0) · 모임 참석 +0.5(하루 1) · 모임 노쇼·주문 노쇼·신고 확정·허위 신고 확정 −2.0.
- **P 참여도(감점 없음, 주 +5 상한):** 라운지 글 +0.5(하루 2) · 내 글 댓글 +0.1×r(반응자 1명 1회, 글당 +1.0) · 댓글 작성 +0.1(하루 5) · 받은 좋아요 +0.05×r(반응자 1명 1회, 하루 +1.0) · 매장 후기 +0.3(하루 2).
- **S 제재(직접 감점):** 경고 −3 · 기능 제한(chat_ban·community_restriction) −8 · 정지(temp_suspend·permanent_ban) −15.
- **점수 아님:** 신고 접수·반려된 신고·글 수·조회수·주문 수·매장 평점·포인트.

## 평가자 가중 r
1.0 = 가입 14일↑·전화 인증·평가자 점수 40↑ · 0.5 = 셋 중 하나 부족 또는 평가자 모름(옛 기록) ·
0 = 가입 3일 미만·점수 20 미만·정지 중·같은 기기 사용 이력·평가 대상 차단 중 ·
아쉬워요 자주(준 평가 5건↑ 중 60%↑) → 아쉬워요 ×0.5 · 서로만 주고받는 고리(양방향 3회↑·다른 평가자 없음) → ×0.25.

## 단계 상태
S1 표기(#364) · S2 계산기·이력·매일 재계산(#366) · S3 참여(#367) · S4 매너·제재·허위 신고(#369) · S5 거래 평가·D14·D15(#371) · S6 내 상세·판매자 시트(#372) · S7 어드민 정책 안내·죽은 스위치 정리.
어드민 안내 = 설정 「CREW REP 정책」 탭(`components/admin/settings/CrewRepPolicyPanel.tsx`) — 숫자는 이 정책 단일 정의에서 바로 읽는다. 예전 「거래 후기 사용」·「매너 점수 노출」 스위치(D10, 어디에도 연결 안 됨)는 삭제.
**S3 참여도 기록(2026-11-16 00:00 PHT 이후 원천만):** 매일 예약 작업이 원천을 읽어 인정 사건을 기록하고, 숨김·삭제·좋아요 취소·후기 숨김이면 되돌린다(숨김 해제면 다시 인정).
라운지 글 = 직접 쓴 글(`origin_kind=member`)·72시간 유지·다른 회원 반응 1개 이상 · 댓글 = 남의 글·10자 이상·24시간 유지 · 받은 좋아요 = 자기 좋아요 제외 ·
매장 후기 = 완료 주문·완료 후 14일 안·10자 이상 또는 사진·본인 매장 제외·숨김이면 되돌림.
**S4 매너·제재 기록(2026-11-16 00:00 PHT 이후 결정만):** 신고 접수는 사건이 아니다.
- 제재 = `sanctions`(거래·라운지·모임 이용 제한이 모두 여기로 모임) — 철회면 되돌림.
- 신고 확정(M −2) = 운영자가 콘텐츠를 숨김·삭제했고 같은 신고로 제재가 나가지 않은 것(제재가 있으면 S 로만). 같은 대상 여러 신고 = 1건.
- 거래 사기·노쇼(T −3) = 사유가 사기(거래 신고 fraud)·사기/노쇼/외부 결제(채팅 신고)인 신고 확정, 같은 대상 1건.
- 모임 출석(+0.5)·노쇼(−2) = 끝난 일정에서 모임장·공동모임장이 체크, 일정 주최자 본인 제외, 노쇼는 7일 뒤 반영.
- 허위·악의 신고(신고자 M −2) = 어드민 회원 상세 CREW REP 영역에서 반려·기각 신고를 판정(취소 가능).
- 주문 수령 노쇼: 원천 없음(매장이 손님 노쇼를 확정하는 기능이 없음) — 미구현.
**S5 거래 평가(Owner 2026-11-16 「거래 평가 살리기」):** 구매자 지정·구매 확정 없이 **실제로 대화한 거래 상대끼리만** 양방향 평가.
- 자격(서버 `lib/trade/trade-rating.ts` `evaluateTradeRatingEligibility`): 판매자·구매자 각자 메시지 3개↑(시스템·삭제 제외) · 대화 10분↑ · 판매완료 또는 첫 메시지 3일 뒤부터 30일 안 · 방당 1회 · 같은 기기 이력 없음 · 차단·탈퇴·정지 아님.
- 동시 공개: 양쪽 제출 또는 첫 제출 7일 뒤(매일 예약 작업). 공개 전에는 서로 못 보고 점수 없음.
- 아쉬워요: 아쉬운 태그 1개↑ 필수, 받은 사람 공개 후 14일 안 1회 이의제기 → 어드민 후기 상세에서 인정(제외)·기각(반영). 이의 기간이 지나거나 기각돼야 점수 반영.
- 거래 확인 가중 w: 둘 다 「했어요」 1.0 · 한쪽만 0.7 · 대화만 0.5. 남길 말은 운영자만.
- 권한: `transaction_reviews` 앱 사용자 INSERT·SELECT 정책 삭제(D14·D15) — 서버(service role)만.
- API: `GET/POST /api/trade/product-chat/:roomId/rating` · `POST /api/trade/ratings/:id/dispute` · `GET /api/users/:userId/trade-rating-summary` · 어드민 `POST /api/admin/transaction-reviews/:id/action` (dispute_accept·dispute_reject).
- 원장: `lib/trust/crew-rep-trade-rating-sync.ts`(매일) → `trade_rating_good|normal|bad`. 옛 30건은 v1 원장(`trade_review_*`) 그대로.

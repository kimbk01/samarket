# DIBAY CREW REP — SSOT (crew_rep_v2)

**정책 버전:** `crew_rep_v2` (Owner 2026-11-16 「S2 진행해」) · 이전 `manner_trade_v1`(Manner Battery)은 이 문서로 대체한다.
**설계·근거:** `docs/audit/crew-rep-manner-battery-audit-design-2026-11-16.md` §4·§7

## 단일 정의
| 관심사 | 권한 |
|---|---|
| 정책 값(가중치·K·상한·기간) | `lib/trust/crew-rep-policy.ts` |
| 계산기(순수 함수) | `lib/trust/crew-rep-calculator.ts` |
| 원장(사건 이력) | `trust_events` — 지우지 않고 `status=reversed` 로만 되돌림 |
| 기록기 | `recordTrustEvent` / `reverseTrustEvent` (`lib/trust/trust-event-ledger.ts`) |
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
S1 표기(#364) · **S2 계산기·이력·매일 재계산(이 문서)** · S3 참여 기록기 · S4 매너·제재 기록기 · S5 거래 평가 · S6 상세·판매자 시트 · S7 어드민.
S3~S5 전까지 새 사건 기록기는 없다(기존 원장 + 어드민 수동 조정만).

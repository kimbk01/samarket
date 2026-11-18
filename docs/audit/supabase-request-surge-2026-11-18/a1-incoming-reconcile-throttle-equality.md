# Phase A1 — 수신 목록 reconcile 묶기 · 동등성 (2026-11-18)

- Owner 승인: 「승인 한다, 정확하게 수정」 (2026-11-18)
- 설계: `cursor-root-cause-and-fundamental-fix-2026-11-18.md` Phase A1
- 11-08 보완서 §6 BLOCKED(쿼리 조각 삭제)를 **쓰지 않음**. 대안 「사용자당 N초 1회 묶기」.

## 바뀌는 것

| 항목 | 이전 (`origin/main`) | A1 |
|---|---|---|
| 폴링마다 | reconcile 전체(R1+R2+R3) + L1 중복 stale + 목록 | **N초(30s)에 1회** 전체 reconcile + **매번 목록 1회** |
| L1 중복 | reconcile 직후 `terminalStaleRinging` 재호출 | **제거** (R1이 동일 정리) |
| 실제 ringing 행 정책 필터 | reconcile `incoming_policy` | **force** reconcile 1회(벨 중 동등성 우선) |
| cron stale-cleanup 2분 | 유지 | 유지 |

## 동등성 (11-08 표 대비)

정리 **알고리즘(R1~R3)은 그대로**다. 달라지는 것은 **호출 빈도**뿐이다.

| # | 상황 | 판정 |
|---|---|---|
| 1~3, 6성공, 8발신, 9 | 이전과 동일 | 동등 |
| 4 첫 정리 실패 후 재시도 | 같은 요청 안 재시도는 reconcile 1회분. 실패 시 게이트 미기록 → 다음 폴링·force·cron | 시점 ≤N초 또는 ≤2분(cron) — **허용된 시점 차이** |
| 5 두 정리 사이 만료 | L1 제거로 「사이」 창 축소. 폴링 스킵 구간은 다음 reconcile/cron | 시점 ≤N초 |
| 7 active heartbeat 만료 | 폴링 스킵 중이면 ≤N초 또는 cron≤2분 | 시점 차이(설계 허용) |
| 10 경합 | reconcile 1회분 시도 수 — 이전보다 많지 않음 | 동등 이상 |

응답 JSON·HTTP 상태·D1 503 계약 **불변**.

## 속도

- 스킵 구간: 서버 일 ↓ → `/incoming` **응답 빨라짐**
- reconcile 실행 시: 이전과 동일 일(단 L1 1회 제거)

## 실기 (배포 후 · 통화 행렬)

V-1~V-8 + 맥 수신(V-8). 특히 V-5 무응답→부재중·수신 시트 잔존 없음(≤30s+α).

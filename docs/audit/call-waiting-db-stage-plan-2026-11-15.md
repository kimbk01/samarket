# 대기 통화 2단계 — 운영 DB 적용 계획 (2026-11-15 PHT)

> 상태: **운영 적용 완료 2026-11-15 15:55 PHT (Owner 「운영 적용 승인」).** 상위 설계 `docs/audit/call-waiting-stage2-design-2026-11-15.md`.
> 대상: 운영 Supabase(`ckdosyydvgzqwpbwuhon`) — 시험 DB 사용 없음.

## 0. 내 잘못 먼저 (설계 정정)
- 설계 §2-2·DB2 에 「운영 DB 에 발신자별·수신자별 살아 있는 통화 1개 제약(`one_live_per_initiator`·`one_live_per_recipient`)이 있어 대기 통화를 막는다」고 썼다. **틀렸다.**
- 운영 실측(15:5x PHT, `pg_indexes`·`supabase_migrations.schema_migrations`): 두 제약은 **운영에 없다.** 저장소의 `supabase/migrations/20260917140000_caller_live_call_unique.sql`(2026-06-17 `7aa1640cc`)은 **운영에 적용된 기록이 없다.** 운영에 있는 것은 `one_live_per_room`(`20260611160000`) 하나뿐.
- 저장소 파일만 보고 운영 상태로 판단한 것이 원인.

## 1. 정정된 DB 범위
| 설계 항목 | 결론 |
|---|---|
| DB1 `waiting` 열 | **적용** (아래 §2) |
| DB2 수신자 제약 분리 | **불필요** — 나눌 제약이 운영에 없음 |
| DB3 같은 사람 동시 active 금지 | DB 객체 없음 — 서버 WS5 검사로만(설계 그대로) |

## 2. 적용 SQL (`supabase/migrations/20261115075522_cm_call_sessions_waiting.sql`)
```sql
ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS waiting boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.community_messenger_call_sessions.waiting IS '…';
```

## 3. 사전 점검 (운영 · 읽기 전용 · 15:5x PHT)
| 항목 | 값 | 판단 |
|---|---|---|
| 행 수 / 크기 | 8,362행 / 6.6MB | 작음 |
| 지금 살아 있는 통화(ringing·active) | 0 | 적용 순간 영향 없음 |
| `waiting` 열 | 없음 | 새로 추가 |
| 트리거 | `trg_cm_call_session_block_guard` (BEFORE INSERT, 차단 사용자 검사) | 새 열과 무관 |
| RLS | `community_messenger_call_sessions_member_policy` (발신자·수신자·참여자) | 새 열과 무관 |
| Realtime 발행 | `supabase_realtime` 에 포함 | 변경 이벤트에 `waiting` 키가 하나 늘 뿐 — 앱은 모르는 키를 무시 |
| 잠금 | PostgreSQL 17 · 상수 기본값 열 추가 = 표 다시 쓰기 없음, 짧은 잠금 1회 | 통화 0건 시각에 적용 |

## 4. 영향
- 기존 행 전부 `false`, 서버·앱은 아직 이 열을 읽지도 쓰지도 않음 → **동작 변화 없음.**
- 서버 3단계(WS1)가 대기 통화로 울리는 세션에만 `true` 를 쓴다.

## 5. 적용 절차
1. 적용 직전 살아 있는 통화 0건 재확인.
2. Supabase 마이그레이션 적용(`20261115075522_cm_call_sessions_waiting`).
3. 적용 후 대조: 열 존재·기본값·NOT NULL·전체 행 `waiting=false` 개수 = 전체 행 수·`schema_migrations` 기록.
4. 결과 보고(PHT 시각).

## 6. 되돌리기
```sql
ALTER TABLE public.community_messenger_call_sessions DROP COLUMN IF EXISTS waiting;
```
서버 3단계 반영 전이면 영향 없음. 반영 후라면 서버 WS1 을 먼저 되돌린 뒤 실행.

## 7. 범위 밖 (보고만)
- 운영에 「같은 사람(발신자·수신자) 살아 있는 통화 1개」 DB 제약이 없어, 동시에 같은 사람에게 거는 경합은 서버 판정(비원자)으로만 막힌다. 저장소 마이그레이션 `20260917140000` 미적용 상태 — 적용 여부는 이번 범위가 아님.

## 8. 적용 결과 (2026-11-15)
| 항목 | 값 |
|---|---|
| 적용 직전 살아 있는 통화 | 0건 (15:55:07 PHT) |
| 적용 | `apply_migration cm_call_sessions_waiting` 성공 — 운영 기록 버전 `20261115075522` (저장소 파일 이름을 이 버전에 맞춤) |
| 열 | `waiting boolean NOT NULL DEFAULT false` · 설명 등록 |
| 행 대조 | 전체 8,362행 = `waiting=false` 8,362행 (15:55:24 PHT) |
| 동작 영향 | 서버·앱이 아직 이 열을 쓰지 않음 → 변화 없음 |

# 고객센터 문의 재감사 — 증거 원본 (2026-11-27)

조건: 운영 Supabase `ckdosyydvgzqwpbwuhon`, 모든 조회 `begin read only; set local statement_timeout='30s'; … rollback;` · 코드 `origin/main` 45493ecb7 (1차 13bfa8c51, 고객지원 파일 차이 없음 — 바뀐 곳은 `notify-push-dispatcher.ts` 푸시 언어뿐) · 화면·실기기 열지 않음(앱 실행 0회).

## E1 문의 현황
```sql
select status, audience, count(*), sum(case when admin_unread_count>0 then 1 else 0 end), max(created_at)
from support_cases group by 1,2;
```
| 상태 | 대상 | 건수 | admin_unread>0 | 최근 접수 (UTC) |
|---|---|---|---|---|
| RESOLVED | MEMBER | 32 | **6** | 2026-11-14 01:07 |
| RESOLVED | OWNER | 5 | 0 | 2026-09-17 |
| WAITING_USER | MEMBER | 1 | 0 | 2026-10-28 12:40 |

## E2 접수형 전환(11-10) 전후 문의
| 번호 | 상태 | 분야·세부 | admin_unread | requester_unread | 접수 | 첫 답변 | 종료 | 글 | 사건 |
|---|---|---|---|---|---|---|---|---|---|
| SC-100035 | **WAITING_USER** | OTHER·GENERAL | 0 | **2** | 10-28 12:40 | 10-28 12:42 | — | 고객1·어드민2 | 접수·상태변경·재오픈 |
| SC-100036 | RESOLVED | PAYMENT_RECHARGE·OTHER | 0 | 0 | 11-10 00:47 | 00:48 | 00:49 | 고객1·어드민1 | 접수·고객 종료 |
| SC-100037 | RESOLVED | PAYMENT_RECHARGE·OTHER | 0 | 0 | 11-10 01:08 | 01:09 | 01:10 | 고객1·어드민1 | 접수·고객 종료 |
| SC-100040 | RESOLVED | TECHNICAL·APP_CRASH | 0 | 0 | 11-14 01:07 | 01:07 | 11-19 17:36 | 고객1·어드민1 | 접수·고객 종료 |
11-10 이후 3건 모두 `assigned_admin_id` 없음.

## E3 어드민 알림 저장소
```sql
select kind, count(*) from admin_notifications group by kind;
```
request_budget_alert 46 · settlement_commission_review 4 · **고객지원 종류 0건 (전 기간)**.
코드 종류 목록 `lib/admin/notifications/admin-notification-kinds.ts`: 고객지원은 `support_customer_replied`·`support_case_assigned` 둘뿐, 신규 접수 종류 없음.

## E4 고객 알림 (notification_events, type like 'support_%')
| 종류 | 분류 | 건수 | 미읽음 | 최근 |
|---|---|---|---|---|
| support_admin_replied | inquiry_answered | 31 | 2 | 11-14 |
| support_case_resolved | admin_notice | 36 | 8 | 10-28 |
| support_case_created | admin_notice | 27 | 5 | 10-04 (이후 발송 없음 = 계획대로) |
| support_case_assigned | admin_notice | 12 | 5 | 09-24 (이후 없음 = D2 대로) |
| support_case_reopened | admin_notice | 4 | 0 | 10-28 |
| support_customer_replied | admin_notice | 6 | 0 | 09-24 (R13 이전 옛 경로) |

미읽음 20건 중 문의 상태별: RESOLVED 문의 **19건**(resolved 8·created 5·assigned 5·admin_replied 1, 유형별 사용자 1~4명) · WAITING_USER 1건.

## E5 푸시 발송 (notification_deliveries)
support_admin_replied: sent 32 (FCM 22·APNs 8·재시도 2) / skipped 21 (`voip_reserved_for_call_push` 17 = VoIP 토큰은 일반 알림 제외, `no_active_targets` 4). 건너뜀 사유는 정상 규칙 — 결함 아님.

## E6 실시간·권한·함수
- `supabase_realtime` 발행: `support_cases`, `support_messages` 포함.
- RLS: `support_*_admin_select` = `internal.is_platform_admin` = `admin_memberships` 활성 admin·super_admin. 운영 활성 어드민 5명(admin 3·super_admin 2) 전원 해당.
- `support_append_message` 운영 정의: MEMBER/OWNER 글이라도 `p_system_seed=true` 면 ELSE 분기(미읽음 증가 없음) — 저장소 마이그레이션 `20270415120000` 과 같음.
- `support_category_settings` 표 있음, 0행. `support_guidance_entries` MEMBER 활성 2행.
- `notification_events` 에 `display_payload->>'supportCaseId'` 색인 없음(읽음 처리 조회 — 현재 규모 영향 없음, 정보).

## E7 코드 기준선
`npx vitest run lib/support components/support app/api/support app/api/admin/support` → **25 파일 · 218 시험 PASS** (45493ecb7). = 코드 PASS 일 뿐, 위 결함은 시험이 다루지 않는다.

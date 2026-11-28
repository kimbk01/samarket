# RLS 마이그레이션 운영 적용 결과 · 2026-11-28

Owner 「적용 진행」 (2026-11-28) · 대상 운영 `ckdosyydvgzqwpbwuhon` · 마이그레이션 `20271128200000_support_final_audit.sql` (MCP `apply_migration` 이름 `support_final_audit`) · 적용 07:0x PHT · 코드 병합 PR #683 `f3fbaba`.

## 적용 전
- 백업 = `rls-backup-before-apply.sql` (pg_policies 7개 원문). 도우미 함수·인덱스 2개는 없었음.
- 사전 확인: `authenticated` 의 `internal` 스키마 USAGE·`internal.is_platform_admin` EXECUTE = true.

## 적용 뒤 대조 (운영 조회)
| 항목 | 결과 |
|---|---|
| 고객 정책 `support_cases/messages/sessions_requester_select` | 없음 (삭제됨) |
| 어드민 정책 4개 | `( SELECT internal.support_admin_has_support_permission(auth.uid()) )` |
| 활성 어드민 5명 판정 | 5명 모두 true (admin/operator 3 — 저장 권한에 support · super_admin 2) = 앱 `authorityAllows(support)` 와 같음 |
| anon 실행 권한 | false |
| 인덱스 | `idx_support_messages_customer_public_created` · `idx_support_messages_sender_user_created` 생성 |

## 역할 시험 (읽기 전용 트랜잭션 · `set local role authenticated` + JWT sub)
| 사용자 | support_cases | support_messages | support_sessions | support_case_events |
|---|---|---|---|---|
| 고객(문의가 가장 많은 비어드민 회원) | 0 | 0 | 0 | 0 |
| support 권한 어드민(admin/operator) | 38 | 102 | 43 | 121 |

→ D2(고객 직접 조회로 삭제 답변·종료 문의 글 열람) 막힘 = 운영 DB PASS. 고객 화면은 서버 API(service_role)만 써서 영향 없음(코드 확인).

## 확인 못 함 (NOT_PROVEN)
- support 권한 **없는** 어드민의 0행: 운영에 그런 어드민이 0명이라 실제 계정으로 시험하지 못함(함수 식으로만 확인).
- 어드민 실시간(토스트·콘솔 갱신)이 적용 뒤 정상인지 화면 확인.

## 되돌리기
`rls-backup-before-apply.sql` 의 정책을 다시 만들고 `DROP FUNCTION internal.support_admin_has_support_permission(uuid)` (마이그레이션 파일 주석에도 같은 순서, 스키마 `internal.is_platform_admin` 으로 정정).

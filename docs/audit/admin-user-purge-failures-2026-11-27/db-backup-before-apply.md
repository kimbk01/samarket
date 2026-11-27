# 운영 DB 적용 전 정의 백업 (2026-11-27 PHT, 읽기 전용 조회)

- `admin_can_purge_auth_user(uuid)`: 막는 이유 4개 — group_rooms.created_by · group_messages.sender_id · group_audit_log.actor_id · stores.owner_user_id. 권한 service_role·postgres EXECUTE. (정의 원문 = supabase/migrations/20260614210000_admin_user_purge_auth.sql 의 함수와 같음)
- `support_messages_sender_shape`: `CHECK ((((sender_type = ANY (ARRAY['MEMBER'::text, 'OWNER'::text])) AND (sender_user_id IS NOT NULL) AND (sender_admin_id IS NULL)) OR ((sender_type = 'ADMIN'::text) AND (sender_admin_id IS NOT NULL)) OR ((sender_type = 'SYSTEM'::text) AND (sender_user_id IS NULL) AND (sender_admin_id IS NULL))))`
- `admin_prepare_auth_user_purge(uuid)`: 없음

되돌리기: 위 함수 정의로 CREATE OR REPLACE · 검사 제약 DROP 후 위 정의로 ADD · `DROP FUNCTION public.admin_prepare_auth_user_purge(uuid)`.

## 적용 결과 (Owner 「DB 적용 승인」 2026-11-27)

- 13:56 PHT 정의 백업(위).
- 시험 1 (13:57, 되돌림): 4명 준비를 먼저 다 하고 한 번에 삭제 → 고유키 충돌로 중단, 트랜잭션 전체 취소(반영 없음 확인). 다른 회원 `35dd245c` 의 한 발송 묶음이 삭제 대상 2명의 기기를 각각 가리켜, 한 번에 지울 때만 겹친다. 실제 관리자 삭제는 한 명씩.
- 시험 2 (13:59, 되돌림): 한 명씩 준비 → 삭제 — 4명 모두 Auth 삭제 성공(남음 0), 시스템 계정 `{"ok": false, "blockers": ["community_import_principal"]}`, 발송 기록 정리 8 + 15 + 0 + 0 = 23행. 되돌림 뒤 함수 없음·회원 4명·발송 기록 1,903행 그대로 확인.
- 14:00:39 PHT 적용 — `supabase_migrations.schema_migrations` `20261127060039 admin_user_purge_failures`.
- 적용 뒤 대조(읽기 전용): `admin_prepare_auth_user_purge(uuid)` 있음·권한 postgres·service_role 만, `admin_can_purge_auth_user` 시스템 계정 막음·권한 그대로, `support_messages_sender_shape` 새 정의·검증됨, 발송 기록 1,903행·실패 회원 4명 그대로(적용만으로 데이터 변경 없음).

# 회원 영구 삭제 실패 — 마무리 (2026-11-27 PHT)

Owner 「남은 것 … 끝까지 확인해서 완성도를 올리라」(2026-11-27). 앞서 「범위 밖·남은 것」으로 적은 4가지를 모두 확인하고 처리했다.

## 1. 다른 회원의 발송 기록이 남의 기기 행을 가리킴 — 원인 확인, 결함 아님

- **운영 조회 (읽기 전용)**
  - 기기가 있는 캠페인 발송 기록은 365행이다. 그중 123행(회원 8명)이 지금은 다른 회원의 기기 행을 가리킨다.
  - 123행 모두 그 기기 행이 **발송 뒤에 갱신**됐다(`user_devices.updated_at > deliveries.created_at`).
  - 발송 뒤에 만들어진 기기 행은 0행이다.
- **코드**
  - 발송 대상은 받는 사람의 기기만 조회한다. `lib/push/dispatch/load-active-push-targets.ts`의 `loadActivePushTargets`가 `.eq("user_id", uid)`로 고른다.
  - 기록되는 `device_id`는 그 대상 행이다(`dispatch-push-for-user.ts:91`).
- **기기 등록**
  - `register_user_device`는 같은 푸시 토큰(`UNIQUE (push_provider, push_token, environment)`)이면 `ON CONFLICT … DO UPDATE SET user_id = EXCLUDED.user_id`로 처리한다(`20270607110000_register_user_device_ios_stale_apns.sql:101`).
  - 같은 폰에서 다른 계정으로 로그인하면 기기 행의 주인이 바뀐다.
- **결론**
  - 보낼 때는 받는 사람 본인의 기기로 보냈다. 나중에 그 폰을 다른 계정이 쓰면서 행의 주인이 바뀐 것이다. **잘못 보낸 발송은 없다.**
  - 이 구조 때문에 회원을 지울 때 생기는 고유키 충돌은 #656의 준비 함수(D2)가 처리한다.

## 2. 다른 삭제 경로 2곳 — 준비 함수 연결 (이 PR)

| 경로 | 바꾼 것 |
|---|---|
| `lib/auth/discard-empty-account-run.server.ts` 빈 계정 지우기(본인 요청) | Auth 삭제 전에 `prepareAuthUserPurge`를 부른다. 실패하면 삭제하지 않고 `user_discard_empty_account_failed`(오류 `purge_prepare_failed:…`)로 기록한다 |
| `lib/admin/prelaunch-reset/execute.ts` 출시 전 초기화 | 지울 회원마다 `deleteUser` 전에 준비 함수를 부른다. 실패하면 그 회원은 건너뛰고 오류 목록에 넣는다 |

- 고객센터 검사 제약(D3)은 DB에서 고쳐 모든 경로에 적용된다(#656).
- 시스템 계정은 출시 전 초기화에서 `@manual.local` 시험 계정만 지우는 규칙(`storage-auth-plan.ts`)에 따라 `BLOCKED` 처리된다. 빈 계정 지우기는 본인 계정만 다룬다.

## 3. 운영 이력 라벨 (이 PR)

- `user_purge_failed`가 관리자 회원 운영 이력에 키 그대로 보이던 것을 고쳤다.
- 카탈로그 키 `admin_member_ops_user_purge_failed`(ko 「영구 삭제 실패」·en)로 보인다.
- 인라인 한국어는 추가하지 않았다(i18n 검사 PASS).

## 4. 11-27 실패 때 남은 거짓 기록 — 정정 SQL (운영 데이터 변경 · Owner 승인 필요)

### 대상 (읽기 전용 조회로 확인)

- **제재 이력 `user_moderation_events` action `purge`**
  - 시스템 계정 `8fdac20f…` 5행(11-27 12:28:29~12:32:00 PHT).
  - 실제로는 삭제되지 않았는데 회원 운영 이력에 「영구 삭제」로 보인다.
- **감사 `audit_logs` action `user_purge`** 10행(11-27 11:00~14:00 PHT)
  - 대상: 시스템 계정 5행, 나중에 14:13~14:15에 실제로 삭제된 4명의 12:30~12:35 시도 5행
  - 각 행에 `purged: true`라고 적혀 있지만 그 시도는 실패했다.

### 정정 방법

- 제재 이력: 거짓 5행을 지운다.
  - 이 표는 이력 표시용이다.
  - 성공한 영구 삭제의 행은 원래 CASCADE로 함께 지워진다. 그러니 남은 5행은 모두 거짓이다.
- 감사: **원본은 고치지 않는다**(감사는 덧붙이기만 한다). 거짓 10행마다 정정 행 `user_purge_failed`를 덧붙이고, 원본 id를 가리키게 한다.

```sql
begin;
-- 1) 시스템 계정 거짓 제재 이력 5행
delete from public.user_moderation_events
 where user_id = '8fdac20f-7684-4861-bad3-040b639bc9d6'
   and action = 'purge'
   and created_at between '2026-11-27T04:28:00Z' and '2026-11-27T04:33:00Z';   -- 5행이어야 함
-- 2) 거짓 감사 10행에 정정 행 덧붙이기
insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
select 'system', null, 'user', a.target_id, 'user_purge_failed', null,
       jsonb_build_object('corrects_audit_id', a.id, 'purged', false,
                          'error', 'auth_user_delete_failed (2026-11-27 DB 제약 — 설계 docs/audit/admin-user-purge-failures-2026-11-27/design.md)',
                          'at', now())
  from public.audit_logs a
 where a.action = 'user_purge'
   and a.created_at >= '2026-11-27T03:00:00Z' and a.created_at < '2026-11-27T06:00:00Z'
   and a.target_id in ('8fdac20f-7684-4861-bad3-040b639bc9d6','d22917ca-962a-41f6-a81e-31ce2dbdead8',
                       'f6d5a169-9306-48ba-85f1-0342a830425e','4491ea96-aead-4e77-ab10-e7e319ea2630',
                       'f7176b23-f1ce-4c3b-abcf-92b71f6ca3ec');   -- 10행이어야 함
commit;
```

### 실행 절차

1. 먼저 같은 문장을 `begin … rollback`으로 돌려 5행·10행을 확인한다.
2. 숫자가 맞으면 적용한다.
3. 적용 뒤 읽기 전용으로 대조한다.
   - 시스템 계정 제재 이력 `purge` 0행
   - 정정 감사 10행

# 어드민 회원 영구 삭제 실패 10건 — 원인·설계 (2026-11-27 PHT)

- 지시: Owner 「삭제 실패 설계」(2026-11-27)
- **설계만 했다.** 구현·운영 DB 변경은 하지 않았다.
- 근거 (모두 11-27 조회, 운영은 읽기 전용)
  - Supabase `edge_logs`·`auth_logs`·`postgres_logs`
  - 운영 DB 제약·함수 정의: `pg_constraint`, `pg_indexes`, `pg_get_functiondef`
  - 운영 DB 행 수 조회
  - 코드: `origin/main` `9c5dcd6`
    - `app/api/admin/users/[id]/delete/route.ts`
    - `lib/admin/admin-user-deletion.ts`
    - `lib/admin/notification-campaigns/*`

## 1. 무슨 일이 있었나

- 11:13~12:35 PHT 관리자 화면에서 영구 삭제(`user_purge`)를 99번 눌렀다.
  - 감사 기록 `audit_logs` 99행, 실행 관리자 `11111111-…`
- Auth 삭제 결과: 89건 성공, **10건 실패 (HTTP 500 `auth_user_delete_failed`)**
- 실패 대상 5명은 지금도 남아 있다(`auth.users` 1행씩).

| 대상 | 실패 횟수 | DB 오류 |
|---|---:|---|
| `8fdac20f…` `community-import-system@dibay.internal` (시스템 계정) | 5 | 외래키 `community_import_principal_user_id_fkey` (`ON DELETE RESTRICT`) |
| `d22917ca…` | 2 | 고유키 `notification_campaign_deliveries_occurrence_user_device_channel` |
| `f6d5a169…` | 1 | 같은 고유키 |
| `4491ea96…` | 1 | 검사 제약 `support_messages_sender_shape` |
| `f7176b23…` | 1 | 같은 검사 제약 |

## 2. 원인 (DB 정의·행으로 확인)

### 2-1. 시스템 계정 — 삭제를 막는 것이 맞는데, 사전 확인이 이것을 모른다

- `community_import_principal.user_id → auth.users ON DELETE RESTRICT`
  - 커뮤니티 가져오기 글의 작성자 계정이다. 일부러 지울 수 없게 해 둔 것이다.
- 사전 확인 함수 `admin_can_purge_auth_user`는 다음 4가지만 본다.
  - `group_rooms`, `group_messages`, `group_audit_log`, `stores`
- 그래서 사전 확인은 통과한다. 그 뒤 Auth 삭제에서 500이 나고, 관리자가 다시 눌러도 같은 500이 났다(5번).

### 2-2. 알림 캠페인 발송 기록 — 기기 행이 지워지며 다른 행과 겹친다

- 관련 정의
  - `user_devices.user_id → auth.users ON DELETE CASCADE`
  - `notification_campaign_deliveries.device_id → user_devices ON DELETE SET NULL`
  - 고유 인덱스: `(occurrence_id, user_id, COALESCE(device_id, 0000…), channel) WHERE occurrence_id IS NOT NULL`
- 회원을 지우면 그 회원의 기기 행이 지워진다. 그 기기를 가리키던 발송 기록의 `device_id`는 비워진다(NULL → 인덱스에서는 0000…).
- 같은 회차·같은 받는 사람·같은 채널에 이미 「기기 없음」 행이 있거나, 비워지는 행이 2개 이상이면 고유키가 충돌한다.
- 실측
  - `f6d5a169`: 기기 31개, 자기 발송 기록 중 겹치는 묶음 2개.
  - `d22917ca`: 자기 기록에는 겹침이 없다. 그런데 **이 회원의 기기 행을 다른 회원 2명의 발송 기록 15행이 가리킨다.** 그 행들이 비워지며 그 회원들의 기존 행과 충돌한다.

### 2-3. 고객센터 메시지 — 비우기가 검사 제약에 걸린다

- 관련 정의
  - `support_messages.sender_user_id → auth.users ON DELETE SET NULL`
  - 검사 제약 `support_messages_sender_shape`: `MEMBER`·`OWNER`는 `sender_user_id IS NOT NULL`이어야 한다. `ADMIN`은 `sender_admin_id IS NOT NULL`이어야 한다.
- 그 회원의 상담 건은 `support_cases.requester_user_id → auth.users ON DELETE CASCADE`라 메시지와 함께 지워질 예정이다.
- 그런데 메시지의 `SET NULL`이 먼저 실행되며 검사 제약을 어겨, 삭제 전체가 실패한다.
- 실측: `4491ea96` 회원 메시지 1행, `f7176b23` 2행.
- 같은 구조라, 상담에 답한 **관리자 계정을 지울 때도 같은 실패가 난다**(`ADMIN` + `sender_admin_id` SET NULL). 운영 관리자 메시지는 40행이다.

### 2-4. 실패해도 「삭제 완료」로 남는다 (API 순서)

`route.ts` purge 순서는 다음과 같다.

1. 사전 확인
2. 제재 기록 `purged`
3. 세션 무효화
4. 매장 판매 중지
5. 푸시 토큰 끄기
6. Apple 토큰 폐기
7. **탈퇴 요청 `completed`**
8. **감사 `user_purge` (`purged: true`)**
9. Auth 삭제

9번이 실패해도 2~8번은 이미 반영돼 있다. 그래서 실패 10건이 감사·탈퇴 요청에 「삭제됨」으로 남았다.

## 3. 바꾸는 것

### 3-1. DB (마이그레이션 1개 · 운영 적용은 Owner 승인 후)

| # | 바꾸는 것 | 결과 |
|---|---|---|
| D1 | `admin_can_purge_auth_user`에 막는 이유 `community_import_principal`(시스템 계정) 추가 | 시스템 계정은 409 「삭제할 수 없는 계정」으로 끝난다. Auth 삭제를 시도하지 않는다 |
| D2 | 새 함수 `admin_prepare_auth_user_purge(p_user_id)`. service_role 전용, security definer. 대상 회원의 기기를 가리키는 발송 기록 가운데 **기기를 비우면 겹치는 행만** 지운다. 같은 (회차·받는 사람·채널)에 「기기 없음」 행이 이미 있으면 그 행들을 지운다. 없으면 가장 이른 1행만 남긴다 | 2-2 충돌이 없어진다. 대상 회원 자기 기록은 어차피 CASCADE로 지워진다. 다른 회원 기록은 같은 묶음의 중복 행만 줄어든다(받은 기록 자체는 남는다) |
| D3 | `support_messages_sender_shape` 완화: `MEMBER`·`OWNER`는 `sender_admin_id IS NULL`이면 되고(`sender_user_id` NULL 허용), `ADMIN`은 `sender_admin_id` NULL 허용 | FK `SET NULL`이 의도대로 돈다. 회원 상담은 CASCADE로 함께 지워지고, 관리자 답변은 보낸 사람 없이 남는다 |

- **화면 영향 (D3)**: 고객·관리자 고객센터 화면은 보낸 사람을 `sender_type`으로만 그린다. `sender_user_id`·`sender_admin_id`를 화면에 쓰지 않는다(`SupportTicketViews.tsx:921·1032`, `AdminSupportPage.tsx:562-567·1006`). 타입도 이미 `string | null`이다(`support-case-types.ts:133`).
- **바꾸지 않는 것**: `community_import_principal`의 RESTRICT, 발송 고유 인덱스, 각 FK의 삭제 동작.

### 3-2. 코드 (`route.ts` · `admin-user-deletion.ts`)

| # | 바꾸는 것 |
|---|---|
| C1 | purge: 사전 확인 통과 → `admin_prepare_auth_user_purge` 호출. 함수가 아직 없으면(운영 DB 적용 전) 건너뛴다 |
| C2 | 탈퇴 요청 `completed`와 감사 `user_purge`를 **Auth 삭제 성공 뒤로** 옮긴다. 실패하면 감사 `user_purge_failed`(오류 문구 포함)만 쓰고 탈퇴 요청은 그대로 둔다 |
| C3 | 시스템 계정이면 목록 문구 대신 전용 문구 `admin_api_users_purge_system_account`(ko·en)로 409 |

- Apple 토큰 폐기는 Auth 행이 있어야 하므로 지금처럼 삭제 전에 한다.
- 세션 무효화, 매장 판매 중지, 푸시 토큰 끄기도 지금 순서를 유지한다(§5-2).

## 4. 바뀌는 파일 · 영향받는 화면·호출처

| 파일 | 영향 |
|---|---|
| `supabase/migrations/<새>_admin_user_purge_failures.sql` | D1~D3 |
| `app/api/admin/users/[id]/delete/route.ts` | C1·C2. 호출처: 관리자 회원 상세·목록의 삭제 버튼(같은 API) |
| `lib/admin/admin-user-deletion.ts` | C1 함수 호출 도우미 |
| `lib/i18n/catalog/*` | C3 문구 |
| 관련 경로 확인: `lib/auth/discard-empty-account.server.ts` (빈 계정 정리) | `support_messages` 존재 여부를 막는 조건으로 쓴다(`:101`). D3은 이 판정을 바꾸지 않는다. 그대로 둔다 |

## 5. 깨질 수 있는 것 · 같은 단계 처리

1. **D2가 다른 회원의 발송 기록을 지운다.**
   - 같은 회차·채널에서 기기만 다른 중복 행만 지운다. 「받았다」 기록은 1행 남는다.
   - 운영 영향 행 수는 적용 전에 같은 조건의 SELECT로 세어 보고한다.
2. **삭제 중간 실패 시 상태**
   - 세션·매장·푸시는 이미 꺼진 채로 남는다(지금과 같음).
   - C2로 「삭제 완료」 기록만은 남지 않게 한다.
   - D1~D3으로 알려진 실패 원인은 모두 사전에 막거나 없앤다.
3. **운영 DB 적용 전에 코드가 먼저 나가는 경우**
   - C1은 함수가 없으면 건너뛰어 지금과 같이 동작한다.
   - 순서: **DB 적용(승인) → 같은 PR 병합**. 운영 빌드는 1번이다.

## 6. 검증

**코드**
- `route` 시험
  - 시스템 계정: 409, Auth 삭제 호출 0
  - Auth 삭제 실패: 감사 `user_purge_failed`, 탈퇴 요청 상태 무변경
  - 성공: 순서대로 기록
- `test:ci` 전체, 타입검사 2종, eslint, `check:i18n-quality`

**운영 DB (Owner 승인 뒤)**
- 적용 전: D2 대상 행 수를 SELECT로 센다(5명 기준).
- 적용 시험: 실패했던 회원 1명으로 `begin; select admin_prepare_auth_user_purge(…); delete from auth.users where id = …; rollback;`
  - 지운 뒤 되돌리는 시험이다. 훅 확인 창이 뜨며, **Owner 승인 대상**이다.
- 적용 뒤: 관리자 화면에서 실패한 4명(시스템 계정 제외)을 다시 삭제해 성공하는지 본다.
  - 시스템 계정은 409 문구가 나오는지 본다.
  - Owner가 누르거나, Owner 지시로 작업자가 누른다.

**반영**: PR 1개 · 병합 1회 · 운영 빌드 1회. 자동 병합은 등록하지 않는다(운영 DB 적용이 먼저 필요한 변경).

## 7. 범위 밖 발견 (보고만)

1. 감사 기록 `user_purge` 10행이 `purged: true`인데 실제로는 삭제되지 않았다(2-4). 감사 기록은 고치지 않는다.
2. **다른 회원의 발송 기록이 `d22917ca`의 기기 행을 가리킨다**(2명·15행).
   - 캠페인 푸시가 받는 사람과 다른 계정의 기기 행으로 기록된 것이다.
   - 한 폰을 여러 계정이 쓴 경우로 보이나, **원인은 확인 못 함**.
   - 잘못된 기기로 보냈는지 별도 감사가 필요하다.
3. 13:20 PHT `chat_room_participants` 오류 1건은 다른 작업 세션의 직접 SQL(`mgmt-api`)이다. 앱 결함이 아니다.

## 8. 구현 중 보정 (독립 재감사 2026-11-27 · 운영 DB 정의로 확인)

1. **D2 범위 누락**: 발송 기록에는 고유 인덱스가 하나 더 있다.
   - `ncd_legacy_campaign_user_device_channel_uidx (campaign_id, user_id, COALESCE(device_id,0…), channel) WHERE occurrence_id IS NULL`
   - 운영에 레거시 행이 51행 있고, 그중 30행은 기기가 있다.
   - D2가 이 범위(campaign_id 기준)도 함께 정리하도록 고쳤다.
2. **C2 누락**: 제재 이력(`user_moderation_events` action `purge`)도 Auth 삭제 전에 쓰였다.
   - 이 표의 `user_id`는 `profiles ON DELETE CASCADE`다. 그래서 삭제가 성공하면 함께 지워지고, **실패할 때만** 「영구 삭제」로 남아 관리자 회원 이력(`member-ops-history.ts`)을 속인다.
   - 영구 삭제는 제재 이력을 쓰지 않도록 고쳤다. 기록은 감사 `user_purge`·`user_purge_failed`가 맡는다. 탈퇴는 지금 그대로다.
3. **운영 영향 (읽기 전용 계산, 실패 회원 4명 기준)**
   - D2가 지우는 발송 기록은 16행이다. 그중 14행은 다른 회원의 같은 회차·채널 중복 행이다. 레거시 범위는 0행이다.
   - 「받음」 기록은 묶음마다 1행씩 남는다.
4. **같은 원인이 날 수 있는 다른 삭제 경로 (범위 밖 · 보고만)**
   - `lib/auth/discard-empty-account-run.server.ts:101` 빈 계정 정리
   - `lib/admin/prelaunch-reset/execute.ts:499` 출시 전 초기화
   - 둘 다 `deleteUser`를 직접 부르고 D2 준비 함수를 부르지 않는다.
   - D3(검사 제약)은 DB에서 고쳐지므로 이 경로에도 적용된다. 2-2 충돌은 이 경로에 남는다.
5. **남는 것 (범위 밖)**
   - 관리자 회원 이력 라벨에 `user_purge_failed` 한국어 이름이 없어 키가 그대로 보인다.
     - 그 파일은 인라인 한국어 라벨표라 문구를 더하면 i18n 검사 규칙(인라인 한국어 신규 금지)에 걸린다. 그래서 더하지 않았다.
   - 11-27 실패 10건의 제재 이력 「영구 삭제」 행도 고치지 않는다.

## 9. Owner 결정 필요

1. 이 설계대로 구현 승인 (D1~D3 · C1~C3)
2. D3: 관리자 계정을 지울 때 그 관리자의 상담 답변은 **보낸 사람 없이 남긴다**(지금 FK 의도). 다르게 원하면 지시

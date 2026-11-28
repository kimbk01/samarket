# 모임 어드민 결함 D (30건) 수정 설계 — 2026-11-28

- 기준 코드: `/Users/bkkim/projects/samarket-wt-moim-r4` (운영 main `eac581f07`). 이 문서는 설계만. 코드·DB·기기는 건드리지 않았다.
- 결함 목록: `docs/audit/moim-full-defect-audit-2026-11-28.md` §5 (D · 30건), 근거 줄: `…-raw.md` §D.
- 읽은 규정·계약: AGENTS.md(언어 키만·한국어 문자열 금지·어드민은 Admin 부품), 계약 `docs/design/moim/moim-design-v1-2026-11-12.md` §8·P13·P14·P15, R4 설계 §5(c), `docs/dibay-messenger-domain-group-hard-lock.md` :182-196, `lib/admin/access/admin-route-access.ts`.
- 배포 구분(예정): **웹 + DB**. 네이티브 변경 없음. 새 SQL(함수·열·트리거)이 웹보다 먼저 운영 DB 에 들어가야 한다 → PR 은 만들되 자동 병합 등록은 **운영 DB 적용(Owner 승인) 뒤**에 한다(개발 프로세스 1번 예외).
- PR: 1개. D5·D23 은 메신저 어드민 파일을 건드리지만, 모임 방 가드 전용 파일(`moim-room-admin-guard.ts`)과 같은 마이그레이션을 쓰는 같은 작업이다(R4 §5(c) 가 같은 방식으로 한 PR 에 넣은 선례).

## 0. 이미 정해진 Owner 결정 (이 설계가 따르는 것)

| 결정 | 이 설계에서 |
|---|---|
| D-충돌: R4 §5(c) 가 이긴다 | 모임 방의 **읽기 전용·방 상태(차단·보관)** 는 모임 함수만 바꾼다. 메신저 어드민의 차단·차단 해제·보관·보관 해제·읽기 전용 켜기·끄기는 모임 방이면 「모임 어드민에서」 안내로 거부한다. 기존 가드를 넓히고 DB 트리거 `cm_moim_guard_rooms` 에 `room_status` 를 더한다. 계약 §8 「채팅」 줄을 고친다(§4-1). |
| E18 일부: 경고 중에도 어드민은 모임장 지정·미접속 요청 승인 가능 | 코드는 이미 그렇게 동작한다(`moim_admin_assign_host`·`moim_admin_host_request_decide` 에 `platform_state` 검사 없음 — 확인함). 계약 P14 표에 「위임 불가는 모임 안 위임만. 어드민 지정·승인은 할 수 있다」를 적는다(§4-1). 코드 변경 없음. |
| D6: 신고 사유는 하나 이상 켜져 있어야 한다 | 화면·SQL 둘 다 막는다(D6). |

## 1. 공통 부품 (뿌리 수정 — 여러 결함이 같이 고쳐진다)

### 1-1. 어드민 오류 문구 하나 (`D4·D10·D12·D13` + 모든 모임 어드민 시트·폼)

지금 문제: ① 서버가 「모임이 운영 중이 아님」도 `moim_not_found`(→404)로 보내고, ② `moimAdminRpcResponse` 가 `*_not_found` 를 모두 404 로 바꾸고, ③ 조치 시트(`AdminChatActionSheet`)가 404 를 전부 「대상을 찾을 수 없어요」로 처리하며, ④ 신고 처리 폼은 `r.code`(번역 안 된 `invalid_request`·`http_500` 등)를 그대로 보여 준다.

수정:

1. **서버 상태 번호표** — `lib/admin/moim/moim-admin-route.server.ts` `moimAdminRpcResponse` 를 아래 표 하나로 바꾼다 (목록은 `moim-admin-contract.ts` 의 상수로 두어 시험이 같이 읽는다).

   | 코드 | HTTP | 화면 |
   |---|---|---|
   | `moim_conflict`·`moim_transfer_stale` | 409 | 「다른 관리자가 먼저 바꿨어요」 + 다시 불러오기 |
   | `moim_not_found`·`moim_report_not_found`·`moim_sanction_not_found`·`moim_content_not_found`·`moim_transfer_not_found`·`moim_ban_not_found` (= **행이 정말 없음**) | 404 | 「대상을 찾을 수 없어요」 + 다시 불러오기 |
   | 새 `moim_closed`·`moim_deleted`·`moim_sanction_not_revocable`·`moim_sanction_already_active`·`moim_room_managed_by_moim` | 422 | 시트를 닫지 않고 그 코드의 문장 |
   | `moim_unknown` | 500 | 일반 실패 문장 |
   | 그 밖 `moim_*` | 400 | 그 코드의 문장 |

   서버 SQL 은 「행이 없음」에만 `*_not_found` 를 쓰도록 바꾼다(§3-1 상태 검사 함수 · §3-3·§3-4 의 「이미 해제됨 → conflict」).
2. **화면 문구 함수 하나** — 새 파일 `lib/admin/moim/moim-admin-errors.ts`(클라이언트 안전):
   - `moimAdminFailureText(t, { status, code }): string` — `moim_*` 는 `moim_err_<code>` 키가 있으면 그 문장, 없으면 `admin_moim_err_generic`. `network_error` → `admin_moim_err_network`, `invalid_request`·`http_400` → `admin_moim_err_invalid_request`, `http_5xx`·`moim_unknown` → `admin_moim_err_generic`. **원래 코드는 문장에 넣지 않는다.**
   - `moimAdminFailureKind({ status }): "stale" | "gone" | "refused"` — 409 = stale, 404 = gone, 그 밖 = refused(시트·폼 유지).
3. `components/admin/moim/admin-moim-shared.tsx` `moimAdminSend` — 실패 결과에 `message: moimAdminFailureText(...)` 를 담고 `code` 는 원래 코드 그대로 둔다(지금처럼 번역문을 `code` 에 넣지 않는다).
4. `components/admin/chats/AdminChatActionSheet.tsx` — `AdminChatSheetResult` 실패 모양에 선택 칸 `message?: string` 을 더한다. 오류 표시에서 `message` 가 있으면 그 문장을 그대로 쓰고, 없으면 지금 규칙(`admin_chat_sheet_err_*` + code). 채팅 어드민 기존 호출은 `message` 를 안 넣으므로 화면이 바뀌지 않는다.
5. 신고 처리 폼(`AdminMoimReportDecisionForm.tsx` `runReview`·`submit`)과 위임 요청·카테고리·정책 화면의 직접 배너도 같은 두 함수만 쓴다.

어드민이 보는 것: 종료 모임에서 역할 변경 → 「종료된 모임이라 할 수 없어요」(시트 유지), 삭제 모임 → 「삭제된 모임이라 할 수 없어요. 복구한 뒤 다시 해 주세요」, 동시 해제 두 번째 → 「다른 관리자가 먼저 바꿨어요」, 네트워크 → 「인터넷 연결을 확인해 주세요」. `invalid_request`·`http_500` 같은 글자는 안 보인다.

### 1-2. 「모임 상태 → 어드민이 할 수 있는 조치」 함수 하나 (`D4·D10·D11`)

`lib/admin/moim/moim-admin-contract.ts` 에 `moimAdminAllowedActions(status: "active"|"closed"|"deleted")` 를 둔다. 값은 **지금 SQL 이 실제로 허용하는 것 + §3-1 로 새로 막는 것**과 1:1 이다(서버가 최종 판정, 화면은 같은 표로 버튼을 고른다).

| 조치 | active | closed | deleted |
|---|---|---|---|
| 역할 변경 · 모임장 지정 · 미접속 요청 승인 | O | X (`moim_closed`) | X (`moim_deleted`) |
| 내보내기 · 차단 · 차단 해제 | O | O | X |
| 콘텐츠 숨김·숨김 해제·삭제·삭제 복구 · 일정 취소 | O | O | X |
| 모임 제재 적용 · 해제 | O | O | X |
| 기본정보 수정 | O | O | X (지금도 막힘) |
| 신고 처리: 콘텐츠 숨김 · 모임 제재 | O | O | X |
| 신고 처리: 이용 제한 · 기각 | O | O | O |
| 삭제 · 복구 (최고관리자) | 삭제 | 삭제 | 복구 |

- `platform_state`(추천 제외·경고·차단)는 어드민 조치를 막지 않는다(E18 결정 포함). 이 줄을 함수 주석에 적는다.
- 화면 쓰는 곳: 상세 멤버 탭 버튼(D4), 게시글·댓글·앨범·일정 버튼(D11), 제재 탭 적용·해제 버튼(D11), 신고 처리 폼 선택지(D10). 막힌 상태면 버튼을 숨기고 탭 위에 한 줄 안내(`admin_moim_state_note_closed` / `_deleted`).

### 1-3. 제재 행 보기 함수 하나 (`D1·D2·신규2`)

`moim-admin-contract.ts` `moimSanctionRowView(row, moimStatus)` →
`{ kind: "moim"|"content"|"user", revocable: boolean, followUp: "content_tab"|"schedule_none"|"message_admin"|"user_restrictions"|null }`.
- `revocable` = `target_kind='moim'` 이고 진행 중이고 모임이 삭제 상태가 아님. **이 경우에만 「해제」 버튼.**
- 콘텐츠 숨김 행 → 「콘텐츠 탭에서 숨김 해제」 링크(글·댓글 → `?tab=posts`, 사진 → `?tab=album`), 일정 → 「일정 취소는 되돌릴 수 없어요」 글만, 채팅 메시지 → 메신저 방 상세 링크(1-4 권한 링크).
- 이용 제한 행 → 기존 해제 경로(계약 P14 「기존 해제 경로」) `/admin/community/restrictions?userId=<대상>&sanctionId=<커뮤니티 제재 id>` 링크(1-4 권한 링크).
- 모임 상세 「제재」 탭과 「제재 이력」 화면이 같은 함수·같은 열(종류 · 대상 · 단계 · 사유 · 기간 · 상태 · 처리자 · 조치)을 쓴다.

### 1-4. 권한 맞춘 링크 하나 (`D24`)

`admin-moim-shared.tsx` 에 `MoimAdminGatedLink({ href, children })`: `adminAccessActorFromMe(useAdminShell().adminMe)` + `canAccessAdminRoute(href, actor)`(접근표 = 서버 가드와 같은 키). 못 열면 링크 대신 글자 + `admin_moim_link_no_access`(「열 권한이 없어요」). 권한 정보를 아직 모르면 지금처럼 링크(서버가 막음 — `historyDetailHrefForActor` 와 같은 규칙).

### 1-5. 상세 탭 새로 불러오기 (`D26`)

`AdminMoimDetailPage.tsx` 탭 본문을 `<div key={`${tab}:${m.status}:${m.platformState}:${m.updatedAt}`}>` 로 감싼다. 삭제·복구·제재로 모임 행이 바뀌면 열린 탭이 다시 마운트돼 새로 읽는다(삭제·복구 RPC 는 `updated_at` 을 바꾼다 — 확인함, 제재는 `platform_state` 로 잡는다).

## 2. 결함별 수정

표기: **바꿀 곳** · **어드민이 보는 것** · **그대로 동작해야 하는 곳** · **행동 시험** · **위험**.

### D1 제재 탭 콘텐츠 숨김·이용 제한 줄 「해제」 → 서버 거부, 대상 열 없음, 복구해도 「진행 중」
- 바꿀 곳: `AdminMoimDetailPage.tsx` `SanctionsPanel`(1-3 함수로 열·버튼), `moim-admin-queries.server.ts` `loadAdminMoimSection` case `sanctions`(대상 보강: 콘텐츠면 종류·짧은 내용, 사람이면 계정 — 한 번에 묶어 읽기), SQL 동기화(§3-3: 콘텐츠 복구·메시지 숨김 해제·커뮤니티 제한 해제 → 해당 행 `revoked_at` 채움).
- 보는 것: 대상 열(「모임 전체」/「글 · 첫 줄」/「회원 닉네임 · @ID」). 「해제」는 모임 제재에만. 콘텐츠를 복구하면 그 숨김 행이 「해제됨」, 회원 활동 제한을 풀면 그 행도 「해제됨」.
- 그대로: 모임 제재 해제 흐름·알림(`sanctions/[sanctionId]` 라우트), 신고 상세의 처리 결과 목록(같은 행을 읽음).
- 시험: (화면) 콘텐츠 숨김 행에 해제 버튼 없음·링크 있음 / 모임 경고 행에만 버튼. (SQL) 숨김 → `moim_admin_content restore` → 그 `content_hide` 행 `revoked_at` 채워짐. 커뮤니티 제한 해제 → `user_restrict` 행 `revoked_at` 채워짐.
- 위험: 커뮤니티 `sanctions` 표 트리거(§3-3)가 커뮤니티 도메인 표에 붙는다 → 모임 표만 쓰는 AFTER 트리거로 한정, 실패해도 원래 갱신을 막지 않게(예외 삼킴 없이 단순 UPDATE 1문장).

### D2 제재 이력에 사용자별 제재 없음
- 바꿀 곳: `listAdminMoimSanctions`(`target_kind='moim'` 고정 제거, `kind=all|moim|content|user` · `userId` 필터 추가, 대상 보강은 D1 과 같은 함수), `app/api/admin/moim/sanctions/route.ts`(파라미터), `AdminMoimSanctionsPage.tsx`(대상 종류 선택·「이 회원만」 해제 칩·1-3 열·버튼), 계약 상수 `MOIM_ADMIN_SANCTION_KINDS`.
- 보는 것: 기본 「전체」에서 모임·콘텐츠·사용자 제재가 같이 보이고, 대상 종류로 거를 수 있다. 회원 상세에서 `?userId=` 로 들어오면 그 사람 제재만.
- 그대로: 상태 탭(진행 중·7일 안 만료·만료·해제·전체) — 이용 제한 행의 끝·해제는 §3-3 동기화로 같은 열을 쓰므로 필터가 맞는다. 대시보드·메뉴 링크(`/admin/community/moims/sanctions`) 주소 그대로.
- 시험: kind=user 이면 `target_kind in (host, member)` 만; userId 필터; 「해제」 버튼은 모임 행에만.
- 위험: 기본 목록 행 수가 늘어남 — 쪽 넘김 그대로(50).

### D3 신고 처리가 같은 단계 모임 제재를 중복 생성·알림 재발송
- 바꿀 곳: SQL `moim_admin_report_decide`(같은 모임·같은 단계·진행 중 제재가 있으면 새 행을 만들지 않고 그 id 를 `duplicate:true` 로 돌려줌 · §3-2), 직접 적용 `moim_admin_sanction_apply` 의 같은 경우를 `moim_conflict`(409) 대신 `moim_sanction_already_active`(422)로. 라우트 `reports/[reportId]/decision` 2번 알림: `levelAction.duplicate` 면 `moim_sanctioned` 를 보내지 않는다.
- 보는 것: 처리 결과에 「이미 진행 중인 제재를 근거로 연결했어요」(결과 목록에 기존 행 표시). 직접 적용은 「같은 단계 제재가 이미 진행 중이에요」.
- 그대로: 다른 단계(예: 차단 중 경고)는 지금처럼 새 행. 신고자 결과 알림은 그대로 1회.
- 시험: (SQL) 경고 진행 중 → 신고 처리 경고 → `moim_sanctions` 행 수 그대로, `action_id` = 기존 행. (라우트) duplicate 이면 `notifyMoimMany(moim_sanctioned)` 호출 0.
- 위험: 낮음.

### D4 종료 모임 역할 변경·모임장 지정, 삭제 모임 대부분 「대상 없음」
- 바꿀 곳: `MembersPanel` 에 `status` 를 넘겨 1-2 표로 버튼 선택, 상단 안내 1줄. SQL 은 §3-1 상태 검사 함수로 `moim_closed`/`moim_deleted`. 문구는 1-1.
- 보는 것: 종료 모임: 역할 변경·모임장 지정 버튼 없음 + 「종료된 모임이에요. 역할 변경·모임장 지정은 할 수 없어요」. 삭제 모임: 멤버 조치 버튼 없음 + 삭제 안내. (화면이 늦게 바뀐 경우 서버 응답도 같은 문장.)
- 그대로: 운영 중 모임의 멤버 조치·알림 전부.
- 시험: 화면 — status=closed 일 때 역할·지정 버튼 0, 내보내기 있음. 라우트 — `moim_closed` → 422 + 문장(404 아님).
- 위험: 낮음.

### D5 메신저 어드민이 모임 방 차단·보관 가능
- 바꿀 곳:
  - `lib/admin-community-messenger/moim-room-admin-guard.ts`: `cmRoomAdminActionManagedByMoim(action)` = `block_room·unblock_room·archive_room·unarchive_room·readonly_on·readonly_off`. 코드 `MOIM_ROOM_MANAGED_BY_MOIM = "moim_room_managed_by_moim"`, 문구 키 `admin_cm_moim_room_managed_by_moim`, 422. 옛 이름(`…READONLY…`)은 이 파일 안에서 새 이름으로 바꾸고 부르는 곳 3곳을 함께 고친다(아래).
  - 부르는 곳: `admin-chat-moderation-cas.ts` `runCmRoomActionCas`, `service.ts` `runAdminCommunityMessengerRoomAction`, `AdminChatActionSheet.tsx` 오류 표시.
  - **신고 경유**: `runCmReportActionCas` 가 `sanction_room_block` 일 때 신고 상태를 바꾸기 **전에** 방을 읽어 모임 방이면 422 로 끝낸다(지금은 신고만 「제재」로 닫히고 방은 안 막히는 반쪽 처리가 생긴다). 신고 시트(`AdminChatSheets.tsx` `adminChatReportActionsFor`)는 입력에 `cmRoomManagedByMoim` 을 받아 그 선택지를 숨긴다(`AdminChatReportQueuePage.tsx` 가 이미 가진 `row.moimId` 로 채움).
  - DB: `cm_moim_guard_rooms` 막는 칸에 `room_status` 추가(§3-6).
  - 화면: `AdminCommunityMessengerDetailPage.tsx` 운영 조치 칸 — 모임 방이면 버튼 3개 대신 안내 + 「모임 어드민에서 보기」(D23 과 함께).
- 보는 것: 모임 방 상세에 차단·보관·읽기 전용 버튼이 없고 「모임 채팅방의 차단·보관·읽기 전용은 모임 상태에 따라 정해져요. 모임 어드민에서 처리해 주세요」. 주소로 직접 요청해도 같은 문장(422).
- 그대로: 일반 그룹방·1:1 방의 차단·보관·읽기 전용, 모임 방 **메시지 숨김**(계약 §8 허용), 메신저 신고의 「처리됨·기각·메시지 숨김」.
- 시험: CAS — 모임 방 + `block_room` → 422, DB 갱신 호출 0. 신고 — 모임 방 + `sanction_room_block` → 422, 신고 상태 그대로. 일반 방 + `block_room` → 지금처럼 성공. 기존 시험 `moim-room-admin-guard` 이름 변경 반영.
- 위험: 이미 메신저 어드민이 차단·보관한 모임 방이 운영에 있으면 이제 아무도 못 푼다 → §3-6 에서 운영 수를 먼저 세고, 있으면 같은 마이그레이션에서 `active` 로 되돌린다(백업·열 대조 보고).

### D6 신고 사유 전부 끄기 저장됨 → 신고·직접 제재 불가
- 바꿀 곳: `AdminMoimPoliciesPage.tsx` `reasonsOk` 에 「켜진 줄 1개 이상」 추가 + 빨간 안내, SQL `moim_admin_policies_save` 에 같은 검사(`moim_policy_report_reason_none_active`, §3-5).
- 보는 것: 마지막 켜진 사유를 끄면 저장 버튼이 꺼지고 「신고 사유를 하나 이상 켜 두세요」.
- 그대로: 사유 추가·이름 수정·일부 끄기.
- 시험: 순수 함수 시험(전부 끔 → 저장 불가), SQL 시나리오(전부 `is_active=false` → 거부).
- 위험: 없음.

### D7 어드민 동네 자유 문자열
- 바꿀 곳: `app/api/admin/moim/moims/[moimId]/route.ts` `toPatch` — `lguId` 가 `lguPublicName(v)`(서버 전용, 만들기와 같은 동네 이름 단일 정의)로 이름이 안 나오면 400 `moim_region_invalid`. SQL `moim_admin_update_info` 에 만들기와 같은 형식 검사(`^[0-9A-Za-z:_-]{2,40}$`, §3-5). 화면: 입력칸 아래 「현재: {이름}」(`m.lguLabel`).
- 보는 것: 틀린 코드를 넣고 저장하면 「동네 코드를 찾을 수 없어요」, 시트는 그대로.
- 그대로: 올바른 PSGC·`KR:` 코드 저장.
- 시험: 라우트 — `"abc"` → 400 `moim_region_invalid`, RPC 호출 0. 올바른 코드 → RPC 호출.
- 위험: 운영에 이미 이상한 `lgu_id` 를 가진 모임이 있으면 그 모임은 동네를 다시 고칠 때만 걸린다(다른 칸 저장은 `lguId` 를 안 보내므로 영향 없음).

### D8 주제 변경 「바뀐 항목」 빈칸
- 바꿀 곳: 카탈로그 `admin_moim_info_field_topicLabel` 추가. 시험: 바뀐 항목 키 목록(`name…questions`, `topicLabel`)마다 키가 있는지 구조 확인.
- 보는 것: 「바뀐 항목: 주제」. 위험: 없음.

### D9 「검토 시작」 사유 없음 (계약 §8 「모든 쓰기는 사유 필수」)
- 바꿀 곳: `AdminMoimReportDecisionForm.tsx` 「검토 시작」 → `CommunityActionSheet`(사유 2자 이상), `reports/[reportId]/review/route.ts` 가 `reason` 을 받아(`moimAdminReason`) RPC 에 넘김, SQL `moim_admin_report_review(p_admin, p_report, p_reason)`(§3-5).
- 보는 것: 검토 시작도 사유 입력 → 운영기록에 그 사유. 그대로: 검토 중 신고의 처리 폼. 시험: 사유 없으면 400 `moim_admin_reason_required`. 위험: 옛 3인자 함수는 drop 후 새로 — 웹 배포 전 DB 먼저.

### D10 삭제 모임 신고 처리의 막힌 조치가 「대상 없음」
- 바꿀 곳: `MoimReportDecisionContext` 에 `moimStatus`(신고 상세 응답 `report.moim.status` 가 이미 있음) 추가 → 1-2 표로 콘텐츠 숨김·모임 제재 선택지를 숨기고 안내. SQL `moim_admin_report_decide` 의 삭제 모임 거부 코드를 `moim_deleted` 로(§3-1). 실패 문구 1-1.
- 보는 것: 삭제 모임 신고: 「삭제된 모임이라 콘텐츠 숨김·모임 제재는 할 수 없어요. 이용 제한과 기각만 할 수 있어요」, 선택지는 이용 제한·기각만.
- 그대로: 운영·종료 모임 신고 처리 전부. 시험: status=deleted → 선택지 렌더 0 / 서버 `moim_deleted` → 422 문장. 위험: 없음.

### D11 삭제 모임 제재 해제·숨김 해제·복구가 되고 알림이 열리지 않는 곳으로
- 바꿀 곳: SQL — `moim_admin_sanction_revoke`·`moim_admin_content`(전 동작)·`moim_admin_member_unban`·`moim_admin_member_remove` 에 §3-1 상태 검사(삭제 = `moim_deleted`). 화면 — 1-2 로 해당 버튼 숨김.
- 보는 것: 삭제 모임 상세에서 해제·숨김 해제·복구 버튼이 없고 안내만. 열 수 없는 곳으로 가는 알림이 생기지 않는다(조치 자체가 안 됨).
- 그대로: 모임 복구(최고관리자) 뒤에는 전부 다시 가능. 신고 처리 「이용 제한」은 삭제 모임에서도 가능(1-2) — 그 신고자 결과 알림의 이동 위치는 E4(서버·알림 설계자) 몫.
- 시험: SQL 시나리오 — 삭제 모임에서 4함수 각각 `moim_deleted`. 위험: 삭제 모임 정리용으로 어드민이 기대하던 동작이 있다면 막힌다 → 계약 P15 「삭제 = 소프트 삭제·복구 가능」과 맞음(복구 뒤 처리).

### D12 신고 처리 실패 안내에 원래 코드
- 바꿀 곳: 폼 `runReview`·`submit` 의 `setBanner({ message: r.code })` → `moimAdminFailureText`, 404·409 처리 → `moimAdminFailureKind`(1-1).
- 보는 것: 「입력 내용을 다시 확인해 주세요」 등 문장만. 시험: `invalid_request`·`http_500`·`network_error` 각각 문장에 코드 글자 없음. 위험: 없음.

### D13 동시 제재 해제 두 번째가 「대상 없음」
- 바꿀 곳: SQL `moim_admin_sanction_revoke` — 행 없음 = `moim_sanction_not_found`, 이미 해제 = `moim_conflict`, 모임 제재가 아님 = `moim_sanction_not_revocable`(§3-4). 같은 원리로 `moim_admin_member_unban` 이미 해제 = `moim_conflict`.
- 보는 것: 두 번째 관리자는 「다른 관리자가 먼저 바꿨어요」 + 새로 불러온 목록. 시험: 같은 id 로 두 번 해제 → 두 번째 409. 위험: 없음.

### D14 직접 제재 안내 옛 문구(신고 연결 칸과 모순)
- 바꿀 곳: `admin_moim_sanction_m6_note` ko·en 문장 교체(§5). 실제 동작 확인: `moim_admin_sanction_apply` 는 `source_report_id` 만 적고 신고 상태·신고자 알림은 안 바꾼다.
- 보는 것: 「신고자에게 결과를 알리는 처리는 「모임 신고 처리」에서 해요. 여기서 거는 제재는 같은 모임의 처리 전 신고를 근거로 연결할 수 있어요(연결해도 신고 상태는 그대로예요)」. 위험: 없음.

### D15 연결할 신고 최근 50건만
- 바꿀 곳: 상세 API `section=reports` 에 `open=1`(상태 `received·reviewing` 만) 추가(`loadAdminMoimSection` opts), `MoimSanctionApplySheet` 가 `useMoimSection(moimId, "reports", { open: "1" })` + limit 100(최대). 100건 넘으면 「처리 전 신고 최근 {n}건까지 보여요」.
- 보는 것: 처리 전 신고만, 최대 100건, 넘으면 안내. 그대로: 신고 탭 목록. 시험: open=1 이면 쿼리에 상태 조건. 위험: 없음. (처리된 신고를 서버가 거부하는 것은 E11 — 같은 SQL 함수라 §3-2 메모)

### D16 메신저 신고 보기에 대상 유형 필터 미적용
- 바꿀 곳: `AdminMoimReportsPage.tsx` — 메신저 보기에서는 모임 대상 유형 필터를 숨기고, 보기 전환 때 `type` 을 비운다(메신저 신고 유형과 모임 대상 유형은 1:1 이 아님).
- 보는 것: 메신저 보기에 적용되지 않는 필터가 없어진다. 시험: view=messenger 렌더에 필터 0. 위험: 없음.

### D17 원래 값 노출 3곳 (대상 상태 · 운영기록 종류 · report_not_found · CSV 카테고리)
- 바꿀 곳:
  - `AdminMoimReportsPage.tsx` `TargetPreview` 상태: 대상 종류별 기존 문구(글·댓글·사진 = `admin_moim_content_status_*`, 일정 = `moim_schedule_status_*_badge`, 모임 = `admin_moim_status_*`, 멤버 = `admin_moim_member_status_*`).
  - `MoimEventsPanel` 종류: `admin_moim_event_<type>` 문구, 모르는 종류는 `admin_moim_event_other` + 원래 값은 `AdminTechDetails`(접힌 기술 정보) 안에만. 종류 목록은 계약 상수 `MOIM_EVENT_TYPES`(§5 표) + 「마이그레이션 문자열 ⊂ 상수」 구조 확인.
  - `loadAdminMoimReportDetail` 오류 코드 `report_not_found` → `moim_report_not_found`(다른 모임 어드민 코드와 같은 규칙, 화면은 404 문장).
  - CSV(`app/api/admin/moim/moims/route.ts`): `category` 한 열 → `category_ko`·`category_en` 두 열.
- 보는 것: 대상 미리보기 「숨김」「모집 중」, 운영기록 「제재 적용」「가입 승인」, CSV 에 영어 카테고리. 위험: CSV 열 이름이 바뀜 → 이 CSV 를 읽는 자동화가 없는지 확인(저장소 검색 결과 없음).

### D18 영어 어드민의 로딩·실패·다시 시도가 한국어 (`ko` 항상 참)
- 바꿀 곳: 모임 어드민 5개 파일 13곳 `AdminLoadingState ko`·`AdminErrorState ko`·`AdminEmptyState ko` → `ko={language !== "en"}`. 모임 목록 화면이 쓰는 공용 `CommunityAdminKit.tsx` `CommunityListBody` 2곳도 같은 원인이라 같이 고친다(커뮤니티 어드민 다른 화면도 영어 사용자에게 영어로 보이게 됨 — 의도한 결과).
- 시험: 언어 en 렌더 → 「Loading」 류 문구. 위험: 없음.

### D19 정책 문구 「바로 모든 모임에 적용」(실제 화면 안내는 5분 캐시), 「빈칸 = 제한 없음」(이름·소개는 기본값)
- 바꿀 곳: `admin_moim_policies_notice` 문장 교체(서버 판정은 즉시, 앱 화면 글자 수 안내는 최대 5분 뒤 — `MOIM_TEXT_LIMITS_TTL_MS = 5분` 확인). 숫자 칸 placeholder: SQL 에서 확인된 기본값이 있는 4칸은 「비우면 기본 {n}」(`name_min_len`=1, `name_max_len`=60, `intro_min_len`=0, `intro_max_len`=2000 — `coalesce(...)` 확인), 나머지 11칸은 지금처럼 「제한 없음」. **나머지 11칸이 빈값일 때 실제로 검사를 안 하는지는 이번에 확인 못 함** → 구현자가 각 키 사용처를 확인하고 다르면 같은 방식으로 기본값 문구를 붙인다.
- 위험: 없음.

### D20 정책 영어 이름 비우면 영어 화면에 코드
- 바꿀 곳: `parseMoimAdminPolicyRows`(계약) 와 SQL `moim_admin_policies_save` 둘 다 금지 유형·신고 사유의 영어 이름 1~80자 필수(§3-5). 화면 안내 문구 `admin_moim_policy_items_invalid` 를 「한국어·영어 이름 둘 다」로.
- 보는 것: 영어 이름이 비면 저장 불가 + 안내. 위험: 운영 정책 행에 영어 이름이 빈 줄이 이미 있으면 다음 저장이 막힌다 → 적용 전 운영 조회(§3-5 확인 쿼리), 있으면 Owner 에게 그 줄을 알리고 영어 이름을 채운 뒤 적용.

### D21 어드민 이름·소개 입력 상한 60·2000 vs 정책 30·1000
- 바꿀 곳: `loadAdminMoimInfo` 가 `moim_policies` 에서 `name_min_len·name_max_len·intro_max_len` 을 같이 읽어 `limits` 로 돌려줌(어드민은 캐시 없이 직접 — 저장 직후 값). `InfoPanel` 의 `maxLength` 와 「{n}/{max}자」 표시를 그 값으로.
- 보는 것: 정책이 30자면 이름 칸이 30자에서 멈추고 숫자가 보인다. 위험: 어드민 상세 요청에 짧은 조회 1번 추가(어드민 경로, 요청 예산 표 대상인지 구현자가 `lib/perf/request-budget.ts` 확인).

### D22 삭제 안내 「보관돼요」가 실제와 다름 · 전원 알림 안내 없음
- 바꿀 곳: `admin_moim_delete_notice`·`admin_moim_restore_notice` 문장(§5). 실제: 삭제 = 방 읽기 전용(`moim__rooms_set_locked`) + 진행 일정 취소 + 멤버 전원 알림, 보관은 정책 「종료 모임 보관일」 뒤 보관 작업(R4 D-43). 복구 = 멤버 전원 알림, 보관 풀림.
- 위험: 없음.

### D23 메신저 방 상세에 모임 방 표시 없음 · 메신저 조치가 모임 운영기록에 안 남음
- 바꿀 곳:
  - `service.ts` `getAdminCommunityMessengerRoomDetail` 응답에 `moimRef: { moimId, scheduleId } | null`(`resolveMoimRooms` 재사용, 방 1개 조회 1~2번).
  - `AdminCommunityMessengerDetailPage.tsx`: 머리에 「모임 방」/「일정 방」 배지 + 「모임 어드민에서 보기」(`/admin/community/moims/{id}?tab=chats`, 1-4 권한 링크), 운영 조치 칸은 D5 안내.
  - 메시지 숨김·숨김 해제(`runCmMessageHiddenCas` 와 `service.ts` 메시지 동작)가 성공하고 방이 모임 방이면 새 RPC `moim_admin_log_room_action`(§3-7)을 부른다 → 모임 운영기록 `admin_messenger_message_hidden`/`_unhidden` + 숨김 해제면 그 메시지의 `content_hide` 제재 행 해제(D1 동기화).
- 보는 것: 메신저 어드민에서 모임 방인지 바로 알고 모임 어드민으로 갈 수 있다. 모임 운영기록에 「채팅 메시지 숨김(메신저 어드민)」 + 사유.
- 그대로: 메시지 숨김 자체·방 미리보기 정합(`syncRoomAfterAdminMessageVisibility`). 기록 RPC 실패는 숨김 결과를 바꾸지 않는다(경고 로그만 — 숨김은 이미 커밋됨).
- 시험: 모임 방 메시지 숨김 → RPC 호출 1, 일반 방 → 0. RPC 실패해도 응답 성공.
- 위험: 기록 RPC 가 숨김과 한 트랜잭션이 아님 → 드물게 기록 빠짐. 메신저 숨김 경로가 TS 2단계(CAS)라 같은 트랜잭션으로 묶을 수 없다(남은 위험으로 보고).

### D24 모임 권한만 있는 관리자에게 열 수 없는 링크
- 바꿀 곳: 메신저 방 링크 5곳(`InfoPanel` 대표 방, `MoimSchedulesPanel`, `MoimChatsPanel`, 신고 `TargetPreview`, 신고 화면 메신저 보기 「메신저 신고에서 처리」)을 `MoimAdminGatedLink` 로(1-4). 이용 제한 해제 링크(1-3)도 같은 부품.
- 보는 것: `chats` 권한이 없으면 링크 대신 「열 권한이 없어요」. 시험: actor 권한 `["moim"]` → 링크 0, `["moim","chats"]` → 링크. 위험: 없음. (회원 상세 링크 `/admin/users/…` 도 같은 문제일 수 있으나 감사 범위 밖 — 보고만)

### D25 쪽 넘김 2건 (댓글 필터 바꿔도 쪽 유지 · 비멤버 차단자 1쪽만)
- 바꿀 곳: `useMoimSection` — `extra` 가 바뀌면 쪽을 1로(직렬화한 extra 를 상태 키로). 멤버 섹션: 비멤버 차단자를 멤버 행에 섞지 않고 응답의 별도 칸 `bansWithoutMember`(모든 쪽 공통, 최대 200)로 → 멤버 탭 아래 작은 표 「모임에 없는 차단 사용자」(차단 해제 버튼 포함).
- 보는 것: 다른 글의 댓글을 누르면 1쪽부터. 비멤버 차단자는 쪽과 상관없이 따로 보인다. 그대로: 멤버 표 쪽 넘김·합계(멤버 행만 셈). 시험: offset=50 에서도 `bansWithoutMember` 같음. 위험: 없음.

### D26 삭제·복구 뒤 열린 탭 갱신 안 됨
- 바꿀 곳·보는 것: 1-5. 시험: status 바뀐 정보 응답 → 탭 본문 다시 마운트(조회 1회 더). 위험: 탭 안 쪽 번호가 1로 돌아감(의도).

### D27 처리 폼 「대상 작성자」 문구가 대상 종류와 안 맞음
- 바꿀 곳: `admin_moim_decide_who_target` 대신 `admin_moim_decide_who_target_<type>`(멤버 「신고된 멤버」·글 「글쓴이」·댓글 「댓글 쓴 사람」·사진 「사진 올린 사람」·일정 「일정 호스트」·메시지 「메시지 보낸 사람」). 대상이 모임이면 SQL 에서 target = 모임장이라 「모임장」 하나만 보인다.
- 위험: 없음.

### 신규1 멤버 탭 차단자 행 중복
- 원인: 비멤버 차단 판정을 **현재 쪽 행**과만 비교(`rows.some`) → 다른 쪽에 있는 차단 멤버가 1쪽에 또 나옴.
- 바꿀 곳: `loadAdminMoimSection` members — 활성 차단 사용자 id 로 `moim_members` 를 한 번 더 조회(`in user_id`)해 **모임 전체 기준**으로 멤버 행이 없는 사람만 `bansWithoutMember`(D25 와 같은 칸).
- 시험: 차단 멤버가 2쪽에 있을 때 1쪽 결과에 중복 0. 위험: 없음.

### 신규2 이미 숨긴 콘텐츠에 숨김 제재 행 또 생성
- 바꿀 곳: SQL `moim_admin_report_decide` — `v_changed=false` 면 `moim_sanctions` 를 만들지 않고, 그 대상의 진행 중 `content_hide` 행이 있으면 그 id 를 action 으로 연결(`changed:false`)(§3-2). 라우트는 이미 `changed=false` 면 알림을 보내지 않는다(확인함).
- 보는 것: 제재 탭·이력에 같은 콘텐츠 숨김 행이 하나만. 시험: 숨김 → 다른 신고로 또 숨김 처리 → 행 수 그대로. 위험: 없음.

### 신규3 묶음 보기에 모임 필터 미적용
- 바꿀 곳: `groupAdminMoimReports` 에 `moimId` 조건, `reports/route.ts` 가 묶음 보기에도 `moimId` 를 넘김.
- 보는 것: 모임 필터가 켜진 채 묶음 보기 → 그 모임 한 줄. 시험: 쿼리에 `eq(moim_id)`. 위험: 없음.

## 3. 서버에 필요한 것 (SQL 은 다른 설계자가 작성 — 이 절이 요구사항)

공통: 운영 현재 정의를 `pg_get_functiondef` 로 먼저 읽고 그 위에 고친다(저장소 최신 = 운영 지문 대조 완료라고 감사에 적혀 있음). 새 마이그레이션 1개 + 백업 정의 파일 + 로컬 Postgres 시나리오 파일(테스트 DB `dibay-test`·`dibay-reset-qa` 사용 금지). 운영 적용은 Owner 승인 뒤.

### 3-1. 모임 상태 검사 함수 하나 (D4·D10·D11)
- 새 `moim__admin_assert_state(p_moim uuid, p_need text) returns record`(또는 void): 없음 → `moim_not_found` · `deleted` → `moim_deleted` · `p_need='active'` 이고 `closed` → `moim_closed`. `for update` 잠금은 부르는 쪽이 지금처럼.
- 쓰는 곳(1-2 표와 1:1): `moim_admin_member_role`·`moim_admin_assign_host`·`moim_admin_host_request_decide` = `active` / `moim_admin_member_remove`·`moim_admin_member_unban`·`moim_admin_content`(전 동작)·`moim_admin_sanction_apply`·`moim_admin_sanction_revoke`·`moim_admin_update_info` = `not_deleted` / `moim_admin_report_decide` 의 콘텐츠 숨김·모임 제재 = `not_deleted`(지금 `moim_not_found` → `moim_deleted`).
- 사용자용 `moim_*` 함수는 바꾸지 않는다(코드가 사용자 화면에 나가지 않게).

### 3-2. `moim_admin_report_decide` (D3 · 신규2 · D10)
- 모임 제재: 같은 모임·같은 `level`·진행 중(`revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now())`) 행이 있으면 INSERT 하지 않고 그 id 를 `v_sid` 로, action 에 `duplicate:true`. `platform_refresh` 는 불러도 무해.
- 콘텐츠 숨김: `v_changed=false` 면 INSERT 하지 않고 같은 대상 진행 중 `content_hide` 행 id(없으면 null)를 action 에, `changed:false`.
- 삭제 모임 거부 코드 `moim_deleted`(3-1).
- **같은 함수의 E1(다른 모임 신고까지 닫힘)·E11(처리된 신고 연결) 수정과 한 번에 써야 한다** — 이 설계는 E 쪽 조건을 바꾸지 않는다. 신고 상세의 「같은 대상 열린 신고 수」(`loadAdminMoimReportDetail` `openSame`)와 같은 대상 이력에도 `moim_id` 조건이 없음 → E1 설계자에게 같이 넘김.

### 3-3. 제재 행 동기화 (D1·D2)
- 새 열 `moim_sanctions.community_sanction_id uuid null`(+ 부분 인덱스). `moim_admin_report_decide` 의 이용 제한 INSERT 에 `v_restrict->>'id'` 를 채운다(중복으로 기존 커뮤니티 제한을 쓴 경우도 그 id).
- 기존 행 채우기: `public.sanctions` 에서 `source_report_id = moim_sanctions.source_report_id and source_report_kind='moim' and user_id = target_id` 로 매칭. 못 찾는 행(중복 재사용) 수를 운영에서 세어 보고 — 남는 행은 null 로 두고 화면은 지금 `ends_at` 기준 상태(1-3 링크는 `userId` 만).
- AFTER UPDATE OF `revoked_at, end_at` ON `public.sanctions` 트리거: `moim_sanctions` 의 같은 `community_sanction_id` 행에 `revoked_at/revoked_by`·`ends_at` 을 맞춘다. 모임 표만 쓴다.
- `moim_admin_content` 의 `restore`·`undelete`(→ active) 성공 시: `target_kind='content' and target_id=p_id and level='content_hide' and revoked_at is null` 행에 `revoked_at=now(), revoked_by=p_admin`.
- 채팅 메시지 숨김 해제는 3-7 RPC 가 같은 처리.

### 3-4. `moim_admin_sanction_revoke` · `moim_admin_member_unban` (D13 · D1 · D11)
- revoke: 행 없음 `moim_sanction_not_found` · `target_kind<>'moim'` → `moim_sanction_not_revocable` · 이미 해제 → `moim_conflict` · 삭제 모임 → `moim_deleted`.
- unban: 활성 차단 없음이지만 해제된 차단 행이 있으면 `moim_conflict`, 차단 기록 자체가 없으면 `moim_ban_not_found` · 삭제 모임 → `moim_deleted`.
- `moim_admin_sanction_apply`: 같은 단계 진행 중 → `moim_sanction_already_active`(지금 `moim_conflict`). 다른 모임 신고 연결 → `moim_report_link_invalid`(지금 `moim_report_not_found` 404 → 「대상 없음」이 됨; E11 의 「처리된 신고」도 같은 코드로 — E 설계자와 맞춤).

### 3-5. 입력 검사 (D6 · D7 · D9 · D20)
- `moim_admin_policies_save`: 신고 사유 목록에 `is_active=true` 가 0개면 `moim_policy_report_reason_none_active`. 금지 유형·신고 사유의 `label_en` 1~80자 필수(지금 0~80). 적용 전 확인 쿼리: `select x->>'code' from moim_policies, jsonb_array_elements(report_reasons||prohibited_types) x where id=1 and btrim(coalesce(x->>'label_en',''))=''` (읽기 전용 감싸기).
- `moim_admin_update_info`: `lgu_id` 가 주어지면 `^[0-9A-Za-z:_-]{2,40}$` 아니면 `moim_region_invalid`(라우트가 이름 사전으로 먼저 거름 — SQL 은 마지막 방어).
- `moim_admin_report_review(p_admin, p_report, p_reason)`: `moim__admin_reason(p_reason)` 로 검사·기록(지금 고정 문자열 `'review'`). 옛 2인자 함수 drop.

### 3-6. 트리거 `cm_moim_guard_rooms` (D5)
- 막는 칸 목록에 `new.room_status is distinct from old.room_status` 추가(모임 함수는 `moim__writer_on` 이라 통과 — 모임 함수는 `room_status` 를 쓰지 않음 확인함).
- 같은 마이그레이션에서 먼저 셈: `select room_status, count(*) from community_messenger_rooms where owner_domain='moim' and coalesce(room_status,'active')<>'active' group by 1`. 0이면 그대로, 있으면 백업 표에 담고 `active` 로 되돌림(메신저 어드민이 만든 값 — 모임 함수는 이 열을 쓰지 않으므로 규정상 되돌리는 것이 맞다) + 열 대조 보고.
- hard-lock 문서 :190 「막힌 메신저 쪽 쓰기」에 「방 상태(`room_status` — 차단·보관)」 추가, 거부 코드 `moim_room_managed_by_moim`.

### 3-7. 새 RPC `moim_admin_log_room_action` (D23 · D1)
- `(p_admin uuid, p_room uuid, p_type text, p_target uuid, p_reason text) returns jsonb`, security definer, service_role 만 실행.
- 방 → 모임: `owner_domain='moim'` 의 `owner_ref_id` 가 모임이면 그 id, 일정이면 일정의 `moim_id`. 모임 방이 아니면 `{ok:false, error:'moim_room_not_moim'}`(호출부는 무시).
- `p_type in ('admin_messenger_message_hidden','admin_messenger_message_unhidden')` 만 허용 → `moim__admin_log(...)`. unhidden 이면 3-3 처럼 그 메시지의 `content_hide` 행 해제.

### 3-8. 읽기 쿼리(TS, SQL 설계 아님 · 참고)
D2 `listAdminMoimSanctions` 필터, D15 `open=1`, D25·신규1 `bansWithoutMember`, 신규3 묶음 `moimId`, D21 `limits`, D23 `moimRef`. 모두 운영 열 이름은 `information_schema.columns` 로 먼저 확인.

## 4. 문서 정정

### 4-1. 계약 `docs/design/moim/moim-design-v1-2026-11-12.md`
- §8 「└ 채팅」 줄: 「모임 방·일정 방 목록 → 기존 메신저 어드민 화면으로 이동(메시지 숨김). **방 차단·보관·읽기 전용은 모임 상태(차단·종료·삭제)에 따라 모임 함수가 정하고, 메신저 어드민은 모임 방에서 이 조치를 거부한다**(Owner 2026-11-28 D-충돌 → R4 §5(c))」.
- §8 「제재 이력」 줄: 「모임·콘텐츠·사용자 제재 목록(대상 종류·회원 필터). 해제는 모임 제재만 여기서, 콘텐츠는 콘텐츠 복구, 이용 제한은 기존 회원 활동 제한 화면(P14)」.
- P14 표 `warn` 칸 아래: 「위임 불가는 모임 안 위임(모임장 → 멤버)만이다. 어드민의 모임장 지정·미접속 위임 요청 승인은 경고 중에도 할 수 있다(어드민 권한 · Owner 2026-11-28 E18)」.
- §8 공통 규칙: 「삭제된 모임은 복구 전까지 조회만(신고의 이용 제한·기각 제외). 종료된 모임은 역할 변경·모임장 지정 불가」(1-2 표).

### 4-2. `docs/dibay-messenger-domain-group-hard-lock.md` :190 — 3-6.

## 5. 새 문구 키 (ko / en) — `lib/i18n/catalog/admin-moim.ts` (+ 오류는 `moim-core.ts`, 메신저는 `admin-community-messenger.ts`)

오류 (`moim-core.ts`, `moim_err_<code>`)

| 키 | ko | en |
|---|---|---|
| moim_err_moim_closed | 종료된 모임이라 할 수 없어요 | This group is closed, so you can't do this |
| moim_err_moim_deleted | 삭제된 모임이라 할 수 없어요. 복구한 뒤 다시 해 주세요 | This group was deleted. Restore it first |
| moim_err_moim_sanction_not_revocable | 이 제재는 여기서 해제하지 않아요 | This action can't be lifted here |
| moim_err_moim_sanction_already_active | 같은 단계 제재가 이미 진행 중이에요 | The same action is already on |
| moim_err_moim_region_invalid | 동네 코드를 찾을 수 없어요 | We can't find that area code |
| moim_err_moim_policy_report_reason_none_active | 신고 사유를 하나 이상 켜 두세요 | Keep at least one report reason on |
| moim_err_moim_report_link_invalid | 같은 모임의 처리 전 신고만 연결할 수 있어요 | You can only link open reports from this group |
| moim_err_moim_room_managed_by_moim | 모임 채팅방은 모임 어드민에서 처리해 주세요 | Use Groups admin for group chats |

메신저 어드민 (`admin-community-messenger.ts`)

| 키 | ko | en |
|---|---|---|
| admin_cm_moim_room_managed_by_moim (기존 `…readonly…` 키 대체) | 모임 채팅방의 차단·보관·읽기 전용은 모임 상태에 따라 정해져요. 모임 어드민에서 처리해 주세요 | For group chats, block, archive and read only follow the group. Use Groups admin |
| admin_cm_moim_room_badge | 모임 방 | Group chat |
| admin_cm_moim_schedule_room_badge | 일정 방 | Meetup chat |
| admin_cm_moim_room_open_admin | 모임 어드민에서 보기 | Open in Groups admin |

모임 어드민 (`admin-moim.ts`)

| 키 | ko | en |
|---|---|---|
| admin_moim_err_generic | 처리하지 못했어요. 잠시 후 다시 해 주세요 | Couldn't finish. Try again soon |
| admin_moim_err_network | 인터넷 연결을 확인해 주세요 | Check your connection |
| admin_moim_err_invalid_request | 입력 내용을 다시 확인해 주세요 | Check what you entered |
| admin_moim_state_note_closed | 종료된 모임이에요. 역할 변경·모임장 지정은 할 수 없어요 | This group is closed. You can't change roles or pick an organizer |
| admin_moim_state_note_deleted | 삭제된 모임이에요. 복구하기 전에는 조치할 수 없어요 | This group was deleted. Restore it before taking action |
| admin_moim_decide_deleted_note | 삭제된 모임이라 콘텐츠 숨김·모임 제재는 할 수 없어요. 이용 제한과 기각만 할 수 있어요 | This group was deleted. You can only restrict a member or dismiss |
| admin_moim_decide_duplicate_note | 이미 진행 중인 같은 제재를 근거로 연결했어요 | Linked to the same action that's already on |
| admin_moim_decide_who_target_member | 신고된 멤버 | Reported member |
| admin_moim_decide_who_target_post | 글쓴이 | Post author |
| admin_moim_decide_who_target_comment | 댓글 쓴 사람 | Comment author |
| admin_moim_decide_who_target_album | 사진 올린 사람 | Photo uploader |
| admin_moim_decide_who_target_schedule | 일정 호스트 | Meetup host |
| admin_moim_decide_who_target_chat_message | 메시지 보낸 사람 | Message sender |
| admin_moim_review_notice | 신고를 검토 중으로 바꿔요. 사유는 운영기록에 남아요 | Moves the report to In review. The reason is saved in the log |
| admin_moim_info_field_topicLabel | 주제 | Topic |
| admin_moim_field_lgu_current | 현재: {name} | Now: {name} |
| admin_moim_field_text_count | {n}/{max}자 | {n}/{max} |
| admin_moim_col_kind | 종류 | Type |
| admin_moim_sanction_kind_moim | 모임 | Group |
| admin_moim_sanction_kind_content | 콘텐츠 | Content |
| admin_moim_sanction_kind_user | 사용자 | Member |
| admin_moim_sanction_kind_filter | 대상 종류 | Applies to |
| admin_moim_sanction_target_moim | 모임 전체 | Whole group |
| admin_moim_sanction_followup_content | 콘텐츠 탭에서 숨김 해제 | Unhide it in the content tab |
| admin_moim_sanction_followup_schedule | 일정 취소는 되돌릴 수 없어요 | Canceled meetups can't be restored |
| admin_moim_sanction_followup_message | 메신저 어드민에서 숨김 해제 | Unhide it in Messenger admin |
| admin_moim_sanction_followup_user | 회원 활동 제한에서 해제 | Lift it in Member restrictions |
| admin_moim_sanction_user_only | 이 회원만 | This member only |
| admin_moim_link_no_access | 열 권한이 없어요 | No access |
| admin_moim_link_reports_limited | 처리 전 신고 최근 {n}건까지 보여요 | Showing the latest {n} open reports |
| admin_moim_members_banned_outside_title | 모임에 없는 차단 사용자 | Blocked people not in the group |
| admin_moim_policy_default_n | 비우면 기본 {n} | Empty = default {n} |
| admin_moim_policy_reasons_need_active | 신고 사유를 하나 이상 켜 두세요 | Keep at least one report reason on |
| admin_moim_event_other | 기타 기록 | Other |

바꾸는 문장 (키 그대로)

| 키 | ko | en |
|---|---|---|
| admin_moim_sanction_m6_note | 신고자에게 결과를 알리는 처리는 「모임 신고 처리」에서 해요. 여기서 거는 제재는 같은 모임의 처리 전 신고를 근거로 연결할 수 있어요. 연결해도 신고 상태는 그대로예요 | To close a report and notify the reporter, use Moim reports. Here you can link an open report from this group as the basis. Linking doesn't change the report |
| admin_moim_delete_notice | 최고관리자만 할 수 있어요. 모임이 보이지 않고 채팅방은 읽기 전용이 돼요. 진행 중 일정은 취소되고, 멤버 전원에게 알림이 가요. 「종료 모임 보관일」이 지나면 멤버 채팅 목록에서 보관돼요. 나중에 복구할 수 있어요 | Super admins only. The group is hidden and its chats become read only. Open meetups are canceled and all members are notified. After the closed-group keep period, chats are archived for members. You can restore it later |
| admin_moim_restore_notice | 종료 기록이 있으면 종료 상태로, 없으면 운영 상태로 돌아가요. 보관된 채팅방은 다시 보이고, 멤버 전원에게 알림이 가요. 취소된 일정은 되살리지 않아요 | Returns closed if it was closed, otherwise active. Archived chats come back and all members are notified. Canceled meetups stay canceled |
| admin_moim_policies_notice | 저장하면 서버 판정에 바로 쓰여요. 앱 화면의 안내(글자 수 등)는 최대 5분 뒤에 바뀌어요 | Saved values apply to checks right away. App hints like text limits update within 5 minutes |
| admin_moim_policy_items_invalid | 코드는 영어 소문자·밑줄 2~40자, 한국어·영어 이름은 둘 다 1~{len}자로 적어 주세요 | Use 2–40 lowercase letters or _ for the code, and 1–{len} characters for both names |

운영기록 종류 `admin_moim_event_<type>` (D17 · 마이그레이션에서 찾은 값 — 구현 때 구조 확인 시험이 빠진 값을 잡는다)

| type | ko | en |
|---|---|---|
| created | 모임 만듦 | Group created |
| info_updated | 정보 수정 | Info edited |
| closed | 모임 종료 | Group closed |
| closed_retention_ended | 종료 모임 열람 기간 끝남 | View period ended |
| member_joined | 멤버 가입 | Member joined |
| member_left | 멤버 나감 | Member left |
| member_unbanned | 차단 해제 | Unblocked |
| role_changed | 역할 바뀜 | Role changed |
| permissions_updated | 권한 바꿈 | Permissions changed |
| host_changed | 모임장 바뀜 | Organizer changed |
| host_transfer_requested | 위임 요청 | Handover requested |
| host_transfer_declined | 위임 거절 | Handover declined |
| host_inactive_requested | 미접속 모임장 변경 요청 | Inactive-organizer request |
| join_requested | 가입 신청 | Join requested |
| join_approved | 가입 승인 | Join approved |
| join_rejected | 가입 거절 | Join declined |
| join_cancelled | 가입 신청 취소 | Join request canceled |
| join_expired | 가입 신청 만료 | Join request expired |
| invite_sent | 초대 보냄 | Invite sent |
| invite_link_created | 초대 링크 만듦 | Invite link created |
| invite_link_revoked | 초대 링크 끔 | Invite link turned off |
| board_saved | 게시판 저장 | Board saved |
| post_created | 글 작성 | Post added |
| post_updated | 글 수정 | Post edited |
| post_hidden | 글 숨김 | Post hidden |
| post_deleted | 글 삭제 | Post deleted |
| comment_created | 댓글 작성 | Comment added |
| album_added | 사진 올림 | Photo added |
| album_hidden | 사진 숨김 | Photo hidden |
| profile_updated | 모임 프로필 수정 | Group profile edited |
| note_set | 메모 저장 | Note saved |
| note_deleted | 메모 삭제 | Note deleted |
| report_created | 신고 접수 | Report filed |
| sanction_expired | 제재 기간 끝남 | Action period ended |
| schedule_created | 일정 만듦 | Meetup created |
| schedule_updated | 일정 수정 | Meetup edited |
| schedule_cancelled | 일정 취소 | Meetup canceled |
| schedule_done | 일정 끝남 | Meetup ended |
| schedule_requested | 일정 참여 신청 | Meetup request |
| schedule_joined | 일정 참여 | Joined meetup |
| schedule_left | 일정 참여 취소 | Left meetup |
| schedule_participant_removed | 일정 참여자 제외 | Removed from meetup |
| schedule_host_reassigned | 일정 호스트 바뀜 | Meetup host changed |
| schedule_room_archived | 일정 방 보관 | Meetup chat archived |
| attendance_set | 출석 체크 | Attendance set |
| admin_info_updated | 정보 수정 | Info edited |
| admin_deleted | 모임 삭제 | Group deleted |
| admin_restored | 모임 복구 | Group restored |
| admin_role_changed | 역할 변경 | Role changed |
| admin_host_assigned | 모임장 지정 | Organizer assigned |
| admin_host_request_approved | 모임장 변경 요청 승인 | Organizer request approved |
| admin_host_request_declined | 모임장 변경 요청 거절 | Organizer request declined |
| admin_member_removed | 내보내기 | Removed |
| admin_member_banned | 차단 | Blocked |
| admin_member_unbanned | 차단 해제 | Unblocked |
| admin_sanction_applied | 제재 적용 | Action applied |
| admin_sanction_revoked | 제재 해제 | Action lifted |
| admin_schedule_cancelled | 일정 취소 | Meetup canceled |
| admin_report_reviewing | 신고 검토 시작 | Report review started |
| admin_report_actioned | 신고 조치 | Report actioned |
| admin_report_dismissed | 신고 기각 | Report dismissed |
| admin_post_hide / _restore / _delete / _undelete | 글 숨김 / 글 숨김 해제 / 글 삭제 / 글 삭제 복구 | Post hidden / Post unhidden / Post deleted / Post undeleted |
| admin_comment_hide / _restore / _delete / _undelete | 댓글 숨김 / 댓글 숨김 해제 / 댓글 삭제 / 댓글 삭제 복구 | Comment hidden / unhidden / deleted / undeleted |
| admin_album_hide / _restore / _delete / _undelete | 사진 숨김 / 사진 숨김 해제 / 사진 삭제 / 사진 삭제 복구 | Photo hidden / unhidden / deleted / undeleted |
| admin_category_created / admin_category_updated | 카테고리 추가 / 카테고리 수정 | Category added / Category edited |
| admin_policies_updated | 운영 정책 저장 | Policies saved |
| admin_messenger_message_hidden / _unhidden (신규) | 채팅 메시지 숨김(메신저 어드민) / 채팅 메시지 숨김 해제(메신저 어드민) | Chat message hidden (Messenger admin) / unhidden (Messenger admin) |

검사: `npm run check:i18n-quality`(파일별 개수 증가 금지 규칙 — 한국어 문자열·삼항 추가 없음).

## 6. 검증 계획 (구현 단계 — 로컬 1회)
- `npm run typecheck:build` · 변경 관련 vitest(새: `moim-admin-errors`·`moimAdminAllowedActions`·`moimSanctionRowView`·가드 CAS·신고 시트 선택지·정책 순수 함수·이벤트 키 구조 확인) · 변경 파일 eslint · `npm run check:i18n-quality` · PR 전 `npm run typecheck:test`·`npm run test:ci`.
- SQL: 로컬 Postgres 시나리오 파일(§3 각 항목 성공·거부 1개씩). 운영 적용 뒤 함수 정의 지문 대조, 3-3 채우기 행 수·3-6 되돌린 행 수 보고.
- 화면(운영): 코드 PASS 만으로 완료라 하지 않는다. 운영 어드민에서 확인할 항목 — 종료 모임 멤버 탭, 삭제 모임 상세·신고 처리, 제재 이력 대상 종류, 메신저 방 상세의 모임 방 안내. 운영 사이트를 자동화 브라우저로 여는 것은 실행 상한(10회) 안에서.

## 7. 바뀌는 파일

화면·서버(TS)
- `components/admin/moim/AdminMoimDetailPage.tsx` (D1·D4·D8 표시·D11·D14·D15·D21·D25·D26)
- `components/admin/moim/admin-moim-detail-panels.tsx` (D11·D17 이벤트·D18·D24·D25)
- `components/admin/moim/admin-moim-shared.tsx` (1-1 `moimAdminSend`·1-4 `MoimAdminGatedLink`)
- `components/admin/moim/AdminMoimReportDecisionForm.tsx` (D9·D10·D12·D27)
- `components/admin/moim/AdminMoimReportsPage.tsx` (D16·D17 대상 상태·D18·D24·신규3)
- `components/admin/moim/AdminMoimSanctionsPage.tsx` (D1·D2)
- `components/admin/moim/AdminMoimPoliciesPage.tsx` (D6·D18·D19·D20)
- `components/admin/moim/AdminMoimCategoriesPage.tsx`·`AdminMoimHostRequestsPage.tsx` (D18·1-1 문구)
- `components/admin/community/kit/CommunityAdminKit.tsx` (D18 `CommunityListBody`)
- `components/admin/chats/AdminChatActionSheet.tsx` (1-1 `message` 칸 · D5 코드)
- `components/admin/chats/AdminChatSheets.tsx`·`AdminChatReportQueuePage.tsx` (D5 신고 선택지)
- `components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx` (D5·D23)
- `lib/admin/moim/moim-admin-contract.ts` (1-2·1-3·상수·D20 검사·이벤트 목록)
- 새 `lib/admin/moim/moim-admin-errors.ts` (1-1)
- `lib/admin/moim/moim-admin-route.server.ts` (1-1 번호표)
- `lib/admin/moim/moim-admin-queries.server.ts` (D1·D2·D15·D17·D21·D25·신규1·신규3)
- `lib/admin-community-messenger/moim-room-admin-guard.ts`·`admin-chat-moderation-cas.ts`·`service.ts` (D5·D23)
- `app/api/admin/moim/moims/[moimId]/route.ts` (D7·D15 파라미터), `…/moims/route.ts` (D17 CSV), `…/reports/route.ts` (신규3), `…/reports/[reportId]/review/route.ts` (D9), `…/reports/[reportId]/decision/route.ts` (D3), `…/sanctions/route.ts` (D2)
- 카탈로그 `lib/i18n/catalog/admin-moim.ts`·`moim-core.ts`·`admin-community-messenger.ts`
- 시험 파일(새·수정) — 위 §6

DB
- 새 마이그레이션 1개(§3-1~3-7) + 백업 정의 + 로컬 시나리오

문서
- `docs/design/moim/moim-design-v1-2026-11-12.md` §8·P14 (§4-1)
- `docs/dibay-messenger-domain-group-hard-lock.md` :190 (§3-6)

## 8. 남은 것

- **Owner 결정: 없음.** (D-충돌·E18·D6 은 이미 정해짐. 3-6 의 모임 방 `room_status` 되돌리기는 R4 §5(c) 규정으로 정해지는 것이라 묻지 않는다.)
- Owner 승인이 필요한 절차(결정 아님): 운영 DB 적용(§3 마이그레이션) — 웹 병합보다 먼저.
- 확인 못 함 / 남은 위험:
  1. D19 — 기본값이 확인된 4칸 외 11칸이 「빈칸 = 검사 안 함」인지 이번에 확인 못 함(구현 때 키별 사용처 확인).
  2. D20 — 운영 정책 행에 영어 이름이 빈 줄이 있는지 미확인(적용 전 조회).
  3. 3-3 — 기존 이용 제한 행 중 커뮤니티 제재와 매칭 안 되는 수 미확인.
  4. 3-6 — 운영 모임 방 중 `room_status` 가 active 가 아닌 수 미확인.
  5. D23 — 메신저 메시지 숨김과 모임 운영기록이 한 트랜잭션이 아님(드물게 기록 빠짐).
  6. 범위 밖 관찰(고치지 않음, 보고만): 회원 상세 링크(`/admin/users/…`)도 모임 권한만 있는 관리자에게 열리지 않을 수 있음(D24 와 같은 종류, 감사 목록에 없음).
  7. 같은 SQL 함수를 E1·E11·E4(서버·알림 설계)가 함께 고친다 → `moim_admin_report_decide`·`moim_admin_sanction_apply` 는 한 사람이 한 정의로 합쳐 써야 충돌이 없다.

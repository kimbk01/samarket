# DIBAY 「모임」 신규 설계안 v1 (2026-11-12)

- 근거 지시 (Owner, 2026-11-12):
  > 기존의 디바이의 모임 형태는 실패적인 부분이다. 모두 삭제해도 되는 부분이다. 다시 신규로 설계되는 부분이고, 정확한 모임 형태를 위한 그룹채팅과 구분? 알림부분? 생성? 참여부분? 초대 부분등등의 정확한 프로세스별 구현이 되어야 하는 부분이다 … 어드민에서는 별도의 항목 관리 신고 처리 삭제 수정 등등의 내용이 필요 … 익명? 실명? 등등
- 선행 감사: `docs/audit/meetings-moim-audit-design-2026-11-12.md` (현행 결함, 당근 FAQ 원문 분석)
- 화면 시안: `docs/design/moim/moim-mockup-2026-11-12.html`
- 상태: **설계안. 아직 구현하지 않았고, 운영 DB 도 바꾸지 않았다.** 운영 DB 조회는 읽기 전용으로만 했다.

---

## 0. 한 장 요약

**모임이란 무엇인가**
- 모임은 **동네(도시·LGU) 단위의 지속 커뮤니티**다. 멤버, 역할, 게시판, 일정(정모), 앨범을 갖는다.
- 채팅은 모임에 **딸린 방**이다. 모임 채팅방에는 모임 멤버만 자동으로 들어간다.

**옛 구조는 전부 지운다**
- 옛 모임 코드·테이블·문서를 모두 지운다. 테이블 26개, API 25개, 화면 컴포넌트 약 20개, 메신저 결합 코드 6곳이다.
- 운영 데이터가 0건이라 옮길 데이터가 없다.
- 새 도메인 이름은 **`moim`**(테이블 접두 `moim_`)으로 정한다. 옛 `meetings` 와 메신저의 `group` 이름과 섞이지 않게 하기 위해서다.

**채팅 3종 경계는 바꾸지 않는다**
- 모임 채팅은 `community` 메신저(3종 중 하나) 안의 그룹방이다.
- `chat_domain='group'` 을 그대로 쓰고, 새 채팅 종류를 만들지 않는다.
- 방에 **「소유 모임」 표시 열**만 추가한다(§3.3).

**멤버 자격은 모임이 정한다**
- 모임 채팅방의 입장·내보내기·차단은 **모임 서버만** 한다.
- 메신저 방 안에서는 초대 링크, 내보내기, 차단, 나가기 버튼을 감춘다. 이 기능들은 모임 화면에서 한다.

**신원: 「전화 인증 회원 + 모임별 프로필」(익명 아님, 실명 강제도 아님)**
- 근거: 당근도 실명·전화번호 요구를 **정책 위반**으로 금지한다(FAQ 3730).
- 근거: DIBAY 에는 실명 인증 수단이 없다. 운영 `profiles.realname_verified` 는 0/142건이다.

**프로세스 16개 정의**
- 개설, 탐색, 가입, 초대, 탈퇴, 내보내기·차단, 역할, 위임, 게시판, 일정, 채팅, 알림, 신고, 제재, 종료·삭제, 어드민.

---

## 1. 지울 것 (옛 모임 전부)

| 구분 | 대상 |
|---|---|
| DB 테이블 (26) | `meetings`<br>`meeting_members`, `meeting_join_requests`, `meeting_join_questions`, `meeting_join_answers`, `meeting_member_bans`<br>`meeting_notices`, `meeting_events`<br>`meeting_feed_posts`, `meeting_feed_images`, `meeting_feed_comments`, `meeting_album_items`<br>`meeting_reports`, `meeting_action_logs`<br>`meeting_chat_rooms`, `meeting_chat_participants`, `meeting_open_chat_*` 10개<br>`_samarket_meeting_cm_backfill_work` |
| DB 함수·트리거 | `can_manage_meeting`, `has_joined_meeting_member`, `enforce_meeting_member_cap`, `refresh_meeting_room_stats`, `sync_meeting_chat_participant`<br>`log_meeting_*`, `after_meeting_*`, `meetings_sync_*`, `meeting_members_apply_defaults`, `touch_meeting_room_timestamp`<br>`admin_community_meetings_page`, `admin_meeting_reports_page` |
| 게시글 열 | `community_posts.is_meetup`, `meetup_date`, `meetup_place` (운영 0건) |
| 사용자 API | `app/api/community/meetings/**`, `app/api/philife/meetings/**`, `app/api/philife/meetup-feed-topics`<br>`app/api/community/neighborhood-posts` 의 meetup 분기 |
| 메신저 결합 | `lib/community-messenger/philife-meeting-open-group-summaries.ts`, `meeting-chat-sync.ts`, `home/fetch-meeting-deeplink.ts`<br>`app/api/community-messenger/rooms/[roomId]/meeting-ensure-participant`<br>`components/community-messenger/meetings/*`<br>`service.ts` 의 meetings 조인 부분(~6647-6722) |
| 화면 | `components/meetings/*`, `components/community/meeting/*`<br>`MeetingCard`, `MeetingJoinButton`, `MeetingHostControls` 등 `components/community/Meeting*`<br>`app/(main)/philife/meetings`, `app/(main)/community/meetings` |
| 어드민 | `/admin/community/meetings`, `/admin/philife/meetings`, `/admin/philife/meeting-reports`, `/admin/philife/meeting-events` 와 해당 API·컴포넌트<br>`admin-menu.ts` 항목, 대시보드 지표 2개 |
| 알림 | `notification-item-registry` 의 `community_meeting`, `community_meeting_decision` → `moim_*` 항목으로 교체 |
| 문서 | `docs/philife-meeting-room-architecture.md`, `docs/community-meeting-open-chat.md`, `docs/meeting-open-chat-line-ui-architecture.md`, `docs/meetings-schema.sql`<br>`docs/community-dangnae.md` 의 모임 절 |
| 주의 | `lib/neighborhood/meeting-password.ts` 의 `hashMeetingPassword` 는 **메신저 오픈그룹 비밀번호가 쓰고 있다**(`service.ts:259`). 지우지 말고 `lib/community-messenger/` 로 옮긴다 |

- 삭제는 별도 단계(M1)에서 한다. 운영 DB 적용은 Owner 승인을 받은 뒤에 한다.
- 삭제 전에 운영 행 수가 0건인지 **다시 조회**하고 결과를 보고한다.

---

## 2. 「모임」과 다른 채팅의 구분

| 항목 | 친구 그룹채팅 (`private_group`) | 오픈채팅 (`open_group`) | **모임 전체 채팅** | **모임 일정 채팅** |
|---|---|---|---|---|
| 무엇인가 | 아는 사람끼리 만든 대화방 | 누구나 찾아 들어오는 공개 대화방 | 모임 멤버 전원의 방 | 한 일정의 참여 확정자 방 |
| 만드는 곳 | 메신저 | 메신저 | **모임 개설 시 자동 생성** | **일정 생성 시 자동 생성** |
| 들어오는 방법 | 친구 초대·초대 링크 | 검색 후 바로/비밀번호 | **모임 가입 = 자동 입장** | **일정 참여 확정 = 자동 입장** |
| 나가는 방법 | 방 나가기 | 방 나가기 | **모임 탈퇴 = 자동 퇴장**(방에서 나가기 없음) | 일정 참여 취소·일정 종료 후 보관 |
| 내보내기·차단 | 방장·관리자(방에서) | 방장(방에서) | **모임에서만** | 일정 호스트가 일정에서 |
| 기록이 남는 곳 | 대화만 | 대화만 | 게시판·일정·앨범은 **모임 홈** | 일정 후기 게시판 |
| 표시 이름 | DIBAY 닉네임 | 닉네임 또는 방별 별명 | **모임별 프로필** | **모임별 프로필** |
| 탐색 노출 | 안 됨 | 오픈채팅 찾기 | **모임 찾기**(오픈채팅 목록에는 안 나옴) | 안 됨 |
| 메신저 목록 표시 | 그룹 | 오픈채팅 | **「모임」 배지 + 모임 이름** | **「일정」 배지 + 일정 제목** |
| 방 상단 | 방 정보 | 방 정보 | **「모임 홈」 버튼** | **「일정 보기」 버튼** |

**결정**
- 메신저의 「오픈채팅 → 모임 찾기」 진입(`/philife/write?category=meetup` 리다이렉트 포함)은 **모임 탭으로 옮긴다.**
- 오픈채팅은 오픈채팅으로만 남긴다. 운영의 기존 `open_group` 8개는 손대지 않는다.

---

## 3. 데이터 모델 (신규)

### 3.1 테이블

| 테이블 | 주요 열 |
|---|---|
| `moims` | `id`, `name`, `intro`, `cover_image_url`, `category_id`<br>`lgu_id`(개설자 기본 주소의 도시·LGU), `region_scope`(`city` \| `nearby` — 범위 정의는 D3)<br>`join_mode`(`instant` \| `approval`), `capacity`<br>`age_min_birth_year`, `age_max_birth_year`(D5), `show_age_band`(D5)<br>`host_user_id`, `status`(`active` \| `closed` \| `deleted`)<br>`platform_state`(`normal` \| `unlisted` \| `warned` \| `blocked`)<br>`member_count`, `last_activity_at`, `main_room_id`(메신저 방)<br>`created_at`, `updated_at`, `closed_at`, `deleted_at`, `deleted_by` |
| `moim_categories` | `id`, `slug`, `label_key`(i18n 키), `sort_order`, `is_active`, `is_restricted`(개설 금지 표시용) |
| `moim_members` | `moim_id`, `user_id`<br>`role`(`host` \| `co_host` \| `staff` \| `member`)<br>`status`(`pending` \| `active` \| `left` \| `kicked` \| `banned` \| `rejected`)<br>`nickname`, `avatar_url`, `bio`(모임별 프로필)<br>`joined_at`, `left_at`, `rejoin_count`, `invited_by`, `decided_by`, `decided_at`<br>고유: (`moim_id`, `user_id`) — 재가입은 같은 행을 갱신하고 `rejoin_count`+1 |
| `moim_join_questions` | `moim_id`, `order`, `text` (최대 3개) |
| `moim_join_requests` | `moim_id`, `user_id`, `answers`(jsonb), `status`(`pending` \| `approved` \| `rejected` \| `cancelled` \| `expired`), `reason`, `decided_by`, `decided_at` |
| `moim_bans` | `moim_id`, `user_id`, `banned_by`, `reason`, `created_at`, `released_at` |
| `moim_member_notes` | `moim_id`, `target_user_id`, `author_user_id`, `body` (운영진 메모, 당근 21033) |
| `moim_permissions` | `moim_id`, `action`, `min_role` — 조정 가능한 항목만 저장(§5) |
| `moim_invites` | `moim_id`, `token`, `created_by`, `expires_at`, `usage_count`, `revoked_at` (링크·QR) |
| `moim_invite_targets` | `moim_id`, `inviter_id`, `invitee_user_id`, `status`(`sent` \| `accepted` \| `declined` \| `expired`) (친구 직접 초대) |
| `moim_boards` | `moim_id`, `name`, `kind`(`notice` \| `free` \| `greeting` \| `review` \| `custom`), `write_min_role`, `sort_order` |
| `moim_posts` | `moim_id`, `board_id`, `author_id`, `title`, `body`, `images`, `visibility`(`members` \| `public`), `is_pinned`, `status`(`active` \| `hidden` \| `deleted`), `hidden_by`, `hidden_reason` |
| `moim_comments` | `post_id`, `author_id`, `body`, `status` |
| `moim_schedules` | `moim_id`, `host_user_id`, `title`, `starts_at`, `ends_at`, `place_text`, `place_lat`, `place_lng`, `description`, `capacity`<br>`join_mode`(`first_come` \| `approval`), `ask_motivation`<br>`status`(`recruiting` \| `full` \| `closed` \| `done` \| `cancelled`), `room_id`(일정 채팅) |
| `moim_schedule_participants` | `schedule_id`, `user_id`, `status`(`requested` \| `confirmed` \| `rejected` \| `cancelled` \| `removed`), `motivation`, `attendance`(`unknown` \| `present` \| `absent`) |
| `moim_album_items` | `moim_id`, `uploader_id`, `url`, `schedule_id?`, `is_pinned`(상단 고정 최대 6, 당근 14553), `status` |
| `moim_host_transfers` | `moim_id`, `from_user_id`, `to_user_id`, `kind`(`direct` \| `inactive_request` \| `admin`), `reason`, `actor_id`, `created_at` |
| `moim_reports` | `reporter_id`, `target_type`(`moim` \| `member` \| `post` \| `comment` \| `schedule` \| `album` \| `chat_message`), `target_id`, `moim_id`, `reason_code`, `detail`, `status`(`received` \| `reviewing` \| `actioned` \| `dismissed`), `action_id`, `handled_by`, `handled_at` |
| `moim_sanctions` | `moim_id`, `target_kind`(`moim` \| `host` \| `member` \| `content`), `target_id`, `level`(`unlist` \| `warn` \| `block` \| `content_hide` \| `user_restrict`), `reason_code`, `reason`, `source_report_id`, `actor_id`, `starts_at`, `ends_at`, `revoked_at`, `revoked_by` |
| `moim_events` | `moim_id`, `actor_id`, `actor_kind`(`user` \| `admin` \| `system`), `type`, `target_id`, `payload`, `created_at` — 모든 상태 변경을 기록하는 단일 운영 기록 |

### 3.2 권한·무결성 (DB 에서 강제)
- **모든 쓰기는 서버 서비스 롤 + SECURITY DEFINER RPC 로만 한다.** 클라이언트에는 쓰기 권한을 주지 않는다(RLS 는 읽기 정책만).
- 권한 판정 함수는 **하나**만 둔다: `moim_actor_can(moim_id, actor_id, action) → boolean`. TS 계약은 `lib/moim/moim-permission-contract.ts` 하나다. 모든 API 가 이 둘만 쓴다.
- 정원은 RPC 안의 `FOR UPDATE` 잠금으로 강제한다. 차단된 사용자의 재가입, 차단된 모임(`platform_state='blocked'`)의 가입·글·일정은 RPC 에서 거부한다.
- `moims.host_user_id` 와 `moim_members.role='host'` 는 항상 1:1 로 맞춘다. 위임 RPC 만 둘을 함께 바꾼다.

### 3.3 메신저 방 연결 (최소 변경)
- `community_messenger_rooms` 에 열 2개를 추가한다: `owner_domain text null`(`'moim'`), `owner_ref_id uuid null`(모임 id 또는 일정 id).
- **모임 방의 생성 규칙**:
  - `room_type='private_group'`, `chat_domain='group'`, `is_discoverable=false`
  - `invite_link_enabled=false`, `allow_member_invite=false`
  - `identity_policy='alias_allowed'`(모임별 프로필 이름 표시)
- **메신저 쪽 차단**: `owner_domain='moim'` 인 방에는 다음 RPC 가 **거부**하도록 한다.
  - 초대 링크, 가입 요청, 방 단위 내보내기·차단, 방 나가기, 방 삭제
  - 앱 화면에서도 해당 메뉴를 숨긴다.
- **참여자 동기화**: 모임 서버 RPC 안에서만 한다. `moim_member_activate`, `moim_member_deactivate`, `schedule_confirm` 이 메신저 참여자 행을 같은 트랜잭션에서 넣거나 `left_at` 을 채운다.
- **영향 범위**: 메신저 하드락 문서(`docs/dibay-messenger-domain-group-hard-lock.md`)와 그룹 RPC 6개를 바꿔야 한다. 이 변경은 **메신저 hard-lock 영역 변경**이므로 M2 착수 전에 Owner 승인을 받는다(D1).

---

## 4. 신원 (익명 · 실명)

| 안 | 내용 | 장점 | 문제 |
|---|---|---|---|
| A. 완전 익명 | 모임마다 아무 이름, 계정과 연결 안 보임 | 진입 부담 0 | 오프라인 만남 안전 관리 불가, 노쇼·사기 추적 불가 |
| B. 실명 강제 | 법적 이름 표시 | 신뢰 | DIBAY 에 실명 인증 수단 없음(운영 0/142). 당근도 실명 요구를 금지함(3730) |
| **C. 인증 회원 + 모임별 프로필 (권고)** | 개설·가입에 **전화 인증 필수**. 표시 이름은 모임마다 따로 정함(기본값 = DIBAY 닉네임) | 당근과 같은 구조(20832). 다른 멤버에게는 별명만 보이고, 플랫폼은 계정 단위로 추적 가능 | 전화 미인증 회원(운영 58/142)은 가입 전에 인증이 필요 |

**C 안의 세부 규칙**
- 다른 멤버에게 보이는 것: 모임별 닉네임·사진·소개, 역할 배지, 가입일, 재가입 횟수(운영진만).
- 보이지 않는 것: 전화번호, DIBAY ID, 실명, 주소.
- 운영진에게만 보이는 것: 가입 질문 답변, 운영진 메모, 재가입 횟수.
- 플랫폼 어드민: 실제 계정(회원 상세 링크)과 프로필 변경 이력을 볼 수 있다. 신고 처리용이다.
- 프로필 변경 이력은 다른 멤버에게 보이지 않는다(당근 20832). 이력 보관은 어드민용으로만 한다.
- 가입 질문에서 **실명·전화번호·신분증 요구를 금지**한다. 질문을 저장할 때 금지어를 검사하고, 저장 화면에 안내 문구를 띄운다(당근 3730).
- 연령 제한·연령대 표시를 쓰려면 생년월일이 필요하다. 지금 운영에서 `date_of_birth` 가 있는 회원은 8/142명이고, 성별 열은 없다 → **D5**.

---

## 5. 역할·권한

### 5.1 플랫폼(어드민)과 모임 안을 분리
- **플랫폼**: 슈퍼관리자, 그리고 **새 권한 키 `moim`** 을 가진 운영자. 하위 권한은 `moim.view` / `moim.edit` / `moim.sanction` / `moim.report`이고, `moim.delete` 는 슈퍼관리자만 갖는다. 지금처럼 `boards` 권한에 얹지 않는다.
- **모임 안**: 모임장(1명), 부모임장, 운영진, 멤버.
  - 부모임장과 운영진의 차이는 당근에서 확인하지 못했다.
  - 설계상 차이: 부모임장은 내보내기·차단까지 할 수 있고, 운영진은 승인·공지·게시판 관리까지만 할 수 있다(D4).

### 5.2 권한표 (기본값 / 모임장이 조정 가능한 항목은 「조정」)

| 행동 | 모임장 | 부모임장 | 운영진 | 멤버 |
|---|---|---|---|---|
| 모임 정보 수정(이름·소개·사진·카테고리·정원·가입 방식·질문) | O | X | X | X |
| 가입 승인·거절 | O | O | O (조정) | X |
| 초대 링크 만들기·끄기 | O | O | O (조정) | X |
| 친구 초대 보내기 | O | O | O | O (조정) |
| 공지 작성·고정 | O | O | O (조정) | X |
| 게시판 만들기·순서 | O | O | X | X |
| 글 숨김(모임 안) | O | O | O | X |
| 일정 만들기 | O | O | O | O (조정, 당근 기본값 = 멤버 누구나) |
| 일정 참여자 승인·내보내기 | 일정 호스트 + 모임장·부모임장 | ← | ← | 본인 일정이면 O |
| 멤버 내보내기 | O | O | X | X |
| 멤버 차단(재가입 금지) | O | O | X | X |
| 운영진 메모 | O | O (조정) | O (조정) | X |
| 역할 지정 | O | X | X | X |
| 모임장 위임 | O | X | X | X |
| 모임 종료 | O | X | X | X |

- 자기 자신은 내보내거나 차단할 수 없다. 하위 역할은 상위 역할을 내보낼 수 없다(메신저 하드락 원칙과 같다).

---

## 6. 프로세스별 설계

각 프로세스는 **주체 → 단계 → 서버 처리(RPC) → 알림 → 예외** 순서로 적는다. 알림 항목은 §7 표의 코드를 따른다.

### P1. 모임 개설
- **주체**: 전화 인증된 회원. 커뮤니티 쓰기 제한 상태면 불가(`assertCommunityWriteAllowed` 를 쓰되, 조회 실패 시 **거부**하도록 바꾼다).
- **단계** (5단계 마법사, 중간 저장 안 함):
  1. 카테고리 선택. 어드민 카테고리만 고를 수 있고, `is_restricted` 카테고리는 숨긴다.
  2. 이름(2~30자) · 소개(10~1,000자) · 대표 사진(선택). 글자 수 기준은 D6.
  3. 활동 동네(기본 주소의 도시, 바꾸려면 주소를 바꿔야 함), 모집 범위, 정원.
  4. 가입 방식(바로 가입 / 승인 후 가입), 가입 질문 0~3개, 연령(D5).
  5. 운영 규칙 동의(금지 모임 유형 목록) → 만들기.
- **서버**: `moim_create` RPC 하나의 트랜잭션으로 처리한다.
  - `moims` + 모임장 `moim_members`(role host, active) 생성
  - 기본 게시판 4개 생성(공지·자유·가입인사·일정후기)
  - 메신저 전체 채팅방 생성(§3.3) 후 `main_room_id` 연결
  - `moim_events('created')` 기록
- **알림**: 없음(본인 화면에 완료 표시).
- **예외**:
  - 1인 개설 수 초과 → 거부(D6).
  - 같은 이름+동네 반복 생성 → 거부(당근 3730).
  - 금지어 → 거부.
  - 개설 사전 승인제는 두지 않는다(당근도 없음). 사후 신고·제재로 관리한다. 사전 승인 여부는 D7.

### P2. 탐색·노출
- **진입**: 모임 탭(D2) → 「내 모임」 + 「우리 동네 모임」 + 카테고리 칩(가로 스와이프, 잘림 없음) + 검색.
- **노출 조건**: 다음을 모두 만족하는 모임만 노출한다.
  - `status='active'`
  - `platform_state='normal'`
  - 같은 LGU, 또는 모집 범위 안
- **정렬**: 최근 활동(`last_activity_at`) → 멤버 수 → 생성일. 당근의 관심사 적합도·랭킹은 1차 범위에서 뺀다.
- `unlisted` / `warned` 모임은 검색·추천에서 빠진다. 링크·초대로는 들어올 수 있다.
- 모임 공개 페이지(비멤버)에서 보이는 것: 이름·소개·사진·카테고리·동네·멤버 수·다가오는 일정 제목·`public` 글. **멤버 목록은 멤버에게만** 보인다.

### P3. 가입
- **바로 가입**: [가입하기] → 모임별 프로필 확인(닉네임 기본값) → `moim_join` RPC.
  - RPC 처리: 정원·차단·연령 확인 → `active` → 메신저 방 입장 → 가입 인사 게시판 안내.
  - 알림: 모임장에게 `moim_member_joined`(묶음 알림, 끄기 가능).
- **승인 후 가입**: 질문 답변 → [가입 신청] → `moim_join_requests(pending)` + 멤버 `pending`.
  - 승인권자에게 `moim_join_requested`.
  - 승인 → `active` + 방 입장 + 신청자에게 `moim_join_approved`.
  - 거절 → `rejected` + 신청자에게 `moim_join_rejected`(사유 선택).
  - 신청자는 대기 중 취소할 수 있다.
  - 대기 신청은 14일 뒤 `expired` 로 바뀐다(기간은 D6).
- **재가입**:
  - 탈퇴했던 회원 → 다시 가입 가능, `rejoin_count`+1.
  - 내보내진 회원 → 다시 신청 가능.
  - **차단된 회원 → 불가**: 「가입할 수 없는 모임입니다」를 표시하고 사유는 보이지 않는다.
- **예외**:
  - 정원이 차면 「정원 마감」. 대기열은 두지 않는다.
  - 모임이 차단·종료 상태면 가입 버튼을 숨긴다.

### P4. 초대
- **초대 링크·QR**: 모임 홈 → [초대] → 링크 복사 / QR / 공유.
  - 링크 `/moim/i/{token}` 은 모임 공개 페이지로 열리고, 가입은 P3 의 가입 방식을 그대로 따른다. **링크가 승인을 건너뛰지 않는다.**
  - 링크는 만료일과 끄기를 설정할 수 있다.
  - 링크로 가입한 사람 수를 초대자별로 기록한다. 당근의 초대 랭킹은 1차 범위에서 뺀다.
- **친구 직접 초대**: [초대] → 메신저 친구 목록에서 선택 → `moim_invite_targets(sent)` → 받는 사람에게 `moim_invited`.
  - 받는 사람이 [수락] → P3 진행.
  - 승인제 모임이라도 **운영진이 보낸 초대는 승인을 건너뛴다.** 멤버가 보낸 초대는 승인이 필요하다.
  - [거절] → `declined`. 보낸 사람에게는 알리지 않는다.
- **차단·제한**:
  - 같은 사람에게 같은 모임 초대는 7일에 1번만 보낼 수 있다(D6).
  - 메신저에서 나를 차단한 사람에게는 보낼 수 없다.
  - 차단된 모임은 초대할 수 없다.

### P5. 탈퇴
- 멤버 → [모임 나가기] → 확인 → `left`, 메신저 모임·일정 방에서 퇴장(`left_at`). 참여 확정된 다가오는 일정은 자동 취소된다.
- 쓴 글·댓글은 남는다. 작성자 표시는 「나간 멤버」로 바뀐다. 삭제는 탈퇴 전에 직접 하도록 안내한다(당근은 탈퇴 후 삭제를 고객센터로 처리함, 31165).
- **모임장은 위임 전에는 나갈 수 없다**(P8). 멤버가 모임장 혼자이면 [모임 종료]를 안내한다(P15).

### P6. 내보내기 · 차단
- **내보내기**: 멤버 관리 → 대상 → [내보내기] → 사유 선택(선택) → `kicked` + 방 퇴장 + 대상에게 `moim_member_removed`. 재가입은 가능하다.
- **차단**: 위 동작 + `moim_bans` 기록 → 재가입·초대·링크 가입이 모두 불가. 차단 해제는 멤버 관리 → 차단 목록에서 한다.
- 다른 멤버에게는 알리지 않는다. 운영 기록(`moim_events`)에만 남는다.

### P7. 역할 지정 · 권한 설정
- 모임장 → 멤버 관리 → 대상 → [역할 변경] → 부모임장 / 운영진 / 멤버 → 대상에게 `moim_role_changed`.
- 모임장 → 설정 → [멤버 권한 관리] → §5.2 의 「조정」 항목을 켜거나 끈다. 메신저 방 권한(공지 고정 등)은 이 역할에 맞춰 서버가 같이 바꾼다.
- 역할 인원 상한은 D6.

### P8. 모임장 위임
- **직접 위임**: 모임장 → 설정 → [모임장 위임] → 활성 멤버 선택 → 상대에게 **수락 요청**.
  - 수락하면 즉시 교체되고, 이전 모임장은 부모임장이 된다. 전체 멤버에게 `moim_host_changed` 를 보낸다.
  - 모임에 경고가 걸려 있으면 위임할 수 없다(당근 3730).
- **미접속 위임**: 모임장이 30일 이상 접속하지 않으면(당근 34031), 부모임장·운영진이 모임 설정에서 [모임장 변경 요청]을 한다 → 어드민 큐에 등록 → 어드민이 확인하고 지정한다.
  - 최근 7일 안에 접속한 기록이 있으면 요청이 거부된다.
  - 자동 위임은 하지 않는다(D8).
- **어드민 위임**: 제재나 탈퇴 처리 때 어드민이 직접 지정한다(`kind='admin'`, 사유 필수).
- **모임장이 DIBAY 를 탈퇴하면**: 부모임장 중 가장 먼저 지정된 사람 → 없으면 운영진 → 없으면 가장 오래된 멤버 순으로 자동 위임한다. 멤버가 없으면 모임을 종료한다. 당근 카페 규칙(35002)을 참고했다.

### P9. 게시판 · 공지 · 댓글
- 기본 게시판 4개: 공지(운영진만 쓰기) · 자유 · 가입인사 · 일정후기. 운영진이 사용자 게시판을 추가할 수 있다(개수 상한은 D6).
- 글마다 공개 범위를 고른다.
  - `members`: 멤버만 볼 수 있다.
  - `public`: 공개 페이지에도 보이지만 댓글은 멤버만 쓸 수 있다.
- 공지 고정은 최대 3개(D6). 새 공지를 올리면 멤버에게 `moim_notice_posted` 를 보낸다(끄기 가능).
- 새 글 알림은 멤버별 「새 글 알림」으로 켜고 끈다. 당근 기본값은 켜짐(31737)이지만 DIBAY 는 **공지만 켜짐, 일반 글은 꺼짐**을 권고한다(D9).
- 댓글이 달리면 글쓴이에게 `moim_comment` 를 보낸다.

### P10. 일정(정모)
- **만들기**: 권한 있는 멤버 → [일정 만들기] → 제목·일시·장소·설명·사진·정원 → 참여 방식(선착순 / 신청 후 승인, 지원 동기 받기) → 생성.
  - 서버: `moim_schedules` + 호스트가 `confirmed` 참여 + **일정 채팅방 생성**(`owner_ref_id`=일정).
  - 멤버에게 `moim_schedule_created` 를 보낸다(끄기 가능).
  - 반복 일정(최대 6개, 당근 26978)은 2차로 미룬다.
- **참여**:
  - 선착순: [참여하기] → `confirmed` + 일정 방 입장.
  - 승인: [참여 신청](지원 동기 8자 이상, 당근 35970) → 호스트에게 `moim_schedule_requested` → 승인/거절 → 신청자에게 알림.
  - 정원이 차면 `full`.
- **취소**:
  - 참여자가 취소하면 방에서 퇴장한다.
  - 호스트가 일정을 취소하면 `cancelled` + 참여자 전원에게 `moim_schedule_cancelled` 를 보내고 방은 읽기 전용이 된다.
- **리마인드**: 시작 24시간 전과 1시간 전에 확정 참여자에게 `moim_schedule_reminder` 를 보낸다(시점은 D9).
- **종료 후**: `done` 이 되고 방은 읽기 전용이 된다. 호스트는 출석(참석/불참)을 체크할 수 있고, 참여자에게 후기 작성 안내를 보낸다.
- **노쇼**: 출석 기록만 남긴다. 제재 연동은 하지 않는다(당근은 노쇼를 금지 활동으로 둠, 2차 검토).

### P11. 채팅
- 모임 전체 방: 가입하면 자동으로 들어가고, 탈퇴·내보내기·차단되면 자동으로 나간다. 방 안에서 나가기는 할 수 없지만, **알림 끄기(방별 무음)는 할 수 있다**(당근 29884).
- 일정 방: 참여가 확정되면 들어간다. 일정이 끝나면 읽기 전용이 되고, 30일 뒤 목록에서 보관 처리한다(D6).
- 멤버 간 1:1 대화: 기존 메신저 1:1 을 쓴다. 모임 프로필에서 [대화하기]를 누르면 상대 **수락 후** 시작된다(당근 13841). 모임장은 「운영진만 1:1 가능」으로 제한할 수 있다.
- 모임이 차단되거나 종료되면 모든 모임 방이 읽기 전용이 된다(`is_readonly`).
- 채팅 메시지 신고는 기존 메신저 신고 경로를 쓴다. 단 `owner_domain='moim'` 방의 신고는 **모임 신고 큐에도 함께 표시**한다(§8).

### P12. 알림 → §7

### P13. 신고
- **신고 대상**: 모임 · 멤버(프로필) · 글 · 댓글 · 일정 · 사진 · 채팅 메시지. 각 화면의 ⋮ 메뉴에서 신고한다.
- **사유 코드**(당근 3730·27663·20399 기반):
  - 영리·홍보
  - 종교 포교
  - 정치
  - 이성 만남 목적
  - 다단계·투자 권유
  - 개인정보 요구
  - 외부 메신저 유도
  - 욕설·혐오
  - 음란
  - 사기·금전 피해
  - 노쇼·회비 미반환
  - 기타
  - 필리핀 기준 조정은 D10.
- 같은 사람이 같은 대상을 처리 전에 다시 신고할 수 없다. 남용 방지 제한은 기존 신고 rate limit 을 쓴다.
- **모임 안 처리**: 운영진은 자기 모임 글·댓글·사진 신고를 볼 수 있고 [숨김]을 할 수 있다. 숨김은 모임 안에서만 적용된다.
- **플랫폼 처리**: 모든 신고는 어드민 신고 큐로 간다(§8).
- **결과 알림**: 신고자에게 `moim_report_result` 를 보낸다. 조치했는지 여부만 알리고, 상대에게 내려진 조치 내용은 알리지 않는다.

### P14. 플랫폼 제재 (당근 단계 적용)

| 단계 | 효과 | 해제 |
|---|---|---|
| `unlist` 추천 제외 | 탐색·검색 미노출. 멤버 활동은 그대로 | 어드민 해제 또는 만료 |
| `warn` 경고 | 미노출 + 모임 상단에 경고 배너(운영진에게만) + **위임 불가** | 어드민 해제 |
| `block` 모임 차단 | 가입·일정·글·채팅 전부 불가, 방 읽기 전용. 멤버에게 안내 배너 표시 | 어드민 해제 |
| `content_hide` 콘텐츠 숨김 | 해당 글·댓글·사진·일정 숨김 | 어드민 복구 |
| `user_restrict` 모임장·멤버 이용 제한 | 기존 `admin_apply_community_sanction`(scope community)으로 **모임 개설·가입·글쓰기** 제한, 기간 지정 | 기존 해제 경로 |

- 모든 제재는 사유가 필수이고, 근거 신고를 연결한다. 모임장에게 `moim_sanctioned` 를 보낸다(**필수 알림 — 사용자가 끌 수 없음**).
- 경고 누적에 따른 자동 차단은 하지 않는다. 어드민 화면에 「경고 N회」를 보여 주고 사람이 판단한다.

### P15. 모임 종료 · 삭제
- **모임장 종료**: 설정 → [모임 종료] → 이름을 직접 입력해 확인.
  - `closed`, 모든 방 읽기 전용, 멤버 전원에게 `moim_closed` 알림.
  - 종료된 모임은 **멤버만** 30일 동안 기록을 볼 수 있고, 그 뒤 목록에서 사라진다(D6).
  - 진행 중인 일정은 자동 취소된다.
- **어드민 삭제**: 슈퍼관리자만 할 수 있다. 소프트 삭제(`deleted_at`)이고 방은 보관된다. 복구할 수 있다. 실제 행 삭제(하드 삭제)는 하지 않는다(메신저 하드락의 tombstone 원칙과 같다).

### P16. 어드민 → §8

---

## 7. 알림 매트릭스

- 레지스트리(`lib/notifications/notification-item-registry.ts`)에 `moim_*` 항목을 새로 등록한다. 항목마다 소리 키는 고유하게 둔다(레지스트리 테스트가 강제함).
- 사용자 설정 분류는 기존 `community_social`(모임 활동)과 `community_chat`(모임 채팅)을 그대로 쓴다. 새 설정 분류는 만들지 않는다.
- 읽음 처리는 `docs/dibay-notification-read-badge-policy.md` §2 를 따른다. 대상 화면에 들어갔을 때 읽음이 된다.

| 코드 | 받는 사람 | 벨 | 푸시 | 설정 분류 | 끌 수 있음 | 이동 위치 |
|---|---|---|---|---|---|---|
| `moim_join_requested` | 승인권자 | O | O | community_social | O | 가입 신청 목록 |
| `moim_join_approved` / `_rejected` | 신청자 | O | O | community_social | **X(결과)** | 모임 홈 / 모임 공개 페이지 |
| `moim_member_joined` | 모임장 | O(묶음) | X | community_social | O | 멤버 목록 |
| `moim_invited` | 초대받은 사람 | O | O | community_social | O | 초대 수락 화면 |
| `moim_member_removed` | 대상 | O | O | community_social | **X** | 모임 공개 페이지 |
| `moim_role_changed` | 대상 | O | X | community_social | O | 모임 홈 |
| `moim_host_transfer_requested` | 위임받을 사람 | O | O | community_social | **X** | 수락 화면 |
| `moim_host_changed` | 전체 멤버 | O | X | community_social | O | 모임 홈 |
| `moim_notice_posted` | 멤버 | O | O | community_social | O(모임별 끄기) | 공지 글 |
| `moim_post_new` | 멤버(켠 사람만) | O | X | community_social | O(기본 꺼짐, D9) | 글 |
| `moim_comment` | 글쓴이·멘션 대상 | O | O | community_social | O | 글 |
| `moim_schedule_created` | 멤버 | O | O | community_social | O(모임별 끄기) | 일정 |
| `moim_schedule_requested` | 일정 호스트 | O | O | community_social | O | 일정 신청 현황 |
| `moim_schedule_decided` | 신청자 | O | O | community_social | **X** | 일정 |
| `moim_schedule_reminder` | 확정 참여자 | O | O | community_social | O | 일정 |
| `moim_schedule_cancelled` | 확정 참여자 | O | O | community_social | **X** | 일정 |
| `moim_closed` | 전체 멤버 | O | O | community_social | **X** | 모임 공개 페이지 |
| `moim_sanctioned` | 모임장(차단 시 전체 멤버) | O | O | 필수(mandatory) | **X** | 모임 홈 배너 |
| `moim_report_result` | 신고자 | O | X | 기존 `community_report_result` 분류 | X | 알림 상세 |
| 모임·일정 채팅 메시지 | 방 참여자 | 메신저 규칙 | 메신저 규칙 | community_chat | 방별 무음 | 방 |

- **모임 안 알림 설정**(모임 홈 ≡ → 알림): 공지 · 새 글 · 일정 · 채팅(방별 무음 연결)을 켜고 끈다. 다른 멤버의 설정에는 영향을 주지 않는다(당근 31737).
- 같은 종류의 알림은 묶는다: `dedupe_key` = `moim:{id}:{code}:{target}`.

---

## 8. 어드민 (`/admin/community/moims`, 권한 키 `moim`)

| 메뉴 | 화면·기능 |
|---|---|
| **모임 목록** | 탭: 전체 / 정상 / 추천 제외 / 경고 / 차단 / 종료 / 삭제<br>필터: 동네(LGU) · 카테고리 · 개설일 · 신고 수 · 마지막 활동<br>검색: 모임 이름 · 모임장(닉네임·DIBAY ID) · ID<br>CSV 내보내기는 감사 기록을 남긴다 |
| **모임 상세** | 탭: 기본정보 · 멤버 · 가입신청 · 게시글 · 일정 · 앨범 · 채팅 · 신고 · 제재 · 운영기록 |
| └ 기본정보 | **수정**: 이름·소개·사진·카테고리·정원·가입 방식·질문·동네. 사유 필수, 변경 전후를 기록하고 모임장에게 알린다 |
| └ 멤버 | 목록(역할·상태·가입일·재가입 횟수·실제 계정 링크)<br>조치: **역할 변경 · 내보내기 · 차단 · 차단 해제 · 모임장 지정** |
| └ 게시글·일정·앨범 | 보기 · 숨김 · 복구 · 삭제(슈퍼관리자) |
| └ 채팅 | 모임 방·일정 방 목록 → 기존 메신저 어드민 화면으로 이동(메시지 숨김·방 읽기 전용) |
| └ 운영기록 | `moim_events` 전체(사용자·어드민·시스템) |
| **모임 신고 처리** | 큐: 접수 / 검토 중 / 조치 / 기각. 대상 유형 필터, **같은 모임 신고 묶음 보기**<br>상세 서랍: 대상 미리보기(글 본문·사진·메시지 원문), 신고 사유, 신고자, 같은 대상 신고 이력<br>조치 선택: 기각 / 콘텐츠 숨김 / 추천 제외 / 경고 / 모임 차단 / 모임장·멤버 이용 제한(기간)<br>처리 → `moim_sanctions` 생성 + 신고 상태 변경 + 신고자 알림을 **한 번에** 처리 |
| **모임장 변경 요청** | P8 미접속 위임 요청 큐: 모임장 마지막 접속, 요청자, 후보 → 승인(지정) / 거절 |
| **제재 이력** | 모임·사용자별 제재 목록, 해제, 만료 예정 |
| **카테고리 관리** | 추가 · 이름(ko·en 키) · 순서 · 사용 중지 · 개설 금지 표시 |
| **운영 정책 설정** | 1인 개설 수, 정원 상한, 역할 인원 상한, 게시판·공지 고정 수, 대기 신청 만료일, 종료 모임 보관일, 금지어 목록, 금지 모임 유형 안내문, 신고 사유 목록. **D6 값이 정해지면 여기서 관리한다**(코드 상수로 박지 않음) |
| **대시보드 지표** | 신규 모임 · 활성 모임(7일 활동) · 신고 대기 · 위임 요청 대기 |

- **공통 규칙**
  - 모든 쓰기는 사유가 필수이고, 낙관적 잠금(`expected_updated_at`, 다르면 409)을 쓴다.
  - `audit_logs` 와 `moim_events` 에 동시에 기록하고, 당사자에게 알린다.
- **권한**: 메뉴 링크와 API 가 같은 권한 키로 판정한다. 지금은 화면이 열린 뒤 API 가 403 을 내는 불일치가 있는데, 이것을 없앤다.

---

## 9. 화면 목록 (사용자)

| 화면 | 경로(안) |
|---|---|
| 모임 탭 홈 | `/moim` |
| 모임 찾기·검색 | `/moim/search` |
| 모임 만들기(5단계) | `/moim/new` |
| 모임 공개 페이지(비멤버) · 모임 홈(멤버) | `/moim/[id]` (탭: 홈 · 게시판 · 일정 · 앨범 · 멤버) |
| 글 · 글쓰기 | `/moim/[id]/posts/[postId]`, `/moim/[id]/write` |
| 일정 상세 · 만들기 | `/moim/[id]/schedules/[sid]`, `/moim/[id]/schedules/new` |
| 가입 신청 | `/moim/[id]/join` |
| 내 모임 프로필 | `/moim/[id]/profile` |
| 운영: 가입신청 · 멤버관리 · 권한 · 설정 · 위임 · 종료 | `/moim/[id]/manage/*` |
| 초대 링크 착지 | `/moim/i/[token]` |
| 모임 알림 설정 | `/moim/[id]/settings/notifications` |

- 페이지는 `app/(main)/moim/**` 에 둔다(AGENTS.md 라우트 규칙).
- 문구는 모두 `t("key")` 로 넣고 ko·en 을 함께 등록한다. 카드·버튼은 `rounded-ui-rect`(4px), 시트는 오버레이 반경을 쓴다.
- 2단 탭은 이름을 자르지 않고, 넘치면 가로 스와이프한다.

---

## 10. 단계 계획

| 단계 | 내용 | 바뀌는 곳 · 함께 처리 | 배포 구분 |
|---|---|---|---|
| M0 | D1~D10 결정, 이 문서를 계약 문서로 확정(`docs/moim-ssot.md`) | 문서 | — |
| M1a | **옛 모임 코드 전부 삭제**(§1) — 앱이 옛 테이블·열을 더 이상 읽고 쓰지 않게 함 | 메신저 결합 제거(오픈그룹 탐색·부트스트랩의 meetings 조인 제거, 비밀번호 해시 이동), 알림 항목 교체, 어드민 메뉴 제거<br>`/philife/write?category=meetup` · `/philife/meetings/*` 는 **M3 전까지 커뮤니티 홈으로** 보낸다(깨진 화면 없음) | 웹 |
| M1b | **옛 모임 DB 삭제**: 테이블 26개·함수·트리거·`community_posts.is_meetup/meetup_*`·`community_topics.allow_meetup`·`chat_rooms.meeting_id` 삭제 + 옛 모임을 참조하는 운영 함수 8개(`admin_action_queue_counts`, `admin_community_period_stats`, `community_import_publish`, `get_cm_bootstrap_full_snapshot`, `philife_list_default_section_topics_for_feed` 등)와 `philife_topics` 뷰 재정의 | **M1a 가 운영에 나간 뒤에만** 적용(먼저 지우면 운영 앱이 깨짐). 파일 `supabase/migrations/20271112200000_moim_m1b_drop_legacy_meetings.sql` — 운영 현재 함수 정의에서 해당 부분만 지우고 개수가 다르면 전체 롤백. `open_chat_*`(옛 오픈채팅, 모임 아님)는 범위 밖 | DB(Owner 승인 후 적용) |
| M2 | 신규 스키마 §3 + RPC + 권한 함수 + 메신저 `owner_domain` 차단 — `20271112210000_moim_m2_schema_rpc.sql` · `lib/moim/*`. 확정: 모임 테이블 클라이언트 직접 접근 없음(서버 RPC 만), 수치 상한은 `moim_policies`(NULL=검사 안 함, D6 지정 전), 카테고리 시드 없음(M5 어드민), 게시판·일정·앨범 RPC 는 M3·M4 | 메신저 그룹 RPC 6개, 하드락 문서 갱신(**D1 승인 필요**) | DB + 웹 |
| M3 | 사용자: 탐색 · 개설 · 공개 페이지 · 가입 · 초대 · 탈퇴 · 모임 홈 · 게시판 · 멤버 관리 · 위임 · 종료 · 전체 채팅 — DB `20271112230000_moim_m3_board_rpc.sql`(글·댓글·고정·게시판·메모·신고 접수), API `app/api/moim/**`, 화면 `app/(main)/moim/**`. 앨범·모임별 알림 설정은 M4(일정과 함께) | 메신저 목록의 「모임」 배지, 방 상단 「모임 홈」 버튼 | 웹 |
| M4 | 일정 · 일정 채팅 · 출석 · 후기 · 리마인드 — DB `20271113100000_moim_m4_schedule_album_prefs.sql`(일정·참여·승인·내보내기·출석·끝내기·리마인드 표시·앨범·모임별 알림 설정), 예약 작업 `/api/cron/moim-schedules`(10분), 앨범·모임별 알림 설정 포함. 일정 관리권자 = 일정 호스트·모임장·부모임장. 끝 시간이 없으면 시작한 날 필리핀 자정에 끝남. 반복 일정은 2차 | 예약 발송(cron `CRON_TZ=Asia/Manila`) | 웹 |
| M5 | 어드민 §8 전체(신고→제재 처리 제외) + 권한 키 `moim` — DB `20271113200000_moim_m5_admin_rpc.sql`(정보 수정·멤버 조치·모임장 지정·미접속 위임 요청/처리·콘텐츠 숨김/복구/삭제·일정 취소·제재 적용/해제/만료·모임 삭제/복구·카테고리·운영 정책, 사유 필수·`moim_events`+`audit_logs`), API `app/api/admin/moim/**` 14개 + 사용자 `POST /api/moim/[id]/host-inactive-request`, 화면 `/admin/community/moims`(목록·CSV 감사 기록·상세 10탭·신고 큐 읽기 전용·모임장 변경 요청·제재 이력·카테고리·운영 정책). 권한은 단일 키 `moim`(하위 키 미분리), 모임 삭제·복구·콘텐츠 삭제 = 최고관리자. 알림 `moim_sanctioned`(필수)·`moim_admin_info_updated`·`moim_host_request_result`(필수) 추가. 사용자 운영 메뉴 「모임장 변경 요청」(부모임장·운영진) | `admin-menu.ts`(커뮤니티 › 모임 6), `admin-route-access.ts`, 커뮤니티 대시보드 지표 4(신규·활동 모임·신고 접수·변경 요청), 예약 작업에 제재 만료 반영 | 웹 + DB(Owner 승인 후 적용) |
| M6 | 신고 → 제재 연결, 신고 결과 알림 — DB `20271113300000_moim_m6_report_decide.sql`(검토 시작 · 한 번에 처리: 신고 상태 CAS + 콘텐츠 숨김/일정 취소/메시지 숨김 · 추천 제외/경고/차단 · 이용 제한(기존 `admin_apply_community_sanction` scope community) · 같은 대상 신고 함께 닫기 · `moim_sanctions`(근거 신고 연결) · `moim_events`+`audit_logs`), API `POST /api/admin/moim/reports/[id]/review`·`/decision`, 신고 상세 서랍 처리 폼(경고 N회 표시 — 자동 차단 없음, 닫힌 신고는 처리 결과). 알림 `moim_report_result`(신고자, 조치 여부만 · `community_report_result` 분류) + `moim_sanctioned`·커뮤니티 이용 제한 알림·`moim_schedule_cancelled`. 모임 안 처리: `GET /api/moim/[id]/reports`(hide_post, 신고자 비공개) + `/moim/[id]/manage/reports`(숨김 = 기존 삭제 API, 신고 상태 불변) | 메신저 신고 큐의 모임 방 「모임」 배지·모임 어드민 링크, 모임 신고 큐 「모임 채팅 신고 보기」(읽기 전용 → 메신저 신고 화면에서 처리) | 웹 + DB(Owner 승인 후 적용) |

- 네이티브 변경은 없을 것으로 본다. 다만 새 알림 항목이 푸시 소리 키를 요구하면, 네이티브 소리 파일이 필요한지 M3 착수 때 확인한다(**NOT_PROVEN**).
- 통화 코드는 건드리지 않는다. 모임 방에서 통화 버튼을 쓸지는 기존 `allow_member_call` 설정을 따른다.
- 각 단계는 PR 1개로 한다. 검증은 typecheck + 관련 vitest + Owner 계정 실기로 하고, 실기 전에는 NOT_PROVEN 이다.

---

## 11. Owner 결정 필요

| # | 결정 | 권고 |
|---|---|---|
| D1 | 메신저 그룹방에 `owner_domain='moim'` 표시를 추가하고, 그 방의 메신저 쪽 초대·내보내기·나가기를 막는다(메신저 하드락 변경) | 승인 |
| D2 | 모임 진입 위치: 하단 탭 신설 / 동네생활 상단 / 메신저 안 | 동네생활(커뮤니티) 상단 「모임」 탭 |
| D3 | 모집 범위: 같은 도시만 / 인접 도시 포함(인접 정의 필요) | 1차는 같은 도시(LGU)만 |
| D4 | 운영진 역할을 부모임장과 따로 둘 것인가 | 둔다(§5.2 차이) |
| D5 | 연령 제한·연령대 표시(생년월일 입력 필요, 성별은 저장 안 함) | 1차는 연령 제한만, 성별 없음 |
| D6 | 숫자: 1인 개설 수, 정원 상한, 부모임장·운영진 상한, 게시판 수, 공지 고정 수, 대기 만료일, 일정 방 보관일, 종료 모임 보관일, 초대 재발송 간격, 이름·소개 글자 수 | 어드민 정책 설정에서 관리(값은 Owner 지정) |
| D7 | 개설 사전 승인제 | 두지 않음(사후 신고·제재) |
| D8 | 미접속 모임장 자동 위임 | 하지 않음(요청 → 어드민) |
| D9 | 알림 기본값: 새 글(켜짐/꺼짐), 일정 리마인드 시점 | 새 글 꺼짐, 24시간·1시간 전 |
| D10 | 금지 모임 유형·신고 사유의 필리핀 기준 조정 | 당근 27663 목록을 그대로 쓰고, 필요하면 추가 |
| 신원 | §4 C안(전화 인증 + 모임별 프로필) | 승인 |

## 12. NOT_PROVEN · 확인 못 함
- 이 문서의 현행 사실은 코드·운영 DB 조회 근거만 있다. 실기기 확인은 하지 않았다.
- 운영 `20261207120000_cm_group_active_membership_authority` 적용 여부는 확인 못 함(하드락 문서의 OPEN GAP 5).
- 새 알림 항목에 네이티브 소리 파일이 필요한지 확인 못 함.
- 당근의 부모임장·운영진 권한 차이, 정원·개설 수 상한, 모임장 탈퇴 공식 절차는 공식 자료가 없다.

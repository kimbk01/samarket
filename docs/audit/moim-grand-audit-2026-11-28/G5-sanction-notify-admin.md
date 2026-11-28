# G5 — P14 플랫폼 제재 · P15 종료·삭제 · §7 알림 매트릭스 · §8 어드민 (조항별 계약 감사)

- 코드 기준: `/Users/bkkim/projects/samarket-wt-moim-address` HEAD `04ee097fb` (clean). 저장소 읽기 전용. DB·사이트·앱 실행 0회.
- 계약 순서: `docs/moim-ssot.md` → 설계 v1 §6 P14·P15·§7·§8 → `docs/audit/moim-open-items-audit-2026-11-12.md` §0 → 묶음 2~6 설계(뒤 문서 우선).
- 판정: PASS = 코드에서 직접 확인(코드 PASS일 뿐, 운영·실기 아님) · FAIL = 구체 실패 상황 있음 · NOT_PROVEN = 증거 부족 · N/A = 뒤 문서가 바꿈(근거 표기).
- 「이전」 열 = `matrix/prior-reaudit.md` ID. 없으면 NEW.
- 경로 약어: `m2`=`supabase/migrations/20271112210000_moim_m2_schema_rpc.sql`, `m3`=`…20271112230000_moim_m3_board_rpc.sql`, `m4`=`…20271113100000_moim_m4_schedule_album_prefs.sql`, `m5`=`…20271113200000_moim_m5_admin_rpc.sql`, `m6`=`…20271113400000_moim_m6_report_decide.sql`, `b2`=`…20271128110000_moim_bundle2_permissions.sql`, `pe`=`…20271113700000_moim_policy_executors.sql`, `notify`=`lib/moim/server/moim-notify.server.ts`, `policy`=`lib/notifications/policy/notification-preference-policy-registry.ts`, `cat`=`lib/i18n/catalog/moim-core.ts`.

---

## A. P14 플랫폼 제재

| ID | 요구 (≤20단어 인용) | 판정 | 서버 증거 | 화면·문구 증거 | 비고 |
|---|---|---|---|---|---|
| S14-unlist-hidden | 「`unlist` 추천 제외 — 탐색·검색 미노출」 | PASS | `lib/moim/server/moim-queries.server.ts:238` 동네 목록·검색(`q`)이 `platform_state='normal'` 만 | — | 검색도 같은 함수(`:246`) |
| S14-unlist-activity | 「멤버 활동은 그대로」 | PASS | `m2:685-690` `moim_actor_can` 은 `blocked`·`warned+transfer_host` 만 거부 | `lib/moim/moim-permission-contract.ts:91-92` | NEW 아님(정상) |
| S14-unlist-release-admin | 「어드민 해제」 | PASS | `m5:486-504` `moim_admin_sanction_revoke` → `moim__platform_refresh` | `app/api/admin/moim/sanctions/[sanctionId]/route.ts:21` | |
| S14-unlist-release-expiry | 「또는 만료」 | PASS | `m5:506-532` `moim_sanctions_expire_due`, 크론 `app/api/cron/moim-schedules/route.ts:79-85` | — | |
| S14-warn-hidden | 「`warn` 경고 — 미노출」 | PASS | 목록이 `normal` 만(`moim-queries.server.ts:238`) → `warned` 제외 | — | |
| S14-warn-banner-staff | 「모임 상단에 경고 배너(운영진에게만)」 | PASS | — | `components/moim/MoimMemberView.tsx:193` 운영진 이상만 `moim_home_warned_notice` | 화면 실물 NOT_PROVEN |
| S14-warn-no-transfer | 「**위임 불가**」 | PASS | `m2:688` actor_can, `b2:558` 위임 수락도 `warned` 거부 | `components/moim/manage/MoimManageTransfer.tsx:26` | |
| S14-warn-release-admin-only | 「경고 … 해제: 어드민 해제」(만료 없음) | FAIL | `m5:459-470` 모든 단계에 `p_ends_at` 허용 · `m5:506` 만료 작업이 warn·block 도 풀어 줌 | `components/admin/moim/AdminMoimDetailPage.tsx:627-671` 종료일 입력을 단계와 무관하게 노출 | NEW · 어드민이 경고에 종료일을 넣으면 사람 판단 없이 크론이 해제 |
| S14-block-join | 「`block` — 가입 … 불가」 | PASS | `m2:812` `moim__assert_joinable` → `moim_blocked` (`b2:450` 가입이 호출), 초대 수락 `m2:1261` | `components/moim/MoimPublicView.tsx:68` | |
| S14-block-schedule | 「일정 … 불가」 | PASS | `m4:93`·`m4:422` · `m2:685` actor_can | `MoimScheduleDetailScreen.tsx:221` | |
| S14-block-post | 「글 … 불가」 | PASS | `b2:680`(글쓰기), `b2:725`(수정), `m3:145`(댓글) | `MoimMemberView.tsx:42` | |
| S14-block-chat | 「채팅 전부 불가, 방 읽기 전용」 | PASS | `m5:93-110` `moim__rooms_set_locked(true)`, `m5:133` 차단 시작 때 호출 | — | 실기 NOT_PROVEN |
| S14-block-member-banner | 「멤버에게 안내 배너 표시」 | PASS | — | `components/moim/MoimPublicView.tsx:41-45` `MoimStateNotice` (`MoimMemberView.tsx:192`) · 문구 `moim_err_moim_blocked` ko·en | |
| S14-block-release-admin-only | 「차단 … 해제: 어드민 해제」 | FAIL | 위 S14-warn-release-admin-only 와 같은 원인(`m5:459`, `m5:506`) | 같음 | NEW · 차단에 종료일을 넣으면 자동 해제 |
| S14-hide-post-comment-album | 「`content_hide` — 해당 글·댓글·사진 … 숨김」 | PASS | `m6:84-97` | — | |
| S14-hide-schedule | 「… 일정 숨김」 | FAIL | `m6:98-110` 일정은 숨김이 아니라 `cancelled`(되돌릴 수 없음) | — | NEW · 신고로 일정을 「숨김」 하면 일정이 취소되고 참여 기록이 끝남 |
| S14-hide-chat | 채팅 메시지 숨김(P13 대상) | PASS | `m6:111-114` `is_hidden_by_admin` + 방 정합 `decision/route.ts:185-187` | — | |
| S14-hide-restore-post | 「어드민 복구」(글·댓글·사진) | PASS | `m5:386-455` `restore`(hidden→active) | `app/api/admin/moim/content/route.ts` | |
| S14-hide-restore-schedule | 「어드민 복구」(일정) | FAIL | `m5:398` 일정은 `cancel` 만, 취소 일정 복구 함수 없음 | — | NEW · S14-hide-schedule 과 같은 원인 |
| S14-hide-restore-chat | 「어드민 복구」(채팅 메시지) | NOT_PROVEN | 모임 쪽 복구 없음. 메신저 어드민 숨김 해제 경로는 이번에 추적 안 함 | — | |
| S14-restrict-path | 「기존 `admin_apply_community_sanction`(scope community)으로」 | PASS | `m6:136-141` `admin_apply_community_sanction(…, 'moim')` | — | |
| S14-restrict-create | 「모임 개설 … 제한」 | PASS | `app/api/moim/route.ts:45` 기본 `writeKind:"post"` → `moim-route-guard.server.ts:41-46` | — | |
| S14-restrict-join | 「가입 … 제한」 | FAIL | `join/route.ts:14` 는 검사 · `app/api/moim/invites/[inviteId]/route.ts:15` `writeKind:"none"` | — | 이전 P2-6 · 제한 사용자가 초대 수락으로 가입 |
| S14-restrict-post | 「글쓰기 제한」 | PASS | `posts/route.ts:37`, `comments/route.ts:15`(`comment`), `schedules/route.ts:31`, `album/route.ts:36` | — | |
| S14-restrict-period | 「기간 지정」 | PASS | `decision/route.ts:52-65` days 1~3650 / 영구, `m6:139` | `AdminMoimReportDecisionForm.tsx` | |
| S14-restrict-release | 「기존 해제 경로」 | NOT_PROVEN | 해제는 커뮤니티 제재 화면 몫. 해제해도 `moim_sanctions` 의 `user_restrict` 행은 그대로(갱신 코드 없음) — 화면 표시가 어긋나는지는 미확인 | — | NEW 위험 |
| S14-reason-required | 「모든 제재는 사유가 필수」 | PASS | `m5:67-75` `moim__admin_reason`, `m5:466`, `m6:40`; 라우트 `sanctions/route.ts:27-28`, `decision/route.ts:86-87` | — | |
| S14-report-link-decision | 「근거 신고를 연결한다」(신고 처리 경로) | PASS | `m6:115-117,124-126,143-149` `source_report_id = p_report` | — | |
| S14-report-link-direct | 「모든 제재는 … 근거 신고를 연결한다」(직접 제재 경로) | FAIL | `m5:459-477` `moim_admin_sanction_apply` 는 신고 id 를 받지 않고 `source_report_id` 를 비워 둠. 주석 「신고 연결은 M6」 | `AdminMoimDetailPage.tsx:641` 모임 상세 제재 폼 | NEW · 모임 상세에서 차단하면 근거 신고 없는 제재가 생김 |
| S14-notify-moim-levels | 「모임장에게 `moim_sanctioned`」(추천 제외·경고·차단) | PASS | `m5:480-481`, `m6:179-180`; 발송 `sanctions/route.ts:36-45`, `decision/route.ts:141-154` | 문구 `cat:154-159,358-363` 단계별 ko·en | |
| S14-notify-content-hide | 「모든 제재 … 모임장에게 `moim_sanctioned`」(콘텐츠 숨김) | FAIL | `decision/route.ts:142-143` `moim_level` 이 있을 때만 보냄 · `m6:179-180` content_hide 단독이면 `[]` | — | NEW · 신고로 글을 숨겨도 모임장·작성자 모두 알림 없음 |
| S14-notify-user-restrict | 같은 조항(이용 제한) | NOT_PROVEN | 대상자에게는 `notifyCommunitySanction`(`decision/route.ts:156-169`). 모임장 `moim_sanctioned` 는 없음. 멤버 제한을 모임장에게 알리는 것이 계약 뜻인지 불명확 | — | 계약 해석 필요 |
| S14-notify-mandatory | 「**필수 알림 — 사용자가 끌 수 없음**」 | PASS | `policy:93` `moim_sanctioned` mandatory · `lib/notifications/policy/notification-preference-policy-channel-presets.ts:4-13` 푸시 always | — | |
| S14-no-auto-block | 「경고 누적에 따른 자동 차단은 하지 않는다」 | PASS | `m5:459-484` 적용 함수에 누적 판정 없음 | — | |
| S14-warn-count | 「어드민 화면에 「경고 N회」를 보여 주고」 | PASS | `lib/admin/moim/moim-admin-queries.server.ts:293,609` | `AdminMoimDetailPage.tsx:120`, `AdminMoimReportDecisionForm.tsx:82-86` | |

## B. P15 모임 종료 · 삭제

| ID | 요구 | 판정 | 서버 증거 | 화면·문구 증거 | 비고 |
|---|---|---|---|---|---|
| S15-close-entry | 「설정 → [모임 종료]」 | PASS | `app/api/moim/[moimId]/close/route.ts` | `app/(main)/moim/[moimId]/manage/close/page.tsx` | 화면 실물 NOT_PROVEN |
| S15-close-name | 「이름을 직접 입력해 확인」 | PASS | `b2:643` `moim_confirm_name_mismatch` | — | |
| S15-close-status | 「`closed`」 | PASS | `b2:644` | — | |
| S15-close-rooms | 「모든 방 읽기 전용」 | PASS | `b2:649-652` | — | |
| S15-close-notify | 「멤버 전원에게 `moim_closed` 알림」 | PASS | `close/route.ts:38-45` 종료 전 읽은 활성 멤버(모임장 본인 제외) | 문구 `cat:193-194,397-398` | |
| S15-close-members-only | 「종료된 모임은 **멤버만** … 기록을 볼 수 있고」 | PASS | `moim-queries.server.ts:362-365` `canViewMoim` | `MoimPublicView.tsx:43` | |
| S15-close-30d | 「30일 동안」(D6) | PASS | `pe:83-113` `closed_retention_days` 정책값 → `retention_ended_at`, `canViewMoim` 이 그 뒤 거부 | — | 값 자체는 운영 DB(이번 조회 안 함) |
| S15-close-list | 「그 뒤 목록에서 사라진다」(30일 동안은 목록에 있음) | FAIL | `moim-queries.server.ts:174` 내 모임 목록이 `status='active'` 만 | — | 이전 P2-2 |
| S15-close-schedules | 「진행 중인 일정은 자동 취소된다」 | PASS | `b2:645`; 알림 `close/route.ts:46-56`(묶음 2 B13) | — | |
| S15-delete-super | 「어드민 삭제: 슈퍼관리자만」 | PASS | `app/api/admin/moim/moims/[moimId]/lifecycle/route.ts:15` `requireSuperAdmin` | `AdminMoimDetailPage.tsx:146-148` | |
| S15-delete-soft | 「소프트 삭제(`deleted_at`)」 | PASS | `m5:544` | — | |
| S15-delete-room-archive | 「방은 보관된다」 | NOT_PROVEN | `m5:548` 방을 잠그기만 함(보관 아님) | — | 이전 P3-27 · D-3 Owner 결정 대기(「보관」 뜻 불명) |
| S15-restore | 「복구할 수 있다」 | PASS | `m5:555-576` | — | |
| S15-no-hard-delete | 「실제 행 삭제(하드 삭제)는 하지 않는다」 | PASS | `m5:535-553`, 콘텐츠 삭제도 상태값(`m5:420-447`) | — | |

## C. §7 알림 매트릭스 — 공통 조항

| ID | 요구 | 판정 | 서버 증거 | 화면·문구 증거 | 비고 |
|---|---|---|---|---|---|
| S7-registry | 「레지스트리에 `moim_*` 항목을 새로 등록」 | PASS | `lib/notifications/notification-item-registry.ts:278-323`(「모임 활동」 1항목, 24종), `:341-346`(신고 결과) | — | 종류마다가 아니라 1항목에 묶음 |
| S7-sound-unique | 「항목마다 소리 키는 고유하게」 | PASS | `notification-item-registry.ts:313` `item_community_meeting`; 중복 금지 시험 `lib/notifications/notification-item-registry.test.ts` | — | 모임 24종은 같은 소리 |
| S7-pref-category | 「`community_social`(모임 활동)과 `community_chat`(모임 채팅)을 그대로」 | PASS | `notify:93` `push_kind:"community"` → `lib/notifications/append-user-notification.ts:57` `community_activity` → `policy:59` `community_social` | — | `notify:94` `domain:"community_chat"` 은 표시용 legacyDomain 뿐 |
| S7-no-new-category | 「새 설정 분류는 만들지 않는다」 | PASS | 위와 같음 | — | |
| S7-read-on-target | 「대상 화면에 들어갔을 때 읽음이 된다」(정책 §2 `community_activity`: 「게시글, 모임 … 상세 진입 후」) | FAIL | `components/moim/**`·`app/(main)/moim/**`·`lib/moim/**` 에 알림 읽음 호출 0건(grep). 비교: `components/community/CommunityDetail.tsx:62` `postNotificationThreadRead` | — | NEW · 공지 알림을 받은 뒤 모임 홈에서 그 공지를 열어도 벨 미읽음이 남음(벨 목록에서 누를 때만 읽음인지는 미추적) |
| S7-inmoim-toggles | 「모임 홈 ≡ → 알림: 공지 · 새 글 · 일정 · 채팅(방별 무음 연결)」 | PASS | `app/api/moim/[moimId]/notification-prefs/route.ts:24-33` notice·posts·schedules | `components/moim/MoimNotificationSettingsScreen.tsx:106-111` 채팅 → 방 이동 | |
| S7-inmoim-isolated | 「다른 멤버의 설정에는 영향을 주지 않는다」 | PASS | 행 키 `(moim_id,user_id)` — `notify:138` | — | |
| S7-pref-read-error | (설정 조회 실패 시 처리) | FAIL | `notify:138-141` 조회 오류를 무시하고 기본값(새 글 꺼짐·공지·일정 켜짐)으로 보냄 | — | 이전 P3-13 · 공지를 끈 사람에게 조회 실패 때 공지가 감 |
| S7-dedupe-group | 「같은 종류의 알림은 묶는다: `dedupe_key` = `moim:{id}:{code}:{target}`」 | FAIL | `notify:96` 키는 `moim:{kind}:{ref}:{userId}`, 묶음 없음 | — | 이전 P3-14·D-2. `moim_member_joined` 만 묶음 3번 B2 로 「묶지 않음」 확정(N/A) — 나머지 종류는 Owner 결정 대기 |
| S7-block-relation | (차단 SSOT: 수신자↔행위자 차단 억제) | FAIL | `notify:90-111` `sender_id`·`meta.actor_id` 없음 → `append-user-notification.ts:156-158` 차단 검사가 항상 통과 | — | 이전 P3-12 · 내가 차단한 사람이 쓴 댓글·가입 신청 알림이 옴 |
| S7-lang | 받는 사람 언어 | PASS | `notify:87` 1명 개별 조회 · `notify:125` 여러 명 일괄(실패 시 개별) · `notificationCopyMeta` 로 키 저장(`notify:104-109`) | — | 전 종류 공통 |
| S7-copy-keys | ko+en 문구 | PASS | 사용 키 58개(종류·변형 × title/body) 모두 `cat:154-212`(ko)·`cat:358-416`(en) 에 1회씩 — 스크립트 대조 결과 누락 0 | — | 전 종류 공통 |
| S7-bell-all | 벨 O (모든 행) | PASS | `notification-preference-policy-channel-presets.ts:4-36` inApp `always` | — | |

## D. §7 알림 매트릭스 — 종류별

열: 받는 사람(recipients) · 발송 경로(trigger) · 잘못 받는 사람(wrong) · 푸시(push) · 끌 수 있음(off) · 중복 키(dedupe) · 이동(link) · 문구(copy).

### D1 `moim_join_requested` (승인권자 · 벨O 푸시O · 끌 수 있음 O · 가입 신청 목록)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-join_requested-trigger | 가입 신청 시 | PASS | `join/route.ts:32-35`; 멤버 초대 수락 `invites/[inviteId]/route.ts:39-41`(묶음 3 B3) | — | |
| S7-join_requested-recipients | 「승인권자」 | PASS | `notify:166-175` `listMoimActorsFor(…,"decide_join")` | — | |
| S7-join_requested-wrong | 차단 관계 | FAIL | S7-block-relation | — | 이전 P3-12 |
| S7-join_requested-push | 푸시 O | PASS | BELL_ONLY 아님 `notify:53-58` | — | |
| S7-join_requested-off | 끌 수 있음 O | PASS | `policy:59` social → 푸시 `community_social_enabled` 로 끔 | — | 벨은 남음(플랫폼 규칙) |
| S7-join_requested-dedupe | 중복 키 | PASS | `requestId` — 신청마다 새 행 `b2:483-485` | — | |
| S7-join_requested-link | 「가입 신청 목록」 | PASS | `notify:148,171` → `app/(main)/moim/[moimId]/manage/requests/page.tsx` | — | |
| S7-join_requested-copy | 문구 | FAIL | `notify:166-174` 이름 대체값 없음 | 「{name}님이 …」 → 「님이 …」 | 이전 P3-15 |

### D2 `moim_join_approved` / `_rejected` (신청자 · 푸시O · **끌 수 없음** · 모임 홈 / 공개 페이지)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-join_decided-trigger | 승인·거절 시 | PASS | `join-requests/[requestId]/route.ts:22-30` | — | |
| S7-join_decided-recipients | 「신청자」 | PASS | 같은 곳 `result.user_id` | — | |
| S7-join_decided-push | 푸시 O | PASS | BELL_ONLY 아님 | — | |
| S7-join_decided-off | 「**X(결과)**」 | PASS | `policy:84-85` mandatory | — | |
| S7-join_decided-dedupe | 중복 키 | PASS | `requestId` | — | |
| S7-join_decided-link | 「모임 홈 / 모임 공개 페이지」 | PASS | `/moim/{id}` — 승인자 = 멤버 화면, 거절자 = 공개 화면(`canViewMoim` active 허용 `moim-queries.server.ts:362-365`) | — | |
| S7-join_decided-copy | 문구 | PASS | `cat:175-178,379-382` | — | 거절 사유 미포함은 이전 P3-10(§7 요구 아님) |

### D3 `moim_member_joined` (모임장 · 벨(묶음) · 푸시X · 끌 수 있음 O · 멤버 목록)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-member_joined-trigger | 바로 가입 | PASS | `join/route.ts:37-39`, 초대 수락 active `invites/[inviteId]/route.ts:42-43` | — | 승인으로 가입할 때는 보내지 않음 — 묶음 3 B2 가 「바로 가입」으로 범위를 정함 |
| S7-member_joined-recipients | 「모임장」 | PASS | `notify:178-185` host, 본인 제외 | — | |
| S7-member_joined-group | 「O(묶음)」 | N/A | 묶음 3 B2(`moim-bundle3-design-2026-11-28.md:32-34`) 「가입 1건 = 벨 1개」로 변경 | — | |
| S7-member_joined-push | 푸시 X | PASS | `notify:53-58,100` → `append-user-notification.ts:203` `item_policy` | — | |
| S7-member_joined-off | 끌 수 있음 O | FAIL | 벨만 종류라 푸시가 없고, 알림함은 설정과 무관하게 항상 저장(`channel-presets.ts:24-33` inApp always). 모임별 설정에도 항목 없음 | — | NEW · 커뮤니티 활동을 꺼도 가입마다 벨이 쌓임. 「벨만 + 끌 수 있음」은 플랫폼 규칙상 끌 대상이 없음 → 계약과 플랫폼 충돌(Owner 보고 대상) |
| S7-member_joined-dedupe | 중복 키 | PASS | `notify:193` 모임·사람·가입 시각 | — | |
| S7-member_joined-link | 「멤버 목록」 | PASS | `notify:149,191` → `manage/members/page.tsx` | — | |
| S7-member_joined-copy | 문구 | PASS | `cat:171-172,375-376`, 이름 대체값 `notify:187` | — | |

### D4 `moim_invited` (초대받은 사람 · 푸시O · 끌 수 있음 O · 초대 수락 화면)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-invited-trigger | 직접 초대 | PASS | `app/api/moim/[moimId]/invites/route.ts:24-33` | — | |
| S7-invited-recipients | 「초대받은 사람」 | PASS | 같은 곳 `[invitee]` | — | |
| S7-invited-wrong | 나를 차단한 사람 | PASS | `invites/route.ts:22` `isBlockedByOther` 전에 거부(묶음 2 B4) | — | |
| S7-invited-push/off | 푸시 O · 끌 수 있음 O | PASS | BELL_ONLY 아님 · social | — | |
| S7-invited-dedupe | 중복 키 | PASS | `invite_target_id` 새 행 `m2:1290` | — | |
| S7-invited-link | 「초대 수락 화면」 | PASS | `/moim/invites` → `app/(main)/moim/invites/page.tsx` | — | |
| S7-invited-copy | 문구 | PASS | `cat:181-182,385-386` | — | |

### D5 `moim_member_removed` (대상 · 푸시O · **끌 수 없음** · 공개 페이지)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-member_removed-trigger | 내보내기·차단 | PASS | 사용자 `members/[userId]/remove/route.ts:21-29`, 어드민 `admin/moim/moims/[moimId]/members/[userId]/route.ts:55-66` | — | |
| S7-member_removed-wrong | 대상(멤버였던 사람) | FAIL | 사용자 경로는 `was_active` 확인 없이 보냄 `remove/route.ts:21` | 「내보내졌어요」 | 이전 P3-16 · 비회원 차단에도 알림 |
| S7-member_removed-off | 「**X**」 | PASS | `policy:86` | — | |
| S7-member_removed-dedupe | 중복 키 | PASS | 분 단위 `remove/route.ts:26`, 어드민 ms `:62` | — | 같은 1분 안 내보내기→재가입→내보내기면 두 번째가 버려짐(가능성 낮음) |
| S7-member_removed-link | 「모임 공개 페이지」 | PASS | `/moim/{id}` 비멤버 = 공개 화면 | — | |
| S7-member_removed-copy | 문구 | PASS | `cat:179-180,383-384` | — | |

### D6 `moim_role_changed` (대상 · 벨O 푸시X · 끌 수 있음 O · 모임 홈)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-role_changed-trigger | 역할 변경 시 | FAIL | 사용자 경로 `members/[userId]/route.ts:23` `role !== "member"` 일 때만 · 어드민 `:43` 은 모두 | — | 이전 P2-15 |
| S7-role_changed-push | 푸시 X | PASS | `notify:55` BELL_ONLY | — | |
| S7-role_changed-off | 끌 수 있음 O | FAIL | S7-member_joined-off 와 같은 원인 | — | NEW (같은 근본) |
| S7-role_changed-dedupe | 중복 키 | PASS | `${target}:${role}:분` / 어드민 ms | — | |
| S7-role_changed-link | 「모임 홈」 | PASS | `moimPaths.home` | — | |
| S7-role_changed-copy | 문구 | FAIL | `cat:184` 「{moim}에서 {role}이 됐어요」 + `moim_role_member`=「멤버」(`cat:25`) | 어드민이 멤버로 내리면 「…에서 멤버이 됐어요」(조사 오류). en 「You are now Member in …」 | NEW |

### D7 `moim_host_transfer_requested` (위임받을 사람 · 푸시O · **끌 수 없음** · 수락 화면)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-host_transfer_requested-trigger | 위임 요청 | PASS | `host-transfer/route.ts:20-29` | — | |
| S7-host_transfer_requested-wrong | 받는 사람이 나간 뒤 | FAIL | 요청이 살아 있어 재가입 뒤 수락 가능 | — | 이전 P1-1 |
| S7-host_transfer_requested-off | 「**X**」 | PASS | `policy:87` | — | |
| S7-host_transfer_requested-dedupe | 중복 키 | PASS | `transfer_id` 새 행 `b2:533-534` | — | |
| S7-host_transfer_requested-link | 「수락 화면」 | PASS | 모임 홈 배너 — `moim-queries.server.ts:405-407` 열린 요청 조회 | `components/moim/MoimDetailScreen.tsx` 수락·거절 | |
| S7-host_transfer_requested-copy | 문구 | PASS | `cat:185-186,389-390` | — | |

### D8 `moim_host_changed` (전체 멤버 · 벨O 푸시X · 끌 수 있음 O · 모임 홈)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-host_changed-trigger | 모임장 바뀔 때 | PASS | 위임 수락 `host-transfers/[transferId]/route.ts:26-40`, 어드민 지정 `admin/…/members/[userId]/route.ts:71-82`, 미접속 요청 승인 `admin/moim/host-requests/[transferId]/route.ts:30-39`, 탈퇴 자동 위임 `lib/moim/server/moim-account-cleanup.server.ts:17-30` | — | 4경로 모두 |
| S7-host_changed-recipients | 「전체 멤버」 | PASS | `listActiveMoimMemberIds` / `moim__active_member_ids`(`m5:145-150`) | — | |
| S7-host_changed-push | 푸시 X | PASS | `notify:56` | — | |
| S7-host_changed-off | 끌 수 있음 O | FAIL | S7-member_joined-off 와 같은 원인 | — | NEW (같은 근본) |
| S7-host_changed-dedupe | 중복 키 | PASS | transferId / `${moim}:${user}:ms` / `account_withdrawal:…` | — | |
| S7-host_changed-copy | 문구 | PASS | `cat:187-188,391-392` | — | |

### D9 `moim_notice_posted` (멤버 · 푸시O · 모임별 끄기 · 공지 글)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-notice-trigger | 공지 작성 | PASS | `posts/route.ts:54-69` `board_kind==="notice"` | — | |
| S7-notice-recipients | 「멤버」(작성자 제외, 활성) | PASS | `posts/route.ts:60-61` | — | |
| S7-notice-off | 「O(모임별 끄기)」 | PASS | `filterMoimRecipientsByPref(…,"notice")` 기본 켜짐 `notify:140` | 설정 화면 | 조회 실패 시는 S7-pref-read-error |
| S7-notice-dedupe/link/copy | 공지 글 | PASS | `postId`, `moimPaths.post` → `posts/[postId]/page.tsx`, `cat:189-190,393-394` | — | |

### D10 `moim_post_new` (켠 멤버 · 푸시X · 기본 꺼짐 D9 · 글)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-post_new-recipients | 「멤버(켠 사람만)」 | PASS | `posts/route.ts:61` pref `posts` | — | |
| S7-post_new-default-off | 「기본 꺼짐, D9」 | PASS | `notify:140` `posts:false` | — | |
| S7-post_new-push | 푸시 X | PASS | `notify:57` | — | |
| S7-post_new-dedupe/link/copy | 글 | PASS | `postId`, 글 상세, `cat:211-212,415-416` | — | |

### D11 `moim_comment` (글쓴이·멘션 대상 · 푸시O · 끌 수 있음 O · 글)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-comment-recipients-author | 「글쓴이」 | PASS | `comments/route.ts:20-27` 본인 제외 | — | |
| S7-comment-recipients-mention | 「멘션 대상」 | FAIL | 멘션 파싱·발송 코드 없음 | — | 이전 P3-14·D-2 |
| S7-comment-wrong | 나간·내보내진·차단된 글쓴이 | FAIL | `m3:155` 멤버 여부 확인 없음 | 눌러도 404 | 이전 P2-14 |
| S7-comment-push/off | 푸시 O · 끌 수 있음 O | PASS | social | — | |
| S7-comment-dedupe/link/copy | 글 | PASS | `comment_id`, 글 상세, `cat:191-192,395-396` | — | |

### D12 `moim_schedule_created` (멤버 · 푸시O · 모임별 끄기 · 일정)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-schedule_created-all | 받는 사람·끄기·키·이동·문구 | PASS | `schedules/route.ts:36-50` 활성 멤버−작성자, pref `schedules`, `scheduleId`, 일정 상세 | `cat:195-196,399-400` | |

### D13 `moim_schedule_requested` (일정 호스트 · 푸시O · 끌 수 있음 O · 일정 신청 현황)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-schedule_requested-trigger | 승인제 일정 신청 | PASS | `schedules/[scheduleId]/join/route.ts:18-26` `status==="requested"` | — | |
| S7-schedule_requested-recipients | 「일정 호스트」 | FAIL | 호스트가 나가도 `host_user_id` 그대로 | — | 이전 P2-3 |
| S7-schedule_requested-dedupe/link/copy | 일정 신청 현황 | PASS | `${schedule}:${user}:분`, 일정 상세(참여자 목록), `cat:197-198,401-402` | — | |

### D14 `moim_schedule_decided` (신청자 · 푸시O · **끌 수 없음** · 일정)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-schedule_decided-all | 받는 사람·필수·키·이동·문구 | PASS | `participants/[userId]/route.ts:25-37`, `policy:89-90`, 일정 상세, `cat:199-202,403-406` | — | |

### D15 `moim_schedule_reminder` (확정 참여자 · 푸시O · 끌 수 있음 O · 일정)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-reminder-trigger | 24시간 전·1시간 전 | PASS | `m4:377-407`, 크론 `cron/moim-schedules/route.ts:58-77` | — | |
| S7-reminder-recipients | 「확정 참여자」 | PASS | `m4:401-402` `status='confirmed'` | — | |
| S7-reminder-off | 끌 수 있음 O | PASS | 크론 `:67` pref `schedules` | — | |
| S7-reminder-dedupe | 정당한 두 번째 알림 | FAIL | 시간 변경 뒤 같은 키 `moim:kind:scheduleId:user` 로 버려짐 | — | 이전 P2-13 |
| S7-reminder-delivery | 발송 보장 | FAIL | 「보냄」 표시 후 발송(`m4:396-400` → 크론) — 중간 실패 시 영구 유실 | — | 이전 P3-17 |
| S7-reminder-copy | 문구 의미 | FAIL | `m4:390` 24h 창 = 시작 2~24시간 전 | ko 제목 「내일 일정」(`cat:203`), en 「Meetup tomorrow」 — 시작 3시간 전에 만든 오늘 일정에도 「내일」 | NEW |

### D16 `moim_schedule_cancelled` (확정 참여자 · 푸시O · **끌 수 없음** · 일정)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-cancelled-trigger-user | 관리권자 취소 | PASS | `schedules/[scheduleId]/route.ts:43-52` | — | |
| S7-cancelled-trigger-close | 모임 종료 | PASS | `close/route.ts:46-56`(B13) | — | |
| S7-cancelled-trigger-admin | 어드민 취소 · 신고 처리 | PASS | `admin/moim/content/route.ts:41-49`, `decision/route.ts:171-182` | — | |
| S7-cancelled-trigger-admin-delete | 어드민 모임 삭제로 취소될 때 | FAIL | `m5:545` 진행 중 일정을 `cancelled` 로 바꾸지만 참여자 목록을 돌려주지 않고, `lifecycle/route.ts:22` 도 알림 없음 | — | NEW · 최고관리자가 모임을 지우면 확정 참여자는 일정 취소를 모름 |
| S7-cancelled-recipients | 「확정 참여자」 | FAIL | 4경로 모두 `confirmed`+`requested`(`m6:102`, `m5:397`, `close/route.ts:32`, m4 취소) | — | 이전 P3-19 · 승인 대기자에게도 끌 수 없는 알림 |
| S7-cancelled-off | 「**X**」 | PASS | `policy:91` | — | |
| S7-cancelled-dedupe | 중복 | PASS | `scheduleId` — 취소는 한 번만(`m5:396`, 종료는 열린 일정만) → 두 경로 중복 없음 | — | |
| S7-cancelled-link/copy | 일정 | PASS | 일정 상세, `cat:207-208,411-412` | — | |

### D17 `moim_closed` (전체 멤버 · 푸시O · **끌 수 없음** · 공개 페이지)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-closed-all | 받는 사람·필수·키·이동·문구 | PASS | `close/route.ts:38-45`, `policy:88`, `moimId`, `/moim/{id}`(멤버는 보관 기간 열람), `cat:193-194` | — | §7 「공개 페이지」 → 멤버에겐 종료 안내 화면(`MoimPublicView.tsx:43`) |

### D18 `moim_sanctioned` (모임장(차단 시 전체 멤버) · 푸시O · 필수 · 모임 홈 배너)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-sanctioned-recipients | 「모임장(차단 시 전체 멤버)」 | PASS | `m5:480-481`, `m6:179-180` | — | |
| S7-sanctioned-trigger | 모든 제재 | FAIL | content_hide 단독은 미발송 | — | NEW = S14-notify-content-hide |
| S7-sanctioned-mandatory | 「필수(mandatory)」 「**X**」 | PASS | `policy:93` | — | |
| S7-sanctioned-dedupe | 중복 키 | PASS | `sanction_id` | — | |
| S7-sanctioned-link | 「모임 홈 배너」 | PASS | `/moim/{id}` — 경고 배너(운영진), 차단 배너(전원). 추천 제외는 배너 없음(P14 효과에 배너 없음) | — | |
| S7-sanctioned-copy | 문구 | PASS | 단계별 `cat:154-159,358-363` | — | |

### D19 `moim_report_result` (신고자 · 벨O · 푸시 = 커뮤니티 설정 · 모임 페이지)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-report_result-trigger | 신고 처리 시 | PASS | `decision/route.ts:129-139` | — | |
| S7-report_result-recipients | 「신고자」(함께 닫힌 신고 포함) | PASS | `m6:155-163` `reporter_ids` | — | |
| S7-report_result-push | 원문 「푸시 X」 | N/A | open-items §0(`moim-open-items-audit-2026-11-12.md:10-13`) 「푸시는 커뮤니티 알림 설정을 따른다」로 대체 | — | |
| S7-report_result-push-new | 대체 규칙: 커뮤니티 설정 따름 | PASS | override 없음 → `policy:59` social(푸시 설정 가능) | — | |
| S7-report_result-category | 「기존 `community_report_result` 분류」 | PASS | `notification-item-registry.ts:337-346` | — | |
| S7-report_result-off | 원문 「X」 | N/A | open-items §0 대체(설정 따름) | — | |
| S7-report_result-scope | 「조치했는지 여부만 … 조치 내용은 알리지 않는다」 | PASS | `decision/route.ts:133` 변형 actioned/dismissed 만 | `cat:166-169` | |
| S7-report_result-link | 원문 「알림 상세」 → 모임 페이지 | PASS | open-items §0 대체. `moimPaths.home` | — | 종료·삭제 모임이면 404(미확인 상황) |
| S7-report_result-copy | 문구 의미 | FAIL | — | en 「your report about {moim}」(`cat:371,373`) — 글·멤버·채팅을 신고해도 「모임에 대한 신고」로 씀 | NEW (경미) |

### D20 모임·일정 채팅 메시지 (방 참여자 · 메신저 규칙 · community_chat · 방별 무음)
| ID | 요구 | 판정 | 서버 증거 | 화면·문구 | 비고 |
|---|---|---|---|---|---|
| S7-chat-rules | 「메신저 규칙」 | NOT_PROVEN | 모임 방 = `community_messenger_rooms`(owner_domain moim). 메신저 발송 경로는 이번에 추적 안 함 | — | |
| S7-chat-mute | 「방별 무음」 | NOT_PROVEN | 묶음 4 설계(`moim-bundle4-design-2026-11-28.md:53`) 「알림 끄기」 유지 — 코드 미추적 | `MoimNotificationSettingsScreen.tsx:106` 방으로 이동 | |

### D21 §7 에 없는 추가 종류 (참고)
| ID | 종류 | 판정 | 근거 | 비고 |
|---|---|---|---|---|
| S7-extra-review | `moim_schedule_review` | N/A | P10 후기 안내 — 크론 `cron/moim-schedules/route.ts:42-55` | 나간 사람에게도 감: 이전 P3-18 |
| S7-extra-info-updated | `moim_admin_info_updated` | N/A | §8 「모임장에게 알린다」 — `admin/moim/moims/[moimId]/route.ts:101-109` | |
| S7-extra-host-request-result | `moim_host_request_result` | N/A | P8 — `host-requests/[transferId]/route.ts:40-49`, `policy:94` 필수 | |

## E. §8 어드민

| ID | 요구 | 판정 | 서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S8-key | 「권한 키 `moim`」 | PASS | 모든 `app/api/admin/moim/**` `requireAdminPermission("moim")` | `lib/admin/access/admin-route-access.ts:286` | |
| S8-menu-api-same | 「메뉴 링크와 API 가 같은 권한 키로 판정」 | PASS | 위 두 곳 같은 키. 운영자 권한 적용 open-items §5 | `components/admin/admin-menu.ts:1068-1073` | 운영자 실화면 NOT_PROVEN |
| S8-list-tabs | 「전체/정상/추천 제외/경고/차단/종료/삭제」 | PASS | `lib/admin/moim/moim-admin-contract.ts:9`, `moim-admin-queries.server.ts:173-191` | `AdminMoimListPage.tsx` | |
| S8-list-filters | 「동네 · 카테고리 · 개설일 · 신고 수 · 마지막 활동」 | PASS | `app/api/admin/moim/moims/route.ts:40-71`, 쿼리 `:166-198` | | |
| S8-list-search | 「모임 이름 · 모임장(닉네임·DIBAY ID) · ID」 | PASS | `moim-admin-queries.server.ts:151-162` | | |
| S8-list-csv | 「CSV 내보내기는 감사 기록을 남긴다」 | PASS | `moims/route.ts:80-114` 감사 실패 시 내보내지 않음 | | |
| S8-detail-tabs | 10개 탭 | PASS | `moim-admin-contract.ts:19-30` | `AdminMoimDetailPage.tsx` | |
| S8-info-fields | 「이름·소개·사진·카테고리·정원·가입 방식·질문·동네」 | PASS | `admin/moim/moims/[moimId]/route.ts:57-86` | | |
| S8-info-reason | 「사유 필수」 | PASS | 같은 파일 `:94-95`, `b2:307` 계열 `moim__admin_reason` | | |
| S8-info-before-after | 「변경 전후를 기록」 | PASS | `b2:386` `moim__admin_log(…, v_before, p)` | | |
| S8-info-notify-host | 「모임장에게 알린다」 | PASS | `moims/[moimId]/route.ts:101-109` | `cat:160-161` | |
| S8-members-list | 「역할·상태·가입일·재가입 횟수·실제 계정 링크」 | PASS | `moim-admin-queries.server.ts:353` | `AdminMoimDetailPage.tsx:399,423`, `admin-moim-shared.tsx:101` | |
| S8-members-actions | 「역할 변경 · 내보내기 · 차단 · 차단 해제 · 모임장 지정」 | PASS | `moim-admin-contract.ts` MEMBER_ACTIONS, `admin/…/members/[userId]/route.ts` | `AdminMoimDetailPage.tsx:376,431,447` | 일정 방 역할 미반영은 이전 W2/P2-4 |
| S8-content-post-album | 「게시글·앨범 — 보기 · 숨김 · 복구 · 삭제(슈퍼관리자)」 | PASS | `m5:386-455`, 최고관리자 판정 `content/route.ts:36-38` | | |
| S8-content-schedule | 「일정 — 보기 · 숨김 · 복구 · 삭제」 | FAIL | `m5:391-405` 일정은 `cancel` 만(숨김·복구·삭제 없음), `content/route.ts:31` | | NEW · 잘못 숨김한 일정을 되돌릴 수 없음(취소 확정) |
| S8-chat-tab | 「모임 방·일정 방 목록 → 기존 메신저 어드민 화면으로 이동」 | PASS | `moim-admin-queries.server.ts:454-470` | `admin-moim-detail-panels.tsx:349,426` | 메시지 숨김·읽기 전용 동작은 메신저 어드민 몫(미추적) |
| S8-events-tab | 「`moim_events` 전체(사용자·어드민·시스템)」 | PASS | `moim-admin-queries.server.ts` `case "events"` | `admin-moim-detail-panels.tsx:490` actor_kind 표시 | |
| S8-reports-queue | 「접수 / 검토 중 / 조치 / 기각」 | PASS | `moim-admin-contract.ts:37`, `reports/route.ts` | `AdminMoimReportsPage.tsx` | |
| S8-reports-type-filter | 「대상 유형 필터」 | PASS | `reports/route.ts:3,20` | | |
| S8-reports-group | 「같은 모임 신고 묶음 보기」 | PASS | `view=group` → `groupAdminMoimReports` | | |
| S8-reports-drawer | 「대상 미리보기 · 신고 사유 · 신고자 · 같은 대상 신고 이력」 | PASS | `moim-admin-queries.server.ts:590-650` | `AdminMoimReportDecisionForm.tsx` | |
| S8-reports-actions | 「기각 / 콘텐츠 숨김 / 추천 제외 / 경고 / 모임 차단 / 이용 제한(기간)」 | PASS | `decision/route.ts:83-106`, `m6:65-141` | | |
| S8-reports-atomic | 「`moim_sanctions` 생성 + 신고 상태 변경 + 신고자 알림을 **한 번에**」 | PASS | `m6` 한 트랜잭션(제재·상태·기록) + 같은 요청 안에서 알림(`decision/route.ts:129-139`) | | 알림은 트랜잭션 밖 best effort — 알림 실패해도 처리 성공 |
| S8-host-requests | 「모임장 마지막 접속, 요청자, 후보 → 승인(지정) / 거절」 | PASS | `host-requests/route.ts`, `[transferId]/route.ts`, `b2:594` | `AdminMoimHostRequestsPage.tsx:93-114` | |
| S8-sanctions-moim | 「모임 … 별 제재 목록, 해제, 만료 예정」 | PASS | `sanctions/route.ts`, `moim-admin-queries.server.ts:824-853` (`expiring`) | `AdminMoimSanctionsPage.tsx` | |
| S8-sanctions-user | 「… 사용자별 제재 목록」 | FAIL | `moim-admin-queries.server.ts:833` `target_kind='moim'` 만, 사용자 필터 없음 | | NEW · 이용 제한·콘텐츠 숨김 제재는 「제재 이력」 화면에 안 나옴(모임 상세 탭에서만 보임 `:484-495`) |
| S8-categories | 「추가 · 이름(ko·en) · 순서 · 사용 중지 · 개설 금지」 | PASS | `admin/moim/categories/route.ts`, `moim-admin-queries.server.ts:857-863` | `AdminMoimCategoriesPage.tsx` | |
| S8-policies-numbers | 「1인 개설 수, 정원 상한, 역할 인원 상한, 게시판·공지 고정 수, 대기 신청 만료일, 종료 모임 보관일」 | PASS | `moim-admin-contract.ts` POLICY_INT_KEYS, `policies/route.ts:38-48` | `AdminMoimPoliciesPage.tsx` | |
| S8-policies-banned-words | 「금지어 목록」 | PASS | `policies/route.ts:49-59` | | 질문 금지어 별도 고정은 이전 P3-6 |
| S8-policies-type-notice | 「금지 모임 유형 안내문」 | FAIL | 정책 항목 없음, 코드 상수 | `MoimCreateWizard.tsx:24-33` | 이전 P3-7 |
| S8-policies-report-reasons | 「신고 사유 목록 … 코드 상수로 박지 않음」 | FAIL | `lib/moim/moim-report-reasons.ts:2-15` 상수, 정책 저장 항목 없음(`policies/route.ts:38-59`) | | NEW · 어드민이 필리핀 기준(D10) 사유를 추가·변경할 수 없음 |
| S8-dashboard | 「신규 모임 · 활성 모임(7일 활동) · 신고 대기 · 위임 요청 대기」 | PASS | `lib/admin/metrics/community-metrics.ts:200,208,276,284`, `load-community-metrics.ts:205-220` | | |
| S8-common-reason | 「모든 쓰기는 사유가 필수」 | FAIL | 다른 어드민 쓰기는 모두 `moim__admin_reason`(표 집계). 예외: `m6:13-23` `moim_admin_report_review` 는 사유 없이 상태를 바꾸고 고정 문자열 'review' 를 기록 | `reports/[reportId]/review/route.ts:14-19` 본문 없음 | NEW (경미) |
| S8-common-lock-ok | 「낙관적 잠금 … 다르면 409」 | PASS | 정보 수정 `b2:330`, 정책·카테고리 `m5:579,617`, 신고 처리 `m6:72`(expectedStatus). 상태 확인으로 409: 콘텐츠 `m5:430-433`, 삭제·복구 `m5:542,562`, 제재 해제 `m5:493`, 미접속 요청 `b2:594` 계열 | | |
| S8-common-lock-missing | 같은 조항 | FAIL | 역할 변경 `m5:260-282`, 모임장 지정 `b2:567-591`, 모임 제재 적용 `m5:459-484` 에 기대값 비교 없음 | | NEW · 두 관리자가 옛 화면에서 같은 모임에 「차단」을 누르면 제재 2건 생성(하나 해제해도 차단 유지) / 옛 화면 기준 역할·모임장 지정이 409 없이 덮어씀 |
| S8-common-log | 「`audit_logs` 와 `moim_events` 에 동시에 기록」 | PASS | `m5:78-91` `moim__admin_log` — 위 모든 어드민 RPC 가 호출(표 집계 log≥1) | | 카테고리·정책은 모임 단위가 아니라 `audit_logs` 만(open-items §5 「설계 그대로」) |
| S8-common-notify-ok | 「당사자에게 알린다」 | PASS | 정보 수정·역할·내보내기/차단(활성)·모임장 지정·미접속 요청·일정 취소·모임 제재·신고 처리 | | |
| S8-common-notify-missing | 같은 조항 | FAIL | 알림 없음: 차단 해제(`admin/…/members/[userId]/route.ts:68-70`), 콘텐츠 숨김·복구·삭제 작성자(`content/route.ts:40-50`), 제재 해제 모임장(`sanctions/[sanctionId]/route.ts:21`), 모임 삭제·복구 모임장·멤버(`lifecycle/route.ts:22-23`) | | NEW · 예: 최고관리자가 모임을 삭제해도 모임장·멤버는 알림이 없고 모임이 404 로 사라짐 |

---

## 집계

| 판정 | 수 |
|---|---|
| PASS | 157 |
| FAIL | 38 |
| NOT_PROVEN | 6 |
| N/A | 6 |
| 합계 | 207 |

- FAIL 중 이전 감사와 같은 것 17행(P1-1, P2-2, P2-3, P2-6, P2-13, P2-14, P2-15, P3-7, P3-12×2, P3-13, P3-14×2, P3-15, P3-16, P3-17, P3-19), NEW 21행.
- 모든 판정은 코드 PASS·코드 FAIL 기준이다. 운영 DB·실기기·화면 확인은 하지 않았다(NOT_PROVEN).
- 계약·플랫폼 충돌(Owner 보고 대상, AGENTS 허위 보고 금지 7번): §7 「벨만(푸시 X) + 끌 수 있음 O」 3종(`moim_member_joined`·`moim_role_changed`·`moim_host_changed`)은 플랫폼 정책상 알림함이 항상 저장되어 끌 대상이 없다.

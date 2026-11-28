# G1 — 데이터 모델·신원·채팅 구분·카테고리·미결 결정 조항별 대조 (2026-11-28)

- 기준: `/Users/bkkim/projects/samarket-wt-moim-address` HEAD `04ee097fb` (읽기 전용). 운영 DB·사이트·앱·기기 확인 0회.
- 범위: 설계 v1 §0·§1·§2·§3.1·§3.2·§3.3·§4 · 카테고리 드롭다운 문서 전체 · open-items 감사 전체.
- 뒤 문서 우선: 설계 v1 §11 D1~D10(Owner 승인 권장안) · §10 M2 행 · `docs/moim-ssot.md` 고정 사항 · 묶음 2~6.
- 판정: PASS = 서버·화면(사용자 대면이면 둘 다) 코드 증거 있음 · FAIL = 구체적 실패 상황 있음 · NOT_PROVEN = 운영 DB/기기/절차 증거 필요 · N/A = 뒤 승인 문서로 대체됐거나 설명·근거·기각안.
- 판정은 모두 **코드 기준**이다. 운영·실기 PASS 가 아니다.

파일 약칭 (모두 `supabase/migrations/`):
M1B=`20271112200000_moim_m1b_drop_legacy_meetings.sql` · M2=`20271112210000_moim_m2_schema_rpc.sql` · M3=`20271112230000_moim_m3_board_rpc.sql` · M4=`20271113100000_moim_m4_schedule_album_prefs.sql` · M5=`20271113200000_moim_m5_admin_rpc.sql` · PERM=`20271113500000_moim_admin_permission_for_active_operators.sql` · BKDROP=`20271113510000_moim_m1b_backup_drop.sql` · TOPIC=`20271113600000_moim_category_custom_topic.sql` · EXEC=`20271113700000_moim_policy_executors.sql` · B2=`20271128110000_moim_bundle2_permissions.sql` · NOTICE=`20271128130000_moim_room_notice_guard.sql`.
화면 약칭: PRES=`lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts` · SHEETS=`components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx` · HDR=`components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx` · LIST=`components/community-messenger/MessengerChatListItem.tsx` · Q=`lib/moim/server/moim-queries.server.ts` · AQ=`lib/admin/moim/moim-admin-queries.server.ts`.

## 집계

- 요구 260개: PASS 204 · FAIL 8 · NOT_PROVEN 29 · N/A 19
- FAIL: S2-11(P2-11) · S2-23(NEW) · S2-25(NEW) · S3.1-27(P2-19) · S3.1-41(NEW) · S3.2-04(P3-20·P3-26) · S3.2-06(P3-20) · S3.2-12(NEW)
- 위험을 숨긴 새 NOT_PROVEN: S3.3-18(참여자 DELETE 경로는 트리거 밖) · S4-10(메신저 모임 방에서 DIBAY 프로필 노출 가능성)

---

## §0 한 장 요약

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S0-01 | 모임은 동네(도시·LGU) 단위 지속 커뮤니티 | PASS | M2:79 `lgu_id not null`; B2:147-156 기본 주소 LGU; Q:240-246 동네 목록 | `components/moim/MoimTabHome.tsx` 우리 동네 목록 | |
| S0-02 | 멤버·역할·게시판·일정(정모)·앨범을 갖는다 | PASS | M2:103,214,227,258,296 | `components/moim/MoimMemberView.tsx` 탭 | |
| S0-03 | 채팅은 모임에 딸린 방 | PASS | M2:90 `main_room_id`; B2:213-214 개설 시 방 생성 | HDR:516-524 「모임 홈」 | |
| S0-04 | 모임 채팅방에는 모임 멤버만 자동으로 들어간다 | PASS | M2:603-623 `moim__activate_member`→`moim__room_member_activate`; M2:403-424 다른 경로 INSERT 거부 | — | |
| S0-05 | 옛 모임 코드·테이블·문서를 모두 지운다 | PASS | M1B:142-208 | 옛 경로 21곳 부재(§1 행 참조) | |
| S0-06 | 테이블 26·API 25·컴포넌트 약 20·메신저 결합 6곳 | NOT_PROVEN | M1B 목록은 25표+옛 오픈채팅 엔진 9표 | — | 숫자 대조는 운영 `to_regclass` 목록 필요 (§1 S1-07) |
| S0-07 | 운영 데이터 0건, 옮길 데이터 없음 | N/A | — | — | 11-12 시점 사실(설명) |
| S0-08 | 새 도메인 이름 `moim`, 테이블 접두 `moim_` | PASS | M2:40-367 표 22개 전부 `moim_*`; M4:20 `moim_notification_prefs` | — | |
| S0-09 | 옛 `meetings`·메신저 `group` 이름과 섞이지 않게 | PASS | 코드 식별자 분리 (`lib/moim/**`, `owner_domain='moim'`) | — | 고객 문구 충돌은 S2-23·S2-25 FAIL |
| S0-10 | 채팅 3종 경계는 바꾸지 않는다 | PASS | `lib/chat-domain/samarket-three-chat-pillars.ts` 에 moim 없음; `docs/dibay-messenger-domain-group-hard-lock.md:184` | — | |
| S0-11 | 모임 채팅 = community 메신저 안의 그룹방 | PASS | M2:532 `room_type='private_group'` | — | |
| S0-12 | `chat_domain='group'` 그대로, 새 채팅 종류 없음 | PASS | M2:536-537 | — | |
| S0-13 | 방에 「소유 모임」 표시 열만 추가 | PASS | M2:21-35 (열 2·check·인덱스) | — | |
| S0-14 | 입장·내보내기·차단은 모임 서버만 | PASS | M2:403-448 트리거 + `moim__writer_on` M2:390-395 | — | |
| S0-15 | 메신저 방 안 초대 링크·내보내기·차단·나가기 버튼 감춤 | PASS | — | PRES:115-116,275-293; SHEETS:736,1163,1228; `MessengerChatRoomActionSheet.tsx:179-180` | 판정 응답 전 잠깐 보임 = P3-29 (DB 가 거부) |
| S0-16 | 이 기능들은 모임 화면에서 한다 | PASS | `app/api/moim/[moimId]/members/**`, `invite-links`, `leave` | `components/moim/manage/*`, SHEETS:724-735 「모임 홈으로 가기」 | |
| S0-17 | 신원 = 전화 인증 회원 + 모임별 프로필 | PASS | S4-03·S4-04 참조 | S4-03·S4-04 참조 | |
| S0-18 | 익명 아님·실명 강제 아님 | PASS | 실명 검사 없음; 닉네임 자유 B2:185-186 | `MoimJoinSheet.tsx:44` | |
| S0-19 | 근거: 당근 FAQ 3730 실명 요구 금지 | N/A | — | — | 근거 문장 |
| S0-20 | 근거: `realname_verified` 0/142 | N/A | — | — | 운영 사실 인용 |
| S0-21 | 프로세스 16개 정의 | N/A | — | — | 목록 문장. 각 프로세스는 다른 표(G2~) 범위 |

## §1 지울 것

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S1-01 | `meetings` 삭제 | PASS | M1B:183 | — | |
| S1-02 | `meeting_members`·`join_requests`·`join_questions`·`join_answers`·`member_bans` 삭제 | PASS | M1B:154-165 | — | |
| S1-03 | `meeting_notices`·`meeting_events` 삭제 | PASS | M1B:161-162 | — | |
| S1-04 | `meeting_feed_posts`·`feed_images`·`feed_comments`·`album_items` 삭제 | PASS | M1B:155-158 | — | |
| S1-05 | `meeting_reports`·`meeting_action_logs` 삭제 | PASS | M1B:159-160 | — | |
| S1-06 | `meeting_chat_rooms`·`meeting_chat_participants` 삭제 | PASS | M1B:152-153 | — | |
| S1-07 | `meeting_open_chat_*` 10개 삭제 | NOT_PROVEN | M1B:143-151 은 9개 | — | 10번째 표가 운영에 있었는지 운영 `pg_class` 조회 필요 |
| S1-08 | `_samarket_meeting_cm_backfill_work` 삭제 | PASS | M1B:166 | — | |
| S1-09 | `can_manage_meeting`·`has_joined_meeting_member`·`enforce_meeting_member_cap`·`refresh_meeting_room_stats`·`sync_meeting_chat_participant` 삭제 | PASS | M1B:185-192 | — | |
| S1-10 | `log_meeting_*`·`after_meeting_*`·`meetings_sync_*`·`meeting_members_apply_defaults`·`touch_meeting_room_timestamp` 삭제 | PASS | M1B:189-199 | — | 다른 시그니처 잔존은 운영 확인 필요(낮은 위험) |
| S1-11 | `admin_community_meetings_page`·`admin_meeting_reports_page` 삭제 | PASS | M1B:200-201 | — | |
| S1-12 | `community_posts.is_meetup`·`meetup_date`·`meetup_place` 삭제 | PASS | M1B:205-207 | — | |
| S1-13 | `app/api/community/meetings/**`·`philife/meetings/**`·`meetup-feed-topics` 삭제 | PASS | 경로 부재 | — | |
| S1-14 | `neighborhood-posts` meetup 분기 삭제 | PASS | `app/api/community/neighborhood-posts/route.ts:96-99` → 400 `meetup_removed` | — | |
| S1-15 | 메신저 결합 3파일 삭제 | PASS | `philife-meeting-open-group-summaries.ts`·`meeting-chat-sync.ts`·`home/fetch-meeting-deeplink.ts` 부재 | — | |
| S1-16 | `rooms/[roomId]/meeting-ensure-participant` 삭제 | PASS | 경로 부재 | — | |
| S1-17 | `components/community-messenger/meetings/*` 삭제 | PASS | — | 경로 부재 | |
| S1-18 | `service.ts` meetings 조인 삭제 | PASS | `from("meetings")` 0건 (grep) | — | |
| S1-19 | `components/meetings/*`·`components/community/meeting/*` 삭제 | PASS | — | 경로 부재 | |
| S1-20 | `components/community/Meeting*` 삭제 | PASS | — | `ls components/community` 에 Meeting* 0 | |
| S1-21 | `app/(main)/philife/meetings`·`community/meetings` 삭제 | PASS | — | 경로 부재 | |
| S1-22 | 어드민 4화면 + API·컴포넌트 삭제 | PASS | `app/admin/community/meetings`·`philife/meetings`·`meeting-reports`·`meeting-events` 부재 | — | |
| S1-23 | `admin-menu` 항목·대시보드 지표 2개 삭제 | PASS | `/admin/.*meeting` 참조 0 (grep, 테스트 픽스처 제외) | — | |
| S1-24 | 알림 `community_meeting`·`community_meeting_decision` → `moim_*` | PASS | `lib/notifications/notification-item-registry.ts:278-313` 키 `moim`·종류 `moim_*` | — | 소리 키만 `item_community_meeting` 재사용(운영 행 유지, 주석 278) |
| S1-25 | 옛 문서 4개 삭제 | PASS | 4파일 부재 | — | |
| S1-26 | `docs/community-dangnae.md` 모임 절 삭제 | PASS | 같은 파일:8 「삭제됨」 안내로 교체 | — | |
| S1-27 | `hashMeetingPassword` 는 지우지 말고 `lib/community-messenger/` 로 이동 | PASS | `lib/community-messenger/open-group-password.ts` 존재, `lib/neighborhood/meeting-password.ts` 부재 | — | 5번 묶음에서 scrypt 로 교체(승인) |
| S1-28 | 삭제는 별도 단계(M1) | PASS | M1B 단독 마이그레이션 | — | |
| S1-29 | 운영 DB 적용은 Owner 승인 뒤 | NOT_PROVEN | — | — | 승인 기록·적용 시각은 운영 `schema_migrations` 와 대화 기록 필요 |
| S1-30 | 삭제 전 운영 행 수 0 재조회·보고 | NOT_PROVEN | — | — | 운영 조회 결과 필요 |

## §2 「모임」과 다른 채팅의 구분

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S2-01 | 친구 그룹채팅·오픈채팅 열(무엇·만드는 곳·입장·퇴장·내보내기·기록·표시·탐색·목록·상단) | N/A | — | — | 기존 채팅 설명. 모임 요구 아님 |
| S2-02 | 모임 전체 채팅 = 모임 멤버 전원의 방 | PASS | M2:603-623 활성화 = 방 입장; B2:36-66 비활성화 = 모든 방 퇴장 | — | |
| S2-03 | 일정 채팅 = 한 일정의 참여 확정자 방 | PASS | M4:67-82 `moim__schedule_confirm`; M4:139 호스트 확정 | — | |
| S2-04 | 모임 개설 시 전체 방 자동 생성 | PASS | B2:213-214 | — | |
| S2-05 | 일정 생성 시 일정 방 자동 생성 | PASS | M4:134-135 | — | |
| S2-06 | 모임 가입 = 자동 입장 | PASS | B2:461 (바로 가입), M2:899 (승인), M2:1318 (운영진 초대) → `moim__activate_member` | — | |
| S2-07 | 일정 참여 확정 = 자동 입장 | PASS | M4:247 선착순, M4:293 승인 → `moim__schedule_confirm` | — | |
| S2-08 | 모임 탈퇴 = 자동 퇴장 | PASS | M2:924 → B2:36-66 | — | |
| S2-09 | 방에서 나가기 없음 | PASS | M2:403-424 트리거; `app/api/community-messenger/rooms/[roomId]/leave/route.ts:55-58` 409 | SHEETS:736,1228 숨김; ActionSheet:179-180 | P3-29 응답 전 노출 |
| S2-10 | 일정 참여 취소 = 일정 방 퇴장 | PASS | M4:269 | — | |
| S2-11 | 일정 종료 후 보관 | FAIL | EXEC:67 `status = 'done'` 만 보관 | — | 취소 일정 방은 영원히 목록에 남음. **P2-11** |
| S2-12 | 모임 방 내보내기·차단 = 모임에서만 | PASS | M2:931-972; M2:426-448 (방 차단 INSERT 거부) | SHEETS:1163 운영 칸 숨김 | |
| S2-13 | 일정 방 내보내기 = 일정 호스트가 일정에서 | PASS | M4:304-322, M4:37-46 | `MoimScheduleDetailScreen.tsx:588` | 버튼 모양은 W4 |
| S2-14 | 기록 = 게시판·일정·앨범은 모임 홈 | PASS | M3·M4 RPC | `MoimMemberView.tsx` 탭(홈·게시판·일정·앨범·멤버) | |
| S2-15 | 일정 기록 = 일정 후기 게시판 | PASS | B2:200 `review` 게시판 기본 생성 | `moim_schedule_review` 알림(registry) | 일정별 후기 연결은 이 표 범위 밖 |
| S2-16 | 표시 이름 = 모임별 프로필 (전체·일정 방) | PASS | M2:543-559 room_profiles `alias`; M2:1210-1219 프로필 수정 동기화; `lib/community-messenger/service.ts:2163-2195` 별명 우선 | — | 실기 표시 NOT_PROVEN |
| S2-17 | 탐색 = 모임 찾기, 오픈채팅 목록에는 안 나옴 | PASS | M2:534 `is_discoverable=false`; `service.ts:4426-4427` `open_group`+discoverable 만 | — | |
| S2-18 | 일정 방 탐색 안 됨 | PASS | 같은 근거 | — | |
| S2-19 | 메신저 목록 「모임」 배지 + 모임 이름 | PASS | 방 제목 = 모임 이름 B2:294-302(수정), B2 어드민 수정 :381-382; `app/api/moim/rooms/route.ts` | LIST:1149-1156 | |
| S2-20 | 메신저 목록 「일정」 배지 + 일정 제목 | PASS | M4:184-186 제목 동기화 | LIST:1155 | |
| S2-21 | 방 상단 「모임 홈」 버튼 | PASS | — | HDR:516-524 | |
| S2-22 | 방 상단 「일정 보기」 버튼 | PASS | rooms route `scheduleId` | HDR:522 | |
| S2-23 | 결정: 메신저 「오픈채팅 → 모임 찾기」 진입은 모임 탭으로 옮긴다 | FAIL | `lib/community-messenger/messenger-settings-screen-model.ts:17` 설정 「모임」 행 | `components/community-messenger/MessengerSettingsScreen.tsx:249-265` 「모임 찾기」→`onOpenOpenChatDiscovery`, 「모임 만들기」→오픈그룹 만들기; 문구 `lib/i18n/catalog/community-messenger-ui.ts:339,674,678,681` | **NEW**. 메신저 › 설정 › 「모임」 › 「모임 찾기」를 누르면 모임 탭이 아니라 오픈채팅 찾기가 열리고, 「모임 만들기」는 오픈채팅 방을 만든다 |
| S2-24 | `/philife/write?category=meetup` 리다이렉트 이동 | PASS | — | `app/(main)/philife/write/page.tsx:31-34` → `/moim/new` | 탭이 아니라 만들기 화면(모임 도메인) |
| S2-25 | 오픈채팅은 오픈채팅으로만 남긴다 | FAIL | — | `lib/i18n/catalog/navigation.ts:148` `nav_messenger_open_group: "모임"` 을 `DiscoverableOpenGroupCard.tsx:27`·`MessengerChatSearchScreen.tsx:285`·`lib/messenger/contracts/domain-room-header-chrome.ts:97`·PRES:227 가 씀 | **NEW**. 한국어 화면에서 오픈채팅 방 종류·검색 구역 이름이 「모임」으로 나와 모임 탭의 모임과 같은 이름이 된다(영어는 "Open group") |
| S2-26 | 운영 `open_group` 8개는 손대지 않는다 | NOT_PROVEN | — | — | 운영 조회 필요 (낮은 위험) |

## §3.1 테이블

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S3.1-01 | `moims` id·name·intro·cover_image_url·category_id | PASS | M2:73-78 | — | |
| S3.1-02 | `lgu_id` = 개설자 기본 주소의 도시·LGU | PASS | B2:147-156 | `MoimCreateWizard.tsx:101-104` 동네 확인 | 1번 묶음 A1·A2 보완 포함 |
| S3.1-03 | `region_scope` `city`\|`nearby` | N/A | M2:80 `in ('city')` | — | 설계 §11 D3 승인 「1차는 같은 도시만」 |
| S3.1-04 | `join_mode` instant\|approval, `capacity` | PASS | M2:81-82 | — | |
| S3.1-05 | `age_min_birth_year`·`age_max_birth_year` (D5) | PASS | M2:83-84,100 | `MoimCreateWizard.tsx:65,341`, `MoimManageInfo.tsx:56` | |
| S3.1-06 | `show_age_band` (D5) | N/A | 열 없음 | — | D5 승인 「1차는 연령 제한만」 |
| S3.1-07 | `host_user_id`, `status` active\|closed\|deleted | PASS | M2:85-86; B2:866 null 허용(종료·삭제 계정만), B2:891-892 활성은 필수 | — | |
| S3.1-08 | `platform_state` normal\|unlisted\|warned\|blocked | PASS | M2:87 | — | |
| S3.1-09 | `member_count`·`last_activity_at`·`main_room_id` | PASS | M2:88-90 | — | |
| S3.1-10 | created_at·updated_at·closed_at·deleted_at·deleted_by | PASS | M2:92-96 | — | |
| S3.1-11 | `moim_categories` id·slug·sort_order·is_active·is_restricted | PASS | M2:61-71 | — | |
| S3.1-12 | `moim_categories.label_key`(i18n 키) | N/A | M2:64-65 `label_ko`·`label_en` | 어드민 입력 `AdminMoimCategoriesPage.tsx` | open-items §2 가 ko·en 값으로 등록하는 구조로 정함(TOPIC:283-284). 키 열은 없음 |
| S3.1-13 | `is_restricted` = 개설 금지 표시 | PASS | B2:158-159 거부; Q:95 목록 제외 | — | |
| S3.1-14 | `moim_members` moim_id·user_id | PASS | M2:103-106 | — | |
| S3.1-15 | role host\|co_host\|staff\|member | PASS | M2:107 | — | |
| S3.1-16 | status pending\|active\|left\|kicked\|banned\|rejected | PASS | M2:108 (+`cancelled`, 2번 묶음 B13) | — | |
| S3.1-17 | 모임별 프로필 nickname·avatar_url·bio | PASS | M2:109-111 | `MoimProfileScreen.tsx` | |
| S3.1-18 | joined_at·left_at·rejoin_count·invited_by·decided_by·decided_at | PASS | M2:112-117 | — | 승인 때 invited_by 덮어씀 = P3-4 |
| S3.1-19 | 고유(moim_id,user_id), 재가입 = 같은 행 갱신 + rejoin_count+1 | PASS | M2:124; M2:612-617 | — | 예전 활성 멤버였을 때만 +1 |
| S3.1-20 | `moim_join_questions` moim_id·order·text, 최대 3 | PASS | M2:137-143 (sort_order 1~3); B2:207 | — | |
| S3.1-21 | `moim_join_requests` 열·status 5종 | PASS | M2:145-157 | — | |
| S3.1-22 | `moim_bans` 열 | PASS | M2:159-169 | — | |
| S3.1-23 | `moim_member_notes` 열 | PASS | M2:171-180 | — | |
| S3.1-24 | `moim_permissions` moim_id·action·min_role | PASS | M2:182-189 | — | |
| S3.1-25 | 조정 가능한 항목만 저장 | PASS | M2:1180-1181 | `manage/MoimManagePermissions` | |
| S3.1-26 | `moim_invites` token·created_by·expires_at·usage_count·revoked_at | PASS | M2:191-200 | — | created_by FK 없음 = W1 |
| S3.1-27 | 초대 = 링크·QR | FAIL | 링크 M2:1226-1265 | QR 없음 (`manage/MoimManageInvite.tsx`) | **P2-19** (U6 초대 QR 없음) |
| S3.1-28 | `moim_invite_targets` 열·status | PASS | M2:202-212 (+cancelled) | — | |
| S3.1-29 | `moim_boards` kind 5종·write_min_role·sort_order | PASS | M2:214-225; 기본 4개 B2:200 | — | |
| S3.1-30 | `moim_posts` 열(visibility·is_pinned·status·hidden_by·hidden_reason) | PASS | M2:227-244; B2:845-846 author null 허용 | — | |
| S3.1-31 | `moim_comments` post_id·author_id·body·status | PASS | M2:246-256 | — | |
| S3.1-32 | `moim_schedules` 시간·장소·좌표·설명·정원 | PASS | M2:258-280 | — | |
| S3.1-33 | `moim_schedules` join_mode·ask_motivation·status 5종·room_id | PASS | M2:270-275 | — | |
| S3.1-34 | `moim_schedule_participants` status 5종·motivation·attendance | PASS | M2:282-294 | — | |
| S3.1-35 | `moim_album_items` 열 | PASS | M2:296-306 | — | |
| S3.1-36 | 앨범 상단 고정 최대 6 | PASS | M4:459-472 | `MoimAlbum.tsx` 고정 버튼 | |
| S3.1-37 | `moim_host_transfers` 열, kind direct\|inactive_request\|admin | PASS | M2:308-320 (+account_withdrawal, +status) | — | |
| S3.1-38 | `moim_reports` 열·대상 7종·status 4종 | PASS | M2:322-338 | — | |
| S3.1-39 | `moim_sanctions` 열·level 5종 | PASS | M2:339-355 | — | |
| S3.1-40 | `moim_events` 열·actor_kind 3종 | PASS | M2:357-367 | — | |
| S3.1-41 | `moim_events` = 모든 상태 변경을 기록하는 단일 운영 기록 | FAIL | B2:872-887 `moim_comment_remove`(운영진 숨김 포함)·M4:459-472 `moim_album_pin`·M4:217-227 `moim_schedule_set_closed` 에 `moim__log` 없음 | — | **NEW**. 운영진이 댓글을 숨기거나 앨범을 고정하거나 일정 모집을 마감해도 `moim_events` 에 남지 않아, 어드민이 누가 언제 바꿨는지 볼 수 없다 |

## §3.2 권한·무결성

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S3.2-01 | 모든 쓰기 = 서버 서비스 롤 + SECURITY DEFINER RPC | PASS | M2:369-386 권한 회수; M2:1335-1349 실행권 service_role; 서버 코드의 모임 표 직접 insert/update/delete 0건(grep `lib/moim`·`app/api/moim`·어드민·크론) | — | |
| S3.2-02 | 클라이언트 쓰기 권한 없음 | PASS | M2:380-381 revoke anon·authenticated; M4:29-30 | — | |
| S3.2-03 | RLS 는 읽기 정책만 | N/A | M2:379 RLS on·정책 0 | — | 설계 §10 M2 행·`docs/moim-ssot.md` 「클라이언트 직접 접근 없음」으로 더 좁게 확정 |
| S3.2-04 | 권한 판정 함수는 `moim_actor_can` 하나 | FAIL | M4:37-46 `moim__schedule_can_manage`(co_host 고정)·M4:329-341 출석 자체 검사·M3:10-18 미사용 `moim_post_visible_to` | — | **P3-20** (차단 모임에서도 출석 API 쓰기 가능) · P3-26 |
| S3.2-05 | TS 계약은 `lib/moim/moim-permission-contract.ts` 하나 | PASS | 같은 파일:49-67 = B2:10-31 | Q:377-386 `moimCanMap` | |
| S3.2-06 | 모든 API 가 이 둘만 쓴다 | FAIL | 같은 근거(일정 관리·출석은 별도 판정) | — | **P3-20** |
| S3.2-07 | 정원은 RPC 안 `FOR UPDATE` 잠금 | PASS | M2:810 모임 행 잠금; M4:89-91 일정 행 잠금 | — | |
| S3.2-08 | 차단된 사용자의 재가입 거부 | PASS | M2:813-815; 호출처 B2:445·M2:898·M2:1315 | — | |
| S3.2-09 | `blocked` 모임 가입 거부 | PASS | M2:812 | — | |
| S3.2-10 | `blocked` 모임 글 거부 | PASS | M2:687-689 (actor_can false); M3:146 댓글; M4:422 앨범 | — | |
| S3.2-11 | `blocked` 모임 일정 거부 | PASS | M4:115 생성; M4:93 참여 | — | 출석만 예외 = P3-20 |
| S3.2-12 | `moims.host_user_id` 와 `role='host'` 항상 1:1 | FAIL | B2:767 1단계는 활성·삭제(미종료) 모임만 위임; B2:802-808 2단계가 **종료된 모임**의 모임장 행도 `role='member', status='left'` 로 바꾸고 `moims.host_user_id` 는 그대로 | — | **NEW**. 모임장이 모임을 종료한 뒤 회원 탈퇴하면(30일 열람 기간) 그 모임은 `host_user_id`=탈퇴자, 모임장 행 없음 — 화면에 모임장이 「나간 멤버」로 나온다 |
| S3.2-13 | 위임 RPC 만 둘을 함께 바꾼다 | PASS | M5:22-39 `moim__host_swap` 만 둘을 바꿈(호출: 위임 수락·어드민 지정 B2:585·변경 요청·계정 정리 B2:778) | — | 계정 정리 위임은 2번 묶음 B8 승인 |

## §3.3 메신저 방 연결

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S3.3-01 | `owner_domain text null`('moim') 추가 | PASS | M2:21-33 | — | |
| S3.3-02 | `owner_ref_id uuid null` = 모임 id 또는 일정 id | PASS | M2:23; M4:134 일정 id | — | 변경 불가 M2:455-457 |
| S3.3-03 | 모임 방 `private_group`·`group`·`is_discoverable=false` | PASS | M2:532-537 | — | |
| S3.3-04 | `invite_link_enabled=false`·`allow_member_invite=false` | PASS | M2:534-535 | — | |
| S3.3-05 | `identity_policy='alias_allowed'` | PASS | M2:537 | — | |
| S3.3-06 | 메신저 초대 링크 거부 | PASS | M2:426-448 (invite_links INSERT); NOTICE:28-46 초대 설정 변경 거부 | PRES:275 | |
| S3.3-07 | 메신저 가입 요청 거부 | PASS | M2:441-447 (group_join_requests) | — | |
| S3.3-08 | 방 단위 내보내기·차단 거부 | PASS | M2:403-424 (role·left_at 변경), M2:441-447 (group_bans) | PRES:291-293 | 트리거는 INSERT/UPDATE 만 — S3.3-18 |
| S3.3-09 | 방 나가기 거부 | PASS | M2:403-424; leave route:55-58 409 | SHEETS:736,1228 | |
| S3.3-10 | 방 삭제 거부 | PASS | NOTICE:29 `deleted_at` 변경 거부 | 방 삭제 메뉴 없음 | |
| S3.3-11 | 앱 화면에서도 해당 메뉴 숨김 | PASS | — | PRES:275-293; SHEETS:508,736,1163,1228,1250-1257; ActionSheet:179-180 | P3-29 |
| S3.3-12 | 참여자 동기화는 모임 서버 RPC 안에서만 | PASS | M2:390-395 `dibay.moim_writer`; M2:410-412 | — | |
| S3.3-13 | `member_activate`·`member_deactivate`·`schedule_confirm` 이 같은 트랜잭션에서 | PASS | M2:603-623; B2:36-66; M4:67-82 | — | 함수 이름은 `moim__*` |
| S3.3-14 | 참여자 행을 넣거나 `left_at` 을 채운다 | PASS | M2:543-571 | — | |
| S3.3-15 | 메신저 hard-lock 문서 갱신 | PASS | `docs/dibay-messenger-domain-group-hard-lock.md:182-195` | — | |
| S3.3-16 | 그룹 RPC 6개를 바꾼다 | N/A | DB 트리거로 모든 경로 차단(M2:11-12) | — | hard-lock §MOIM-owned(D1 승인)가 트리거 방식을 기록 |
| S3.3-17 | M2 착수 전 Owner 승인(D1) | PASS | hard-lock:182 「Owner D1 승인 2026-11-12」; `docs/moim-ssot.md:3` | — | 문서 기록 기준 |
| S3.3-18 | (S3.3-08 보조) 메신저 쪽 모든 퇴장 경로가 트리거에 걸리는가 | NOT_PROVEN | 트리거에 DELETE 없음(M2:419-421); DELETE 경로 `service.ts:12741-12745`(`leaveCommunityMessengerRoom`), `group-room-repository.ts:268-275`(표 없을 때만), `leave-chat-room-orchestration.server.ts:110,118,158,235` | — | **NEW 위험**. 지금 private_group 나가기는 RPC(`group-room-service.ts:405`)라 막힌다. 누가 DELETE 경로를 모임 방에 쓰면 트리거 없이 빠져나간다. 경로 전수·운영 RPC 정의 확인 필요 |

## §4 신원

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| S4-01 | A 완전 익명 | N/A | — | — | 기각안 |
| S4-02 | B 실명 강제 | N/A | — | — | 기각안 |
| S4-03 | C 개설·가입에 전화 인증 필수 | PASS | `lib/moim/server/moim-route-guard.server.ts:47-50`; `app/api/moim/route.ts:45`·`[moimId]/join/route.ts:14`·`invites/[inviteId]/route.ts:15` `phone: true`; DB B2:145·M2:817-818 | `lib/moim/moim-client-api.ts:52` 인증 시트 | |
| S4-04 | 표시 이름은 모임마다, 기본값 = DIBAY 닉네임 | PASS | B2:185-186, B2:452-453 | `MoimJoinSheet.tsx:44`, `MoimCreateWizard.tsx:77` | |
| S4-05 | 다른 멤버에게는 별명만, 플랫폼은 계정 단위 추적 | PASS | Q:264-280 `authorMap` = 모임 닉네임; user_id 는 DB 에 유지 | — | |
| S4-06 | 미인증 회원은 가입 전 인증 | PASS | S4-03 | S4-03 | |
| S4-07 | 보이는 것: 모임별 닉네임·사진·소개·역할 배지·가입일 | PASS | Q:498-507 | `MoimMemberView.tsx:402-406` | |
| S4-08 | 재가입 횟수는 운영진만 | PASS | Q:483,507 (write_note), Q:530-551 (decide_join) | `manage/MoimManageMembers.tsx:207`, `manage/MoimManageRequests.tsx:66` | |
| S4-09 | 모임 화면에 전화번호·DIBAY ID·실명·주소 안 보임 | PASS | 모임 DTO 에 profiles 열 없음(Q 전체, `profiles` 조회 0) · 동네는 도시 이름만 | 멤버 화면에 회원 프로필 링크 없음 | |
| S4-10 | (S4-09 보조) 메신저 모임 방 안에서도 안 보임 | NOT_PROVEN | `service.ts:2190-2195` 별명 적용 시 `...baseProfile` 를 남겨 DIBAY `bio` 등이 함께 실림 | 방 멤버 목록(4번 묶음 D6 「멤버 목록 보기」 유지)에서 사람을 누를 때 열리는 화면 미확인 | **NEW 위험**. 모임 방 멤버를 누르면 DIBAY 프로필(닉네임·ID)이 열리면 C 안 「보이지 않는 것」이 깨진다. 기기 확인 필요 |
| S4-11 | 운영진만: 가입 질문 답변 | PASS | Q:530-531 | `manage/MoimManageRequests.tsx` | |
| S4-12 | 운영진만: 운영진 메모 | PASS | M3:215 write_note; Q:493-495 | `manage/MoimManageMembers.tsx` | |
| S4-13 | 어드민: 실제 계정(회원 상세 링크) | PASS | — | `components/admin/moim/admin-moim-shared.tsx:101` | |
| S4-14 | 어드민: 프로필 변경 이력 | PASS | M2:1205-1206 이력 저장; AQ:508-512 | `admin-moim-detail-panels.tsx:514`, `AdminMoimDetailPage.tsx:411-464` | |
| S4-15 | 변경 이력은 다른 멤버에게 안 보임 | PASS | 사용자 API 의 `moim_member_profile_history` 조회 0 (grep) | — | |
| S4-16 | 이력 보관은 어드민용만 | PASS | 같은 근거 | — | 탈퇴 뒤 이력 잔존 FK = W1 |
| S4-17 | 가입 질문의 실명·전화번호·신분증 요구 금지 | PASS | B2:72-111 금지어(승인 목록) + 정책 금지어; 호출 B2:176,267,351 | — | 단어 목록 방식. 「성함」 등 목록 밖 표현은 통과 |
| S4-18 | 질문 저장 때 금지어 검사 | PASS | 같은 근거 | — | |
| S4-19 | 저장 화면 안내 문구 | PASS | — | `MoimCreateWizard.tsx:326`, `manage/MoimManageInfo.tsx:236` | |
| S4-20 | 연령 제한에 생년월일 필요 | PASS | M2:819-826 `moim_birth_date_required` | — | |
| S4-21 | 성별 저장 안 함 (D5) | PASS | 성별 열 없음 | — | |
| S4-22 | D5 1차는 연령 제한만 | PASS | M2:83-84 | `MoimCreateWizard.tsx:341` | |

## 카테고리 드롭다운 · 「기타」 직접 주제 (`moim-category-dropdown-custom-topic-2026-11-12.md`)

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| C1-01 | §1 「지금 상태」 표 (칩 13개·칩 줄·select·필터) | N/A | — | — | 11-12 당시 사실 |
| C2-01 | 선택 칸 = `WriteSelectSheetField` 그대로 | PASS | — | `components/moim/MoimCategoryField.tsx:4,56-65` | |
| C2-02 | 한 줄 칸 「고른 값 ▼」 + 바텀시트 | PASS | — | `components/write/shared/WriteSelectSheetField.tsx:77-92` | |
| C2-03 | 고른 항목 ✓, 누르면 바로 닫힘 | PASS | — | 같은 파일:62-65,116 | |
| C2-04 | 브라우저 기본 `<select>` 안 씀 | PASS | — | 같은 파일:18-19 | |
| C2-05 | 만들기: 카테고리 단계 없애고 이름·소개 단계 맨 위에 카테고리 한 줄 | PASS | — | `MoimCreateWizard.tsx:190-215` | |
| C2-06 | 5단계 → 4단계 | PASS | — | `MoimCreateWizard.tsx:21` `STEPS = 4` | |
| C2-07 | 카테고리 안 고르면 「다음」 비활성 | PASS | — | `MoimCreateWizard.tsx:104-107`, `MoimCategoryField.tsx:17-24` | |
| C2-08 | 운영 › 정보 수정도 같은 드롭다운 | PASS | — | `manage/MoimManageInfo.tsx:182-187` | |
| C2-09 | 어드민은 한 줄 `<select>` 유지 | PASS | — | `AdminMoimDetailPage.tsx:275` | |
| C2-10 | 홈 필터 칩은 바꾸지 않음 | PASS | — | `MoimTabHome.tsx:80-107` | |
| C3-01 | 「기타」 고르면 아래에 「모임 주제」 입력칸 | PASS | — | `MoimCategoryField.tsx:66-87` | |
| C3-02 | 주제 2~20자 필수 | PASS | TOPIC:10-11,25-26 | `MoimCategoryField.tsx:8-24` | |
| C3-03 | 다른 카테고리면 입력칸 사라지고 저장 때 주제 비움 | PASS | TOPIC:23-24 → B2:262 `topic_label = null` | `MoimCategoryField.tsx:66`; `MoimCreateWizard.tsx:132` | |
| C3-04 | 카드·공개 페이지에서 주제가 카테고리처럼 | PASS | Q:151,444 `topicLabel` | `moim-ui.tsx:58-64`; `MoimCard.tsx:12-13`; `MoimPublicView.tsx:22` | 화면 확인 NOT_PROVEN |
| C3-05 | 카드·공개 페이지에 「기타」 글자 안 나옴 | PASS | — | 같은 근거(주제 우선) | 드롭다운·홈 필터 칩의 「기타」는 문서가 유지로 정함 |
| C3-06 | 모임 탭 검색이 이름 또는 주제에 맞음 | PASS | Q:245-246 | — | 소개도 함께 검색 |
| C3-07 | 서버: 정책 금칙어 검사 | PASS | TOPIC:27-29 | — | |
| C3-08 | 서버: 기존 카테고리 이름(ko·en, 대소문자·공백 무시)과 같으면 거부 | PASS | TOPIC:30-35 | — | 사용 중지 카테고리는 비교 제외 |
| C3-09 | 안내 「운동 카테고리를 골라 주세요」 | PASS | `lib/moim/moim-error-codes.ts:98` | `lib/i18n/catalog/moim-core.ts:71,275` | 카테고리 이름은 넣지 않는 일반 문구(문서는 「예」) |
| C3-10 | 앞뒤 공백 제거·연속 공백 하나 | PASS | TOPIC:20 | `MoimCategoryField.tsx:11-14` | |
| C3-11 | slug `etc` 고정 안 함 — `allow_custom_topic` 표시 | PASS | TOPIC:7,23 | `MoimCategoryField.tsx:66` | |
| C3-12 | 지금은 「기타」 하나만 켠다 | PASS | TOPIC:12 | — | 운영 값은 NOT_PROVEN |
| C3-13 | 어드민 카테고리 관리 체크 칸 | PASS | TOPIC:285,301 | `AdminMoimCategoriesPage.tsx:177-180` | |
| C3-14 | 어드민 목록·상세 주제 보기, 목록 검색에 주제 | PASS | AQ:127,162,225,314 | `AdminMoimListPage.tsx:152`, `AdminMoimDetailPage.tsx:238` | |
| C3-15 | 수정 = 기존 기본정보 수정(사유 필수·모임장 알림)에 칸 하나 | PASS | B2:307-392 + M5:67-75 사유; `app/api/admin/moim/moims/[moimId]/route.ts:103` 알림 | `AdminMoimDetailPage.tsx:218-219,283-286` | |
| C3-16 | 「직접 입력 주제 많이 쓰인 순」 주제·모임 수 상위 20 | PASS | AQ:877-888 (limit 20); `app/api/admin/moim/categories/route.ts:17` | `AdminMoimCategoriesPage.tsx:102-112` | |
| C3-17 | 새 카테고리는 기존 추가 기능으로 | PASS | TOPIC:277-313 | `AdminMoimCategoriesPage.tsx` | |
| C3-18 | 기존 모임 자동 이동 없음 | PASS | 해당 코드 없음 | — | |
| C3-19 | 기각안 3개(해시태그·자유 입력만·자동 추천) | N/A | — | — | 기각안 |
| C4-01 | `moim_categories.allow_custom_topic boolean not null default false`, etc 만 true | PASS | TOPIC:7,12 | — | |
| C4-02 | `moims.topic_label text null` + 길이 2~20 검사 | PASS | TOPIC:8-10 | — | |
| C4-03 | 주제 검색 인덱스 넣지 않음 | PASS | 인덱스 없음 | — | |
| C4-04 | `moim_create`·`moim_update_info`·`moim_admin_update_info` 주제 검사 | PASS | 최신 정의 B2:162,262,353 | — | |
| C4-05 | `moim_admin_category_save` 가 `allow_custom_topic` 저장 | PASS | TOPIC:277-313 (최신) | — | |
| C4-06 | 새 오류 코드 3개 등록 | PASS | `lib/moim/moim-error-codes.ts:97-99` | `moim-core.ts:69-71,273-275` | |
| C4-07 | 카테고리 목록 `allowCustomTopic`, 카드·상세 `topicLabel` | PASS | Q:93-103,151,444 | — | |
| C4-08 | 어드민 목록·상세·검색·CSV 에 주제 + 주제 순위 조회 | PASS | `app/api/admin/moim/moims/route.ts:77,85`; AQ:877-888 | — | |
| C4-09 | 화면: 만들기 4단계·운영 정보 수정·카드·공개 페이지·어드민 | PASS | — | C2-05~C3-16 근거 | |
| C4-10 | 문구 ko·en 키 (라벨·안내·오류 3·어드민 3) | PASS | — | `lib/i18n/catalog/moim-screens.ts:103-108,434-439`; `moim-core.ts`; 어드민 `admin_moim_category_custom_topic*`·`admin_moim_topic_rank_*` | `check:i18n-quality` 실행은 하지 않음(읽기 전용) |
| C4-11 | 카테고리 라벨 사용처 전수 (알림 문구 포함) | PASS | 사용처 = `moim-ui.tsx:52-64`, `MoimTabHome.tsx:107`, `MoimCategoryField.tsx:59`; 알림 문구에 카테고리 없음 | — | |
| C4-12 | 모임 0개라 이전 데이터 채우기 없음 | N/A | — | — | 당시 사실 |
| C4-13 | 로컬 임시 DB 시나리오(필수·길이·금칙어·중복·비움·사유) | NOT_PROVEN | 저장소에 주제 시나리오 파일 없음 | — | 절차 증거 |
| C4-14 | typecheck·vitest·i18n·test:ci | NOT_PROVEN | — | — | 이 감사에서 실행 안 함 |
| C4-15 | 운영 DB 적용은 Owner 승인 후 | NOT_PROVEN | — | — | 운영 `schema_migrations` 필요 |
| C4-16 | 네이티브 변경 없음 | PASS | 커밋 `77cadaed9` 에 android·ios·capacitor 파일 0 | — | |

## open-items 감사 결정 (`moim-open-items-audit-2026-11-12.md`)

| ID | 요구 | 판정 | DB/서버 증거 | 화면 증거 | 비고 |
|---|---|---|---|---|---|
| O0-01 | `moim_report_result` = 커뮤니티 신고 결과 알림과 똑같이 | PASS | `lib/notifications/notification-item-registry.ts:341-346` 같은 항목 | — | |
| O0-02 | 알림함에는 항상 남는다 | PASS | `app/api/admin/moim/reports/[reportId]/decision/route.ts:130-139` → `moim-notify.server.ts:85-111` (모임별 설정 거르기 없음) | — | 발송 실패는 bestEffort |
| O0-03 | 푸시는 커뮤니티 알림 설정을 따른다 | PASS | `moim-notify.server.ts:89` `push_kind: "community"`, 벨 전용 목록 밖 | — | 기기 푸시 NOT_PROVEN |
| O0-04 | 「푸시 없음·끌 수 없음」 문구 대체 | N/A | — | — | 문서 변경 |
| O0-05 | 누르면 모임 페이지(상세 화면 없음) | PASS | decision route:135 `moimPaths.home` | — | |
| O0-06 | 코드 변경 없음 | N/A | — | — | 당시 기록 |
| O1-01 | §1 감사 결과(운영자 2명 403) | N/A | — | — | 당시 사실 |
| O1-02 | 활성·role admin·배열·`moim` 없는 행에 `["moim"]` 덧붙임 | PASS | PERM:7-15 | — | |
| O1-03 | 다른 권한 그대로 | PASS | PERM:8 `||` | — | |
| O1-04 | 최고관리자·해지 계정 제외 | PASS | PERM:12-13 | — | |
| O1-05 | 다시 실행해도 안전 | PASS | PERM:15 | — | |
| O1-06 | 적용 전후 대조(대상 2행 → 없는 운영자 0) | NOT_PROVEN | — | — | 운영 조회 필요 |
| O1-07 | 되돌리기 `permissions - 'moim'` | PASS | PERM:6 기록 | — | |
| O1-08 | Owner 승인 후 적용 | NOT_PROVEN | 커밋 `8739b6bb8` 제목 「Owner 「둘 다 적용」」 | — | 운영 적용 기록 필요 |
| O1-09 | 운영자 계정으로 모임 메뉴 보임 | NOT_PROVEN | `lib/admin/access/admin-route-access.ts:284-286`; `lib/admin-users/admin-permissions.ts:35-36,59-60,84-85` | — | 운영자 로그인 확인 필요 |
| O2-01 | `moims.category_id` NOT NULL | PASS | M2:78 | — | |
| O2-02 | 카테고리 0 → 고객이 못 만듦(FAIL) 해소 | NOT_PROVEN | — | `MoimTabHome.tsx:66,145` 0개일 때 안내 | 운영 13행 필요 |
| O2-03 | 등록 = `moim_admin_category_save`, 사유 필수, 기록 | PASS | TOPIC:280 사유; M5:78-89 `audit_logs`(모임 id 없으면 `moim_events` 없음 = §5 설계대로) | — | |
| O2-04 | 실행: 어드민 화면 또는 같은 함수 SQL 호출 | PASS | — | `AdminMoimCategoriesPage.tsx` | |
| O2-05 | SQL 직접 INSERT 쓰지 않음 | NOT_PROVEN | — | — | 운영 `audit_logs` `moim.admin_category_created` 13건 대조 필요 |
| O2-06 | 목록 초안 13개(순서·slug·ko·en) | NOT_PROVEN | 저장소에 시드 없음(설계대로) | — | 운영 `moim_categories` 필요 |
| O2-07 | 개설 금지 표시 모두 안 함 | NOT_PROVEN | — | — | 운영 값 필요 |
| O2-08 | 등록 후 13행 조회 확인 | NOT_PROVEN | — | — | 운영 조회 |
| O2-09 | 칩·만들기 화면 Owner 휴대폰 확인 | NOT_PROVEN | — | — | 기기 |
| O2-10 | `/api/moim/categories` 는 사용·개설 허용 카테고리를 순서대로 | PASS | Q:90-98 | — | |
| O3-01 | 백업 10행을 `docs/audit/moim-m1b-backup-definitions-2026-11-12.sql` 로 내보냄 | PASS | 파일 있음(1,070줄) | — | 10/10 md5 는 NOT_PROVEN |
| O3-02 | `drop table public._moim_m1b_backup_20261112` 마이그레이션 | PASS | BKDROP:5 | — | |
| O3-03 | 적용 전(10행·의존 0) → 적용 → 없음 확인 | NOT_PROVEN | — | — | 운영 조회 |
| O3-04 | Owner 승인 후 적용 | NOT_PROVEN | 커밋 `8739b6bb8` | — | 운영 기록 |
| O3-05 | 내보낸 파일은 삭제 마이그레이션과 같은 PR | PASS | 두 파일 모두 커밋 `8739b6bb8` | — | |
| O4-01 | Android `DibayAppRouteGuard` 허용 목록에 `moim` | PASS | `android/app/src/main/java/com/dibay/app/DibayAppRouteGuard.java:27` | — | |
| O4-02 | 추가 코드 변경 없음 | PASS | 같은 근거 | — | |
| O4-03 | 다음 Android 빌드 `versionCode` 41 이상 | PASS | `android/app/build.gradle:18` `versionCode 89` | — | 설치 버전은 `user_devices` 필요 |
| O4-04 | 실기기: 앱 꺼짐·뒤에 있을 때 모임 알림 → `/moim/…` | NOT_PROVEN | — | — | 기기 |
| O4-05 | iOS 는 허용 목록 없이 이동 | NOT_PROVEN | — | — | 기기 |
| O4-06 | 앱 안 이동은 웹 라우터라 영향 없음 | N/A | — | — | 당시 판단 |
| O5-01 | §5 운영자 권한 적용·전후 대조 | NOT_PROVEN | — | — | 운영 |
| O5-02 | §5 백업 삭제·`to_regclass` NULL | NOT_PROVEN | — | — | 운영 |
| O5-03 | §5 `schema_migrations` 2건 | NOT_PROVEN | — | — | 운영 |
| O5-04 | §5 카테고리 13행·`audit_logs` 13건 | NOT_PROVEN | — | — | 운영 |
| O5-05 | §5 카테고리는 `moim_events` 에 남지 않음 | PASS | M5:82-85 (모임 id 없으면 건너뜀) | — | |
| O5-06 | §5 칩·만들기 1단계 화면 | NOT_PROVEN | — | — | 기기 |
| O5-07 | §5 운영자 화면 모임 메뉴 | NOT_PROVEN | — | — | 운영자 로그인 |

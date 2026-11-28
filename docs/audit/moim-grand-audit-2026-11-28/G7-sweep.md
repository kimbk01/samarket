# G7 — 수정 완결성 전수 점검 (Fix-completeness sweep)

- 기준: `/Users/bkkim/projects/samarket-wt-moim-address` HEAD `04ee097fb` (clean). **저장소 읽기 전용** — 코드·DB·사이트·앱 실행 0회.
- 판정은 모두 **코드 기준**이다(운영 DB 정의·화면·실기기 = NOT_PROVEN). 운영 DB 가 저장소 최신 정의와 같다는 전제는 prior-reaudit §4(101/102 바이트 동일)에 기댄다.
- 표기: `bundle2` = `supabase/migrations/20271128110000_moim_bundle2_permissions.sql`, `m2` = `20271112210000_moim_m2_schema_rpc.sql`, `m3` = `20271112230000_moim_m3_board_rpc.sql`, `m4` = `20271113100000_moim_m4_schedule_album_prefs.sql`, `m5` = `20271113200000_moim_m5_admin_rpc.sql`.
- prior ID = `matrix/prior-reaudit.md` 의 ID. 없으면 **NEW**.

---

## PART A — 설계 약속 대비 구현

### A-1. 전체 감사 `moim-full-audit-2026-11-27.md` (A·B·C·D·E·F)

| 항목 | 약속 | 구현 위치 | 판정 | 비고 / prior |
|---|---|---|---|---|
| A1 | 모임 동네 = 주소 단일 정의, 만들기·목록 | `lib/moim/server/moim-queries.server.ts:120-127` (`resolveMasterAddressLgu`), `app/api/moim/route.ts:23,50-53`, `20271128100000_moim_create_master_lgu.sql` | CHANGED | §4-1 「운영 DB 에서 LGU 빈 주소 25건을 채운다」 → 실행 시 판정으로 대체(커밋 ada927c3a 「읽기 전용, 주소 행 쓰기 없음」). Owner 승인 문구 인용 없음 — 데이터 보정은 하지 않음 |
| A2 | 만들기 단계에 도시 이름 + 주소 확인 CTA | `components/moim/MoimCreateWizard.tsx:172-184,262-268` | DONE | |
| B1 | 탈퇴·내보내기 후 일정 정원 재계산 | `bundle2:51-63` | DONE | 시작한 일정은 대상 아님(P3-18) |
| B2 | 바로 가입 → 모임장 `moim_member_joined` | `app/api/moim/[moimId]/join/route.ts:37-39`, `moim-notify.server.ts:192-208`, `notification-item-registry.ts:287` | DONE | 「묶음」은 3번 B2 이유로 CHANGED |
| B3 | 초대 수락으로 생긴 신청 → 승인권자 알림 | `app/api/moim/invites/[inviteId]/route.ts:38-44`, `moim-notify.server.ts:180-189` | DONE | |
| B4 | 나를 차단한 사람 초대 거부 | `app/api/moim/[moimId]/invites/route.ts:22` | DONE (CHANGED 경미) | `getBlockedRelation().blockedByPeer` 대신 `isBlockedByOther` |
| B5 | 제재 조회 실패 = 거부(모임만) | `moim-route-guard.server.ts:42-45`, `community-write-restriction.ts:105-110` | PARTIAL | 2번 설계 §2 문구 키 `community_restriction_unavailable` 카탈로그 0건. `moimErrorKey`(`moim-client-api.ts:71-75`)가 `moim_*` 만 연결 → 일반 오류 문구 (P3-11) |
| B6 | 내보내기·차단 부모임장 고정, 운영진 메모 기본 | `bundle2:25-27`, `lib/moim/moim-permission-contract.ts:58-62` | DONE | |
| B7 | 질문 금지어 + `moim_policies.banned_words` 기본 목록(이름·소개도 같은 목록) | `bundle2:72-109,176,267,351` | PARTIAL | 목록을 정책 데이터가 아니라 SQL 상수 `moim__question_banned_words` 로 고정(`bundle2:70` 「운영 정책값 바꾸지 않음」). 설계 「어드민에서 수정 가능」·「이름·소개도 같은 목록으로 거부」 미충족. 승인 근거 인용 없음 (P3-6) |
| B8 | 정리 함수 + 두 모드 호출 + FK + 「나간 멤버」 | `bundle2:746-824,834-869`, `app/api/admin/users/[id]/delete/route.ts:127,137`, `moim-queries.server.ts:258` | PARTIAL | ① FK `moim_member_profile_history`(CASCADE)·`moim_invites.created_by`(SET NULL) 없음 (W1/P3-1) ② 다른 모임의 위임 요청(받는/보낸) 미정리 (P3-2) ③ 「보낸 초대 → declined」는 `cancelled` 로 구현(경미 CHANGED) ④ 다른 모임에서 맡은 일정 호스트 미정리 (P2-3 동류) |
| B9 | 역할 변경 일정 방 동기 — 사용자 RPC **와 어드민 RPC** | 사용자 `bundle2:421-427` / 어드민 `m5:278` | PARTIAL | 어드민 `moim_admin_member_role` 미수정 (W2/P2-4) |
| B10 | 답변 = {question, answer} 저장 + 예전 형식 호환 | `bundle2:471-477`, `moim-queries.server.ts:516-549` | DONE | |
| B11 | 만들기 길이 즉시 검사 | `MoimCreateWizard.tsx:210,221` | DONE | |
| B12 | 위임 부모임장 상한 공통 검사 4곳 | `bundle2:494-516,531,559,583,618` | DONE | |
| B13 | 종료 시 대기 멤버 정리 + 일정 취소 알림 | `bundle2:647`, `app/api/moim/[moimId]/close/route.ts:20-60` | DONE | |
| C1 | 오픈채팅 비밀번호 | (5번 묶음 아래) | DONE | |
| D1 | 모임 방 공지 = 모임 공지 하나 | `use-messenger-room-phase2-room-presentation.ts:283-285`, `service.ts:12189-12206`, `20271128130000_moim_room_notice_guard.sql`, `components/moim/MoimRoomNoticeMenuItem.tsx`, `app/api/moim/[moimId]/posts/route.ts:27-28` | DONE | |
| D2 | 일정 방 배지·「일정 보기」 | `app/api/moim/rooms/route.ts:56`, `MessengerChatListItem.tsx:1155`, `CommunityMessengerRoomPhase2Header.tsx:524` | DONE | |
| D3 | 「1 members」 | `moim-ui.tsx:204`, `moim-screens.ts:337` | DONE (6번 범위) | 같은 규칙의 다른 키는 Part B (P2-16) |
| D4 | 공지 쓰기 = `pin_notice` | `bundle2:684-688,726-729`, `MoimMemberView.tsx:44` | DONE | |
| D5 | 모임장 메뉴 나가기 → 위임·종료 | `MoimDetailScreen.tsx:192-201` | DONE | |
| D6 | 모임 방 정보 메신저 운영 칸 숨김 | `CommunityMessengerRoomPhase2RoomSheets.tsx:1163,1228,1250` | DONE | |
| D7 | 나가기 409 + 안내 + **[모임 홈] 이동** | `app/api/community-messenger/rooms/[roomId]/leave/route.ts:58-59`, `messenger-home-action-error-message.ts:12-13` | PARTIAL | **NEW** — 4번 설계 §1 D7-2 「[모임 홈] 이동을 제공한다」 미구현(`CommunityMessengerHome.tsx` 에 이동 코드 0건, 문구만) |
| E1 | 언어 일괄·동시 8·응답 뒤 발송(공지·글·일정·종료·**위임·초대**) | `moim-notify.server.ts:124-133,165-172`; after: posts:59, schedules:40, close:38, host-transfers:29 | PARTIAL | **NEW** — 초대 `app/api/moim/[moimId]/invites/route.ts:26`, 위임 요청 `app/api/moim/[moimId]/host-transfer/route.ts:22` 는 요청 안 `await`. 언어 조회 수치 보고 오류 W5 |
| E2 | 상세 공유 저장소 60초·single-flight | `lib/moim/moim-detail-cache.ts` (설계 이름 `moim-detail-store.ts`), `moim-client-api.ts:110` | DONE (CHANGED 경미) | 로그아웃 비움 대신 계정별 키 |
| E3 | 상세 중복 조회 제거 | `moim-queries.server.ts:394-461` | DONE | |
| E4 | 받은 초대 N+1 제거 | `moim-queries.server.ts:685-709` | DONE | |
| E5 | 유니크 인덱스 + advisory lock | `bundle2:114-115,142,193-195,277,364` | DONE | |
| E6 | 예산 등록 | `lib/perf/request-budget.ts:54,56,61` | DONE | 글 목록·일정·앨범 등 나머지 라우트 미등록 (P3-39) |
| E7 | 대표 사진 정리 | — | CHANGED | 6번 설계 「정정: 결함 아님」 |
| E8 | 방 조회 요청 중 집합 | `lib/moim/use-moim-room-owner.ts:20-49` | DONE | |
| E9 | `moim_invites_moim_idx` + 크론 예산 4.0 | `20271128120000_moim_invites_moim_idx.sql`, `request-budget.ts:92` | DONE | |
| F1 | 숨기기 위험 버튼 | `manage/MoimManageReports.tsx:125` | DONE | |
| F2 | 앨범 버튼 역할 | `MoimAlbum.tsx:267` | DONE | |
| F3 | Sam.btn 직접 사용 제거 | `components/moim` 에 `Sam.btn.` 0건(moim-ui 제외) | DONE | |
| F4 | 멤버 홈 핵심 CTA 기본 | `MoimMemberView.tsx:248,328` | DONE | |
| F5 | 탭 순서 | `MoimMemberView.tsx:37,83-84` | DONE | |
| F6 | 일정 취소 위험 | `MoimScheduleDetailScreen.tsx:331,413` | DONE | |
| F7 | 막힌 버튼 → 안내 줄 | `MoimPublicView.tsx:129`, `MoimScheduleDetailScreen.tsx:353-366` | DONE | |
| F8 | 아이콘·배지 | `MoimManageHub.tsx:89,91`, `MoimTabHome.tsx:120`, `MoimManageMembers.tsx:230` | DONE | |
| F9 | 운영 6화면 하단 줄 | `MoimStickyFooter` import: Close·Info·Permissions·Invite·HostRequest·Transfer | DONE | |
| F10 | 댓글 ⋮ 44px | `MoimPostDetailScreen.tsx:210` | DONE | 사진 ✕ 등 나머지 (P2-18) |
| F11 | 검색·일정 ⤴⋮·대화하기 | `MoimDetailScreen.tsx:123-126`, `app/api/moim/[moimId]/search/route.ts`, `MoimScheduleDetailScreen.tsx:395-440`, `MoimManageMembers.tsx:79` | CHANGED (⤴만 · 검색·⋮·대화하기 DONE) | ⤴ = 초대 링크 (Owner 「권장으로 진행」 2026-11-28, 커밋 04ee097fb) |
| F12 | 배지 반경 | `MessengerChatListItem.tsx:1152,1159,1171,1177` | DONE(설계대로) | 설계 자체가 LOCKED 「배지 pill」과 충돌 (W3) |

### A-2. 2번 묶음 설계 — 위 B·D4·E5 외 추가 약속

| 약속 | 위치 | 판정 | 비고 |
|---|---|---|---|
| `MOIM_ROUTE_ERROR_CODES` 분리 | `lib/moim/moim-error-codes.ts:111-113` | DONE | |
| 문구 `moim_err_moim_invite_not_allowed`·`_transfer_co_host_full` | `lib/i18n/catalog/moim-core.ts:117-118,321-322` | DONE | |
| 문구 `community_restriction_unavailable` | 카탈로그 0건 | MISSING | 위 B5 |
| 활성 모임 모임장 필수 제약(재감사) | `bundle2:891-892` | DONE | |
| 댓글 삭제 null 안전 비교(재감사 M1) | `bundle2:872-887` | DONE | 같은 null 문제: `moim_post_remove`(`m3:95` `author_id = p_actor`)는 null 이면 hide 경로로 가 안전. `moim_album_remove`(`m4:447`) 동일 안전 |

### A-3. 3번 묶음 설계

| 약속 | 위치 | 판정 | 비고 |
|---|---|---|---|
| N1 푸시 X 4종 벨만 | `moim-notify.server.ts:53-58,96`, `append-user-notification.ts:147-150,203` | DONE (CHANGED) | 칸 이름 `push_suppressed_reason` 대신 `bell_only` → `item_policy` |
| `item_policy` 이유 추가 | `lib/notifications/core/notification-event-schema.ts` | DONE | |
| 문구 `notify_moim_member_joined_*` | `moim-core.ts:171-172,375-376` | DONE | |
| E6 categories 2.0 | `request-budget.ts:56` | DONE | |
| 나머지 B2·B3·E1~E9 | A-1 참조 | — | E1 PARTIAL |

### A-4. 4번 묶음 설계

| 약속 | 위치 | 판정 | 비고 |
|---|---|---|---|
| 트리거 막는 칸 4개 | `20271128130000:40-43` | DONE | |
| 서버 공지 저장 거부 | `service.ts:12206`, `group/group-room-service.ts:524` | DONE | |
| 글 목록 `pinned=1` | `posts/route.ts:27-28` | DONE | |
| 문구 4개 | 카탈로그 각 2건 | DONE | |
| hard-lock 문서 갱신 | `docs/dibay-messenger-domain-group-hard-lock.md:190,195` | DONE | |
| D7 [모임 홈] 이동 | — | PARTIAL | A-1 D7 |

### A-5. 5번 묶음 설계

| 약속 | 위치 | 판정 |
|---|---|---|
| scrypt+salt+timingSafeEqual, 예전 sha256 읽기 | `lib/community-messenger/open-group-password.ts:1-60` | DONE |
| 호출처 4곳 await | `service.ts:11977,12527,12619,12695,12711` | DONE |
| 4~32자 (만들기·수정) | `service.ts:11972,12670`, `open-group-password.ts:39-43` | DONE |
| 입력칸 3곳 maxLength + 안내 | `CommunityMessengerHome.tsx:4068,4071`, `OpenGroupJoinPreviewFullScreen.tsx:139`, `RoomSheets.tsx:1487,1491` | DONE |
| 표 + begin/clear 함수, RLS, service_role | `20271128140000_cm_open_group_join_lock.sql:8-85` | DONE |
| 429 + Retry-After | `open-groups/[roomId]/join/route.ts:49-56` | DONE |
| 분 단위 문구 | `CommunityMessengerHome.tsx:2150` | DONE |
| 문구 5개 | 카탈로그 각 2건 | DONE |

### A-6. 6번 묶음 설계

| 약속 | 위치 | 판정 | 비고 |
|---|---|---|---|
| 6-A 쓰는 곳 모임 열 6개 | `20271128150000_moim_photo_gc_refs.sql:55-60` | DONE | |
| 6-B 버튼 3역할 `moimCls` | `moim-ui.tsx:22-25` | DONE | 적용 누락은 Part B (W4) |
| B11 정책 limits (categories 응답·정보 화면) | `app/api/moim/categories/route.ts`, `MoimManageInfo.tsx:162,173` | DONE | |
| D3·D5·E7·F1~F12 | A-1 참조 | — | |
| F11 문구(검색·대화) | `moim_search_in_title` 2건 등 | DONE | |

### Part A 집계

| 판정 | 수 |
|---|---|
| DONE | 60 (그중 구현 방식만 다른 경미 CHANGED 표기 3: B4·E2·N1) |
| PARTIAL | 6 고유 (B5·B7·B8·B9·D7·E1 — 4번 표 D7 행은 중복) |
| MISSING | 1 (`community_restriction_unavailable` 문구) |
| CHANGED | 3 (A1 데이터 보정→실행 시 판정 · E7 결함 아님 정정 · F11 ⤴ 초대 링크 Owner 결정) |

(행 기준: A-1 44행 + A-2 5 + A-3 4 + A-4 6 + A-5 8 + A-6 4. 「—」 참조 행은 세지 않음.)

---

## PART B — 같은 규칙 전수 점검

### B-1. 역할·멤버십 변경 → 메신저 전체 방·일정 방 동기

| 규칙 | 위치 | 일치? | 비고 |
|---|---|---|---|
| 역할 변경 = 전체 방 + (호스트 아닌) 일정 방 | `moim_member_role_set` `bundle2:421-427` | ✔ | 기준 |
| 〃 | `moim_admin_member_role` `m5:278` | ✗ | 전체 방만 — W2/P2-4 |
| 〃 | `moim__host_swap` `m5:34-37` (위임 수락·어드민 지정·미접속 변경·계정 정리 4곳) | ✗ | 전체 방만. 새 모임장·이전 모임장(→부모임장 `admin`)의 일정 방 역할 미동기. 3번 §5 가 4번으로 넘겼고 4번 §0 이 「덮지 않으니 문제 아님」으로 닫음 — 역할 변경 규칙과는 불일치 · **NEW** |
| 일정 방 참여 시 역할 | `moim__schedule_confirm` `m4:79` (`'member'` 고정) | ✗ | 부모임장이 일정 참여 → 일정 방 `member`, 그 뒤 역할을 바꾸면 `admin`. 같은 사람·같은 방이 경로에 따라 다름 · **NEW** |
| 가입 활성화 | `moim__activate_member` `m2:620` | ✔ | 신규 = member |
| 탈퇴·내보내기·차단 방 퇴장 | `moim__deactivate_member` `bundle2:47-49` (leave `m2:924`, remove `m2:959`, admin remove `m5:305`, cleanup `bundle2:808`) | ✔ | 전체 방·일정 방 모두 |
| 일정 호스트가 모임을 떠남 → 일정 방 owner | 위 4경로 | ✗ | `owner_user_id`·`host_user_id` 그대로 — P2-3 |

### B-2. 취소·만료·삭제 시 정리 대상

열: 대기 멤버(PM) · 열린 가입 신청(JR) · 열린 초대(INV `moim_invite_targets.sent`) · 열린 위임(HT) · 일정 참여(SP) · 일정 호스트(SH) · 알림

| 경로 | 위치 | PM | JR | INV | HT | SP | SH | 비고 / ID |
|---|---|---|---|---|---|---|---|---|
| 모임 종료 | `bundle2:644-652` | ✔ | ✔ | ✗ | ✔ | 일정 취소 | — | INV 미정리 **NEW**(목록은 활성 모임만 보여 화면 영향 없음 `moim-queries.server.ts:694`) |
| 어드민 삭제 | `m5:544-548` | ✗ | ✔ | ✗ | ✔ | 일정 취소 | — | PM = P2-1. INV **NEW**. 일정 취소 알림·종료 알림 없음(아래 B-6) |
| 계정 정리 — 모임 종료 갈래 | `bundle2:790-799` | ✔ | ✔ | ✗ | ✔(`:776`) | 일정 취소 | — | INV **NEW** |
| 계정 정리 — 사용자 갈래 | `bundle2:804-819` | ✔ | ✔ | ✔ | ✗ | ✔(미래만) | ✗ | HT = P3-2, SH = P2-3 동류 · **NEW**(다른 모임 일정 호스트) |
| 나가기 | `m2:915-927` | — | — | ✗(보낸 초대) | ✗ | ✔(미래만) | ✗ | HT = P1-1, SH = P2-3, 보낸 초대 남음 **NEW**(수락 시 초대자 역할 null → 일반 가입으로 처리, 영향 경미) |
| 내보내기·차단(사용자) | `m2:950-961` | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | HT = P1-1, SH = P2-3 |
| 내보내기·차단(어드민) | `m5:297-306` | ✔ | ✔ | ✗ | ✗ | ✔ | ✗ | HT = P1-1(어드민 경로도 동일) · SH = P2-3 |
| 신청 만료 크론 | `moim_policy_executors.sql` `moim_join_requests_expire_due` | ✔ | ✔ | — | — | — | — | |
| 일정 취소 | `m4:194-213` | — | — | — | — | ✗(`requested` 그대로) | — | P3-19 |
| 위임 수락 / 미접속 승인 | `bundle2:560-561,619-620` | — | — | — | ✗ 다른 종류 요청 | — | — | 어드민 지정(`bundle2:584`)만 열린 요청 전부 취소. 수락·미접속 승인은 남은 반대 종류 요청을 두지만 `moim_transfer_stale` 검사로 수락은 막힘 · **NEW**(경미, 화면 배너 잔존 가능성 NOT_PROVEN) |

### B-3. 생성·수정 형제 RPC 검증 집합

| 규칙 | 위치 | 일치? | 비고 |
|---|---|---|---|
| 글 사진 수 ≤10 | create `bundle2:692-694` / update `bundle2:736-737` | ✗ | P2-7 |
| 글 금지어 | create `bundle2:696-700` / update 없음 | ✗ | P2-7 |
| 글 사진 주소 검증(`https://`·길이) | create·update 모두 없음 / 앨범 `m4:431` 만 있음 | ✗ | P3-23 |
| 일정 사진 수 ≤10 | create `m4:124-126` / update `m4:178` 검사 없음 | ✗ | **NEW** — 수정으로 사진 무제한 |
| 일정 사진 주소 검증 | create·update 없음 | ✗ | **NEW**(P3-23 확장) |
| 일정 금지어(제목·설명·장소) | create·update 없음 | ✗ | P3-23 |
| 모임 이름·소개 금지어 | create `bundle2:171-175` / update `:262-266` / admin `:346-350` | ✔ | |
| 가입 질문 금지어 | create `:176` / update `:267` / admin `:351` | ✔ | |
| 참여 방식 값 검증 | create `:162` 실패 / admin `:354` 실패 / update `:272` **조용히 무시** | ✗ | **NEW**(경미) |
| 카테고리 검증 | create `:159` 활성·비제한 / update `:260` 활성·비제한 / admin `:352` 존재만 | ✗ | **NEW** — 어드민 의도일 수 있음, 설계 근거 없음 |
| 대표 사진 주소 검증 | create·update·admin 모두 없음 | ✗ | **NEW**(P3-23 확장) |
| 닉네임 길이 | profile `m2:1204` ≤40 / join `bundle2:456-457` 없음 / create `bundle2:185` 없음 / 초대 수락 운영진 경로 `m2:1320` 없음 | ✗ | P3-5 |
| 소개(bio) 길이 | profile `m2:1210` 300 자름 / join·create·초대 수락 없음 | ✗ | P3-5 |
| 닉네임·소개 금지어 | 어느 경로도 없음 | ✗ | P3-23 |
| 아바타 주소 검증 | profile·join·create 없음 | ✗ | P3-23 |
| 게시판 이름 금지어 | `m3:186,198` 길이만 | ✗ | **NEW**(경미) |
| 작성자 삭제 권한 — 나간 뒤 | 글 `m3:95` 허용 / 댓글 `bundle2:882` 허용 / 앨범 `m4:447` 멤버만 | ✗ | P3-22 |
| 일정 관리권 판정 | `moim__schedule_can_manage` `m4:37-46` / 출석 `m4:333-337`(차단 모임 미검사) | ✗ | P3-20 |

### B-4. 위험 동작 UI = `btnDanger`/`danger:true` + 확인창

| 동작 | 위치 | 위험 모양? | 확인창? | 비고 |
|---|---|---|---|---|
| 일정 신청 거절 | `MoimScheduleDetailScreen.tsx:528` | ✗ `btnSecondary` | ✗ | W4 + 확인창 없음 **NEW** |
| 일정 참여자 내보내기 | `MoimScheduleDetailScreen.tsx:588` | ✗ `btnSecondary` | ✔ `:302-307` | W4 |
| 위임 요청 거절 | `MoimDetailScreen.tsx:77` | ✗ `btnSecondary` | ✗ | W4 + 확인창 없음 **NEW** |
| 받은 초대 거절 | `MoimInvitesScreen.tsx:85` | ✗ `btnSecondary` | △ `:43` `confirmTone` 없음 | W4 + 확인창 위험 톤 누락 **NEW** |
| 가입 신청 거절 | `manage/MoimManageRequests.tsx:88` | ✔ | ✔ 사유 시트 | |
| 신고 숨기기 | `manage/MoimManageReports.tsx:125` | ✔ | ✔ `:138-151` | |
| 초대 링크 회수 | `manage/MoimManageInvite.tsx:166` | ✔ | ✔ `:176-182` | |
| 게시판 끄기 | `manage/MoimManageBoards.tsx:115` | ✔ | ✔ `:168-174` | |
| 멤버 내보내기·차단 | `manage/MoimManageMembers.tsx:128,140` | ✔ | ✔ `:338-392` | |
| 차단 해제 | `MoimManageMembers.tsx:256` | 보조 | ✔ | 위험 동작 아님 |
| 모임 종료 | `MoimManageClose.tsx:72`, 메뉴 `MoimDetailScreen.tsx:197` | ✔ | 이름 입력 | |
| 일정 취소 | `MoimScheduleDetailScreen.tsx:331,413` | ✔ | ✔ `:278-283` | |
| 글 삭제·숨기기·댓글 삭제 | `MoimPostDetailScreen.tsx:159,161,172` | ✔ | ✔ `:100,108,133` | |
| 앨범 삭제·숨기기 | `MoimAlbum.tsx:267` | ✔ | ✔ `:188-192` | |
| 모임 나가기 | `MoimDetailScreen.tsx:200` | ✔ | ✔ `:144-149` | |
| 멤버 시트 신고 | `MoimMemberView.tsx:423` | ✔ danger | — | 다른 화면 신고는 일반 줄 (P3-30) |
| 대표 사진 빼기·질문 빼기 | `MoimManageInfo.tsx:151,252` | 보조 | — | 6번 F3 승인 그대로 |

### B-5. 영어 복수 명사 `{count}` 단수 처리

| 키 | 위치 | `_one`? | 비고 |
|---|---|---|---|
| `moim_screen_member_count` | `moim-screens.ts:336-337`, `moim-ui.tsx:204` | ✔ | 기준 (D3) |
| `moim_manage_info_capacity_hint` "…current {count} members" | `moim-manage.ts:338`, 사용 `MoimManageInfo.tsx:216` | ✗ | P2-16 |
| `moim_home_invites_banner` "{count} group invites" | `moim-screens.ts:354` | ✗ | P2-16 |
| `moim_album_added_toast` "Added {count} photos" | `moim-screens.ts:651` | ✗ | P2-16 |
| `moim_manage_reports_count` "{count} reports" | `moim-manage.ts:244`, 사용 `MoimManageReports.tsx:97` | ✗ | P2-16 |
| `moim_manage_invite_sent_toast` "…{count} people" | `moim-manage.ts:384` | ✗ | P2-16 |
| `moim_manage_close_point_records` "…{days} days" | `moim-manage.ts:419` | ✗ | **NEW** (정책값 1 이면 「1 days」) |
| `moim_screen_member_count_cap` "{count}/{cap} members" | `moim-screens.ts:338` | — | 6번 「영어로 맞음」 정정 |
| `admin_moim_warn_count` "{n} warnings" | `admin-moim.ts:506` | ✗ | **NEW** (어드민 모임 화면) |
| `admin_moim_days_ago` "{n} days ago" | `admin-moim.ts:521` | ✗ | **NEW** |
| `admin_moim_comments_of_post` "View {n} comments" | `admin-moim.ts:595` | ✗ | **NEW** |
| `admin_moim_decide_days_n` "{n} days" | `admin-moim.ts:663` | ✗ | **NEW** |
| `admin_moim_decide_close_same` "…{n} other reports…" | `admin-moim.ts:667` | ✗ | **NEW** |
| `admin_moim_report_same_target` "{n} reports on this item" | `admin-moim.ts:681` | ✗ | **NEW** |

### B-6. 같은 행동 — 진입 경로별 관문(writeKind·전화·가입)

| 행동 | 위치 | writeKind | phone | 가입 게이트 | 일치? |
|---|---|---|---|---|---|
| 가입 버튼 | `app/api/moim/[moimId]/join/route.ts:14` | post(제재 검사) | ✔ | 중앙(`member-action-registry.ts:219` new) | 기준 |
| 초대 링크 가입 | 같은 join 라우트 + `inviteToken` | post | ✔ | 중앙 | ✔ |
| 초대 수락 | `app/api/moim/invites/[inviteId]/route.ts:15` | **none** | ✔ | split `:20-23` | ✗ P2-6 |
| 위임 수락(모임장이 됨) | `app/api/moim/host-transfers/[transferId]/route.ts:16` | none | ✗ | split `:21-24` | ✗ 제재 회원이 위임으로 모임장 가능 · **NEW** (개설은 제재 검사 + 전화) |
| 개설 | `app/api/moim/route.ts:45` | post | ✔ | 중앙 | 기준 |
| 일정 참여 | `schedules/[scheduleId]/join/route.ts:14` | post | ✗ | 중앙 | 참고(계약 없음) |

### B-7. 같은 이벤트 알림 — 사용자·어드민 경로

| 이벤트 | 위치 | 일치? | 비고 |
|---|---|---|---|
| `moim_role_changed` | 사용자 `members/[userId]/route.ts:23` (`role !== "member"` 일 때만) / 어드민 `admin/.../members/[userId]/route.ts:43` (항상) | ✗ | P2-15 |
| `moim_member_removed` | 사용자 `remove/route.ts:21` (항상) / 어드민 `:57` (`was_active` 만) | ✗ | P3-16 |
| 〃 중복 키 | 사용자 `${moimId}:{분}` / 어드민 `${moimId}:${Date.now()}` | ✗ | 사용자 경로는 같은 분 안 재내보내기 알림이 사라짐 · **NEW**(경미) |
| `moim_host_changed` 받는 사람 | 사용자 수락 `host-transfers/[transferId]/route.ts:32` (새 모임장 제외) / 어드민 지정 `admin/.../members/[userId]/route.ts:75` · 미접속 승인 `admin/moim/host-requests/[transferId]/route.ts:32` · 계정 정리 `moim-account-cleanup.server.ts:23` (새 모임장 포함) | ✗ | **NEW**(경미) |
| `moim_schedule_cancelled` — 모임 종료 | `close/route.ts:46-57` | ✔ | 기준(B13) |
| 〃 — 어드민 모임 삭제 | `admin/moim/moims/[moimId]/lifecycle/route.ts:22` 알림 0 | ✗ | 「끌 수 없음」 알림·`moim_closed` 모두 없음 · **NEW** |
| 〃 — 일정 직접 취소 | `schedules/[scheduleId]/route.ts:45` | ✔ 받는 사람 같음(확정+신청) | 단 요청 안 `await`(아래) |
| 응답 뒤 발송(E1 규칙) | after: posts·schedules·close·host-transfers 수락 | 기준 | |
| 〃 | 일정 취소 `schedules/[scheduleId]/route.ts:45` (다수 수신 `await`) | ✗ | **NEW** |
| 〃 | 초대 `invites/route.ts:26`, 위임 요청 `host-transfer/route.ts:22` | ✗ | E1 PARTIAL(설계 목록에 포함) · **NEW** |
| 〃 | 어드민 다수 발송(content:42, host-requests:32, sanctions:37, members host:75) 요청 안 `await` | ✗ | **NEW**(어드민, 경미) |
| 행위자 차단 억제 | `moim-notify.server.ts:88-116` `sender_id` 없음 | ✗ 전 경로 | P3-12 |

### B-8. 표시 출처 단일화(인원수·일정 상태·역할 배지)

| 표시 | 위치 | 일치? | 비고 |
|---|---|---|---|
| 멤버 수 | 카드·공개 `formatMoimCount`(`moim-ui.tsx:201-204`) / 멤버 탭 `MoimMemberView.tsx:86` `memberCount` / 운영 `MoimManageMembers.tsx:174` 목록 길이 | ✗ | P3-37 |
| 일정 상태 배지 | `MoimScheduleStatusBadge`(`moim-schedule-ui.tsx:70`) — 카드·상세·검색 공용 | ✔ 컴포넌트 | 시작 여부 미반영 P2-10 |
| 〃 | 공개 화면 다가오는 일정 `MoimPublicView.tsx:166-176` 별도 행, 배지 없음 | ✗ | **NEW** |
| 역할 배지 | `moim-ui.tsx:84`(전부 초록) / `manage/moim-manage-shared.tsx:178-184`(운영진 파랑) | ✗ | P2-17 |
| 아바타 | `moim-ui.tsx:91`(32px) / `moim-manage-shared.tsx:151`(40px) | ✗ | P2-17 |
| 오류 코드 → 문구(모임 방 거부) | 목록 `messenger-home-action-error-message.ts:12` ✔ / 방 안 `messenger-room-action-error-messages.ts` 에 `moim_room_*` 0건 | ✗ | **NEW**(판정 응답 전 방 안 동작 시 일반 오류, P3-29 동류) |

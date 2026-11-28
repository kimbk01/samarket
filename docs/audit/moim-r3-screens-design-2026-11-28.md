# 모임 R3 — 화면·CTA 결함 설계 (2026-11-28 13:32 PHT)

- 지시: Owner 「R3 설계 시작」(2026-11-28). 결정은 같은 날 Owner 지시 「결정 사항은 권장안을 따른다」로 권장안을 확정해 적는다. 다만 승인된 시안과 그 뒤 Owner 지시가 부딪히는 곳은 규정(허위 보고 금지 7번)에 따라 고르지 않고 §5 에 적는다.
- 범위: 대감사 `docs/audit/moim-grand-audit-2026-11-28.md` §6 R3
  - 포함: U-01~U-16, W3·W4·W6·W7, 결정 D-1·D-6·D-8·D-9·D-11
  - 제외
    - U-11: R4
    - U9-02·U9-03a: R2 에서 끝냈다
    - U9-03b: D-20 이 R3 로 넘겼고, 이 설계에서 「하지 않음」으로 확정한다(§1-9)
- 기준 코드: R2 브랜치 `0b5b12e33`. R2 가 병합되면 main 위로 다시 얹는다.
- 조사: 독립 조사자 3명이 G6 FAIL 77행과 같은 규칙 위반 전체를 현재 줄 번호로 다시 대조했다. 작업자가 그 결과를 합쳤다.
- 배포 구분: **웹만**. DB 변경은 없다. 예외는 §5 「운영진만 1:1」로, 정해지면 DB 변경이 생긴다.

---

## 0. 기준 원문

- LOCKED `docs/customer-platform/04-DESIGN-SYSTEM.md:22`
  - 4px: 「화면에 붙은 카드·섹션·목록·버튼·입력·**칩**」
  - 12px: 「**시트·다이얼로그 안 버튼·카드·입력** `--overlay-radius-md`」
  - pill: 「아바타·토글·**배지**·FAB」
  - `:44`: 「터치 영역 최소 **44×44px** (`--sam-tap-min`)」
  - 「신규 색·타이포·반경 트리를 `app/design-tokens.css` 밖에 두지 않는다」
- 6-B 버튼 규칙 `moim-bundle6-design-2026-11-28.md:46-51`
  - 기본 = 화면 핵심 동작 **1개**
  - 보조 = 그 밖
  - 위험 = 숨기기·삭제·내보내기·차단·회수·종료·**일정** 취소·거절
  - 비활성 = `disabledToken` 하나
- 계약 `moim-design-v1-2026-11-12.md`
  - P13 「신고 대상 … **일정** … 각 화면의 ⋮ 메뉴에서」
  - P11 「모임 프로필에서 [대화하기] … 모임장은 「운영진만 1:1 가능」으로 제한할 수 있다」
  - P15 「종료된 모임은 멤버만 30일 동안 기록을 볼 수 있고」
  - P4 「받는 사람이 [수락] → P3 진행」
- 승인 시안 `moim-mockup-2026-11-12.html` U1~U10
- 결정
  - D-1: 칩 4px
  - D-6: 비회원 일정 = 시안 U3 「시각·장소·인원」
  - D-8: 모임장 = primary, 부모임장·운영진 = neutral, 역할 배지는 **공용 부품 하나**
  - D-9: 가입 = 시트
  - D-11: 알림 스위치 유지
  - D-13: 모임 배지는 pill(`moimCls.badge`)

---

## 1. 결함·수정 (현재 줄 번호)

### 1-1. 버튼 역할·위험·확인 (U-01 · U-02 · W4 · U-16)

| ID | 현재 | 수정 |
|---|---|---|
| W4·G-dng-01 위임 거절 | `MoimDetailScreen.tsx:78` `btnSecondary`, 확인 없음 | `btnDanger` + `dibayConfirm` destructive (새 문구 키) |
| G-dng-02 일정 신청 거절 | `MoimScheduleDetailScreen.tsx:531` `btnSecondary`, 확인 없음 | `btnDanger` + destructive 확인 |
| G-dng-03 참여자 내보내기 | `:591` `btnSecondary`, **확인은 이미 있음**(`:305-311`) | `btnDanger` |
| G-dng-04 초대 거절 | `MoimInvitesScreen.tsx:88` `btnSecondary`, 확인은 있으나 초록(`:46` tone 없음) | `btnDanger` + `confirmTone:"destructive"` |
| G-dng-08 멤버 시트 신고 빨강 | `MoimMemberView.tsx:423` `danger:true` | 일반 줄(다른 신고 4곳과 같게) |
| 글 ⋮ 순서 | `MoimPostDetailScreen.tsx:159-171`: 수정 → 위험 → 고정 → 신고 | 일반(수정·고정) → 신고 → 위험 |
| (전수) 모임 ⋮ 순서 | `MoimDetailScreen.tsx:190` 신고가 `:197` 위임하기(일반)보다 앞 | 위임하기를 신고 앞으로 |
| D-10 주석 | `moim-ui.tsx:23` 「…종료·취소·거절」 | 「…종료·**일정** 취소·거절」(6-B 표와 같게, D-10 은 6번 설계를 따름) |
| U-02 G-pri-04 | 위임 배너 수락 `btnPrimary` + 탭 「일정 만들기·글쓰기」 `btnPrimary` | 배너가 떠 있으면 탭 CTA 를 `btnSecondary` 로(배너 결정이 그 화면의 핵심 · D-31) |
| G-pri-05·06·07 | 줄마다 「승인」·「수락」 `btnPrimary` (일정 신청자 `:534` · 운영 가입 신청 `MoimManageRequests.tsx:102` · 초대함 `MoimInvitesScreen.tsx:91`) | 줄 안 승인·수락은 `btnSecondary`(D-31). 거절은 위 W4 대로 `btnDanger` |
| U-16 G-dis-03 | `MoimManageTransfer.tsx:98` 경고·권한 없음일 때 막힌 기본 버튼 | 그 조건이면 버튼을 그리지 않고 안내 줄만(F7 방식) |
| (전수·신규) 위임 재전송 | 같은 화면 `sentTo`(`:41,56`)가 `disabled` 에 없음 → 보낸 뒤 다시 누르면 또 보냄 | `sentTo` 이면 버튼 숨김(HostRequest `sent` 와 같게) |
| G-dis-04 | `MoimManageHostRequest.tsx:127` 보낸 뒤 막힌 버튼 | `sent` 이면 숨김 |
| G-dis-05 스위치 50% | `MoimScheduleFormScreen.tsx:398` `disabled:opacity-50` | **바꾸지 않음** — 공용 토글 `components/mypage/ds/MyToggle.tsx:18` 이 「비활성 50%」로 고정한 플랫폼 규칙과 같다(D-34) |

### 1-2. 터치 44px (U-06)

| 위치 | 현재 | 수정 |
|---|---|---|
| `moimCls.btnSm` (모임 39곳) | `.sam-btn--sm` 40px | 모임 안에서만 `min-h-[length:var(--sam-tap-min)]`. 전역 `.sam-btn--sm` 은 앱 전체라 손대지 않는다 |
| `moimCls.chip` 6곳 + `Sam.chip` 3곳(Boards·Permissions·Invite) | 약 32px | `min-h-[length:var(--sam-tap-min)]` |
| 「전체 보기」 글자 버튼 `MoimMemberView.tsx:153,200,215` · `MoimAlbum.tsx:401` | 높이 없음 | 새 `moimCls.sectionLinkBtn`(44px) |
| 사진 ✕ `MoimWriteScreen.tsx:181` · `MoimScheduleFormScreen.tsx:307` (24px), 표지·질문 ✕ `MoimCreateWizard.tsx:235,313` (28·36px) | | 44px 투명 버튼 안에 지금 모양 |
| 출석 토글 `MoimScheduleDetailScreen.tsx:576` | 약 26px | 44px |
| 앨범 닫기·이전·다음 `MoimAlbum.tsx:231,243,248` · 앨범 동작 `:207` | 40px | 44px(공용 뷰어 `h-11 w-11` 과 같게) |
| FAB `MoimTabHome.tsx:157` · `MoimMemberView.tsx:123` | 약 40px | 44px |
| 스위치 `MoimScheduleFormScreen.tsx:398` (2곳에서 씀) | 31px | 44px 투명 누름 영역 안에 51×31 트랙(겉모양 그대로) |
| 세그먼트 `MoimCreateWizard.tsx:292` · `MoimWriteScreen.tsx:201` · `MoimScheduleFormScreen.tsx:342` | 약 40px | `--sam-segment-tab-height`(44) |
| 동의 체크 줄 `MoimCreateWizard.tsx:382-383` · 받은 초대 배너 `MoimTabHome.tsx:121` | | 44px |
| 댓글 입력 `MoimPostDetailScreen.tsx:227` `min-h-[42px]` | 입력 최소 46 보다 작음 | 덮어쓰기 삭제(토큰 값) |
| 메신저 「모임 홈」 `CommunityMessengerRoomPhase2Header.tsx:521` | 약 28px · pill | 44px · 4px(버튼) |
| 어드민 `AdminActionButton` sm 32px | 어드민(데스크톱) 자체 규칙 | 범위 밖 — 기록만 |

### 1-3. 반경 (U-07 · W3 · D-1 · D-13)

| 위치 | 현재 | 수정 |
|---|---|---|
| 칩 `moim-ui.tsx:32` (+ 주석 `:14`) | pill | 4px(D-1). 주석 「칩 4px · 배지 pill」 |
| 운영 화면 `Sam.badge.*` 9곳(역할·재가입·신고 수·초대·게시판·허브) | 4px | `moimCls.badge`(pill) + 색. 전역 `.sam-badge` 는 바꾸지 않는다(D-13 「플랫폼 CSS 는 별도 과제」) |
| W3 메신저 모임·일정 배지 `MessengerChatListItem.tsx:1152,1159,1171,1177` | 4px | pill. 이 4px 를 고정한 시험 `moim-bundle6-screens.test.ts:108-109` 도 고친다 |
| (전수) 같은 줄 `CommunityMessengerChatTypeBadge.tsx:21` `rounded-[6px]` | | 메신저 공용 부품이라 R3 밖. 기록만 |
| 시트 안 버튼·입력·카드 | 4px | 12px(`OverlayUi.btn`·`OverlayUi.input` 또는 `rounded-[length:var(--overlay-radius-md)]`) |

시트 안 4px 위치:
- `MoimJoinSheet.tsx:68,79,89,96,104,105`
- `MoimReportSheet.tsx:66,90,97`
- `MoimScheduleDetailScreen.tsx:99,108`
- `MoimManageMembers.tsx:300,333,388`
- `MoimManageRequests.tsx:142`
- `MoimManageBoards.tsx:156`

시트 안 칩(`MoimReportSheet.tsx:80`, `MoimManageBoards.tsx:70`)은 LOCKED 에 규칙이 없다. 화면 칩과 같은 4px 를 쓰고, 이를 D-32 로 정한다.

### 1-4. 역할 배지·아바타 하나로 (U-08 · D-8)

- 공용 부품은 `components/moim/moim-ui.tsx` 의 `MoimRoleBadge`·`MoimAvatar`·`moimRoleKey` 하나만 남긴다. `moim-manage-shared.tsx:151-193` 의 같은 이름 세 함수는 지우고, 쓰던 곳의 import 를 바꾼다.
  - 바꿀 곳: HostRequest·Members·Requests·Transfer·Invite·Boards·Permissions
- 배지
  - 모임장 = `badgeGreen`
  - 부모임장·운영진 = `badgeGray`
  - 멤버 = 없음
  - 모양은 pill
- 아바타는 크기에 따라 글자 크기가 바뀌게 한다. 운영 화면에서 쓰던 기본 크기 40 은 호출부에 그대로 적는다.
- 일정 「호스트」 배지 `MoimScheduleDetailScreen.tsx:566` 는 `badgeGray` 로 바꾼다(D-30). 같은 초록이면 모임장 배지와 구분되지 않기 때문이다.
- 그리는 곳 전체: 역할 배지 8곳, 아바타 14곳. 조사표를 구현 PR 에 붙인다. 어드민은 글자 표시라 해당하지 않는다.

### 1-5. 일정 (U-03 · W6 · W7)

| ID | 현재 | 수정 |
|---|---|---|
| W6 일정 신고 | `MoimReportSheet.tsx:11` 대상 타입에 schedule 없음. 일정 화면에 신고 호출 0건. **서버는 이미 받는다**(`MOIM_REPORT_TARGET_TYPES`·RPC·check) | 타입 추가 + 일정 ⋮ 에 「신고」 |
| W7 신청자 ⋮ | `MoimScheduleDetailScreen.tsx:395-397` 관리 권한자만 | 호스트가 아니면 「신고」 줄로 ⋮ 를 보인다. 순서: 일반(수정·마감) → 신고 → 위험(취소) |
| 시작한 일정이 「모집 중」 | `moim-schedule-ui.tsx:62-73` 상태만 봄 | 시작했고 상태가 recruiting·full·closed 이면 「진행 중」(새 키). 카드·상세 2곳 |
| 「모집 중」 색 | `:63` green | `badgeGray`(시안 U4·U5) |
| 「참여 확정」 색 | `:78` green | 새 `moimCls.badgeOk` = `bg-sam-success-soft text-sam-success`(LOCKED success 토큰 · 시안 b-ok) |
| 카드 오른쪽 배지 | `:113-114` 상태 + 내 배지 둘 다 | 시안 U4 처럼 1개: 내가 확정이면 「참여 확정」, 아니면 상태 |
| 「신청 후 승인」 | `MoimScheduleDetailScreen.tsx:461-463` gray | gray 그대로(D-25) |

### 1-6. 멤버·흐름 (U-04 · U-05 · U-12 · U-13 · U-14 · U-15)

| ID | 수정 | 서버 |
|---|---|---|
| U-04 ① 일반 멤버 「대화하기」 | 운영 화면 `openMessage`(`MoimManageMembers.tsx:75-99`)를 공용 훅 `use-moim-direct-message.ts` 로 빼고, 멤버 탭 시트에 「대화하기」(일반) → 「신고」(일반) 순서로 넣는다 | 없음(기존 `direct/start`) |
| U-04 ② 「운영진만 1:1」 | **§5 Owner 확인** — 이 R3 에서 하지 않는다 | (정하면 DB) |
| U-05 비회원 댓글 수 | 비회원은 목록과 같은 `post.commentCount` 로 「댓글 N」을 보인다. 빈 목록 대신 「댓글은 멤버만 볼 수 있어요」(새 키)를 보인다(D-35). 비회원에게 댓글 작성자의 모임 프로필을 열지 않는다(P2 「멤버 목록은 멤버에게만」) | 없음 |
| U-12 종료 모임 「내 모임」 | `listMyMoims`(`moim-queries.server.ts:165-178`)가 `closed` 이고 열람 기간이 끝나지 않았고(`retention_ended_at is null`) 내가 활동 멤버였던 모임도 넣는다. `MoimCardDto.status` 를 추가하고, 카드에 「종료」 gray 배지와 흐린 표지를 그린다 | TS 쿼리만(같은 1회 조회의 조건) |
| U-13 멤버 초대 수락 질문 | `listReceivedMoimInvites` 가 초대한 사람의 역할을 같이 읽는다. 승인제이고 그 역할이 staff 미만이면 `joinQuestions` 를 채운다(질문 1회 묶음 조회). 화면은 시트에 질문을 넘기고, 답을 라우트 → RPC 래퍼 `profilePayload` 의 `answers` 로 전달한다. **DB 는 이미 `p` 를 `moim_join` 에 넘긴다** | TS 만 |
| U-14 나가기 거절 뒤 [모임 홈] | `CommunityMessengerHome.tsx:3326-3328` 가 `moim_room_membership_managed_by_moim` 이면 `peekMoimRoomOwner` 로 모임을 찾아 스낵바 「모임 홈」 동작을 단다(정보가 없으면 문구만). 방 화면 오류 함수 `messenger-room-action-error-messages.ts` 에 모임 방 코드 4개를 기존 `moim_err_*` 키로 잇는다 | 없음 |
| U-15 오류 문구 | `moimErrorKey`(`moim-client-api.ts:71-75`)에 세 코드를 직접 잇는다<br>- `member_activity_restricted` → 기존 `api_err_member_activity_restricted`<br>- `community_restricted` → 새 키<br>- `community_restriction_unavailable` → 새 키 | 없음 |

### 1-7. 영어 단수 · 카테고리 이름 (U-09)

- `_one` 키를 추가하고 호출부에서 `count === 1` 이면 그 키를 쓴다. 모임 안의 선례 `formatMoimCount` 와 같은 방식이다. 대상:
  - 모임 5개: `moim_home_invites_banner`, `moim_manage_reports_count`, `moim_manage_info_capacity_hint`, `moim_manage_invite_sent_toast`, `moim_album_added_toast`
  - 정책 일수 1개: `moim_manage_close_point_records` — 운영 값이 1이 아니어도 막는다
  - 어드민 6개: `admin_moim_warn_count`, `admin_moim_days_ago`, `admin_moim_comments_of_post`, `admin_moim_decide_days_n`, `admin_moim_decide_close_same`, `admin_moim_report_same_target`
    - `admin_moim_decide_days_n` 은 선택지에 1일이 있어 「1 days」가 실제로 화면에 나온다.
- G-i18n-03 카테고리 이름: `moimCategoryLabel`(`moim-ui.tsx:54`)이 다른 언어로 대신 보여 주지 않게 한다. 공용 `resolveLocalizedAdminLabel` 을 쓰고, 비어 있으면 같은 언어의 대체 키를 쓴다. 대체 키는 공용 `community_topic_label_fallback` 을 다시 쓴다(§3-3 · §3-6).

### 1-8. 시안 차이 (U-10)

| 행 | 수정 | 서버 |
|---|---|---|
| U1-local-title 「Taguig 모임」 | `/api/moim` 응답에 이미 계산한 `cityLabel` 을 넣는다. 도시가 있으면 「{city} 모임」(새 키), 없으면 지금 문구 | 응답 필드만(조회 추가 없음) |
| U1-card-badge-sched 「일정 모집 중」 | 카드 DTO 에 `hasRecruitingSchedule` 을 넣는다. **같은 select 안에 일정 관계를 묶어 읽는다**(PostgREST 관계 select · 추가 요청 0). 배지는 gray(D-25) | TS select |
| U3-hdr-title 비움 | 비회원 공개 페이지는 머리글 제목을 비운다. 이름은 본문 `<h1>` 에 있다 | 없음 |
| U3-cover-tag 표지 위 태그 | 표지 왼쪽 아래에 태그를 얹는다. 흰 글자 대신 `bg-sam-surface` pill 위 `text-sam-fg` 로 쓴다(D-27 · 사진이 없을 때 초록 바탕에서 흰 글자는 대비 기준 미달) | 없음 |
| U3·U4 날짜 칸 | 흰 칸 + 테두리 + 위 작은 날짜·아래 굵은 요일(시안 배치). 날짜 색은 빨강 대신 `text-sam-primary`(D-28 · danger 는 오류·위험 전용) | 없음 |
| U3-sched-line 장소 | 공개 일정 줄 = 시각 · **장소** · 인원(D-6). `listUpcomingScheduleTeasers` select 에 `place_text` 추가 | TS select |
| U3-sheet-profile-card | 가입 시트 프로필 = 카드(아바타·닉네임·「DIBAY 닉네임 · 모임마다 바꿀 수 있어요」·「수정」). 「수정」을 누르면 지금 입력칸을 연다 | 없음 |
| U4-x-head | 멤버 홈의 표지·머리 블록 삭제(공개 페이지에는 남김). 상태 안내·경고 배너는 유지 | 없음 |
| U4-notice-card | 홈 공지 = 한 줄 카드(`badgeWarn` 「공지」 + 제목). 섹션 제목과 「공지 없음」 글은 없앤다. 게시판 목록의 고정 배지(`MoimPostRow.tsx:19`)도 같은 warn 으로 맞춘다(같은 「공지」 배지 한 벌) | 없음 |
| U4-sched-head 「달력」 | 달력 화면이 없다. 글자를 「달력」으로 바꾸면 열리는 화면과 맞지 않는다 → 「일정」(일정 탭 이름 키)로 쓴다(D-29) | 없음 |
| U4-recent-head 「게시판」 | 기존 키 `moim_home_board_tab` | 없음 |
| U4-x-members-tab | U-04 ① | |
| U6-form·U6-qr 초대 시트·QR | **§5 Owner 확인**(배치 충돌). 충돌 없는 부분 — QR 그리기(설치된 `qrcode` 와 기존 친구 QR 헬퍼 재사용) — 만 준비한다 | 없음 |
| U7-tab-requests·banned·memo | 멤버 관리 탭 = 멤버 N · 가입 신청 N(`decide_join` 일 때) · 차단 N · 메모(`write_note` 일 때)<br>- 차단 수와 메모는 이미 받은 목록에서 센다<br>- 가입 신청 수는 그 권한자에게만 기존 목록 API 1회를 쓴다(§4 요청량) | 없음 |
| U7-sheet-icons | 시트 줄 앞 아이콘(lucide Star·PenLine·MessageCircle·LogOut·Ban — `DibayActionSheetItem.label` 이 ReactNode 라 공용 부품은 그대로) | 없음 |
| U8-row-moim/sched-badge | pill(W3). 일정 배지는 gray(D-25)로 모임 배지와 구분 | 없음 |
| U8-roomtop-btn | 1-2 표 | |
| U10-hdr-save | **바꾸지 않음**(D-26). LOCKED CTA Authority(`03-NAVIGATION.md` 「Primary = 프로필 저장 · 신규 CTA 종류 금지」)와 6-B F9(저장 = 하단 고정)를 따르고, 시안 차이로 기록한다 | |
| U10-avatar | 가운데 72px 아바타 + 아래 「사진 바꾸기」. 「사진 지우기」는 같은 줄의 두 번째 글자 버튼으로 남긴다(지금 있는 기능 · 시안에 없어도 지우지 않음) | 없음 |
| U10-ntf-state | 바꾸지 않음(D-11) | |
| D-9 | 코드는 이미 시트다. 계약 §9 `/moim/[id]/join` 을 정정한다 | |

### 1-9. 그 밖

| ID | 수정 |
|---|---|
| G-col-02 앨범 검정·흰색 | **바꾸지 않음**(D-33). 앱의 사진 전체 화면은 공용 `DibayImageViewer` 하나로 고정돼 있다(SSOT 시험). 그 공용 뷰어도 같은 검정·흰색을 쓰고, 사진 뷰어 토큰은 없다. 모임만 바꾸면 플랫폼 기준과 어긋난다. 뷰어 토큰 신설은 플랫폼 과제로 보고만 한다 |
| U9-03b 알림 줄 안 수락·거절 (D-20) | 알림 목록은 플랫폼 공용 화면이고, 줄 안 동작 규격이 없다. 이 R3 에서도 **하지 않는다**. 링크가 수락·거절 버튼이 있는 초대 화면으로 가는 지금 동작으로 끝낸다. 시안 차이로 기록한다(D-20 확정 기록) |

---

## 2. 같은 규칙 전수 목록 (구현 PR 에 표로 붙임)

| 규칙 | 걸린 곳 |
|---|---|
| R3-a 위험 = `btnDanger` + destructive 확인 | 위 4건 + 신규 2건(모임 ⋮ 순서 · 초대 확인 색). 이미 맞는 곳 14곳: Album·PostDetail·Schedule·PublicView·Requests·Reports·Boards·Invite·Members·Close. 어드민은 자체 규칙(되돌릴 수 없는 것만 danger)이라 PASS |
| R3-b 한 화면 기본 1개 | 4화면 |
| R3-c 44px | 1-2 표 전부(신규 6곳 포함) |
| R3-d 반경 | 1-3 표 전부(신규 7곳 포함) |
| R3-e 역할 배지·아바타 한 벌 | 배지 8 · 아바타 14 · 일정 호스트 배지 |
| R3-f 일정 상태 배지 | 카드 3곳(홈·일정 탭·모임 안 검색) · 상세 · 메신저 목록 |
| R3-g 단수형 | 12키 |

---

## 3. 문서 정정

- 계약 §9: `/moim/[id]/join` → 「시트」(D-9)
- 계약 P2 `:211`: 「다가오는 일정 제목」 → 「시각·장소·인원」(D-6)
- DTO 주석: 「제목·시간·인원만」 → 「…장소」
- `moim-ui.tsx` 주석: 칩·위험 범위
- 6번 설계 W6 문장 「일정 신고 메뉴는 기존 위치 그대로」 → 「없었음 — R3 에서 추가」
- 대감사 §6 R3 행: U9-03b(D-20)·U-04 ②·U6 처리 결과

---

## 4. 영향·요청량·깨질 수 있는 것

| 바뀌는 것 | 영향 | 처리 |
|---|---|---|
| `moimCls.btnSm`·chip 높이 44 | 모임 화면 45곳의 줄 높이가 4px 늘어난다 | 600~767·360 폭 확인(구현 PR 실기 항목) |
| 역할 부품 통합 | 운영 화면 7파일 import | 같은 PR. 운영 화면 기본 크기 40 은 호출부에 적는다 |
| 메신저 2파일(목록 배지·머리글 버튼) | 메신저 hard-lock: 통화 화면 CTA 와 무관. 방 머리글의 모임 버튼 모양만 | 메신저 규칙 시험(`verify:call-surface-cta-ssot`)을 같이 돌린다 |
| 6-B 시험이 4px 를 고정 | `moim-bundle6-screens.test.ts:108-109` | 같은 PR 에서 pill 로 고친다 |
| `/api/moim` 카드 DTO(관계 select·cityLabel) | 요청 횟수는 그대로(같은 select). 응답 크기만 조금 늘어난다 | 예산 2.6 유지. 7일 실측 |
| 멤버 관리 「가입 신청 N」 | 승인 권한자가 멤버 관리를 열 때 GET 1회 추가 | 권한자에게만. 라우트 예산 등록 여부를 확인한다 |
| 내 모임에 종료 모임 | 목록 조건만 바뀐다 | 카드 「종료」 표시. 누르면 이미 있는 종료 화면 |
| 초대 수락 질문 | 받은 초대 목록에 질문 묶음 조회 1회(질문이 필요한 초대가 있을 때만) | |

설치된 앱은 재시작만 하면 된다(웹만).

---

## 5. Owner 확인 (규정 7번 — 승인 시안과 뒤 Owner 지시·계약이 부딪힘)

| # | 충돌 | 권장 | 이번 R3 처리 |
|---|---|---|---|
| Q1 | **U6 초대 시트.** 시안 U6(11-12)에서는 메뉴 [초대] 시트 하나에 링크 복사·QR·다른 앱 공유·친구 초대가 함께 있다. Owner 2026-11-14 §N-3 은 「바깥 공유는 머리글 1곳 — 메뉴에는 DIBAY 친구 초대만」이다(`MoimDetailScreen.tsx:181`). 계약 §5.2 에 따라 링크 권한은 운영진 이상이다 | 머리글 ⤴(링크 권한자)를 시안 U6 시트(QR·링크 복사·다른 앱 공유)로 연다. 메뉴 [초대]는 지금처럼 친구 초대만 둔다 → N-3 과 시안 내용을 모두 지킨다 | Owner 답을 받은 뒤에만 바꾼다. QR 부품만 준비한다 |
| Q2 | **U-04 ② 「운영진만 1:1」.** 계약 P11 문장만 있고, 뜻이 두 가지로 읽힌다. ⓐ 모임에서 1:1 을 걸 수 있는 사람이 운영진뿐인가, ⓑ 멤버는 운영진에게만 걸 수 있는가. 또 1:1 은 일반 메신저라 모임 밖(친구·검색)에서 거는 것은 막을 수 없다. 계약의 「상대 **수락 후** 시작」도 지금 `direct/start` 는 바로 방을 만든다 | ⓐ로 정하고, 모임 화면 안의 「대화하기」만 제어한다(권한 표 `start_dm` 1행 · DB 함수 2개 수정). 「수락 후 시작」은 메신저 1:1 정책이라 계약 문장을 「메신저 1:1 규칙을 따른다」로 정정한다 | 하지 않는다(DB·계약 변경이라 승인 뒤 별도) |

---

## 6. 결정 (권장안으로 확정)

| ID | 내용 |
|---|---|
| D-25 | 시안의 `b-info`(파랑) 배지는 LOCKED 토큰에서 초록이 되어 옆 초록 배지와 구분이 사라진다. 그래서 neutral gray 로 쓴다(D-8 과 같은 원칙). 대상: 카드 「일정 모집 중」 · 「신청 후 승인」 · 메신저 「일정」 |
| D-26 | U10 머리글 「저장」 대신 하단 고정 저장을 유지한다(LOCKED CTA Authority · 6-B F9) |
| D-27 | U3 표지 태그는 흰 글자 대신 밝은 pill 위 진한 글자로 쓴다(대비 4.5:1) |
| D-28 | 날짜 칸 강조색은 빨강 대신 primary 로 쓴다(danger 는 오류·위험 전용) |
| D-29 | U4 「달력」 링크는 달력 화면이 없으므로 「일정」으로 쓴다 |
| D-30 | 일정 「호스트」 배지는 gray(모임장 배지와 구분) |
| D-31 | 줄마다 반복되는 승인·수락은 보조 버튼이다. 위임 배너가 떠 있으면 그 화면의 기본은 배너 하나다 |
| D-32 | 시트 안 칩은 화면 칩과 같은 4px(LOCKED 에 시트 안 칩 규칙이 없음) |
| D-33 | 앨범 사진 보기의 검정·흰색은 공용 사진 뷰어와 같은 예외로 둔다. 토큰 신설은 플랫폼 과제로 보고한다 |
| D-34 | 모임 스위치 비활성 50% 는 공용 토글 규칙과 같게 둔다. 누름 영역만 44px 로 넓힌다 |
| D-35 | 비회원에게 댓글 내용·작성자는 보이지 않고, 댓글 수만 목록과 같게 보인다 |

---

## 7. 검증 계획

| 구분 | 내용 |
|---|---|
| 동작 시험 | 문자열 대조가 아니라 렌더 결과를 본다(대감사 R5)<br>- 위험 버튼·확인창 tone<br>- 메뉴 순서<br>- 역할 배지 색·모양<br>- 시작한 일정 「진행 중」<br>- 단수형 12키<br>- 카테고리 대체 없음<br>- 오류 문구 3코드<br>- 초대 수락 answers 전달<br>- 종료 모임 목록 조건<br>- 비회원 댓글 수 |
| 코드 검사 | `typecheck:build`·`typecheck:test`·`check:i18n-quality`·`test:ci`·변경 파일 eslint 전후 비교·`verify:design-system-hard-lock`·`verify:call-surface-cta-ssot` |
| 독립 재감사 | G6 표 77행 + 이 설계 체크리스트를 다시 대조한다 |
| 실기 (병합 뒤 · 기기 상한 10회 안) | 360·600~767 폭에서 버튼 높이·줄바꿈·배지·시트 반경. 정해진 화면만 |
| NOT_PROVEN 으로 남는 것 | 실기 화면 전부(구현 PR 단계에서는 측정하지 않음) · 다크 모드 |

---

## 8. 구현 중 정정 · 독립 재감사 반영 (2026-11-28)

| ID | 등급 | 내용 | 처리 |
|---|---|---|---|
| 작업자 결함 | P2 | 이 설계 §1-8 이 대감사 U-10 의 시안 U5 두 행 「지원 동기 입력칸 위치」·「초록 안내 상자」를 빠뜨렸다(G6 `U5-motivation`·`U5-infobox`) | 시안대로 고쳤다. 지원 동기는 시트 대신 본문 CTA 바로 위 입력칸(8자 이상 검사 그대로)이고, 「참여가 확정되면 …」은 `noticeInfo` 초록 상자다 |
| 재감사 P2 | P2 | 카드 배지를 1개로 줄이면서, 취소·종료된 일정도 참여 기록(confirmed) 때문에 「참여 확정」만 보였다(회귀). 구현 시험이 이 회귀를 정답으로 고정하고 있었다 | 취소·종료는 상태 배지가 먼저 보이게 했다. 시험도 바로잡았다 |
| 재감사 P3 | P3 | 「가입 신청 N」이 다른 화면으로 가는데 `role="tab"` 이었다 | 탭 역할 없는 버튼으로 바꿨다(누르면 가입 신청 화면) |
| 재감사 P3 | P3 | §1-8 「QR 부품만 준비」를 하지 않았다 | 정정: **Q1 답 뒤로 미룬다.** 준비만 해 둔 쓰지 않는 코드는 넣지 않는다 |
| 재감사 P3 | P3 | §1-4 「세 함수를 지운다」 → 구현은 `moim-manage-shared.tsx` 가 공용 부품을 다시 내보낸다(구현은 하나) | 설계 정정: 다시 내보내기로 둔다(운영 화면 import 7파일 변경 없음) |
| 재감사 P3 | P3 | 카테고리 영어 이름이 비면 늘 「Topic」이라, 여러 개면 구분되지 않는다 | 어드민 등록이 ko·en 둘 다 필수다(`AdminMoimCategoriesPage.tsx:35`). 그래서 운영에서는 생기지 않는다. 기록만 한다 |
| 재감사 P3 | P3 | 메뉴 순서·확인창 tone 의 동작 시험이 없다(문자열 대조뿐) | 남는 한계로 기록한다. 메뉴 만드는 부분이 화면 안에 있어 렌더 시험이 크다 |
| 작업자 결함 (R2·R3 보고) | — | ESLint 전후 비교를 `-f unix` 로 돌렸다. 이 형식은 설치돼 있지 않아 전후가 모두 0으로 세어졌다. R2 보고의 「ESLint 새 경고 없음」은 **검증되지 않은 값**이었다 | JSON 형식으로 다시 셌다(PR 본문에 결과) |
| 「진행 중」 배지 색 | — | 설계에 색이 없었다 | 구현은 `badgeGreen` 이다(모집 중 gray 와 구분). 기록한다 |

---

## 9. Q1·Q2 반영 (Owner 「Q1·Q2 권장안으로 진행」 2026-11-28)

| Q | 확정 | 구현 |
|---|---|---|
| Q1 | **철회 (작업자 결함).** 권장안은 「머리글 ⤴ → 초대 시트」였다. 그런데 Owner 2026-11-14 §N-3 에는 「바깥 공유는 머리글 1곳」 외에 「머리글 공유 = **기기 공유 창 바로**(저장된 SNS 가 모두 나오게)」 조항도 있다. 이 조항을 계약 시험 `lib/share/__tests__/header-share-single-entry.test.tsx` 이 「초대 시트 없음」으로 고정한다. 권장안을 만들 때 앞 조항만 읽었다. 구현 뒤 전체 시험에서 걸렸다 | 코드를 되돌렸다. 머리글 ⤴ 는 지금처럼 기기 공유 창을 바로 열고, 메뉴 [초대]는 친구 초대만 연다. 시안 U6 의 QR 은 **Owner 결정 필요**로 남긴다(§N-3 과 시안 U6 충돌) |
| Q2 | ⓐ 모임 화면의 [대화하기]를 권한 `start_dm` 으로 제어한다. 기본은 멤버 누구나(조정 가능, 상한 운영진). 「수락 후 시작」은 「메신저 1:1 규칙을 따른다」로 계약을 정정한다 | 마이그레이션 `20271128240000_moim_r3_start_dm.sql`: `moim_permission_defaults`·`moim_permission_ceiling` 에 1행씩 추가. TS 계약 `start_dm`, 권한 설정 화면은 목록이 자동으로 늘어난다(문구 `moim_perm_start_dm`). 멤버 탭 시트와 운영 멤버 시트의 [대화하기]를 `can.start_dm` 으로 거른다. 계약 §5.2 표와 P11 을 정정했다 |

- **배포 구분이 바뀐다:** 웹 + **운영 DB 함수 2개**. DB 를 먼저 적용하고 그다음 병합한다(웹이 먼저 나가면 권한 화면에서 `start_dm` 을 저장할 때 DB 가 「조정할 수 없는 권한」으로 거부한다).
- 서버에서 강제하지 않는다: 1:1 시작 API 는 메신저 공용이라, 모임 화면 진입점만 제어한다(Q2 권장안 그대로).

# 그룹 채팅 전체 결함 — 원인 확정 · 수정 설계안 (2026-11-13)

- 상태: **설계안 — Owner 승인 전 구현 금지**
- 앞 설계: `docs/design/group-room-drawer-fix-design-2026-11-12.md` (PR A = #215 병합)
- 측정 조건: Production **`7a353de25`**(READY, #215 포함) · Xiaomi 24076RP19G 앱 1.2.6(40) · 계정 zxzx11(방장) · 방 「B2B TEST」 `72a97f0f` · 2026-11-13 04:25–04:45 PHT · WebView 디버거(실제 클래스·React 상태 직접 읽기) · 운영 DB 읽기 전용 조회
- iPhone: 직접 측정 못 함(iOS 시뮬 로그아웃, 운영 비밀번호 입력 금지). Samsung: 다른 세션이 logcat 사용 중이라 조작 안 함.

## 0. 내 잘못 · 정정 (먼저)

1. **PR #215 S4(대화상대 목록) 운영 FAIL** — 서랍은 `/members` 를 요청하지만(실측 `offset=0&limit=40` 200, 2명) 화면은 여전히 1명. 원인(§2 G1·G2)을 구현 전에 찾지 못하고 「서랍에서도 첫 페이지를 부르면 된다」로 설계했다. 계약 시험은 코드 문자열만 봐서 통과했다.
2. **그룹 사진 「저장 안 됨」 FAIL 판정 정정** — 11-12 21:28 PHT 시점 조회로 판정했으나, 운영 DB 상 Owner 가 **21:30:54 PHT 에 저장 성공**(`rooms.avatar_url` 설정 · 파일 `…/profile/b75232c3….webp` 200 · 19,692B). 「안 된다」의 실제 원인은 **홈 목록이 그룹 사진을 아예 내려주지 않는 것**(§2 G3) — 저장 단계가 아님.
3. 「멤버 초대」·「참가자」 화면 결함(G1·G2)은 감사 1·2차에서 확인하지 않았다.

## 1. PR #215 운영 결과 (Production `7a353de25`, Xiaomi 실측)

| 항목 | 측정 | 판정 |
|---|---|---|
| S1 상태바 간섭 | 서랍 컨테이너 padding-top 28px = `--safe-top` 28px, 패널 top 28.0px | PASS (Android) · iPhone NOT_PROVEN |
| S2 초대 링크 | 서랍 글자에 주소 0 · 재생성/비활성화 0 · 「초대 링크 복사」 1개 48px·15/600·r12 | PASS |
| S3 버튼 9개 | 48px·15/600·r12, 눌림 = 진해짐 + scale 0.98 | PASS |
| S3 목록 행 13개 | 눌림 = 배경 #f5f7f6 만(축소 없음) | PASS |
| S3 방 이름 입력 | 글자 **14px** (전역 입력 규칙) | FAIL → G10 |
| S4 대화상대 | 「대화상대 2」 · 행 1 | **FAIL** → G1·G2 |
| S5 역할 배지 | 「OWNER」 없음 · 「방장」 | PASS |
| 가입 요청 카드 | 표시됨 | PASS |

## 2. 원인별 결함 (모두 증거로 확정)

### G1. 방 시트들이 옛 화면 데이터(vm)를 읽음 — FAIL
- **증거 (React 상태 직접 읽기)**: 「멤버 초대」 시트 — `/api/community-messenger/friends` 200(친구 14명)인데 시트가 읽는 vm 은 `friends=0, friendsLoaded=false` → 「초대할 수 있는 친구가 없습니다」. 서랍 재열기 전에는 vm `pagedRoomMembers=[]`.
- **원인**: `components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx:315` — 시트·타임라인이 함께 쓰는 `view` 가 `useMemo` 이고 의존성은 성능 때문에 20개 필드로 고정(`room.snapshot`·`activeSheet`·`busy` …). `friends`·`friendsLoaded`·`inviteCandidates`·`sortedMembers`·`pagedRoomMembers`·`groupInviteLinkState` 등은 없음 → 바뀌어도 시트가 모름.
- **수정**: 시트 계층 전용 컨텍스트 `MessengerRoomPhase2SheetsViewProvider` 추가. 값 = 매 렌더의 `room`(+`snapshot` 단언). `CommunityMessengerRoomPhase2RoomSheets`·`CommunityMessengerRoomPhase2MemberActionModal` 만 이 컨텍스트를 읽음. 타임라인용 `view`(의존성 20개)는 그대로.
- **성능 근거**: 두 컴포넌트는 `memo` 가 아니고 `CommunityMessengerRoomClientPhase2Main` 안에서 props 없이 렌더(`Body.tsx:649-650`) → 지금도 Main 렌더마다 다시 그려짐. 새 컨텍스트로 추가 렌더 0, 타임라인 무효화 0.
- **영향 화면**: 모든 방(1:1·그룹·거래·주문)의 ⋮ 메뉴·참가자·초대·방 정보·미디어·파일·링크·검색 시트, 멤버 동작 팝업. 동작 변화 = 최신 값 표시뿐.

### G2. 방 진입 「첫 패스」 표시가 매 렌더마다 다시 켜짐 — FAIL
- **증거**: 서랍 재열기 후 vm 이 새로 계산됐는데(`pagedRoomMembers=[q테스트1]`) `sortedMembers=[zxzx11]` 만. `roomMembersDisplay` 는 `phase1EntryLightPass` 가 참일 때만 부트스트랩 멤버만 반환(`use-messenger-room-client-phase1.ts:1695`) → 렌더 시점에 표시가 참.
- **원인 (코드 확정)**:
  - `components/community-messenger/CommunityMessengerRoomClientInner.tsx:61` — `beginCmRoomEntryShellFirstPass(roomId)` 를 **렌더 본문에서 매번** 호출.
  - 끄는 곳(`noteCmRoomEntryShellFirstPaint`)은 방당 1회(`cm-room-layout-shell-client-bridge.ts:26` 1회 가드 · `CommunityMessengerRoomEntryEmpty.tsx:51` 레이아웃 효과).
  - 끄면 phase1 훅이 구독(`use-messenger-room-client-phase1.ts:276`)으로 다시 렌더 → Inner 렌더 본문이 다시 켬. 거래 쪽 표시(`isTradePhase1EntryLightPass`)는 첫 훅 실행 끝에 `finalize` 되어 계속 켜질 수 없음 → 남는 원인은 이 표시뿐.
  - 2026-06-13 저장소 첫 반영부터 있던 구조.
- **이 표시가 켜져 있으면 막히는 것 (같은 파일)**: 멤버 목록 보강(1695) · 초대 후보 3종 빈 목록(1776-1793) · 그룹 관리자 수 0(1927) · 가명 수 0(1938) · 멤버 정렬 생략(1949) · 주문 채팅 표시 정리 생략(1826 `finalizeStoreOrderChatDisplayMessages`) · 실시간 포커스·로컬 안 읽음 정리(412) · 실시간 메시지 합치기(445·438) · 실시간 시드(511) · 활성 실시간 방 지정(524). 효과들은 의존성 `phase1EntryLightPass` 가 계속 `true` 라 다시 실행되지 않음.
- **운영 데이터**: 비공개 그룹에 생성 후 추가로 들어온 멤버 **최근 60일 0건**(`participants.joined_at > rooms.created_at + 1분`).
- **수정 (PR B 구현)**: `useCmRoomEntryShellFirstPassForRoom(roomId)` 훅(`cm-room-entry-shell-first-pass.ts`) — 마운트 첫 렌더(또는 같은 마운트에서 방 id 가 바뀐 렌더)에 1회만 `begin`(이전 props 를 state 로 두는 React 권장 패턴 · ref 를 렌더 중 읽지 않음), 첫 커밋 직후 `useLayoutEffect([roomId])` 에서 그 방 표시를 끈다(`noteCmRoomEntryShellFirstPaint` — 지표는 `…Once`). Inner 는 이 훅만 호출. 첫 패스 = 첫 렌더 1회라는 원래 뜻 그대로.
- **영향 (모든 방)**: 위 막힌 동작이 첫 커밋 후부터 정상 동작 — 실시간 포커스·안 읽음 정리·실시간 합치기·주문 채팅 표시 정리 등. **메신저 진입 핫패스 변경** → 성능 검증 필수(§4).
- **표시가 막는 실시간 동작의 화면 영향 (코드 확정 · 실기 측정 안 함)**: 포커스 방 미설정 → `use-community-messenger-realtime.ts:421-429` 의 「보고 있는 방 + 화면 앞 → 낙관 bump·알림음·허브 재동기화 생략」이 적용되지 않음. 활성 방 미설정 → `messenger-realtime-store.ts:127-130` 「보고 있는 방이면 읽음 처리」 판정이 거짓. 지금 사용자가 이를 겪는지(다른 경로가 보완하는지)는 2기기 실측 전까지 NOT_PROVEN — PR B 검증 ⑤에서 전후 측정.
- **통화**: 바뀌는 파일·효과는 메신저 실시간 저장소(`messenger-realtime-store.ts`)·phase1 훅뿐이고 통화 세션·CallKit·푸시·통화 화면 코드는 변경 없음(`setActiveMessengerRealtimeRoom` 호출처 = phase1 훅 1곳, 읽는 곳 = 실시간 저장소 판정뿐 — `git grep` 전수).

### G3. 홈 목록에 그룹 사진이 나오지 않음 — FAIL (「그룹방 사진 안 됨」의 실제 원인)
- **증거 (운영 DB)**: BK 계정 홈 스냅샷(`community_messenger_home_sync_snapshots`, critical, 갱신 2026-11-13 04:38 PHT — 사진 저장 7시간 뒤)의 방 `8d01f7c7` 항목에 **`avatar_url` 필드 없음**. 운영 함수 `get_community_messenger_home_sync_snapshot(p_user_id, p_limit)` 정의에 `avatar_url` 0회.
- **원인 2곳**: ① DB 함수가 방 사진을 내려주지 않음 ② `lib/community-messenger/home-sync-snapshot-assemble.ts:94` 파서가 방 `avatar_url: null` 고정. 홈 critical 은 항상 스냅샷 사용(`service.ts:4822-4838`), 그룹 행은 방 사진만 씀(`service.ts:2786` GROUP HARD LOCK).
- **수정**: 마이그레이션 — 함수 방 객체에 `avatar_url` 추가(기존 마지막 정의 `20261118123700_home_sync_snapshot_store_order_store_name.sql` 위에 같은 본문 + 1필드). 파서 `avatar_url: (r.avatar_url as string|null) ?? null`. **운영 DB 적용은 Owner 승인 후**(개발 프로세스 2번). 스냅샷 행은 TTL 5초라 적용 후 다음 요청부터 반영(옛 행 채우기 불필요).
- **영향**: 홈 목록 그룹·오픈그룹 행 사진. 1:1 행은 방 사진 없음 → 기존대로 상대 사진.

### G4. 방 안에 있는 다른 멤버의 머리글이 안 바뀜 — FAIL (코드 확정)
- **원인**: 열린 방은 rooms UPDATE 때 silent 갱신을 받지만(`global-messenger-room-bundle-channel.ts:425-434`), 병합 `lib/community-messenger/room/merge-community-messenger-silent-delta.ts:11-47` 이 `...prev.room` 에 unread·last* 만 덮음. 서버 응답에는 `title`·`avatarUrl` 이 있음(`load-community-messenger-room-silent-delta.ts:156-159`).
- **수정**: 병합에서 그룹·오픈그룹 방이면 `title`·`avatarUrl` 도 delta 값으로.
- **영향**: 열린 그룹 방 머리글(`CommunityMessengerRoomPhase2Header.tsx:404-442`). 1:1 은 변화 없음(조건).

### G5. 사진·이름 저장 후 다른 멤버 홈 목록에 실시간 반영 없음 — FAIL (코드 확정)
- **원인**: `updateGroupRoomProfile` 이 아무것도 발행하지 않음. 홈 실시간은 rooms UPDATE 중 tip 외 변경을 무시(`community-messenger-home-realtime-channels.ts:399`). 반영은 화면 복귀(4.2초 뒤 확인)·홈 재진입(10초 이상 지났을 때) 때만.
- **수정**: 저장 성공 후 활성 멤버마다 `publishHomeListRoomInsertToUser`(`home-list-room-insert-broadcast-server.ts:14`, 받는 사람 기준 요약 → `insert_room_summary` 로 행 교체·안 읽음 증가 없음) + `invalidateHomeSyncSnapshotCache(uid)`. `publishGroupRoomListBump` 는 쓰지 않음 — 멤버마다 `upsert_notification_target_unread`·`message_created` 알림 엔진이 돌아 사진만 바꿔도 안 읽음이 생김.
- **영향**: 그룹 멤버 홈 행. 알림·안 읽음 변화 없음.

### G6. 그룹 사진 올리기 실패 처리 — FAIL (코드 확정 · 실제 실패 사례는 없음)
- 11-12 Owner 업로드는 성공(§0-2). 그래도 확정된 불일치 3개:
  - 선택 창 `accept` 에 gif 포함 ↔ 서버 JPEG/PNG/WebP 만(`app/api/me/profile/avatar/route.ts:12`) → 400.
  - 클라이언트 축소 없음 ↔ 서버 3MB(`:11`) → 413.
  - 실패 시 서버 사유를 버리고 일반 문구(`use-messenger-room-phase2-controller.ts` `uploadPrivateGroupAvatar`).
- **수정**: `accept` = jpeg·png·webp. 올리기 전 `prepareCommunityImageForUpload`(`lib/philife/client-image-resize.ts`)에 「건너뛰는 크기」 인자를 추가해 3MB 기준으로 축소(긴 변 2560, JPEG 0.92 — 이미 쓰는 값). 축소 후에도 3MB 초과·형식 불일치는 업로드 전에 새 키로 안내: `cm_ui_group_photo_too_large`(「사진 용량이 3MB를 넘어 올릴 수 없습니다.」/「This photo is over 3MB.」) · `cm_ui_group_photo_type_only`(「JPG·PNG·WEBP 사진만 올릴 수 있습니다.」/「Only JPG, PNG or WEBP photos.」).
- **영향**: 그룹 사진 올리기 1곳. 회원 프로필 사진(`ProfileImageField`)은 같은 서버 경로지만 이번 범위 아님 — 바꾸지 않음.

### G7. 그룹 프로필 저장 검증 없음 — FAIL (코드 확정)
- `group-room-profile-policy.ts:28-34`: 주소를 아무 값이나 저장(운영에 `https://samarket.vercel.app/favicon.ico` 3건 — 09-07 시험 데이터), 방장·관리자는 빈 제목 저장 가능.
- **수정**: 주소 = null · 현재 값 · `isOwnProfileAvatarPublicUrl(편집자 id, url, 저장소 origin)`(`lib/profile/member-avatar-url-policy.ts`, 회원 사진과 같은 규칙)만 허용. 빈 제목은 역할과 무관하게 거부. 옛 데이터는 채우지 않음.

### G8. 멤버 사진 처리가 화면마다 다름 — FAIL (코드 확정)
- 서랍 대화상대: `startsWith("http")` 만 검사(카카오 기본 이미지·http 그대로). 말풍선은 `resolveUserAvatarImageSrc` 사용.
- 「참가자」 시트: 사진 없음.
- **수정**: 둘 다 `resolveUserAvatarImageSrc` + 같은 40px 원형 썸네일.

### G9. 서랍 그룹 사진 대체 표시 · 중복 노출 — FAIL (계약 위반)
- 계약 `components/community-messenger/domain-shell-canary/GroupDomainAvatar.tsx:7-8` 「group image URL or group-only placeholder. Never … title-initial letter」. 목록·머리글은 지키는데 서랍 2곳(설정 카드 56px, 방 정보 72px)은 제목 첫 글자.
- **수정 (정함)**:
  - 서랍 사진 2곳 → `GroupDomainAvatar`.
  - 중복 제거 — 같은 서랍에서 같은 동작이 두 번 나오는 것만:
    - 설정 카드의 「이 채팅방 알림 끄기」 버튼 제거(아래 행이 켜짐/꺼짐 상태와 함께 이미 있음).
    - 설정 카드의 「참가자」 버튼 제거(「참여자 및 초대 · 전체 보기」 와 같은 시트).
    - 설정 카드 56px 사진 제거 → 사진 변경 버튼은 방 정보 72px 사진 아래로(사진 1곳).
  - 그 밖은 그대로.
  - 시안을 같은 방식(앱 원본 CSS)으로 다시 만들어 함께 승인받는다.

### G10. 팝업 입력 글자 14px (Android) — FAIL
- **증거**: 방 이름 입력 14px(운영 실측). `app/globals.css:257-264` 전역 입력 규칙(층 밖) 제외 목록에 `.dibay-overlay-input` 없음. iOS 는 `@supports(-webkit-touch-callout)` 16px !important 로 이미 16px.
- **수정**: 제외 목록에 `:not(.dibay-overlay-input)`.
- **영향**: `OverlayUi.input` 17개 파일 25곳 — Android 에서 14→16px(기준값). iOS 변화 없음.

### G11. 그룹 생성 응답이 애매하면 같은 방이 또 생김 — FAIL (코드 확정 · 운영 발생 0건)
- 서버 `group-room-service.ts:229-238` 가 방·참여자·초대 알림 저장 뒤 요약 읽기 실패 시 `ok:false`+`roomId` 를 400 으로(`groups/create/route.ts:62,77`). 화면 `CommunityMessengerHome.tsx:1936·2029` 는 일반 오류 → 다시 누르면 새 방.
- 운영: 같은 방장·같은 멤버 그룹이 30초 안에 2개 생긴 사례 0건(09-07 시험 계정 47초 이상 간격 반복 생성만).
- **수정**: 서버 = 이미 만들어진 경우 200 `{ok:true, roomId, room:null}`. 화면 `ok && roomId && !room` 분기 = 오류 대신 그 방으로 이동 + 홈 목록 재정합 요청. 비공개·오픈 그룹 생성 2곳.

### G12. 화면이 안 쓰는 초대 링크 쓰기 API — FAIL (권한 구멍 포함)
- #215 이후 화면 호출 0: `POST …/regenerate-link` · `DELETE …/invite-link` · `GET/POST …/invite-links` · `PATCH/DELETE …/invite-links/[linkId]`. `regenerate-link` 는 초대 권한만 확인해 일반 멤버가 기본 링크를 무효화할 수 있음(`group-room-invite-link-service.ts:215-245`).
- **수정**: 위 라우트 삭제 + 서비스 함수(`regenerateGroupInviteLink`·`disableGroupInviteLink`·`createGroupInviteLink`(생성 API 전용 부분)·`revokeGroupInviteLink`·`listGroupInviteLinks`) 중 남은 호출처 없는 것 삭제. 함께 정리: `lib/auth/__fixtures__/member-p0-mutation-classification.csv` 76-79·86행, `lib/i18n/quality/i18n-quality-baseline.json` 해당 4줄, `scripts/qa/group-chat-p1-adb-qa.mjs:266`.
- **유지**: `GET …/invite-link`(복사 버튼) · `…/join-requests`(기존 승인제 링크 10개·대기 8건 처리) · `/group/[token]` 입장.

## 3. 결함 아님 (근거)
- 홈 목록 상한 30(`home-sync-room-caps.ts`): 실측 목록이 4월 방까지 표시(전체 목록 경로 별도) — 결함 아님.
- 「Permissions updated」·「9:55 PM」: 11-12 설계안 §4 그대로(옛 데이터 · 시계 계약).
- 글꼴: 서랍 요소 전부 Pretendard 웹폰트 렌더(Android). iPhone NOT_PROVEN.

## 4. 반영 단위 · 순서 · 검증

| 순서 | PR | 항목 | 구분 | 성능 검증 |
|---|---|---|---|---|
| 1 | B | G1 · G2 | 웹 (메신저 진입 핫패스) | **필수** |
| 2 | C | G3(마이그레이션) · G4 · G5 · G6 · G7 | 웹 + **DB(Owner 승인 후 적용)** | 홈 목록 응답 크기 |
| 3 | D | G8 · G9 · G10 | 웹 (G10 전역 CSS) | — |
| 4 | E | G11 | 웹 | — |
| 5 | F | G12 | 웹 (API 삭제) | — |

- 모든 PR: 로컬 `typecheck:build`·`typecheck:test`·관련 vitest·eslint·`check:i18n-quality`, 계약 시험(문자열이 아니라 **동작**: G1 = 시트가 친구 목록 변경을 받는 렌더 시험, G2 = 두 번째 렌더에서 표시 꺼짐 시험).
- **PR B 실기 (Production SHA 기록)**: Xiaomi 디버거 — ① 「대화상대 N」 = 행 N ② 「멤버 초대」 친구 수 = `/friends` 수 − 기존 멤버 ③ 「참가자」 시트 N명 ④ 1:1·그룹·거래·주문 방 진입 지표(`messenger_room_entry` 기록값) 변경 전후 각 5회 비교 ⑤ 방 안에서 상대 메시지 실시간 수신·홈 안 읽음 증가 없음. iPhone 은 Owner 기기 확인.
- **PR C 실기**: 운영 DB 적용 결과 확인(함수 정의에 `avatar_url`) → 사진 있는 그룹 홈 행 표시. 다른 멤버 목록·열린 방 머리글 반영은 두 번째 기기가 필요 — Samsung 사용 가능할 때(다른 세션 종료 확인 후) 측정.
- 롤백: PR revert 또는 Vercel Instant Rollback. DB 함수는 이전 정의로 되돌리는 마이그레이션.

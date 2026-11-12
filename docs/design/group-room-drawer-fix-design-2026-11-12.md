# 그룹 채팅방 ⋮ 서랍 결함 수정 설계안 (2026-11-12)

- 상태: **설계안 — Owner 승인 전 구현 금지**
- 시안: [`group-room-drawer-audit-2026-11-12.html`](group-room-drawer-audit-2026-11-12.html) (실기 캡처 · 앱 원본 CSS 기준 시안 · 눌림 비교 · 측정표)
- 배포 구분(예상): **웹만** — `android/`·`ios/` 변경 없음 → main 반영 후 앱 재시작. DB 변경 없음.

## 0. 근거

### 0-1. Owner 지시 원문 (2026-11-12)
- 「그룹방 생성후 방설정 부분이 기기의 상단에 가려지는 문제. 프로필들 그룹방 사진등 안된 등의 문제가 있다」
- 「url 은 복사 붙여 넣기만 하는 부분이다, ui ux cta ssot 되는 버튼 눌림등 시안을 다시보고 해라」
- 「기기의 상단 기기별 네비게이션 부분에 간섭이 있으면 안되는 부분이다」
- 「초대 링크 부분은 복사 하기만있으면 되는 부분이다, url 다보여줄 필요성이 없다」

### 0-2. 계약
- 팝업·버튼 단일 기준 `docs/ui/dibay-overlay-inventory.md` §1: 버튼 48 · 반경 12 · 15/600, 눌림 = 버튼형 「진해짐 + 0.98」/ 목록 행형 「배경만」, 비활성 = 회색(opacity 금지), 색 = `--overlay-*`.
- §5: 「자체 `fixed inset-0` 루트를 새로 만들지 않는다」「팝업 안 `Sam.btn`·직접 bg 버튼 금지」.
- 모임 방 하드락 `docs/dibay-messenger-domain-group-hard-lock.md` §(M3): 모임 방 설정 시트에서 초대 링크 관리 숨김 — 지금도 `canEditPrivateGroupMeta`·`canInviteMembers` 가 `!isMoimRoom` 으로 막혀 있음(유지).
- 언어 SSOT `docs/i18n-ssot.md`: 새 문구는 새 키, 기존 키 값 변경 금지(`dibay-overlay-inventory.md` §5-5).
- 통화 코드 손대지 않음 (Owner 11-12) — 서랍 안 그룹 음성·영상 통화 버튼은 이번 범위 밖.

### 0-3. 실기 측정 (근거 데이터)
Xiaomi 24076RP19G · 앱 1.2.6(40) · Production · zxzx11(방장) · 「B2B TEST」 · 21:43–21:47 PHT · WebView 디버거(실제 클래스 계산값·`CSS.getPlatformFontsForNode`·`:active` 강제). 요소 30개 측정값은 시안 측정표. iPhone 은 Owner 캡처(1.2.1 (32))만 — 직접 측정 NOT_PROVEN.

## 1. 수정 항목 (원인별 · 한 원인 = 한 항목)

### S1. 서랍이 기기 상단(상태바) 영역에 들어감 — FAIL
- **증거**: 패널 `top 0`, `padding-top 16px`, `--safe-top` 28px(Android 실측). 스크롤 시 내용이 상태바 아이콘 밑으로 지나감(캡처 ③). iPhone 에서 「채팅방 / 닫기」 가려짐(Owner 캡처 ①).
- **원인**: `CommunityMessengerRoomPhase2RoomSheets.tsx:127-145` 그룹 서랍 분기 — 바깥 `fixed inset-0 … flex justify-end`, 패널 `h-full p-4 pb-[max(1rem,var(--safe-bottom))]`. 위쪽 safe 처리가 없음.
- **수정**: 그룹 서랍 분기의 **바깥 컨테이너**에 `pt-[var(--safe-top)]` 추가 → 패널(h-full)은 상태바 아래에서 시작하고 그 아래로만 스크롤. 배경 딤(`dibay-overlay-backdrop`, `position:absolute; inset:0`)은 지금처럼 전체를 덮음(다른 시트와 같음).
- **영향 화면**: `isGroupMenuDrawer = activeSheet==="menu" && isGroupRoom` → 비공개 그룹·오픈 그룹·모임 방 서랍 3종 모두 같은 분기(같이 고쳐짐). 1:1 메뉴·첨부·이모지 등 아래 시트는 다른 분기라 변화 없음.
- **깨질 수 있는 것**: 통화 중 상단 바 표시 때 `--safe-top` 에 `--dibay-call-bar-h` 가 더해짐(`app-shell.css:62`) → 서랍도 통화 바 아래에서 시작(의도와 같음). 분할 화면(태블릿) — 서랍은 `fixed` 라 동일 적용.
- **시험**: 계약 시험에 「그룹 서랍 분기에 `--safe-top` 상단 처리」 추가.

### S2. 초대 링크 영역 = 「초대 링크 복사」 버튼 1개 — FAIL (Owner 지시)
- **현재**: `GroupInviteLinkSection.tsx` 가 ① 주소 표시 + 복사·링크 재생성·링크 비활성화·새 링크 만들기(4개) ② 새 링크 입력 폼 ③ 「초대 링크 / 기본 링크」 목록(같은 주소 반복, 복사·링크 폐기) ④ 가입 요청 카드 를 그림.
- **수정**:
  - ①②③ 제거. 서랍 설정 카드 안에 `OverlayUi.btn.secondary` 버튼 1개 「초대 링크 복사」(새 키 `cm_ui_group_invite_copy_link` ko「초대 링크 복사」·en「Copy invite link」) → 기존 `vm.copyGroupInviteLink()` 그대로 호출(클립보드 + 성공/실패 스낵바 기존 동작).
  - 버튼 표시 조건 = `vm.canInviteMembers` (= `canInviteToGroup`, 서버 GET `/invite-link` 허용 조건과 같은 함수 — `group-room-permissions.ts:75`). 주소를 아직 못 받았으면 비활성(회색).
  - `useGroupRoomInviteLink` 활성 조건을 `isPrivateGroupRoom && snapshot` → `canInviteMembers` 로 좁힘(초대 권한 없는 멤버가 403 받는 요청 제거).
  - ④ 가입 요청 카드는 **유지** — 운영 DB 조회(11-12): 승인제 링크 활성 10개·대기 가입 요청 8건 존재. 버튼만 S3 기준으로.
- **영향**: 초대 주소를 보여 주던 곳은 이 컴포넌트 1곳뿐(`git grep` 전수, 모임 `MoimManageInvite` 는 모임 도메인 — 범위 밖). 모임 방은 지금처럼 숨김.
- **남는 서버 경로**: `POST regenerate-link`·`DELETE invite-link`·`POST/DELETE invite-links` 는 화면 호출이 0이 됨. 이번에는 **서버 API 를 지우지 않는다**(화면만 정리 · 지울지는 §3 Owner 결정). 컨트롤러의 `regenerateGroupInviteLink`·`disableGroupInviteLink` 는 호출처가 없어지므로 같은 단계에서 제거.
- **알려진 서버 동작(변경 없음)**: GET `/invite-link` 는 활성 링크가 없으면 기본 링크를 만든다(`ensureRoomInviteToken`) → 복사 버튼은 항상 쓸 수 있는 주소를 받음.

### S3. 서랍 버튼·행이 눌림·크기·색 기준과 다름 — FAIL
측정값 → 바꿀 부품 (모두 `OverlayUi`/`dibay-overlay.css` 기존 클래스만 사용, 새 값 없음):

| 요소 (현재 측정) | 바꿀 부품 |
|---|---|
| 사진 (갤러리) — `label` 44px·14/600·축소 없음·업로드 중 비활성 모양 없음 | `button` + `OverlayUi.btn.secondary`, 숨긴 `input[type=file]` 을 ref 로 열기, `busy==="private-group-avatar"` 면 `disabled` |
| 참가자·멤버 초대·알림 끄기 — 14/600·왼쪽 정렬·축소 없음 | `OverlayUi.btn.secondary` |
| 사진/동영상·파일·링크·방 정보 행 — 눌림 rgb(255,252,252)(흰 바탕과 구분 안 됨) | `dibay-overlay-menu` / `__item` / `__label` / `__hint` |
| 공지·대화 내 검색 카드 — 공지 눌림이 오히려 밝아짐 | 같은 메뉴 그룹의 `__item` 2줄 (시안과 같음) |
| 대화상대 행·「전체 보기」 | `__item` / `OverlayUi.textAction` |
| 운영 이력 행 — 눌림 변화 없음 | `__item` (+ `__hint`) |
| 알림 끄기·보관 행 — 행인데 0.98 축소 | `__item` (배경만) |
| 나가기·그룹 삭제·신고 — 반경 4·Tailwind red·축소 | `__item--danger` (`--overlay-danger`) |
| 가입 요청 승인·거절 — `#006241`·40px·opacity-40 | `OverlayUi.btn.primary` / `OverlayUi.btn.secondaryDanger` |
| 차단 해제 — 40px·opacity-40 (`GroupBlockedMembersSection.tsx:100`) | `OverlayUi.btn.secondary` |
| 역할 배지 색 `#006241`/`#00754A` (`GroupMemberRoleBadge.tsx`) | `--overlay-primary` (호출처 = `RoomSheets.tsx` 1파일 — 서랍 대화상대 620행 · 참가자 시트 819-823행, 둘 다 같이 바뀜) |

- **그대로 두는 것**: 「방 설정 저장」(PASS)·「닫기」(PASS)·그룹 통화 버튼 2개(통화 규정)·`ROOM_SHEET_ROW_PRESS_CLASS` 를 쓰는 서랍 밖 시트.
- **같은 기능의 다른 화면**: 서랍에서 여는 「방 정보」 시트(`activeSheet==="info"`, 902-1480행)에도 `disabled:opacity-40` 5곳·직접 클래스 버튼이 있음. **실기 측정을 아직 안 함** → 구현 첫 단계에서 같은 방법(Xiaomi 디버거)으로 측정 후 같은 표 방식으로 적용(측정 없이 바꾸지 않음).
- **시험**: 계약 시험 — 그룹 서랍 범위 안에 `disabled:opacity-`·`#006241`·`rounded-ui-rect` 직접 버튼이 0개, 버튼은 `dibay-overlay-btn`, 행은 `dibay-overlay-menu__item`.

### S4. 「대화상대 2」인데 목록 1명 — FAIL
- **증거**: 서버 `/rooms/{id}` 응답 2명, 부트스트랩 응답 `members` 1명(`membersDeferred`), 서랍 DOM 1행.
- **원인**: `use-messenger-room-client-phase1.ts:1756-1765` — 지연된 멤버 첫 페이지를 `activeSheet === "members"` 일 때만 불러옴. 서랍(`"menu"`)은 부트스트랩 일부 목록을 그대로 그림(`RoomSheets.tsx:569` `sortedMembers.slice(0,12)`).
- **수정**: 같은 effect 조건을 `activeSheet === "members" || (activeSheet === "menu" && isGroupRoom)` 로. 첫 페이지 1회만(`membersListNextOffset` 가 이미 다음 값이면 다시 부르지 않음 — 기존 로직).
- **영향**: 그룹 서랍을 처음 열 때 `/members?offset=0&limit=40` 1회 추가. 방 진입 첫 화면(부트스트랩 핫 경로)은 변화 없음.

### S5. 역할 배지 「OWNER」·「ADMIN」 영어 — FAIL
- **원인**: 카탈로그 ko 값이 영어(`community-messenger-ui.ts:245-246`).
- **수정 (구현 시 정정)**: 새 키를 만들지 않고 그룹 화면이 **이미 쓰는 키**를 사용 — 방장 `nav_messenger_owner_label`(「방장」/「Owner」), 관리자 `cm_ui_admin`(「관리자」/「Admin」, 같은 시트의 「관리자 초대 허용」 등과 같은 단어). 새 문구를 만들지 않으므로 §3-5 결정 불필요. `uppercase` 클래스 제거. 기존 `cm_ui_group_role_*_badge` 키 값은 바꾸지 않음(§5-5).

### S6. 팝업 입력 글자 14px (Android) — FAIL · 별도 PR
- **증거**: 방 이름 입력 계산값 14px. 매칭 규칙: `app/globals.css:257-264` 전역 입력 규칙(층 밖)이 `.dibay-overlay-input`(16px)을 덮음. 제외 목록에 `.dibay-overlay-input` 없음.
- **수정**: 제외 목록에 `:not(.dibay-overlay-input)` 추가.
- **영향**: 앱 전체 `OverlayUi.input` 을 쓰는 모든 팝업 입력이 Android 에서 16px 로(기준값). iOS 는 이미 16px. **전역 CSS 라 그룹 서랍과 분리한 PR** — 호출처 전수표·화면 측정 후 반영.

### S7. 그룹 사진이 저장되지 않음 — FAIL · 원인 미확정
- **증거**: 운영 DB `8d01f7c7…` `avatar_url = null`, 21:00 PHT 이후 방장 업로드 파일 0건.
- **확정 안 된 것**: 선택 창이 안 열렸는지 / 3MB 초과 413 인지 / 형식 거부인지 — NOT_PROVEN.
- **코드에서 확인된 문제**: `accept` 에 gif(서버 거부) · 클라이언트 축소 없음 + 서버 3MB 한도 · 서버 오류 문구 버림(`controller:2432`).
- **진행 방식**: 수정 전 **R0 재현** — 시험 방(「B2B TEST」, zxzx11 방장)에서 Xiaomi 로 실제 휴대폰 사진 업로드 1회, 요청 상태코드·응답·저장소 파일 확인. 운영 쓰기(시험 방 사진 변경)이므로 **실행 전 Owner 승인**(작업 규정 8). 원인 확정 후 원인 1개만 고치는 설계를 따로 올림.

### S8. 그룹 생성 응답이 애매할 때 같은 방이 또 생김 — 코드 확인 · 별도 PR
- 서버 `group-room-service.ts:229-238` 은 방·참여자 저장 후 요약을 못 읽으면 `ok:false` + `roomId` 를 돌려줌. 화면 `CommunityMessengerHome.tsx:1936` 조건은 이 응답에 맞지 않아 일반 실패 → 다시 누르면 새 방.
- 실기 재현 기록 없음 — 운영에서 이 응답이 실제로 나온 건수는 확인 못 함. 이번 서랍 PR 과 원인이 달라 분리.

## 2. 반영 단위

| PR | 항목 | 비고 |
|---|---|---|
| A | S1 · S2 · S3 · S4 · S5 | 같은 화면(그룹 서랍)·같은 지시. 웹만. |
| B | S6 | 전역 CSS — 호출처 전수 측정 후 |
| C | S7 | R0 재현(Owner 승인) → 원인 확정 → 설계 |
| D | S8 | 별도 |

PR A 바뀌는 파일: `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx` · `components/community-messenger/group/GroupInviteLinkSection.tsx` · `components/community-messenger/group/GroupBlockedMembersSection.tsx` · `components/community-messenger/group/GroupMemberRoleBadge.tsx` · `lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts` · `lib/community-messenger/room/use-messenger-room-client-phase1.ts` · `lib/i18n/catalog/community-messenger-ui.ts` · 계약 시험 1개.

## 3. Owner 결정 필요 (정하지 않고 비워 둠)
1. **중복 노출** — 알림 끄기 2곳 · 그룹 사진/이름 2곳 · 참여자 진입 3곳. 시안은 지금대로 둠.
2. **그룹 아바타 표시** — 목록·헤더는 사람 아이콘, 서랍은 제목 첫 글자. 어느 쪽으로 통일할지.
3. **승인제 초대 링크** — 새로 만드는 화면이 S2 로 없어짐. 기존 활성 10개·대기 8건은 승인 카드로 처리 가능. 승인제 자체를 계속 둘지.
4. **화면 호출이 없어지는 서버 API**(재생성·비활성화·링크 목록 생성/폐기) 삭제 여부.
5. ~~역할 배지 「관리자」 문구~~ — 구현 시 기존 키 `cm_ui_admin` 사용으로 해소.

## 4. 결함이 아닌 것으로 판정한 것 (근거)
- 운영 이력 「Permissions updated」: 2026-11-05 저장된 옛 시스템 메시지(B3 언어 저장 방식 `cd0996f9c` 11-08 이전). 이후 새 메시지는 `metadata.message_key` 로 보는 사람 언어 표시(11-12 그룹 생성 메시지 2건 키 저장 확인). 옛 데이터는 채우지 않음(Owner 기준).
- 운영 이력 시각 「9:55 PM」: 메신저 시계 SSOT `lib/community-messenger/messenger-clock-time.ts` 가 en-US AM/PM 고정(계약).
- 글꼴: 서랍 30개 요소 모두 Pretendard 웹폰트로 렌더(Android 실측). iPhone NOT_PROVEN.

## 5. 검증 (PR A)
- 로컬 1회: `npm run typecheck:build` · 관련 vitest(그룹 서랍 계약·초대 링크·멤버 페이지) · 변경 파일 eslint · `npm run check:i18n-quality` · `npm run typecheck:test`.
- 실기 (Production SHA 기록): Xiaomi 디버거로 같은 30개 요소 재측정(서랍 top ≥ `--safe-top`, 스크롤 시 상태바 영역 내용 0, 버튼 48·15/600·r12·눌림, 행 눌림 #f5f7f6, 「대화상대 N」= 행 N, 배지 한국어, 주소 텍스트 0, 복사 → 클립보드 값 = 서버 주소) · Samsung 캡처 픽셀 대조 · iPhone 은 Owner 기기 확인 전까지 NOT_PROVEN.
- 롤백: PR revert 또는 Vercel Instant Rollback(개발 프로세스 2번).

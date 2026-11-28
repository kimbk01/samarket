# 모임 감사 6번 묶음 설계안 — 모임 사진 보존(신규) + 모임 화면·디자인 (2026-11-28)

- **근거**
  - 감사 `docs/audit/moim-full-audit-2026-11-27.md`: B11, D3, D5, E7, F1~F12, §3 권장안 「버튼·메뉴」 줄
  - 6-A 는 이번 사실 확인에서 **새로 찾은 결함**이다.
- **계약**
  - `docs/moim-ssot.md` → 설계 v1(`docs/design/moim/moim-design-v1-2026-11-12.md`) §9, P1, P5
  - 승인 시안 `docs/design/moim/moim-mockup-2026-11-12.html` U4·U5·U7
  - UI 토큰 규칙(AGENTS.md 「UI 토큰」)
- **상태:** 설계안이며 아직 구현·DB 변경은 없다. 승인 뒤 구현한다.
- **반영 단위:** 서로 다른 일이라 **PR 2개**로 나눈다(도메인·위험이 다르다).
  - **6-A** 모임 사진 보존: DB 함수 1개를 바꾼다. 순서는 운영 DB 적용 → 「병합」이다.
  - **6-B** 모임 화면·디자인: 웹 코드만 바꾼다. DB 변경은 없다.
  - 둘 다 자동 병합은 등록하지 않는다.
- **[배포 구분]** 웹만 (둘 다).
- 사실 확인 기준: main `373e1f706`(4번 묶음 포함), 운영 DB 읽기 전용(2026-11-28).

---

## 6-A · 모임 사진이 72시간 뒤 지워질 수 있음 (신규 · P1 데이터 손실)

| 사실 | 근거 |
|---|---|
| 모임 사진(대표·글·일정·앨범·멤버 프로필)은 커뮤니티 업로드를 쓴다. 저장 위치는 `post-images` 버킷 `{uid}/community/{uuid}.{ext}` 이다 | `components/moim/use-moim-image-upload.ts:24` → `/api/philife/upload-image` → `app/api/community/upload-image/route.ts:65` |
| 매일 도는 정리 작업은 72시간이 지났고 「어디에서도 쓰지 않는」 위 경로 파일을 지운다 | `app/api/cron/community-post-images-gc/route.ts`(vercel.json:109), 운영 `community_post_image_gc_candidates` |
| 「쓰는 곳」 목록(운영 `community_post_image_unreferenced_excluding_posts`, 표 52곳)에 **모임 표가 하나도 없다** | 운영 정의 조회: `moims`·`moim_posts`·`moim_schedules`·`moim_album_items`·`moim_members` 없음 (함수 4개 모두 `moim` 미포함) |
| 그래서 모임 글·일정·앨범에 올린 사진은 72시간 뒤 정리 작업이 지운다 | 위 두 정의 |
| 대표 사진은 만들 때 메신저 방 `avatar_url` 로도 복사돼 지금은 우연히 남는다. 모임 정보에서 대표 사진을 바꾸면 그렇지 않을 수 있다 | m2 `moim_create` 방 아바타 복사 |
| 운영 데이터: 모임 글·일정·앨범 사진 0장, 대표 사진 1장(파일 있음), 멤버 프로필 사진 5장(4장 `post-images`·커뮤니티 경로 0장, 파일 모두 있음). **아직 지워진 사진은 없다** | 운영 조회 2026-11-28 |

- **바꿀 것:** 「쓰는 곳」 함수에 모임 열 6개를 추가한다.
  - `moims.cover_image_url`, `moim_posts.images`, `moim_schedules.images`, `moim_album_items.url`, `moim_members.avatar_url`, `moim_member_profile_history.avatar_url`
  - 그 밖의 줄은 **운영 정의 그대로** 둔다. 적용 전 운영 정의를 백업하고 md5 로 대조한다.
- **영향**
  - 정리 작업과 업로드 취소(`discard`) 둘 다 이 함수를 쓴다. 따라서 모임 사진은 둘 다에서 지워지지 않는다(의도).
  - 표 6개 읽기가 늘어난다. 모임 표는 지금 행이 적다. 하루 1회 작업이다.
- **검증**
  - 로컬 Postgres 에서 수정 전 모임 글 사진이 「안 씀」으로 나오는지, 수정 후 「씀」으로 나오는지 본다.
  - 다른 표의 결과가 그대로인지 본다.
- **롤백:** 백업 정의로 되돌린다.

---

## 6-B · 모임 화면·디자인

### 버튼 체계 (§3 권장안 그대로 · F1~F4·F6 공통)
- 버튼 역할은 `moimCls`(`components/moim/moim-ui.tsx`) 한 곳에서만 정한다. 모임 화면은 `Sam.btn.*` 을 직접 쓰지 않는다.
  - **기본** `btnPrimary`(초록): 화면의 핵심 동작 1개
  - **보조** `btnSecondary`(흰 바탕 테두리, `outlineCombo`): 그 밖의 동작 전부
  - **위험** `btnDanger`(빨강, `dangerCombo`): 숨기기·삭제·내보내기·차단·회수·종료·일정 취소·거절
- 비활성은 `disabledToken` 하나로 한다.

| ID | 바꿀 것 (main 위치) |
|---|---|
| F1 | 신고 「숨기기」 `primaryCombo` → `btnDanger` (`manage/MoimManageReports.tsx:124`) |
| F2 | 앨범 고정·신고 → `btnSecondary`, 삭제 → `btnDanger`, `disabled:opacity-50` → `disabledToken` (`MoimAlbum.tsx:206,258,263,268`). 사진 위 겹침이라 반투명 바탕은 유지한다 |
| F3 | 운영 화면 `secondaryCombo` 10곳 → `btnSecondary` (Requests:87 거절은 `btnDanger`) · `outlinePrimaryCombo`(Boards:127) → `btnSecondary` · `ghostCombo + text-sam-danger`(Invite:164, Boards:114) → `btnDanger` · `ghostCombo`(Info:149,248)·`outlineCombo`(Info:258) → `btnSecondary` |
| F4 | 멤버 홈의 일정 만들기(`MoimMemberView.tsx:247`)·글쓰기(`:327`) → `btnPrimary`. 각 탭의 핵심 동작이고 탭마다 1개다. 더 보기(`:345`)는 보조로 둔다 |
| F6 | 일정 취소 `:319` `btnSecondary` → `btnDanger`. `:539` 와 같은 모양이 된다 |

### 그 밖의 항목

| ID | 바꿀 것 |
|---|---|
| **B11** 만들기 길이 | 만들기 이름·소개 입력에 정책값 길이를 바로 보여 주고 막는다 (`MoimCreateWizard.tsx:104,203,207`).<br>- 정책값(`moim_policies` 이름·소개 최소·최대)은 만들기 화면이 이미 부르는 `/api/moim/categories?withArea=1` 응답에 `limits` 로 담는다. 같은 요청이고, 정책 1행 읽기가 늘어난다.<br>- 값이 NULL 이면 서버 기본값(1·60·2000)과 같게 둔다.<br>- 입력칸에 `maxLength` 와 「n/최대」 글자 수를 넣고, 최소 길이 전에는 다음 단계를 막고 안내한다.<br>- `MoimManageInfo.tsx:20-23` 의 고정 상수(2·30·10·1000)도 같은 값을 쓰도록 바꾼다. 정보 화면이 이미 부르는 상세 응답에 `limits` 를 담는다.<br>- 요청 예산 `/api/moim/categories` 2.0 → 값 확인 후 조정(늘면 예산 문서 규칙대로 같은 PR 에서 설명)<br>- **구현:** 정책은 서버 5분 캐시라 예산 2.0 을 유지한다. 정보 화면은 이미 부르는 categories 응답의 `limits` 를 쓴다(상세 응답 변경 없음). 글자 수 안내는 정보 화면의 기존 문구 키(`moim_manage_info_length_hint`)를 만들기 화면에서도 쓴다(새 키 없음). 최소 길이는 서버와 같게 정책이 비면 0 이다(재감사 L3) |
| **D3** 「1 members」 | `moim_screen_member_count` 에 `_one` 키를 더한다(en "1 member"). 정원 표시 「1/10 members」는 영어로 맞는 표현이라 그대로 둔다(구현 중 정정). `formatMoimCount`(`moim-ui.tsx:184`)가 1일 때 고른다. 기존 패턴(`lib/share/invite-members-key.ts`)과 같다 |
| **D5** 모임장 메뉴 「나가기」 | 모임장에게는 「모임 나가기」 대신 다음을 보여 준다(설계 P5 「위임 전에는 나갈 수 없다 … [모임 종료]를 안내」, `MoimDetailScreen.tsx:205`).<br>- 「모임장 위임하기」 → `/moim/{id}/manage/transfer`(`canOpenMoimTransfer` 일 때)<br>- 「모임 종료」(위험) → `/moim/{id}/manage/close`(`close` 권한일 때)<br>- 멤버·부모임장·운영진 메뉴는 그대로 |
| **E7** 대표 사진 정리 | **정정: 결함 아님.**<br>- 지우거나 바꾼 대표 사진, 만들다 그만둔 사진은 「쓰는 곳」이 없으므로 기존 정리 작업이 72시간 뒤 지운다.<br>- 6-A 는 「쓰는 곳」이 있는 사진만 보호하고, 버린 사진은 계속 지워진다.<br>- 감사 문구 「저장소에 파일이 남는다」는 「72시간 남는다」로 정정한다. 코드 변경은 없다 |
| **F5** 탭 순서 | `MOIM_TABS` 를 홈·**게시판·일정**·앨범·멤버로 바꾼다 (`MoimMemberView.tsx:36,80-85`, 설계 §9·시안 U4). 주소 `?tab=` 값은 그대로라 기존 링크가 깨지지 않는다 |
| **F7** 막힌 버튼 | 정원 마감·가입 불가(`MoimPublicView.tsx:114,129`), 일정 마감 등(`MoimScheduleDetailScreen.tsx:341,347,353`)의 `disabled btnPrimary` 를 버튼이 아닌 안내 줄(`moimCls.noticeInfo`/`noticeWarn`)로 바꾼다. 문구 키는 그대로 쓴다 |
| **F8** 표시 통일 | `›`(Hub:91, TabHome:120) → `ChevronRight`, `⋯`(Members:194) → `MoreVertical`. 허브 처리 대기 배지 `Sam.badge.danger` → `Sam.badge.primary`(Hub:88). 메신저 서랍의 `MoimRoomNoticeMenuItem` `›` 는 옆 메신저 메뉴 줄과 같은 모양이라 그대로 둔다 |
| **F9** 운영 화면 저장 줄 | 정보·권한·초대·위임·변경 요청·종료 6화면(Info:297, Permissions:104, Invite:296, Transfer:96, HostRequest:125, Close:69)의 본문 끝 저장 버튼을 `MoimStickyFooter` 로 옮긴다(멤버 화면 7곳과 같다). 종료는 위험 버튼이다 |
| **F10** 댓글 ⋮ | `h-8 w-8` → 44px(`h-11 w-11`, `--sam-tap-min`) (`MoimPostDetailScreen.tsx:210`) |
| **F11** 시안 누락 3개 | 아래 「F11 상세」 |
| **F12** 배지 반경 | 메신저 목록의 모임 배지 `rounded-[6px]` → `rounded-ui-rect`(4px) (`MessengerChatListItem.tsx:1152`).<br>- 같은 줄의 옆 배지 3개(:1159, :1171, :1177)도 같은 6px 이다. 모임 배지만 바꾸면 한 줄 안에서 모양이 달라지므로 **같은 줄 배지 4개를 함께** 4px 로 맞춘다(반경 규칙). 이 3개는 메신저 쪽 배지이므로 승인 범위에 명시한다 |

### F11 상세 (승인 시안 = 구현)
1. **U4 머리글 ⌕ 모임 안 검색** (`MoimDetailScreen` 멤버 머리글)
   - 새 화면 `/moim/{id}/search`: 검색어를 입력하면 이 모임의 **게시글(제목·본문)과 일정(제목)** 을 찾는다.
   - 새 API `GET /api/moim/{id}/search?q=`
     - 멤버만(기존 읽기 권한 검사 `guardMoimRead` + 모임 접근 판정) 쓸 수 있다. 검색어는 2~40자다.
     - 숨김·삭제된 글은 빼고, 게시글 20개·일정 20개까지 최신순으로 준다.
     - 게시판 읽기 권한(게시판별 최소 역할)을 글 목록과 같은 함수로 적용한다.
   - 결과를 누르면 글 상세나 일정 상세로 간다.
   - 요청 예산에 새 라우트를 등록한다.
2. **U5 일정 상세 머리글 ⤴·⋮** (`MoimScheduleDetailScreen.tsx:126`)
   - ⤴ 공유: 기기 공유(없으면 링크 복사)로 일정 주소를 보낸다. 기존 공유 함수를 쓴다.
     - **구현 중 확인된 충돌 (Owner 결정 필요 · AGENTS 허위 보고 금지 7번):** 공유 계약(Owner 2026-11-14 §N-3 · G-7)은 「모임은 비회원 비공개라 밖으로 보낼 수 있는 것은 초대 링크뿐」이다. 일정 주소는 비회원이 열 수 없다.
     - 그래서 구현은 **계약 쪽(모임 초대 링크)** 을 따른다. 미리보기도 모임 이름·「모임 초대」로 보내, 받는 사람이 여는 화면과 맞춘다. ⤴ 는 초대 링크 권한(`manage_invite_link`)이 있는 멤버에게만 보인다(모임 상세 머리글과 같다).
     - 일정 주소 공유(멤버끼리 일정으로 바로 가는 링크)를 원하면 공유 계약 변경이 필요하다.
     - **결정 (Owner 「권장으로 진행」 2026-11-28): 초대 링크 유지.** 레거시 확인 결과
       - 네이버 밴드: 비공개 밴드는 초대 링크로만 가입하고, 승인 전에는 밴드 소개만 보이며 게시글은 승인 후 열람(2차 안내 사이트).
       - 당근 모임: 일정은 모임 멤버가 만들고, 일정 참여 이웃만 골라 일정 채팅방을 연다(고객센터 FAQ·보도). 일정별 바깥 공유 링크 안내는 찾지 못함.
       - 카카오 톡캘린더: 일정은 채팅방 안 말풍선으로 친구·채팅방 멤버에게 공유(카카오 보도자료).
       - 공통: **바깥으로는 모임 가입(초대) 화면, 멤버끼리는 앱 안 채팅방**으로 일정을 나눈다. 디바이는 일정 채팅방(owner_domain moim, kind schedule)이 이미 있어 멤버 쪽 길도 있다.
       - 그래서 ⤴ = 모임 초대 링크(미리보기 = 모임)로 확정한다. 공유 계약은 바꾸지 않는다.
   - ⋮: 지금 본문 「관리」 칸(:522-545)의 수정·마감/다시 열기·일정 취소를 머리글 메뉴로 옮긴다. 일정 취소는 위험 줄이다. 신고 메뉴는 기존 위치 그대로 둔다. **정정(2026-11-28 R3 · W6):** 일정 신고 메뉴는 원래 없었다(확인하지 않고 적음). R3 에서 ⋮ 에 「신고」를 추가했다.
   - 본문의 관리 칸은 없앤다.
3. **U7 멤버 시트 「✉ 대화하기」** (`manage/MoimManageMembers.tsx:66-110`)
   - 역할 변경·메모 다음, 내보내기 앞에 「대화하기」를 넣는다.
   - 기존 메신저 1:1 시작 `POST /api/community-messenger/direct/start` 를 쓰고, `roomId` 를 받으면 `/community-messenger/rooms/{roomId}` 로 간다.
   - 가입 미완료(`signup_incomplete`) 같은 오류는 연락처 시트(`MessengerContactsMemberSheet.tsx:88-103`)와 같은 방식으로 처리한다.
   - 자기 자신에게는 보이지 않는다.

### 재감사 반영 (2026-11-28)
- M1: 일정 ⤴ 공유 = 모임 초대 링크(위 「충돌」). 미리보기도 모임 내용으로 맞춘다.
- L1: 앨범 사진 위 버튼은 역할 색을 유지한 채 반투명 바탕으로 둔다.
- L2: 일정 ⋮ 항목은 처리 중(busy)에 막는다.
- L3: 최소 길이는 서버와 같은 경계로 둔다.
- L4: 검색어는 화면·서버가 같은 함수(`lib/moim/moim-search-query.ts`)로 다듬는다. 특수문자만 넣으면 오류가 아니라 안내가 나온다.
- L6: 초대 화면의 링크 만들기는 보조 버튼이다(핵심 = 하단 보내기).
- **남긴 것 L5:** 멤버 시트 「대화하기」는 기기에 저장된 내 계정 정보로 자기 자신을 거른다. 그 정보가 아직 없으면 대화하기가 보이지 않는다(안전한 쪽).

### 함께 바뀌는 문구 (ko·en, 키로만)
- D3 `_one` 키 2개
- D5 「모임장 위임하기」 / "Hand over organizer", 「모임 종료」 / "Close group"
  - 기존 위임·종료 화면 제목 키가 있으면 그 키를 쓴다.
- B11 「{n}/{max}」, 「{min}자 이상 입력해 주세요」 / "Enter at least {min} characters"
- F11
  - 검색: 「모임 안에서 검색」 / "Search in group", 「검색 결과가 없어요」 / "No results", 「게시글」·「일정」(기존 탭 키 재사용)
  - 공유: 「공유」 / "Share"(기존 키가 있으면 재사용)
  - 대화: 「대화하기」 / "Message"

### 영향 (같은 단계에서 함께 처리)
- **버튼 모양:** 모임·운영 화면의 모양만 바꾸고, 누르면 하는 일은 그대로다.
- **F5 탭 순서:** 탭 이름·주소 값은 그대로 두고 순서만 바꾼다.
- **F11-2 일정 상세:** 본문 관리 칸을 없앤다. 같은 동작은 ⋮ 에 그대로 있다. 일정 시험·구조 확인 시험을 갱신한다.
- **F12:** 메신저 목록 배지 4개의 모양만 바꾼다. 메신저 hard-lock 규칙(목록 동작)과는 관계없다.
- **B11:** categories 응답에 칸만 더한다. 기존 화면은 모르는 칸을 무시한다.

### 검증 계획
- 시험(수정 전 실패 재현)
  - 버튼 클래스 구조 확인
  - 탭 순서, `_one` 문구, 모임장 메뉴
  - 길이 막기와 정책값 응답
  - 검색 API: 권한, 숨김 제외, 게시판 권한, 길이
  - 대화하기 호출과 이동
  - 일정 ⋮ 메뉴 항목
- vitest 전체, `typecheck:build`·`typecheck:test`, eslint(파일별 경고 수 대조), `check:i18n-quality`, `verify:routes`(새 화면) 각 1회.
- 독립 재감사를 통과하면 PR 을 올린다(자동 병합 없음) → 「병합」.
- 화면 대조: 로컬 실행 화면으로 시안 U4·U5·U7 과 버튼 모양을 360·600~767 폭에서 대조한다.
  - 운영 사이트는 자동 브라우저로 열지 않는다(실기기 반복 실행 시험 상한).

## 롤백
- 6-A: 백업 정의로 되돌린다.
- 6-B: Instant Rollback.

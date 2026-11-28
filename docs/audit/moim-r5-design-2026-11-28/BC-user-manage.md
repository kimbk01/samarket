# 모임 R5 — 사용자 화면(B 21건) · 운영 관리 화면(C 21건) 수정 설계 (2026-11-28)

- 근거: `docs/audit/moim-full-defect-audit-2026-11-28.md` §3(B)·§4(C), 줄 근거는 같은 폴더 `…-raw.md`
- 기준 코드: 운영 main `eac581f07` (작업 트리 `samarket-wt-moim-r4`). 줄 번호는 이 트리 기준
- 읽은 규정·계약: AGENTS.md(i18n 키·한국어 글자 금지·토큰·`rounded-ui-rect`·44px·요청 예산) · 계약 `docs/design/moim/moim-design-v1-2026-11-12.md` · 시안 `moim-mockup-2026-11-12.html` · R1~R4 설계 · `lib/auth/guest-browse-access-policy.ts`(G-7) · `components/common/media/__tests__/dibay-image-viewer-ssot-contract.test.tsx`
- 이 문서는 **설계**다. 코드·DB·기기는 건드리지 않았다. 화면 결과는 실기로 보지 않았다(전부 코드 근거).
- 서버(SQL) 쪽은 다른 설계자가 쓴다. 이 문서는 §4 「서버에 필요한 것」에 **필요한 동작만** 적는다.

## 0. 이 설계에서 정한 Owner 수준 결정 (지시로 고정)

| ID | 결정 | 이 설계에서 하는 일 |
|---|---|---|
| B6 | G-7 을 따른다. 모임 읽기 API 는 **로그인 필수**. 예외는 초대 랜딩(`/moim/i/{token}`)과 그 API(`/api/moim/invite/[token]`)뿐 | §2 R-G |
| B26 | R1 정렬(최근 활동 → id)을 유지하고 **계약 문구를 고친다** | §2 R-K |
| B1 · E8 · D-36 | 작성자는 나간 뒤에도, 숨겨진 뒤에도 자기 글·댓글·사진을 지울 수 있다. 사용자가 닿는 길을 만든다 | §2 R-B |

---

## 1. 묶음 한눈에 (원인별)

| 묶음 | 근본 원인 | 고치는 결함 |
|---|---|---|
| **R-A 모임 상태 → 할 수 있는 동작 한 곳** | 글 상세·일정 상세·일정 수정·위임 배너·운영 틀이 모임 상태(종료·차단·경고)·일정 상태(시작·취소)를 화면마다 따로 판단 | B2 · B7 · B15 · B17 · C6 · C7 · C9 · C16 |
| **R-B 내가 쓴 글·댓글·사진** | 읽기 경로가 「활동 멤버 + 보이는 글」만 열려 있어, 지울 권한은 있는데 닿을 길이 없음 | B1 (+E8 은 서버) |
| **R-C 공용 사진 뷰어로 통일** | 모임만 자체 뷰어를 쓰고, 글·일정 사진은 확대가 없음 | B8 · B9 |
| **R-D 운영 허브 판정 한 곳** | 모임 ⋮ 「운영 관리」 판정과 허브 「뒤로」 판정의 목록이 다름 | C1 · C22 |
| **R-E 초대 목록·받은 초대 거르기** | 받을 수 없는 초대·초대할 수 없는 친구를 거르지 않음 | B14 · 신규(배너 개수) · C2 |
| **R-F 게시판 관리 완성** | 순서 바꾸기·다시 열기 기능 없음, 닫은 게시판을 상세가 주지 않음 | C4 · C15 · C12 · B19 |
| **R-G 비로그인 읽기 막기** | `guardMoimRead` 기본값이 「로그인 선택」 | B6 |
| **R-H 위임 요청 보이기·취소** | 보낸 요청을 화면이 모르고, 서버는 새 요청 때 다른 요청까지 말없이 취소 | C5 · C7(일부) |
| **R-I 문구·작은 화면 결함** | 개별 문구·입력 상한·탭 크기 | B3 · B4 · B10 · B11 · B12 · B18 · B20 · B21 · B22 · B24 · C3 · C8 · C10 · C11 · C13 · C14 · C17 · C18 · C19 · C21 |
| **R-J 초대 거절 관문** | 거절도 휴대폰·약관 관문을 통과해야 함 | B5 |
| **R-K 계약 문구** | 정렬 문구가 구현과 다름 | B26 |

---

## 2. 묶음별 설계

### R-A. 모임 상태 → 할 수 있는 동작 (새 파일 `lib/moim/moim-state-gate.ts`)

**하는 일**: 순수 함수 몇 개로 「이 모임·이 일정 상태에서 이 사람에게 무엇을 보여 줄지」를 한 곳에서 정한다. 화면은 이 결과만 쓴다. 서버 판정(`moim_actor_can`)과 같은 규칙이며, 서버가 늘 최종 판정이다.

```
moimReadOnlyReason(moim)            → "closed" | "blocked" | null      // status≠active → closed, platformState=blocked → blocked
moimPostGate(moim, post, isMember)  → { canComment, canEdit, canDelete, canHide, canPin, canReport,
                                        footer: "composer"|"login"|"pending"|"banned"|"readonly"|"join" }
moimScheduleGate(moim, s, now)      → { live, started, canEdit, canDecideRequests, canRemoveParticipant,
                                        canToggleClosed, canCancel, canAttendance, showMyBadge }
moimHostTransferGate(moim)          → { canAccept, canDecline: true, blockedKey: MessageKey | null }
moimManageBlockReason(detail)       → "closed" | "blocked" | null
moimAfterLeaveHref(moim)            → status≠active 이면 모임 탭, 아니면 null(그 자리 다시 불러오기)
```

규칙(요점):
- 읽기 전용 = 모임 `status ≠ active` 또는 `platformState = blocked`.
- 글: `canComment = isMember && !readOnly`. `canEdit = 작성자 && isMember && !readOnly && (공지면 pin_notice)`. `canDelete = 작성자`(상태와 무관 — D-36). 숨기기·고정은 기존 `moim.can.*`(서버와 같은 판정 — 읽기 전용이면 이미 false).
- 글 아래 고정 줄(footer): 읽기 전용 → `readonly`(상태 안내 문구) · 비로그인 → `login` · 멤버 → `composer` · 차단(`viewer.banned`·`status=banned`) → `banned` · 가입 신청 중(`pendingRequestId`·`status=pending`) → `pending` · 그 밖 → `join`.
- 일정: `live = 일정이 done·cancelled 아님 && 모임 읽기 전용 아님`. `canEdit = canDecideRequests = canRemoveParticipant = canToggleClosed = viewer.canManage && live && !started`. `canCancel` = 지금 조건 그대로 + `live`. `showMyBadge = status ≠ cancelled`.
- 위임 배너: `canAccept = status=active && platformState ∈ {normal, unlisted}`(계약 P8·P14 「경고면 위임 불가」, 차단은 전부 불가). 거절은 늘 가능.

| 결함 | 바꾸는 곳 (파일 · 함수) | 바뀐 뒤 사용자가 보는 것 |
|---|---|---|
| **B2** 종료·차단 모임 글에 댓글 칸·수정 | `components/moim/MoimPostDetailScreen.tsx` `MoimPostDetailScreen` — ⋮ 항목(197~211줄)·댓글 ⋮(214~218)·하단 줄(276~302)을 `moimPostGate` 결과로 그린다. 본문 위에 `MoimStateNotice`(이미 있는 부품) 1줄 | 종료·차단 모임 글: 댓글 입력칸 없음, 하단에 「종료된 모임이에요…」/「차단된 모임이에요」 안내. ⋮ 에 「수정」 없음, 내 글이면 「삭제」만 |
| **B17** 차단된 사람·신청 대기자에게 「가입하고 댓글 쓰기」 | 같은 화면 하단 줄 `footer` 분기 | 차단된 사람: 「가입할 수 없는 모임이에요」(기존 문구) · 신청 중: 「가입 신청이 승인되면 댓글을 쓸 수 있어요」(새 키) · 나머지 비멤버만 「가입하고 댓글 쓰기」 |
| **B7** 취소된 일정에 「취소됨」+「참여 확정」 | `components/moim/MoimScheduleDetailScreen.tsx` `ScheduleBody` 422줄 `MoimScheduleMyBadge` — `gate.showMyBadge` 일 때만 | 취소된 일정에는 「취소됨」 배지만 |
| **C6** 시작한 일정 신청자 승인·거절 버튼 | 같은 파일 506줄 `manage && requested.length > 0` → `gate.canDecideRequests && requested.length > 0` · 참여자 내보내기 버튼(593줄)도 `gate.canRemoveParticipant` | 시작한 일정에는 승인·거절 칸이 없다(서버가 늘 거절하던 버튼이 사라짐) |
| **C9** 시작한 일정 수정 화면이 주소로 열림 | `components/moim/MoimScheduleFormScreen.tsx` `MoimScheduleFormScreen` 96줄 `setCanEdit(...)` → `moimScheduleGate(moim, s, Date.now()).canEdit`(moim 상세는 이미 `useMoimDetail` 로 받음). 일정 상세 ⋮ 「수정」(381줄 `canEditMenu`)도 같은 값 | 시작했거나 끝난 일정, 종료·차단 모임 일정의 수정 주소를 열면 「시작했거나 끝난 일정은 수정할 수 없어요」(새 키) + 일정으로 돌아가기 |
| **C7** 경고·차단 모임 위임 배너 [수락], 실패 뒤 남음 | `components/moim/MoimDetailScreen.tsx` `HostTransferBanner`(63~103줄) — props 에 `moim` 추가, `moimHostTransferGate` 로 수락 버튼을 그리지 않고 안내 1줄. 실패 코드가 `moim_transfer_not_found`·`moim_transfer_stale`·`moim_transfer_blocked_by_warning`·`moim_blocked` 이면 토스트 뒤 `onDone()`(다시 불러오기) | 경고·차단 모임: 「모임이 제한 상태라 지금은 수락할 수 없어요. 거절은 할 수 있어요」 + [거절]만. 수락 실패 뒤 낡은 배너가 남지 않음 |
| **B15** 종료 모임에서 나가면 「모임을 찾을 수 없어요」 | `MoimDetailScreen.tsx` `leave`(172~189줄) — 성공 뒤 `moimAfterLeaveHref(moim)` 가 있으면 `router.replace(모임 탭)` + 토스트, 없으면 지금처럼 `reload()` | 종료 모임에서 나가면 모임 탭으로 이동하며 「모임에서 나왔어요」 |
| **C16** 종료·차단 모임 운영 주소 → 「권한 없음」 | `components/moim/manage/moim-manage-shared.tsx` `MoimManageFrame`(116~128줄)·`MoimManageForbidden`(152~163줄) — `allow` 가 false 일 때 `moimManageBlockReason(detail)` 로 제목·본문 키를 고른다 | 종료 모임: 「종료된 모임이에요 / 종료된 모임은 관리할 수 없어요」 · 차단 모임: 「운영이 제한된 모임이에요 / 제한이 풀릴 때까지 모임 종료만 할 수 있어요」 · 권한 없음만 기존 문구 |

**같은 단계에서 함께 정리하는 호출처**
- `MoimPostDetailScreen` 은 `useMoimDetail` 결과(`moim`)가 늦게 올 수 있다 → `moim` 이 없을 때는 지금처럼 「수정·삭제」만(작성자 판정은 글 응답에 있음), 하단 줄은 그리지 않는다(깜빡임 방지).
- `MoimScheduleDetailScreen` 의 `live`·`manage`·`canClose`·`showAttendance` 계산(198~205, 365~367줄)을 전부 `moimScheduleGate` 로 옮긴다. 화면 안 다른 분기(참여 버튼 영역 309~363줄)는 `gate.live`·`gate.started` 만 바꿔 쓴다 → 동작 동일.
- `MoimManageHub` 의 `allow={() => true}` 는 그대로(허브 안에서 항목 0개면 Forbidden) — 단 Forbidden 이 같은 상태 이유를 쓰도록 `detail` 을 넘긴다.

**시험 (새 `lib/moim/__tests__/moim-r5-state-gate.test.ts`, 동작 시험)**
- 종료·차단 모임 × 멤버·작성자: `canComment=false`, `canEdit=false`, `canDelete=true`, `footer="readonly"`.
- 비멤버 × banned/pending/그 밖: footer 가 `banned`/`pending`/`join`.
- 일정: 시작 1분 뒤 `canDecideRequests=false`·`canEdit=false`, 취소 일정 `showMyBadge=false`, 종료 모임 일정 `live=false`.
- 위임: warned·blocked → `canAccept=false`, normal·unlisted → true.
- `moimAfterLeaveHref`: closed → 모임 탭.
- 화면 시험(jsdom, `moim-r5-screens.test.tsx`): 종료 모임 글 상세 렌더 시 textarea 없음·⋮ 항목에 edit 없음 / 위임 배너 warned 에서 수락 버튼 없음 / 일정 수정 화면에 시작한 일정을 주면 폼 대신 안내.

**위험**: 서버가 아직 「종료 모임 글 수정」을 받아 준다(§4 S-1). 화면만 막고 서버를 안 고치면 주소 직접 호출로는 여전히 저장된다 → S-1 과 같은 배포.

---

### R-B. 나간 뒤·숨겨진 뒤 「내가 쓴 글·댓글·사진」 (B1 · E8 · D-36)

**지금**: 지우는 RPC 는 작성자면 멤버 여부와 상관없이 지우게 되어 있다(글 `moim_post_remove` 작성자 분기 · 댓글 `moim_comment_remove` · 사진 R4 `moim_album_remove`). 그러나 ① 글·앨범 읽기가 활동 멤버만 열려(`getMoimPost` 790줄, `album/route.ts` 17줄) 나간 사람은 자기 글을 열 수 없고 ② 숨겨진 것은 RPC 가 `status <> 'active'` 에서 「찾을 수 없음」으로 막는다. 나가기 확인 문구(`moim-screens.ts:63`)는 「나간 뒤에도 지울 수 있어요」라고 약속한다.

**새 화면** `/moim/my-content` (선택 `?moim={id}`) — 파일 `app/(main)/moim/my-content/page.tsx` + `components/moim/MoimMyContentScreen.tsx`
- 정적 경로가 `[moimId]` 보다 먼저 잡힌다(Next 규칙). `npm run verify:routes` 로 확인.
- 머리글: 「내가 쓴 글·댓글·사진」, 뒤로 = `?moim` 이 있으면 그 모임, 없으면 모임 탭.
- 2단 탭: 글 · 댓글 · 사진 (`DibaySecondaryTabRow`, 시안의 2단 탭과 같은 부품). 한 탭 = 한 요청.
- 줄: (모임 필터 없을 때) 모임 이름 · 글 제목 또는 본문 첫 줄 / 댓글 본문 2줄 + 「{글 제목}에 단 댓글」 / 사진 썸네일 3열 · 날짜(PHT) · 배지(「숨겨짐」·「나간 모임」·「종료」) · 오른쪽 [삭제](위험 버튼, `min-h-[length:var(--sam-tap-min)]`, `rounded-ui-rect`).
- [삭제] → 확인창(기존 키 `moim_post_delete_confirm_title`·`moim_comment_delete_confirm_title`·`moim_album_delete_confirm_title`) → 기존 DELETE 라우트(`/api/moim/posts/[id]`·`/api/moim/comments/[id]`·`/api/moim/album/[id]`) → 줄 제거 + 「삭제했어요」.
- 줄 누르기: 내가 활동 멤버이고 글이 보이는 상태(active)면 글 상세로 이동, 아니면 이동 없음(본문은 줄 안에서 펼쳐 보기 — 글만, 최대 10줄).
- 빈 상태: 「지울 수 있는 글이 없어요」/「…댓글이 없어요」/「…사진이 없어요」.

**들어가는 길 (2곳)**
1. 모임 공개 페이지(`MoimPublicView.tsx`) — `viewer.status ∈ {left, kicked, banned}` 일 때 「멤버 목록과 멤버 전용 글은…」 안내(205줄) 위에 줄 링크 1개 「내가 쓴 글·댓글·사진 ›」 → `/moim/my-content?moim={id}`. 요청 추가 없음(상태는 상세 응답에 이미 있음). 내용이 없으면 들어간 화면이 빈 상태를 보여 준다.
2. 모임 탭 홈(`MoimTabHome.tsx`) — 「내 모임」 칸 아래(또는 내 모임이 없으면 동네 모임 위) 줄 링크 1개 → `/moim/my-content`. 종료 모임(열람 기간 끝남)·나간 모임처럼 모임 페이지를 열 수 없는 경우의 유일한 길.
- 시안에 없는 요소다. Owner 지시(이번 설계 지시 「user-facing path」)로 넣는다. 다른 요소는 바꾸지 않는다.
- 나가기 확인 문구 값을 고친다: 「…내가 쓴 글·댓글·사진은 나간 뒤에도 모임 탭 › 내가 쓴 글·댓글·사진에서 지울 수 있어요」.

**새 API** `GET /api/moim/my-content?type=post|comment|album&moim=&before=` (`app/api/moim/my-content/route.ts`)
- 로그인 필수(`guardMoimRead` requireLogin). 서버 읽기(service role) — `author_id`(사진은 `uploader_id`) = 나, `status ∈ (active, hidden)`, 모임 `status ∈ (active, closed)`(**삭제된 모임은 제외** — 어드민이 복구 판단 중인 기록이고 계약상 「아무도 못 봄」). 20개 쪽, 시각 커서(`moim-time-cursor.server.ts` 재사용).
- 응답 항목: `{ id, type, moimId, moimName, moimStatus, viewerIsActiveMember, status: "active"|"hidden", title?, excerpt?, imageUrl?, postId?, postTitle?, createdAt }`. 신고자·숨긴 사람·숨김 사유는 넣지 않는다.
- DB 호출(코드 계산): 인증 1 + 항목 1 + 모임 이름·상태 1 + 내 멤버 상태 1 (+댓글이면 글 제목 1) = 4~5.

**서버에 필요한 것** → §4 S-2 (숨겨진 내 것도 작성자가 지우기).

**같은 단계에서 함께 정리**
- `lib/auth/member-consent-mutation-policy.ts` 는 이미 세 DELETE 를 `delete_own_content` 로 둔다 → 바꿀 것 없음. 새 GET 은 읽기라 쓰기 표 대상 아님.
- `lib/moim/moim-client-api.ts` 에 `moimApi.myContent()`·`moimRoutes.myContent(moimId?)` 추가.

**시험**: 라우트 시험(`moim-r5-my-content-route.test.ts`) — 비로그인 401 · 남의 글 안 섞임 · 삭제된 모임 제외 · hidden 포함 · 잘못된 커서 빈 쪽. 화면 시험 — 공개 페이지 status=left 에서 링크 보임, active·비멤버(가입한 적 없음)에서 안 보임 · 삭제 성공 시 줄이 빠짐.

**위험**: S-2 전에 배포하면 숨겨진 줄의 [삭제]가 「찾을 수 없어요」로 실패 → DB 먼저 적용. 이용 제한 계정(`isProductWriteDeniedMemberAccount`)은 지금 관문에서 삭제도 막힌다 — 범위 밖, 보고만(§6).

---

### R-C. 모임 사진을 공용 `DibayImageViewer` 로 (B8 · B9)

**지금**: 앨범은 자체 `MoimAlbumViewer`(`MoimAlbum.tsx` 127~282줄, z 1290, 확대·밀어 닫기 없음, 버튼 줄 「고정 · 삭제 · 신고」로 위험이 가운데). 글·일정 사진(`MoimPostDetailScreen.tsx` 231~237, `MoimScheduleDetailScreen.tsx` 446~452)은 그냥 `<img>` 라 확대 불가.

**바꿈**
1. 공용 뷰어에 선택 속성 1개 추가 — `components/common/media/DibayImageViewer.tsx` `DibayImageViewer(props)` 에 `onMore?: (index: number) => void` · `moreLabel?: string`. 있으면 아래 줄(616줄 저장 버튼 옆)에 「⋯」 버튼(44px, `aria-label=moreLabel`)을 그리고 지금 보고 있는 칸 번호를 넘긴다. 없으면 지금과 100% 같다(다른 6곳 진입점 영향 없음).
2. 앨범 — `MoimAlbum.tsx` 의 `MoimAlbumViewer` 를 지우고, `useAlbumViewerState` 가 `DibayImageViewer`(items = `dibayImageViewerItemsFromUrls(items.map(x=>x.url))`, index)를 연다. `onMore(i)` → `DibayActionSheet`(z 1300, 뷰어 z 200 위) 를 연다. 시트 `notice` = 「올린 사람 {이름 또는 나간 멤버}」. 항목 순서 = 일반 → 신고 → 위험(R3 1-1 규칙): 「고정/고정 해제」(pin_notice) → 「신고」(남의 사진) → 「삭제」(내 사진) 또는 「숨기기」(hide_post, danger). 삭제·숨김 성공 → 목록에서 빼고, 남은 사진이 0 이면 뷰어 닫기.
3. 글 상세·일정 상세 — `<img>` 를 `<button type="button" aria-label=사진 n>` 으로 감싸고 `useDibayImageViewer().openAt(images, i)`(같은 파일 647줄 훅). 동작 메뉴 없음.
4. SSOT 시험 `dibay-image-viewer-ssot-contract.test.tsx` 의 `entryPoints` 에 `components/moim/MoimAlbum.tsx`·`MoimPostDetailScreen.tsx`·`MoimScheduleDetailScreen.tsx` 를 넣고, 「`MoimAlbumViewer` 가 없다」 줄을 더한다. `onMore` 를 주면 버튼이 생기고 누르면 현재 칸 번호가 넘어가는 렌더 시험 1개.

**B9 해결**: 위험 동작이 시트 맨 아래(danger)로 간다.

**영향**: 뒤로 키 — 공용 뷰어는 히스토리 1칸(계약 시험)이고, 시트는 오버레이 뒤로 스택(`useOverlayHardwareBack`)이다. 시트가 열린 채 ◁ → 시트만 닫힘, 다시 ◁ → 뷰어 닫힘. 기존 `useOverlayHardwareBack(open, onClose)`(MoimAlbum 159줄)는 뷰어와 함께 지운다. 저장 버튼은 공용 뷰어 규칙(기기 저장 가능할 때만)을 그대로 따른다 — 모임 사진도 저장 가능해진다(다른 표면과 같음).

**위험**: 공용 뷰어 변경은 메신저·상품·매장에도 배포된다 → 선택 속성만 추가, 기존 시험 전부 통과가 조건. 실기에서 시트-뷰어 겹침·뒤로 2단을 Android·iPhone 둘 다 확인(NOT_PROVEN 으로 남김).

---

### R-D. 운영 허브 판정 한 곳 (C1 · C22)

- **C1** `moim-manage-shared.tsx` `canOpenMoimManageHub`(40~54줄)는 `send_invite`(멤버 기본 권한)를 넣고, `MoimDetailScreen.tsx` `MANAGE_ACTIONS`(23~34줄)는 넣지 않는다. 일반 멤버가 ⋮ 「친구에게 초대 보내기」 → 초대 화면 → 뒤로 = 허브(빈 허브·권한 없음).
  - 바꿈: `moim-manage-shared.tsx` 에 `MOIM_MANAGE_HUB_ACTIONS`(edit_info, decide_join, manage_invite_link, manage_boards, hide_post, remove_member, ban_member, write_note, set_role, transfer_host, close) 하나를 두고 `canOpenMoimManageHub` 와 `MoimDetailScreen` 의 `canManage`(124줄)가 같이 쓴다. `send_invite` 는 빼고, 위임 열기·미접속 변경 요청은 지금처럼 더한다.
  - 결과: 일반 멤버의 초대 화면 뒤로 = 모임 홈(기존 R4 #17 규칙이 그대로 작동). 허브 「초대」 줄(58줄)은 허브를 여는 사람에게만 보이므로 동작 변화 없음. `hide_post` 만 가진 운영진도 ⋮ 에 「운영 관리」가 생긴다(허브에는 이미 「신고 확인」이 있었음 — 두 판정이 같아짐).
- **C22** `MoimManageMembers.tsx` 261줄 「가입 신청 N」 → `moimRoutes.manageRequests(moimId)` 에 `?from=members` 를 붙이고, `MoimManageRequests` 가 이 값을 읽어 `MoimManageFrame backHref=moimRoutes.manageMembers(moimId)` 를 넘긴다(다른 값은 무시 — 주소 조작으로 바깥 주소로 못 가게 고정 값만).
- **시험**: `canOpenMoimManageHub` × 멤버(send_invite 만) = false · 운영진(hide_post 만) = true, `MoimDetailScreen` ⋮ 에 같은 결과. 가입 신청 화면 `from=members` 뒤로 = 멤버 관리, `from=기타` 뒤로 = 허브.

---

### R-E. 초대 거르기 (B14 · 신규 배너 개수 · C2)

- **B14 · 신규** `lib/moim/server/moim-queries.server.ts` `listReceivedMoimInvites`(831~899줄)
  - 모임 조회(844줄)에 `.neq("platform_state","blocked")` 를 더한다(같은 요청).
  - 카드의 `viewerStatus` 가 `active`(이미 멤버)·`banned` 인 초대를 결과에서 뺀다(`toCards` 가 이미 읽는 값 — 요청 추가 없음).
  - 결과: 받은 초대 화면과 모임 탭 배너 개수(`MoimTabHome` 67줄 = 같은 API 길이)가 「수락할 수 있는 초대」만 센다. 차단 모임이 풀리면 다시 보인다(초대 행은 그대로).
  - 서버 정리(§4 S-6)는 차단·가입 때 초대 행 상태를 맞추는 근본 수정. 화면 거르기는 그 전후 모두 맞다.
- **C2** 친구 초대 목록(`MoimManageInvite.tsx` `FriendInvite` 255~)
  - 새 라우트 `POST /api/moim/[moimId]/invites/check` body `{ userIds: string[] (≤300) }` → `{ members: string[], unavailable: string[] }`. 권한 = `send_invite`(아니면 403). `unavailable` = 가입 신청 중·차단된 사람(이유는 나누지 않는다 — 차단 사실을 드러내지 않음, 계약 P4·감사 B4 원칙). 서버 읽기 1회(`moim_members` status in active/pending/banned + `moim_bans` 미해제).
  - 친구를 받은 뒤 1회 부른다. 멤버 친구 = 줄은 남기고 선택 막음 + 회색 배지 「이미 멤버」, `unavailable` = 선택 막음 + 「초대할 수 없음」.
  - 보낸 뒤 실패 줄 문구를 **보내는 사람 입장**으로: `moim_already_member` → 「이미 멤버예요」, `moim_already_pending` → 「이미 가입 신청한 분이에요」, `moim_join_not_allowed`·`moim_invite_not_allowed` → 「이 분에게는 초대를 보낼 수 없어요」, 그 밖 → 지금 `moimErrorKey`. 매핑 함수 `moimInviteRowErrorKey(code)` 를 `MoimManageInvite.tsx` 에 두고 시험.
- **시험**: `listReceivedMoimInvites` — 차단 모임·이미 멤버·banned 초대 제외(가짜 sb 로 동작 시험) · check 라우트 권한 403·300 초과 400 · 행 오류 매핑.

---

### R-F. 게시판 관리 완성 (C4 · C15 · C12 · B19)

**C4 순서 바꾸기** (계약 §5.2 「게시판 만들기·순서 O O X X」)
- UI(`MoimManageBoards.tsx` `BoardsBody`): 켜진 게시판 줄마다 오른쪽에 [▲][▼] 아이콘 버튼(44px, `aria-label` 「위로 옮기기」「아래로 옮기기」, 맨 위·맨 아래면 해당 버튼 disabled). 누르면 화면 안 순서만 바뀌고, 바뀐 것이 있으면 하단 고정 줄(`MoimStickyFooter`)에 [순서 저장]·[되돌리기]. 저장 = 요청 1회. 공지 게시판도 다른 게시판과 똑같이 움직인다(계약에 고정 위치 규정 없음).
- 라우트: `PUT /api/moim/[moimId]/boards` body `{ order: string[] }` (켜진 게시판 id 전부, 새 순서) → RPC `moim_board_reorder`(§4 S-3). 실패 `moim_board_order_invalid`(목록이 지금 켜진 게시판과 다름 = 다른 운영진이 그 사이 바꿈) → 토스트 + 다시 불러오기.
- 영향: 게시판 탭 칩·글쓰기 게시판 선택은 이미 `sortOrder` 로 정렬(`activeMoimBoards`)이라 저장 뒤 상세 캐시를 비우면(`moimApi` 쓰기 성공 시 비움 규칙) 바로 따라온다.

**C15 닫은 게시판 다시 열기**
- 서버 읽기: `getMoimDetail`(574줄) `boards: isMember ? boardRows.filter(isActive) : []` → 멤버에게는 **닫은 것까지 전부**(`isActive` 표시 포함). 쓰는 곳 7곳(조사): 글쓰기 가능 판정 `canWriteMoimBoard`·칩 `activeMoimBoards`·글쓰기 선택은 이미 `isActive` 를 거르고, 나머지(글 상세·검색·공개 페이지·홈 글 줄)는 이름 찾기뿐이라 닫은 게시판의 글 이름이 빈칸이던 것도 같이 고쳐진다. 요청 수 변화 없음.
- UI: 켜진 목록 아래 「닫은 게시판」 칸(있을 때만) — 줄마다 [다시 열기](보조 버튼) → `moimApi.saveBoard({ boardId, isActive: true })`. 서버는 다시 열 때 상한(`max_custom_boards`)을 검사하고 맨 뒤 순서로 둔다(§4 S-3). 상한이면 기존 `moim_board_limit` 문구.
- 「닫기」 확인 문구 값 정정: 「멤버에게 더 이상 보이지 않아요」 → 「닫아도 글은 남아요. 아래 「닫은 게시판」에서 다시 열 수 있어요」.

**C12 「모임장 이상」**
- `MoimManageBoards.tsx` 73·88줄, `MoimManagePermissions.tsx` 84·100줄: 역할이 `host` 면 새 키 「모임장만」/「글쓰기: 모임장만」, 그 밖은 지금 「{role} 이상」. 작은 함수 `moimRoleAtLeastLabel(role, t)` 를 `moim-manage-shared.tsx` 에 두고 4곳이 같이 쓴다.

**B19 비멤버 공개 페이지 사용자 게시판 이름 빈칸**
- 원인: 비멤버에게 `boards: []` 를 주고, 글 줄은 `boardKind` 만 있어 사용자 게시판(custom)은 이름이 없다.
- 바꿈: `MoimPostDto` 에 `boardName: string | null` 추가. `toPosts`(419줄)의 게시판 읽기를 `id, kind` → `id, kind, name`, `getMoimDetail` 은 이미 읽은 `boards` 결과로 채운다(요청 추가 0). `useMoimBoardLabel` 호출부의 대체값 `{ kind: post.boardKind, name: null }` 4곳(`MoimPublicView` 163·202, `MoimPostDetailScreen` 118, `MoimSearchInMoimScreen`, `MoimMemberView` 192)을 `{ kind, name: post.boardName }` 로. 게시판 목록 자체는 계속 비멤버에게 주지 않는다.

**시험**: 게시판 화면 — ▲▼ 누르면 순서 바뀜·저장 줄 등장·저장 요청 본문 = 새 id 순서 / 닫은 게시판 칸·다시 열기 요청 / 「모임장만」 문구. 서버 질의 — 비멤버 상세의 공개 글에 `boardName` 채움, 멤버 상세에 닫은 게시판 포함.

**위험**: 닫은 게시판이 상세에 생기면서 새로 쓰는 곳이 `isActive` 를 빠뜨리면 닫은 게시판에 글쓰기 버튼이 생길 수 있다 → 시험 1개: 닫은 게시판만 있는 모임에서 글쓰기 게시판 후보 0.

---

### R-G. 비로그인 읽기 막기 (B6 · G-7)

- `lib/moim/server/moim-route-guard.server.ts` `guardMoimRead`(79~96줄): 기본값을 **로그인 필수**로 바꾼다. `opts.requireLogin` 을 없애고 `opts.allowGuest?: true` 하나만 둔다.
- `allowGuest` 를 주는 곳은 `app/api/moim/invite/[token]/route.ts` 하나.
- 바뀌는 라우트(지금 비로그인 허용 6곳): `/api/moim`(동네 목록) · `/api/moim/[moimId]` · `/api/moim/[moimId]/posts` · `/api/moim/posts/[postId]` · `/api/moim/posts/[postId]/comments`(GET) · `/api/moim/categories` → 401 `auth_required`.
- 화면 영향: `/moim/**`(초대 랜딩 제외)는 이미 proxy 가 비회원을 로그인으로 보낸다(G-7). 초대 랜딩 비회원 카드는 서버 함수(`loadMoimInviteGuestPreview`)로 직접 읽어 API 를 쓰지 않는다 → 보이는 화면 변화 없음. 공개 페이지·글 상세의 「로그인하고 …」 버튼은 사실상 도달 불가가 되지만 지우지 않는다(로그인 만료 중 화면 대비, 무해).
- 메신저·지역 머리글(`RegionBarMainHubTier1.tsx`)은 `moimRoutes` 만 쓰고 API 를 부르지 않는다(조사).
- **시험**: 6개 라우트 비로그인 401, 초대 해석 라우트 비로그인 200. 기존 시험 중 비로그인 200 을 기대하는 것은 같은 PR 에서 401 로 고친다.
- **계약 문구**: 계약 P2 「모임 공개 페이지(비멤버)」는 **로그인한 비멤버**를 뜻한다고 한 줄 정정(§2 R-K 와 같은 PR).

---

### R-H. 위임 요청 보이기·취소 (C5, C7 보완)

- 상세 응답 `viewer` 에 `outgoingHostTransfer: { id, toNickname, createdAt } | null` 추가(모임장일 때만). `getMoimDetail` 의 위임 조회(529~531줄)를 `to_user_id = 나 또는 from_user_id = 나`, `kind='direct'`, `status='requested'` 한 번으로(요청 추가 0). 받는 사람·보낸 사람 둘 다 같은 행을 읽는다.
- `MoimManageTransfer.tsx` `TransferBody`: 보낸 요청이 있으면 맨 위 카드 「{이름}님에게 보낸 요청을 기다리고 있어요 · {날짜}」 + [요청 취소](보조). 이때 후보 선택·[위임 요청 보내기]는 숨긴다(지금 `sentTo` 로컬 상태 대신 서버 값 — 화면을 나갔다 와도 유지).
- 취소: 새 라우트 `DELETE /api/moim/host-transfers/[transferId]` → RPC `moim_host_transfer_cancel`(§4 S-4). 확인창 「위임 요청을 취소할까요?」.
- 서버: 새 요청이 다른 요청을 말없이 취소하지 않게(§4 S-4). 대기 중이면 `moim_transfer_pending` 으로 거절 → 화면은 「먼저 보낸 요청을 취소해 주세요」(기존 키 문구 확인 후 필요하면 값 정정).
- 받는 사람 배너는 취소되면 다음 상세 불러오기에서 사라진다(알림 추가 없음 — 계약 §7 에 취소 알림 없음).
- 시험: 보낸 요청 있음 → 카드·취소 버튼, 보내기 버튼 없음 / 취소 성공 → 다시 불러오기.

---

### R-I. 문구·작은 화면 결함

| ID | 바꾸는 곳 | 바뀐 뒤 | 시험 |
|---|---|---|---|
| **B3** | `MoimPostDetailScreen.tsx` `removeComment`(172~178) — 작성자가 아니면 제목 새 키 「이 댓글을 모임에서 숨길까요?」·확인 「숨기기」 | 남 댓글 숨기기 확인창이 「숨길까요?」 | 남 댓글 → 확인창 제목 키 |
| **B4** | `MoimMemberView.tsx` 386줄 `writeBoard`, `MoimWriteScreen.tsx` 71줄 기본 선택 — 새 함수 `defaultMoimWriteBoard(moim)` (MemberView 에 export): 쓸 수 있는 게시판 중 **공지가 아닌 첫 게시판**, 없으면 공지 | 운영진이 「전체」에서 글쓰기 → 자유게시판(첫 일반 게시판)이 기본, 공지는 직접 골라야 함 | 공지+자유 쓰기 가능 → 자유, 공지만 → 공지 |
| **B10** | 키 `moim_join_title` 값 정정: 「이 모임에서 쓸 프로필」 → 「모임 가입」(en 「Join group」). 쓰는 곳 2곳(공개 페이지·받은 초대) 그대로 | 바로 가입 시트 제목이 「모임 가입」, 아래 칸 제목 「이 모임에서 쓸 프로필」과 겹치지 않음 | 키 값 시험 |
| **B11** | `MoimJoinSheet.tsx` 83~88 textarea `maxLength={1000}` + 글자 수 표시(`{n}/1000`). `join/route.ts` 21줄·`invites/[inviteId]/route.ts` `readInviteAnswers` 는 자르지 않고 1000자 넘으면 400 `moim_join_answer_too_long`(라우트 코드 — `MOIM_ROUTE_ERROR_CODES` 에 추가) | 1000자에서 입력이 멈추고, 몰래 잘리지 않음 | 1001자 → 400 |
| **B12** | `MoimTabHome.tsx` 137~149 · `MoimCard.tsx` `MoimMineItem` — `viewerStatus==="pending"` 칸은 흐린 표지 + 「신청 중」(기존 키) 배지, 목록 맨 뒤로. 개수(141줄)는 활동 멤버·종료 모임만 센다 | 내 모임에 신청 중 모임이 「신청 중」으로 구분되고 개수에 안 들어감 | pending 1+active 2 → 개수 2, 배지 1 |
| **B18** | `getMoimDetail` 최근 글 질의(539~543) `.eq("is_pinned", false)` | 고정 공지가 「최근 글」에 또 나오지 않음(게시판 탭 목록은 그대로 전부) | 질의 조건 시험 |
| **B20** | `MoimTabHome.tsx` 157~160 — 카테고리 0개면 `MoimLocalList emptyKey="moim_home_local_empty_preparing"`(「아직 우리 동네에 모임이 없어요」) | 「첫 모임을 만들어 보세요」와 「만들 수 없어요」가 같이 나오지 않음 | 카테고리 0 → 빈 문구 키 |
| **B21** | `notification-prefs/route.ts` GET 응답에 `chatMuted: boolean \| null`(메신저 `community_messenger_participants.is_muted` — 음소거 권위, 대표 방·나, 서버 읽기 1회). `MoimNotificationSettingsScreen.tsx` 105~113 채팅 줄 오른쪽에 「켜짐/꺼짐」, 안내 값 정정 「모임 채팅방에서 알림을 끄고 켤 수 있어요」(줄이 방을 연다) | 채팅 알림 상태가 보이고 안내가 실제 동작(방 열기)과 맞음 | 응답 키·문구 |
| **B22** | `MoimScheduleFormScreen.tsx` 248~258 버튼에 `inline-flex min-h-[length:var(--sam-tap-min)] items-center px-2` | 「끝 시각 지우기」 44px | 클래스 시험 |
| **B24** | 같은 파일 25~39 `isoToLocalInputs`·`localInputsToIso` → 필리핀 시간 고정(`PHT_TIME_ZONE` Intl 로 날짜·시각 꺼내기 / 입력 → `${date}T${time}:00+08:00`). 함수 이름 `isoToPhtInputs`·`phtInputsToIso`, `lib/time/format-pht-display.ts` 옆 새 파일 `lib/time/pht-input.ts` 로 옮겨 시험. 시작 칸 아래 안내 「시각은 필리핀 시간 기준이에요」 | 기기 시간대가 한국이어도 입력한 7:00 PM = 표시 7:00 PM | KST 환경 가정(`TZ=Asia/Seoul`)에서 왕복 동일 |
| **C3** | `MoimStaffReportDto` 에 `viewerIsAuthor` 추가(`moim-staff-reports.server.ts` 가 이미 author 를 읽음). `MoimManageReports.tsx` — 내 것이면 버튼 「삭제」·확인창 「내 글을 삭제할까요?」·결과 배지 「삭제됨」, 남의 것은 지금처럼 「숨김」. 상태 반영은 응답 `result`(글·사진) 또는 `viewerIsAuthor`(댓글) | 운영진 자기 글 신고 처리 결과가 실제(삭제)와 같게 보임 | 내 글 → 「삭제됨」 |
| **C8** | `MoimScheduleDetailScreen.tsx` `decide`·`removeParticipant` — 오류 `moim_request_not_found` 이면 새 키 「이미 처리된 신청이에요」 + 다시 불러오기(가입 신청 문구를 쓰지 않음) | 다른 운영진이 먼저 처리한 일정 신청 → 올바른 안내 | 코드 매핑 |
| **C10** | 키 값 정정 `moim_manage_ban_reason_placeholder` 「차단 목록에서 모임장·부모임장만 봐요. 본인에게는 보이지 않아요」 + 새 키 `moim_manage_remove_reason_placeholder` 「운영 기록에만 남고 본인에게는 보이지 않아요」(`MoimManageMembers.tsx` 480줄 내보내기 칸) | 사유가 어디에 보이는지 실제와 같게 안내(차단 사유는 `ban_member`=부모임장 이상이 차단 목록에서 봄 · 내보내기 사유는 `moim__log` 만) | 키 |
| **C11** | `MoimManageRequests.tsx` 138~148 textarea `maxLength={100}` + 안내 「적은 사유는 신청자에게 알림으로 전달돼요」 + 글자 수. 라우트의 `slice(0,100)` 은 그대로(안전망) | 300자 써도 100자만 가던 문제 없음, 신청자에게 간다는 것을 앎 | maxLength |
| **C13** | 메모 규칙 하나: 「write_note 가진 사람이, 자기보다 **낮은 역할**의 다른 멤버에게만」. 멤버 탭(`actionsFor` 146~)은 이미 이 규칙. 메모 탭(320~335)은 같은 조건이 아니면 줄을 눌러도 읽기 전용(편집 시트 대신 본문만, 안내 「같거나 높은 역할의 메모는 볼 수만 있어요」). 서버도 같은 규칙(§4 S-7) | 세 곳 판정이 같아짐 | 메모 탭에서 상위 역할 줄 → 편집 불가 |
| **C14** | 멤버 목록 응답에 `capped`(받은 수 ≥ 1000), 멤버 관리·위임 후보 화면에 새 키 「많아서 {count}명까지만 보여요」. 사람 목록(가입 신청·차단·일정 참여자)도 이 「명」 키로, 링크·메모만 기존 「개」 | 사람에 「개」가 붙지 않음, 1000명 상한 안내 | 키 선택 |
| **C17** | `MoimManageInfo.tsx` 84~89 — 연도 오류를 둘로 나눔: 「출생 연도는 1900년부터 올해까지 적어 주세요」 / 「시작 연도가 끝 연도보다 늦어요」. 올해 상한은 `new Date().getFullYear()`(2100 대신). 서버 검사 §4 S-5 | 어떤 칸이 틀렸는지 알 수 있음, 서버도 같은 검사 | 두 경우 키 |
| **C18** | `join-requests/[requestId]/route.ts` — RPC 전에 `moim_join_requests` 의 `moim_id` 를 읽어 주소의 `moimId` 와 다르면 404(결정을 실행하지 않음). 서버 읽기 1회 | 다른 모임 주소로 처리되어 알림만 빠지던 경우가 생기지 않음 | 불일치 → 404, RPC 미호출 |
| **C19** | `invite-links/route.ts` POST 에 `reuse: true` 선택값 — 권한(`manage_invite_link`) 확인 뒤, 같은 사람이 만든 **취소 안 됐고 만료까지 24시간 넘게 남은** 링크가 있으면 그것을 돌려줌. `use-moim-invite-share.ts` 39줄 호출에 `reuse: true`(운영 › 초대 링크 화면의 「새 링크」는 그대로 새로 만듦) | 머리글 공유를 여러 번 눌러도 링크가 쌓이지 않음 | 두 번 호출 → 같은 토큰, 만료 임박 → 새 토큰 |
| **C21** | `MoimManageClose.tsx` `close`(35~43) — 성공 뒤 `await dibayAlert({ title: 「모임을 종료했어요」, description: 열람 기간 있으면 「멤버는 {days}일 동안 기록을 볼 수 있어요」 })` 다음 `router.replace(모임 탭)` | 종료 성공을 알고 이동 | dibayAlert 호출 |

---

### R-J. 초대 거절 관문 (B5)

- `app/api/moim/invites/[inviteId]/route.ts` 15줄: `guardMoimWrite(..., { phone: true })` → `{ writeKind: "none", consentExempt: true }`(휴대폰 없음).
- 수락 분기(21~27줄)에서만: `requireSignupCompleteForUser`(약관) → `requireRegistrationForAction` → `guardMoimAcceptGate`(이용 제한 + 휴대폰 — 이미 휴대폰 포함). 순서는 지금 위임 수락 라우트와 같게.
- `lib/auth/member-action-registry.ts` 233줄 이미 `split` — 바꿀 것 없음. `lib/auth/member-consent-mutation-policy.ts` 에 이 경로를 「거절 분기는 동의 예외, 수락은 라우트가 확인」으로 한 줄 등록(파일의 기존 split 표기 방식 따름), 관련 CSV 고정값이 있으면 같은 PR 에서 맞춘다.
- 결과: 휴대폰 인증 전·약관 동의 전 사용자도 받은 초대를 거절할 수 있다. 수락은 지금과 같은 관문.
- 서버: `moim_invite_respond` 거절 분기는 휴대폰·약관을 보지 않는다(확인) → SQL 변경 없음. 운영 기록 누락(E13)은 다른 설계자 몫.
- 시험: 휴대폰 미인증 사용자 accept:false → 200(RPC 호출), accept:true → 휴대폰 필요 응답.

---

### R-K. 계약 문구 (B26)

- `docs/design/moim/moim-design-v1-2026-11-12.md` §6 P2 210줄 「정렬: 최근 활동 → 멤버 수 → 생성일」 → 「정렬: 최근 활동(`last_activity_at`) 최신순, 같으면 id 순(쪽 넘김 커서와 같은 열 · 2026-11-28 R1 A-19 구현, Owner 결정 B26)」. 화면 표시 「최근 활동순」(`moim_home_sort_recent`)은 그대로 맞다.
- 같은 PR 에서 P2 212줄 「모임 공개 페이지(비멤버)」 → 「(로그인한 비멤버 · G-7)」.
- 코드 변경 없음.

---

## 3. 결함 ID → 묶음 대조표 (빠짐 확인)

| B | 묶음 | C | 묶음 |
|---|---|---|---|
| B1 | R-B | C1 | R-D |
| B2 | R-A | C2 | R-E |
| B3 | R-I | C3 | R-I |
| B4 | R-I | C4 | R-F |
| B5 | R-J | C5 | R-H |
| B6(결정) | R-G | C6 | R-A |
| B7 | R-A | C7 | R-A·R-H |
| B8 | R-C | C8 | R-I |
| B9 | R-C | C9 | R-A |
| B10 | R-I | C10 | R-I |
| B11 | R-I | C11 | R-I |
| B12 | R-I | C12 | R-F |
| B14 | R-E | C13 | R-I (+S-7) |
| B15 | R-A | C14 | R-I |
| B17 | R-A | C15 | R-F |
| B18(일부) | R-I | C16(일부) | R-A |
| B19 | R-F | C17 | R-I (+S-5) |
| B20 | R-I | C18 | R-I |
| B21(일부) | R-I | C19(일부) | R-I |
| B22 | R-I | C21 | R-I |
| B24 | R-I | C22 | R-D |
| 신규(배너 개수) | R-E | | |
| B26(결정) | R-K | | |

B 21건 + C 21건 + 결정 2건 전부 배정. (B13·B16·C20 은 「결함 아님」, B23=C9, B25=A9 는 A 묶음.)

---

## 4. 서버에 필요한 것 (SQL 설계자에게 — 동작만)

| ID | 대상 | 필요한 동작 | 쓰는 화면 |
|---|---|---|---|
| **S-1** | `moim_comment_create` · `moim_post_update` | 모임 `status ≠ active` 이면 새 코드 `moim_closed` 로 거부. 지금: 댓글은 `moim_post_not_found`, 글 수정은 **저장됨** | B2 |
| **S-2** (E8·D-36) | `moim_post_remove` · `moim_comment_remove` · `moim_album_remove` | 작성자(사진은 올린 사람)이면 `status ∈ (active, hidden)` 둘 다 `deleted` 로. 멤버 여부·모임 상태(active·closed) 무관. 삭제된 모임(`moims.status='deleted'`)은 지금처럼 거부해도 됨(화면이 안 보여 줌). 숨겨진 댓글을 지울 때는 `comment_count` 를 **다시 빼지 않는다**(숨길 때 이미 뺌). 운영자 아닌 사람의 hidden 행 처리는 지금처럼 거부. 운영 기록 `post_deleted`/`comment_deleted`/`album_deleted`(사진 본인 삭제 기록 누락 E13 포함) | R-B |
| **S-3** | 새 `moim_board_reorder(p_actor, p_moim, p_board_ids uuid[])` | `manage_boards` 권한. `p_board_ids` 가 이 모임의 **켜진 게시판 집합과 정확히 같을 때만**(중복·누락·다른 모임 id → `moim_board_order_invalid`) `sort_order = 배열 위치(1부터)`. 닫힌 게시판은 그 뒤 번호로 기존 순서 유지. 기록 `board_reordered`. 같은 트랜잭션 안에서 게시판 행 잠금 | C4 |
| **S-3b** | `moim_board_upsert` 다시 열기(`is_active` false→true) | 켜진 사용자 게시판 수가 `max_custom_boards` 이상이면 `moim_board_limit`. 다시 열면 `sort_order = 최대+1` | C15 |
| **S-4** | `moim_host_transfer_request` · 새 `moim_host_transfer_cancel(p_actor, p_transfer)` | 요청: `kind='direct'` 대기 요청이 있으면 취소하지 말고 `moim_transfer_pending` 으로 거부. **`kind='inactive'`(미접속 요청)는 절대 건드리지 않는다**. 취소: 보낸 사람(현 모임장)만, `direct`·`requested` 만, 상태 `cancelled`·`decided_at`, 기록 `host_transfer_cancelled`. 없음·이미 처리 → `moim_transfer_not_found` | C5 |
| **S-5** (≈E12·E20) | `moim_update_info` | 표지 주소는 글 사진과 같은 검사(`moim__assert_images` 규칙 — 허용 저장소 주소)로, 틀리면 `moim_cover_invalid`. 출생 연도 1900~올해, 형 변환 실패도 같은 코드로. 최소 > 최대면 `moim_age_range_invalid`(지금은 모호한 오류/일반 400) | C17 |
| **S-6** (≈E19) | 차단(`moim_member_remove` ban)·가입 성공(`moim__room_member_activate` 또는 가입 RPC) | 그 사람에게 이 모임의 `moim_invite_targets.status='sent'` 행을 `cancelled`(차단) / `accepted` 또는 `cancelled`(다른 경로로 가입)로 맞춘다. 화면 거르기(R-E)는 이것 없이도 맞지만 행이 남지 않게 | B14 |
| **S-7** | `moim_member_note_set` | 대상이 나 자신이거나 대상 역할 순위 ≥ 내 역할 순위면 `moim_forbidden`(대상은 활동 멤버). 지금은 아무 멤버(상위·자신·나간 사람 포함) 가능 | C13 |
| **S-8** | 오류 코드 등록 | `moim_closed` · `moim_board_order_invalid` · `moim_cover_invalid` · `moim_age_range_invalid` 를 SQL 에 쓰면 `lib/moim/moim-error-codes.ts` `MOIM_ERROR_CODES` 에도 넣는다(계약 시험이 대조) — 화면 PR 에서 함께 | 공통 |
| — | B5 `moim_invite_respond` 거절 | **변경 없음** 확인만(거절 분기는 휴대폰·약관을 보지 않음). 라우트만 고친다(R-J) | B5 |
| — | C8 | 변경 없음(화면이 `moim_request_not_found` 를 일정 문맥으로 바꿔 읽음) | C8 |
| — | C18 | 변경 없음(라우트가 먼저 확인). 원하면 `moim_join_decide` 에 `p_moim` 을 더해 DB 에서도 막을 수 있으나 필수 아님 | C18 |

배포 순서: **운영 DB(S-1~S-7) 먼저 적용 → 웹 PR 병합**. 웹이 먼저 나가면 순서 저장(S-3)·위임 취소(S-4)·숨김 삭제(S-2)가 실패한다. 구 웹 + 새 DB 는 안전(새 RPC 는 안 불리고, S-4 의 「대기 중이면 거부」만 기존 화면에서 「이미 요청이 있어요」 문구로 보임 — 기존 키 `moim_err_moim_transfer_pending` 있음).

---

## 5. 새 i18n 키 (ko · en, `lib/i18n/catalog/moim-screens.ts`·`moim-manage.ts`·`moim-core.ts` 에 동시)

| 키 | ko | en |
|---|---|---|
| `moim_my_content_title` | 내가 쓴 글·댓글·사진 | My posts, comments and photos |
| `moim_my_content_tab_posts` | 글 | Posts |
| `moim_my_content_tab_comments` | 댓글 | Comments |
| `moim_my_content_tab_photos` | 사진 | Photos |
| `moim_my_content_hidden_badge` | 숨겨짐 | Hidden |
| `moim_my_content_left_badge` | 나간 모임 | Left group |
| `moim_my_content_comment_on` | {title}에 단 댓글 | On "{title}" |
| `moim_my_content_empty_posts` | 지울 수 있는 글이 없어요 | No posts to delete |
| `moim_my_content_empty_comments` | 지울 수 있는 댓글이 없어요 | No comments to delete |
| `moim_my_content_empty_photos` | 지울 수 있는 사진이 없어요 | No photos to delete |
| `moim_my_content_deleted_toast` | 삭제했어요 | Deleted |
| `moim_comment_hide_confirm_title` | 이 댓글을 모임에서 숨길까요? | Hide this comment in the group? |
| `moim_comment_pending_note` | 가입 신청이 승인되면 댓글을 쓸 수 있어요 | You can comment once your request is approved |
| `moim_album_more_aria` | 사진 메뉴 | Photo options |
| `moim_album_uploader_note` | 올린 사람 {name} | Posted by {name} |
| `moim_post_image_aria` | 사진 {n} 크게 보기 | View photo {n} |
| `moim_home_local_empty_preparing` | 아직 우리 동네에 모임이 없어요 | No groups in your neighborhood yet |
| `moim_notify_chat_on` | 켜짐 | On |
| `moim_notify_chat_off` | 꺼짐 | Off |
| `moim_schedule_form_pht_hint` | 시각은 필리핀 시간 기준이에요 | Times are in Philippine time |
| `moim_schedule_edit_unavailable` | 시작했거나 끝난 일정은 수정할 수 없어요 | You can't edit a meetup that has started or ended |
| `moim_schedule_request_already_handled` | 이미 처리된 신청이에요 | This request was already handled |
| `moim_transfer_banner_blocked` | 모임이 제한 상태라 지금은 수락할 수 없어요. 거절은 할 수 있어요 | This group is restricted, so you can't accept now. You can still decline |
| `moim_manage_closed_title` | 종료된 모임이에요 | This group has ended |
| `moim_manage_closed_body` | 종료된 모임은 관리할 수 없어요 | Ended groups can't be managed |
| `moim_manage_blocked_title` | 운영이 제한된 모임이에요 | This group is restricted |
| `moim_manage_blocked_body` | 제한이 풀릴 때까지 모임 종료만 할 수 있어요 | Until it's lifted, you can only end the group |
| `moim_manage_board_move_up_aria` | 위로 옮기기 | Move up |
| `moim_manage_board_move_down_aria` | 아래로 옮기기 | Move down |
| `moim_manage_board_order_save_btn` | 순서 저장 | Save order |
| `moim_manage_board_order_reset_btn` | 되돌리기 | Undo |
| `moim_manage_board_order_saved_toast` | 게시판 순서를 저장했어요 | Board order saved |
| `moim_manage_boards_closed_title` | 닫은 게시판 | Closed boards |
| `moim_manage_board_reopen_btn` | 다시 열기 | Reopen |
| `moim_manage_board_reopened_toast` | 게시판을 다시 열었어요 | Board reopened |
| `moim_manage_perm_host_only_chip` | 모임장만 | Organizer only |
| `moim_manage_board_write_role_host_only` | 글쓰기: 모임장만 | Posting: organizer only |
| `moim_manage_transfer_pending_notice` | {name}님에게 보낸 요청을 기다리고 있어요 · {date} | Waiting for {name} to respond · {date} |
| `moim_manage_transfer_cancel_btn` | 요청 취소 | Cancel request |
| `moim_manage_transfer_cancel_confirm_title` | 위임 요청을 취소할까요? | Cancel the request? |
| `moim_manage_transfer_cancelled_toast` | 위임 요청을 취소했어요 | Request canceled |
| `moim_manage_invite_already_member_badge` | 이미 멤버 | Member |
| `moim_manage_invite_unavailable_badge` | 초대할 수 없음 | Can't invite |
| `moim_manage_invite_row_err_member` | 이미 멤버예요 | Already a member |
| `moim_manage_invite_row_err_pending` | 이미 가입 신청한 분이에요 | Already asked to join |
| `moim_manage_invite_row_err_not_allowed` | 이 분에게는 초대를 보낼 수 없어요 | You can't invite this person |
| `moim_manage_reports_delete_own_btn` | 삭제 | Delete |
| `moim_manage_reports_delete_own_title` | 내 글을 삭제할까요? | Delete your post? |
| `moim_manage_reports_delete_own_body` | 삭제하면 되돌릴 수 없어요. 신고는 운영팀이 따로 처리해요 | This can't be undone. Our team handles the report separately |
| `moim_manage_reports_deleted_toast` | 삭제했어요 | Deleted |
| `moim_manage_remove_reason_placeholder` | 운영 기록에만 남고 본인에게는 보이지 않아요 | Kept in group records only. They won't see it |
| `moim_manage_reject_reason_hint` | 적은 사유는 신청자에게 알림으로 전달돼요 | The reason is sent to the person in a notification |
| `moim_manage_note_readonly_hint` | 같거나 높은 역할의 메모는 볼 수만 있어요 | You can only view notes on same or higher roles |
| `moim_list_capped_people_hint` | 많아서 {count}명까지만 보여요 | Showing up to {count} people |
| `moim_manage_info_age_year_invalid_toast` | 출생 연도는 1900년부터 올해까지 적어 주세요 | Enter a birth year from 1900 to this year |
| `moim_manage_info_age_order_invalid_toast` | 시작 연도가 끝 연도보다 늦어요 | The first year is later than the last year |
| `moim_manage_close_done_title` | 모임을 종료했어요 | Group ended |
| `moim_manage_close_done_body` | 멤버는 {days}일 동안 기록을 볼 수 있어요 | Members can see past posts for {days} days |
| `moim_err_moim_closed` | 종료된 모임이에요 | This group has ended |
| `moim_err_moim_board_order_invalid` | 게시판이 바뀌었어요. 다시 불러온 뒤 정해 주세요 | Boards changed. Reload and try again |
| `moim_err_moim_cover_invalid` | 표지 사진을 다시 올려 주세요 | Please upload the cover photo again |
| `moim_err_moim_age_range_invalid` | 출생 연도 범위를 다시 확인해 주세요 | Please check the birth year range |
| `moim_err_moim_join_answer_too_long` | 답변은 1,000자까지 쓸 수 있어요 | Answers can be up to 1,000 characters |

값만 바꾸는 기존 키: `moim_join_title`(모임 가입 / Join group) · `moim_leave_confirm_body`(나간 뒤 지우는 곳 안내 추가 — en 「…You can delete them later in Groups › My posts, comments and photos」) · `moim_notify_chat_hint`(모임 채팅방에서 알림을 끄고 켤 수 있어요 / Turn these on or off in the group chat) · `moim_manage_ban_reason_placeholder`(차단 목록에서 모임장·부모임장만 봐요. 본인에게는 보이지 않아요 / Only the organizer and co-organizers see this in the block list. They won't see it) · `moim_manage_board_deactivate_confirm_body`(닫아도 글은 남아요. 아래 「닫은 게시판」에서 다시 열 수 있어요 / Posts stay. You can reopen it under Closed boards).

`npm run check:i18n-quality` 기준: 코드 안 한국어 0, 인라인 `{ko,en}` 0, 언어 삼항 0. 영어는 개발자 용어 없이.

---

## 6. 바꾸는 파일 · 요청 예산 · 남은 것

**웹 파일 (한 PR — 같은 지시·같은 감사의 B·C 묶음)**
- 새 파일: `lib/moim/moim-state-gate.ts` · `lib/time/pht-input.ts` · `app/(main)/moim/my-content/page.tsx` · `components/moim/MoimMyContentScreen.tsx` · `app/api/moim/my-content/route.ts` · `app/api/moim/[moimId]/invites/check/route.ts` · 시험 `lib/moim/__tests__/moim-r5-*.test.ts(x)`
- 고치는 파일: `components/moim/` — `MoimPostDetailScreen` · `MoimScheduleDetailScreen` · `MoimScheduleFormScreen` · `MoimDetailScreen` · `MoimPublicView` · `MoimMemberView` · `MoimWriteScreen` · `MoimTabHome` · `MoimCard` · `MoimJoinSheet` · `MoimAlbum` · `MoimNotificationSettingsScreen` · `MoimSearchInMoimScreen` · `use-moim-invite-share`; `components/moim/manage/` — `moim-manage-shared` · `MoimManageHub` · `MoimManageBoards` · `MoimManagePermissions` · `MoimManageTransfer` · `MoimManageInvite` · `MoimManageReports` · `MoimManageMembers` · `MoimManageRequests` · `MoimManageInfo` · `MoimManageClose`; `components/common/media/DibayImageViewer.tsx`(선택 속성) + 그 SSOT 시험; `lib/moim/` — `moim-api-types` · `moim-client-api` · `moim-error-codes` · `server/moim-route-guard.server` · `server/moim-queries.server` · `server/moim-staff-reports.server`; `app/api/moim/` — `invite/[token]` · `[moimId]/join` · `invites/[inviteId]` · `[moimId]/boards` · `host-transfers/[transferId]` · `[moimId]/join-requests/[requestId]` · `[moimId]/invite-links` · `[moimId]/notification-prefs` · `[moimId]/members`; `lib/auth/member-consent-mutation-policy.ts`(+고정 CSV 있으면); i18n `moim-screens.ts` · `moim-manage.ts` · `moim-core.ts`; 문서 `docs/design/moim/moim-design-v1-2026-11-12.md`(B26·G-7 문구).
- 통화·메신저 hard-lock 파일은 건드리지 않는다(B21 은 음소거 값을 **읽기만**).
- 배포 구분 예상: **웹 + 운영 DB**(네이티브 없음 → 앱 재시작만).

**요청 예산** (`docs/request-budget-ssot.md` · `lib/perf/request-budget.ts`)
- `/api/moim/[moimId]` 12.0: 위임 조회를 한 질의로(+0) · 공개 글 게시판 이름은 이미 읽은 게시판 결과로(+0) · 최근 글 조건 추가(+0) → **변화 없음**.
- `/api/moim` 2.6 · `/api/moim/categories` 2.0: 비로그인이 401 로 일찍 끝남 → 늘지 않음(줄 수 있음, 7일 측정 뒤 내리기만).
- `/api/moim/invites`: 거르기 조건만 추가(+0).
- 예산 표 밖(미등록, D-40 측정 대기) 라우트 증가: `notification-prefs` GET +1 · `join-requests/[id]` POST +1 · `invite-links` POST(reuse) +1~2(대신 링크 누적·이후 목록 크기 감소).
- 새 라우트: `my-content` GET(4~5/회, 들어갈 때만) · `invites/check` POST(2~3/회, 초대 화면 열 때 1회) · `boards` PUT(순서 저장 때만) · `host-transfers` DELETE(드묾). 모두 하루 1,000회 미만 예상 → 규칙 2번 「1,000건 이상 새 라우트만 예산 등록」에 해당 없음, `unbudgeted_route` 감시로 둔다(추측값 등록 안 함 — D-40 규칙).
- 화면 쪽 요청: 앨범·글 사진 뷰어 변경 0 · 모임 탭 홈 0 · 친구 초대 화면 +1.

**남은 위험 · 확인 못 함**
- 실기 미확인 전부 NOT_PROVEN: 공용 뷰어 + 시트 겹침·◁ 2단(Android·iPhone), PHT 입력(기기 시간대 한국으로 바꾼 iPhone), 순서 바꾸기 화살표 탭 크기.
- 범위 밖 발견(보고만): 이용 제한 계정은 `guardMoimWrite` 의 `isProductWriteDeniedMemberAccount` 때문에 **자기 글 삭제도** 막힌다 — D-36 취지와 부딪힐 수 있음. 위임 **거절**도 약관 동의를 요구한다(B5 와 같은 모양, 감사 목록에는 없음).

**남은 Owner 결정 (최소)**
1. 삭제된 모임(어드민 삭제)의 내 글·댓글·사진도 작성자가 지울 수 있게 할지. 이 설계는 「계약상 아무도 못 봄 + 어드민 복구 판단 중」이라 **제외**로 정했다. 포함하려면 S-2 의 삭제 모임 거부만 풀고 my-content 질의 조건 1개를 바꾸면 된다.

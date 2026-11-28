# 모임 R5 — 메신저 모임 방 결함 수정 설계 (A 묶음 · 2026-11-28)

- 대상: 전수 감사 `docs/audit/moim-full-defect-audit-2026-11-28.md` §2 「메신저 모임 방」 25건 전부 + §1 의 A1~A8·A14
  - 확정: A1·A2·A3·A4·A5·A6·A7·A8·A9·A10·A11·A13·A14·A18·A19·A21·A22·A23·신규1·신규2
  - 일부만 맞음: A16·A17·A20·A24·신규4
- 기준 코드: 운영 main `eac581f07` (작업 폴더 `samarket-wt-moim-r4`). 줄 번호는 이 커밋 기준이다.
- 근거 문서: 계약 `docs/design/moim/moim-design-v1-2026-11-12.md` §1~§4 · 시안 U8 · hard-lock `docs/dibay-messenger-domain-group-hard-lock.md` 「MOIM-owned GROUP rooms」 · R4 설계 `docs/audit/moim-r4-decisions-design-2026-11-28.md`
- 이 문서는 설계만이다. 저장소·DB·기기는 손대지 않았다(읽기만).
- 배포 구분(예정): **웹 + 운영 DB**(마이그레이션 1개 · A18). 네이티브 변경 없음. DB 적용 승인 → 적용 → 병합 순서. DB 가 먼저라 PR 은 자동 병합 예외(개발 프로세스 1번).

## 0. 이번 설계에 적용한 Owner 결정 (이미 정해짐)

| # | 결정 | 설계에 들어간 곳 |
|---|---|---|
| 결정 1 (A12) | 모임 방 판정이 **진행 중이거나 실패**하면, 비공개 그룹방은 모임 방으로 보고 메신저 관리 화면을 숨긴다. 실패는 영구 상태로 두지 않고 **다음 표시 때 다시 묻는다** | §2-2 캐시 상태 · §1 규칙의 `pending` |
| 결정 2 | 모임 방에는 메신저 관리·권한·역할·초대 화면을 **어디에도** 보이지 않는다. 규칙 하나, 도우미 하나를 모든 화면에 쓴다 | §1 「모임 방 표면 규칙」 |

- R4 #14 의 「실패하면 메뉴가 다시 보임」은 결정 1 로 바뀐다. R4 설계 문서 #14 줄과 hard-lock 문서에 정정 한 줄을 넣는다.
- 바뀌지 않는 것(통화 규정): 멤버 시트 [통화] 버튼·통화 시트·그룹 통화 칸(`isCmGroupCallEnabled()`)·통화 화면·통화 푸시는 **한 줄도 바꾸지 않는다**.

---

## 1. 뿌리 수정 ① — 「모임 방 표면 규칙」 하나

### 1-1. 지금 무엇이 잘못됐나 (원인)

- 모임 방인지에 따라 숨길지 정하는 조건이 화면마다 따로 있다.
  - `vm.isMoimRoom`, `vm.moimRoomOwner`, `moimRoleOwner`, `isPrivateGroupRoom && !isMoimRoom` 같은 조건이 서랍·방 정보·멤버 시트·타임라인·목록에 흩어져 있다.
- 그래서 빠진 곳이 생겼다.
  - 서랍 맨 위 카드는 `vm.isPrivateGroupRoom` 만 본다(A1).
  - 권한 설정 칸도 `vm.isPrivateGroupRoom` 만 본다(A4).
  - 멤버 시트 3칸 표도 `vm.isPrivateGroupRoom` 만 본다(A7).
  - 스와이프 「나가기」는 모임 방 여부를 아예 보지 않는다(A8).
- 판정 중 처리도 다르다(A22).
  - 「모임 방이면 X, 아니면 메신저 Y」로 짠 곳은 판정 중(`owner` 없음)에 메신저 Y 를 그린다.
  - 예: 서랍 공지 줄 `vm.isMoimRoom && vm.moimRoomOwner ? 모임 공지 : 메신저 공지`
  - 예: 역할 배지 `moimRoleOwner ? null : 배지`
  - 예: [1:1] `!moimOwner || canStartDm`

### 1-2. 새 도우미 (한 곳)

새 파일 `lib/moim/moim-room-surface-policy.ts`, 순수 함수 하나:

```ts
type MoimRoomSurfaceState = "not_moim" | "moim" | "pending";
resolveMoimRoomSurface(input: {
  roomType: string | null | undefined;      // 비공개 그룹(private_group)만 모임 방이 될 수 있다
  owner: MoimRoomOwner | null;              // /api/moim/rooms 결과
  ownerStatus: "resolved" | "loading" | "failed" | "none";  // §2-2 캐시 상태
  viewerUserId: string | null;
}): MoimRoomSurface
```

판정은 이렇게 한다.

| 입력 | state |
|---|---|
| 비공개 그룹이 아님 | `not_moim` |
| 비공개 그룹 + 응답 받음 + owner 있음 | `moim` |
| 비공개 그룹 + 응답 받음 + owner 없음 | `not_moim` |
| 비공개 그룹 + 판정 중 또는 실패 | `pending`(결정 1 — 모임 방처럼 숨김) |

돌려주는 값은 화면이 그대로 쓰는 표시 깃발이다. 화면에서 따로 조건을 만들지 않는다.

| 깃발 | not_moim | moim | pending |
|---|---|---|---|
| `messengerManagement` — 메신저 운영 UI 전부: 서랍 맨 위 카드·멤버 초대·초대 링크·가입 요청·차단 목록·권한 설정·메신저 공지·운영 이력·역할 배지·왕관·멤버 시트 3칸 표·「닉네임 프로필」·역할 변경·내보내기·차단·방장 위임·나가기(서랍·스와이프·길게 누르기)·방 삭제 | 보임(기존 권한 판정 그대로) | 숨김 | 숨김 |
| `moimEntry` — 「모임 홈」·「일정 보기」·「모임 공지」 줄 | 없음 | `homeOpen` 일 때만(§2-1) | 없음 |
| `startDirectChat` — 멤버 시트 [1:1 대화] | 보임 | `owner.canStartDm` | 숨김(판정 뒤 다시 그림) |
| `roomTypeLabelKey` | null(기존 문구) | `moim_room_type_moim` / `moim_room_type_schedule` | null + 종류 칸 생략 |
| `viewerRoleKey` — 내 역할 | null(기존) | `moimRoomMemberRoleKey(owner, viewer)` ?? `moim_role_member` | null(칸 생략) |
| `memberRoleKey(userId)` — 이름 옆 「· 운영진」 | null | 기존 `moimRoomMemberRoleKey` | null |
| `captionKey` — 방 정보·서랍 아래 안내 | null | §3 A21 | null |
| `readonlyNoticeKey` — 읽기 전용 이유 | null | §3 A16 | null |
| `identityChip` — 타임라인 칩 「내 신원 · 별칭」 칸 | 기존 | 생략 | 생략 |
| `memberSubtitleFallback` — 참가자 부제 대체 문구 | 기존(「별칭 참여」 등) | 없음(모임 소개만) | 없음 |

### 1-3. 도우미를 쓰는 곳 (전부 같은 단계에서 바꾼다)

| 화면 | 파일 · 함수 | 지금 | 바꿈 |
|---|---|---|---|
| 방 화면 공용 상태 | `lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts` — `isMoimRoom`(121줄)·`roomTypeLabel`·`myRoleLabel`·`can*` | 자체 판정 | `moimSurface = resolveMoimRoomSurface(...)` 를 vm 에 싣는다. `isMoimRoom` 은 `moimSurface.state !== "not_moim"` 로 남긴다(기존 호출처 호환). `canInviteMembers`·`canEditGroupNotice`·`canEditPrivateGroupMeta`·`canManageGroupPermissions`·`canManageMemberRoles`·`canKickGroupMembers` 는 `messengerManagement` 로 막는다. `canPinGroupMessage` 는 바꾸지 않는다(고정은 허용 쓰기 · hard-lock) |
| 서랍·방 정보·참가자 시트 | `CommunityMessengerRoomPhase2RoomSheets.tsx` | 조건 20여 곳 | 모두 `vm.moimSurface` 깃발로 바꾼다(§3 항목별) |
| 멤버 시트 | `CommunityMessengerRoomPhase2MemberActionModal.tsx` | `moimOwner` 직접 판정 | 같은 깃발. [통화] 줄(117~127줄)은 그대로 |
| 타임라인 칩·읽기 전용 안내 | `CommunityMessengerRoomPhase2MessageTimeline.tsx` 1925~1950줄 | 메신저 문구 | `roomTypeLabelKey`·`identityChip`·`readonlyNoticeKey` |
| 입력창 막힘 안내 2행 | `CommunityMessengerRoomPhase2Composer.tsx`(391줄 근처)·`CommunityMessengerRoomPass1ComposerShell.tsx`(163줄) | `room_readonly` 서버 문구 | 모임 방이면 `readonlyNoticeKey` 문구. Pass1 은 vm 전이라 `peekMoimRoomOwner` 캐시로 같은 함수를 부른다(캐시 없으면 기존 문구 · 위험 표 참고) |
| 머리글 | `CommunityMessengerRoomPhase2Header.tsx` 517줄 | `vm.isMoimRoom && moimRoomOwnerShowsHome` | `moimEntry` + 상태 줄(A24) |
| 채팅 목록 행 스와이프 | `MessengerChatListItem.tsx` 238·373~394줄 · `lib/messenger-policy/chat-room-swipe-actions.ts` `getSwipeActions` | 나가기 판정에 모임 없음 | `getSwipeActions` 에 입력 `moimManaged: boolean` 추가. true 면 leave 를 빼는 것을 `shouldOmitSwipeLeaveAction` 과 같은 자리에서 한다. 목록 행은 이미 부르는 `useMoimRoomOwner` 대신 상태 훅(§2-2)으로 `pending` 도 받는다 |
| 길게 누르기 메뉴 | `MessengerChatRoomActionSheet.tsx` 180~184줄 | 자체 판정(실패 = 보임) | 같은 도우미 |
| 홈 나가기 실패 안내 | `CommunityMessengerHome.tsx` 3327~3343줄 | 그대로 | 바꾸지 않는다(서버 거부 때의 마지막 안전장치로 남김). 「모임 홈」 동작은 `moimEntry` 규칙(§2-1)을 같이 쓴다 |

- hard-lock 문서 「MOIM-owned GROUP rooms」 표의 「화면」 줄에 한 줄을 더한다.
  - 내용: 표면 규칙은 `lib/moim/moim-room-surface-policy.ts` 하나 · 판정 중·실패 = 숨김(결정 1)
- 「구조 확인」 시험 1개: 위 7개 파일에 `isPrivateGroupRoom ?`(모임 깃발 없는 단독 조건)이 관리 UI 자리에 남지 않았는지 본다. 이 시험은 동작 시험이 아니라 구조 확인이라고 이름에 적는다.

---

## 2. 뿌리 수정 ② — 모임 방 판정 응답과 캐시

### 2-1. 서버 `app/api/moim/rooms/route.ts` — GET (A11 · 신규2 · A9 · A16 · A24 기반)

**원인 (A11 · 신규2)**

- 모든 조회가 `{ data }` 만 받고 `error` 를 버린다.
  - 참여 행 조회(103~110줄), 방 조회(113~117줄), 모임·일정 조회(122~125줄), 빠진 모임 조회
- DB 오류가 나면 이렇게 된다.
  - 참여·방 조회 오류 → `ok:true, owners:{}`. 클라이언트는 이것을 「모임 방 아님」으로 세션 끝까지 기억한다 → 메신저 메뉴가 전부 보인다
  - 모임 조회만 오류 → owner 는 있는데 `moimStatus:null`·역할 `{}`·`canStartDm:false` → 삭제된 모임에도 「모임 홈」 재노출 · 역할 표시 사라짐 · [1:1] 숨김

**바꿈**

1. 조회 4곳 모두 `error` 를 본다. 하나라도 오류면 `503 { ok:false, error:"moim_rooms_unavailable" }`.
   - 오류 코드 문구는 화면에 띄우지 않는다. 클라이언트 판정 상태에만 쓴다.
2. 모임 행을 못 찾으면(오류 없이 빈 결과) `moimStatus:null`.
   - 클라이언트는 null 을 「진입점 숨김」으로 본다(`moimRoomOwnerShowsHome` 정정).
   - 옛 응답 호환 문구는 지운다. 웹 배포는 서버·화면이 함께 바뀌므로 옛 서버 응답이 새 화면에 오지 않는다.
3. 같은 조회에 열만 더한다. 요청 수는 그대로다.
   - `moims`: `retention_ended_at` 을 더한다(`platform_state` 는 이미 읽음)
   - `moim_schedules`: `status, starts_at` 을 더한다
4. DTO(`MoimRoomOwnerDto` · 클라이언트 `MoimRoomOwner`)에 3칸을 더한다.
   - `homeOpen: boolean` — 「모임 홈」·「일정 보기」·「모임 공지」가 열리는가
     - 모임이 deleted 면 false
     - 모임이 closed 이고 `retention_ended_at` 이 있으면 false
     - 모임 행이 없으면 false
     - 그 밖에는 true
   - `readonlyReason`: `"moim_deleted" | "moim_blocked" | "moim_closed" | "schedule_cancelled" | "schedule_done" | null`
     - 앞쪽이 우선이다
     - 차단 = `platform_state='blocked'`
     - 일정은 schedules `status` 로 정한다
   - `scheduleStartsAt: string | null` — 일정 방 목록 행·머리글(A24)
   - 기존 `moimStatus` 는 남긴다(다른 호출처 `CommunityMessengerHome` 이 쓴다)

**함께 바꾸는 호출처**

- `lib/moim/use-moim-room-owner.ts` 의 `moimRoomOwnerShowsHome` 은 `owner.homeOpen === true` 로 바꾼다.
- 쓰는 곳 4개(머리글·서랍·방 정보·홈 나가기 안내)는 함수 이름을 그대로 쓰므로 같이 따라온다.

**시험** — `lib/moim/__tests__/moim-r5-rooms-route.test.ts` (가짜 Supabase · 기존 `moim-r4-m.test.ts` 의 `fakeSb` 방식)

| 시험 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 참여 행 조회가 오류 | 200 `ok:true owners:{}` (FAIL) | 503 `ok:false` |
| 방·모임·일정 조회가 각각 오류 | 200(FAIL) | 503 |
| 종료 + `retention_ended_at` 있는 모임 | `moimRoomOwnerShowsHome` = true(FAIL) | `homeOpen:false` → false |
| 차단 모임 · 종료 모임 · 삭제 모임 · 끝난 일정 · 취소된 일정 | `readonlyReason` 없음 | 각 값 |

**위험**

- 일시 오류에 503 이 늘어난다.
- 그동안 비공개 그룹방은 메신저 관리 UI 가 숨는다(결정 1 이 받아들인 대가). 다음 표시 때 다시 묻는다.

### 2-2. 클라이언트 캐시 `lib/moim/use-moim-room-owner.ts` (A11 · A12 · A13 · A22)

**원인**

- 성공한 답은 모듈 `Map` 에 앱 종료 전까지 남는다(46~55·94~103줄). 그래서 다음이 화면에 안 보인다(A13 · 실기 16:20 확인).
  - 모임 삭제
  - 역할 변경
  - `start_dm` 권한 변경
  - 계정 전환
- 실패는 `failed` 에 넣고 「판정 끝」으로 친다. 그래서 메뉴가 보인다(R4 #14 · 결정 1 위반).

**바꿈** — 방별 상태를 다음 4가지로 둔다.

| 상태 | 뜻 | 표면 규칙 |
|---|---|---|
| `none` | 아직 묻지 않음 | 요청을 걸고 `loading` |
| `loading` | 묻는 중 | `pending`(숨김) |
| `failed` | 실패 | `pending`(숨김) · 다음 표시 때 다시 묻는다 |
| `resolved` | 답 받음 | 값 그대로. 기억한 시각 `fetchedAt` |

1. **실패는 「판정 끝」이 아니다.**
   - `peekMoimRoomOwnerResolved` 는 `resolved` 일 때만 true 다.
   - 실패한 방은 다음 경우에 다시 묻는다(결정 1 「다음 표시 때 다시」).
     - 화면이 그 방을 다시 구독할 때(훅 마운트·방 목록 키 변경)
     - 방을 열 때
     - 앱으로 돌아올 때
   - 목록 행은 스크롤로 마운트가 잦다. 그래서 실패 뒤 **30초 안**에는 다시 묻지 않는다.
   - 타이머로 되풀이하지 않는다. 자동 재시도 반복 금지 규칙을 지킨다.
2. **다시 묻는 규칙**(`revalidate`). 다시 묻는 동안에는 예전 값을 계속 보여 준다. 화면이 깜빡이거나 pending 으로 돌아가지 않는다.

   | 언제 | 무엇을 | 구현 자리 |
   |---|---|---|
   | 방을 열 때 | 그 방 1개. 마지막 답이 60초보다 오래됐을 때만 | `use-messenger-room-phase2-room-presentation.ts` 에서 `revalidateMoimRoomOwner(roomId)` 를 방 id 기준 마운트 1회 |
   | 앱으로 돌아올 때(60초 이상 숨김) | 지금 화면에 구독 중인 방 전부를 한 요청(100개씩)으로 | 복귀 조정자 작업 1개 등록: `registerAppResumeTask({ id:"moim-room-owner-revalidate", lane:"background", auth:"required", minHiddenMs:60_000 })`. 구독 중인 방은 훅이 세는 참조 수 `subscribed` 로 안다 |
   | 내가 모임에서 무엇을 바꾼 뒤 (나가기·역할·권한·프로필·삭제·종료 등 모든 모임 쓰기) | 캐시 전부를 「오래됨」으로 표시하고 구독 중인 방만 다시 묻는다 | `lib/moim/moim-client-api.ts` 의 `call()` 에서 GET 이 아니면 이미 `invalidateMoimDetailCache()` 를 부른다(48·67줄). 바로 옆에서 `markMoimRoomOwnersStale()` 를 부른다. 쓰기 경로 하나라 빠지는 버튼이 없다 |
   | 로그아웃·계정 전환 | 캐시·실패·대기 전부 비움 | `lib/auth/client-session-wipe.ts` 의 `wipeClientSessionState` 목록에 `clearMoimRoomOwnerCacheForAuthChange()` 한 줄. 이 모듈이 로그아웃·계정 전환의 단일 정리 지점이다 |

3. 다른 사람이 바꾼 것은 「방 열기·앱 복귀」 때 따라온다.
   - 예: 운영진이 내 역할을 바꿈, 어드민이 모임을 삭제함
   - 실시간 구독은 더하지 않는다. 요청 예산 때문이다.
4. 공개 함수
   - 새로 만든다: `useMoimRoomOwnerState(roomId)` → `{ owner, status }`
   - 기존 `peekMoimRoomOwnerResolved`·`useMoimRoomOwner`·`useMoimRoomOwners` 는 이름을 유지하고 속만 바꾼다
   - 호출처 7곳은 §1-3 표와 같다

**시험** — `lib/moim/__tests__/moim-r5-room-owner-cache.test.ts` (fetch 를 가짜로 바꿈)

| 시험 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 응답 503 → 판정 끝인가 | true, 메뉴 보임(FAIL) | false · 표면 `pending` |
| 실패 30초 뒤 다시 구독 → 다시 묻는가 | 한 번 더 묻지만 실패 상태가 「끝」 | 다시 묻고, 성공하면 `moim` |
| 받은 지 61초 된 방을 열면 다시 묻는가 / 그 사이 값이 유지되는가 | 묻지 않음(FAIL) | 1회 묻고, 그동안 예전 값 유지 |
| 역할 맵이 바뀐 응답 → 화면 값이 바뀌는가 | 안 바뀜(FAIL · A13 재현) | 바뀜 |
| 모임 쓰기(`moimApi` POST) 뒤 구독 중인 방만 다시 묻는가 | 안 물음(FAIL) | 물음 |
| `wipeClientSessionState` 뒤 캐시가 비는가 | 남음(FAIL) | 빔 |
| 복귀 작업이 `minHiddenMs` 60초로 등록되는가 | — | 등록됨 |

**위험**

- `/api/moim/rooms` 요청 수가 늘어난다(§8 요청 예산).
- 복귀 작업은 통화 중이면 조정자가 건너뛴다(background 레인 규칙). 그 경우 다음 방 열기 때 따라온다.

---

## 3. 항목별 설계

표기: 「보는 것」 = 수정 뒤 사용자가 보는 화면. 「영향」 = 같은 코드를 쓰는 다른 화면과, 같은 단계에서 그 화면을 지키는 방법.

### A1 · 서랍 맨 위 「비공개 그룹 · 채팅방 설정」 카드 + 「멤버 초대」

- 바꿈: `RoomSheets.tsx` 376줄 `vm.isPrivateGroupRoom ? (카드)` → `vm.isPrivateGroupRoom && vm.moimSurface.messengerManagement`
  - 카드 안에 있는 것: 이름 편집, 멤버 초대, 초대 링크 복사, `GroupJoinRequestsSection`, `GroupBlockedMembersSection`
- 보는 것: 모임 방 서랍은 사진·이름·인원 줄로 시작한다. 판정 중에도 카드가 없다.
- 영향
  - 일반 비공개 그룹: 같은 조건에 판정 결과 `not_moim` 이 들어가므로 그대로 보인다.
  - 일반 그룹도 판정 중·실패 동안에는 카드가 숨는다(결정 1).
- 시험: 표면 규칙 표 시험(§7-1)의 `messengerManagement` 3상태
- 위험: 일반 그룹에서 판정 응답 전 0.1~수백 ms 동안 카드가 없다. 응답이 오면 나타난다(설계상 감수).

### A2 · 서랍 요약 「방장」/「내 역할 admin·member」

- 바꿈: `RoomSheets.tsx` 479줄 `· {vm.myRoleLabel}`
  - moim → `· {t(viewerRoleKey)}` (모임장·부모임장·운영진·멤버)
  - pending → 「· 역할」 칸 생략
  - not_moim → 기존 `myRoleLabel`
- `presentation.ts` 281~285줄 `myRoleLabel` 은 모임 방이면 `viewerRoleKey` 문구를 돌려준다. 그러면 이 값을 쓰는 방 정보 카드(A3·A5)도 같이 맞는다.
- 보는 것: 「12명 · 운영진」
- 영향: `myRoleLabel` 을 쓰는 곳 4곳(서랍 요약, 방 정보 「내 상태」, 「내 역할」 줄, 운영 칸 배지)
  - 운영 칸은 모임 방에서 이미 숨는다
  - 오픈채팅 칸(1440줄)은 `snapshot.myRole` 을 직접 써서 영향 없음
- 범위 밖(보고만): 일반 그룹·오픈채팅에도 「내 역할 admin」 영어 원값이 그대로 남는다(같은 키 `nav_messenger_my_role_label` 에 원값). 이번에 고치지 않는다.
- 시험: 표면 규칙 시험 — 부모임장 → `moim_role_co_host`, 멤버(역할 맵에 없음) → `moim_role_member`, pending → null

### A3 · 방 정보 「방장 {이름}」「내 역할」「멤버 초대: 제한」

- 바꿈: `RoomSheets.tsx` 1072~1080·1110~1115줄
  - 「방장」 줄은 `messengerManagement` 일 때만 보인다. 모임 방은 이름 옆 역할 표시로 모임장을 보여 준다. 또 `ownerLabel` 은 메신저 프로필 이름이라 DIBAY 닉네임일 수 있다.
  - 「내 역할」 줄의 값 = `myRoleLabel`(A2 로 모임 역할). pending 이면 줄 생략.
  - 「멤버 초대: 허용/제한」 줄은 `messengerManagement` 일 때만 보인다.
- 보는 것: 기본 정보 = 방 종류(「모임 채팅방」), 참가자 N명, 내 역할 「운영진」
- 영향: 일반 비공개 그룹은 그대로다.
- 시험: 표면 규칙 시험 + 구조 확인

### A4 · 방 정보 「권한 설정」 칸(체크박스 6개)

- 바꿈: `RoomSheets.tsx` 1346줄 `vm.isPrivateGroupRoom ?` → `vm.isPrivateGroupRoom && vm.moimSurface.messengerManagement`
- 같은 칸으로 바로 가는 `openInfoSheet("permissions")` 버튼은 운영 칸(1181줄) 안에 있고, 운영 칸은 모임 방에서 이미 숨는다.
- 보는 것: 모임 방 방 정보에 권한 칸이 없다(hard-lock 「권한 숨김」과 일치).
- 영향
  - `groupPermissionsSectionRef` 로 스크롤하는 코드는 칸이 없으면 동작하지 않는다
  - 모임 방에서는 그 진입 버튼도 없으므로 깨지는 경로가 없다
- 시험: 표면 규칙 시험

### A5 · 방 정보 위쪽 카드 「비공개 그룹」「기본 프로필」「기본 입장 · 초대 기반」「참가자 › 멤버 관리」

- 바꿈: `RoomSheets.tsx` 986·1000~1008·1033줄

  | 카드 | moim | pending |
  |---|---|---|
  | 참가자 카드 둘째 줄(`roomTypeLabel`) | 「모임 채팅방」/「일정 채팅방」(A6 과 같은 값) | 줄 생략 |
  | 내 상태 카드 | 값 = 모임 역할, 둘째 줄 = 「모임 프로필」(새 키) | 값·둘째 줄 생략 |
  | 참여 방식 카드 | 「모임에 가입하면 들어와요」/「참여가 확정되면 들어와요」(새 키, 계약 §2 「들어오는 방법」) | 카드 생략 |
  | 3칸 버튼 「참가자 › 멤버 관리」 | 「참가자 › 멤버 보기」(새 키 `moim_room_members_view`) | 「멤버 보기」 |

  같은 참가자 시트를 연다. 그 시트에는 초대 버튼이 이미 `canInviteMembers` 로 막혀 있다.
- 보는 것: 화면 낱말이 실제 동작과 맞는다. 모임 방은 「관리」할 수 없고 보기만 한다.
- 영향: 일반 그룹은 `not_moim` 이라 기존 문구 그대로다.
- 시험: 표면 규칙 시험 — 키 값

### A6 · 타임라인 칩·방 정보 「채팅방 종류」 = 「비공개 그룹」

- 바꿈: `presentation.ts` 의 `roomTypeLabel` 계산(230줄대)
  - moim → `t(roomTypeLabelKey)`
  - pending → `""`
- 타임라인 칩 `Timeline.tsx` 1938줄은 값이 비면 종류 칸과 뒤따르는 「 · 」를 쓰지 않는다.
  - 방법: 칩 조각을 배열로 모아 `join(" · ")` 하는 방식으로 바꾼다
  - 그룹 결함 D4 의 「구분자는 코드에서」 규칙을 지킨다
- 같은 칩의 「내 신원 · 별칭」 조각(1944~1948줄)은 `identityChip` 이 false 면 뺀다.
- 보는 것: 칩 「모임 채팅방 · 멤버 18명」
- 영향: `roomTypeLabel` 을 쓰는 곳은 방 정보 2곳과 칩 하나다. 모두 같은 값이라 함께 맞는다.
- 시험: 표면 규칙 시험(키) + 칩 조각 만드는 순수 함수 `buildRoomTimelineChipParts` 를 따로 빼서 시험한다
  - 모임: 「비공개 그룹」·「별칭」이 없다
  - pending: 종류 칸이 없고 앞 구분자도 없다

### A7 · 멤버 시트 「역할 변경: 제한 / 내보내기: 제한 / 방장 위임: 가능」, 「· 닉네임 프로필」

- 바꿈: `MemberActionModal.tsx`
  - 93~110줄 3칸 표 `vm.isPrivateGroupRoom ?` → `&& vm.moimSurface.messengerManagement`
  - 95줄 「· 닉네임 프로필」은 `messengerManagement` 일 때만 붙인다
  - 86~92줄 역할 줄
    - moim → 모임 역할(기존)
    - pending → 줄 생략. 지금은 판정 중에 메신저 역할을 보여 준다(A22)
  - 운영 버튼들(위임·역할·내보내기·차단)은 이미 `canManageMemberRoles`·`canKickGroupMembers` 를 보고, 두 값은 §1-3 에서 막힌다
- 보는 것: 모임 방 멤버 시트 = 이름 · 모임 역할 / [1:1 대화](권한 있을 때) / [통화] / 신고
- 영향: [통화] 버튼·통화 시트 코드는 바꾸지 않는다(통화 규정).
- 시험: 표면 규칙 시험 + 구조 확인(3칸 표 조건)

### A8 · 채팅 목록 스와이프 「나가기」가 모임 방에도 보임

- 바꿈
  - `lib/messenger-policy/chat-room-swipe-actions.ts` `getSwipeActions` 에 입력 `moimManaged?: boolean` 추가
    - true 면 `omitLeave` 를 켠다
    - 기본·오픈채팅·주문 3가지 갈래가 모두 같은 `omitLeave` 를 쓰므로 한 줄로 끝난다
  - `MessengerChatListItem.tsx` 는 상태 훅으로 `moimManaged = surface.state !== "not_moim"` 를 넘긴다
    - 비공개 그룹일 때만 묻는다. 지금도 같은 조건으로 묻는다(238줄)
- 보는 것: 모임·일정 방 행을 밀면 보관·읽음만 나온다. 확인창 「그룹 나가기」와 서버 거부(409)를 더는 만나지 않는다.
- 영향
  - 일반 비공개 그룹: 판정 중·실패 동안 나가기가 잠깐 없다(결정 1)
  - `CommunityMessengerHome.tsx` 3292~3305줄 확인창과 3327줄 거부 안내는 다른 경로(옛 앱 화면·경쟁)의 안전장치로 남긴다
- 시험: `lib/messenger-policy/__tests__/chat-room-swipe-actions-moim.test.ts`
  - `getSwipeActions({ moimManaged:true, listContext:"default" })` 에 leave 가 없다(고치기 전: 있음)
  - 오픈채팅·주문 갈래도 같다
- 위험: 낮음

### A9 · 열람 기간이 끝난 종료 모임 「모임 홈」 → 열리지 않음

- 바꿈: §2-1 `homeOpen`(retention 반영) → `moimRoomOwnerShowsHome` → 진입점 4곳이 숨는다.
- 보는 것: 진입점 없이 읽기 전용 안내(A16)만 보인다.
- 영향: 일정 방 「일정 보기」도 같은 규칙이다. 모임 열람이 끝나면 일정 상세도 모임 아래 경로라 함께 숨긴다.
- 시험: §2-1 route 시험

### A10 · 삭제 모임에 「모임 공지」 줄 남음 · 조회 실패를 「공지 없음」으로

- 바꿈
  - `RoomSheets.tsx` 517줄: `MoimRoomNoticeMenuItem` 은 `moimEntry` 일 때만 그린다(삭제·열람 끝·pending 이면 줄 없음)
    - pending 이면 메신저 공지 줄도 그리지 않는다(A22)
  - `components/moim/MoimRoomNoticeMenuItem.tsx` 조회 실패(`!r.ok`)는 상태 `"failed"` 로 둔다
    - 안내 = 「공지를 불러오지 못했어요」(새 키)
    - 누르면 모임 홈으로 간다
    - 지금은 실패를 「모임 공지 보기」(공지 없음과 같은 글)로 보여 준다
- 보는 것: 삭제 모임 서랍에 공지 줄이 없다. 실패하면 실패라고 보인다.
- 영향: 요청 수 그대로(서랍을 열 때 1회, 기존과 같음).
- 시험: `MoimRoomNoticeMenuItem` 의 상태 판정을 순수 함수 `resolveMoimRoomNoticeRow(result)` 로 빼서 시험
  - 실패 → `failed`(고치기 전: 공지 없음과 같음)

### A11 · 신규2 — §2-1·§2-2

### A13 — §2-2

### A14 · A23 — §4

### A16 · 신규1 · 읽기 전용 안내가 이유 없는 「제한 상태」이고 두 문장이 겹침

- 원인
  - `Timeline.tsx` 1925~1933줄: 방이 active 이고 `isReadonly` 이면 「이 방은 현재 제한 상태입니다.」 뒤에 「현재 읽기 전용 상태입니다.」를 붙인다(두 문장 · 신규1)
  - 모임 방은 왜 읽기 전용인지(종료·차단·삭제·일정 끝) 말하지 않는다
- 바꿈
  1. 모임 방(`readonlyNoticeKey` 있음) → 그 한 문장만
     - 종료: 「종료된 모임이라 읽기만 할 수 있어요」
     - 차단: 「운영 정책으로 제한된 모임이라 읽기만 할 수 있어요」
     - 삭제: 「삭제된 모임이라 읽기만 할 수 있어요」
     - 일정 끝: 「끝난 일정이라 읽기만 할 수 있어요」
     - 일정 취소: 「취소된 일정이라 읽기만 할 수 있어요」
  2. 그 밖의 방에서 active + 읽기 전용이면 `nav_messenger_room_readonly_notice` 한 문장만(신규1)
     - blocked·archived·그 밖 제한은 기존 문장 그대로
  3. 입력창 막힘 안내 2행(§1-3 Composer 2곳)도 모임 방이면 같은 키를 쓴다. 한 화면에 두 문구가 다르게 나오지 않는다.
- 보는 것: 「종료된 모임이라 읽기만 할 수 있어요」 한 줄
- 영향
  - 신규1 수정은 모든 읽기 전용 방에 적용된다. 문장이 하나 빠질 뿐이다.
  - 문구 결정은 `messenger-room-chat-unavailable.ts`(서버 거부 코드 어휘)를 바꾸지 않는다. 표시 문구만 바꾼다.
- 시험: 안내 문장 고르는 순수 함수 `resolveRoomReadonlyNotice({ room, surface })` 를 빼서 시험
  - active+readonly 일반 방 → 한 문장(고치기 전 두 문장)
  - 모임 종료 → 종료 문장
- 위험: 입력창 Pass1 셸은 캐시가 없으면 첫 순간 기존 문구다. 방 화면 2단계에서 바로 바뀐다. 실기에서 깜빡임 확인 필요(NOT_PROVEN 으로 남김).

### A17 · 신규4 · 대화상대 목록 왕관 + 「참여자 및 초대 · 전체 보기」

- 원인
  - 왕관 = 메신저 방장
  - 일정 방의 메신저 방장 = 일정 호스트인데, 이름 옆 역할은 모임 역할이다. 그래서 왕관(일정 호스트)과 「· 모임장」이 서로 다른 사람을 가리킬 수 있다(신규4)
- 바꿈: `RoomSheets.tsx`
  - 636~645줄 왕관은 `messengerManagement` 일 때만 그린다
  - 679줄 「참여자 및 초대 · 전체 보기」 → moim·pending 이면 「멤버 전체 보기」(새 키)
- 보는 것
  - 모임 방은 왕관 없이 「준호 · 모임장」, 「소희 · 운영진」(시안 U8)
  - 일정 방도 모임 역할만 보인다. 왕관과 역할이 엇갈리지 않는다.
- 영향: 일반 그룹은 그대로다.
- 시험: 표면 규칙 시험(`messengerManagement`)
- 위험: 일정 방에서 「일정 호스트」 표시가 없어진다. 시안 U8 에도 없다. 일정 호스트는 「일정 보기」 화면에 있다.

### A18 · 참가자 부제 「별칭 참여」 · 모임 소개가 방으로 안 감 — §5

### A19 · 모임 사진을 비우면 DIBAY 사진 — §5

### A20 · 서랍·방 정보 「운영 이력」 칸

- 바꿈: `RoomSheets.tsx` 684~703(서랍)·1414~1442(방 정보) `vm.managementEventMessages.length ?` → `&& messengerManagement`
- 보는 것: 모임 방에는 운영 이력 칸이 없다. 모임 운영 기록은 모임 운영 화면에 있다.
- 영향: 일반 그룹은 그대로다.
- 확인 못 함: 모임 방에 실제로 관리 이벤트 메시지가 생기는지(감사 「실제 표시 여부 미확인」). 가드를 넣으므로 생겨도 안 보인다.
- 시험: 표면 규칙 시험

### A21 · 「멤버 초대·내보내기·나가기는 모임 홈에서」가 일정 방·삭제 모임·일반 멤버에 안 맞음

- 원인
  - 문구 하나(`moim_room_managed_in_moim`)를 모든 모임 방에 쓴다(750·1281줄)
  - 일반 멤버는 초대·내보내기를 못 하고, 일정 방은 일정에서 나가며, 삭제 모임에는 모임 홈이 없다
- 바꿈: `captionKey`

  | 경우 | 문구 |
  |---|---|
  | 모임 방 + `homeOpen` | 「모임 멤버 모두의 채팅방이에요. 모임을 나가면 채팅방에서도 나가요」 |
  | 일정 방 + `homeOpen` | 「참여가 확정된 사람의 채팅방이에요. 참여를 취소하면 채팅방에서도 나가요」 |
  | `homeOpen` false(삭제·열람 끝) | 안내 없음(읽기 전용 안내 A16 이 이유를 말한다) |
  | pending | 없음 |

  계약 §2 「나가는 방법」 표와 같은 사실이다. 역할과 상관없이 맞는 문장이다.
- 기존 키 `moim_room_managed_in_moim` 은 쓰는 곳이 없어진다. 카탈로그에서 지운다. i18n 검사 「개수 늘면 실패」에는 문제없다.
- 보는 것: 삭제 모임 방(실기 16:21 화면)에는 잘못된 안내가 없다.
- 시험: 표면 규칙 시험 — 4경우의 키

### A22 · 판정 중 순간 메신저 공지·역할 배지·[1:1]

- 바꿈: §1 `pending` 깃발로 다음 세 곳을 모두 막는다.
  - 공지 줄(517줄의 else 갈래)
  - 역할 배지(649·880줄 `moimRoleOwner ? null : 배지` → `messengerManagement ? 배지 : null`)
  - [1:1](`startDirectChat`)
- 보는 것: 판정 중에는 그 자리가 비어 있다가, 모임 방이면 모임 표시가, 일반 방이면 메신저 표시가 나타난다.
- 시험: 표면 규칙 시험 — pending 일 때 세 깃발 모두 false

### A24 · 일정 방 목록 행 둘째 줄·머리글이 시안 U8 과 다름

- 시안 U8
  - 일정 방 행 = 「📅 토요일 정기 게임 [일정] / BGC 배드민턴 · 11/15 오후 6시」
  - 모임 방 머리글 = 「🏸 BGC 배드민턴 · 멤버 18 [모임 홈 ›]」
- 확인 못 함: 지금 일정 방 행 둘째 줄과 머리글 상태 줄의 실제 화면 글자(감사 「일부만 맞음」, 실기 미확인)
- 바꿈(시안대로 · 승인 시안 = 구현 규칙)
  1. `MessengerChatListItem.tsx`: 일정 방(`owner.kind==="schedule"`) 행 둘째 줄 = `{moimName} · {scheduleStartsAt}`
     - 시각은 모임 일정 화면과 같은 PHT 표시 함수를 쓴다
     - 판정 전·실패면 기존 둘째 줄
     - 캐시만 쓴다(추가 요청 0)
  2. 머리글 상태 줄(`Header.tsx` `resolveMessengerRoomHeaderStatusLine` 입력)
     - 모임 방 = 「멤버 {count}」(새 키), 일정 방 = `{moimName} · {일정 시각}`
     - 입력 중 표시가 있으면 입력 중이 우선이다(기존 규칙)
- 영향
  - 일정 방 행에서 마지막 메시지 미리보기가 둘째 줄에서 빠진다(시안 그대로). 안 읽은 수 배지는 그대로다.
  - 모임 방 행은 바꾸지 않는다(시안도 「준호: …」 미리보기)
- 시험: 행 둘째 줄을 고르는 순수 함수 `resolveMoimScheduleListSubline(owner, formatter)` 시험 + 머리글 상태 입력 시험
- 위험: 목록 행은 핫 경로다. 계산은 캐시 읽기 하나라 렌더 비용이 거의 없다.

---

## 4. 알림 — 모임 프로필로 표시 (A14) · 고정 알림이 방 알림 끄기를 따름 (A23)

### 4-1. A14 · 푸시·알림함·앱 안 배너에 DIBAY 닉네임·@ID·사진

**원인**

- 서버 `lib/notifications/display/load-message-notification-display-context.ts`
  - 보낸 사람을 `profiles` 에서 읽는다(237~268·285~307줄)
  - 이름 = 닉네임, 없으면 `@아이디`(`resolveSenderDisplayName` 29~32줄)
  - 사진 = DIBAY 사진
  - 모임 방도 같다. 방 프로필(`community_messenger_room_profiles` 의 별칭·사진)을 보지 않는다.
- 이 값이 쓰이는 곳
  - 푸시 문구(`notify-message-pipeline.ts`)
  - 알림함에 저장되는 문구·사진(`persistence-consumer.ts` 가 같은 함수를 쓴다)
- 계약 §4: 「보이지 않는 것: DIBAY ID」

**바꿈 (서버 · 요청 수 0 증가)**

1. `loadCmRoomRowForNotify(sb, roomId, senderUserId)`
   - 같은 방 행 조회의 select 에 `owner_domain` 과 묶음 조회 `community_messenger_room_profiles(user_id, identity_mode, display_name, avatar_url)` 를 더한다
   - 조건 `.eq("community_messenger_room_profiles.user_id", sender)`
   - 외래키(room_profiles.room_id → rooms.id)가 있어 묶음 조회가 된다
   - 같은 1요청이다
2. `owner_domain === 'moim'` 이면 보낸 사람을 이렇게 정한다.
   - 이름 = 방 프로필 `display_name`. 비면 빈 값 → 받는 사람 언어 「회원/Member」(`notify_peer_fallback`)
   - **닉네임·@아이디로 대신 채우지 않는다**
   - 사진 = 방 프로필 `avatar_url`. 없으면 null(사진 없음). DIBAY 사진으로 대신 채우지 않는다(A19 와 같은 규칙)
3. 모임 방이 아니면 지금과 똑같다.
   - 오픈채팅 별칭 방도 이번에는 바꾸지 않는다(범위 밖 · §9)
4. `trade_legacy` 갈래도 같은 함수를 쓴다. 모임 방이 아니라 결과는 그대로다.

**바꿈 (앱 안 배너 · 요청 수 0 증가)**

- 배너 문구는 이렇게 만들어진다.
  - `cm-participant-unread-full-effects.ts` → `buildMessengerInAppBannerContent`
  - 보낸 사람 = 캐시된 방 스냅샷의 `members` 이름(서버가 이미 방 프로필로 바꾼 값). 없으면 `message.senderLabel`
- 확인 못 함: `messages?latest=1` 응답의 `senderLabel` 이 방 프로필 이름인지. 코드상 `profileById`(메신저 프로필)로 만든다.
- 바꿈
  - `buildMessengerInAppBannerContent` 에 입력 `moimManaged: boolean` 을 더한다
    - 호출부가 `peekMoimRoomOwner`/상태로 정한다. 비공개 그룹 + 판정 전이면 true(결정 1 과 같은 방향)
  - true 이고 `members` 에서 보낸 사람을 못 찾으면 이렇게 한다
    - `message.senderLabel`·방 사진을 쓰지 않는다
    - 본문은 보낸 사람 이름 없이 미리보기만 쓴다
    - 제목 = 방 이름(모임 이름), 사진 없음
  - `buildMessageNotificationDisplay` 에 선택 입력 `omitSenderPrefix` 를 더한다. 기본 false 라 다른 호출처는 그대로다.
- members 를 찾으면: 이름 = 모임 별칭, 사진 = 모임 사진(A19 서버 수정 뒤에는 DIBAY 사진으로 대신 채우지 않음)

**영향**

- 바뀌는 것: 푸시·알림함·배너 세 곳이 같은 규칙으로 바뀐다.
- 통화 푸시
  - `lib/push/**`·VoIP/FCM 통화 발송·부재중 배너(`missed-call-event-banner.ts`)는 손대지 않는다
  - 바꾸는 함수는 메시지 표시 맥락 함수뿐이다. 통화 경로는 이 함수를 부르지 않는다(호출처 = `notify-message-pipeline.ts`·`persistence-consumer.ts` 2곳, 확인함)
- 이미 저장된 알림함 행: 고치지 않는다(지난 알림은 저장된 문구 그대로). 새 알림부터 바뀐다.

**시험** — `lib/notifications/__tests__/moim-room-notification-identity.test.ts` (가짜 Supabase)

| 시험 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 모임 방 + 방 프로필 별칭「민지(초보)」 | 닉네임 | 「민지(초보)」 |
| 사진 | DIBAY 사진 | 모임 사진 |
| 모임 방 + 별칭 빈칸 + 닉네임 없음 + 아이디 있음 | `@아이디`(FAIL) | 「회원」 |
| 모임 방 + 방 프로필 사진 없음 | DIBAY 사진(FAIL) | null |
| 일반 그룹 | — | 지금과 같음 |
| 배너: 모임 방 + members 없음 | `senderLabel` 사용 | 이름 없는 본문 |
| 요청 수: 공유 맥락 1회 호출의 `from()` 횟수 | — | 고치기 전과 같음 |

**위험**

- 묶음 조회 문자열이 틀리면 방 행 조회가 오류 → 모든 메시지 알림 방 이름이 대체 이름으로 바뀐다.
- 그래서 시험에서 select 문자열과 오류 처리를 고정한다. 또 묶음 조회가 실패하면 묶음 없이 다시 읽지 않고, 보낸 사람만 「회원」으로 둔다(방 이름은 지킨다).

### 4-2. A23 · 메시지 고정 알림이 방 알림 끄기를 무시

**원인**

- `lib/community-messenger/group/group-room-pin-notify.ts` 26~55줄
  - 받는 사람을 고를 때 `is_muted` 를 보지 않는다
  - 모두에게 `mutedSnapshot:false` 로 알림을 만들고 푸시를 보낸다
- 메시지 알림은 같은 상황에서 푸시·소리를 끈다(`notify-message-pipeline.ts` 316~322줄 `room_muted`)

**바꿈**

1. 받는 사람 조회 select 를 `user_id` → `user_id, is_muted` 로 바꾼다. 같은 요청이다.
2. 알림 끈 사람은 이렇게 한다(메시지 알림과 같은 규칙).
   - 알림함 행은 만든다
   - `mutedSnapshot:true`, `pushSuppressedReason:"muted_room"`, `soundSuppressedReason:"muted_room"`
   - `dispatchNotificationPushIfAllowed` 를 부르지 않는다
3. `pushSuppressedReason` 값은 이미 있는 어휘를 쓴다. 새 값을 만들지 않는다.

**영향**

- 이 함수는 모든 그룹방의 고정 알림이 같이 쓴다. 일반 그룹방에서도 알림을 끈 사람에게는 고정 푸시가 가지 않는다.
- 방 알림 끄기의 뜻과 같아지는 변경이다.
- 통화와 무관하다.

**시험**: 가짜 Supabase — 알림 끈 받는 사람 1명·켠 사람 1명

| 시험 | 고치기 전 | 고친 뒤 |
|---|---|---|
| 끈 사람: 알림 행 | `mutedSnapshot:false` | `mutedSnapshot:true` |
| 끈 사람: 푸시 함수 | 불림(FAIL) | 안 불림 |
| 켠 사람 | — | 그대로 |

**요청**: 알림 끈 사람만큼 푸시 발송 요청이 준다. 늘어나는 것은 없다.

---

## 5. 모임 프로필 동기화 (A18 · A19)

### 5-1. A19 · 모임 사진을 비우면 DIBAY 사진 (DB 변경 없음)

- 원인: `lib/community-messenger/service.ts` `resolveRoomProfileLite` 2193~2199줄
  - 방 프로필 사진(`fromRoom`)이 없으면 메신저 기본 사진(`fromBase` = DIBAY 사진)을 쓴다
  - 모임 방도 같다
- 바꿈: `moimOwned` 가 true 면 `avatarUrl = fromRoom`(없으면 null)
  - 방 프로필 행이 없거나 별칭이 아닌 모임 방 갈래(2176·2185줄)도 `avatarUrl: null`
  - 이름은 그대로 둔다. 계약 §4 「기본값 = DIBAY 닉네임」이고, 가입 때 별칭으로 복사된다.
- 보는 것: 사진을 지운 멤버는 머리글자 동그라미로 보인다. 서랍(627줄)·참가자 시트(862줄)는 이미 머리글자 대체가 있다.
- 영향: 같은 함수를 쓰는 곳 2곳(방 스냅샷 16327줄 · 멤버 쪽 넘김 16875줄)
  - 둘 다 `moimOwned` 를 넘긴다(확인함)
  - 배너 사진(§4-1)도 이 값을 따른다
- 시험: `resolveRoomProfileLite` 를 시험용으로 내보내 시험
  - 모임 방 + 별칭 + 방 사진 없음 → null(고치기 전: DIBAY 사진)
  - 일반 별칭 방 → 기존 대체 유지

### 5-2. A18 · 참가자 부제 「별칭 참여」 · 모임 소개가 방 프로필에 안 감 (DB 변경 필요)

**원인**

- 방 프로필 소개를 넣지 않는다.
  - `moim__room_member_activate`(m2 554~557줄)가 방 프로필을 넣을 때 `bio = ''` 고정
  - `moim_profile_update`(r1 863~869줄)는 이름·사진만 방 프로필에 옮기고 소개는 옮기지 않는다
- 그래서 방에서는 모임 소개가 늘 비고, 참가자 시트 부제는 대체 문구 「별칭 참여」(`RoomSheets.tsx` 894~907줄)가 된다.

**DB 마이그레이션** (`supabase/migrations/2027112826xxxx_moim_r5_room_profile_bio.sql` · ASCII 본문 · 권한 그대로 service_role)

1. 새 도우미 `public.moim__room_moim_id(p_room uuid) returns uuid` (stable, security definer)
   - 내용: 방의 `owner_ref_id` 가 모임 id 면 그대로, 일정 id 면 `moim_schedules.moim_id`
   - `owner_domain <> 'moim'` 이면 null
2. `public.moim__room_member_activate(p_room, p_user, p_role, p_nickname, p_avatar)`
   - 인자 그대로. 호출처 6곳을 바꾸지 않기 위해서다.
   - 방 프로필 insert 의 `bio`:
     `coalesce((select left(bio,300) from moim_members where moim_id = moim__room_moim_id(p_room) and user_id = p_user), '')`
   - `on conflict do update` 에도 `bio = excluded.bio` 를 더한다
   - 순서 확인: 모임 만들기·가입·일정 확정 모두 `moim_members` 행을 먼저 쓰고 방 함수를 부른다(r1 1445→1457줄, `moim__activate_member`)
3. `public.moim_profile_update(p_actor, p_moim, p)`: 방 프로필 update 에 `bio = (select left(bio,300) from moim_members where …)` 를 더한다. 나머지 본문은 운영 현재 정의(r1)를 그대로 옮긴다.
4. 채워 넣기(backfill), 같은 마이그레이션 안에서:

   ```sql
   perform moim__writer_on();
   update community_messenger_room_profiles rp
      set bio = left(coalesce(mm.bio, ''), 300), updated_at = now()
     from community_messenger_rooms r
     join moim_members mm on mm.moim_id = moim__room_moim_id(r.id)
    where rp.room_id = r.id
      and r.owner_domain = 'moim'
      and mm.user_id = rp.user_id
      and mm.status = 'active'
      and rp.bio is distinct from left(coalesce(mm.bio, ''), 300);
   ```

   - 사진·이름은 다시 쓰지 않는다. 지금도 맞춰져 있고, 운영값 덮어쓰기 위험을 줄인다.
   - 적용 전에 운영 DB 를 읽기 전용으로 센다(`begin read only; … rollback;` · 컬럼 먼저 `information_schema` 확인). 셀 것은 대상 행 수, 바뀔 행 수. 적용 뒤 같은 쿼리로 0행인지 대조해 보고한다.
5. 로컬 PG17 시나리오: 소개 있는 가입 → 방 프로필 소개가 같다 / 소개 수정 → 같다 / 일정 확정 → 같다 / 채워 넣기 전후 행 수

**화면 (TS)**: `RoomSheets.tsx` 894~907줄 부제

- 모임 방(`memberSubtitleFallback` = 없음)이면 `member.subtitle`(= 방 프로필 소개 · 서버가 이미 모임 방은 메신저 부제를 쓰지 않음)
- 없으면 빈칸이다. 「별칭 참여」·「참여 중」 대체 문구를 쓰지 않는다.
- `GroupMemberPresenceLabel` 의 접속 표시는 그대로 둔다.

**보는 것**: 참가자 시트에 「준호 · 운영진 / 배드민턴 다시 시작해요」. 소개가 없으면 부제가 없다.

**영향**

- 모임 소개는 계약 §4 「다른 멤버에게 보이는 것」에 있다. 공개 범위가 넓어지지 않는다.
- 설치된 앱: 웹·DB 만 바뀐다(앱 재시작).

**시험**

- 로컬 DB 시나리오(위 5)
- 동작 시험: 모임 방 부제 대체 없음(표면 규칙 시험 + 부제 고르는 순수 함수)

**위험**

- `moim_profile_update` 본문을 옮길 때 운영 현재 정의와 달라지면 회귀가 생긴다.
- 그래서 적용 전에 운영 `pg_get_functiondef` 와 저장소 정의를 대조한다. 감사 때 지문이 일치했다(감사 머리 「지문 `b6b7e8d7…`/109 대조 완료」).

---

## 6. 새 i18n 키 (ko · en 동시 · `lib/i18n/catalog/moim-core.ts`)

| 키 | ko | en |
|---|---|---|
| `moim_room_type_moim` | 모임 채팅방 | Group chat |
| `moim_room_type_schedule` | 일정 채팅방 | Meetup chat |
| `moim_room_profile_label` | 모임 프로필 | Group profile |
| `moim_room_join_via_moim` | 모임에 가입하면 들어와요 | Group members join automatically |
| `moim_room_join_via_schedule` | 참여가 확정되면 들어와요 | Confirmed attendees join automatically |
| `moim_room_members_view` | 멤버 보기 | Members |
| `moim_room_members_view_all` | 멤버 전체 보기 | View all members |
| `moim_room_caption_main` | 모임 멤버 모두의 채팅방이에요. 모임을 나가면 채팅방에서도 나가요 | Chat for all group members. Leaving the group removes you from this chat |
| `moim_room_caption_schedule` | 참여가 확정된 사람의 채팅방이에요. 참여를 취소하면 채팅방에서도 나가요 | Chat for confirmed attendees. Canceling your spot removes you from this chat |
| `moim_room_readonly_closed` | 종료된 모임이라 읽기만 할 수 있어요 | This group has ended. You can only read messages |
| `moim_room_readonly_blocked` | 운영 정책으로 제한된 모임이라 읽기만 할 수 있어요 | This group is restricted. You can only read messages |
| `moim_room_readonly_deleted` | 삭제된 모임이라 읽기만 할 수 있어요 | This group was deleted. You can only read messages |
| `moim_room_readonly_schedule_done` | 끝난 일정이라 읽기만 할 수 있어요 | This meetup has ended. You can only read messages |
| `moim_room_readonly_schedule_cancelled` | 취소된 일정이라 읽기만 할 수 있어요 | This meetup was canceled. You can only read messages |
| `moim_room_notice_load_failed` | 공지를 불러오지 못했어요 | Couldn't load notices |
| `moim_room_header_members` | 멤버 {count} | {count} members |

- 지우는 키: `moim_room_managed_in_moim`(ko·en). 쓰는 곳이 없어진다(A21).
- 다시 쓰는 기존 키: `moim_role_host`·`moim_role_co_host`·`moim_role_staff`·`moim_role_member`·`cm_ui_my_role`·`nav_messenger_room_readonly_notice`·`notify_peer_fallback`
- 코드 안 한국어 문자열·언어 삼항 없음. `npm run check:i18n-quality` 로 확인한다.

---

## 7. 시험 목록 (모두 「고치기 전 실패 · 고친 뒤 통과」하는 동작 시험. 구조 확인은 따로 이름 붙임)

1. `lib/moim/__tests__/moim-r5-room-surface-policy.test.ts` — 표면 규칙 표 전체
   - 입력: not_moim / moim(활성·종료·종료+열람 끝·차단·삭제) / 일정(진행·끝·취소) / pending(loading·failed) × 역할(모임장·부모임장·운영진·멤버)
   - 결과: 각 깃발·키(A1~A7·A17·A20~A22)
2. `moim-r5-rooms-route.test.ts` — §2-1(A9·A11·신규2·A16 사유·A24 시각)
3. `moim-r5-room-owner-cache.test.ts` — §2-2(A12·A13·A22)
4. `lib/messenger-policy/__tests__/chat-room-swipe-actions-moim.test.ts` — A8
5. 순수 함수 시험
   - `buildRoomTimelineChipParts`(A6)
   - `resolveRoomReadonlyNotice`(A16·신규1)
   - `resolveMoimRoomNoticeRow`(A10)
   - `resolveMoimScheduleListSubline`(A24)
   - 부제 고르기(A18)
6. `lib/notifications/__tests__/moim-room-notification-identity.test.ts` — A14(서버·배너)
7. 고정 알림 끄기 시험 — A23
8. `resolveRoomProfileLite` 시험 — A19
9. 로컬 PG17 시나리오 — A18 SQL·채워 넣기
10. 구조 확인(동작 시험 아님): 표면 규칙을 쓰는 7개 파일에 모임 깃발 없는 `isPrivateGroupRoom ?` 관리 조건이 남지 않음
11. 기존 시험 고침
    - `lib/moim/__tests__/moim-r4-m.test.ts` 의 「판정 실패 = resolved true」 기대를 결정 1 로 바꾼다
    - `moim-bundle4-messenger-room.test.ts` 의 `moim_room_managed_in_moim` 기대를 새 키로 바꾼다
12. 코드 검사
    - `typecheck:build`·`typecheck:test`·관련 vitest·변경 파일 eslint
    - `check:i18n-quality`
    - `verify:call-surface-cta-ssot`(통화 CTA 무변경 확인)
    - `npm run test:ci` 1회(main 반영 전 규칙)

NOT_PROVEN 으로 남는 것: 실기기 화면(Owner 계정·주소·휴대폰), 운영 반영, 운영 요청 수 실측.

---

## 8. 정리

### 8-1. 바뀌는 파일

| 구분 | 파일 |
|---|---|
| 새 파일 | `lib/moim/moim-room-surface-policy.ts` |
| 모임 판정 | `lib/moim/use-moim-room-owner.ts` · `app/api/moim/rooms/route.ts` · `lib/moim/moim-client-api.ts`(쓰기 뒤 오래됨 표시 1줄) · `lib/auth/client-session-wipe.ts`(정리 1줄) |
| 메신저 방 화면 | `lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts` · `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx` · `…/CommunityMessengerRoomPhase2MemberActionModal.tsx` · `…/CommunityMessengerRoomPhase2MessageTimeline.tsx` · `…/CommunityMessengerRoomPhase2Header.tsx` · `…/CommunityMessengerRoomPhase2Composer.tsx` · `components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx` |
| 채팅 목록 | `components/community-messenger/MessengerChatListItem.tsx` · `components/community-messenger/MessengerChatRoomActionSheet.tsx` · `lib/messenger-policy/chat-room-swipe-actions.ts` |
| 모임 공지 줄 | `components/moim/MoimRoomNoticeMenuItem.tsx` |
| 메신저 서비스 | `lib/community-messenger/service.ts`(`resolveRoomProfileLite` 사진 대체만) |
| 알림 | `lib/notifications/display/load-message-notification-display-context.ts` · `lib/notifications/display/build-message-notification-display.ts`(선택 입력 1개) · `lib/community-messenger/notifications/messenger-in-app-banner-content.ts` · `lib/community-messenger/notifications/cm-participant-unread-full-effects.ts`(모임 여부 넘김) · `lib/community-messenger/group/group-room-pin-notify.ts` |
| 문구 | `lib/i18n/catalog/moim-core.ts` |
| DB | `supabase/migrations/2027112826xxxx_moim_r5_room_profile_bio.sql` |
| 문서 | `docs/dibay-messenger-domain-group-hard-lock.md`(표면 규칙·결정 1 한 줄) · `docs/audit/moim-r4-decisions-design-2026-11-28.md` #14 정정 한 줄 |
| 시험 | §7 의 새 파일 + 기존 2개 고침 |
| 손대지 않음 | 통화 버튼·통화 시트·그룹 통화 칸·`lib/push/**`·통화 세션 API·`notify-message-pipeline.ts` 본문·네이티브 |

### 8-2. DB 변경

| 대상 | 내용 |
|---|---|
| 새 함수 | `moim__room_moim_id(uuid)` |
| 바꾸는 함수 | `moim__room_member_activate`(소개 복사) · `moim_profile_update`(소개 동기화) |
| 데이터 | 모임 방 `community_messenger_room_profiles.bio` 채워 넣기. 활성 멤버, 값이 다른 행만. 적용 전후 행 수 보고 |
| 표·열·트리거 | 변경 없음 |
| 순서 | 운영 DB 적용은 Owner 의 「DB 적용 승인」 뒤에 하고, 적용 결과를 확인한 뒤 병합한다 |

### 8-3. 요청 예산 (`docs/request-budget-ssot.md` · `lib/perf/request-budget.ts`)

| 라우트·경로 | 요청 1회당 Supabase 호출 | 요청 횟수 |
|---|---|---|
| `/api/moim/rooms` (예산 2.6) | **그대로**: 같은 조회에 열만 더함. 오류면 일찍 끝나 오히려 줄어든다 | **늘어남** — 방 열기(마지막 답 60초 초과일 때 1회) + 앱 복귀(60초 이상 숨김, 구독 중인 방을 한 요청) + 모임 쓰기 뒤 1회 + 실패 뒤 다시 묻기(30초 간격 하한). 운영 측정 없이 숫자를 추정하지 않는다. 병합 7일 뒤 Vercel 값(요청 수·호출/요청)으로 확인하고, 예산값은 바꾸지 않는다(호출/요청은 그대로라 상한 안) |
| 메시지 알림 표시 맥락(보내기 경로 `…/messages@post`) | **0 증가**: 방 행 조회에 묶음 조회로 넣음 | 그대로 |
| 고정 알림 | 0 증가(열 하나 더) | 알림 끈 사람만큼 푸시 발송 감소 |
| 앱 안 배너 | 0 증가(추가 조회 없이 이름 없는 본문) | 그대로 |
| 모임 공지 줄 | 그대로 | 그대로 |

예산을 넘는 라우트는 없다. 줄어든 라우트도 없어 예산값을 내리지 않는다.

### 8-4. Owner 결정이 더 필요한 것

- 없음. 시안 U8 이 답하는 것(A24 일정 방 둘째 줄)은 시안대로 정했다.
- 계약 §2 가 답하는 것(A21 안내 문장)은 계약대로 정했다.
- 규정 7번 충돌: 결정 1 이 R4 #14(실패하면 보임)를 바꾼다. Owner 가 이미 정했으므로 문서 정정만 한다.

---

## 9. 범위 밖으로 본 것 (고치지 않음 · 보고만)

1. 일반 비공개 그룹·오픈채팅의 「내 역할 admin/member」 영어 원값(`nav_messenger_my_role_label` 에 `snapshot.myRole` 원값 · `presentation.ts` 281~285줄, `RoomSheets.tsx` 1440줄 근처)
2. 오픈채팅 별칭 방 푸시도 DIBAY 닉네임일 수 있다. 확인 못 함 — 같은 함수가 방 프로필을 보지 않는다는 것까지만 확인했다.
3. 채팅 목록 모임 방 행의 마지막 메시지 앞 보낸 사람 이름(「준호: …」)이 모임 별칭인지 확인 못 함.
4. 모임에서 나간 뒤에도 방 화면이 열려 있으면, `/api/moim/rooms` 가 나간 방을 「모임 방 아님」으로 답한다(R4 D-3 의 left_at 제외). 그 순간 메신저 메뉴가 보일 수 있다. 확인 못 함 — 나가면 방이 목록에서 빠지는 경로만 코드로 봤다.

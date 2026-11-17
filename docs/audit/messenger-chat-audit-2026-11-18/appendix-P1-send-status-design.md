# P1 — §1(문자 전송) 독립 검증 + 「레거시(Telegram) 수준 전송 상태 표시」 구현 설계

- 대상 문서: `docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md` §1 (S1–S7, D1-a..D1-f)
- 검증 트리: 로컬 `main` HEAD `0360f85ca` (코드 읽기만. 운영 DB·외부 서비스·실기기 조회 없음)
- 판정 범위: **코드 판정만**. 실기기·운영 판정은 이 문서에서 전부 NOT_PROVEN (문서 §1-1 실측표는 재현하지 않았다).
- 표기: CONFIRMED / PARTIAL / REFUTED, 근거는 `파일:줄` + 인용.

---

## PART A — 사실 검증

### A-0. 문서 줄 번호 대조
문서가 인용한 줄은 현재 트리와 거의 일치한다(S1 289-295·814-815, S3 940, S4 1138-1145, S5 1170-1180, S6 132-145/362-368). 아래 판정은 줄 번호가 아니라 실제 코드로 했다.

### S1 — 전송 상태를 글자로 표시, SENT·READ 아이콘 없음 — **CONFIRMED**
- 텍스트 「전송 중」 = 말풍선 **안** 글자:
  `components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx:289-295`
  ```tsx
  {item.pending && !item.sendFailed ? (
    <span className={`shrink-0 text-[11px] ${mineLight ? "text-white/75" : ...}`}>
      {sendingLabel}
  ```
  `sendingLabel` 값 = `CommunityMessengerRoomPhase2MessageTimeline.tsx:2218` `sendingLabel={vm.t("common_sending")}` → `lib/i18n/catalog/common.ts:56` `common_sending: "전송 중"`.
- 1:1 「안 읽음」 = 말풍선 **옆** 글자: `MessengerTimelineVirtualRow.tsx:814-815`
  ```tsx
  {metaInsideBubble ? null : mineUnreadBadgeVisible ? (
    <span className="shrink-0 pb-0.5 text-[11px] leading-none text-[#65676b]">{t("cm_ui_unread")}</span>
  ```
- 그 밖의 「전송 중」 글자: 스티커 `MessengerTimelineBubbleInners.tsx:56-58`, 사진 묶음 `MessengerChatImageBubble.tsx:154-158`, 사진 1장 `MessengerChatImageBubble.tsx:338-340`. 파일은 `common_uploading`(`MessengerTimelineBubbleInners.tsx:129-132`).
- 체크·시계 아이콘: 위 4개 파일에서 `lucide-react` import 는 `FileText`(BubbleInners:4) 하나뿐, `Check`/`CheckCheck`/`Clock` 0건 (rg 확인).
- 계약: `docs/samarket-messenger-sent-delivered-read-architecture.md:17` SENT UI = 「단일 체크/시계 등 "전송됨" 표시(제품 카피는 별도)」, `:37` READ UI = 「READ 표시(색 채움 체크 등). 그룹 1차는 per-user 커서만」, `:27` DELIVERED 「READ와 시각적으로 분리」. → 문구는 「등」이라 **글자 표시가 계약 위반이라고 단정할 수는 없다**(계약은 예시형). 「계약과 다른 구현」은 해석이며, 「아이콘이 없다」는 사실은 CONFIRMED.

### S2 — 상태 변경 때 말풍선 폭이 바뀜 — **PARTIAL**
- 「전송 중」 글자는 말풍선 안 `flex flex-wrap` 줄에 들어가 있어(`BubbleInners:280-295`), 사라지면 말풍선 폭이 **항상** 줄어든다 → CONFIRMED.
- 「안 읽음」 글자는 말풍선 **밖** 형제 요소다(`VirtualRow:802-821`, 줄 폭 `max-w-[min(76vw,520px)]` :803). 짧은 글은 말풍선 폭이 그대로이고 옆 글자만 생겼다 사라진다. 긴 글(줄 폭 상한에 닿는 글)만 말풍선 폭·줄바꿈·행 높이가 바뀐다. → 「폭이 2번 바뀐다」는 짧은 글에서는 1번(「전송 중」 제거)이 맞고, 2번째는 긴 글 조건부.
- 사진·음성만 안쪽 표시: `VirtualRow:551` `voiceMetaInBubble = !deletedForEveryone && item.messageType === "voice" && !replyQuote`, `:638` `photoMetaOnPhoto = isMediaBubble && item.messageType === "image"`, `:641` `metaInsideBubble = photoMetaOnPhoto || voiceMetaInBubble` → CONFIRMED.

### S3 — 「안 읽음」은 최신 확정 내 메시지 1개에만, 전송 중 행은 건너뜀 → 점프 — **CONFIRMED**
- `CommunityMessengerRoomPhase2MessageTimeline.tsx:938-944`
  ```ts
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const item = msgs[i];
    if (item.pending) continue;
    if (!item.isMine) continue;
    if (item.messageType === "system") continue;
    latestMineId = item.id;
  ```
- 행 표시 조건 `:2111-2117` `... latestReadableMineMessageId === item.id && !peerHasReadMyLatestMessage` → 오직 1행. 새 메시지 ACK 순간 `latestMineId` 가 새 행으로 이동 → 이전 행 글자 사라지고 새 행에 생김(점프).
- 추가 발견(문서에 없음):
  - (a) `latestMineId` 는 `call_stub` 을 거르지 않는데(:940-942) 표시 조건은 `!isCallStub`(:2115) → 내 최신 확정 메시지가 통화 기록이면 「안 읽음」이 **어디에도** 안 나온다.
  - (b) 1:1 판정은 `roomType === "direct"` 만(:932). `private_group` 은 `groupReadReceiptLabel`(:2118-2125), `open_group` 은 읽음 표시 **없음**.
  - (c) 그룹 라벨은 하드코딩 한국어: `lib/community-messenger/group/group-room-read-presenter.ts:21` `` label = `읽음 ${readCount}` ``, `:25` `` `${names.join(" ")} 외 ${...}명 읽음` `` → i18n SSOT(AGENTS.md 「코드 안 한국어 문자열 금지」) 위반. 범위 밖 — 보고만.
  - (d) 그룹 읽음 수는 내 메시지 마지막 24개만(`Timeline:632-636` `.slice(-24)`), 다시 조회는 snapshot 객체가 바뀔 때만(`use-group-message-read-counts.ts:16`·`:42`).
  - (e) 실시간 상대 읽음 패치에서 새 커서 id 가 화면 메시지에 없으면 `lastReadMessageCreatedAt` 을 **옛 값 그대로 둔다**: `lib/community-messenger/room/use-messenger-room-client-phase1.ts:1303-1305`
    ```ts
    ...(lrmStr ? { lastReadMessageId: lrmStr } : {}),
    ...(createdAtForCursor != null ? { lastReadMessageCreatedAt: createdAtForCursor } : {}),
    ```
    → 새 id + 옛 created_at 조합. Timeline `:988-996` 의 created_at 폴백이 옛 시각으로 판정할 수 있음(코드상 가능, 실측 NOT_PROVEN).

### S4 — 텍스트 전송에 시간 제한 없음 — **CONFIRMED (앱 단) / 「무기한」은 NOT_PROVEN**
- `lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts:1138-1146`
  ```ts
  const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: trimmed, clientMessageId, ...(replyId ? { replyToMessageId: replyId } : {}) }),
  });
  ```
  `signal` 없음. `sendRawText` 전체(1078-1259)에 타임아웃·`fetchWithTimeout` 없음.
- 「무기한」: WebView/OS 네트워크 스택이 결국 오류를 낼 수 있다(측정 안 함) → NOT_PROVEN.
- 추가 발견: **스티커 전송은 더 나쁘다** — `controller:1441-1486` 이 `try { ... } finally { setBusy(null) }` 로 **catch 가 없다**. fetch 예외 시 낙관 행(`pending: true`, :1432)이 지워지지도 실패 표시도 안 되어 「전송 중」이 남는다(코드 판정). 사진·파일 업로드(`lib/community-messenger/upload/messenger-direct-upload.ts:93,107,124` `fetchImpl(...)`)도 타임아웃 없음.

### S5 — A 전송 중 B 전송/입력 수정 후 A 실패 → A 글 유실 — **CONFIRMED**
- 실패 시 말풍선 무조건 삭제: `controller:1174` `setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));`, 예외 경로 `:1242-1245` 동일.
- 입력창 복원은 조건부: `controller:1175-1182` `shouldRestoreActiveComposerAfterSendFail({ sendGeneration: failRestoreGeneration, restoreOnFail })` → `lib/community-messenger/room/messenger-composer-fail-restore.ts:33-36`
  ```ts
  if (args.restoreOnFail === undefined) return false;
  if (args.sendGeneration !== args.session.generation) return false;
  if (args.session.dirty) return false;
  ```
  B 전송이 `beginActiveComposerFailRestoreSession()`(:1095-1096)으로 generation 을 올리거나, 입력 수정이 `markActiveComposerDraftEditedDuringOutbound`로 dirty 를 세우면 A 는 복원 안 됨 → 말풍선도 입력창도 없음, 스낵바만(:1184-1189, :1254).
- 텍스트 전송은 `busy` 를 세우지 않는다(`sendRawText` 안에 `setBusy` 0건) → A·B 동시 전송 가능함이 전제로 성립.
- 보존 슬롯도 1개뿐: `unconfirmedTextSendRef` 는 마지막 indeterminate 실패 1건만(`messenger-outbound-failed-send.ts:85-92`) → A·B 둘 다 실패하면 A 의 (내용, cid) 보존분이 B 로 덮인다.

### S6 — 낙관 시각=기기 시계, ACK 때 서버 시각으로 교체·재정렬 — **PARTIAL**
- 「기기 시계 그대로」는 부정확: `components/community-messenger/room/community-messenger-room-helpers.tsx:132-145`
  ```ts
  const now = Date.now();
  ... maxTs = Math.max(maxTs, t)   // 확정 행만 (pending 제외)
  return new Date(Math.max(now, maxTs + 1)).toISOString();
  ```
  기기 시계가 **느리면** 마지막 확정 행 +1ms 로 끌어올린다. 기기 시계가 **빠르면** 미래 시각 그대로.
- 서버 시각: `lib/community-messenger/service.ts:17424` `const createdAt = nowIso();` → RPC `p_created_at`(:17435). ACK 행은 서버 시각.
- 재정렬: `mergeRoomMessages` 정렬 `helpers:366-373` `createdAt` 오름차순 → ACK 시 행 위치가 바뀔 수 있음 → CONFIRMED (빠른 기기 시계 + 그 사이 상대 메시지 도착 조건). 행 키는 cid 로 유지(`helpers:123-130`, Timeline :2182) → 재마운트는 없음.
- 추가 발견(문서에 없음): 기기 시계가 느릴 때 연속 2건 이상 보내면 두 낙관 행의 `createdAt` 이 **같다**(둘 다 `maxTs + 1`, pending 은 maxTs 계산에서 제외 :138). 동률은 `String(a.id).localeCompare(b.id)`(:372) — id 가 `pending:<room>:<n>`(controller:1104)이라 `"…:10" < "…:9"` → **9→10 경계에서 보낸 순서가 뒤집혀 보인다**(코드 판정, 실측 NOT_PROVEN).

### S7 — `CommunityMessengerRoomPass1ComposerShell.tsx` 미사용, busy 확인 없음 — **CONFIRMED (단, D1-f 삭제는 다른 계약과 충돌)**
- import 0건: `rg Pass1ComposerShell` → 자기 파일(`:73` export)·`scripts/verify-chat-domain-file-lock.cjs:40`·`lib/chat-domain/four-domain-freeze.ts:95`·`lib/chat-domain/room-chrome/phase-i-remove-prep.ts:38`·docs 만.
- busy: `CommunityMessengerRoomPass1ComposerShell.tsx:152-161` 은 `setDraft("")` 후 `vm.sendMessage(text)`. `sendMessage` 는 busy 면 `return false`(controller:1349) — generation 을 안 올리므로 `sendGen > genBefore`(:164) 거짓 → 복원 안 함 → 글 유실. (Phase2 입력창은 `isComposerTextSendBlocked({busy,...})` 로 먼저 막는다: `CommunityMessengerRoomPhase2Composer.tsx:459-467`.)
- **충돌**: `scripts/verify-chat-domain-file-lock.cjs:39-41,171-175` 가 이 파일이 **존재해야** PASS (`REMAINING_CHROME_MUST_EXIST`). 삭제하면 `npm run verify:chat-domain-file-lock` FAIL(ci:static 에는 미포함, package.json:219 확인). `four-domain-freeze.ts:93-96` 주석은 「R7b still has product callers (ComposerEarly)」 — 현재 사실과 다름(호출자 0). 삭제는 「전송 상태 표시」 범위 밖이고 동결 목록·검사 스크립트 동시 수정이 필요 → **이 작업에서 제외**, 별도 정리 과제로 보고(설계·구현 작업 규정 3번).

### 문서의 정정 주장 — 「snapshot null 이면 글 유실」 해당 없음 — **CONFIRMED**
- `controller:1347-1348` `if (!raw || !snapshot) return false;` 가 `setMessage("")`(:1359) 전에 있음.
- 입력창은 snapshot 이 있을 때만: `CommunityMessengerRoomClientPhase2Body.tsx:742-747` (`room.snapshot` 없으면 그 앞 분기에서 스켈레톤/「찾을 수 없음」 반환, :715-739) + Main props 타입 `snapshot: NonNullable<...>`(:149-151).

### 추가 결함 (문서에 없음, 상태 표시와 직결)
- **F-img**: 사진 실패 행에도 「전송 중」+회전 표시. `MessengerChatImageBubble.tsx:117` `const pending = Boolean(item.pending);` — `sendFailed` 를 보지 않음. 실패 행은 `pending: true, sendFailed: true`(`messenger-outbound-failed-send.ts:58`) → 실패 행 아래 `MessengerOutboundFailedActions`(VirtualRow:834-836)와 「전송 중」이 동시에 보인다(코드 판정).
- **F-voice**: `VoiceMessageBubble.tsx:139` `showBuffering = !showLoadError && (pending || playbackBlocked)` — 실패 행도 버퍼링 표시(코드 판정).

### 기존 계약 문서가 요구하는 것 (grep: 전송 중 / 안 읽음 / read receipt / 읽음 표시)
- `docs/samarket-messenger-sent-delivered-read-architecture.md` — :14-18 SENT = 서버 영속 저장 후, UI 「단일 체크/시계 등」 · :24-28 DELIVERED 「READ와 시각적으로 분리」 · :34-37 READ 「색 채움 체크 등. 그룹 1차는 per-user 커서만」 · :89-90 「메시지별 read_users[] 저장 금지」 · :95 커서 단조 증가.
- `docs/audit/messenger-photo-send-root-cause-measure-2026-11-16.md:49-51,72` — F2: 읽음 표시 유무로 말풍선 폭이 바뀌면 안 됨, 사진은 텔레그램처럼 사진 위 표시(구현 완료 :85 PASS 기록).
- `docs/design/messenger-media-emoji-ssot-design-2026-11-15.md:131` — O10 「결정됨(Owner 2026-11-16 「F2 시간 위로」)」.
- `docs/audit/messenger-remaining-defects-root-cause-2026-11-16.md:37,65` — V3: 음성 폭을 시간·읽음 표시와 무관하게 고정.
- `docs/audit/messenger-2026-10-26-stage2-fix-design.md:42-49` — D-12: 상대가 읽으면 「안 읽음」 즉시 사라짐(캐시·silent delta·지문 포함).
- 「전송 중」 글자를 의무화하는 SSOT 문서는 **찾지 못함**. 메시지 상태 아이콘 전용 SSOT 문서도 **없음**.

---

## PART B — 구현 설계: 레거시(Telegram) 수준 전송 상태 표시

원칙: 기능 추가·삭제 0. 새 DB·API·마이그레이션 0. 바뀌는 것 = (1) 상태 표시 방식 (2) 실패한 텍스트·스티커가 사라지지 않고 기존 실패 행 UI 로 남는 것 (3) 텍스트·스티커 전송 시간 제한 (4) 낙관 행 순서 고정. 배포 구분 = **웹**(네이티브 무변경, 통화 코드 무접촉 — `lib/community-messenger/call*`·`call-v4/**` 미수정).

### B-1. 상태 모델 (모두 기존 데이터)

| 상태 | 판정 (기존 필드) | 아이콘 | 근거 |
|---|---|---|---|
| SENDING | `isMine && pending && !sendFailed` | 시계 | controller:1120, BubbleInners:24-25 |
| FAILED | `isMine && pending && sendFailed` | 경고(`AlertCircle`, `text-sam-danger`) + 기존 `MessengerOutboundFailedActions` | messenger-outbound-failed-send.ts:53-61, VirtualRow:834-836 |
| SENT | `isMine && !pending` 이고 READ 아님 | 체크 1 | 확정 행 = 서버 저장(계약 :14-16) |
| READ | 아래 규칙 | 체크 2 | |
| (없음) | `!isMine`, `system`, `call_stub`, `deletedForEveryone` | — | 현 표시 조건과 동일(Timeline:2111-2125) |

DELIVERED 는 데이터가 없다(`last_delivered_message_id` 는 계약 :202 「선택」, 코드 사용 0) → 표시하지 않는다(체크 1 = SENT). Telegram 도 체크 1/2 만 쓴다.

**1:1 READ (`roomType === "direct"` — 일반 1:1·거래·주문 방 모두 direct; 근거: `lib/admin-chats/__tests__/trade-messenger-room.test.ts:111`, `lib/admin-delivery-orders/__tests__/store-order-room-lookup.test.ts:55`, 서버 readReceipt 는 direct 에만 `service.ts:16123-16144`)**
- 비교 키 = `(createdAt, id)` 튜플. 근거: 서버 그룹 읽음 RPC 가 같은 튜플을 쓴다 `supabase/migrations/20260621140000_group_chat_p1_private_group_features.sql:99-102` `lr.created_at > m.created_at or (lr.created_at = m.created_at and lr.id >= m.id)`; 클라 기존 판정도 같은 순서(Timeline:1007-1018, 동률 시 `localeCompare`), 실시간 역행 방지도 같은 순서(`messenger-peer-read-cursor-guard.ts:36-43`). **id 단독 순서는 불가** — id 는 `gen_random_uuid()`(`supabase/migrations/20260604230000_community_messenger_core.sql:71`) 무작위.
- 커서 시각 결정: `readReceipt.lastReadMessageId` 가 화면 메시지에 있으면 그 행의 `createdAt`, 없으면 `readReceipt.lastReadMessageCreatedAt`, 둘 다 없으면 **판정 불가 → 모두 SENT**(과소 표시 쪽, 현재 :1003-1004 와 같은 방향).
- 행 판정: `!pending && isMine && (createdAt, id) <= cursorKey` → READ. 낙관 행은 항상 SENDING/FAILED.
- 구현: 기존 `useMemo`(Timeline:930-1025)를 `peerReadCursorKey: { t: number; id: string } | null` 계산으로 바꾼다(순회 1회). 행마다 O(1) 비교.
- S3-(e) 커서 시각 불일치: 이 작업에서 `use-messenger-room-client-phase1.ts:1305` 를 「새 id 를 화면에서 못 찾으면 `lastReadMessageCreatedAt: null` 로 지움」으로 바꾼다(옛 시각을 새 id 와 섞지 않음). 결과: 판정 불가 → SENT 로 과소 표시, 다음 부트스트랩이 서버 created_at 으로 채움(`service.ts:16104-16118`). 같은 함수 `patchRoomPeerReadReceiptInSnapshotCache`(:1311-1317)는 이미 `?? null` 이므로 그대로.

**private_group READ**
- 데이터 = `useGroupMessageReadCounts` 의 `counts[id].readCount`(마지막 24개, `Timeline:632-641`). RPC 가 커서 기반이므로 단조: 뒤 메시지를 1명 이상 읽었으면 앞 메시지도 그 사람이 읽음.
- 규칙: `groupReadFloor` = `readCount >= 1` 인 내 메시지 중 가장 늦은 `(createdAt,id)`. 내 확정 메시지 중 그 이하 → READ, 나머지 → SENT. 24개 밖 옛 메시지도 이 규칙으로 READ 가 됨(데이터 추가 없음).
- 기존 라벨 「읽음 N / 이름 읽음」(`groupReadReceiptLabel`)은 **유지**(문서 기본안). 위치만 말풍선 밖 옆 줄에 그대로 두되 텍스트가 바뀌어도 말풍선 폭에 영향이 없도록 B-3 의 줄 구조 적용. 하드코딩 한국어(presenter:21,25)는 범위 밖 — 보고만.
- 한계(보고): 서버는 캐시 표(`community_messenger_message_read_counts`)를 우선 사용(:82-87, :109-111) — 운영 현재 정의·캐시 신선도 NOT_PROVEN(운영 DB 미조회).

**open_group**: 읽음 데이터 없음(readReceipt null, groupReadCounts 미조회 — `isPrivateGroupRoom` 조건 :641) → SENDING/FAILED/SENT 만. READ 표시 안 함.

**store_order 방 주의(보고)**: 서버 `peerParticipant` = 「나 아닌 첫 참가자」(`service.ts:16098-16101`). 주문 방 참가자가 3명 이상이면 임의 1명의 커서다 — 현 「안 읽음」과 같은 한계, 변경 없음. 운영 참가자 수 NOT_PROVEN.

### B-2. 변경 목록 (파일 · 함수 · 현재 → 변경)

| # | 파일 | 대상 | 현재 | 변경 |
|---|---|---|---|---|
| 1 | `components/community-messenger/room/phase2/MessengerOutboundStatusIcon.tsx` (신규 1파일) | `MessengerOutboundStatusIcon({ status, t, tone })` | 없음 | `status: "sending"\|"failed"\|"sent"\|"read"`. lucide `Clock3`/`AlertCircle`/`Check`/`CheckCheck`, 고정 상자 `inline-flex h-[14px] w-4 shrink-0 items-center justify-center`(상태와 무관한 폭). `role="img"` + `aria-label` (B-6). `tone: "bubble-mine" \| "on-photo" \| "plain"` 로 색만 분기(B-3) |
| 2 | `MessengerTimelineVirtualRow.tsx` | props·비교기 | `mineUnreadBadgeVisible: boolean`(:112), `sendingLabel: string`(:120), 비교기 :165·:171 | `outboundReadState: "read" \| "unread" \| "none"` (원시 문자열) 로 교체, `sendingLabel` 삭제. 비교기 해당 2줄 교체. SENDING/FAILED 는 `item`(이미 비교 대상 :150)에서 계산 |
| 3 | 같은 파일 | `bubbleMetaReadLabel`(:552-556), 사진 오버레이(:642-651), 음성 `voiceMetaLabel`(:557-559) | 「안 읽음」/그룹 라벨 글자 | 사진·음성 표시 칸 = `[시간][상태 아이콘]`. 그룹 라벨은 칸 밖(B-1). `TimelineViberInnerVoice` 의 `metaLabel: string` → `meta: ReactNode` |
| 4 | 같은 파일 | 텍스트 계열 내부 표시 | 시간·「안 읽음」 말풍선 옆(:809-820, :826-830) | B-3 의 말풍선 안 오른쪽 아래 표시. 대상 = 패딩 래퍼(:627)를 지나는 모든 유형(text·file·gift_certificate·인용 있는 사진/음성/스티커·삭제 묘비) — 단 `voiceMetaInBubble` 은 기존 칸 사용. `metaInsideBubble`(:641)을 이 경우까지 확장해 옆 줄 시간·「안 읽음」 미표시 |
| 5 | 같은 파일 | 스티커(인용 없음)·`community_post_share` | 옆 줄 시간·「안 읽음」 | 스티커 = 사진과 같은 오버레이 칸(`data-cm-photo-meta` 와 같은 클래스, 속성 `data-cm-sticker-meta`). `community_post_share` = 옆 줄 유지하되 「안 읽음」 글자 대신 고정 폭 아이콘(폭 불변) |
| 6 | `MessengerTimelineBubbleInners.tsx` | `TimelineViberInnerTextDefault`(:263-299) | `sendingLabel` prop, 「전송 중」 span | `sendingLabel` 삭제, :289-295 삭제, 본문 끝에 B-3 의 보이지 않는 자리 확보 span 추가(`metaSpacer?: ReactNode`) |
| 7 | 같은 파일 | `TimelineViberInnerSticker`(:37-61) | 「전송 중」 글자 :56-58 | 삭제(오버레이 아이콘이 대신) |
| 8 | `MessengerChatImageBubble.tsx` | `pending`(:117), 「전송 중」 글자 :154-158·:338-340 | 실패 행도 전송 중 | `const uploading = Boolean(item.pending) && !item.sendFailed` 로 회전 표시(:328-335) 조건 교체, 글자 2곳 삭제(상태는 오버레이 아이콘). F-img 해소 |
| 9 | `components/community-messenger/VoiceMessageBubble.tsx` | `sentTimeLabel?: string`(:60,377-381), `showBuffering`(:139) | 문자열, 실패 행 버퍼링 | `sentMeta?: ReactNode`, `data-cm-voice-meta` 유지. `pending` 판정을 호출부에서 `pending && !sendFailed` 로 넘김(BubbleInners:78) |
| 10 | `CommunityMessengerRoomPhase2MessageTimeline.tsx` | `useMemo` :930-1025, 행 계산 :2111-2125, :2208, :2218 | 최신 1개 `latestReadableMineMessageId`·`peerHasReadMyLatestMessage` | `peerReadCursorKey`, `groupReadFloorKey` 계산 → 행마다 `outboundReadState`. `sendingLabel` prop 제거. `vm.isPrivateGroupRoom` 분기·`groupReadReceiptLabel` 은 유지 |
| 11 | `lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts` | `sendRawText`(:1078-1276) | fetch 시간 제한 없음, 실패 시 행 삭제 | ① `fetchWithTimeout(url, { ..., timeoutMs: MESSENGER_TEXT_SEND_TIMEOUT_MS })` (`lib/http/fetch-with-timeout.ts:20`) ② 본체를 `attemptTextSend({ tempId, clientMessageId, content, replyId })` 로 분리 ③ **indeterminate**(`classifyMessengerSendFailure` = 네트워크·타임아웃·408/425·5xx·본문 유실, `messenger-direct-upload-policy.ts:139-156`) → 행 유지 `markMessengerOutboundRowFailed` + `registerMessengerOutboundFailedSend(tempId, { retry, discard })`, 입력창 복원 안 함 ④ **definitive**(4xx·ok:false) → 지금처럼 행 삭제 + 조건부 복원(M-8) + 스낵바 ⑤ retry = `markMessengerOutboundRowRetrying` 후 **같은 tempId·같은 clientMessageId** 로 `attemptTextSend` 재호출(이미 같은 cid 확정 행이 와서 실패 행이 사라졌으면 재전송 안 함 — 미디어 :1650-1655 와 같은 가드) ⑥ discard = 행 삭제 + `clearMessengerOutboundFailedSend` + `unconfirmedTextSendRef` 가 이 cid 면 비움 ⑦ `failedOutboundRowIdsRef`(:1550)에 등록(언마운트 정리 재사용) |
| 12 | 같은 파일 | `sendSticker`(:1401-1504) | catch 없음, 시간 제한 없음 | `fetchWithTimeout` + catch 추가, indeterminate → 같은 실패 행 처리(같은 cid 재전송, 서버 cid 중복 방지 `service.ts:18218-18240` 확인), definitive → 지금처럼 삭제+스낵바 |
| 13 | `components/community-messenger/room/community-messenger-room-helpers.tsx` | `mergeRoomMessages` 정렬(:366-373) | 동률 시 id 문자열 비교 | 동률이고 둘 다 pending 이면 `optimisticSeq`(낙관 행 생성 순번, `pendingMessageIdRef.current` 값을 행에 숫자로 저장) 오름차순. `nextOptimisticCommunityMessengerCreatedAtIso`(:132-145)는 pending 행 최대 시각도 포함해 `max(now, maxConfirmed+1, maxPending+1)` 로 — 낙관 행끼리 같은 시각 제거. ACK 후 재정렬(S6 본체)은 서버 시각이 진실이므로 **유지**(Telegram 도 서버 순서) — D1-e 「cid 순번 고정」은 서버 순서와 두 기기 순서 불일치를 만들 수 있어 채택하지 않음 |
| 14 | `lib/community-messenger/room/use-messenger-room-client-phase1.ts` | :1305 | 옛 created_at 유지 | 새 id 를 못 찾으면 `lastReadMessageCreatedAt: null` |
| 15 | `lib/i18n/catalog/community-messenger-ui.ts` | ko·en | — | B-6 키 2개 추가 |
| 16 | 상수 | `lib/community-messenger/room/messenger-room-ui-constants.ts` | — | `MESSENGER_TEXT_SEND_TIMEOUT_MS = 12_000` (B-5) |

미변경(명시): DB·API·RPC, 서버 dedupe, 실시간 bump, 통화 코드, `MessengerOutboundFailedActions` 본체, 사진·파일·음성 업로드 경로(타임아웃 없음은 보고만 — 업로드 시간은 파일 크기 의존이라 12초 적용 불가), Pass1 셸(S7, 범위 밖).

### B-3. 말풍선 폭 고정 (상태 바뀌어도 폭 0 변화)
- 텍스트 계열: Telegram 웹 방식 — 본문 `<p>` 끝에 **같은 내용의 보이지 않는 복제 칸**을 인라인으로 두고, 실제 표시는 말풍선 안 오른쪽 아래 절대 위치.
  ```tsx
  // 말풍선 내부 래퍼 :627 에 relative 추가
  <p className="... whitespace-pre-wrap break-words">
    {body}
    <span aria-hidden className="invisible ml-2 inline-flex select-none align-bottom">{meta}</span>
  </p>
  <span data-cm-text-meta="" className="pointer-events-none absolute bottom-1.5 right-[10px] inline-flex items-center gap-1 text-[11px] leading-none tabular-nums">{meta}</span>
  ```
  `meta = [시간(showMessageTime 일 때)] + [상태 아이콘 칸 w-4(내 메시지만)]`. 아이콘 칸은 SENDING 부터 READ 까지 같은 `w-4` → 상태 변화로 폭·줄바꿈·높이 변화 0. 복제 칸이 마지막 줄에 안 들어가면 브라우저가 다음 줄로 내린다 → 높이는 처음부터 확정(상태와 무관).
- 남는 폭 변화 1가지(보고): ACK 로 시간 문자열이 바뀌면(서버·기기 분이 다를 때, 예 `9:59`→`10:00`) 한 글자 폭 차이. `tabular-nums` 로 숫자 폭은 같지만 자릿수 변화는 남는다.
- 사진: 기존 오버레이(:642-651) 칸 안 글자 → 아이콘. 폭은 이미 표시와 무관(F2 테스트 :102-109).
- 음성: 기존 칸 `data-cm-voice-meta`, 말풍선 폭 `w-[220px]` 고정(V3 테스트 :110-116).
- 옆 줄 유지 유형(`community_post_share`·그룹 라벨): 아이콘 칸 고정 폭. 그룹 라벨은 길이가 바뀌므로 짧은 카드는 폭 불변, 줄 폭 상한에 닿는 경우만 영향 — 현재와 같음(변경 없음).
- 색: 내 말풍선 위 `text-[color:var(--cm-room-bubble-outgoing-fg)]/75` (기존 :291 `text-white/75` 와 같은 값을 토큰으로), READ 체크도 같은 색(Telegram 녹색 말풍선 기준 흰 체크). 상대 말풍선 시간 `text-[color:var(--cm-room-text-muted)]`. 사진·스티커 오버레이 `text-white`(기존 :646). FAILED `text-sam-danger`(기존 실패 행과 같은 토큰). 하드코딩 `#65676b`(:810,:815)는 이번에 바뀌는 줄에서만 토큰으로.

### B-4. 실패 텍스트 = 기존 실패 행 재사용 (검증 결과)
- `MessengerOutboundFailedActions` 존재: `components/community-messenger/room/phase2/MessengerOutboundFailedActions.tsx:12-58` — 행 id 로 레지스트리(`getMessengerOutboundFailedSend`)에서 retry/discard 를 찾음, 문구 `cm_ui_send_failed_label`/`_retry`/`_discard`.
- 표시 조건: `VirtualRow:834-836` `item.isMine && item.pending && item.sendFailed` — **메시지 유형 무관** → 텍스트·스티커도 그대로 표시됨(행 UI 수정 불필요).
- 미디어 사용 방식: 사진·파일 `controller:1644-1665`, 음성 `use-messenger-room-voice-recording.ts:357-367`.
- 실패 행 유지 근거: `mergeRoomMessages` 가 pending 행을 보존하고 같은 cid 확정 행이 오면 제거(`helpers:333-337` `if (cidPending && confirmedCids.has(cidPending)) return false;`) → 타임아웃 뒤 서버가 늦게 저장해 실시간으로 오면 실패 행이 자동으로 사라짐(중복 0).
- 같은 cid 서버 중복 방지: 텍스트 RPC `p_client_message_id`(`service.ts:17434`) + 응답 `deduped`(:17468) + 고유 인덱스 `uq_cm_messages_room_sender_client_message_id`(`supabase/migrations/20270414140200_wp6_chat04_client_message_id_unique_index.sql:17`) + 비원자 경로 사전 조회(`service.ts:17633-17645`) + 라우트 키(`app/api/community-messenger/rooms/[roomId]/messages/route.ts:251-254`). **운영 RPC 현재 정의는 NOT_PROVEN**(운영 DB 미조회).
- 입력창과의 관계: indeterminate 는 글이 말풍선에 남으므로 입력창 복원 안 함(중복 전송 방지). 같은 글을 다시 치면 `pickTextSendClientMessageId`(`messenger-outbound-failed-send.ts:103-109`)가 같은 cid 를 재사용 → 서버 1행 + 실패 행 자동 제거.
- **기존 설계와 충돌(보고, 규정 7번)**: M-8 「실패 시 입력창 복원」(`messenger-composer-fail-restore.ts:1-4`)과 Telegram 식 「실패 말풍선 유지」가 겹친다. 이 설계는 indeterminate=말풍선 유지, definitive=M-8 그대로로 나눴다. 부작용: 실패 행은 방을 나가면 사라진다(돌아옴 보관이 pending 제외 — `messenger-room-scroll-position-store.ts:83,93`). 현재 사진·음성 실패 행과 같은 동작이지만, 텍스트는 지금은 (조건부로) 입력창 임시저장에 남는다(`CommunityMessengerRoomPhase2Composer.tsx:491-492` `writeRoomComposerDraft`). → 「실패 텍스트 행이 남은 채 방을 나가면 글이 사라짐」을 받아들일지 **Owner 결정 필요**. 받아들이지 않으면 언마운트 정리(`failedOutboundRowIdsRef`)에서 실패 텍스트 1건을 입력창 임시저장에 넣는 안이 있으나 이는 동작 추가라 이 설계에 넣지 않았다.

### B-5. 시간 제한 값
- **12초** — 코드 근거: 앱 공통 클라이언트 fetch 기본값 `lib/http/fetch-with-timeout.ts:21` `const { timeoutMs = 12_000, ...`; 진입 공유 요청 `lib/http/shared-flight-deadline.ts` 「앱 공통 클라이언트 fetch 계약(`fetchWithTimeout` 기본·`/api/me/profile`·읽음 처리 12초)과 같다」 `ENTRY_SHARED_FLIGHT_DEADLINE_MS = 12_000`; 읽음 처리 `use-messenger-room-open-mark-read-effect.ts:104` `CM_MARK_READ_SERVER_TIMEOUT_MS = 12_000`. 문서 D1-d 의 15초는 근거 없음 → 12초로 정한다(규정 5번).
- 타임아웃 abort → `fetchWithTimeout` 이 예외 → 기존 catch(:1233) → `classifyMessengerSendFailure({ networkError: true })` = indeterminate → B-4 실패 행. 시계 아이콘 최대 12초 후 경고 아이콘.

### B-6. i18n (lib/i18n/catalog/community-messenger-ui.ts, ko·en 동시)
- 유지·재사용(aria 전용, 화면 글자 아님): `common_sending`(SENDING), `cm_ui_send_failed_label`(FAILED, ko :13 「전송 실패」/en :1174 「Not sent」), `cm_ui_unread`(direct·private_group 의 SENT — 「안 읽음」/「Unread」 의미가 정확한 경우만).
- 추가(2개, 기존 `cm_ui_*` 규칙):
  - `cm_ui_msg_status_sent`: ko 「보냄」 / en 「Sent」 — open_group SENT aria(읽음 추적 없음).
  - `cm_ui_msg_status_read`: ko 「읽음」 / en 「Read」 — READ aria.
- 화면 글자 삭제 후 `common_sending` 은 다른 화면에서도 쓰므로 키 유지(rg: 사용처 = 이번에 바뀌는 4곳뿐이나 common 카탈로그라 삭제하지 않음). `check:i18n-quality` 파일별 개수 증가 없음(새 문자열은 카탈로그 키).

### B-7. 영향 화면·호출처 전부
- 행 컴포넌트 `MessengerTimelineVirtualRow` 사용처: `CommunityMessengerRoomPhase2MessageTimeline.tsx:2177` **1곳**(rg). 타임라인은 모든 메신저 방 공용 → 1:1(`direct`)·`private_group`·`open_group`·거래 방(거래 도크 `hasTradeDock` :646)·주문 방(`hasStoreOrderDock`) 모두.
- 방 클라이언트 호스트: `app/(main)/community-messenger/rooms/**` 방 화면, 데스크톱 분할(사이드 레일 — `lib/layout/__tests__/desktop-side-rail-contract.test.ts:108-114`), 주문 슬라이드 패널 `components/mypage/BuyerStoreOrderChatSlidePanel.tsx:272`, `components/business/owner/OwnerStoreOrderChatSlidePanel.tsx:234`.
- 말풍선 내부: `MessengerTimelineBubbleInners.tsx`(사용처 VirtualRow 만), `MessengerChatImageBubble.tsx`(사용처 BubbleInners:34 만 — 테스트 제외), `VoiceMessageBubble.tsx`(lazy `community-messenger-room-phase2-lazy.tsx:14` 경유; Composer·CallLayer·RoomSheets·MemberActionModal 은 import 만 하고 `<VoiceMessageBubble` 렌더 0건 — 실제 렌더는 `MessengerTimelineBubbleInners.tsx:74` 1곳. 4개 파일의 미사용 import 는 prop 타입 변경 시 타입 오류 없음, 정리는 범위 밖).
- 관리자 화면: `app/admin` 에서 위 컴포넌트 사용 0건(rg) → 영향 없음. Philife·스토어 스트림(`lib/chats`)은 별도 컴포넌트 → 영향 없음.
- `components/community-messenger/room/phase2/_extract/*.txt` 는 텍스트 추출본(빌드 제외) — 수정 불필요.

### B-8. 회귀 위험과 예방
| 위험 | 내용 | 예방 |
|---|---|---|
| 가상 스크롤 행 높이 | 시간을 말풍선 안으로 옮기면 마지막 줄이 꽉 찬 글은 한 줄 늘어남 → 추정 높이(`messenger-timeline-row-estimate.ts:18` 52px)와 차이 | 높이는 `measureElement`(Timeline:2188-2196)가 실측 보정. 상태 변화로는 높이 불변(B-3) → 보낸 뒤 체크 바뀔 때 스크롤 튐 0. 직접 배치 행은 `content-visibility`(VirtualRow:253-268) 기존 그대로 |
| memo 비교기 | 새 prop 이 객체면 전 행 리렌더 | `outboundReadState` 원시 문자열. 커서 전진 시 상태가 바뀌는 행만 리렌더. `chat-p0-1-render-storm-contract.test.ts` 유지 |
| 길게 누르기 | 표시 칸이 말풍선 안에 들어감 → 누르기 영역 | 표시 칸 `pointer-events-none`. `bindMessageInteraction`(:322-) 무변경. `messenger-media-remaining-defects.test.tsx:51-57` 유지 |
| 복사 | 시간·상태가 복사되나 | 복사는 `item.content`(controller:2741-2749) — DOM 무관. 복제 칸 `select-none` |
| 검색 강조 | `timelineHighlightMessageId` 테두리(:715-717) | 행 래퍼 무변경 |
| 반응 위치 | 반응 줄은 말풍선 밖 아래(:490-522) | 무변경 |
| 안 읽음 구분선 | 내 커서 기반(:1034-1119), 상대 커서와 독립 | 무변경 |
| 맨 아래 고정 | ACK 시 높이 변화 → 바닥에서 밀림 | 「전송 중」 글자 제거로 ACK 시 폭·높이 변화 자체가 사라짐(오히려 감소) |
| 접근성 | 글자 → 아이콘 | `role="img"` + `aria-label`(B-6). 실패 행 버튼은 기존 그대로 |
| 다크 모드 | — | 앱 토큰에 다크 모드 없음(`app/design-tokens.css`·`samarket-components.css` 에 `prefers-color-scheme` 0건) → 해당 없음. 거래 판매자/구매자·주문 테마는 `--cm-room-bubble-outgoing-fg` 토큰(design-tokens.css:353,386) 사용으로 자동 대응 |
| 묘비·인용·전달 | 삭제 묘비 = TextDefault(:561-566), 「전달됨」 줄(:612-622) | 묘비는 SENT/READ 표시(내 메시지면), 실패·전송 중 불가(묘비는 확정 행만) |
| 실패 텍스트 행 레지스트리 누수 | 확정 행이 와서 실패 행 사라진 뒤 레지스트리 잔존 | 미디어와 같은 가드(retry 시 `isMessengerOutboundRowDisplayed`) + 언마운트 dispose(:1550-1557) |
| 동시 전송 순서 | A·B 연속 전송 중 A 실패 | A 행 FAILED 로 남고 B 는 독립(행·cid 분리). `unconfirmedTextSendRef` 단일 슬롯 문제(S5)는 행별 cid 로 해소 |

### B-9. 테스트
**깨지는 기존 테스트 (수정 필요)**
- `components/community-messenger/room/__tests__/messenger-photo-meta-on-photo-f2.test.tsx` — props 헬퍼 :38 `mineUnreadBadgeVisible`, :42 `sendingLabel`(타입 오류); :92·:97-99·:108 「cm_ui_unread」 글자 기대 → aria 기대로; :111-119 「글 말풍선은 옆 줄에 시간·읽음」 → **설계상 반대가 됨**(안쪽 표시) — 기대 반전.
- `components/community-messenger/room/__tests__/messenger-voice-recording-and-bubble-contract.test.tsx` — :111·:115 `sentTimeLabel` 문자열 → ReactNode; 헬퍼 :162·:166; :225-238 「cm_ui_unread」 글자 기대.
- typecheck:test 로 잡히는 곳: 위 두 헬퍼(`MessengerTimelineVirtualRowProps`).
- 유지 확인(바꾸면 안 됨): `lib/layout/__tests__/desktop-side-rail-contract.test.ts:113` `max-w-[min(76vw,520px)]` · `messenger-presentation-contract.test.ts:92-106` 통화 시간 · `messenger-remaining-defects-pr-a.test.ts:104-108` · `messenger-media-remaining-defects.test.tsx:51-57` · `lib/community-messenger/room/__tests__/messenger-composer-fail-restore.test.ts`·`messenger-outbound-failed-send.test.ts`(헬퍼 무변경이면 그대로 PASS).

**새 테스트**
1. 상태 아이콘: 4상태 aria, 상태별 상자 클래스 동일(`w-4`).
2. VirtualRow 텍스트: SENDING→SENT→READ 재렌더 시 `data-cm-text-meta` 존재, 말풍선 요소 className·복제 칸 동일, 옆 줄 「안 읽음」 0.
3. 1:1 READ 판정 순수 함수: 커서 (t,id) 기준 이전·같음·이후, created_at 동률 id 비교, 커서 시각 불명 → 전부 SENT, pending 은 READ 불가.
4. 그룹 floor: readCount≥1 최신 메시지 이전 전부 READ, 24개 밖 옛 메시지 READ, 0건이면 전부 SENT.
5. controller `sendRawText`: (a) fetch 가 12초 안에 안 끝나면 행 `sendFailed` (fake timers + abort) (b) 5xx → 행 유지·입력창 복원 없음 (c) 4xx → 행 삭제·M-8 복원 (d) retry → 같은 cid 로 POST 본문 (e) 같은 cid 확정 행 도착 → 실패 행 제거 (f) A 실패·B 성공 → A 행 남음.
6. sticker: fetch 예외 → 실패 행(현재는 전송 중 고착).
7. `mergeRoomMessages`: 낙관 행 2개 같은 시각 금지·`…:9`/`…:10` 순서 유지.
8. 사진 실패 행: 회전·「전송 중」 없음 + 실패 행 표시.
9. 실시간 커서 패치: 새 id 미발견 시 `lastReadMessageCreatedAt` null.

로컬 검증(개발 프로세스 3번): `npm run typecheck:build` + `npm run typecheck:test` + 위 테스트 파일 vitest + 변경 파일 eslint + `npm run check:i18n-quality`. `verify:parity-gates` 는 hot-path 변경(전송 경로)이므로 Owner 판단 대상 — 규정상 performance-sensitive change 에 해당하는지 NOT 결정(보고).

### B-10. 실기기 검증 행렬 (Android Samsung·Xiaomi + iPhone, Owner 로그인·주소·휴대폰 기준, 매 회 Production SHA·PHT 기록)
| # | 시나리오 | 방 | 기대 |
|---|---|---|---|
| 1 | 글 보내기 | 1:1 | 시계 → 체크1 → (상대 열람) 체크2, 0.1초 프레임에서 말풍선 폭·높이 변화 0 |
| 2 | 연속 3건 | 1:1 | 3건 모두 상태 아이콘, 상대 열람 시 3건 모두 체크2(점프 없음) |
| 3 | 비행기 모드 전송 | 1:1 | ≤12초 뒤 경고 아이콘 + 「전송 실패 · 재전송 · 삭제」, 말풍선 유지 |
| 4 | 3 후 재전송(온라인) | 1:1 | 1건만 저장(운영 DB cid 1행), 체크1 |
| 5 | A 실패 중 B 성공 | 1:1 | A 실패 행 유지, B 정상 |
| 6 | 사진·음성·스티커·파일 | 1:1 | 각 칸에 같은 아이콘, 사진 실패 시 회전 없음 |
| 7 | 그룹(private) | 3인 | 라벨 유지 + 체크1/2 |
| 8 | open_group | — | 체크1 까지만 |
| 9 | 거래 방(판매자·구매자 색) | trade | 아이콘 색 가독 |
| 10 | 주문 방(구매자 마이페이지 패널·사장님 패널) | store_order | 동일 |
| 11 | 데스크톱 분할 | — | 동일 |
| 12 | 상대 메시지(받은 쪽) | 전부 | 시간 위치 변경만, 아이콘 없음 |
| 13 | 긴 글·URL·이모지만 | 1:1 | 시간이 글자와 겹치지 않음 |
- 수신 기기 도착 시각·전송 상태 전환 시각은 운영 DB `created_at`·참가자 `last_read_at` 과 대조(읽기 전용, 규정 10번).

### B-11. 롤백
- 웹 단독 변경 → PR 병합 커밋 `git revert -m 1 <merge>` 를 새 PR 로(보호 규칙상 직접 푸시 불가). 긴급 시 Vercel Instant Rollback → 수정 PR 병합 → Promote(AGENTS.md 개발 프로세스 2번 「장애 복구 절차」). 데이터·DB 변경 없음 → 데이터 롤백 불필요. 설치 앱 재빌드 불필요(앱 재시작).

### B-12. Owner 결정 필요 (설계로 정할 수 없는 것만)
1. 실패 텍스트 행이 남은 채 방을 나가면 글이 사라지는 것(B-4, M-8 과 충돌).
2. 받은 메시지 시간도 말풍선 안으로 옮기는 것(B-3 — 사진·음성 기존 규칙과 일관되게 양방향 적용으로 정했으나, 받은 쪽 모양이 바뀜).
3. 그룹 「읽음 N」 라벨 유지 여부(문서 기본안 유지로 둠) + 라벨 하드코딩 한국어 정리(범위 밖).

### 이 검증의 한계
- 실기기·운영 DB·Production 화면 확인 없음 → 문서 §1-1 실측값(1.3~2.1초, 0.9초)은 NOT_PROVEN(재현 안 함).
- 서버 RPC(`community_messenger_send_text_message`, `community_messenger_group_message_read_counts`)는 저장소 마이그레이션만 읽음 — 운영 현재 정의 NOT_PROVEN.

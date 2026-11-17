# 채팅 남은 결함 수정 설계 — 2026-11-18 (2판, 독립 반박 검토 반영 · 구현 전 승인 대상)

- 지시(Owner 2026-11-18): 「수정 설계 작성」. 앞선 지시: 「병합전에 정확히 최종 확인 후 보고 … 병합을 남발 하면 안되는 부분」.
- 기준 코드: main `ea39ab324`(= 운영). 작업 전 기준 `9f8cf3f2e`.
- 1판 → 2판: 독립 반박 검토(코드 대조)에서 **틀림 3건**(N1·R3·U3), **수정 필요 13건**, 누락 5건, 규칙 충돌 6건이 나와 모두 반영했다. 정정 내역은 §9.
- 원칙: ① 기능 추가·삭제 없음 — 결함 수정만(근거 없는 새 장치 금지). ② 원인 미확정은 계측 먼저. ③ 통화에 닿는 코드(통화 화면을 감싸는 게이트, 통화 라우트를 처리하는 파일, 통화 기록과 공유하는 서버 함수, 통화 Realtime 공용 클라이언트)는 **PR-C(통화 변경 규정)** 로만. ④ 배포 구분 모두 **웹**, 운영 DB 변경 없음.

---

## 0. 결함 목록

| ID | 결함 | 근거 | 구분 | 심각도 | PR |
|---|---|---|---|---|---|
| F1 | 실패 글 무알림 삭제 | 코드 확정 | 신규 | 상 | PR-1 |
| F2 | 맨 아래에서 「↓」 고착 | 실기기 3회 + 코드 확정 | 기존(P3 수정 불완전) | 상 | PR-1 |
| F3 | 음성 영구 삭제 재진입 시 부활 | 코드 확정 | 신규 | 중 | PR-1 |
| F4 | 읽음 커서 미발견 시 체크2→체크1 | 코드 확정 | 신규 | 하 | PR-1 |
| F5 | 읽음 순서 비교 규칙 2벌 | 코드 확정 | 신규 | 하 | PR-1 |
| F6 | 높이 추정 2경로 불일치(그룹) | 코드 확정 | 신규 | 하 | PR-1 |
| F8 | 12초 제한이 응답 본문 읽기에 미적용 | 코드 확정 | 신규 사용 | 하 | PR-1 |
| N1 | 알림 진입 방 → ◁(목록) → ◁ = 이전 방/같은 목록 | 코드 확정 | 신규 | 중 | PR-2 |
| N2 | Navigation API 없는 iOS 에서 ‹ 무동작 가능 | 코드 확정 / 해당 기기 존재 NOT_PROVEN | 신규 | 중 | PR-2(측정 먼저) |
| N3 | 알림 방 로딩 중 ◁ 목적지 다름 | 코드 확정 | 신규 | 하 | PR-2 |
| R1 | 목록 행 입력 중 채널 스크롤마다 가입·해제 | 코드 확정 | 신규 | 중 | PR-3 |
| R3 | 채널 정리 방식 2벌 | 코드 확정 | 신규 | 하 | PR-3 |
| R4 | 자동 읽음 동시 실행 상한 없음 | 코드 확정 | 신규 | 하 | PR-3 |
| R5a | 새 방 bump 발행기 2벌 | 코드 확정 | 신규 | 하 | PR-3 |
| R6 | 전송 경로 실패 로그 없이 무시 | 코드 확정 | 기존+신규 | 하 | PR-3 |
| R7 | 전송 응답·dedupe 캐시에 내부 필드 | 코드 확정 | 기존 | 하 | PR-3 |
| R8 | 입력 중 저장소 빈 방 칸 | 코드 확정 | 신규 | 하 | PR-3 |
| U1 | 글자 토큰 미적용 6곳 | 코드 확정 | 기존/신규 | 하 | PR-4 |
| U2 | 그룹 읽음 메뉴 최근 24개 한정 | 코드 확정 | 신규 의존 | 하 | PR-4 |
| U3 | 실패 글 보관 길이 상한 없음 | 코드 확정 | 신규 | 하 | PR-4 |
| U4 | 그룹 읽음 문구 서버·클라 2경로 | 코드 확정 | 신규 | 하 | PR-4 |
| U5 | 죽은 코드·쓰지 않는 키·「자리 비움」 분기 | 코드 확정 | 신규 | 하 | PR-4 |
| U6 | 문서 불일치 | 코드 확정 | 신규 | 하 | PR-4 |
| U7 | 동작 테스트 공백 | 코드 확정 | 신규 | 하 | 각 PR |
| D1 | 목록 행 탭 간헐 무시 | 실기기 8회 / 원인 미확정 | 미확정 | 상 | PR-5 |
| D2 | 앱 실행 직후 404 | 운영 16건 / 원인 미확정 | 미확정 | 중 | PR-5 |
| D3 | 목록 얼림 해제 후 옛 화면 잔존 | 코드 확정 | 기존 | 하 | PR-5 |
| D4 | 복원 기록이 404 주소 저장·재생 | 코드 확정 | 기존 | 하 | PR-5 |
| C1 | 방 묶음 채널 세대 고착 → 메시지·읽음·참가자·통화 세션 이벤트 전부 버림 | 코드 확정 | 기존 | 중 | PR-C |
| C2 | 글 외 전송 bump 가 배지보다 먼저 | 코드 확정 | 기존 | 중 | PR-C |
| C3 | 옛 배지 bump 함수 left_at 미필터 | 코드 확정 | 기존 | 하 | PR-C |
| C4 | 통화 주소 빈 id 생성 3곳 | 코드 확정(호출 여부 미확인) | 기존 | 하 | PR-C |
| C5 | 동의 게이트보다 메신저 화면 먼저(N4, 게이트가 통화 화면도 감쌈) | 코드 확정 | 신규 | 하 | PR-C |
| C6 | 배지 함수 재조회(R5b, 통화 기록과 공유 파일) | 코드 확정 | 신규 | 하 | PR-C |
| C7 | 토큰 갱신 발송 잔존(`lib/supabase/client.ts:60`, 통화 Realtime 공용) · `formatCallLogListTime` 죽은 코드 | 코드 확정 | 신규/기존 | 하 | PR-C |
| O1 | 거래·주문 목록 행 입력 중 없음 | 코드 확정 | — | — | **Owner 결정**(§8) |
| T1 | 시각 표기 통일 #438 | 검토 완료·보류 | — | — | Owner 승인 후 |

---

## PR-1 대화방 전송·표시 (웹)

### F1 실패 글 무알림 삭제
**원인(정정)**
- 방 진입 자동 재전송(`use-messenger-room-phase2-controller.ts:1184-1196`, `silentFailure:true`) → definitive 면 `removeRow()`+보관 삭제, 알림 없음(`:1325-1345`).
- 일시 오류가 400 이 되는 경로는 2개: ① PostgREST 전송 오류·statement_timeout = `rpcErr` ② 송신 RPC 의 `WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM,'rolledBack',true)`(deadlock·lock timeout·직렬화 실패) → `service.ts:17453-17457` → route 400. 서비스의 `message_send_failed`(rpcRaw null·readmit 실패)와 route `:518-523` 확정 행 재조회 실패도 서버 저장 여부를 알 수 없는데 400.
- route dedupe 캐시가 실패 응답도 2.5초 저장(`:355`)하고 캐시 응답은 항상 400(`:337`).

**레거시 기준**: Owner 승인 §6-1 #1 — 실패 메시지는 오류 아이콘으로 남고 사용자가 재전송·삭제. 자동 재전송은 승인안에 없음(작업자 임의 추가).

**수정**
1. 방 진입 자동 재전송 삭제. 보관 글은 **실패 상태 행**(`pending:true, sendFailed:true` + `registerFailedTextRowHandlers` 등록)으로 복원 — 지금은 `pending:true` 만이라 「전송 중」으로 보임(`:1174`).
2. 서버 「알 수 없음」 판정 = ① rpcErr ② `payload.rolledBack===true` 이면서 업무 코드가 아닌 오류 ③ `message_send_failed` ④ 확정 행 재조회 실패 → **503**, 오류 코드 `message_send_unavailable`, 문구는 i18n 키·요청 언어. 업무 거절 코드(forbidden, content_required, room_not_found, room_deleted, room_blocked, room_archived, room_readonly, store_order_chat_closed, trade_chat_mode_locked, trade_flow_not_chatting, trade_sender_left, trade_seller_closed, reply_target_not_found, reply_target_invalid, unique_violation, bad_args, null_sender_forbidden, domain_mismatch, identity_mismatch, not_member, participant_left)는 지금처럼 4xx.
3. dedupe 캐시: 실패 응답은 저장하지 않음(성공만).
4. definitive 처리 구분:
   - **첫 전송**(글이 입력창에서 막 나온 경우): 지금처럼 행 제거 + 입력창 복원(M-8) — 글은 입력창에 있으므로 손실 없음.
   - **실패 행 재전송**(글이 입력창에 없음): 행 유지(실패 상태) + 사유 스낵바. 「삭제」 버튼으로만 제거.
   - authBlocked(로그인 화면으로 보내는 경로, `:516`): 보관분을 지우지 않음 → 로그인 뒤 같은 방에서 실패 행으로 다시 보임.
5. 완료 조건: **사용자 조작 없이 글이 사라지는 경로 0**(코드 경로 전수 표를 PR 에 첨부).

**테스트(동작, renderHook)**: 보관 글 진입 → 요청 0·실패 행 / 재전송 503 → 행 유지 / 재전송 403 → 행 유지+스낵바 / 첫 전송 403 → 행 제거+입력창 복원 / 삭제 → 보관 제거 / deduped → 확정 행. route: rpcErr·rolledBack·message_send_failed → 503, 업무 코드 → 4xx, 실패 응답 캐시 안 됨.

### F2 「↓」 고착
**원인(정정, 3개)**
- ① `messenger-room-entry-unread-snapshot.ts:90` 이 **새 스냅샷을 만들 때**(`:78-91`) viewport 와 무관하게 위치를 「읽는 중」으로 씀. 맨 아래에서 상대 글 → `room.unreadCount` 1 → capture → 덮어씀.
- ② 첫 안 읽음 이동(`messenger-room-scroll-anchor-controller.ts:493`) 후 `onDone :497-501` 이 위치를 동기화하지 않고, 이동 중 scroll 이벤트는 `:549`(`engine.isAnimating()`)에서 버려짐.
- ③ FAB 는 위치와 별개로 `remainingUnreadCount>0` 이면 켜짐(`messenger-room-first-unread.ts:152`). remaining 은 `lastVisibleMessageId` 기준(Timeline `:1039-1046`) — lastVisible 이 새 글까지 전진하지 않으면 남음.

**수정(SSOT = 「병합·레이아웃 뒤 viewport 동기화 1회」만 위치·lastVisible 을 씀)**
1. capture 에서 위치 쓰기 삭제(스냅샷 기록만). 진입 전 낡은 위치 정리는 기존 `useMessengerRoomReaderScrollRoomLifecycle`(phase1 `:819`)이 이미 함 — 새 정리 지점 추가하지 않음(위치 null 이면 FAB 가 보이는 회귀 방지).
2. 첫 안 읽음 이동 `onDone`·애니메이션 없는 이동 끝에서 `syncMessengerRoomReaderStateFromViewport`(위치+lastVisible) 호출.
3. 상대 글 병합 뒤 동기화는 기존 S3(`scheduleReaderStateSyncAfterEntry`)가 위치·lastVisible 을 모두 쓰는지 확인하고, 수신 병합 경로가 반드시 S3 를 지나게 연결(1판의 S6 교체안은 병합 **전** 실행이라 효과 없음 — 삭제).
4. 진입 완료(`completeEntryPhase`)는 `stickToBottomRef` 대신 viewport 를 읽어 기록(스크롤 이벤트 없는 짧은 방).

**영향받는 소비자(같은 단계에서 확인)**: FAB(`MessengerRoomNewMessagesBelowChip`), 방 안 안 읽음 계산 `messenger-realtime-store.ts:138` `activeRoomActuallyReadable`, 방 안 배너·소리 `cm-participant-unread-full-effects.ts:275`, 진입 구분선·첫 안 읽음 — 위치가 실제와 맞게 되므로 맨 아래에서 「읽는 중」으로 잘못 판단하던 소리·배너도 바로잡힘. capture 호출처 6곳(Timeline `:1014`, phase1 `:568/:628/:633`, `messenger-room-scroll-anchor-controller.ts:615`, mark-read `:533`)은 위치 쓰기만 사라짐.
**테스트**: 맨 아래+unread 1 → FAB 숨김 / 짧은 방 미읽음 진입 → FAB 숨김 / 첫 안 읽음 이동 후 맨 아래 → 숨김 / 위쪽 읽는 중 수신 → FAB+배지 / 진입 구분선 위치 동일 / 방 안 소리 판정.
**문서**: viewport 문서 §7 행 추가.

### F3 음성 영구 삭제 부활
- 원인: 방 안 처리(`use-messenger-room-bump-broadcast-subscription.ts:223-244`)가 실시간 저장소 `messagesByRoomId` 를 지우지 않음 → 재진입 병합(phase1 `:442-453, 650`)에서 부활. 방 밖에서 삭제되면 이 처리 자체가 안 돎.
- 수정: 저장소 `removeMessage(roomId, messageId)` 추가. 호출: ① 방 안 hard_deleted 처리 ② 전역 bundle 채널 DELETE 이벤트(`global-messenger-room-bundle-channel.ts:312,331` — old 행에 room_id 가 있을 때). hub 미리보기 재조회는 rooms UPDATE 경로가 이미 맡으므로 추가하지 않음.
- 영향: 저장소를 읽는 목록 행 미리보기(`MessengerChatListItem.tsx:510`)·목록 입력 중 미리보기(`MessengerChatListTypingPreview.tsx:69`) — 삭제 메시지가 미리보기에서도 빠짐(정상화).
- C1(채널 세대 고착)이 고쳐지기 전에는 ②가 이벤트를 못 받을 수 있음 → PR-C 와 함께 실기기 확인.

### F4·F5 읽음 커서
- F4 원인: 커서 id 를 행에서 못 찾으면 `lastReadMessageCreatedAt=null`(`messenger-peer-read-cursor-guard.ts:74-79`) → 판정 키 null → 내 메시지 전부 체크1.
- 수정: 행을 못 찾으면 **직전에 계산한 키(시각·id 둘 다)** 를 그대로 사용(옛 시각+새 id 조합 금지). 행이 도착하면 `resolveDirectPeerReadCursorKey`(`outbound-read-state.ts:64-86`)가 렌더마다 다시 찾으므로 자동 전진 — 별도 보류값 불필요.
- F5: 가드(`:39-43`, ms+localeCompare)와 판정의 비교를 `compareMessengerReadOrderKey`(µs 포함) 하나로.
- 테스트: 상대 글 participant 먼저 → 체크2 유지 → 행 도착 후 전진 / 같은 ms·다른 µs.

### F6 높이 추정
- `messenger-room-timeline-paint-model.ts:89,106,110`·Timeline `:556` 에 `isGroupRoom` 전달, 시그니처 변경 호출처 전부 수정. 진입 앵커 위치 영향 → viewport 문서 §7 기록.

### F8 본문 읽기 시간 제한
- 공용 `fetchWithTimeout` 은 그대로, 텍스트·스티커 전송만 본문 파싱까지 같은 12초 안에 끝내는 메신저 전용 함수 사용.

---

## PR-2 뒤로 가기 (웹)

### N1 알림 진입 방 → ◁ → 목록 → ◁
- 원인: 알림 이동 시 「알림으로 떠난 항목」 표시(Chromium 이 사용자 조작 없는 push 의 직전 항목을 건너뛰어 WebView canGoBack=false 가 되는 문제의 보완, `push-navigation-back.ts:5-6`, Android ◁ 가 이 표시로 동작 `overlay-back-stack.ts:108,117`). 방 ◁ 가 목록으로 **replace** 해도 앞 항목 표시가 남아 목록의 ◁ 가 `history.back()` → 이전 방/같은 목록.
- 수정(1판 「웜이면 표시 안 씀」은 Android ◁ 회귀라 철회): **표시는 유지**, 방 ◁ 목적지가 「목록 replace」로 실행될 때 그 바로 앞 항목의 표시를 지움(`messenger-room-back-target.ts` 실행부 + `push-navigation-back.ts` 정리 함수). `PushRouteListener`(통화 라우트도 처리)는 수정하지 않음.
- 테스트: 방 B 보는 중 알림 C → ◁=목록 → ◁=B 가 아닌 **목록 이전 화면(HOME)** / 목록에서 알림 → ◁=목록 → ◁=HOME / 콜드 → ◁=목록 → ◁=HOME → ◁=나감 / 비메신저 화면 알림 진입 ◁(결함 E) 기존과 동일.

### N2 Navigation API 없는 iOS
- 원인 확정(`messenger-room-entry-origin-store.ts:74,85`, `history.length` 키).
- **측정 먼저**: 운영 DB `user_devices` 에 OS 버전 열이 없어 대상 기기 존재를 알 수 없음. Owner iPhone 앱에서 `'navigation' in window` 확인(디버그 진단 화면 또는 콘솔 로그 1줄 추가).
  - 있으면: 수정 없음(현재 코드 경로가 Navigation API 사용).
  - 없으면: 1판 journal 안은 새 장치라 채택하지 않고, 이 경우 머리글 ‹ 는 「방 종류 목록 replace」 고정(뒤로 기록 판정 불가 환경에서 무동작 대신 항상 동작) — Owner 확인 후 적용.

### N3 알림 방 로딩 중 ◁
- 셸이 `roomType == null` 이면 페이지 뒤로 주인 미등록(`MessengerRoomSwipeBackShell.tsx:298`). 수정: 스냅샷 전에도 등록, 누른 순간 목적지 계산(roomType 없으면 URL `cm_list` → 없으면 대화 목록). 「방을 찾을 수 없음」 버튼도 같은 함수.

---

## PR-3 실시간·목록 (웹)

### R1 목록 행 입력 중 채널 반복 가입
- 원인: 보이는지 바뀔 때마다 즉시 가입·해제(`messenger-chat-list-typing-slots.ts:31-71`).
- 수정: 목록 컴포넌트가 스크롤 상태를 슬롯 모듈에 알림(목록 컨테이너 `scroll` 마다 「스크롤 중」, `scrollend` 또는 마지막 scroll 후 250ms 무이벤트 시 「멈춤」) → 스크롤 중에는 가입 변경 보류, 멈춘 뒤 보이는 행 집합으로 1회 재계산. 상한 15 유지. (`scrollend` 는 Android WebView 114+, iOS 미확인 → 250ms 대체 경로가 기본 보장.)

### R3 채널 정리 단일화
- 등록부가 `_remove` 를 쓰는 이유 확인: realtime-js 2.99.2 `unsubscribe` 는 leave 응답이 error 면 `onClose`·`_remove` 를 하지 않아 채널이 소켓 목록에 남음(`RealtimeChannel.js:382-384`).
- 수정: 그 처리(남은 같은 토픽 채널을 `_remove` 로 소켓 목록에서 제거, 함수 없으면 건너뜀)를 lease 도우미로 옮기고, 등록부는 참조 수만 관리하며 lease 를 사용. 결과: 정리 방식 1벌.

### R4 자동 읽음 상한
- `route.ts:461-466` 을 `runWithConcurrencyLimit(…, 8)` 로.

### R5a 새 발행기 2벌
- `publish-text-send-room-bump.ts`·`publish-message-hard-deleted-room-bump.ts` 를 한 모듈로(둘 다 이번 작업의 신규 파일, 통화 무관). 통화 공유 발행기와의 정리·배지 함수 재조회(R5b)는 PR-C.

### R6 실패 로그
- `route.ts:424-427, 432-436, 456-458, 470-472, 500-502`, `post-ack-effects.ts:193` 에 구조화 경고 1줄(단계·이유 코드·roomId). 동작 변경 없음. (bridge 파일은 PR-C.)

### R7 응답 내부 필드
- 응답·dedupe 캐시(`:355`)에서 `postAckEffects` 제거. 소스 계약 테스트 `cm-send-domain-target-bump-before-ack-contract.test.ts`, `group-notify-room-kind-resolve.contract.test.ts` 확인·갱신.

### R8 입력 중 저장소
- `clearTyping`·`clearExpired` 가 빈 방 칸 삭제, 변화 없으면 같은 상태 반환.

---

## PR-4 화면·정리 (웹)

- **U1** 토큰: `CommunityPostShareMessageCard.tsx:60,64`, `MessengerOutboundFailedActions.tsx:28`, `CommunityMessengerRoomPhase2Composer.tsx:510,535`, `MessengerChatListItem.tsx:1127`, `MessengerRoomNewMessagesBelowChip.tsx:66`, `MessageActionMenu.tsx:107`.
- **U2** 그룹 읽음 수: 메뉴를 열 때 길게 누른 그 메시지 id 1개를 기존 POST `{messageIds}`(`group-rooms/[roomId]/media/route.ts:63-89`)로 조회. 그룹 읽음 기준(체크2)은 기존 24개 조회 유지하되 call_stub·묘비 제외.
- **U3** 보관 길이: 잘라내지 않음(1판 철회). 서버 전송 허용 길이를 넘으면 보관하지 않고 실패 사유(i18n) 안내 — 입력 단계에서 이미 막히는지 먼저 확인.
- **U4** 그룹 읽음 문구: 서버 응답 `label` 생성 제거(`media/route.ts:90-94`), 클라이언트 하나만.
- **U5** 죽은 코드: `subscribeSamarketRealtimeTokenRefreshed`(+ 계약 테스트 `realtime-token-refresh-recovery.contract.test.ts:35`·mock 3곳 갱신), `cmRtLogAuthEpochBump`, `hasPageBackOwner`(+ `overlay-back-stack-page-owner.test.ts`), `shouldShowGroupReadReceipt`, `cm_ui_away`, 「자리 비움」 색 분기(`CommunityMessengerPresenceDot.tsx:18`, `ChatRoomMoreMenu.tsx:124`), 폴백 정규화(`use-community-messenger-peer-presence.ts:144-145`). `"away"` 타입(`types.ts:26`)·`presence-policy.ts:17,89` 는 구 클라이언트 값 수신 호환으로 유지. `lib/supabase/client.ts:60` 발송 제거와 `formatCallLogListTime` 은 PR-C.
- **U6** 문서: viewport 문서 §7(P4·P5·F2·F6 행), `group-chat-presence-typing.md` §3 복원(5초·5.9초·이름 규칙)·참조 정정, `messenger-realtime-policy.md` 채널 재생성 행 정정, 마이그레이션 `20271118150000` 주석 「운영 적용·대조 완료(2026-11-18)」.

---

## PR-5 원인 미확정 — 계측 + 확정된 기존 결함 (웹)

### D1 목록 행 탭 간헐 무시
- 확정 사실: 채팅 허브는 Activity 보관 대상 아님(가설 기각). 로그 없이 탭이 버려지는 경로 4곳 — (a) 세로 14px 이동 `MessengerChatListItem.tsx:783-786` → `:808` (b) `ignoreNextLostCaptureRef` 잔존 `:891-896` (c) `kickRoomNavPrefetchOnPointerDown()` 예외 `:757` (d) 이동 성공 로그 없음.
- 계측(동작 변경 없음): 행 `onPointerDown` 진입·좌표, `:808` 조기 반환 이유, `:891-896`, 이동 호출 직전, prefetch 예외, 목록 얼림 시작·해제 — `[cm-row-tap]`.
- D3(기존): 목록 얼림(`CommunityMessengerHomeListPane.tsx:352-353`, 1.5초) 해제 시 다시 그리게 1회 갱신.
- 확정 절차: 두 기기에서 「방 → ◁ → 행 탭」 20회·「하단 탭 → 행 탭」 20회, logcat 보존. 로그가 가리키는 경로만 별도 수정. 로그가 0이면 포인터 이벤트 미도달 → 상위 층으로 범위 이동.

### D2 앱 실행 직후 404
- 확정 사실: 운영 404 16건 모두 04:50~05:00 PHT, 이전 14일 0건. Next 클라이언트 이동은 끝 `/` 를 지우므로 빈 id 이동을 배제 못 함.
- 계측: 복원 재생 대상 경로, `/community-messenger/calls` 로 가는 앱 안 이동 호출 위치 로그.
- D4(기존): not-found 화면(`app/not-found.tsx` 및 하위 not-found)이 렌더될 때 문서에 not-found 표시를 남기고, `lifecycle-route-effects.client.ts:115-133` 은 표시가 있으면 복원 기록을 쓰지 않음. 동적 id 404 도 같은 표시로 걸러짐(1판 「라우트 존재 확인」은 동적 id 를 못 걸러 철회).

---

## PR-C 통화에 닿는 항목 (통화 변경 규정: 영향 분석 문서 → Owner 승인 → 단독 PR·단독 병합 → 실기기 통화 행렬)

| ID | 결함 | 수정 | 통화 영향·주의 |
|---|---|---|---|
| C1 | `global-messenger-room-bundle-channel.ts:509-516` 「방 집합 같음」 건너뛰기 전에 `++postgresBindGeneration`·`++bundleTopicGeneration` → 기존 채널의 `staleBind`(`:298`)·`subscribeWithRetry.isCancelled`·`onStatus`(`:552-554`)가 낡은 세대로 판정 → 메시지·읽음·참가자·**통화 세션** 이벤트와 재연결 재가입까지 끊김 | 두 증가를 건너뛰기 판정 뒤로 | 채널이 call_sessions 를 받음(`:457-498`) — 통화 상태 수신 정상화 |
| C2 | 글 외 전송의 bump 가 배지보다 먼저(`publish-messenger-room-bump.ts:153 vs :183`) | 배지 → bump | 배지 함수가 수신자 순차 await → 그룹은 bump 지연 회귀 가능 → 분석·측정 포함 |
| C3 | 옛 배지 함수 비그룹 left_at 미필터(`notification-target-messenger-bridge.ts:226-231`) | left_at 제외 | 스티커·전달 경로 readmit 여부 확인 후 |
| C4 | 빈 id 통화 주소 생성(`call-v3-route.ts:9-11`, `incoming-call-preview-route.ts:5-7`, `openDirectCallPage`) | 빈 id 면 이동 안 함 | 반환형 변경 → 호출처 9곳 함께 수정 |
| C5 | 동의 게이트 순서(N4) | 메신저 게이트가 세션·동의 확인 끝까지 내용 미표시 | `CommunityMessengerGuestGate` 가 calls 화면도 감쌈 → 콜드 수신 통화 화면 지연 위험 분석 필수 |
| C6 | 배지 함수 재조회(R5b) | RPC 수신자 재사용 — 단 그룹은 배지 쪽이 `blocked_hidden_at` 도 제외(`group-active-membership-gate.ts:171-173`)하므로 그룹은 기존 조회 유지, 비그룹만 | 통화 기록 공유 파일 |
| C7 | `lib/supabase/client.ts:60` 토큰 갱신 발송 잔존, `formatCallLogListTime` | 제거 | 통화 Realtime 공용 클라이언트·통화 표시 파일 |

---

## 7. 순서·검증·병합

| 순서 | PR | 실기기 완료 기준 (매회 Production SHA·PHT·기기·계정) |
|---|---|---|
| 1 | PR-1 | 비행기 모드 전송 → 실패 행, 재진입 후 실패 행·요청 0, 재전송 1행 / 맨 아래 수신 10회·방 진입 5회 「↓」 0 / 음성 삭제 후 재진입 없음 / 상대 글 수신 시 체크2 유지 |
| 2 | PR-2 | 알림 4경로 ◁·‹ / reload / 오픈 그룹 / iPhone `navigation` 존재 확인 |
| 3 | PR-3 | 목록 빠른 스크롤 중 채널 가입 로그 수 / 입력 중 표시 유지 |
| 4 | PR-4 | 토큰 6곳 픽셀 / 그룹 메뉴 읽음 수 |
| 5 | PR-5 | 행 탭 40회 로그 → 원인 확정 보고 / 404 계측 |
| 6 | PR-C | 통화 행렬(통화 변경 규정 5번) + 메시지 수신·읽음 표시 |
| — | #438 | 통화 탭·상세·방 통화 줄 ko/en |

- 로컬 검증(PR 마다 1회): typecheck:build·typecheck:test·관련 vitest·eslint·check:i18n-quality·verify(진입 스크롤·대화 스크롤·키보드·통화 표면·라우트).
- **병합 절차 충돌 보고**: AGENTS.md 개발 프로세스 1번은 「작업자가 PR 직후 자동 병합 등록, Owner 에게 병합 요청 안 함」. Owner 2026-11-18 지시는 「병합 전에 정확히 최종 확인 후 보고 … 병합을 남발하면 안됨」. 두 규정이 다르므로 임의로 고르지 않고 보고한다. 이 설계는 최신 Owner 지시를 따라 **PR 마다 독립 결함 검토 + 계획 대비 대조 → 보고 → 그다음 자동 병합 등록**으로 적었다.
- 롤백: 웹 PR revert 1회 또는 Vercel Instant Rollback. DB 변경 없음.

## 8. Owner 결정 (2026-11-18 「권장안을 따른다」 — 아래 기본안 확정)
- 1 → PR 마다 독립 검토·계획 대조 → 보고 → 그다음 자동 병합 등록.
- 2 → 거래·주문 목록 행 입력 중 넣지 않음.
- 3 → iPhone 에서 Navigation API 측정 후, 없으면 ‹ = 목록 replace 고정.
- 4 → PR-C 진행: 통화 영향 분석 문서 작성 → (통화 변경 규정 3번) 문서 승인 후 구현.
- 5 → #438 병합(2026-11-18 06:01 PHT, 845daf00f).

(원래 질문 목록)
1. 병합 절차(§7 충돌).
2. O1 거래·주문 목록 행 입력 중: Owner 승인 §6-1 은 「대화 목록 행에 입력 중」(레거시는 목록이 하나). 거래·주문 목록에도 넣을지 — 넣으면 표시 범위 확대라 기본안은 넣지 않음.
3. N2 Navigation API 없는 iOS 일 때 ‹ 를 목록 replace 고정으로 할지(측정 후).
4. PR-C 진행 승인(통화 규정).
5. #438 병합 승인.

## 9. 1판 대비 정정(반박 검토 반영)
- 틀림 3건 철회: N1 「웜이면 표시 안 씀」(Android ◁ 회귀), R3 「lease 로 단순 통일」(leave error 시 채널 잔존), U3 「잘라 저장」(글 손실).
- 수정 13건: F1(일시 오류 경로·캐시·첫 전송·복원 상태·authBlocked), F2(원인 ③·정리 지점·줄 번호·소비자 2곳), F3(방 밖 삭제·미리보기·hub 재조회 삭제), F4(보류값 불필요·키 통째 유지), F7(S6 교체 철회 → F2 로 통합), N2(journal 철회 → 측정 먼저), N4(→ PR-C), R1(대체 판정·컨테이너 연결), R5(→ R5a/C6 분리), R7(캐시·계약 테스트), U5(테스트·공용 클라이언트), D4(not-found 표시 방식), C1·C2·C4 보완.
- 규칙 충돌 6건 반영: 병합 절차 보고, 통화 규정 범위(N4·N1 PushRouteListener 미수정·client.ts·bridge → PR-C), 새 장치 철회(journal·잘라내기·hub 재조회), i18n 키, viewport §7.

## 10. 확인 못 함 (NOT_PROVEN)
- 감사 확정본의 「도착 때 약 1초 튐」, 오픈 그룹 ‹/◁ 불일치, 분할 화면 직접 push 5곳이 P3·P5 로 해결됐는지 **실기기 미측정**(코드 반영은 P3·P5 에 있음).
- iPhone 전 항목, 그룹방, 분할 화면.
- D1·D2 원인.

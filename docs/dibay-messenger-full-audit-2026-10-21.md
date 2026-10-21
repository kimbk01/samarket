# DIBAY 메신저·친구·대화·통화 전면 감사 + 통합 개선 설계안 (2026-10-21)

> **상태:** 감사·설계만 했고 코드·DB·네이티브는 바꾸지 않았습니다. **Owner 승인 대기**입니다.
> **기준:** HEAD `1a32cb1b`, 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회(테스트 DB는 조회하지 않음), Android 소스 1.2.4(9) / iOS 소스 1.2(7). 두 버전 모두 운영 `user_devices` 에 설치 기록이 있습니다.
> **판정 기호:** **C** = CONFIRMED(코드·DB 근거로 확정) · **S** = SUSPECTED(실행·실기기 증거 필요) · **N** = NORMAL(근거로 정상 확인) · **NP** = NOT_PROVEN(측정·확인 불가)
> 기존 감사 문서·PASS 보고는 증거로 쓰지 않았습니다. 모든 판정은 현재 코드 `file:line` 또는 운영 DB 조회 결과에 근거합니다. 실기기 재현은 아직 한 건도 하지 않았으므로 **실기기 PASS 는 0건**입니다.

---

## A. 현재 구조

```
친구(user_social_relations owner→target, 단방향 연락처)
  ├─ 숨김: user_relationships(hidden) · 즐겨찾기: community_friend_favorites
  ├─ 차단: user_social_relations(blocked) → 진행 중 통화 종료 + 1:1 방 blocked_hidden_at
  ▼
대화 목록(CommunityMessengerHome → MessengerChatListItem 하나가 스와이프·탭·롱프레스 담당)
  ├─ Realtime: community-messenger-home:meta:<uid>(participants·social) / rooms-in:<uid>:<chunk>(rooms·messages)
  ▼
채팅방(phase1 bootstrap → phase2 controller)
  ├─ 송신: POST messages → RPC send_text(client_message_id UNIQUE) → ACK → after(): 푸시 → 서버 bump
  ├─ 수신: 방별 private bump 토픽(스냅샷 v2) + global-messenger bundle postgres_changes → merge
  ▼
통화(launchOutgoingDirectCall → V4 세션 생성 → iOS/Android 네이티브 화면, 웹은 데스크톱 전용)
  ├─ 시그널: VoIP/FCM push(critical path) + call_sessions postgres_changes + 폴링 백업
  ├─ 종료: PATCH → call_logs INSERT + call_stub 메시지 + 서버 bump(스냅샷)
  ▼
통화 기록(call_logs/call_sessions postgres_changes → GET /calls 재조회) · 알림(notification_events → FCM/APNs)
```

**역할 분담**

| 층 | 책임 |
|---|---|
| 웹(Next.js) | 목록·채팅방·입력창 UI, 낙관적 갱신, 통화 시작 흐름(V4), 데스크톱 통화 화면 |
| API·서버 | 권한·차단 판정, 메시지·통화 기록 작성, Realtime bump 발행(**서버만**), 푸시 발송 |
| DB | RLS, 멱등 인덱스, RPC(send_text, append_room_message_atomic, 그룹 RPC), 크론 정리 |
| Realtime | 방 bump(private broadcast), postgres_changes(home·bundle·call logs) |
| 네이티브 | **앱 영상·음성 통화 화면 100%**(`NativeVideoCallActivity.java`, `NativeVideoCallViewController.swift`), Agora, CallKit/PushKit, FGS |

**운영 DB 실측(2026-10-21, 읽기 전용)**
- 친구 기준 데이터는 `user_social_relations` 입니다: friend 활성 202건, blocked 활성 5건 / 해제 2건.
- 예전 테이블 `community_friend_requests`(마지막 쓰기 2026-06-17)와 `community_messenger_friendships` 는 쓰기가 멈췄습니다. 그런데 `friendships` 에는 `status='blocked'` 행이 1건 남아 있고, 이 행에 대응하는 차단 데이터는 없습니다(예전 데이터 잔재).
- 최근 14일 통화 세션 256건은 모두 `call_logs` 와 `call_stub` 메시지가 있습니다(누락 0). → **통화 기록이 안 보이는 문제는 DB 미기록이 아니라 화면·실시간 표시 쪽 문제**입니다.
- ringing·active 상태로 남은 세션은 0건입니다(정리 크론 정상).
- `uq_cm_messages_room_sender_client_message_id`(중복 전송 방지)와 `cm_messages_call_stub_session_uidx`(통화 stub 중복 방지) 인덱스가 운영에 있습니다.
- 메신저 핵심 테이블(participants·messages·rooms·friendships)은 anon·authenticated 권한이 **SELECT 만** 남아 있습니다. 그래서 participants INSERT RLS 정책이 느슨해 보여도 클라이언트에서 직접 쓸 수 없습니다(N).
- `user_social_relations`·`user_relationships`·`community_friend_favorites` 는 authenticated 에게 **INSERT/UPDATE/DELETE 권한이 열려 있습니다**(F-12).
- `user_relationships` 는 **RLS 정책이 0개**입니다(F-14).
- 그룹 방장 위임 RPC 는 `auth.uid()` 로만 권한을 판정하는데 서버는 service-role 로 호출합니다 → **항상 실패**합니다(G-1).

---

## B. 결함 목록

결함 88건(확정 68 · 의심 20 / P1 39 · P2 49)입니다. 위험도는 P0(데이터 유실·보안·핵심 흐름 차단) / P1(사용자 체감 오류) / P2(품질·정합) 기준이며, 이번 감사에서 확정된 P0 는 없습니다. 「웹 / DB / 네이티브」는 수정에 필요한 층입니다.

### B-1. 친구 시스템 (F)

**현재 정책(LOCK `docs/community-messenger/friend-contact-ssot-lock.md`):** 친구는 **단방향 연락처**이고 요청·수락·거절 기능은 폐기됐습니다(API 410). 그래서 감사 지시의 「동시 요청·요청 취소·거절 후 재요청」 시나리오는 지금 구조에는 해당하지 않습니다. 친구 상호 승인 방식으로 되돌리는 것은 정책 변경이라 제안하지 않습니다.

| ID | 판정 | 위험 | 층 | 결함 · 원인(근거) |
|---|---|---|---|---|
| F-1 | C | P1 | 웹 | 마이페이지·거래채팅에서 **차단을 해제하면 1:1 방이 계속 숨겨지고**, 메시지 수신자 계산에서도 빠져 미읽음·푸시가 상대에게 가지 않습니다. `me/relations/[type]/route.ts:228-232`, `chat/rooms/[roomId]/unblock/route.ts:49` 가 `restoreDirectRoomsOnUnblockForViewer` 를 호출하지 않습니다(호출하는 곳은 `relations/block/route.ts:112` 뿐). |
| F-2 | C | P1 | 웹·정책 | **차단하면 주문(store_order)·거래 채팅에서도 메시지를 보낼 수 없습니다.** 방은 목록에 남지만 쓸 수 없는 상태가 됩니다. `direct-room-communication-gate.ts:69-85` 가 room_type=direct 이면 상거래 방도 차단 판정 대상으로 넣고, `assert-messenger-room-send-allowed.ts:100-104` 가 거부합니다. 방 액션시트도 상거래 방에 확인 없이 차단 버튼을 보여 줍니다(`CommunityMessengerHome.tsx:3271-3281`). |
| F-3 | C | P2 | 웹 | 차단·삭제할 때 **상대가 소유한 숨김·즐겨찾기 행까지 지웁니다** → 상대가 차단 사실을 짐작할 수 있습니다. `service.ts:10151-10156, 10203-10224`, `social-relations.ts:665-668`. LOCK 문서 :30-31 의 「내 쪽만 정리」 원칙 위반입니다. |
| F-4 | C | P2 | 웹·정책 | 차단당한 쪽의 1:1 방도 함께 숨겨져 차단 사실이 드러납니다(`participant-block-hide.ts:168` 양방향 숨김). 스키마 설명은 「viewer-only」입니다(`20260918150000…:1,10`). |
| F-5 | C | P2 | 웹 | 친구 추가를 동시에(연타·두 기기) 하면 23505(중복 키) 오류가 나고 DB 원문이 사용자에게 노출됩니다(`social-relations.ts:544-592`). 방 메뉴의 친구 추가에는 중복 클릭 방지가 없습니다(`OneToOneDotMenu.tsx:365-383`). |
| F-6 | C | P2 | 웹 | 친구 추가 경로마다 게이트가 다릅니다. `/friend-requests` 는 가입·프로필을 검사하고 `/relations/friend` 는 검사하지 않습니다(`relations/friend/route.ts:31-51`). |
| F-7 | C | P1 | 웹 | 차단 확인창이 화면마다 3가지 방식이거나 아예 없습니다. 확인창이 없는 곳: 프로필시트(`MessengerFriendProfileSheet.tsx:199`), 방 액션시트(`Home:3277`), 수신 통화 배너(`GlobalCommunityMessengerIncomingCall.tsx:2171-2186`). |
| F-8 | C | P2 | 웹 | 실패를 알리지 않습니다. 숨김 토글(`Home:1510-1557`), PeerNotice 차단(`PeerNotice.tsx:116`), 수신 배너 차단(:2176). 방 안 차단은 서버 코드 원문을 그대로 띄웁니다(`controller.ts:1881`). 성공 토스트도 경로마다 다릅니다. |
| F-9 | C | P2 | 웹 | 방 안 친구관계 동기화가 **쓰기가 멈춘 테이블**(`community_messenger_friendships`)을 구독합니다 → 이벤트가 오지 않는 채널입니다(`use-messenger-room-friendship-sync.ts:89-114`). |
| F-10 | S | P2 | 웹 | 홈 Realtime 이 재구독돼도 친구 목록을 다시 받지 않습니다(`home-realtime-channels.ts:139-145`). |
| F-11 | C | P2 | 웹 | 친구·숨김 목록 조회 중 DB 오류가 나면 빈 목록으로 처리합니다 → 숨긴 친구가 다시 보이고 목록이 비어 보입니다(`resolve-friendship-pair.ts:301`, `social-relations.ts:143, 237-240`). |
| F-12 | C(DB) | P2 | DB | 친구 관련 3개 테이블에 클라이언트 쓰기 권한이 열려 있습니다(운영 grant 조회 결과). RLS 가 본인 행으로 제한하지만, 서버의 차단 검사(`addFriendSaved:539`)를 거치지 않고 본인 목록에 친구를 넣을 수 있습니다. 영향은 작습니다(상대 데이터는 바꿀 수 없음). |
| F-13 | C | P2 | 웹 | 주석·문서가 실제와 다릅니다(`social-relations.ts:1-4` 「mutual」, `assert-messenger-room-send-allowed.ts:9` 「RPC 동일 가드」 — 실제 RPC 에는 사용자 차단 검사가 없음). 죽은 코드(`friend-request-client.ts:29-139`)와 예전 테이블 잔재(`friendships` blocked 1행)가 있습니다. |
| F-14 | C(DB) | P1 | DB 또는 웹 | **`user_relationships` 에 RLS 정책이 없어서 숨김 변경 Realtime 이 클라이언트에 전달되지 않습니다.** 홈 meta 채널이 이 테이블을 구독하지만(`community-messenger-home-realtime-channels.ts:222`) RLS 가 모든 행을 막습니다. 그래서 내 다른 기기에서 숨김/해제해도 새로고침 전에는 반영되지 않습니다. |

### B-2. 대화 목록·스와이프 (L)

| ID | 판정 | 위험 | 결함 · 원인 |
|---|---|---|---|
| **L-1** | C | **P1(체감 최상)** | **스와이프 메뉴가 열린 채 남는 원인입니다.** 행의 화면 위치(`dragX`)는 행 내부 state 인데, 상위 `openedSwipeItemId` 가 null 이 될 때 이를 0으로 되돌리는 코드가 없습니다(`MessengerChatListItem.tsx:617-622`, null 일 때는 effect 조건이 성립하지 않음). 스크롤(`Home:813-818`), 외부 탭(`MessengerChatsScreen.tsx:140-148`), 다른 행 누르기(:645-647)는 상위 state 만 null 로 바꿉니다. 그래서 「상태는 닫힘, 화면은 열림」인 행이 남습니다. |
| L-2 | C | P1 | `pointercancel`·`lostpointercapture` 때 정리하지 않아 반쯤 열린 채 멈춥니다(:764-775, :1166-1169). Android 제스처 뒤로가기나 알림창을 내릴 때 발생합니다. |
| L-3 | C | P1 | 열린 행이 있을 때 다른 행을 탭하면 바로 그 방으로 들어갑니다. 첫 탭은 「닫기」로만 처리해야 합니다(:645-647, :732-735). |
| L-4 | C | P2 | 자동 닫힘 타이머가 없습니다. 앱 백그라운드 전환·하드웨어 뒤로가기·헤더/하단탭 탭 때도 닫히지 않습니다(외부 탭 감지가 `<section>` 안에서만 동작, `MessengerChatsScreen.tsx:138`). |
| L-5 | C | P1 | `/trade-chats` 거래 목록에는 스크롤·외부 탭 닫힘이 아예 없습니다(`DomainTradeListCanaryGate.tsx`, 관련 코드 0건). |
| L-6 | C | P1 | 스와이프 정책 함수가 방 종류를 무시합니다(`chat-room-swipe-actions.ts:24` `void input.policyType`). 그래서 오픈그룹 방장에게도 「나가기」가 보이고, 누르면 서버가 400(`owner_cannot_leave`)을 돌려줍니다. |
| L-7 | C(일부 S) | P1 | **주문 채팅 「나가기」에 가드가 없습니다.** 매장 사장님도 진행 중인 주문 채팅을 나갈 수 있습니다(`orchestration.server.ts:189` 참여자 행 물리 삭제). 확인 문구는 「내 목록에서만 삭제」로 사실과 다릅니다(`community-messenger-ui.ts:629`). 다음 `ensure` 때 조용히 다시 참여되므로 나가기가 영구적이지도 않습니다. 나간 사이 알림이 누락되는지는 S 입니다. |
| L-8 | C | P2 | 「나가기」 처리 방식이 방 종류마다 다릅니다. private_group 은 `left_at`(soft)을 기록하고, direct·open_group·store_order·trade 는 참여자 행을 DELETE 합니다. 거래 증빙(메시지·product_chats)은 보존됩니다(N). |
| L-9 | C | P2 | 「보관」 판정이 방 단위 archived·삭제 상태와 섞여 있습니다(`types.ts:242-247`). 그래서 보관함의 「복원」 버튼이 방 단위로 archived 된 방에서는 아무 일도 하지 않습니다. |
| L-10 | C | P2 | 진행 중 표시(busy)가 목록 전체에 하나뿐이라 다른 행의 진행 표시를 지웁니다(`Home:2580, 2609`). 보관에는 낙관적 반영이 없고, 오류 배너가 자동으로 사라지지 않습니다. |
| L-11 | C | P2 | 접근성: 닫힌 상태에서도 액션 버튼이 포커스를 받습니다(`aria-hidden` 안에 포커스 가능한 요소, :1126). |

**채팅 종류별 지원 기능(현재)**

| 종류 | 스와이프 | 롱프레스 | 나가기 DB 처리 | 상대방·증빙 |
|---|---|---|---|---|
| 1:1 | 보관·읽음·나가기 | +핀·알림끄기 | 참여자 행 DELETE | 상대 유지, 메시지 보존 |
| 비공개 그룹 | 보관·읽음·나가기 | 동일 | `left_at` + 방장 자동 위임 | 정상 |
| 오픈그룹 | 읽음·나가기 | 동일 | DELETE, 방장은 400 | L-6 |
| 거래 | 보관·읽음·나가기 | 동일 | `product_chats.*_left_at` + DELETE | 메시지·거래 원장 보존 |
| 주문 | 보관·읽음·나가기 | 동일 | DELETE(사장님 포함) | 메시지 보존, 다시 참여됨(L-7) |
| 안읽음 표시·삭제·숨김 | **기능 없음** | 없음 | — | — |

### B-3. 메시지 송수신·실시간 (M)

| ID | 판정 | 위험 | 층 | 결함 · 원인 |
|---|---|---|---|---|
| M-1 | C | P1 | 웹 | **텍스트 메시지의 실시간 bump 가 푸시 발송이 끝난 뒤에 나갑니다.** after() 안에서 거래 원장 미러와 FCM 순차 발송을 마친 다음에야 `publishMessengerRoomBumpAfterMutation` 을 실행합니다(`rooms/[roomId]/messages/route.ts:362-379`, 그룹 라우트 :219-234, `send-post-ack-effects.ts:209-237`). 그룹방에서는 「수신자 수 × 푸시 왕복」만큼 늦어집니다. 미디어·스티커·음성은 ACK 전에 bump 해서 정상입니다. 문서(`messenger-realtime-policy.md:34`)와도 다릅니다. |
| M-2 | C | P1 | 웹 | **전송 실패·전송 중 표시가 다른 갱신 때 지워집니다.** `mergePrimedTimelineSeedIntoExisting` 가 기존 행을 `pending:false` 로 덮어씁니다(`merge-primed-timeline-seed.ts:16`, `room-helpers.tsx:218-228`). 그래서 재전송 버튼이 사라지고, 보내지 못한 메시지가 「보냄」처럼 보입니다 → 메시지 유실로 이어집니다. |
| M-3 | C | P1 | 웹 | 짧은 시간에 연달아 온 bump 중 앞의 것이 버려집니다(`bump-broadcast-subscription.ts:230-233` rAF 취소, :136 hint 덮어쓰기, remote-catchup 이 단건 조회 성공 시 바로 return). postgres 경로까지 놓치면 「새로고침해야 보임」 상태가 됩니다. |
| M-4 | C | P1 | **DB** | `created_at` 을 RPC 를 부르기 **전에** 앱 서버가 정합니다(`service.ts:16643`). 그래서 커밋 순서와 시간 순서가 어긋날 수 있고, `(created_at,id) > anchor` 방식의 따라잡기가 늦게 커밋된 메시지를 영구히 건너뛸 수 있습니다. 방별 순번(seq)이 없습니다. |
| M-5 | S | P1 | 웹 | 같은 토픽을 remove 한 직후 다시 만드는 경합이 있습니다(bump-subscription deps 에 snapshot 객체, read-ack 는 토큰 갱신마다 재구독). 구독이 죽은 채 남을 수 있습니다. realtime-js 2.99.2 구현 확인이 필요합니다(NP). |
| M-6 | C | P2 | 웹 | 읽을 권한이 없는 raw route id 토픽에 발행·구독합니다(`publish-messenger-room-bump.ts:126-139`). 그래서 Unauthorized 재시도 루프가 생겨 소켓·REST 를 낭비합니다. |
| M-7 | C | P2 | 웹 | 앱을 숨긴 뒤 900ms 안에 돌아오면 따라잡기를 버립니다(`visibility-bus-catchup.ts:56-62`). Capacitor `appStateChange` 를 쓰지 않습니다. |
| M-8 | C | P2 | 웹 | 텍스트 메시지에는 실패 행이 없습니다. 실패하면 낙관 행을 지우고 내용을 입력창에 되돌리는데, 그 사이 새로 입력한 내용을 덮어씁니다. 방을 나가면 되돌린 내용도 사라집니다(`phase2-controller.ts:1050-1051, 1112-1117`). |
| M-9 | C | P2 | 웹 | bump 발행이 실패해도 재시도가 없습니다. 앞선 deferred 작업이 throw 하면 bump 자체가 생략됩니다(`route.ts:362-384`). |

### B-4. 통화 연결·통화 기록 (C)

| ID | 판정 | 위험 | 층 | 결함 · 원인 |
|---|---|---|---|---|
| **C-1** | C | **P1** | 웹 | **통화 기록 독립 페이지(`/community-messenger/calls/logs`)가 비어 보이고 렌더가 무한 반복됩니다.** `MessengerCallLogsPanel.tsx:76,80` 의 기본값 `seedCalls = []` 가 렌더마다 새 배열이 됩니다 → :221 effect 가 매번 실행되어 `setCalls(enrich([]))` 를 호출하고, 서버에서 받은 목록을 빈 배열로 덮어씁니다. 768px 이상 분할 화면 오른쪽 패널도 같은 컴포넌트입니다. |
| C-2 | C | P1 | 웹 | 메신저 홈 통화 탭: 실시간 재조회가 일어나면 「더 보기」 커서가 초기화돼 2페이지 이후 기록을 볼 수 없습니다(같은 effect, `Home:2968-2975`). |
| C-3 | C | P2 | 웹·정책 | 상대가 통화 중(busy)이면 어디에도 기록이 남지 않습니다(`service.ts:19442-19455` 세션 행 없음, `call-chat-local-append.ts:162-190` 은 로그만 남김). |
| C-4 | C | P1 | 웹 | 발신 측 부재중 PATCH 가 클라이언트 시계 기준이라 서버가 `ring_deadline_not_reached` 로 거절할 수 있고, 거절되면 재시도하지 않습니다(`call-v4-actions.ts:1303, 1336-1339`). 그러면 발신 화면이 최대 약 2분(크론 주기) 동안 「호출 중」에 머물고, 상대 쪽 벨도 계속 울립니다. |
| C-5 | C | P2 | 웹(데스크톱) | 웹 V4 에서 Agora 조인이 실패하면 「연결 중」에서 영구히 멈춥니다(watchdog 없음, `callV4EnsureAgoraJoined:1184-1188`). 앱은 해당 없습니다. |
| C-6 | C | P1 | 웹 | 상대의 끊긴 active 세션을 정리하지 않아 「통화 중」으로 잘못 거절됩니다. 상대 앱이 통화 중 죽으면 최대 약 4분 동안 걸 수 없습니다(`service.ts:19427, 19444`, route.ts:51 은 발신자 세션만 정리). |
| C-7 | C | P1 | 웹 | 부재중 알림과 hangup 시그널을 `void` 로 실행해 서버리스 함수가 응답 후 멈추면 유실될 수 있습니다(`service.ts:20957, 21016, 21194`; :20959 는 `keepAliveAfterResponse` 사용). missed 일 때는 수신자에게 종료 push 를 보내지 않습니다(:20958). |
| C-8 | C | P2 | **DB** | call_stub 을 추가할 때 RPC 가 방의 `last_message_at` 을 통화 시작 시각으로 되돌립니다(forward-only 아님, `20270414160000…:485-491`). 이후 UPDATE 가 2번 더 일어나 목록이 깜빡이거나 순서가 틀릴 수 있습니다. |
| C-9 | S | P2 | 웹 | 통화 stub 이 통화 **시작 시각** 위치에 끼어 들어가서, 통화 중 주고받은 메시지보다 위에 표시됩니다 → 「기록이 안 생겼다」로 보일 수 있습니다. |
| C-10 | C | P1 | 웹(+iOS) | iOS 발신 첫 화면이 뜨기 전 await 4단계가 직렬로 막습니다. 특히 `callV4ReconcileBeforeCreate`(:610)는 서버 POST 가 같은 일을 다시 하므로 1 RTT 중복입니다. 서버 VoIP 발송 대기도 최대 2초입니다(route.ts:77). Android 만 화면을 먼저 띄웁니다. |
| C-11 | S | P1 | 웹 | 바로 다시 걸면 이전 통화의 `cleanupCallV4` 가 callId 확인 없이 새 통화 상태를 idle 로 초기화할 수 있습니다(`call-v4-cleanup.ts:48-75`). |
| C-12 | S | P2 | 웹 | 세션 GET 제한(사용자당 120회/분)이 폴링 빈도(500ms·1s)에 가깝습니다 → 기기가 여러 대면 429 → 종료 감지가 늦어집니다. |
| C-14 | S | P2 | 웹 | `media_connected` PATCH 가 유실되면 통화 시간이 0으로 영구 기록됩니다. |

> C-13(stub 유니크 인덱스 미적용 의심)은 운영 DB 에 인덱스가 있는 것을 확인해 **N** 으로 바꿨습니다.

**통화 기록 경로 판정:** 통화 이벤트 → DB(로그·stub 100% 기록, N) → 서버 bump(스냅샷 포함, N) → 채팅방(N, 단 C-9 위치 문제) → 대화 목록(C-8 깜빡임) → 통화 기록 목록(**C-1·C-2 결함**).

### B-5. 영상통화 UI (V) — 앱 화면은 100% 네이티브

| ID | 판정 | 위험 | 층 | 결함 · 원인 |
|---|---|---|---|---|
| **V-1** | C | P1 | 네이티브 | **FAB 자동 숨김은 고장이 아니라 「Option A」 결정으로 일부러 꺼져 있습니다.** Android: `CONNECTED_CHROME_HIDE_DELAY_MS=5000`(`NativeVideoCallActivity.java:64`)와 `chromeHideRunnable`(:173)이 정의만 있고 예약하는 곳이 없습니다(:1681, 1685, 1701, 1729 주석). `syncPersistentCallStatusVisibility` 가 계속 다시 보이게 만듭니다. iOS 도 같습니다(`NativeVideoCallViewController.swift:16, 1236-1277`). |
| V-2 | C | P1 | 네이티브 | 통화 상태 문구가 Agora 실제 연결 상태와 연결돼 있지 않습니다. `onConnectionStateChanged` 구현이 Android·iOS 모두 0건입니다 → 재연결 중에도 「통화 중」으로 표시됩니다. |
| V-3 | S | P2 | 웹 | 발신 측 상대 이름이 방 제목(`room.title`)에서 옵니다(`call-v4-actions.ts:596/836/856`). 별칭 등으로 방 제목이 바뀐 경우 수신 측 이름과 다를 수 있습니다. |
| V-4 | C | P1 | 네이티브 | 네트워크 품질 판정에 **내 쪽(uid 0)만** 씁니다(`NativeVideoCallAgoraEngine.java:882` `if (uid != 0) return;`, iOS `guard uid == 0`). 상대 품질, 패킷 손실, RTT(`onRtcStats`·`onRemoteVideoStats`)는 쓰지 않습니다. |
| V-5 | C | P2 | 네이티브 | 품질 0(측정 전)을 「좋음」으로 셉니다 → 회복 판정이 너무 이릅니다. |
| V-6 | S | P2 | 네이티브 | Activity/VC 가 파괴될 때 품질 observer 를 조건 없이 해제합니다 → 곧바로 재진입한 새 통화의 품질 UI 가 멈출 수 있습니다(Android `:606`, iOS `:123`). |
| V-7 | C | P2 | 네이티브 | 카메라 버튼 접근성 라벨의 의미가 Android(현재 상태)와 iOS(누르면 할 동작)에서 반대입니다. |
| V-8 | C | P2 | 웹(데스크톱) | 웹 CallV4 화면에 품질 히스테리시스와 자동 숨김이 없습니다. |

**품질 경고 UI 현황:** 빨간 테두리 경고는 없습니다. Agora SDK(Android 4.6.3 / iOS 4.6.2)에서 `onNetworkQuality`(약 2초 주기, 0~6), `onRtcStats`, `onRemoteVideoStats`, `onConnectionStateChanged` 를 모두 쓸 수 있습니다 → 실측값 기반 구현이 가능합니다(설계는 C-UI 절).

### B-6. 네이티브 통화 (N) — HARD LOCK A 대상 (`docs/dibay-chat-call-current-normal-hard-lock.md`)

| ID | 판정 | 위험 | 결함 · 원인 |
|---|---|---|---|
| **N-1** | S(코드 경로 C) | **P1(높음)** | **이전 통화의 늦은 정리 작업이 새 통화를 끊을 수 있습니다.** Android `NativeVideoCallRuntime.cleanup` 이 종료 PATCH(최대 8초) 뒤에 callId 확인 없이 `AgoraEngine.leave`, `DibayActiveCallSessionManager.clearSession()`, `NativeVideoCallService.stop` 을 실행합니다(`Runtime:756-807`, `Engine:488-522`). 음성 엔진에는 같은 문제에 대한 방어 코드가 있습니다(`NativeVoiceCallAgoraEngine.java:162-187`). iOS 도 `cleanup` 이 범위 제한 없이 leave·오디오 세션 해제를 합니다(`NativeVideoIncomingCallCoordinator.swift:531-557`). → 종료 직후 재발신하면 「통화 중」 화면인데 소리·영상이 없는 상황이 생길 수 있습니다. |
| N-2 | C | P1 | iOS 에서 종료 버튼을 눌러도 PATCH 가 끝날 때까지(최대 8초) 미디어가 계속 송출됩니다(`Coordinator:248-263`). Android 는 즉시 leave 합니다(`Runtime:789-797`). 프라이버시 문제입니다. |
| N-3 | C | P1 | 상대 오프라인 처리 방식이 플랫폼마다 다릅니다. iOS 는 일시적 끊김(DROPPED)에도 통화를 종료하고(`Engine.swift:576-585`, `Coordinator:337-357`), Android 는 QUIT 이 아니면 무시해서 실제로 끊겨도 「통화 중」으로 남습니다(`Engine.java:815-833`). |
| N-4 | C(누락)/S(영향) | P2 | 토큰 갱신(`onTokenPrivilegeWillExpire`/`renewToken`)이 0건입니다. 토큰 TTL 기본값이 3600초라 1시간이 넘는 통화는 끊길 수 있습니다(운영 env 값은 NP). |
| N-5 | S | P2 | Agora `onError` 는 종류와 관계없이 통화 실패로 처리합니다(치명적이지 않은 오류에도 종료). |
| N-6 | S | P2 | iOS 앱 내 종료가 `CXEndCallAction` 을 거치지 않아 아이폰 통화 기록에 「상대 종료」로 남습니다. CallKit 화면에서 종료하면 종료가 중복 보고되고, 오디오 세션을 CallKit 보다 먼저 직접 해제합니다. |
| N-7 | S | P2 | PushKit 일부 분기에서 CallKit 에 보고하지 않고 끝냅니다(`VoIPPushRegistry.swift:96-98, 114-116, 148-151, 211-226`). iOS 정책상 이런 일이 반복되면 VoIP 푸시가 제한될 수 있습니다. **서버에서 종료 계열 신호를 일반 APNs 로 보내면 네이티브 수정 없이 완화할 수 있습니다.** |

정상 확인(N): 플러그인 1회 등록, JS 리스너 해제(`native-terminal-sync.ts:103-136`), Android 새 join 전 이전 leave 대기, FGS 타입, 전체화면 알림 권한 확인. `docs/ios-native-call-known-issues.md` ISSUE-1/2 는 꺼진 레거시 경로에만 해당합니다(NP).

### B-7. 입력창 (K) — 이미 처리된 키보드 겹침·하단 고정(§7 이력, `1a32cb1b` 등)은 제외

| ID | 판정 | 위험 | 결함 · 원인 |
|---|---|---|---|
| **K-1** | C | P1 | **모바일에서 Enter 를 누르면 바로 전송돼 줄바꿈을 할 수 없습니다.** `CommunityMessengerRoomPhase2Composer.tsx:562-567` 이 터치 기기를 구분하지 않습니다(모바일 키보드에는 Shift 가 사실상 없음). |
| **K-2** | C | P1 | **입력창 높이가 44px 로 고정**이라 여러 줄을 써도 늘어나지 않습니다(`messenger-chat-viewport-tuning.ts:19-20`, `messenger-composer-sector.tsx:175, 201` `max-h-[36px]`). |
| K-3 | C | P1 | 메시지 수정 저장이 실패하면 수정 중이던 글이 사라집니다(`controller.ts:1183-1189` 가 항상 true 반환). |
| K-4 | C | P1 | 메시지 수정 중 이모지를 고르면 원래 메시지가 이모지 하나로 바뀝니다(`RoomSheets:278-283` → `sendMessage` 가 수정으로 처리). |
| K-5 | C | P2 | 방을 바꾸거나 나가면 보내지 않은 입력이 사라집니다(방별 임시 저장 없음, 방 클라이언트가 방마다 새로 마운트). |
| K-6 | S | P1 | Android 한글 입력 중 전송 버튼을 누르면 마지막 글자가 입력창에 다시 나타날 수 있습니다(`onComposition*` 처리 0건). |
| K-7 | C/S | P2 | 그룹 멘션 자동완성을 키보드로 고를 수 없습니다(C). Safari 의 keyCode 229 Enter 미처리(S). 포커스 표시가 없습니다(C). |

### B-8. 성능 (P) — 현재 HEAD 기준 실측 0건(NP)

이전 실측(2026-06-10)은 dev home_ready 약 2316ms, room_ready 약 4520ms, 운영 전송 ACK p95 337ms(목표 200ms 미달)입니다.

| ID | 판정 | 위험 | 결함 · 원인 |
|---|---|---|---|
| **P-1** | C | P1 | **방이 열려 있으면 타임라인 전체가 1.5초마다 다시 렌더됩니다.** typing store 의 `clearExpired` 가 바뀐 것이 없어도 새 객체를 반환하고(`TypingStore.ts:54-62`, `typing.ts:61-63`), 타임라인이 맵 전체를 구독합니다(`Timeline:1726`). 스크롤 끊김·배터리 소모로 이어집니다. |
| P-2 | C | P1 | 1:1 방에서 친구관계 Realtime 채널이 읽음·미읽음이 바뀔 때마다 지웠다가 다시 구독됩니다(deps 에 `snapshot?.room` 객체, `use-messenger-room-friendship-sync.ts:132-139`). F-9 와 같은 훅이라 함께 고칩니다. |
| P-3 | C | P2 | 친구 탭에 들어갈 때마다 `GET /friends` 를 1~3회 호출합니다(`Home:889-893` 조건 없음). |
| P-4 | S | P2 | phase1 컨텍스트 값이 매 렌더 새 객체라 입력창이 메시지 수신·스크롤 때마다 다시 렌더됩니다(`RoomClientInner:189`). |
| P-5 | C | P2 | 거래·배달 목록에서 `listFooter` 를 매번 새 JSX 로 넘겨 memo 가 효과가 없습니다(`ChatsScreen:224-230`). |
| P-6 | S | P2 | 친구 목록에 memo·가상화가 없습니다. |
| P-7 | C/S | P1 | 통화 후 돌아오면 `router.replace` 때문에 뒤로가기를 두 번 눌러야 하고, 방을 처음부터 다시 엽니다(C, `call-session-navigation-seed.ts:307,320`). 웹 통화 chunk(6,013행)를 미리 받지 않습니다(S). |

### B-9. 그룹·첨부·삭제·보안·기타

| ID | 판정 | 위험 | 층 | 결함 · 원인 |
|---|---|---|---|---|
| **G-1** | **C(DB 확인)** | P1 | DB+웹 | **그룹 방장 위임이 항상 실패합니다.** 운영 RPC `community_messenger_transfer_group_owner` 는 `auth.uid() is null` 이면 `unauthorized` 를 반환하는데, 서버는 service-role(`getSupabaseServer`)로 호출합니다(`service.ts:11635-11660`). 권한 상승 위험은 없습니다. `group_notice`·`group_permissions` 액션도 같은 패턴인지 점검해야 합니다. |
| G-2 | C | P2 | 웹 | 오픈그룹 정원 계산에 나간 사람이 포함되고, 판정에 한 명 차이 오류가 있습니다(`service.ts:11760-11769`). |
| G-3 | C | P2 | 웹+DB·정책 | 오픈그룹에는 강퇴·영구차단 수단이 없습니다(private_group 만 지원). |
| G-4 | S | P2 | 웹 | 강퇴된 사용자가 다른 서버 인스턴스에서 최대 45초 동안 새 메시지를 읽을 수 있습니다(멤버십 캐시가 인스턴스별). |
| A-1 | C | P1 | 웹 | 그룹 미디어 앨범이 관리자 숨김·전체 삭제 메시지를 걸러내지 않습니다(`group-room-media-service.ts:37-43`) → 모더레이션 우회입니다. |
| A-2 | S | P2 | 웹 | 업로드를 마무리하지 못한 staging 객체를 정리하는 크론이 없습니다. |
| D-1 | C | P1 | 웹 | **「모두에게서 삭제」 후에도 답장 인용(`reply_preview_text`)에 원문이 남습니다**(`service.ts:18245-18300`). 개인정보 문제입니다. |
| D-2 | S | P2 | 웹 | 삭제 후에도 알림센터·푸시 본문에 원문이 남습니다. |
| S-1 | C | P2 | 웹 | 그룹 읽음 수 POST 에 멤버십 검사가 없습니다(`group-rooms/[roomId]/media/route.ts:60-86`). |
| S-2 | S | P2 | 웹 | 미디어 앨범 커서가 PostgREST `.or()` 문자열에 검증 없이 들어갑니다. |
| X-1 | S | P2 | 웹 | 방에서 돌아오면 홈 목록 스크롤 위치가 복원되지 않습니다. |
| X-2 | C | P2 | 웹 | 오픈그룹 입장 라우트가 세션·전화 인증을 검사하지 않습니다(초대 링크 입장은 검사). |

> 기능 공백(결함 수에 넣지 않음): 동영상 메시지 타입 없음(A-3), 방장이 다른 사람 메시지를 가리는 기능 없음(D-3), 안읽음 표시·대화 삭제 스와이프 없음. 신규 기능이므로 임의로 확대하지 않습니다.

---

## C. 통합 개선 설계안 (근본 원인 기준 · 9개 묶음)

| 묶음 | 대상 ID | 현재 → 개선 후 | 수정 대상 | 다른 기능 영향 | 검증 |
|---|---|---|---|---|---|
| **W1 스와이프 단일 상태** | L-1~L-5, L-11 | 행 로컬 `dragX` 와 상위 state 가 따로 놂 → **열림의 기준은 상위 `openedSwipeItemId` 하나**. 화면 위치 = 드래그 중이면 dragX, 아니면 (열림 ? -폭 : 0). pointercancel 은 닫힘으로 스냅. 열린 행이 있으면 첫 탭은 닫기로만 소비. document capture 외부 탭, 스크롤, visibilitychange, Android backButton(닫기만 하고 뒤로가기 소비), **무조작 5초 자동 닫힘**(액션 버튼에 닿으면 리셋, busy 중 정지) | `MessengerChatListItem.tsx`, `CommunityMessengerHome.tsx`, `MessengerChatsScreen.tsx`, `DomainTradeListCanaryGate.tsx` | 통화 기록 스와이프도 같은 행 패턴(같이 점검). 계약 테스트 문자열 유지(`messenger-telegram-presentation-contract.test.ts:211,263`) | vitest(상위 null→transform 0, cancel→0, 첫 탭 소비), 실기기 T-L1~L4 |
| **W2 채팅 종류별 액션 정책** | L-6, L-7, L-9, L-10, F-2 | 정책 함수가 종류 무시 → `getSwipeActions` 가 방 종류·내 역할·주문 진행 상태로 판정하고, 스와이프·롱프레스·서버가 같은 정책 사용. 주문: 진행 중이면 보관·읽음만, 사장님은 나가기 불가, 확인 문구 분리. 오픈그룹 방장: 「위임 후 나가기」 안내. 차단은 일반 DM 에만 적용(상거래 방은 송신 가드에서 차단 검사 생략, 액션시트 차단 숨김) | `chat-room-swipe-actions.ts`, `messenger-policy-room-type.ts`, `leave-chat-room-orchestration.server.ts`, `direct-room-communication-gate.ts`, `assert-messenger-room-send-allowed.ts`, i18n | 주문·거래 채팅 흐름(보호 방향). 통화 게이트도 같은 기준으로 맞춤 | `messenger-policy-matrix.test.ts` 확장, 송신 가드 3종 테스트 |
| **W3 친구·차단 일관성** | F-1, F-3~F-11, F-13, F-14 | 해제 경로마다 처리가 다름 → `unblockUserSocial` 안에서 방 복원(모든 경로 동일). 정리는 owner=나 방향만. 동시 추가 upsert + 23505 는 ok. 게이트 통일. **차단·해제 확인은 `MessengerBlockPeerConfirmModal` 하나**, 삭제는 `DibayConfirmDialog`. 실패·성공 스낵바 통일. 방 안 동기화는 `user_social_relations`(owner=나) + 차단 API 가 서버 bump 발행. 숨김 Realtime 은 서버 bump 로 전환(DB 정책 추가 없이 웹으로 해결). 조회 오류 시 5xx + 기존 목록 유지 | `social-relations.ts`, `service.ts`(friend 계열), `relations/*`, `me/relations`, `chat/rooms/[roomId]/unblock`, `use-messenger-room-friendship-sync.ts`, 홈 realtime, 확인창 3곳 | 차단 시 방 숨김 범위(F-4)는 Owner 결정 | `friend-contact-ssot-lock.test.ts` 계약 추가, 실기기 T-F1~F5 |
| **W4 메시지 실시간 정합** | M-1~M-3, M-5~M-9 | bump 가 푸시 뒤에 나감 → 텍스트·그룹 라우트도 **ACK 전 bump await**(미디어와 같은 계약) + 실패 시 1회 재시도, FCM 은 `allSettled` 병렬. 실패·전송 중 행은 merge 에서 보존. 프레임 단위 bump 큐(앞 건 유실 금지). 같은 토픽 재구독은 remove 완료 후에만, SUBSCRIBED 재합류 시 따라잡기 1회. raw 토픽 제거. `appStateChange` 연결, 900ms 이내 복귀는 지연 예약. 텍스트 실패 행 + 재전송 | `rooms/[roomId]/messages/route.ts`, `group-rooms/[roomId]/messages/route.ts`, `merge-primed-timeline-seed.ts`, `room-helpers.tsx`, `use-messenger-room-bump-broadcast-subscription.ts`, `use-messenger-room-remote-catchup.ts`, `cm-read-ack-broadcast-client.ts`, `publish-messenger-room-bump.ts`, visibility-catchup | ACK 가 REST 1 RTT(수십 ms) 늘어남 → T5 ACK 재측정 | 단위 테스트(같은 프레임 bump 2건, 실패 행 보존), `cm-send-domain-target-bump-before-ack-contract.test.ts` 갱신, 실기기 T-M1~M6 |
| **W5 메시지 순번(DB)** | M-4, C-8 | `created_at` 을 앱이 정함 → `rooms.last_seq` 를 RPC 안에서 증가시켜 `messages.room_seq` 에 할당. 따라잡기 기준은 seq, 표시는 DB 시각. 방 `last_message_at` 은 GREATEST(forward-only). 클라이언트는 방별 직렬 송신 | 신규 마이그레이션(백필 포함), send_text·append RPC, `service.ts`, catchup anchor, 정렬 | 모든 메시지 경로에 영향 → **회귀 위험 높음**. 운영 적용은 Owner 승인 | RPC 회귀 테스트, 연속 송신·동시 송신 E2E |
| **W6 통화 기록·연결(웹)** | C-1~C-4, C-6, C-7, C-9~C-12, C-14, V-3, P-7 | `EMPTY_CALLS` 모듈 상수 사용, hydrate 가 끝날 때만 seed 적용(무한 렌더·빈 목록·커서 초기화 해결). 부재중 거절 시 서버가 알려준 남은 시간으로 재예약. 발신 시 상대의 끊긴 active 세션도 정리. `void` → `keepAliveAfterResponse`. 중복 reconcile GET 제거. cleanup 은 callId 가 같을 때만 reset. 통화 복귀는 `router.back()` 우선. stub 정렬 위치를 종료 시각 기준으로 표시. busy 는 발신자 타임라인에 로컬 stub(서버 기록은 Owner 결정) | `MessengerCallLogsPanel.tsx`, `call-v4-actions.ts`, `call-v4-cleanup.ts`, `service.ts`(call 계열), `rooms/[roomId]/calls/route.ts`, `call-session-navigation-seed.ts` | 통화 HARD LOCK 문서의 웹 계약 확인 필요(`dibay-call-authority-lock.md`) | vitest(렌더 횟수·페이지네이션·시계 어긋남), 실기기 T-C1~C8 |
| **W7 입력창** | K-1~K-7 | 모바일(coarse pointer/네이티브)은 **Enter = 줄바꿈**, 전송은 버튼. `enterKeyHint`. 높이 자동 확장(최대 5줄 ≈ 100px, tuning 상수) → `--chat-composer-height` 계약 안에서 하단 고정 유지. 수정 실패 시 입력 복원. 이모지는 수정 경로와 분리. 방별 임시 저장(모듈 Map + sessionStorage try/catch). 한글 조합 추적. 멘션 화살표·Enter 선택. `:focus-within` 표시 | `CommunityMessengerRoomPhase2Composer.tsx`, `messenger-composer-sector.tsx`, `messenger-chat-viewport-tuning.ts`, `use-messenger-room-phase2-controller.ts`, RoomSheets | 키보드 뷰포트 계약 → **문서 §7 이력 + `verify:cm-room-keyboard-layout-contract`** 필수 | vitest, 실기기 T-K1~K6(삼성·샤오미·iPhone) |
| **W8 성능·렌더** | P-1~P-6 | typing store 는 바뀐 것이 없으면 같은 state 반환, 타임라인은 현재 방 값만 구독. friendship-sync deps 를 원시값으로. `/friends` 는 단계·시각 기준으로 조건부 호출. 입력창 전용 컨텍스트. footer memo. 친구 행 memo(16개 이상이면 가상화) | 위 각 파일 | 실시간 정확성 유지(구독 재생성 감소 = 정확성 향상) | `cmRenderAnalysis` 렌더 횟수 비교, `measure:messenger-parity-audit`·`measure:messenger-ack-warm` 3회(구현 전후) |
| **W9 그룹·삭제·보안** | G-1, G-2, G-4, A-1, D-1, D-2, S-1, S-2, X-1, X-2, F-12 | 위임 RPC 에 `p_actor_user_id` 버전 추가(+TS 에서 방장 재확인), notice·permissions 액션은 settings 경로로 일원화. 정원 계산 수정. 그룹 읽기 라우트는 DB `left_at` 확인. 앨범 숨김·삭제 필터. 전체 삭제 시 인용 스냅샷·알림 본문을 placeholder 로 교체. 멤버십 검사 추가. 커서 형식 검증. 오픈그룹 입장 게이트. 친구 3테이블 쓰기 권한 회수 | `service.ts`, `group-room-*`, 마이그레이션 2건(G-1, F-12) | 마이그레이션 운영 적용은 Owner 승인 | vitest 계약 테스트(비방장 403 등) |

### C-UI. 영상통화 화면 설계 (네이티브 · W10)

1. **FAB 자동 숨김(V-1):** 연결된 전체화면 상태에서 마지막 조작 후 **5초** 뒤 FAB 를 숨깁니다(250ms fade). 화면을 탭하면 보이기/숨기기를 전환하고, 버튼을 누르면 타이머를 다시 시작합니다. **상대 이름·통신 상태는 숨기지 않습니다.** 다음 경우에는 숨기지 않습니다: PiP·dock·종료 중, TalkBack/VoiceOver 사용 중, 품질 경고 중. Android 는 이미 있는 `chromeHideRunnable`, iOS 는 `chromeHideWorkItem` 을 다시 씁니다.
2. **통신 상태(V-2, N-3):** `onConnectionStateChanged` 를 구현해 RECONNECTING 이면 「재연결 중」을 표시하고 통화 시간 표시를 멈춥니다. 상대 DROPPED 는 유예 15초 동안 재연결 표시만 하고 QUIT 일 때만 즉시 종료합니다(양 플랫폼 동일).
3. **빨간 테두리 경고(V-4, V-5):**
   - 데이터: `worst = max(local tx/rx, remote tx/rx)` 품질. 보조로 `onRtcStats` 손실률·`lastmileDelay`, `onRemoteVideoStats.frozenRate` 를 씁니다.
   - 주기: Agora 콜백(약 2초)을 그대로 씁니다. 별도 타이머는 없습니다.
   - 나쁨 샘플 기준: 품질 4·5, 손실 15% 초과, RTT 600ms 초과 중 하나. 6(down)이나 RECONNECTING 이면 바로 표시합니다. 0(unknown)은 세지 않습니다.
   - 히스테리시스: 나쁨 샘플이 **2회 연속(약 4초)이면 표시**, 좋음(3 이하)이 **3회 연속(약 6초)이면 해제**합니다.
   - 표시: 영상 위·컨트롤 아래 층에 4면 가장자리 빨간 그라데이션(Android `GradientDrawable`, iOS `CAGradientLayer`)을 깝니다. 터치를 막지 않게 `clickable=false`·`isUserInteractionEnabled=false` 로 설정합니다. PiP·종료 중에는 숨깁니다. 데스크톱 웹(V-8)은 같은 기준으로 `pointer-events:none` 처리합니다.
4. **V-6 observer 해제**는 「지금 등록된 것이 나일 때만」 해제하는 compare-and-clear 방식으로 바꿉니다. **V-7** 접근성 라벨은 「누르면 할 동작」 기준으로 통일합니다.

---

## D. UI/UX/CTA 통합 기준

| 영역 | 기준 |
|---|---|
| 확인창 | **영향이 큰 작업(차단·친구 삭제·나가기·전체 삭제)만 확인창**을 띄웁니다. 차단·해제는 `MessengerBlockPeerConfirmModal`, 그 밖에는 `DibayConfirmDialog` 하나만 씁니다. 숨김·보관·읽음은 확인창 없이 바로 처리하고 되돌리기 스낵바를 띄웁니다. 확인 문구는 실제 DB 동작과 같아야 합니다(L-7 문구 수정). |
| 진행 중·중복 방지 | 대상(행·사람)별 진행 상태로 관리합니다(목록 전체에 하나 금지, L-10). 진행 중에는 버튼을 비활성화하고, 서버도 멱등으로 처리합니다(upsert·client_message_id). |
| 피드백 | 성공·실패 모두 `showMessengerSnackbar(getMessengerActionErrorMessage(code))` 로 알립니다. 서버 코드 원문은 노출하지 않습니다. 오류 배너는 자동으로 사라집니다. |
| 반영 | 낙관적으로 먼저 반영하고 실패하면 되돌립니다. 상대 화면은 서버 bump 로만 갱신합니다(클라이언트 bump 금지). |
| 스와이프 | 동시에 하나만 열림. 다른 행·외부 탭·스크롤·백그라운드·뒤로가기·화면 이동·무조작 5초 중 하나라도 일어나면 닫힘. 열려 있을 때 첫 탭은 닫기만 함. 가로 16px 이상이면서 가로가 우세할 때만 시작(현행 유지). Android·iOS 모두 같은 pointer 코드. |
| 입력창 | 모바일 Enter = 줄바꿈 / 데스크톱 Enter = 전송(Shift+Enter 줄바꿈). 1~5줄 자동 확장. 전송 후 1줄로 복귀하고 키보드는 유지. 방별 임시 저장. |
| 통화 화면 | 이름·상태는 항상 표시, FAB 는 5초 후 자동 숨김, 종료 버튼 위치 고정. 품질 경고는 테두리로만 표시하고 터치를 막지 않음. |

---

## E. 네이티브 위험 분석

| 구분 | 항목 |
|---|---|
| **웹만으로 해결(main 반영 후 앱 재시작)** | W1~W4, W6(C-10 의 iOS 화면 선표시는 제외), W7, W8, W9 의 웹 부분. N-7 완화책(종료 신호를 일반 APNs 로 보냄), N-4 완화책(토큰 TTL env 상향 — 설정 변경이므로 Owner 승인) |
| **DB(Owner 승인 후 운영 적용)** | W5(M-4 seq, C-8 forward-only), G-1 RPC, F-12 권한 회수, (선택) C-3 busy 상태, G-3 오픈그룹 차단 |
| **네이티브(Android·iOS 재빌드 1회)** | W10 = V-1, V-2, V-4~V-7, 빨간 테두리, N-1~N-6, C-10 iOS 화면 선표시 |

**N-1(최우선 네이티브) 수정 게이트**

1. **결함·재현:** 느린 네트워크에서 영상통화 종료 → 1~8초 안에 같은 상대에게 영상 재발신 → 이전 PATCH 응답이 도착하면 새 통화의 미디어가 끊기고 FGS 가 중지됨.
2. **원인·근거:** B-6 N-1(callId 범위가 없는 leave·clearSession·stop. 음성 엔진에는 방어 코드가 있고 영상에는 없음).
3. **수정 대상:** Android `NativeVideoCallAgoraEngine.leave(callId)`, `NativeVideoCallRuntime.cleanup`, `DibayActiveCallSessionManager.clearSession(sid)`, `NativeVideoCallService.stop(callId)`. iOS `NativeVideoCallAgoraEngine.leave(callId:)`, `NativeVideoIncomingCallCoordinator.cleanup`(오디오 해제는 다른 lane 에 통화가 없을 때만).
4. **고치지 않으면:** 재발신했는데 소리·영상이 없음, 백그라운드에서 카메라·마이크 차단.
5. **영향받는 기능:** 영상 발신·수신, 재발신, 음성↔영상 연속 통화, PiP 종료.
6. **대안 비교:** 「이전 PATCH 가 끝날 때까지 재발신 막기」는 위험이 낮지만 UX 가 최대 8~16초 늦어짐 → **callId 범위 제한(권장, 근본 해결, 음성 엔진과 같은 패턴)**.
7. **회귀 검증:** 일반 종료·상대 종료·거절·부재중 이후 엔진 해제 로그, 종료 직후 재발신 5회, 음성→영상·영상→음성 연속 통화, Recents 에서 스와이프한 뒤 복원, PiP 종료, Android↔iOS 교차 통화.
8. **실패 시 복구:** 단일 커밋 revert → `native:prepare` → 재빌드(빌드 번호 +1).
9. **재빌드:** Android APK·iOS 모두 필요. N-2·N-3·V-1·V-2·테두리와 **한 번의 네이티브 릴리스로 묶습니다.** HARD LOCK A 의 Native Change Gate 보고는 이 절로 갈음합니다.

**네이티브 예상 회귀 위험:** **높음**(통화 lifecycle). 그래서 lifecycle 을 건드리는 변경(N-1·N-2·N-3)과 UI 만 바꾸는 변경(V-1·테두리, `displayedNetworkTier` 확장)은 커밋을 나누고, 실기기 매트릭스를 모두 통과한 뒤에만 배포합니다.

---

## F. 검증 계획

**1) 자동(작업자, 로컬 1회)**
- `npm run typecheck:build`, 변경 관련 vitest(위 표의 신규·갱신 테스트), 변경 파일 eslint.
- 도메인 검증: `verify:cm-room-keyboard-layout-contract`(W7), `verify:native-version-bump`, 네이티브 변경 시 `native:prepare`.
- 성능: W8 전후로 `measure:messenger-parity-audit`·`measure:messenger-ack-warm` 각 3회. 현재 HEAD 기준값부터 먼저 잽니다.

**2) Android 실기기(Cursor 가 adb 로 실행: Samsung 폰 = A, Xiaomi 태블릿 = B)**

기록 형식: 기기·`user_devices.app_version`·계정·단계·기대·실제·PASS/FAIL/NP·증거(logcat `[cm-rt]`·`[call]`, 화면, DB 조회).

| ID | 단계 | 기대 |
|---|---|---|
| T-L1 | 목록에서 행 스와이프 → 목록 살짝 스크롤 | 즉시 닫힘 |
| T-L2 | 행 A 열기 → 행 B 탭 | A 만 닫히고 B 방으로 들어가지 않음 |
| T-L3 | 행 열기 → 5초 대기 / 하드웨어 뒤로가기 / 홈버튼 후 복귀 | 닫힘, 뒤로가기는 닫기만 함 |
| T-L4 | `/trade-chats` 에서 T-L1~L3 반복 | 동일 |
| T-L5 | 매장 계정으로 진행 중 주문 채팅 스와이프 | 「나가기」 없음 |
| T-M1 | A→B 텍스트 10건 연속 전송(B 는 방 열어 둠) | 순서대로 모두 즉시 표시, 중복 없음 |
| T-M2 | B 비행기 모드 30초 → 그동안 A 5건 → B 복귀 | 새로고침 없이 5건 복구 |
| T-M3 | A 비행기 모드에서 이미지 전송 → 실패 → B 가 메시지 보냄 | A 에 재전송 버튼 유지 |
| T-M4 | 그룹(5명 이상)에 텍스트 → 수신자 표시 시각 | bump 수신이 푸시보다 먼저(로그) |
| T-C1 | A 영상 발신 → B 거절 / 무응답 / A 취소 / 통화 후 종료 | 양쪽 방·목록·통화기록에 새로고침 없이 기록, 상태·시간 정확 |
| T-C2 | `/community-messenger/calls/logs` 열기 | 목록 표시, 렌더 반복 없음 |
| T-C3 | 통화 종료 직후 즉시 재발신 5회 | 매번 미디어 정상(N-1) |
| T-C4 | B 앱 강제 종료 상태에서 A 발신 | push 로 수신, 타임아웃 시 양쪽 부재중 |
| T-V1 | 영상 연결 후 5초 대기 → 탭 → 5초 | FAB 숨김 → 표시 → 숨김, 이름·상태는 유지 |
| T-V2 | 통화 중 B 를 3G 제한·Wi-Fi 끊기(10초/30초) | 약 4초 뒤 빨간 테두리·「재연결 중」, 회복 후 약 6초 뒤 해제 |
| T-K1 | 입력창에 Enter → 여러 줄 → 전송 | 줄바꿈되고 5줄까지 확장, 전송 후 1줄 |
| T-K2 | 「안녕」 입력 중 바로 전송 버튼(삼성·샤오미 키보드) | 입력창이 비고 글자가 다시 나타나지 않음 |
| T-K3 | 방 A 에 입력 → 방 B 로 이동 → A 로 복귀 | 입력 내용 유지 |
| T-F1 | A 가 B 차단 → 마이페이지에서 해제 | 1:1 방이 다시 보이고 푸시도 정상 |
| T-F2 | A 가 B 차단 상태에서 둘의 주문·거래 채팅 송신 | 정책 결정대로(권장: 송신 가능) |

**3) iPhone 14 Pro Max — Owner 조작 프롬프트(짧게)**
1. 「삼성에서 영상통화를 겁니다. iPhone 에서 **수락**하고 10초 뒤 **종료**하세요. 바로 같은 사람에게 **다시 영상통화**를 거세요.」 → 소리·영상이 나오는지 알려 주세요(N-1·N-2).
2. 「통화 중 iPhone 의 종료 버튼을 누른 순간 삼성 화면이 바로 끝났는지 알려 주세요.」(N-2)
3. 「통화 중 iPhone 화면을 손대지 말고 5초 기다린 뒤, 오른쪽 버튼이 사라졌는지 → 한 번 탭하면 다시 보이는지 알려 주세요.」(V-1)
4. 「삼성 Wi-Fi 를 10초 껐다 켭니다. iPhone 통화가 끊기지 않고 '재연결 중' 후 돌아오는지 알려 주세요.」(N-3·V-2)
5. 「iPhone 에서 삼성 사용자를 차단 → 삼성에서 메시지·전화를 시도합니다. 거부 안내가 뜨는지, iPhone 에 알림이 오지 않는지 알려 주세요.」(차단 강제)
6. 「통화가 끝난 뒤 iPhone 채팅방·대화 목록·통화 탭에 기록이 **새로고침 없이** 보이는지 알려 주세요.」(C 경로)
7. 「iPhone 입력창에서 줄바꿈 키 → 여러 줄 입력 → 전송, 한글 입력 직후 바로 전송해 보세요.」(K-1·K-2·K-6)
8. 「대화 목록에서 한 줄을 밀어 메뉴를 연 뒤, 다른 줄을 탭하거나 5초 기다려 보세요.」(L-1~L-4)

> 코드 테스트 PASS 를 실기기 PASS 로 대신하지 않습니다. 각 결과를 받은 뒤 FAIL 은 원인을 재분석하고 같은 묶음 안에서 다시 수정합니다.

---

## G. Owner 승인 요청

**구현 순서(승인하면 이 순서대로 일괄 진행, 단계마다 main 1회 반영)**
1. **1차 웹:** W1 + W3 + W4 + W6 + W7 + W8 + W9(웹 부분), W2 는 아래 결정 반영 → 로컬 검증 → main → Android 실기기 + iPhone 프롬프트 1~8 중 웹 항목.
2. **2차 DB:** W5, G-1, F-12 마이그레이션 → 운영 적용 승인 → 적용 결과 조회 확인.
3. **3차 네이티브:** W10(N-1~N-6, V-1·V-2·V-4~V-7, 테두리) → `native:prepare` → APK·iOS 재빌드 → 실기기 전체 매트릭스.

**Owner 결정이 필요한 정책(나머지는 규정·설계로 정했습니다)**

| # | 결정 사항 | 권장안 |
|---|---|---|
| 1 | 차단이 주문·거래 채팅에도 적용되는지(F-2) | **일반 1:1 에만 적용**, 주문·거래 채팅은 계속 소통 가능(업무·분쟁 증빙 보호) |
| 2 | 차단할 때 상대 방도 숨기는지(F-4) | **차단한 쪽만 숨김**(상대에게 차단 사실 비노출) |
| 3 | 영상통화 FAB 「Option A(항상 표시)」 철회(V-1) | **철회, 5초 자동 숨김** |
| 4 | 모바일 Enter = 줄바꿈(K-1) | **적용**(데스크톱은 Enter 전송 유지) |
| 5 | 주문 채팅 나가기(L-7) | 진행 중에는 나가기 숨김, 사장님은 항상 불가, 완료·취소된 주문은 고객만 「목록에서 숨김」 |
| 6 | 상대 통화 중(busy) 기록(C-3) | 1차는 발신자 타임라인에 로컬 표시, 서버 기록(새 status, DB)은 2차 |
| 7 | 오픈그룹 강퇴·차단 기능 추가(G-3) | 이번 범위에 포함(스팸 대응 수단이 없음) — 원하지 않으면 보고만 |
| 8 | DB 마이그레이션 3건 운영 적용(W5·G-1·F-12) | 2차에서 승인 요청 |

자동 닫힘 시간(5초), 품질 경고 기준값, 확인창 통일 규칙은 규정·설계로 정했으므로 별도 질문하지 않습니다. 안읽음 표시·동영상 메시지·방장 메시지 가리기는 새 기능이라 이번 계획에 넣지 않았습니다.

---

## 요약 수치

| 항목 | 값 |
|---|---|
| 확인한 기능(감사 항목) 수 | **159** (결함 88 + 정상 확인 63 + NOT_PROVEN 8) |
| 정상 확인 수 | **63** = 영역별 58(친구 10 · 목록 5 · 송수신 9 · 통화 7 · 네이티브 5 · 입력창 7 · 성능 6 · 그룹·알림·첨부·차단 강제·보안 9) + 운영 DB 실측 5 |
| 확인된 결함 수 | **88**: 확정 68 · 의심 20 / P1 39 · P2 49 / P0 0 |
| 실기기 검증 필요 수 | **36**: 의심 20건 전부 + 체감 확정 16건(L-1~L-5, M-1, M-2, C-1, C-4, C-6, V-1, V-2, N-2, N-3, K-1, K-2) |
| 웹 수정 필요 항목 | **73** (네이티브 12건·DB 전용 3건(M-4·C-8·F-12)을 뺀 전부, W1~W4·W6~W9) |
| DB 수정 필요 항목 | **6** (M-4, C-8, G-1, F-12, 선택 C-3·G-3) |
| 네이티브 수정 필요 항목 | **14** (V-1, V-2, V-4~V-7, N-1~N-6, 빨간 테두리, C-10 iOS 선표시) |
| 예상 회귀 위험 | 웹 **중간**(송수신 bump 순서·merge 변경 → W4 계약 테스트로 통제) · DB **높음**(W5 seq 는 모든 메시지 경로) · 네이티브 **높음**(통화 lifecycle → lifecycle 과 UI 커밋 분리, 실기기 전체 매트릭스) |
| Owner 결정 필요 사항 | **8건**(G 절 표) |

- 운영 DB 실측 정상 5건: 통화 로그·stub 누락 0, 남은 ringing 세션 0, 중복 전송 방지 인덱스, stub 유니크 인덱스, 메신저 테이블 쓰기 권한 회수.
- NOT_PROVEN 8건: 현재 HEAD 성능 실측(P-8), realtime-js 동작(M-5), 토큰 TTL env(N-4), iOS VoIP 제한 로그(N-7), 알림 데이터(D-2), 레거시 known-issues(N), Preview, Production.

**운영 주소(samarket.vercel.app)는 이 보고서로 바뀌지 않습니다.** 이번 커밋은 문서 1건이고, 작업 브랜치에만 푸시했습니다(「감사만」 지시이므로 main 반영은 Owner 승인 후).

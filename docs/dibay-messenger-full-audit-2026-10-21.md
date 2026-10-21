# DIBAY 메신저·친구·대화·통화 전면 감사 + 통합 개선 설계안 (2026-10-21)

> **상태:** 감사·설계만 했고 코드·DB·네이티브는 바꾸지 않았습니다. **Owner 승인 대기**입니다.
> **기준:** HEAD `1a32cb1b`, 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회(테스트 DB는 조회하지 않음), Android 소스 1.2.4(9) / iOS 소스 1.2(7). 두 버전 모두 운영 `user_devices` 에 설치 기록이 있습니다.
> **판정 기호:** **C** = CONFIRMED(코드·DB 근거로 확정) · **S** = SUSPECTED(실행·실기기 증거 필요) · **N** = NORMAL(근거로 정상 확인) · **NP** = NOT_PROVEN(측정·확인 불가)
> **보완(2부, 문서 하단 「H~N」):** 1부와 2부가 충돌하면 **2부가 우선**합니다. 2부에서 정정한 1부 내용은 다음과 같습니다.
> - N-7 의 「일반 APNs 전환」 완화책은 철회합니다(잘못된 안).
> - C-UI 의 「재연결 중 시간 표시 멈춤」은 철회합니다(시간은 계속 흐름).
> - P-7 의 원인을 정정합니다.
> - C-3 은 CHECK 마이그레이션이 필요 없습니다.
> - 판정 변경: N-1·V-6·N-7 은 S→C 로 바꿉니다.
> - 신규 결함 10건을 추가합니다.
>
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

---
---

# 2부 — 통합 개선 설계 최종 보완 (2026-10-21 v2)

> 159개 감사 항목을 다시 감사하지 않았습니다. 1부의 결과를 그대로 쓰고, 지적된 영역만 깊이 확인했습니다(Android·iOS 네이티브 통화, W4·W5·W6, W2 정책).
> **코드·DB·네이티브 변경 0건**입니다. 운영 DB 는 읽기 전용으로만 조회했습니다.
> 추가 실측(운영 DB):
> - 메시지 18,800건, 방 하나 최대 4,108건
> - 메시지를 INSERT 하는 DB 함수 3개(send_text, append_atomic, gift_certificate_offer), 메시지 트리거 1개(cm_messages_block_deleted)
> - Realtime publication 에 messages·rooms·participants·call_logs·call_sessions·user_relationships·user_social_relations 7개 테이블이 모두 포함
> - `call_logs`·`call_sessions` status CHECK 에 busy 없음
> - 친구 관련 3개 테이블의 쓰기는 모두 서버 service-role 경로에서만 일어남(클라이언트 직접 쓰기 0건) → 쓰기 권한 회수(F-12)는 기능 영향 없음

## H. 기존 결함 대응표 (1부 88건 + 2부 신규 10건 = 98건)

**판정 변경 (2부):**
- N-1 S→**C**: Android 에서 늦은 정리가 새 통화의 Agora 채널·영상 surface·FGS·오디오 포커스·세션 관리자를 해제하는 코드 경로가 확정됐습니다.
- V-6 S→**C**: `singleTask` 에서 이전 인스턴스의 onDestroy 가 새 인스턴스의 onCreate 보다 늦게 올 수 있음이 확정됐습니다.
- N-7 S→**C**: VoIP 푸시를 CallKit 에 보고하지 않고 끝내는 분기 4개가 확정됐습니다.
- 결과: **확정 81 · 의심 17 · 합계 98** (1부 68/20 + 판정 변경 3 + 신규 10).

**단계 기호:** ①웹A(독립·저위험) ②웹B(정책·흐름) ③DB ④네이티브 R1(lifecycle) ⑤네이티브 R2(UI) — 순서와 근거는 N절.
**검증 기호:** U=vitest/JVM/소스 계약 · A=Android 실기기(Cursor) · I=iPhone(Owner) · W=데스크톱 브라우저 · D=운영 DB 읽기 확인

### H-1. 친구 (F)
| ID | 판정 | 처리 설계 | 층 | 단계 | 검증 |
|---|---|---|---|---|---|
| F-1 | C | 방 복원을 `unblockUserSocial` 내부로 옮겨, 모든 해제 경로가 같은 처리를 함 | 웹 | ① | U, A(T-F1) |
| F-2 | C | 차단 검사를 일반 1:1 도메인에만 적용(거래·주문 송신·통화 게이트에서 제외), 상거래 방에는 차단 메뉴 숨김 — **결정 D1** | 웹 | ② | U(송신 가드 3종), A(T-F2) |
| F-3 | C | 정리 대상을 owner=나 방향 행으로 한정 | 웹 | ① | U(LOCK 계약 테스트) |
| F-4 | C | 차단한 쪽의 1:1 방만 숨김 — **결정 D2** | 웹 | ② | U, I(P-5) |
| F-5 | C | upsert 사용, 23505 는 ok 로 처리, 방 메뉴에 중복 방지 장치 | 웹 | ① | U |
| F-6 | C | `/relations/friend` 에도 프로필 게이트 적용 | 웹 | ① | U |
| F-7 | C | 차단·해제 확인창을 `MessengerBlockPeerConfirmModal` 하나로 통일(누락된 3곳에 추가) | 웹 | ① | U, A, I |
| F-8 | C | 성공·실패 스낵바 통일, 서버 코드 원문 비노출 | 웹 | ① | U |
| F-9 | C | 방 동기화를 `user_social_relations`(owner=나) + 차단 API 의 서버 bump 로 교체 | 웹 | ① | U, A |
| F-10 | S | 재구독 시 친구 그래프도 다시 받음 | 웹 | ① | A(재연결) |
| F-11 | C | 조회 오류는 5xx 로 응답, 클라이언트는 기존 목록 유지 | 웹 | ① | U |
| F-12 | C | `user_social_relations`·`user_relationships`·`community_friend_favorites` 의 anon·authenticated **INSERT/UPDATE/DELETE 회수**(SELECT 는 Realtime 용으로 유지) | DB | ③ | D(grant 재조회) |
| F-13 | C | 주석 정정, 죽은 코드 제거 | 웹 | ① | U |
| F-14 | C | 숨김 변경 시 서버가 사용자 단위 bump 발행(RLS 정책은 추가하지 않음, 클라이언트 bump 금지 계약 유지) | 웹 | ① | A(2기기 숨김) |

### H-2. 대화 목록·스와이프 (L)
| ID | 판정 | 처리 설계 | 층 | 단계 | 검증 |
|---|---|---|---|---|---|
| L-1~L-5 | C | W1: 열림 상태를 상위 state 하나로 관리, cancel 시 닫힘으로 스냅, 첫 탭은 닫기로 소비, document 외부 탭·스크롤·백그라운드·backButton·5초 무조작 시 닫힘, `/trade-chats` 에도 같은 규칙 | 웹 | ① | U, A(T-L1~L4), I(P-8) |
| L-6 | C | 정책 함수 `resolveMessengerRoomActionPolicy` 가 방 종류·역할을 반영(M절 표) | 웹 | ② | U(정책 매트릭스) |
| L-7 | C(일부 S) | 진행 중 주문은 나가기 X, 사장님은 항상 X, 서버 `leaveMessengerRoomUnified` 에서 같은 함수로 거부, 확인 문구 분리 | 웹 | ② | U, A(T-L5) |
| L-8 | C | **보고만**(나가기를 left_at 로 통일하려면 조회 계약 변경이 필요. 이번 범위에서 제외) | — | — | — |
| L-9 | C | 「복원」은 `isArchivedByViewer` 일 때만 표시 | 웹 | ② | U |
| L-10 | C | busy 상태를 방별 Set 으로, 보관은 낙관적 반영, 오류 배너 자동 소멸 | 웹 | ① | U |
| L-11 | C | 닫힌 상태에서 액션 버튼 `tabIndex=-1`·`inert` | 웹 | ① | U |

### H-3. 메시지 (M) — 신규 M-10~M-15 포함
| ID | 판정 | 처리 설계 | 층 | 단계 | 검증 |
|---|---|---|---|---|---|
| M-1·M-9 | C | **bounded bump**: ACK 전 await, 700ms+600ms·최대 2회·전체 1.5초, canonical 토픽만. 실패해도 200 응답, after() 에서 1회 더. 푸시는 allSettled 병렬 | 웹 | ① | U(T5~T7), 지연 측정 |
| M-2 | C | merge 가 pending·failed 행을 보존(불변식 I1~I4, I절) | 웹 | ① | U(T1~T4) |
| M-3 | C | 프레임 단위 bump 큐(rAF 취소 금지), hint 를 누적 | 웹 | ① | U(T13) |
| M-4 | C | W5 `room_seq`(트리거 방식). after 따라잡기는 seq 기준 | DB+웹 | ③ | U, D, 연속 송신 E2E |
| M-5 | S | 같은 토픽 재구독은 remove 완료 후에만, deps 는 원시값으로. SUBSCRIBED 재합류 시 따라잡기 | 웹 | ① | U(T14), A |
| M-6 | C | raw 토픽 발행·구독 제거 | 웹 | ① | U |
| M-7 | C | 900ms 안의 복귀는 지연 예약, `appStateChange` 연결 | 웹 | ① | U(T15), A·I(백그라운드 복귀) |
| M-8 | C | 텍스트도 실패 행 + 같은 cid 로 재전송 | 웹 | ① | U |
| **M-10** | C(신규) | 그룹 dedupe 키가 cid 가 없으면 `content.slice(0,24)` 사용(`group…/messages/route.ts:145`) → cid 필수, 없으면 서버가 발급 | 웹 | ① | U |
| **M-11** | C(신규) | 라우트 메모리 dedupe 가 **실패 결과도 캐시**(`route.ts:287`) → ok 결과만 캐시 | 웹 | ① | U(T10) |
| **M-12** | C(신규) | 모든 실패를 400 으로 응답 → 클라이언트가 cid 를 버림 → 재전송 시 중복 가능 → 커밋 여부를 모르면 **5xx `commit_unknown`**, 클라이언트는 cid 를 유지하고 재조회 | 웹 | ① | U(T8·T11·T12) |
| **M-13** | C(신규) | 스티커·공유는 bump 가 throw 하면 저장은 성공했는데 500 → bounded bump 로 흡수 | 웹 | ① | U(T6·T7) |
| **M-14** | C(신규) | 공유 라우트가 cid 를 넘기지 않음 → 넘기도록 수정 | 웹 | ① | U |
| **M-15** | C(신규) | 위로 스크롤 페이지 `.lt("created_at")` 에서 같은 시각의 행 누락 → `(created_at,id)` 기준 keyset | 웹 | ① | U |

### H-4. 통화 기록·연결 (C) — 신규 C-15~C-18 포함
| ID | 판정 | 처리 설계 | 층 | 단계 | 검증 |
|---|---|---|---|---|---|
| C-1·C-2 | C | 빈 배열 기본값을 모듈 상수로, enrich 는 useMemo, seed 는 첫 마운트와 hydrate 종료 시에만 적용, 자기가 내보낸 값이 돌아오면 무시, 2페이지 이상이면 병합 | 웹 | ① | U(렌더 3회 이하·커서 유지), A, I(P-6) |
| **C-18** | C(신규) | 단독 기록 페이지가 viewer id 를 넘기지 않음 → 무한 렌더만 고치면 목록이 영영 로드되지 않음(지금은 무한 렌더가 이 문제를 가리고 있음) → viewer id 를 넘기고, null→값으로 바뀔 때 다시 fetch | 웹 | ① (C-1 과 같은 커밋) | U |
| C-3 | C | **영구 기록(안 B)**: busy 판정 시 `call_logs`(status `cancelled`, `ended_reason='peer_busy'`, session 없음) + call_stub(`sessionId='busy:<uuid>'`). CHECK 변경 불필요(공통 판정이 ended_reason 을 우선 사용). 로컬 표시만으로는 완료하지 않음 | 웹 | ② | U, A·I(재접속 후 기록 유지) |
| **C-17** | C(신규) | 발신자 **자신의** live 세션 때문에 막힌 경우도 `peer_busy` 로 표시 → `self_busy` 로 분리하고 기록하지 않음 | 웹 | ② | U |
| C-4 | C | 서버가 `ringDeadlineAt`·`serverNow` 를 응답, 거절되면 남은 시간+300ms 로 다시 예약(최대 2회) | 웹 | ② | U(시계 어긋남), I |
| C-5 | C | 웹 V4 join watchdog 15초 → failed 처리 + end PATCH | 웹 | ② | W |
| C-6 | C | busy 판정 시에만 상대 세션도 reconcile(presence 90초 기준) | 웹 | ② (**④보다 먼저**) | U, A |
| C-7 | C | `void` → `keepAliveAfterResponse`, missed 시 수신자에게 종료 push(전송 값은 `cancelled` 로 매핑) | 웹 | ② | A·I(T-C4) |
| C-8 | C | append RPC 를 forward-only 로(`GREATEST`, preview 조건부 교체), stub 의 추가 UPDATE 2회 삭제, `cm_room_tip_forward` RPC, rooms 안전망 트리거 | DB+웹 | ③ | U, D |
| **C-15** | C(신규) | `updateExistingStub` 가 더 새로운 텍스트 미리보기를 덮어씀 → `cm_room_tip_forward` 로 교체 | DB+웹 | ③ | U |
| C-9 | S | 표시 정렬에서 stub 을 종료 시각 위치로(seq 와 함께) | 웹 | ③ 이후 | A·I |
| C-10 | C | 웹: 중복 `callV4ReconcileBeforeCreate` 제거(②). iOS: PREPARING 화면을 먼저 띄움 + JS 는 capability 게이트(옛 바이너리는 기존 경로)(⑤) | 웹+iOS | ②·⑤ | J절 측정, I |
| C-11 | S | `cleanupCallV4`: 범위 정리 → await → 소유를 확인한 뒤에만 전역 reset. iOS `deliverNativeLocalTerminal` 순서도 맞춤 | 웹 | ② (**④보다 먼저**) | U, I(재발신) |
| C-12 | S | callId 당 poller 1개, 1초 주기, Retry-After 준수, 제한 키를 사용자+세션으로 | 웹 | ② | U |
| C-14 | S | heartbeat 에 `mediaConnected`, `connected_at` 이 null 일 때만 채움, media_connected 3회 재시도 | 웹 | ② | U |
| **C-16** | C(신규) | iOS 네이티브 발신이 원격 거절·부재중으로 끝나면 웹이 `replace(returnPath ?? call_logs)` → 통화 탭으로 튐 → 규칙 R1(네이티브 통화는 웹 이동 0회) | 웹 | ② | U(T14), I |

### H-5. 영상 UI (V)·네이티브 (N) — 상세는 K절
| ID | 판정 | 처리 설계 | 층 | 단계 | 검증 |
|---|---|---|---|---|---|
| N-1 | **C** | callId 범위 leave·stop·clearSession, 영상 TerminalOnce, iOS compare-and-clear 오디오 처리 | 네이티브 | ④ | U(Robolectric), A, I |
| N-2 | C (iOS 영상+**음성**) | CXEndCallAction perform 안에서 즉시 leave → fulfill → PATCH 비동기. Android 는 정상 | iOS | ④ (N-1 과 같은 커밋) | I(P-1·P-2) |
| N-3 | C | 양 플랫폼 같은 연결 계약(K-3) | 네이티브 | ④ | U, A, I |
| N-4 | C | `onTokenPrivilegeWillExpire` → 기존 token API → `renewToken`. **env TTL 상향만으로 완료 처리하지 않음** | 네이티브 | ④ | I(65분 통화), U |
| N-5 | S | 치명 오류 allowlist 에 있는 것만 종료, 나머지는 로그만 | 네이티브 | ④ | U |
| N-6 | C | 영상 앱 내 종료도 CXEnd 로, 이중 보고 제거, 오디오 해제는 CallKit 에 맡김 | iOS | ④ | I |
| N-7 | **C** | 모든 VoIP 분기에서 CallKit 보고(추적 중인 통화는 같은 UUID 로 ack, 끝난 통화는 report-then-end) + 서버가 VoIP 대상 기기를 좁힘. **일반 APNs 전환안은 철회** | iOS+웹 | 서버 ② / 네이티브 ④ | I(P-9) |
| V-1 | C | 5초 자동 숨김, 탭하면 보이기/숨기기 전환, 이름·상태는 항상 표시 | 네이티브 | ⑤ | U(정책 클래스), A, I |
| V-2 | C | `onConnectionStateChanged` → 「재연결 중」(N-3 과 같은 데이터) | 네이티브 | ④ | A, I |
| V-3 | S | 발신 측 상대 이름을 프로필 표시명으로(방 제목 사용 안 함) | 웹 | ② | A·I |
| V-4·V-5 | C | local+remote 품질, rtcStats·remoteVideoStats 사용, 0 은 세지 않음 | 네이티브 | ⑤ | U(평가기), A, I |
| V-6 | **C** | observer compare-and-clear | 네이티브 | ⑤ | U |
| V-7 | C | 라벨을 「누르면 할 동작」으로 통일(Android 카메라 라벨, iOS 초기 라벨 `:1040` 오류 포함) | 네이티브 | ⑤ | A(TalkBack), I(VoiceOver) |
| V-8 | C | 데스크톱 웹: 같은 평가기 + 테두리 | 웹 | ② | W |

### H-6. 입력창 (K)·성능 (P)·그룹·첨부·삭제·보안·기타
| ID | 판정 | 처리 설계 | 층 | 단계 | 검증 |
|---|---|---|---|---|---|
| K-1 | C | 모바일 Enter = 줄바꿈 — **결정 D3** | 웹 | ② | A·I(T-K1) |
| K-2 | C | 1~5줄 자동 확장(`--chat-composer-height` 계약 + §7 이력 + `verify:cm-room-keyboard-layout-contract`) | 웹 | ② | A·I |
| K-3·K-4 | C | 수정 실패 시 입력 복원, 이모지 전송은 수정 경로와 분리 | 웹 | ① | U |
| K-5 | C | 방별 임시 저장 | 웹 | ② | A·I(T-K3) |
| K-6 | S | 조합 상태 ref, 조합 중 전송은 compositionend 이후 처리 | 웹 | ② | A·I(T-K2) |
| K-7 | C/S | 멘션 화살표·Enter 선택, keyCode 229 처리, focus-within 표시 | 웹 | ① | U, W |
| P-1·P-2·P-3·P-5 | C | typing store 동일 state 반환, friendship-sync deps 원시값, `/friends` 조건부 호출, footer memo | 웹 | ① | 렌더 횟수·채널 등록 로그 |
| P-4·P-6 | S | 입력창 전용 컨텍스트, 친구 행 memo·가상화 | 웹 | ② | 렌더 횟수 |
| P-7 | C(원인 정정) | 「뒤로 두 번」은 **push 로 진입한 경로**(방 안 수락·배너 확장·기록 행·웹 푸시)에서만 생김 → 규칙 R1~R6(L절) | 웹 | ② (마지막) | U(T1~T17), A, W |
| G-1 | C | RPC 에 `p_actor_user_id` 버전 추가 + TS 에서 방장 재확인, notice·permissions 는 settings 경로로 일원화 | DB+웹 | ③ | U(비방장 403), D |
| G-2 | C | 정원 계산에 `left_at IS NULL` 조건, 판정을 `>=` 로 | 웹 | ① | U |
| G-3 | C | **결함 개선과 분리한 Owner 선택 기능**(결정 D5). 선택하지 않으면 보고만 | — | 선택 | — |
| G-4 | S | 그룹 읽기 라우트는 DB `left_at` 을 확인 | 웹 | ① | U |
| A-1 | C | 앨범 조회에 숨김·전체 삭제·사용자 숨김 필터 | 웹 | ① | U |
| A-2 | S | staging 정리 크론(24시간) | 웹 | ② | D(Storage 목록) |
| D-1 | C | 전체 삭제 시 답장 인용 스냅샷을 placeholder 로 교체 | 웹 | ① | U, A |
| D-2 | S | 전체 삭제 시 `notification_events` 본문을 placeholder 로 | 웹 | ② | D |
| S-1·S-2 | C/S | 멤버십 검사 추가, 커서 형식 검증 | 웹 | ① | U |
| X-1 | S | 홈 섹션별 scrollTop 저장·복원 | 웹 | ② | A·I |
| X-2 | C | 오픈그룹 입장에 세션·전화 인증 게이트 | 웹 | ① | U |

**층별 집계(98건):**
- 웹 78
- DB(웹 동반 포함) 5: M-4, C-8, C-15, G-1, F-12. C-9 는 seq 이후에 하는 웹 변경
- 네이티브 13: N-1~N-7, V-1, V-2, V-4~V-7. 여기에 C-10 iOS 부분은 웹과 함께 처리
- 보고만 1(L-8), 선택 1(G-3)

## I. 메시지·통화 실시간성 보완 (W4·W5·W6)

### I-1. 저장 / 실시간 발행 / 푸시를 분리하는 ACK 계약 (W4)
| 단계 | 성공 기준 | 실패 시 클라이언트 | 실패 시 수신측 |
|---|---|---|---|
| (a) 저장 | RPC 커밋 `ok:true`(deduped 포함) | **이것만 성공·실패를 정함** | — |
| (b) bump 발행 | Realtime REST 2xx(bounded 2회) | 영향 없음(200) | postgres_changes → 다음 bump 의 after= → SUBSCRIBED 재합류 → 화면 복귀·appStateChange 따라잡기 순으로 회복 |
| (c) 푸시 | FCM/APNs | 영향 없음 | 알림만 누락 |

- 커밋 여부를 모르는 오류는 5xx `commit_unknown` 으로 응답합니다. 클라이언트는 cid 를 유지한 채 `unknown` 상태로 두고, cid 재조회나 따라잡기에서 발견되면 sent 로, 없으면 failed 로 바꿉니다.
- **중복 방지 근거:** DB UNIQUE `(room_id, sender_id, client_message_id)` 가 운영에 있음을 확인했습니다. RPC 의 SELECT + unique_violation 처리도 있습니다. 같은 cid 재시도는 같은 id 를 돌려주고, **푸시는 0회, bump 는 다시 발행**합니다(수신측이 id 로 중복 제거).
- **클라이언트 상태 기계:** pending → (200) sent / (4xx) failed / (5xx·타임아웃) unknown → sent|failed. 불변식은 네 가지입니다.
  - I1: 서버 행이 와야만 pending 이 풀림
  - I2: 병합해도 pending·failed 는 지워지지 않음
  - I3: 같은 cid 는 1행
  - I4: sent 는 되돌아가지 않음
- 테스트 T1~T15 를 정의했습니다(같은 프레임 bump 2건, ACK 유실 후 재시도, 동시 POST 2건, 실패 캐시, 4xx·5xx 분기, 재합류 따라잡기, 900ms 복귀).

**전송 경로별 현재 상태:** 아래 경로는 모두 공용 `publishMessengerRoomBumpBounded` 로 바꿉니다.

| 경로 | cid | bump 위치 | 조치 |
|---|---|---|---|
| 1:1·거래·주문 텍스트 | O | ACK 뒤, 푸시 뒤 | ACK 전 bounded |
| 그룹 텍스트 | 없으면 내용 키 | ACK 뒤 | cid 필수 + ACK 전 |
| 이미지·파일·음성 | O | ACK 전(5초×2 가능) | bounded 로 교체 |
| 스티커 | O | ACK 전, try 없음 | bounded |
| 게시글 공유 | **X** | ACK 전, try 없음 | cid 전달 + bounded |
| call_stub | 세션 키 | 서비스+라우트 2회 | 1회로 |
| 시스템·주문·선물 | 서버 생성 | 각자 | 유지(C-8 tip 만 교체) |
| 가격제안·매물변경 시스템 | X | **없음** | 서버 bump 추가 |

### I-2. 재연결 누락 복구
- 진입점은 `onRoomRealtimeResumed(reason)` 하나입니다. 트리거:
  - SUBSCRIBED 재합류(첫 bind 제외)
  - visibilitychange
  - Capacitor appStateChange
  - online
  - bus 이벤트
- 방 단위 single-flight 로 실행하고, 실행 중에 새 트리거가 오면 끝난 뒤 1회 더 돌립니다.
- 앵커는 확정 행 중 max(roomSeq)이고, 없으면 기존 방식을 씁니다.
- `nextAfterMessageId` 로 페이지를 넘기고, 5페이지를 넘으면 latest 로 정합합니다.

### I-3. DB 순번(W5) 도입 영향 분석
- **INSERT 경로 15곳 이상**(RPC 2 + 선물 RPC + TS 직접 INSERT 6곳 + append 경유 6곳)입니다. 경로마다 고치지 않고 **BEFORE INSERT 트리거**로 일괄 처리합니다. 선례: `cm_messages_block_deleted`, 그룹 seq 트리거.
- **설계:**
  - `messages.room_seq bigint NULL` 추가
  - 방별 카운터 테이블 `community_messenger_room_message_seq` 추가(publication 미포함 → rooms UPDATE 이벤트가 늘지 않음)
  - 트리거 동작: `rooms FOR UPDATE` → 카운터 +1. 락 순서를 rooms → 카운터 → participants 로 통일해 데드락을 막습니다.
  - 부분 UNIQUE `(room_id, room_seq)`
- **정합성:** 카운터 락이 커밋까지 유지되므로 seq 순서 = 커밋 순서입니다. 따라서 `seq > anchor` 는 늦게 커밋된 행도 놓치지 않습니다. 과거 시각으로 기록된 call_stub 도 따라잡기에 잡힙니다.
- **기존 데이터:** **백필하지 않습니다.** messages 가 publication 에 포함돼 있어 기존 행을 UPDATE 하면 클라이언트에 UPDATE 이벤트가 나갑니다(18,800건). 기존 행은 NULL 로 두고, 읽기 쪽 이중 조건으로 처리합니다:
  - `room_seq > a.seq OR (room_seq IS NULL AND (created_at,id) > (a.created_at,a.id))`
- **커서 페이지네이션:**

| 대상 | 처리 |
|---|---|
| after RPC | 전환. md5 가드를 갱신하거나 전체를 재정의 |
| before(위로 스크롤) | `(created_at,id)` 로 수정(M-15) |
| latest·bootstrap | 유지하고 roomSeq 만 포함 |
| unread·mark_read | 이번 범위 아님 |
| 표시 정렬 | created_at 유지 |
| 앵커 | roomSeq 우선 |

  - API 는 `after=<messageId>` 그대로입니다. 서버가 앵커의 seq 를 찾으므로 구 클라이언트도 혜택을 받습니다.
- **롤백 호환:** `DROP TRIGGER` 만 하면 새 행은 NULL 이 되고, OR 조건이 그대로 받아 줍니다. 구 코드는 컬럼을 무시하고, 카운터 테이블은 남아도 무해합니다.
- **대안(DB 가 created_at 을 정함)은 기각합니다.** 과거 시각 행(stub·선물·주문)의 의미가 깨지고, 한번 바뀐 시각은 롤백할 수 없습니다.
- **NP:** send_text 의 rooms 락 보유 구간이 늘어나는 비용(수 ms 추정) → 그룹 연속 송신 E2E 로 측정합니다.

### I-4. 통화 종료 후 기록의 즉시 표시
- DB 기록은 100%입니다(1부). 화면 반영 경로는 다음과 같습니다.
  - 방: 서버 bump 의 stub 스냅샷
  - 목록: rooms 패치. C-8 forward-only 로 UPDATE 가 1회로 줄어듦
  - 통화 탭·단독 페이지: Panel 구독 → 병합. C-1·C-2·C-18 수정 후
- 구독 경로(`use-community-call-history-realtime-sync.ts:150-197`)는 call_logs·call_sessions publication 과 RLS 를 통과하는 것을 확인했습니다.

## J. 통화 화면 진입·복귀 지연 측정 (C-10 · 구현 전후 비교)

| 단계 | 기록 지점 | 보강 |
|---|---|---|
| T0 탭 | `call_outgoing_tap`, A0 | — |
| T1 권한 확인 | `media_prime_resolved` | — |
| T2 reconcile·방 확인 | `LATENCY_RECONCILE`/`LATENCY_ROOM` | ②에서 reconcile 제거 후 0 |
| T3 POST | A1 | — |
| T4 서버 INSERT | **운영 로그 없음** | 서버 CORR `S1 insert_done` 추가 |
| T5 VoIP 발송 | A3 (2초 예산) | Vercel 로그 |
| T6 응답 | A2 | 응답에 `serverNow` 추가 → 시계 차이 기록 |
| T7 네이티브 handoff | Android A4 / iOS `native_outgoing_handoff_done` | iOS CORR 시각 추가 |
| T8 네이티브 첫 화면 | Android `dialing_surface_shown` / iOS `outgoing_activity_shown` | — |
| T9 수신 푸시 도착 | iOS I0 / Android `incoming_call_received` | Android CORR 추가 |
| T10 수신 UI | iOS I2 / Android `incoming_activity_shown` | — |
| T11 수락 | iOS I4·I6 / Android `fsi_accept_tap` | — |
| T12 미디어 연결 | iOS I10 / Android RB6 | — |
| R1 종료 탭 → 상대 미디어 중단 | (신규) 종료 탭 CORR + 상대 `remote_offline` | N-2 증명용 |
| R2 종료 → 방 화면 복귀·뒤로가기 횟수 | (신규) exit CORR | P-7 증명용 |

- **수집:**
  - Android: `adb logcat -v epoch | grep -E "DIBAY_CALL_CORR|DIBAY_CALL_V4|call-push|Capacitor/Console"`
  - iOS: Xcode 콘솔 + Safari Web Inspector
  - 서버: Vercel 로그에서 callId 로 검색
- **조합:** iOS→Android, Android→iOS × 웜·콜드 × 각 10회 → 구간별 p50/p95 CSV.
- **기준선:** **⓪ 단계(구현 전)에 현재 HEAD 에서 먼저 잽니다.** 같은 방식으로 메신저 성능 `measure:messenger-parity-audit`·`measure:messenger-ack-warm` 도 3회 잽니다.

## K. 네이티브 통화 수정 사유·영향 분석

### K-1. 항목별 분석표
| ID | 현재 정상 / 결함 | 수정 이유 | Android | iOS | 음성·영상·재통화·수신·백그라운드 | CallKit·PushKit·Agora·Capacitor | 새로 생길 수 있는 결함 | 테스트 | 롤백 |
|---|---|---|---|---|---|---|---|---|---|
| **N-1** | 정상: 종료 시 미디어 leave 1차는 안전함. 결함: 늦은 PATCH 콜백(connect 8s+read 8s = 최대 16초)·이중 cleanup·BUSY 실패가 **callId 확인 없이** `E.leave()`·`S.stop`·`SM.clearSession()` 실행 → 새 통화의 채널·영상 surface(검은 화면)·FGS·오디오 포커스·세션 id 해제. `fail()`·`onError` 도 현재 listener 에 전달 | 종료 직후 재발신은 흔한 시나리오. 결과가 무음·검은 화면·「연결 중」 고착·백그라운드 마이크 차단 | `E.leave(callId,reason)`(음성 VE:172-189 와 같은 foreign skip, occupant null 이면 leaveChannel 도 skip), `E.fail/onError` callId 확인, 새 `NativeVideoCallTerminalOnce`(VR 과 같은 방식), `R.cleanup/terminalPatch` 첫 줄에서 claim 확인, `S`/`VS` 에 `boundCallId` 를 두고 STOP 시 foreign skip, `SM.clearSession(callId)` 신설, VR:789 교체 | **같은 lane 재발신은 지금 `conflictingActiveCall` 로 조용히 실패**(끊김은 아님). 범위 없는 `leave(reason:)`·전역 `deactivate`·전역 `resetOutgoingJoinGate`·PiP `stopIfActive()` 는 존재 → `leave(callId:)`, `resetOutgoingJoinGate(sessionId:)`, `deactivateIfNoCallOwnsAudio()`(두 lane 이 모두 비고 CallKit 추적 통화가 0일 때만), PiP 는 `isBound(to:)` 확인. **N-2 를 고치면 즉시 재발신이 가능해지므로 N-1 은 N-2 의 선행 조건(같은 커밋)** | 영상·음성 모두, 영상↔음성 교차, 종료 직후 수신, 잠금 화면 FGS 유지 | Agora 엔진이 lane 사이에 공유되는지(S) → foreign skip 으로 보호. Capacitor `endCall` 디스패처·FCM 종료는 1회 보장으로 중복 제거. JS(`lib/call/native/*`) 변경 없음 | 1회 보장 이후 정리가 일부만 실행 → 기존 try/finally 로 대응. `boundCallId` 불일치로 좀비 FGS → SESSIONS 가 비면 무조건 stop. 세션 id 잔존 → 양 Runtime 에 live 가 없으면 무조건 clear. (iOS) leave 범위 제한 없이 N-2 만 반영하면 재발신이 무음 | Robolectric: 늦은 cleanup no-op, occupant 유지, STOP(old) 후에도 foreground, clearSession(old) 후 id 유지. 소스 계약: leave 시그니처에 callId. A·I: 느린 망에서 종료 → 즉시 재발신 ×5, 영상↔음성, 재발신 후 잠금 30초 | 커밋 revert → `native:prepare`(빌드 +1) → 재빌드. 서버·DB 영향 없음 |
| **N-2** | Android 정상(PATCH 전에 leave). iOS 결함: 영상·**음성 모두** `endAsync`(최대 8초) 이후에 leave → 종료 후에도 송출. CallKit 화면 종료도 같음. `fulfill` 지연 | 프라이버시(종료 후에도 카메라·마이크 송출) | 변경 없음(FGS 알림은 PATCH 동안 유지, 현행 유지 권장) | 앱 종료 탭 → `requestEnd`(CXEndCallAction) → perform: `markTerminalSuppressed` + `callKitEndCompletedSessionIds` 기록 → `handleLocalEndFromCallKit`: beginEnd → ringback 중지 → PiP teardown → **`leave(callId)` 즉시** → markEnded → `fulfill()`(수 ms) → CallKit 이 오디오 해제(`didDeactivate`) → `beginBackgroundTask` + PATCH 비동기 → `finishServerTerminal`(서버·로그만). CXEnd 요청이 실패하면 같은 단계를 직접 실행 | 잠금·PiP 종료도 같은 경로. ringing reject 도 perform 안에서 즉시 fulfill | **CallKit 과 충돌하지 않음**: 종료는 CXEnd 트랜잭션 하나로만 하고, 이 경로에서 `reportCall(endedAt:)` 은 호출하지 않음(이중 보고 제거) | perform 이 main 에서 실행되므로 `destroy()` 동기 호출 시 jank → leaveChannel 만 하고 destroy 는 serial 큐. PATCH 실패 → 백그라운드 task 안에서 1회 재시도, 이후 서버 heartbeat 만료에 맡김. 서버에 이전 세션이 active 로 남아 재발신이 busy 로 거절될 수 있음 → **C-6(②) 선행** | I: 종료 탭·잠금화면 종료 → 상대 미디어가 1초 안에 중단(J R1), 최근 통화 1건 | 같음 |
| **N-3·V-2** | 결함: iOS 는 DROPPED 에도 종료(수신 connected), 발신 영상은 **모든 offline 에 로컬 end PATCH**, 음성 발신은 QUIT 만 처리 → 3가지 동작. Android 는 QUIT 외 무시 + 서버는 양쪽 heartbeat 가 모두 끊겨야 종료 → **상대가 사라져도 사용자가 끊을 때까지 「통화 중」**. 연결 상태 콜백 0건 | 일시적 끊김에 통화가 종료되거나, 실제 종료 후에도 통화가 무한히 유지됨 | **공통 계약(양 플랫폼·음성·영상·발신·수신 동일)**: QUIT → 즉시 원격 종료(PATCH 없음). DROPPED → 「상대 연결 끊김」 + **유예 15초**, 같은 uid 가 다시 join 하면 취소, 만료 시 end PATCH(`peer_dropped`). 내 쪽 RECONNECTING → 「재연결 중」 + **유예 30초**, CONNECTED 면 복귀. FAILED 또는 치명 reason(BANNED·INVALID_APP_ID·INVALID_CHANNEL·INVALID_TOKEN·TOKEN_EXPIRED(갱신 실패 후)·REJECTED) → 실패 처리. LEAVE_CHANNEL 은 무시. SAME_UID_LOGIN → answered_elsewhere. **통화 시간 표시는 계속 흐름**(서버 answered_at 과 일치). 유예 중 서버 종료 신호가 오면 그쪽이 우선 | Android: 타이머는 Runtime(`LINK_GRACE`, 공용 `NativeCallLinkGrace`)이 소유 → Activity 가 없어도 동작, cleanup 에서 취소. 표시는 `A.renderLinkPhase(callId)` | iOS: `connectionChangedTo` delegate, `didOfflineOfUid` 사유 분기, 공용 판정 함수 `AgoraOfflineDecision`(발신 `Outgoing.onDisconnected` 도 사용), callId·generation 확인 workItem | 백그라운드·잠금·PiP 에서도 Runtime 타이머가 동작. heartbeat 는 계속 보냄 | Agora 콜백만 사용. CallKit 은 실제로 종료될 때만 `reportCall(ended)` | 실제 이탈 시 종료가 최대 15초(+Agora 감지 약 20초) 늦어짐. 양쪽 동시 end PATCH → 서버 멱등으로 처리 | Robolectric·XCTest(순수 함수): DROPPED → 15초 → end, rejoin 이 오면 취소, cleanup 이 타이머 취소. A·I: Wi-Fi 10초 off → 회복, 상대 강제 종료 → 약 35초 안에 종료, 비행기 모드 40초 → 종료 | 커밋 revert |
| **N-4** | 결함: 토큰 갱신 0건. TTL 기본 3600초(env, 최소 300). 서버 갱신 엔드포인트 `GET /calls/sessions/[id]/token` 은 **이미 있음** | 1시간 넘는 통화가 끊김 | `onTokenPrivilegeWillExpire`/`onRequestToken` → `fetchTokenAsync(sid)` → `renewToken`(occupant 확인). 실패 시 5초 뒤 1회, 그래도 실패면 종료 | `tokenPrivilegeWillExpire` → 같은 API → `renewToken`, 실패 시 30초 뒤 1회 | 음성·영상 모두 | 서버 변경 없음 | 이전 통화의 토큰이 새 통화에 적용 → occupant 확인으로 방지 | U: occupant 불일치 시 skip. I·A: 65분 통화(또는 Preview 에서 TTL=300 으로 6분 — 설정 변경이라 Owner 승인) | 커밋 revert |
| **N-5** | 결함(코드 C·영향 S): 모든 Agora `onError` 를 통화 실패로 처리 | 비치명 오류(카메라 등)에도 종료 | `isFatalAgoraError`: 101·102·109·110·17·7 만 종료, 나머지는 경고 로그 | `didOccurError` 는 로그만 남김. 종료는 N-3 의 연결 상태 경로와 join 반환값으로만 | — | — | 실제로 깨진 통화가 이어질 수 있음 → N-3 의 FAILED·유예가 보완 | U(순수 함수) | revert |
| **N-6** | 결함: 영상 앱 내 종료가 CXEnd 를 안 거침, CallKit 화면 종료 시 `reportCall(ended)` 이중 보고, fulfill 이 PATCH 를 기다림, CallKit 보다 먼저 `setActive(false)`. (1부의 「통화 기록에 상대 종료로 남음」 표현은 과장 → 정정) | CallKit 계약 위반, 오디오 세션 경합 | — | N-2 경로에 통합 | — | 음성은 이미 CXEnd 사용(정상) | — | I: 잠금화면 종료·PiP 종료 | N-1 과 같은 커밋 |
| **N-7** | 결함(C): VoIP 분기 `:96-98`(winner tracked), `:114-116`(winner suppressed), `:145-151`(stale post-accept), `:219-225`(already suppressed)가 CallKit 보고 없이 completion. 서버(`push-payload-types.ts:166-180` `resolveCallPushProviderPolicy`)는 모든 terminal 을 모든 기기에 VoIP 로 보냄 | iOS 13+ 정책: VoIP 푸시마다 `reportNewIncomingCall` 필수. 반복해서 어기면 앱 종료·VoIP 제한 → 수신 불능 | — | 네이티브: 새 `ackPushKitForTrackedCall(sessionId:completion:)`(추적 중인 통화는 같은 UUID 로 재보고, `callUUIDAlreadyExists` 는 정상 처리). suppressed·끝난 통화는 **report-then-end**(`.answeredElsewhere`/`.remoteEnded`). 기존 `reportIncomingCall` 재사용 금지(다른 통화를 정리하는 부작용). 서버: VoIP terminal 은 해당 세션의 incoming VoIP 를 받은 기기와 발신 기기에만, 승자 기기 제외. `call_ended` 는 VoIP 유지(백그라운드 대체 채널이 없음) | 수신 answer 경로는 변경 없음 | **우회하지 않고 정책을 지킴.** 1부의 「일반 APNs 전환」은 잠금화면 CallKit 을 끌 수 없어 철회 | suppressed 기기에서 무음 CallKit 이 잠깐 깜빡일 수 있음 → 서버가 대상을 좁혀 빈도 최소화. 같은 UUID 재보고를 정책 준수로 인정하는지는 NP | 소스 계약: 모든 terminal 분기에 report 존재(기존 `ios-post-terminal-winner-suppressed-contract.test.ts` 갱신). I: 앱이 종료된 상태에서 수신 → 상대 취소 ×5, 늦은 terminal 시나리오 10회 → 앱이 죽지 않고 다음 수신 정상 | 서버는 웹 revert 로 즉시 복구(옛 바이너리 호환). 네이티브는 revert 후 재빌드 |
| **C-10 iOS** | 결함: iOS 는 POST 응답 전까지 화면이 그대로(직렬 대기 4~6단계). Android 만 PREPARING 을 먼저 띄움 | 체감 지연 | 변경 없음 | 신규 plugin `startNativeOutgoingPreparing(attemptId, peerName, mediaType)` → 준비 화면 즉시 표시 → POST 후 `bindNativeOutgoingEstablishment(attemptId, callId)` → 기존 `handleOutgoing` → `CXStartCallAction`. CallKit·카메라·오디오는 bind 이후(UUID 는 서버 sessionId 여야 함). 취소 → 기존 abandon | 음성 iOS 도 같은 패턴 | JS 게이트를 「Android 전용」에서 「capability 확인」으로. **옛 바이너리는 UNIMPLEMENTED → 기존 경로 유지**(현재 코드는 `!preparing.ok` 이면 통화 실패 → 그대로 적용 금지) | 준비 화면에서 취소와 POST 응답이 겹치는 경합 → attemptId 로 정합 | I: 탭 → 300ms 안에 준비 화면, 취소 시 서버 세션이 cancel 상태 | JS 게이트는 웹 revert, 네이티브는 재빌드 |

### K-2. 영상통화 UI 최종 요구 대응 (V-1·V-4~V-7·테두리) — **lifecycle 과 분리한 UI 전용 커밋**
| 요구 | 설계 | 근거·보장 |
|---|---|---|
| 상대 이름·통신 상태 항상 표시 | info 패널(`connected_info`/`connectedChromeContainer`)은 항상 VISIBLE. 상태 문구는 N-3 의 linkPhase(재연결 중·상대 연결 끊김)를 반영 | `syncPersistentCallStatusVisibility` 를 info 와 FAB 로 나눔 |
| FAB 5초 자동 숨김 | 연결 후 마지막 조작 + 5초 → 250ms fade. Android `chromeHideRunnable`, iOS `chromeHideWorkItem` 재사용 | 순수 정책 클래스 `ChromePolicy.canAutoHide()`: PiP·dock·ENDING·TalkBack/VoiceOver·품질 경고·linkPhase≠OK 일 때는 숨기지 않음 |
| 터치하면 다시 표시 | 배경 탭은 보이기/숨기기 전환, 버튼 탭은 타이머 재시작 | 연타해도 `chromeVisible` 하나만 바뀌므로 상태가 꼬이지 않음 |
| 빨간 그라데이션 경고 | 영상 위·컨트롤 아래 층, 4면 그라데이션(GradientDrawable / CAGradientLayer), `clickable=false`·`isUserInteractionEnabled=false`·접근성 무시, 표시 시 1회 알림 | 버튼 조작을 막지 않음 |
| 실제 Agora 데이터 기준 | `worst(local tx/rx, remote tx/rx)` + `onRtcStats` 손실·RTT + `remoteVideoStats.frozenRate`, 약 2초 콜백 그대로(별도 타이머 없음) | 순수 `QualityEvaluator`/`NetworkQualityHysteresis` |
| 자동 해제·흔들림 방지 | 0 은 세지 않음. 4·5·손실 15% 초과·RTT 600ms 초과 **2회 연속(약 4초)이면 표시**. 6·RECONNECTING 은 즉시 표시. 3 이하 **3회 연속(약 6초)이면 해제** | 샘플 시퀀스 단위 테스트 |
| 종료 버튼 접근성·안전 | 종료 버튼 위치 고정, 숨김 상태에서도 Android FGS 알림의 끊기·iOS CallKit 종료는 언제나 사용 가능. 라벨은 「누르면 할 동작」으로 통일(V-7) | — |
| 표시가 연결·종료를 지연시키지 않음 | `onEndTapped` 첫 줄에서 `R.end`/CXEnd 요청, UI 정리는 그다음. `finishIfActive` 는 애니메이션을 기다리지 않음. 모든 타이머는 종료·onDestroy·PiP 진입 때 `removeCallbacks`/`cancel` + alpha 1 복원. **이 커밋은 Runtime·Engine lifecycle·Service 코드 0줄** | UI 커밋 diff 검사(소스 계약: R·E·S 파일 미변경) |

### K-3. 테스트 기반
- Android 는 Robolectric 4.14.1 이 있습니다(`build.gradle:139`). 기존 `NativeVideoCallTerminalCleanupTest` 를 확장합니다.
- iOS 는 **XCTest 타깃이 없습니다.** 순수 로직(`NetworkQualityHysteresis`, `AgoraOfflineDecision`, `VoipTerminalDecision`, `ChromePolicy`)을 분리하고, Agora 의존성 없는 `DibayCallTests` 타깃을 추가합니다(pbxproj 변경이라 같은 네이티브 릴리스에 포함). 기존 vitest 소스 계약 방식도 함께 씁니다.
- 갱신해야 하는 기존 계약 테스트(수정과 같은 커밋):
  - `ios-post-terminal-winner-suppressed-contract.test.ts`
  - `lib/call/__tests__/persistent-call-status-contract.test.ts`(「Option A」)
  - `lib/push/dispatch/__tests__/call-push-provider-policy.test.ts`
  - `scripts/verify-native-video-runtime-contract.cjs`
- HARD LOCK A(`docs/dibay-chat-call-current-normal-hard-lock.md`)의 Native Change Gate 보고는 K-1 표로 갈음합니다.

## L. 친구·채팅 정책 보완 (W2) — 단방향 친구 유지

### L-1. 동작의 의미 정의
| 동작 | 데이터 | 상대방이 아는지 | 메시지·통화 영향 | 되돌리기 |
|---|---|---|---|---|
| 친구 숨김 | `user_relationships` hidden, 내 쪽만 | 모름 | 없음(친구 유지) | 숨김 해제 |
| 친구 삭제 | 내→상대 friend 행만 삭제 | 모름 | 내가 「친구만 통화」 설정이면 상대의 통화가 막힘. 방·메시지는 유지 | 다시 추가 |
| 차단 | `user_social_relations` blocked(한 방향), 차단한 쪽 1:1 방만 숨김(D2), 내 friend 행만 삭제 | 노출 최소화(거부 문구는 일반 문구) | 1:1 메시지·통화 차단. 그룹·상거래 방은 해당 없음(D1) | 해제하면 방 복원, 친구는 자동 복원 안 함 |
| 대화 보관 | `participants.is_archived`, 내 쪽만 | 모름 | 송수신 정상, 새 메시지가 와도 보관 유지 | 복원 |
| 나가기 | 참여 행 삭제(비공개 그룹은 left_at), 메시지 보존 | 그룹·거래는 시스템 표시, 1:1 은 모름 | 나는 접근 불가. 1:1 은 다시 열면 재참여(현행, 보고만) | 다시 대화 |
| 대화 삭제 | **기능 없음**(새 기능이라 범위 밖) | — | — | — |

### L-2. 채팅 종류 × 동작 (서버·UI 가 같은 정책 함수 `resolveMessengerRoomActionPolicy` 사용)
| 동작 | 1:1 | 비공개 그룹 | 오픈그룹 | 거래 | 주문·고객 | 주문·사장님 | 운영 보관 방 |
|---|---|---|---|---|---|---|---|
| 보관·복원 | O | O | — | O | O | O | 복원 숨김 |
| 읽음 | O | O | O | O | O | O | O |
| 나가기 | O | O(방장 자동 위임) | 회원 O / 방장 「위임 후 나가기」 | O(거래 원장 보존) | **진행 중 X**, 완료·취소 후 「목록에서 숨김」 | **항상 X** | 숨김만 |
| 방 메뉴 차단 | O | — | — | 숨김 | 숨김 | 숨김 | — |

- 주문 종료 판정은 `store-order-process-model.ts` 단일 정의만 씁니다(completed/cancelled, 범위를 넓히지 않음).
- 서버 가드는 `leaveMessengerRoomUnified` 에 둡니다. 오류 코드는 `store_owner_cannot_leave`, `store_order_in_progress`, `owner_cannot_leave` 입니다.
- **증빙 보호:** 거래·주문 메시지와 `product_chats` 는 어떤 동작으로도 삭제되지 않습니다(현행 N, 회귀 검증표 R-12).

### L-3. 통화 종료 후 복귀 규칙 (W6·P-7·C-16) — 뒤로가기 기록 보호
- 신규 단일 모듈 `call-return-navigation.ts` 를 둡니다. 기존 복귀 주소 저장 함수 2개를 대체합니다.
  - **R1** 네이티브 소유 통화는 웹 이동 0회입니다(iOS 거절 시 통화 탭으로 튀는 문제 해결).
  - **R2** 웹 진입은 항상 push 1회입니다. tmp→real 교체와 재발신은 통화 엔트리만 replace 합니다.
  - **R3** 통화 화면 마운트 시 `history.state` 에 엔트리 표시를 남깁니다.
  - **R4** 종료 시 표시가 일치하면 `router.back()` 1회만 합니다(관찰 후 push 하는 폴백은 금지 — `history-back-fallback.ts` 에 이중 이동 기록 있음). 아니면 replace(방 또는 채팅 목록)입니다.
  - **R5** 통화 중 뒤로가기는 최소화입니다(통화를 끝내지 않음).
  - **R6** 앞으로 가기로 끝난 통화 화면에 다시 오면 back 또는 replace 입니다.
- **선행 확인(NP):** Next 16 의 `history.state` 병합 동작을 `node_modules/next/dist/docs` 로 확인합니다. 확인되지 않으면 R3 대신 sessionStorage token 만 씁니다.
- **검증:** vitest T1~T17(router 호출·history.state 기록) + Android 하드웨어 back 1회로 목록 복귀 + iOS 원격 거절 후 방 유지(재마운트·스크롤 초기화 없음) + 콜드 수신 후 `/` 유지 + Chrome back 1회.

### L-4. 공통 UI/UX 기준 — 1부 D절을 유지하고 아래를 추가
- 터치 반응: 모든 행·버튼에 `active:` 피드백, 100ms 이내 시각 반응. 진행 중이면 대상만 비활성화합니다.
- 실시간 목록 갱신: 서버 bump·postgres_changes 만 사용합니다(폴링 증가 금지). 재정렬해도 열린 스와이프·스크롤이 유지됩니다(key = roomId).
- 입력창 줄바꿈: 모바일 Enter = 줄바꿈(D3), 1~5줄 자동 확장, 전송 후 1줄로 복귀하고 키보드는 유지합니다.

## M. 웹·DB·네이티브 변경 의존 관계

```
⓪ 기준선 측정(현재 HEAD) ─────────────────────────────────────────────┐
① 웹A ── C-1/C-18, W1, W4(bounded bump·ACK 계약·M-2/3/10~15), F 묶음, P 렌더, A-1, D-1, 보안
   │      (독립. W4 는 seq 없이도 동작: 앵커는 기존 방식으로 대체)
② 웹B ── W2 정책(D1·D2·D5 반영), K-1/2/5/6(D3), C-3/C-17, C-4, C-6★, C-7, C-11★, C-12, C-14,
   │      P-7/C-16 복귀 규칙(마지막), N-7 서버 대상 축소, C-10 웹(reconcile 제거), V-3, V-8
   │      ★ C-6·C-11 은 ④보다 먼저 배포해야 함(네이티브 즉시 재발신 시 서버 busy·웹 idle 경합 방지)
③ DB ─── (승인 후 운영 적용, 각각 하위 호환)
   │      W5: 컬럼·카운터·트리거·after RPC 이중 읽기 → 그다음 웹 앵커 roomSeq 우선(C-9 정렬)
   │      C-8/C-15: append RPC 신규 인자(DEFAULT NULL) → 그다음 웹 stub 서비스가 인자 사용
   │      G-1: actor RPC 버전 추가 → 그다음 웹 호출 교체(구 RPC 는 유지)
   │      F-12: 쓰기 권한 회수(클라이언트 직접 쓰기 0건 확인 완료) — 웹 변경 불필요
④ 네이티브 R1 lifecycle ── N-1+N-2+N-6(같은 커밋) → N-3·V-2·N-5 → N-4 → N-7 네이티브
   │      의존: ② C-6·C-11·N-7 서버. JS 브리지 계약 변경 없음(구 웹·신 바이너리, 신 웹·구 바이너리 모두 호환)
⑤ 네이티브 R2 UI ── V-1, V-4~V-7, 테두리, C-10 iOS 준비 화면
          의존: ④ 의 linkPhase(재연결 중에는 FAB 를 숨기지 않음), ② 의 C-10 capability 게이트가 먼저 배포
```

**호환 원칙:**
- 웹이 앱보다 먼저 배포됩니다. 그래서 모든 웹 변경은 **구 바이너리(Android 1.2.4(9), iOS 1.2(7))** 에서도 동작해야 합니다. 새 네이티브 기능은 capability 확인 뒤에만 씁니다.
- DB 변경은 구 웹 코드에서도 동작해야 합니다(컬럼 nullable, 인자 DEFAULT, 구 RPC 유지).

## N. 기존 정상 기능 회귀 검증표

| # | 보호 대상(1부에서 N 판정) | 위협이 되는 변경 | 검증 |
|---|---|---|---|
| R-1 | 중복 전송 방지(cid UNIQUE·RPC dedupe) | W4 상태 코드 변경, M-12 | U T8·T9, D(중복 cid 0건 조회) |
| R-2 | 서버 전용 bump 발행 계약 | W4, F-9, F-14 | 소스 계약(클라이언트 발행 0) |
| R-3 | 차단 서버 강제 6경로 + 통화 deny_blocked | F-2(상거래 예외) | U(일반 1:1 은 여전히 거부) |
| R-4 | 푸시 억제(음소거·차단·보고 있는 방) | W4 allSettled 병렬화 | U, A(음소거 방 푸시 0) |
| R-5 | 통화 로그·stub 100% 기록, session 유니크 | C-3·C-8·C-15 | D(14일 누락 0 재조회), U |
| R-6 | 정리 크론(ringing·active 잔존 0) | C-6, C-14 | D(잔존 0 재조회) |
| R-7 | 키보드 뷰포트·하단 고정(§7, `1a32cb1b`) | K-2 높이 확장 | `verify:cm-room-keyboard-layout-contract`, A·I |
| R-8 | 타임라인 가상화·목록 가상화(16 이상) | M-2 merge, P-1 | U, 렌더 계측 |
| R-9 | 스와이프 축 잠금(16px·가로 우세)·롱프레스 | W1 | U, A·I |
| R-10 | 그룹 초대·강퇴·퇴장·방장 승계 | G-1, W2 | U |
| R-11 | 이미지·파일 업로드 한도·사진 저장 | W4 bounded bump | A·I(이미지 10장·파일 15MB 전송) |
| R-12 | 거래·주문 증빙 보존(메시지·product_chats) | W2 나가기 | U, D(나가기 후 메시지 수 불변) |
| R-13 | 주문 상태·채팅 단계 단일 정의(`store-order-process-model.ts`), 수수료 DB 트리거 | W2 주문 종료 판정 | 소스 계약(판정 함수 재사용), 수수료 코드 미변경 diff |
| R-14 | `/market` 목록 불변조건 | (영향 없어야 함) | diff 범위 확인 |
| R-15 | 수신 통화: Android FSI·IncomingCallActivity, iOS CallKit 수락 경로 | N-7, N-1 | A·I(잠금·백그라운드·앱 종료 상태 수신 각 3회) |
| R-16 | 벨소리·링백 소유권(callId 확인 정상) | N-1 | A·I |
| R-17 | heartbeat 양쪽 기록·한쪽 stale 시 유지 | N-3, C-14 | A·I(한쪽 Wi-Fi 끊김 30초 → 통화 유지) |
| R-18 | PiP·dock·작업 뒤로(Android) | V-1, N-2 | A·I(PiP 진입·종료) |
| R-19 | 음소거·카메라 전환·스피커 | V-1 숨김 | A·I |
| R-20 | 읽음 양방향(read-ack + participants) | M-5 재구독 변경 | A·I(읽음 표시 1초 이내) |
| R-21 | 메신저 진입·방 열기 성능 | 전 단계 | ⓪ 기준선 대비 p50/p95 악화 없음 |

## O. Android / iPhone 실기기 검증 프롬프트 (단계별)

**공통:**
- 시작 전에 운영 `public.user_devices.app_version` 으로 설치 빌드를 확인합니다(구 바이너리면 결과 무효).
- 기록 형식: 기기·버전·계정 A/B·단계·기대·실제·PASS/FAIL/NP·증거(logcat CORR·화면·DB).

**Android(Cursor 실행: Samsung 폰 = A, Xiaomi 태블릿 = B)**
- **①②단계(웹):** 1부 F절 T-L1~L5, T-M1~M4, T-K1~K3, T-F1~F2, T-C1·C2·C4 에 아래를 추가합니다.
  - T-M5: B 앱을 백그라운드로 보내고 2초 뒤 복귀 → A 가 그사이 보낸 메시지가 새로고침 없이 보이는지
  - T-M6: A 비행기 모드에서 전송 → 「전송 실패」 + 재전송 → 1건만 도착
  - T-C5: A 가 이미 통화 중일 때 B 가 A 에게 발신 → B 타임라인에 「상대방 통화 중」, A 타임라인에 「부재중」. 앱 재시작 뒤에도 유지
  - T-N1: 방 → 발신 → 종료 → 하드웨어 back 1회로 목록
- **④단계(R1):**
  - T-C3: 느린 망에서 영상 종료 → 즉시 재발신 ×5
  - 영상↔음성 연속 통화
  - 재발신 후 잠금 30초
  - Wi-Fi 10초 off → 회복 / 상대 강제 종료 → 약 35초 안에 종료
  - logcat 에서 `idempotent_skip|skip_foreign` 확인
- **⑤단계(R2):**
  - T-V1: FAB 5초 숨김·탭 표시·TalkBack 이면 숨기지 않음
  - T-V2: 대역폭 제한 → 약 4초 뒤 테두리, 복구 → 약 6초 뒤 해제, 테두리 위 버튼 동작

**iPhone 14 Pro Max(Owner 조작, 짧은 프롬프트)** — ④ 이후 P-1~P-6, P-9·P-10, ⑤ 이후 P-7·P-8·P-11
- P-1 「삼성에서 영상통화 → iPhone 에서 수락 → 10초 뒤 iPhone 앱의 종료 버튼. 삼성 화면에서 내 영상·소리가 1초 안에 멈췄나요?」
- P-2 「잠금 상태에서 통화 → 잠금화면에서 종료. 1초 안에 상대 화면이 끝났나요?」
- P-3 「종료 직후 2초 안에 같은 사람에게 다시 영상통화 ×5. 매번 영상·소리가 정상인가요?」
- P-4 「음성 종료 → 바로 영상 발신, 영상 종료 → 바로 음성 발신. 둘 다 정상인가요?」
- P-5 「통화 중 삼성 Wi-Fi 를 10초 껐다 켜기. iPhone 이 '재연결 중' 후 통화를 유지하나요? 20초 이상 끄면 종료되나요?」
- P-6 「통화가 끝난 뒤 iPhone 채팅방·대화 목록·통화 탭에 기록이 새로고침 없이 보이나요? 거절당한 경우 iPhone 이 채팅방에 그대로 있나요?」
- P-7 「영상 연결 후 5초 손대지 않기 → 오른쪽 버튼이 사라지나요? 이름·상태는 보이나요? 한 번 탭하면 다시 보이나요?」
- P-8 「설정에서 네트워크 링크 컨디셔너를 3G·고손실로 → 4초 안에 빨간 테두리가 뜨고, 해제하면 6초 안에 사라지나요? 테두리가 있어도 버튼이 눌리나요?」
- P-9 「iPhone 앱을 완전히 종료한 상태에서 삼성이 전화 → 삼성이 바로 취소 ×5. CallKit 이 1초 안에 사라지고, 다음 전화가 정상으로 울리나요?」
- P-10 「65분 통화 1회(충전 중). 끊기지 않나요?」
- P-11 「영상 발신 버튼 → 바로 '연결 준비 중' 화면이 뜨나요? 취소하면 삼성 쪽 벨이 멈추나요?」
- (웹 단계 공통) 1부 F절 iPhone 프롬프트 5·7·8(차단·입력창·스와이프)

> 코드 테스트 PASS 를 실기기 PASS 로 대신하지 않습니다. FAIL 이 나오면 해당 결함 ID 의 설계로 돌아가 원인을 다시 분석하고, 같은 단계 안에서 수정합니다.

## P. Owner 정책 결정 필요 사항 (나머지는 규정·설계로 정함)

| # | 결정 | 권장 | 선택하지 않을 경우 |
|---|---|---|---|
| D1 | 차단을 거래·주문 채팅에도 적용하는지 | **일반 1:1 에만 적용**(상거래 소통·증빙 보호) | 현행: 상거래 방도 송신 불가 |
| D2 | 차단할 때 상대 1:1 방도 숨기는지 | **차단한 쪽만 숨김**(차단 사실 비노출) | 현행: 양쪽 숨김 |
| D3 | 모바일 Enter = 줄바꿈 | **적용**(데스크톱은 Enter 전송) | 현행: 모바일도 Enter 전송 |
| D4 | 상대 통화 중(busy) 기록을 수신자에게도 「부재중」으로 보일지 | **보임**(카카오톡과 같음, 푸시·벨은 없음, unread +1) | 발신자에게만 기록 |
| D5 | 오픈그룹 강퇴·영구차단(G-3, 새 기능) | Owner 선택. 결함 개선과 분리해 별도 작업 | 보고만 |
| D6 | DB 마이그레이션 4건 운영 적용(W5 seq, C-8/C-15 RPC, G-1 RPC, F-12 권한 회수) | ③ 단계에서 하나씩 승인 | ③ 단계 보류 |
| D7 | 네이티브 2회 빌드(R1 lifecycle, R2 UI) 실기기 설치. 스토어 업로드·출시는 별도 승인 | 2회로 분리(회귀 원인 구분) | 1회로 묶음(회귀 원인 구분이 어려움) |

이미 정해진 사항(다시 묻지 않음):
- 단방향 친구 유지, FAB 5초, 스와이프 5초 자동 닫힘
- 진행 중 주문·사장님 나가기 불가, 거래 증빙 보존
- 품질 경고 기준값, 유예 15초·30초
- 토큰은 갱신 구현으로 해결(env 상향은 완료 조건이 아님)
- N-7 정책 준수 방식, C-3 영구 기록 방식(안 B)

## Q. 수정 우선순위와 안전한 통합 구현 순서

| 단계 | 내용 | 반영 | 통과 조건(다음 단계 진입) |
|---|---|---|---|
| ⓪ | 기준선 측정: J절 통화 T0~T12·R1·R2, 메신저 성능 3회. 코드 변경 없음 | — | 측정 CSV |
| ① 웹A | 데이터 유실·무한 렌더·체감 결함 먼저: C-1/C-18 → W4(M-1·M-2·M-3·M-8~M-15) → W1(L-1~L-5·L-10·L-11) → F 묶음 → K-3·K-4·K-7 → P-1·P-2·P-3·P-5 → A-1·D-1·S-1·S-2·X-2·G-2·G-4 | 로컬 검증 → main 1회 | U 전체 PASS + Android ①항목 + iPhone 웹 프롬프트 + R-1~R-4·R-7~R-9·R-11·R-20 |
| ② 웹B | D1~D4 반영: W2 → K-1·K-2·K-5·K-6 → C-7 → C-11 → C-4 → C-6 → C-3·C-17 → C-12 → C-14 → N-7 서버 → C-10 웹 → V-3·V-8·X-1·P-4·P-6·A-2·D-2 → **P-7/C-16 복귀 규칙(마지막)** | main 1회 | ① 과 같음 + T-C5·T-N1·R-5·R-6·R-12·R-13 |
| ③ DB | W5 → C-8/C-15 → G-1 → F-12 (D6 승인 후 하나씩 적용 → 결과 조회) + 웹 후속(roomSeq 앵커·C-9·stub 인자·G-1 호출) | 마이그레이션 파일 커밋 + 운영 적용 결과 D 조회 | D 조회 + 연속·동시 송신 E2E + R-1·R-5 |
| ④ 네이티브 R1 | N-1+N-2+N-6 → N-3·V-2·N-5 → N-4 → N-7 네이티브. `native:prepare` → APK·iOS 빌드 → 설치 확인 | 빌드 번호 +1(Android 10 / iOS 8 예정) | Robolectric + 소스 계약 + Android ④항목 + iPhone P-1~P-6·P-9·P-10 + R-15~R-18 |
| ⑤ 네이티브 R2 | V-1·V-4~V-7·테두리 → C-10 iOS 준비 화면 | 빌드 +1 | Android ⑤항목 + iPhone P-7·P-8·P-11 + R-18·R-19 |
| ⑥ 최종 판정 | 전 단계 실기기 매트릭스 재실행, ⓪ 대비 성능 비교(R-21), 잔여 결함 목록 | — | 아래 완료 기준 |

**최종 완료 기준(결함 수가 아니라 동작 증명):**
1. 1부 F절과 2부 O절의 Android·iPhone 실기기 항목이 모두 PASS(NP 0, 또는 사유와 Owner 확인 기록).
2. 회귀 검증표 R-1~R-21 이 모두 PASS.
3. 메시지·통화 기록이 새로고침 없이 반영됨을 실기기 로그·화면으로 증명.
4. 통화 진입·종료·복귀 지연이 ⓪ 기준선보다 개선됐고, 그 수치가 있음.
5. 단계마다 로컬 검증 PASS / Production 반영 SHA / 실기기 PASS 를 구분해 보고.

**위험이 높은 순서:** ④ 네이티브 lifecycle(높음) > ③ W5 seq(높음, 롤백은 트리거 DROP) > ② 복귀 규칙·W2(중간) > ① W4 ACK 계약(중간) > 나머지(낮음).

## R. 2부 요약 수치

| 항목 | 값 |
|---|---|
| 결함(대응표 대상) | **98** = 1부 88 + 신규 10 (M-10~M-15, C-15~C-18) / 확정 81 · 의심 17 |
| 판정 변경 | 3건(N-1·V-6·N-7, S→C) / 1부 내용 정정 6건(N-2 음성 포함·N-6 표현·N-7 완화책 철회·P-7 원인·C-3 CHECK 불필요·RECONNECTING 시간 표시) |
| 웹 / DB / 네이티브 | 78 / 5 / 13 (C-10 은 웹에 포함, iOS 공동) · 보고만 1 · 선택 1 |
| 실기기 검증 항목 | Android ①② 21 + ④ 6 + ⑤ 2 / iPhone 11 + 웹 공통 3 |
| 회귀 보호 항목 | 21 (R-1~R-21) |
| Owner 결정 | 7 (D1~D7) |
| 예상 회귀 위험 | 웹 중간 · DB 높음(트리거 DROP 으로 즉시 롤백) · 네이티브 높음(lifecycle·UI 빌드 분리, 단일 커밋 revert) |
| NOT_PROVEN 잔여 | Next 16 history.state 병합 동작, 같은 UUID 재보고의 PushKit 준수 인정 여부, Agora 엔진의 lane 간 공유, 운영 토큰 TTL env, send_text 락 비용, 운영 V4 lane 플래그 |

---
---

# 3부 — Owner 확정 정책·통화 상태 머신·경고 팝업 (2026-10-21 v3, 구현 기준)

## S. Owner 확정 (다시 묻지 않음)
| # | 확정 |
|---|---|
| D1 | 차단은 일반 1:1 에만. 주문·거래 업무 채팅은 유지(기존 권한·보안 정책은 우회하지 않음) |
| D2 | 차단 시 **차단한 사용자 쪽** 채팅방만 숨김 |
| D3 | 모바일 Enter = 줄바꿈, 전송은 버튼. 데스크톱은 기존 동작 |
| D4 | 상대 통화 중(busy)은 **영구 기록**. 표시는 「통화 중」(부재중 아님). 수신자 벨·푸시 없음 |
| D5 | 오픈그룹 강퇴·차단 신규 기능은 이번 범위 제외 |
| D6 | DB 마이그레이션 4건: 단계별 영향 검증 후, **운영 적용마다 Owner 별도 명시 승인** |
| D7 | 네이티브 lifecycle / UI 분리, 단계별 검증 통과 후 다음 단계 |
| 반영 | **Owner 승인 없이 main 병합·Production 배포·운영 DB 적용·네이티브 릴리스 금지** → 구현 커밋은 작업 브랜치에만 푸시 |

## T. 통화 상태 머신 (12상태 · 기존 DB 상태값 재사용, 신규 DB status 없음)

**기존 계층(CUT3, `call-terminal-reason-authority.ts`):**
- DB `status`: 6값(ringing·active·ended·rejected·missed·cancelled). CHECK 제약이 있어 늘리지 않습니다.
- DB `ended_reason`: 자유 텍스트 wire 값.
- canonical reason: 11종.
- 표시: `call-event-presentation.ts` 가 담당합니다.

이번에 canonical 에 **`unreachable` 1종만 추가**합니다. 이는 표시 계층용 분류일 뿐이고, DB status 는 `missed` 그대로 씁니다.

| # | 상태 | DB status / ended_reason(wire) | canonical | 발신자 표시(팝업) | 수신자 처리 | CallKit / Android 수신 | Agora | 통화 기록·채팅 stub | 알림·푸시 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 발신자 연결 전 취소 | cancelled / `canceled` | caller_cancelled | 「통화 취소」(팝업 없음 — 본인 조작) | 벨·수신 화면 즉시 종료 | iOS `reportCall(ended,.remoteEnded)` / FSI·벨 해제(`call_ended` VoIP·FCM) | join 전이면 없음 | 양쪽 「취소」(제품 결정 2026-10-16, 양쪽 동일) | 수신자 부재중 푸시 없음 |
| 2 | 수신자 거절 | rejected / `declined` | callee_rejected | **팝업** 「상대방이 통화를 거절했습니다」 [닫기][다시 걸기] | 수신 화면 종료 | CXEnd(로컬) / FSI 해제 | 없음 | 양쪽 「거절」 | 없음 |
| 3 | 상대방이 이미 통화 중 | **세션 행 없음** → `call_logs` status `cancelled` + `ended_reason='peer_busy'` + stub `busy:<uuid>` (C-3·C-17) | busy | **팝업** 「상대방이 통화 중입니다」 [닫기][다시 걸기] | **기존 통화 유지**, 벨·푸시·CallKit 없음 | 없음(VoIP 미발송) | 없음 | 양쪽 「통화 중」(D4, 부재중 아님), 수신자 unread +1 | 없음 |
| 4 | 상대방 미접속·연결 불가 | missed / `unreachable` | **unreachable(신규)** | **팝업** 「상대방에게 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.」 [닫기][다시 걸기] | 전달된 기기가 있으면 #5 와 같음 | — | 없음 | 양쪽 「연결할 수 없음」 | 없음 |
| 5 | 수신자 무응답 | missed / `missed` | missed_timeout | **팝업** 「상대방이 응답하지 않습니다」 [닫기][다시 걸기] | 벨 종료 + 부재중 기록 | iOS `reportCall(ended,.unanswered)` / FSI 해제 | 없음 | 양쪽 「부재중」 | 수신자 부재중 알림 1회(C-7 keepAlive) |
| 6 | 연결 중 실패 | ended / `failed_*` (setup·network·ice·signaling·permission) | failed_setup·failed_network | **팝업** 「통화 연결에 실패했습니다」 [닫기][다시 걸기]. 권한은 「마이크·카메라 권한이 필요합니다」 [설정][닫기] | 실제 세션 상태로 정리(서버 terminal 수신 → 화면 종료) | CallKit `.failed` / FSI 해제 | leave(callId 범위) | 「연결 실패」 | 없음 |
| 7 | 연결 완료 | active | — | 통화 화면 「통화 중」 + 시간 | 동일 | CallKit connected | joined | — | — |
| 8 | 통화 중 일시적 네트워크 악화 | active 유지 | — | **팝업 없음** — 상태 문구 「연결 상태가 좋지 않습니다」 + 빨간 테두리 | 상대도 자기 품질 기준으로 표시 | 변경 없음 | 연결 유지 | — | — |
| 9 | 재연결 중 | active 유지 | — | **팝업 없음** — 「재연결 중…」(내 쪽 RECONNECTING, 유예 30초) / 「상대방 연결이 불안정합니다」(상대 DROPPED, 유예 15초). 통화 시간은 계속 흐름 | 동일 규칙 | 변경 없음 | RECONNECTING | — | — |
| 10 | 재연결 실패 | ended / `peer_dropped`·`link_lost`·`heartbeat_timeout` | disconnected | **팝업** 「통화 연결이 끊어졌습니다」 [닫기][다시 걸기] | 같은 팝업 + 기록 반영 | `reportCall(ended,.failed)` / FGS 종료 | leave | 「연결 끊김」(통화 시간 포함) | 없음 |
| 11 | 정상 종료 | ended / `ended_by_caller`·`ended_by_callee` | ended_by_* | 팝업 없음(화면 닫힘) | 화면 닫힘 | CXEnd(로컬) 또는 `.remoteEnded` | leave 즉시(N-2) | 「통화 시간 mm:ss」 | 없음 |
| 12 | 비정상 종료(앱 강제 종료·기기 꺼짐·서버 정리) | ended / `heartbeat_timeout`·`reconcile_stale_active` | disconnected | 다음 실행 때 팝업 없음, 기록만 | 상대: #10 과 같음 | 정리 | — | 「연결 끊김」 | 없음 |

**구분 규칙**
- **취소 vs 거절:** 종료 주체(caller cancel / callee reject)는 서버 PATCH 의 actor 로 정하고, 클라이언트 문구로 추정하지 않습니다.
- **busy vs 부재중:** busy 는 세션을 만들기 전 서버 게이트에서 판정합니다(`peer_busy`). 부재중은 링잉 세션이 마감 시각에 도달한 경우입니다. 수신자에게 벨·푸시가 간 적이 없으므로 busy 를 부재중으로 표시하지 않습니다.
- **미접속(unreachable) vs 무응답(missed) — 증거가 있을 때만 미접속으로 판정:**
  - (a) 서버 incoming dispatch 결과 **전달 가능한 기기가 0대**: 등록 토큰 없음, 또는 모든 기기에서 영구 실패(`notification_deliveries`·VoIP dispatch 결과)
  - (b) 그리고 링잉 기간 동안 **수신 기기가 수신을 확인한 신호(ring ack·presence)가 없음**
  - 둘 다 성립하면 `unreachable`, 하나라도 불확실하면 **`missed`(무응답)**. 증거는 서버만 판정하고, 클라이언트는 결과만 표시합니다.
- **늦은 이벤트:** 모든 terminal 처리·팝업은 **callId 가 현재 통화와 같을 때만** 실행합니다. 이미 끝난 callId 의 이벤트는 기록만 갱신하고 화면·팝업은 띄우지 않습니다.

## U. 통화 경고 팝업 통일 기준

**현재 상태:**
- 웹: `call-in-app-notice-store` + `CallInAppNoticeBanner`(상단 배너, 자동 소멸)
- 네이티브: `NativeCallInAppNoticeOverlay.java` / `NativeCallInAppNotice.swift`(같은 계약의 네이티브 배너)
- 일부 경로는 `alertOutgoingCallFailure`·스낵바

**변경:** 중요한 통화 실패(T절 팝업 표시 행: #2·#3·#4·#5·#6·#10)는 **중앙 공통 경고 팝업**으로 통일합니다. 진행·경고(#8·#9)와 정상 종료(#11)는 팝업을 띄우지 않습니다.

| 요소 | 규칙 |
|---|---|
| 구성 | 상태별 아이콘(거절·통화 중 = 전화 끊김, 무응답·연결 불가 = 사람+시계, 실패·끊김 = 경고 삼각형, 권한 = 방패) · 제목 · 설명 · [닫기] · 재시도 가능하면 [다시 걸기](primary) |
| 문구(제목 / 설명) | 거절 「통화 거절」/「상대방이 통화를 거절했습니다.」 · 통화 중 「상대방 통화 중」/「상대방이 통화 중입니다. 잠시 후 다시 걸어 주세요.」 · 무응답 「응답 없음」/「상대방이 응답하지 않습니다.」 · 연결 불가 「통화 연결 실패」/「상대방에게 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.」 · 실패 「통화 연결 실패」/「통화 연결에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.」 · 끊김 「통화 종료」/「통화 연결이 끊어졌습니다.」 · 권한 「권한 필요」/「마이크·카메라 권한이 필요합니다.」[설정 열기] |
| 다시 걸기 | 무응답·통화 중·연결 불가·실패·끊김·거절에서 노출(거절은 [다시 걸기] 를 보조 버튼으로) |
| 중복 금지 | 같은 callId + 같은 종류는 1회만 표시. 다른 종류는 우선순위(실패 > 거절·통화 중 > 무응답)가 높을 때만 교체 |
| callId 검증 | 팝업 입력에 callId 필수. 「이미 닫힌 callId」 집합과 「현재 통화 callId」를 확인해 늦은 이벤트는 무시 |
| 닫기 | 닫아도 세션·화면을 다시 활성화하지 않음(팝업은 표시 전용 상태, 통화 store 는 이미 idle) |
| 재시도 | [다시 걸기]는 이전 세션 정리 완료(엔진 idle·`canStartNewCall`·cleanup 프라미스 완료)를 기다린 뒤 발신. 최대 대기 3초, 넘으면 실패 팝업 대신 버튼만 다시 활성화 |
| 뒤로가기·화면 전환 | Android 하드웨어 뒤로가기는 팝업만 닫음(overlay back stack). 라우트가 바뀌면 자동으로 닫음. 팝업이 열려 있어도 아래 화면 이동을 막지 않음(모달은 포커스만 가짐) |
| 스타일 | 공통 Dibay 다이얼로그 토큰(오버레이 반경 계약 `--overlay-radius-*`, `Sam.btn.primary/secondary`). Android·iOS 네이티브 오버레이는 ⑤ 단계에서 같은 문구·버튼·색으로 맞춤 |
| 비대체 | OS 권한 팝업, CallKit 시스템 UI, Android FSI 시스템 UI 는 대체하지 않음 |
| 비반복 | 네트워크 저하·재연결은 모달을 쓰지 않음(테두리 + 상태 문구) |

**구현 위치:**
- ② 웹: `call-in-app-notice-contract.ts` 에 `presentation:"DIALOG"`·제목 키·재시도 여부를 추가하고, `call-in-app-notice-store` 에 callId 바인딩·「닫힌 callId」 집합을 넣습니다. `CallAlertDialog` 렌더러를 추가해 기존 배너를 대체합니다(진행·경고는 배너 유지).
- ⑤ 네이티브: Android `NativeCallInAppNoticeOverlay`, iOS `NativeCallInAppNotice` 를 같은 계약의 중앙 팝업으로 바꿉니다.

---
---

# 4부 — 구현 결과 (⓪~③ · 2026-10-21 v4)

> 작업 브랜치 `claude/keen-ramanujan-1iwx5z` 에만 커밋했습니다. **main 병합·Production 배포·운영 DB 적용·네이티브 릴리스는 하지 않았습니다**(Owner 별도 승인 대상).
> `[배포 구분]` 웹(+DB 마이그레이션 파일). 네이티브 파일 변경은 없습니다(`verify:native-version-bump` PASS, Android 1.2.4(9) / iOS 1.2(7) 그대로).

## V. 단계별 결과

| 단계 | 상태 | 근거 |
|---|---|---|
| ⓪ 기준선 | 일부 측정 | **운영 DB 기준선(최근 30일, 읽기 전용)**:<br>· 정상 종료 응답 p50 6.4~7.5초 · 통화 p50 14~45초 · 기록 지연 p95 0.2~0.35초<br>· `heartbeat_timeout` 4건(평균 234초 — 상대가 끊긴 뒤에도 「통화 중」 유지)<br>· `failed_*`·`peer_dropped` 0건(사유가 기록되지 않음)<br>· 최근 14일 로그·stub 누락 0<br>**코드 기준선**: 메신저·통화·푸시 vitest 524개 파일 / 3,196개 테스트 PASS<br>**런타임 성능(J절 T0~T12·메신저 parity 측정)**: 이 환경에서는 운영 주소·테스트 계정에 접근할 수 없어 **NOT_PROVEN** → Cursor 가 실기기·운영에서 수집해야 함 |
| ① 웹A | **완료** | C-1·C-2·C-18, L-1~L-5·L-10·L-11, M-1~M-3·M-5~M-15, F-1~F-14(F-12 는 ③), K-1~K-7, P-1~P-3·P-5, A-1, D-1, S-1·S-2, X-2, G-2. G-4 는 HEAD 에서 이미 해소(재검증 테스트 추가) |
| ② 웹B | **핵심 완료** | W2(L-6·L-7·L-9, D1·D2), 통화 상태 머신(3부 T절)·중앙 경고 팝업(U절), C-3·C-17(D4), 미접속 증거 판정(#4), C-4·C-7·C-10(웹)·C-11·C-16(R1). C-6 은 HEAD 에서 이미 해소(peer reconcile) |
| ③ DB | **파일 준비 + 로컬 검증 완료 · 운영 적용 대기** | 마이그레이션 4건(W절). 운영 적용은 **건별 Owner 명시 승인 후** |
| ④ 네이티브 lifecycle | 미착수 | ③·② 배포 후. 재빌드·실기기 필요 |
| ⑤ 네이티브 UI | 미착수 | ④ 통과 후 |

## W. ③ DB 마이그레이션 (운영 적용 전 영향 검증)

**검증 방법:**
- 로컬 PostgreSQL 16 임시 클러스터를 썼습니다. 테스트 DB(`dibay-test`·`dibay-reset-qa`)는 쓰지 않았고 운영에도 적용하지 않았습니다.
- 운영의 `pg_get_functiondef` 원문을 그대로 옮겨 재현했습니다. 운영 md5 와 **완전히 일치**합니다(after `1936cf18…`, append `df6b2a01…`).
- 그 위에 4건을 순서대로 적용한 뒤 시나리오를 실행했습니다.

| 파일 | 내용 | 로컬 검증 결과 | 롤백 |
|---|---|---|---|
| `20270607120000_cm_friend_graph_tables_server_only_write.sql` (F-12) | 친구·숨김·즐겨찾기 3개 테이블의 anon/authenticated 쓰기 권한 회수, SELECT 는 유지 | SELECT 유지, INSERT·UPDATE·DELETE 거부 확인. 앱 쓰기는 전부 service_role(클라이언트 직접 쓰기 0건 grep 확인) | GRANT 재부여 |
| `…120100_cm_group_owner_transfer_as_actor.sql` (G-1) | actor 를 명시 인자로 받는 위임 RPC(방 행 FOR UPDATE, 대상은 활성 멤버만). 구 RPC 는 그대로 유지 | 비방장 → `forbidden`, 나간 멤버에게 위임 → `target_not_found`, 정상 위임 → 역할·owner 갱신, authenticated 실행 불가·service_role 만 실행 가능 | DROP FUNCTION(웹은 구 RPC 로 자동 폴백) |
| `…120200_cm_append_room_message_forward_only_tip.sql` (C-8) | append RPC 의 방 UPDATE **1문장만** forward-only 로 교체. **md5 가드**로 본문이 바뀌었으면 중단 | 과거 시각 call_stub 이 들어와도 최신 미리보기·시각 유지, 새 메시지는 정상 갱신. 이미 바뀐 본문에 재실행하면 가드가 중단 | 같은 방식으로 1문장 되돌림 |
| `…120300_cm_messages_room_seq.sql` (W5·M-4) | `room_seq` 컬럼 + 방별 카운터 + BEFORE INSERT 트리거 + after RPC 이중 읽기(md5 가드). **백필 없음** | 커밋 순서대로 seq 부여. 늦게 커밋된 「과거 시각」 메시지도 after 가 반환(**기존 keyset 은 누락**). 옛 행(seq NULL) 앵커 정상. 비참여자·없는 앵커는 0행. 롤백된 INSERT 는 번호를 쓰지 않음. **동시 2세션 405건 → 405개 고유·연속 seq, 데드락 0** | `DROP TRIGGER cm_messages_zz_assign_room_seq` |

**운영 적용 순서(승인 시):** F-12 → G-1 → C-8 → W5. 각 단계 직후 확인 SQL:
- F-12: `has_table_privilege('authenticated','public.user_social_relations','insert') = false`
- G-1: 함수 존재·권한 확인. 방장 위임 실기기 1회
- C-8: `md5(pg_get_functiondef(...))` 변경 확인. 통화 종료 후 목록 미리보기·시각 확인
- W5: `select count(*) filter (where room_seq is not null) from community_messenger_messages where created_at > <적용시각>` = 신규 행 수. 연속 송신 E2E
- W5 적용 후 웹의 after 호출은 그대로이고, 서버가 앵커의 seq 를 자동으로 사용합니다.

## X. 자동 검증 (최종 트리, 로컬 1회)

| 검사 | 결과 |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | **exit 0** |
| vitest — 메신저·통화·정책·푸시·소셜·채팅도메인·스토어·i18n·알림·거래·채팅·컴포넌트 | **1,123개 파일 / 7,895개 테스트 PASS** (skip 1, todo 6) |
| eslint (변경 TS/TSX 119개) | **error 0** (warning 815, 대부분 기존) |
| `verify:cm-room-keyboard-layout-contract` | OK |
| `verify:routes` | OK |
| `verify:native-version-bump` | PASS — 웹만 |
| `"use client"` 파일의 서버 전용 모듈 import | 0건 |
| 신규·갱신 테스트 | 30개 이상 파일(통화 기록 seed·스와이프 닫힘·ACK 계약·bounded bump·pending 보존·통화 팝업·상태 머신·W2 정책·R1 이동·친구/차단·입력창·성능·보안) |

## Y. 남은 항목 (다음 단계로 이관)

| 항목 | 단계 | 이유 |
|---|---|---|
| N-1~N-6, V-1·V-2·V-4~V-7, 빨간 테두리, C-10 iOS 준비 화면 | ④·⑤ | 네이티브 재빌드·실기기 필요(2부 K절 설계 그대로) |
| N-7 서버(VoIP 종료 푸시 대상 축소) | ④(네이티브와 함께) | 단독으로 배포하면 기기를 잘못 빼 CallKit 화면이 닫히지 않는 「유령 벨」 위험이 있음 → 네이티브 「모든 분기 CallKit 보고」와 같은 릴리스로 |
| P-7(push 로 진입한 경로의 「뒤로 두 번」), C-12, C-14, V-3, V-8, X-1, P-4, P-6, A-2, D-2 | ② 후속 | 비차단 품질 항목. P-7 은 Next 16 history 동작 확인(NP)이 먼저 필요 |
| 통화 경고 팝업의 네이티브 화면 버전 | ⑤ | 앱 통화 화면은 네이티브 오버레이가 표시함(웹 팝업은 웹이 처리하는 흐름에서만) |
| `user_social_relations` DELETE 이벤트가 PK 만 전달(replica identity default) | 보고 | 다른 기기에서 친구를 삭제하면 열린 방이 즉시 반응하지 않음(같은 탭은 bus 로 반영). FULL 로 바꾸는 것은 DB 변경이라 별도 승인 |
| 차단 시 거래·주문 방의 **통화** 차단 | 보고(현행 유지) | D1 은 메시지 업무 채팅 유지 범위. 통화 게이트는 양방향 차단을 그대로 유지(보안 정책 우회 금지) |
| 거래 채팅 입력창도 자동 높이 확장 적용 | 보고 | 공용 컴포넌트라 함께 적용됨. Enter 동작은 변경 없음 |

## Z. 실기기 검증 필요 (웹 ①② 배포 후 · 2부 O절 프롬프트)
- **Android(Cursor):** T-L1~L5, T-M1~M6, T-K1~K3, T-F1~F2, T-C1·C2·C4·C5, T-N1.
- **iPhone(Owner):** 1부 F절 5·7·8, 2부 O절 P-6.
- **추가 확인 항목:**
  - 발신 → 상대 통화 중 → 「상대방 통화 중」 팝업, 양쪽 「통화 중」 기록이 재시작 뒤에도 유지
  - 무응답 → 「응답 없음」 팝업
  - 앱이 없는 계정(푸시 기기 0)에 발신 → 「연결할 수 없습니다」
  - 진행 중 주문 채팅 스와이프 → 나가기 없음

## W2. W5(room_seq) 고위험 추가 검증 (2026-10-22, Owner 지시 3번)

**환경:**
- 로컬 PostgreSQL 16 임시 클러스터(`wal_level=logical`). 테스트 DB 와 운영 DB 는 쓰지 않았습니다.
- 운영 함수 원문을 md5 까지 일치하게 재현했습니다.
- **운영과 같은 규모의 합성 데이터**를 만들었습니다:

| 항목 | 값 |
|---|---|
| 방 | 1,523개 |
| 메시지가 있는 방 | 1,285개 |
| 메시지 | 18,800건(최대 방 4,108건) |
| 같은 시각 그룹 | 있음 |
| soft-delete | 4건 |
| publication | messages·rooms·participants |

**운영 사실(읽기 전용):**
- publication 은 `FOR ALL TABLES` 가 아닙니다 → 새 카운터 테이블은 자동으로 포함되지 않습니다.
- 같은 시각 그룹 1개, soft-delete 4건이 있습니다.
- 방당 분당 최대 8건이라 락 경합은 무시할 수 있는 수준입니다.

**검증 중 발견해 수정한 결함:** 처음 수정본(NULL 앵커를 keyset 만으로 처리)은 기존→seq 경계를 넘는 페이지 넘김에서 **중복 47건·누락 3건**을 만들었습니다(V4 초기 실행: 164건 반환 / 고유 117건 / 기대 120건).

**→ 최종 설계: 전체 순서(total order) 하나로 정의**
- 순서: [seq 없는 기존 행: (created_at, id) 순] → [seq 행: room_seq 순]
- 「앵커 이후」= 이 순서에서 앵커보다 뒤에 있는 행
- 결과: 페이지를 넘겨도 중복·누락이 없습니다.

| # | 확인 | 결과 |
|---|---|---|
| V1 | 기존 18,800건 미변경(백필 없음) | seq 0건 — PASS |
| V2 | 기존 행 앵커 400개: 신규 after() 결과 == 기존 after() 결과(ids·순서) | 400/400 동일 — PASS |
| V3 | 모든 INSERT 경로에 seq 부여 — TS 직접 INSERT 6곳(트리거로 일괄) + DB 함수 3개(send_text·append·gift_certificate_offer, 운영 전수 확인) | 120건 → seq 1..120, 고유 120 — PASS |
| V4a | 재연결: 마지막 기존 행부터 limit 50 으로 끝까지 페이지 넘김 | 120건 / 고유 120건 = 기대 120건 — PASS |
| V4b | seq 중간(40)부터 페이지 넘김 | 80 / 80 — PASS |
| V4c | 오래된 기존 행부터(기존 4,105건 + 신규 120건) | 4,225 / 4,225 = 기대 — PASS |
| V5 | 늦게 커밋된 과거 시각 call_stub 이 시간상 더 새 앵커 뒤에도 반환됨(기존 keyset 은 누락) | 9 / 9 — PASS |
| V6 | Realtime: 카운터 테이블은 publication 에 없음. INSERT 1건 = messages INSERT 이벤트 1건(추가 UPDATE 0건) | PASS(카운터 변경은 WAL 에는 있으나 미발행) |
| (1차) | 동시 2세션 405건: seq 고유·연속, 데드락 0 / 롤백된 INSERT 는 번호를 쓰지 않음 | PASS |
| V7 | **롤백** — 「트리거 제거만」은 **불충분**: 이후 신규 행(seq NULL)이 전체 순서에서 seq 행보다 앞에 놓여 seq 앵커 따라잡기에서 누락 → `supabase/rollback/20270607120300_cm_messages_room_seq_rollback.sql`(트리거 제거 + after 원본 복원을 한 TX 로) 로만 롤백 | 원본 md5 복원 ✓, 롤백 후 INSERT(직접·RPC) 정상 ✓, 이전 seq 앵커에서 롤백 후 신규 행 도달(121/121, 신규 2건 포함) ✓, 기존 방 앵커 308/308 동일 ✓ — PASS |
| 기타 | 마이그레이션 소요 50ms(18,800행). 부분 UNIQUE 인덱스 생성 중 messages 쓰기가 짧게 대기(ms 단위) | 운영 영향 무시 가능 |

**남은 위험:**
- 운영 PG 17 과 로컬 16 의 버전 차이. 함수 원문의 md5 는 일치했고 md5 가드가 있습니다.
- 클라이언트 표시 정렬은 created_at 그대로입니다. seq 는 따라잡기 커서에만 쓰입니다.
- 운영 적용은 **Owner 명시 승인 후**에만 합니다.

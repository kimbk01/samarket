# DIBAY 메신저·채팅·통화 재감사 + 계획·설계안 (2026-10-22 · 되돌림 이후 · Owner 승인 대기)

- 기준 코드: **main `48491453`** (이전 세션 코드 12커밋 되돌림 = 기준점 `a44a9d1b` 상태). 설치: iPhone **1.2 (7)** · Android **1.2.4 (11)** — 체크아웃의 `CURRENT_PROJECT_VERSION = 7`·`versionCode 11` 과 일치 (`ios/App/App.xcodeproj/project.pbxproj:698`, `android/app/build.gradle:18-19`).
- 근거 3종을 구분한다: **[기기]** 실기기 로그(`docs/audit/call-scenarios-2026-10-22/REPORT.md`, 작업 브랜치) · **[DB]** 운영 DB 읽기 전용 조회(이번 세션) · **[코드]** 현재 main 코드(file:line). [코드]만 있는 항목은 실기기 재현 전까지 수정하지 않는다.
- 이 문서는 감사·설계만 한다. 코드·DB·네이티브 변경 없음. 승인 전 구현 없음.
- 2026-10-22 보완: Owner 지적 6건 반영 — §4 전면 수정(책임 분리·실패 경로·A1/A2 연계·순서·복구·완료 조건). 지금 진행 범위는 **통화 복구(단계 A)만**이며 메신저·친구·신규 기능은 보류.
- 이전 문서(`call-fix-plan-v2`, `full-audit-2026-10-21`)는 이 문서가 대체한다. 재확인 결과 틀린 주장은 §6 에 적었다.
- **진행 위치 (2026-10-23 14:31 PHT):** A1~A5·A2 V0~V7 **완료 보존**. **A6** 코드 로컬 · 더블체크 PASS · 실기기 §4-17-6 **부분 PASS**(아래 §4-17-11) · **전체 A6 PASS 아님**(I→S·잠금/BG·영상 회귀 잔여) · **main 미반영**. 다음 = 잔여 행렬 닫기 → Owner 승인 반영 → **A7**. 별도 대장 SIDE-01/02. 새 계획·재감사 금지.
- **진행 방침 (Owner 2026-10-23):** `docs/audit/DIBAY_메신저_통화_기존계획_계속진행_및_별도결함관리_20261023.md` — A6→A7→B→C→D→E→F 고정. 별도 발견 결함은 `docs/audit/messenger-side-defect-ledger-2026-10-23.md` (SIDE-01 Android 음소거 · SIDE-02 영상전환). A6 커밋에 섞지 않음. 통화 네이티브 HARD LOCK.

---

## 0. 지금 Production 상태에서 확실한 위험 (먼저 알림)

1. **iPhone 통화 차단은 다시 생긴다.** 되돌림으로 서버가 기준점 동작(끝난 통화의 iPhone 에도 종료 VoIP 발송)으로 돌아갔고, iOS 앱 1.2 (7) 에도 보고 없이 끝내는 분기가 그대로 있다(§1 CALL-1).
   - iPhone 앱은 오늘 12:06 UTC(20:06 PHT)에 재설치됐다 [DB: `user_devices` 새 행 `b73d1dff`]. 그래서 지금은 일시적으로 풀려 있을 수 있다.
   - 하지만 iPhone 이 **받지 않은 통화가 한 번 생기면**(30초 무응답) 같은 순서로 다시 차단된다: 앱 타이머 종료 → 서버 `missed_call` VoIP → 보고 없이 완료 → iOS 강제 종료 → 이후 VoIP 폐기.
2. 계정 `w테스트1` 에 **활성 iOS 일반 알림 행이 2개**다(`b73d1dff` 새 설치 · `d0c29f5a` 옛 설치). 옛 행에도 수신·종료 알림이 계속 간다 [DB: 12:07:43Z `call_end` sent → `d0c29f5a`].
3. 되돌림 이후(12:07Z 이후) 운영 통화는 0건이다 [DB]. 되돌린 상태에서 측정한 실기기 결과는 아직 없다(NOT_PROVEN).

---

## 1. 결함 목록 — 통화 (최우선 · `AGENTS.md` 통화 변경 규정 적용)

### P0 — 전화를 못 받는 결함

**CALL-1. iPhone 이 앱 꺼짐·잠금에서 전화를 못 받음 (iOS 가 VoIP 차단)**
- [기기] REPORT A1 시도 1(`c8f5d827`) 순서:
  1. `19:08:02.705` 앱 벨 타임아웃이 CallKit 을 종료 (privateEndedReason 3)
  2. `19:08:03.205` `missed_call` VoIP 수신 → `ios_voip_terminal_already_suppressed reason=completion_only`
  3. `19:08:03.213` 앱 SIGABRT, `19:08:10` `0xBAADCA11` 종료
  4. 이후 9회 연속 `VoIP push … dropped on the floor`
- [DB] 무응답마다 그 iPhone 에 `missed_call` 을 `voip_apns` 로 발송했다: `0abd8479`·`d984e831`·`19440c0a`·`e88fbab6` 모두 sent.
- 원인 ① 서버: 이미 CallKit 이 끝난 iPhone 에 종료류 VoIP 를 보낸다. VoIP 채널이 모든 통화 kind 를 허용한다(`lib/push/dispatch/push-payload-types.ts:173-180`).

  | 이벤트 | 위치 | 끝난 iPhone 에 가는 경우 |
  |---|---|---|
  | missed_call | `lib/community-messenger/service.ts:21016,21194` → `notify-push-dispatcher.ts:169-176` | 항상. iPhone 이 30초 타이머로 먼저 끝낸다(`ios/App/App/Call/NativeVoiceCallRuntime.swift:15,420,464`) |
  | call_answered_elsewhere | `service.ts:20944` | 받은 iPhone 자신 (제외 로직 없음, `dispatch-push-for-user.ts:307-318`) |
  | call_rejected | `service.ts:20960,20972-20987` | 거절한 iPhone 자신 + 발신자 기기 전부 |
  | call_ended | `service.ts:20960` | 상대 iPhone 이 미디어 단절로 먼저 끝낸 경우 (REPORT A4·B3) |
  | 공통 | `load-active-push-targets.ts:52-98` | 이번 통화 벨이 간 적 없는 옛 설치 행 |

- 원인 ② 앱: `ios/App/App/Push/VoIPPushRegistry.swift` 에서 CallKit 보고 없이 completion 하는 분기
  - **#4** `:210-225`: 맵에 없음 + 종료 표시. 5종 kind 모두 도달. **위반 확정 경로.**
  - **#2** `:103-116`: 받은 기기 + 맵에 없음. 위반 가능.
  - #1 `:89-98`, #3 `:138-151`: 살아 있는 통화 중이라 iOS 판정이 NOT_PROVEN.
  - 두 Set 은 메모리에만 있으므로(`CallKitProvider.swift:18,23`) 앱 프로세스가 살아 있을 때만 발생한다.

**CALL-2. 이미 끝난 통화에 늦게 온 수신이 무음 CallKit 화면을 남김**
- [코드] `CallKitProvider.swift:200-209` 가 보고 후 종료를 시도한다. 그런데 `:334-341` 이 `callKitEndCompletedSessionIds` 를 보고 바로 return 해서 종료되지 않는다.
- [코드] 서버의 링 이어 보내기(`incoming-call-voip-dispatch.ts:197-228`)는 세션 상태를 다시 확인하지 않는다. 그래서 취소된 통화에 늦은 `incoming_call` 이 갈 수 있다.
- 실기기 재현: NOT_PROVEN (REPORT 에서 A7 은 차단 상태라 관찰 불가).

### P1 — 받지만 잘못 동작

**CALL-3. iPhone 에 통화 일반 알림이 중복으로 뜸 (벨과 함께 배너, 끝난 뒤 「띵」)**
- [기기] 매 통화 `Adding notification … hasSound: 1`. [DB] 통화마다 `apns` alert 를 sent 로 발송.
- [코드] 수신·취소·거절·종료·다른 기기 받음·부재중 6종 모두 VoIP 와 별도로 `sound:"default"` alert 를 보낸다(`apns-sender-impl.ts:222-225`).

**CALL-4. 옛 iOS 설치 행이 활성으로 남음**
- [DB] §0-2. [코드] 등록 시 같은 device_id 행만 정리한다(`supabase/migrations/20261015140000_register_user_device_rpc.sql:114-131`). 재설치로 device_id 가 바뀌면 옛 행은 APNs 410/400 이 오거나 활성 20개를 넘을 때까지 남는다.
- 디스패치는 순차 발송이라(`dispatch-push-for-user.ts:345-460`) 행이 늘수록 벨도 늦어진다.

**CALL-5. iPhone 음성 수신 통화 중 상대가 끊으면 「통화를 시작하지 못했습니다」 빨간 배너**
- [기기] A4 `527c59ed`: `cleanup reason=mediaFailed` → `fail_after_fulfill` 후 빨간 배너. 영상(B3)은 정상 종료로 처리됐다.
- [코드] 음성 **수신** 코디네이터가 `didOfflineOfUid` 사유를 구분하지 않고 실패로 처리한다(`NativeVoiceIncomingCallCoordinator.swift:376-393`).
- 음성 **발신**은 QUIT 를 이미 정상 종료로 처리한다(`NativeVoiceOutgoingCallCoordinator.swift:126-141`). 이전 계획의 「발신도 같은 수정」은 틀렸다.

**CALL-6. iPhone 음성 통화 스피커·음소거 버튼이 모양만 바뀜**
- [코드] `NativeVoiceCallViewController.swift:237-250`: 엔진 호출이 없다.
- 음성 엔진에 `muteLocalAudioStream`·`setEnableSpeakerphone` 이 없다. `CXSetMutedCallAction` 처리기도 0건이다.
- 실기기: Owner 보고만 있음. 재측정이 필요하다.

**CALL-7. VoIP 토큰 재전달 수단 없음 (재설치 직후 통화 수신 지연 가능)**
- [코드] 네이티브 재시도는 15초에서 끝난다(`DibayPushTokenBridge.swift:42`).
- `replayLastVoipTokenIfPresent()` 는 호출하는 곳이 0건이다(`:20-24`).
- JS 리스너가 붙기 전에 온 이벤트는 사라진다(`components/push/NativePushRegistration.tsx:86`).

### P1 — 웹·서버 통화 (실기기 재현 후 채택)
[코드]로 확인됐지만 실기기 증거가 없다. 기준선(§3 단계 B)에서 재현돼야 수정 대상이 된다.

| ID | 결함 | 근거 |
|---|---|---|
| C-1·C-2·C-18 | 통화 기록 단독 페이지: `seedCalls=[]` 로 무한 렌더·빈 목록, 「더 보기」가 커서를 초기화, viewerUserId 누락 | `MessengerCallLogsPanel.tsx:76,162-164,220-228`, `CommunityMessengerCallLogsClient.tsx:47` |
| C-4 | 부재중 PATCH 실패 시 재시도 없음 → 상대 벨이 크론(2분)까지 계속 | `call-v4/call-v4-actions.ts:1305-1339` |
| C-6 | 상대의 끊긴 active 세션 때문에 잘못된 「통화 중」 | `service.ts:19423-19427,19450-19455` |
| C-11 | 늦은 cleanup 이 callId 확인 없이 전역 초기화 | `call-v4-cleanup.ts:49,68-75` |
| C-16·P-7 | 통화 종료 후 복귀 경로 오류, 뒤로가기 2회 | `call-v4-exit-guard.ts:138-140,187`, `call-session-navigation-seed.ts:307,319` |
| N-1·N-2·N-6 | 네이티브 영상 cleanup 의 범위 없는 leave, PATCH 동안 미디어 송출 | `NativeVideoCallRuntime.java:756-793`, `NativeVideoIncomingCallCoordinator.swift:248-262,531-551` |
| N-3·N-5 | DROPPED·Agora 오류를 iOS·Android 가 다르게 처리 | iOS Engine `:577-597`, Android Engine `:825-831,895-903` |
| C-14 | `media_connected` 1회 전송 실패 시 통화 시간 0 | `NativeVoiceCallApi.java:116-134` |
| V-1·V-2·V-4·V-5·V-7 | 영상 UI: 자동 숨김 꺼짐, 재연결 표시 없음, 로컬만 보는 품질 판정, 카메라 라벨 의미 반대 | 각 Activity/VC |

### P2 — 기능 미구현 (Owner 확정 정책 대비)
- **D4 통화 중**: 서버가 세션 생성 전에 `peer_busy` 를 반환하므로 벨·푸시는 없다(정책 준수). 그러나 **기록이 0건**이다(`service.ts:19440-19456`). 발신자 자신이 통화 중일 때도 「상대방이 통화중」으로 뜬다(C-17).
- **12상태**: 끝까지 구분되는 것은 취소·거절·연결·정상 종료 4개뿐이다. 다음은 합쳐진다.
  - 연결 불가 = 무응답
  - 재연결 = 연결
  - 네이티브 연결 실패 = 정상 종료 (네이티브가 endedReason 을 보내지 않음)
  - 재연결 실패 = 종료
  - 무응답일 때 발신자 안내도 없다(`call-v4-actions.ts:178-183`).
- [DB] 최근 3일 세션 status 는 cancelled·missed·ended·rejected 4종뿐이다.
- **U 중앙 공통 팝업**: 없다. 모든 안내가 배너다(`call-in-app-notice-contract.ts:78-141`).
- 구현 함정 2건:
  - `call-event-message.ts:78` 이 cancelled 를 busy 보다 먼저 검사한다.
  - `call-v4-actions.ts:506` 이 알 수 없는 status 를 「거절」로 매핑한다.

### 결함 아님
- 잠금 화면 CallKit 에 거절 버튼 없음: iOS 표준(측면 버튼 2회).
- Android 의 늦은 종료 푸시 재울림, 정상 종료를 실패로 처리: 증거 없음. Android 는 소비 저장소(120초)와 서버 재확인이 있다(`DibayFirebaseMessagingService.java:184-259`).

---

## 2. 결함 목록 — 메신저·채팅·친구

전체 66건을 재확인했다(EXISTS 45 · 판단 불가 19 · 결함 아님 2). [코드] 기준이고, 실기기 재현 표시(Y)가 있는 항목은 기준선 FAIL 이 나와야 채택한다.

| 우선 | 묶음(근본 원인) | 항목 | 근거 | 실기기 |
|---|---|---|---|---|
| 1 | **타임라인 병합·실시간** | M-2 seed 병합이 pending 행을 「보냄」으로 바꿈 · M-3 같은 프레임 bump 버림 · M-1 텍스트 bump 가 FCM 순차 발송 뒤 · M-8 실패 시 새 입력 덮어씀 | `merge-primed-timeline-seed.ts:16`, `use-messenger-room-bump-broadcast-subscription.ts:136,230-233`, `rooms/[roomId]/messages/route.ts:362-379`, `send-post-ack-effects.ts:219-237`, `phase2-controller.ts:1043` | M-1·2·3 Y |
| 2 | **삭제·모더레이션 (개인정보)** | D-1 전체 삭제 후 답장 인용에 원문 남음 · A-1 그룹 앨범이 삭제·숨김 메시지 노출 | `service.ts:18300-18307`, `group-room-media-service.ts:37-43` | N |
| 3 | **차단 정책 (D1·D2 위반)** | F-2 차단 시 주문·거래 채팅도 전송 불가 · F-4 차단당한 쪽 방도 숨김 · F-1 두 경로에서 해제해도 방 숨김 유지 · F-3 상대 즐겨찾기 삭제 · F-7 확인창 없음 | `assert-messenger-room-send-allowed.ts:101-103`, `participant-block-hide.ts:150-176`, `me/relations/[type]/route.ts:228`, `chat/rooms/[roomId]/unblock/route.ts:49` | N |
| 4 | **입력창 (D3 위반)** | K-1 모바일 Enter 가 전송 · K-3 수정 실패 시 글 사라짐 · K-4 수정 중 이모지가 원문 대체 · K-2 높이 고정 | `RoomPhase2Composer.tsx:563-567`, `phase2-controller.ts:1193-1196`, `RoomSheets.tsx:280-283` | K-1·2 Y |
| 5 | **대화 목록 스와이프** | L-1 열린 채 남음 · L-2 반쯤 멈춤 · L-3 열린 상태에서 탭하면 입장 · L-7 주문 채팅을 사장님도 나감·문구 오류 · L-6 방장 나가기 노출 | `MessengerChatListItem.tsx:617-622,645-647,764-774`, `leave-chat-room-orchestration.server.ts:185-189` | L-1·2 Y |
| 6 | **친구 요청 (Owner 신규 요구)** | 현재는 단방향 즉시 추가(`social-relations.ts:532`). 수락 API 는 410(`friend-requests/respond-incoming/route.ts`), 요청 팝업은 제거됨. 방 메뉴 토스트가 「요청을 보냈습니다」라 실제 동작과 다름 | `MessengerFriendAddSheet.tsx:83-88` 는 이미 **중앙 팝업**(`anchor="center"`) | 기능 |
| 7 | 그 밖의 낮은 위험 | F-5·F-6·F-8·F-9·F-11·F-13, L-4·L-5·L-8~L-11, M-10·M-11·M-14·M-15, K-5·K-7, P-1~P-3, G-2, S-1 | 재감사 표(작업 노트) | 혼합 |

판단 불가(DB·실측 필요): G-1 그룹 위임 RPC 권한, F-12·F-14 grant·RLS, M-4~M-6·M-9·M-12, P-4~P-6, D-2, X-1·X-2. 운영 DB 함수·정책을 읽기 전용으로 확인한 뒤 판정한다.

---

## 3. 진행 순서 (게이트 고정 · 단계마다 Owner 보고 1회)

| 단계 | 내용 | 다음 단계 조건 |
|---|---|---|
| **0** | 이 문서 승인 | Owner 승인 |
| **A1** | 통화 서버: 종료 VoIP 규칙 (§4-3, 웹) | §4-8 행렬 PASS |
| **A1b** | 통화 서버: 늦은 링 차단 (§4-4, 웹) | §4-8 행렬 PASS |
| **A2** | iOS 1.2 (8): 모든 VoIP 를 CallKit 에 보고 (§4-5) | 앱 삭제 후 설치 · §4-8 행렬 + A2 검증표 PASS |
| **A3** | 운영 DB: 옛 iOS 설치 행 정리 (§4-6, Owner DB 승인 별도) | 활성 iOS 행 = 실제 설치 수 |
| **A4** | 통화 서버: iPhone 통화 일반 알림 제거 (A3 뒤) | iPhone 통화 일반 알림 0건 · 부재중 1건 |
| **A5~A7** | iOS: CALL-5 → CALL-6 → CALL-7, 각각 단독 빌드 | 각 행렬 PASS · **현재: A5 PASS · A6=§4-17 승인대기 · A7 미착수** |
| **B** | 실기기 기준선: 통화 C~G 와 메신저 M·N·O·P·Q 전체 관찰 (수정 없음) | REPORT 완료 · FAIL 마다 id·시각·로그 원문 · **A6·A7 PASS 후** |
| **C** | B 의 FAIL 로 §2 묶음 1~5 와 §1 웹·서버 P1 확정 → 묶음별 설계 상세 → 승인 | Owner 승인 |
| **D** | 묶음 하나씩 구현 → 로컬 검증 → 단독 반영 → 그 묶음 실기기 재검 | 묶음 PASS 후 다음 묶음 |
| **E** | 친구 요청(§2-6), 통화 12상태·중앙 팝업·통화 중 기록(§1 P2) — 기능 설계 별도 문서 → 승인 → 구현 | PASS |
| **F** | 전체 회귀 (master plan §2 시나리오 + §3 완성 기준) | 전 항목 PASS → 완료 판정 |

A 단계(통화)를 B(기준선)보다 먼저 하는 이유:
- CALL-1 은 기기·DB·코드 증거가 모두 있다.
- 지금 상태로 iPhone 기준선을 돌리면 첫 무응답에서 다시 차단된다. 그러면 나머지 통화 관찰이 전부 무효가 된다(REPORT A1 시도 2~B1 이 그 사례).

---

## 4. 통화 설계 (통화 변경 규정 3번 형식 · 단계 A · 2026-10-22 보완판)

### 4-1. CALL-1 책임 분리 — 서버와 iOS 가 각각 지켜야 할 것

**확인된 코드 사실** (main `ec7cd141` = `48491453` 와 통화 코드 동일)
- iOS 네이티브의 모든 통화 PATCH(accept·reject·end·missed)는 `deviceId` 를 보낸다(`ios/App/App/Call/NativeVoiceCallApi.swift:213-227`, `Video/NativeVideoCallApi.swift:253-267`).
- 이 값은 `user_devices.device_id` 와 같은 정본 ID 다(`DibayCanonicalDeviceIdStore.swift`). 서버는 이를 `answeredDeviceId` 로 받는다(`app/api/community-messenger/calls/sessions/[sessionId]/route.ts:190-195`). 따라서 **행동한 기기·받은 기기를 서버가 식별할 수 있다.**
  - 예외: 등록 전 첫 실행처럼 UserDefaults 와 WebView 모두에 값이 없으면 nil 이다.
- 통화 푸시의 `notification_deliveries` 기록은 **기기마다 발송 직전에 pending 으로 쓰이고, 기기 순서대로 하나씩** 보낸다(`lib/push/dispatch/dispatch-push-for-user.ts:345,386-395`). (2026-10-22 A1 구현 중 정정: 이전 판의 「발송 후 기록」은 틀림)
  - 따라서 링 발송 중에 취소되면 아직 차례가 오지 않은 기기는 「링 기록」이 없다. 링 발송은 2초 뒤 `after()` 로 이어진다.
  - 기록 쓰기 자체가 실패해도 기록이 없다.
  - → **링 기록 조회에 기대는 설계는 정상 경로에서도 틀릴 수 있다** (결론 불변).
- iOS 연결 중 통화의 heartbeat 는 서버 종료 상태를 보고 통화를 끝내지 않는다(`NativeActiveCallHeartbeatOwner.swift:96-150`). 연결 중 iPhone 의 종료 신호는 Agora 상대 퇴장과 `call_ended` VoIP 둘뿐이다.
- iOS 네이티브 발신 코디네이터에는 서버 종료 처리 경로가 없다(`NativeVoiceOutgoingCallCoordinator.swift`). 발신 중 종료(거절 등)는 웹 call-v4 가 받는다.

**책임 분리**

| 책임 | 서버 (A1) | iOS 앱 (A2) |
|---|---|---|
| 원칙 | **끝났을 수 있는 iPhone 에는 종료 VoIP 를 보내지 않는다.** 판단에 링 기록(로그)을 쓰지 않고, 세션 전이와 요청 deviceId 만 쓴다 | **어떤 VoIP 가 와도 CallKit 에 보고한다.** 서버 규칙이 틀리거나 경합이 생겨도 iOS 차단이 생기지 않게 하는 최종 방어 |
| 이미 끝난 통화 | 보내지 않음(아래 표) | 새 UUID 로 `reportNewIncomingCall` → 즉시 `reportCall(endedAt:)` → completion |
| 살아 있는 통화(벨 중) | 취소·거절·다른 기기 받음은 보냄 → 벨 종료 | 그 callId 의 CallKit 통화만 종료 |
| 살아 있는 통화(받는 중~연결) | 보내지 않음 | 늦은 취소·거절이 와도 통화를 유지한다. 보고 의무는 새 UUID 보고 후 즉시 종료로 채운다 |

**이벤트별 서버 발송 규칙 (A1 · iOS `voip_apns` 만)**

| 이벤트 | 지금 | A1 이후 | 정상 경로 | 실패 경로 · 남는 위험 |
|---|---|---|---|---|
| 수신 링 `incoming_call` | 수신자 voip 전부 | **불변** | 벨 | 늦은 링(CALL-2)은 A1b 에서 다룸 |
| 무응답 `missed_call` | 수신자 voip 전부 | **보내지 않음** | iPhone 은 자체 30초 타이머로 종료하고, 부재중은 일반 알림 1건 | 서버 마감(세션 시작 기준)이 iPhone 타이머(화면 표시 기준)보다 먼저라, iPhone 벨이 푸시 지연(측정 약 5초)만큼 더 울림. 차단 위험 없음 |
| 발신자 취소 `call_canceled` | 수신자 voip 전부 | 수신자 voip 전부 (불변) | 벨 중인 iPhone 이 종료됨 | **경합**: 수신자가 iPhone 에서 거절을 누른 직후(거절 요청 처리 전) 취소가 먼저 처리되면, 이미 끝난 iPhone 에 도착함. 창은 요청 왕복 시간(1초 미만). A2 로만 막힘 |
| 수신자 거절 `call_rejected` | 발신자 기기 전부 + 수신자 기기 전부(거절한 iPhone 포함) | 수신자 voip 중 **요청 deviceId 와 다른 기기만**. deviceId 가 없으면 **아무 iPhone 에도 보내지 않음**. 발신자 기기에는 보내지 않음 | 수신자의 다른 iPhone 벨 종료. 발신자는 웹 call-v4 로 거절을 받음 | deviceId 없음 → 수신자의 다른 iPhone 벨이 최대 30초 계속됨(차단 없음). 발신 iPhone 이 백그라운드면 거절을 늦게 앎 → 실기기 확인 항목 |
| 다른 기기에서 받음 `call_answered_elsewhere` | 수신자 voip 전부(받은 기기 포함) | 수신자 voip 중 **`answered_device_id` 와 다른 기기만**. 받은 기기 ID 가 없으면 **보내지 않음** | 다른 iPhone 벨 종료 | 받은 기기 ID 없음 → 다른 iPhone 벨 최대 30초. **경합**: 다른 iPhone 의 30초 타이머와 수락 유예 5초(`call-missed-deadline-authority.ts:128`)가 겹치면 끝난 iPhone 에 도착 → A2 |
| 정상 종료 `call_ended` | 상대 voip 전부 | **보내지 않음** | 연결 중 iPhone 은 Agora 상대 퇴장으로 종료(QUIT 즉시, A4 실측 0.06초) | 상대가 망 단절(DROPPED)이면 Agora 오프라인 판정까지 늦게 끝남(약 20초). 지금도 `call_ended` VoIP 는 미디어 종료 **뒤에** 도착해 #4 위반을 만든다(REPORT A4·B3) |

**여러 기기·옛 설치**

| 경우 | A1 이후 동작 |
|---|---|
| 수신자 iPhone 2대 이상 | 모두 링을 받는다. 행동·받은 기기를 뺀 나머지만 종료 VoIP 를 받는다. 나머지는 벨 중이므로 살아 있는 통화 = 안전 |
| iPad (VoIP 미등록) | `voip_apns` 행이 없으므로 VoIP 없음. 일반 알림만 받는다(A4·A3 대상) |
| 옛 설치의 VoIP 행 | 토큰이 무효면 APNs 400/410 으로 비활성화된다(`apns-sender-impl.ts:160-176`). 지금 `w테스트1` 의 활성 VoIP 행은 1개다 [DB] |
| 옛 설치의 일반 알림 행 | VoIP 차단과 무관하다. 중복 배너 원인이며 A3(DB) 에서 정리 |
| 링을 못 받은 iPhone (차단·오프라인) | 무응답은 이제 VoIP 없음. 취소·거절·다른 기기 받음은 도착할 수 있다. 그 기기는 이 callId 기록이 없으므로 1.2 (7) 도 보고 후 종료 경로(`VoIPPushRegistry.swift:300-352`, 규칙 준수)로 간다. 이미 차단된 기기는 계속 버려진다(재설치 필요) |

### 4-2. A1 실패 경로 — 「링 기록 조회 실패 시 기존처럼 발송」 정책은 폐기
- **증명 결과**: 안전하지 않다.
  - 조회가 실패하면 지금의 위반 발송(무응답·종료·거절한 기기)이 그대로 일어난다. iOS 차단은 앱 재설치 전까지 풀리지 않는다.
  - 게다가 기록은 발송 후에 쓰이므로, 링 발송 중 취소 같은 **정상 경로에서도** 「기록 없음」이 생긴다.
- **대안 비교**

| 안 | 종료 신호 유실 위험 | iOS 차단 위험 | 판정 |
|---|---|---|---|
| ① 조회 실패 시 발송 (기존 설계) | 낮음 | **있음** (영구, 재설치 필요) | 폐기 |
| ② 조회 실패 시 미발송 | 기록 지연으로 벨 중인 iPhone 도 놓침(최대 30초 벨) | 낮음 | 정상 경로까지 오판 → 채택 안 함 |
| **③ 로그 미사용: 세션 전이 + 요청 deviceId 로 판단** (4-1 표) | 유실은 정해진 경우뿐: 무응답(푸시 지연만큼 벨 연장), deviceId 없음(다른 iPhone 벨 최대 30초), 연결 중 DROPPED(Agora 판정까지). 모두 상한이 있고 통화가 막히지 않는다 | 경합 창(1초 미만 · 유예 5초 구간)만 남고 A2 로 제거 | **채택** |

- 판단 근거: 종료 신호 유실은 상한이 있고 통화를 막지 않는다(앱 30초 타이머·Agora 판정). iOS 차단은 상한이 없고 모든 통화를 막는다. 따라서 애매하면 **보내지 않는 쪽**으로 정한다.

### 4-3. A1 — 서버 종료 VoIP 규칙 (웹 배포만 · 재빌드 없음)
- **바꾸는 곳**
  - `lib/push/dispatch/push-payload-types.ts:173-180`: `voip_apns` 의 kind 정책. `missed_call`·`call_ended` 거부
  - `lib/push/dispatch/dispatch-push-for-user.ts`: 종료 kind 일 때 `voip_apns` 대상 중 제외 기기(device_id) 목록 적용. 제외 기기를 알 수 없으면 종료 kind 의 `voip_apns` 전체 생략
  - `lib/community-messenger/service.ts:20944` (다른 기기 받음 → `answered_device_id`), `:20960,20972-20987` (거절 → 요청 deviceId, 발신자 측 VoIP 생략)
- **바뀌지 않는 것**: 수신 링, Android `fcm`, 웹 푸시, `apns` 일반 알림(A4 에서 다룸), 세션 상태 전이, 통화 기록.
- **영향 경로**
  - 발신 시작·세션 생성·링: 불변
  - 취소·거절·다른 기기 받음: 벨 중인 iPhone 종료 유지
  - 부재중·종료: iPhone 은 VoIP 대신 자체 타이머·미디어로 종료
  - CallKit 종료 신호·통화 기록·팝업: 서버 기준이라 불변
- **설치된 iOS 1.2 (7) 에서 막는 것**
  1. 무응답 후 차단 (REPORT A1 경로)
  2. 받은 기기에 `answered_elsewhere`
  3. 거절한 기기에 `call_rejected`
  4. 미디어로 먼저 끝난 iPhone 에 `call_ended`
  5. 발신 iPhone 에 `call_rejected`
- **1.2 (7) 에서 막지 못하는 것** (→ A2)
  1. 거절 탭과 취소의 경합 (1초 미만)
  2. 다른 iPhone 의 30초 타이머와 수락 유예 5초의 경합
  3. 받는 중(accepting) 상태에 늦은 취소·거절이 도착하는 경우: `VoIPPushRegistry.swift:138-151` #3, iOS 판정 NOT_PROVEN
  4. 늦은 링이 무음 화면을 남기는 것 (CALL-2 → A1b·A2)
  5. 이미 차단된 기기 (재설치로만 해제)
- **회귀 위험**
  1. deviceId 가 없을 때 다른 iPhone 벨이 30초까지 남는다.
  2. 무응답 때 iPhone 벨이 약 5초 더 울린다.
  3. 연결 중 DROPPED 일 때 iPhone 종료가 늦다.
  - 세 가지 모두 실기기 행렬에서 측정한다.
- **복구**: §4-7.
- **검증**
  - 로컬: 이벤트×기기 조합 단위 테스트(제외 기기 있음·없음·deviceId 없음), 통화·푸시 vitest, 타입, lint.
  - 실기기: §4-8 행렬.

### 4-4. A1b — 늦은 링 차단 (서버 · A1 과 별도 커밋)
- **바꾸는 곳**: `lib/community-messenger/incoming-call-voip-dispatch.ts:197-228`
- **바뀌는 동작**: 2초 예산 뒤 `after()` 로 이어 보내는 링 발송에서, 기기마다 보내기 직전에 세션이 아직 `ringing` 인지 다시 확인한다. 종료 상태면 그 기기는 건너뛴다.
- **남는 위험**: 확인과 발송 사이의 아주 짧은 창. 이는 A2 의 늦은 수신 즉시 종료로 막는다.
- **1.2 (7) 효과**: 끝난 통화의 무음 CallKit 화면(CALL-2)이 대부분 사라진다.

### 4-5. A2 — iOS 모든 VoIP 를 CallKit 에 보고 (빌드 1.2 (8))
- **바꾸는 곳**: `ios/App/App/Push/VoIPPushRegistry.swift:37-225` (completion 분기 전체), `CallKitProvider.swift:200-209,334-341`
- **처리 규칙**
  1. VoIP 수신 → callId 로 **CallKit 실제 상태**(`CXCallObserver.calls`)를 조회한다. 메모리 Set 은 판단에 쓰지 않는다.
  2. 그 callId 의 CallKit 통화가 벨 중이고 kind 가 종료류 → 그 통화만 종료하고 completion.
  3. 받는 중~연결 상태에 늦게 온 취소·거절·부재중 → **통화를 유지**하고, 새 UUID 로 보고한 뒤 즉시 종료하고 completion. `call_ended` 는 그 통화를 종료한다.
  4. 그 callId 의 CallKit 통화가 없음(이미 끝남·모름) → 새 UUID 로 `reportNewIncomingCall` 후 즉시 `reportCall(endedAt:reason:.remoteEnded)` 하고 completion.
  5. 끝난 callId 에 늦은 `incoming_call` → 같은 방식(새 UUID 보고 후 즉시 종료)으로 처리한다. `endCompleted` 때문에 종료를 건너뛰는 경로(`:334-341`)를 없앤다.
- **검증 항목** (지시 3번)

| 항목 | 방법 |
|---|---|
| 모든 VoIP 수신 경로의 CallKit 처리 | completion 분기마다 「보고 → completion」 순서를 단위 테스트로 잠근다. 실기기 iPhone 콘솔에서 `completion_only`·`stale_terminal_suppressed`·`already_terminal_suppressed` 0건 |
| 중복 CallKit 보고 방지 | 살아 있는 callId 에는 새 보고를 하지 않는다. 대체 보고는 매번 새 UUID 로 한다(기존 UUID 충돌 없음). 테스트: 같은 callId 종료 VoIP 2회 → CallKit 통화 수 변화 확인 |
| 정상 통화의 잘못된 종료 방지 | 연결 중 늦은 취소·거절·부재중 VoIP 를 주입해도 통화 유지(실기기 E 시나리오: 수락 직후 발신자 취소 경합). 다른 callId 의 통화는 건드리지 않는다 |
| 늦은 수신 화면 즉시 종료 | 발신 직후 취소(1초 이내) 10회 → iPhone 에 남는 화면 0건 |
| 잠금·백그라운드·앱 종료 상태 | 4가지 상태(①꺼짐 ②잠금 ③뒤 ④켜짐)마다 수신·취소·거절·무응답 |
| Android↔iPhone 음성·영상 회귀 | §4-8 행렬 전체 |
| 새 UUID 대체 보고가 화면에 비치는지 | Owner 육안 확인 (NOT_PROVEN 항목) |

- **설치**: main 커밋 → `npm run native:prepare`(iOS 빌드 번호 7→8) → iPhone 앱 삭제(차단 해제) → Xcode 설치 → `user_devices` 의 VoIP·apns 행 등록 확인.

### 4-6. 확정 순서 (A3·A4 충돌 해소)

| 순서 | 항목 | 종류 | 승인 |
|---|---|---|---|
| A1 | 서버 종료 VoIP 규칙 | 웹 | 이번 승인 요청 |
| A1b | 늦은 링 차단 | 웹 | A1 실기기 PASS 후 |
| A2 | iOS 모든 VoIP 보고 (1.2 (8)) | 네이티브 | A1b PASS 후 |
| **A3** | 옛 iOS 설치 행 정리 (`register_user_device` RPC) | **운영 DB** | **Owner 별도 DB 승인** |
| **A4** | iPhone 통화 일반 알림 제거 | 웹 | A3 적용·확인 후 (A3 없이는 옛 설치 행에 계속 감 — `cf12ba2a` 실패 원인) |
| A5 → A6 → A7 | 음성 상대 퇴장 정상 종료 → 스피커·음소거 → VoIP 토큰 재전달 | 네이티브, 각각 단독 빌드 | 각 PASS 후 다음 |

※ §3 진행표의 A3·A4 는 이 표의 A3(DB)·A4(알림)로 바뀐다.

### 4-7. 복구 기준 (롤백 정정)
- **원칙**: 결함이 있는 이전 상태로 되돌리는 것은 복구가 아니다.
  - A1 revert = 위반 발송 재도입
  - 1.2 (7) 재설치 = 보고 없는 완료 분기 재도입
  - **복구는 앞으로 고치는 것(forward fix)으로만 한다.**
- **노출 범위**: 운영 DB 의 활성 iOS 기기는 테스트 iPhone(`w테스트1`) 1대뿐이다 [DB]. iOS 빌드는 Xcode 직접 설치만 하고, 행렬 PASS 전에는 TestFlight·App Store 에 올리지 않는다. → iOS 결함의 영향은 테스트 기기로 한정된다.
- **서버(A1·A1b)**
  - A1·A1b 는 수신 링을 건드리지 않는다. 그래서 실패해도 「전화가 안 오는」 상태는 만들지 않는다. 가능한 실패는 벨이 늦게 끊김(상한 30초)과 연결 중 종료 지연(Agora 판정)이다.
  - 실패 시: 해당 이벤트 규칙 하나만 고친 커밋으로 복구한다. A1 전체 revert 는 하지 않는다.
  - 예외: 수신 링 자체가 깨진 경우(코드상 불가하지만 실측에서 발생하면)에만 해당 커밋을 revert 하고 즉시 보고한다.
- **iOS(A2~)**
  - 실패 시 실기기 검증을 즉시 중단하고 원인을 수정한 다음 빌드(1.2 (9))로만 복구한다.
  - 수정 빌드가 나올 때까지 **통화 가능한 상태 = 서버 A1·A1b 적용 + 현재 설치 빌드**다. 이때 남는 위험(4-3 「막지 못하는 것」)을 그대로 보고한다. 1.2 (7) 재설치를 「안전」으로 표기하지 않는다.
  - A2 빌드가 수신 자체를 깨뜨린 경우에만, A1·A1b 적용 상태에서 1.2 (7) 을 **임시 사용**한다. 이때 「경합 시 재차단 가능」을 명시하고 수정 빌드를 최우선으로 한다.

### 4-8. 완료 조건 (실기기 · 매 단계 같은 Production SHA · callId 단위 대조)
수신 성공만으로 완료하지 않는다. 아래 행렬 전체 PASS 가 완료 조건이다.
- **기기**: Samsung(S) ↔ iPhone(I), 음성·영상, 양방향.
- **I 상태**: ①꺼짐 ②잠금 ③뒤 ④켜짐.

| 시나리오 | PASS 기준 |
|---|---|
| 받기 → 10초 → 각 쪽 종료 | 벨 ≤ 2초(목표), 연결 ≤ 2초, 종료 반영 ≤ 1.5초, 빨간 배너 0 |
| 거절 | 발신자 「거절」 1회, I 콘솔 위반 0 |
| 벨 중 취소 → 30초 관찰 | I 벨 즉시 종료, 재울림 0 |
| 무응답 40초 → **곧바로 재발신 3회** | 재발신 3회 모두 벨 (차단 재발 없음), 부재중 알림 1건 |
| 정상 종료 후 즉시 재발신 | 벨·연결 정상 |
| 연속 받기 3회 (E4) | 3회 모두 수신 |
| 통화 중 (X 로 busy) | 벨·푸시 0, 발신자 「통화 중」 |
| 발신 직후 취소 10회 (A2 이후) | I 에 남는 화면 0 |

- **매 시나리오 기록**: 발신 시각, 세션 생성(`community_messenger_call_sessions`), VoIP·FCM·apns 발송 시각(`notification_deliveries`), 수신 화면, 연결, 종료 시각. 서버 시각은 운영 DB 와 대조한다.
- **iPhone 콘솔 집계**: `dropped on the floor`·`will not be launched`·`completion_only` = 0.
- **푸시 중복**: 통화 1건당 I 의 VoIP 수, 일반 알림 수를 DB 와 콘솔로 센다.
- 측정하지 않은 항목은 NOT_PROVEN 으로 표기한다. FAIL 이 나오면 즉시 중단 → 증거를 이 문서에 추가 → 승인 → 그 건만 수정.

### 4-9. A1 실기기 결과 (2026-10-22 21:24~21:34 PHT)
- **조건**
  - Production `bc7396464e3f` (Vercel READY · 최신 Production 확인)
  - Samsung 1.2.4 (11) · iPhone 1.2 (7)
  - 로그: iPhone `idevicesyslog` · Samsung logcat · 운영 DB. 원본은 `.tmp/a1-verify-2026-10-22/` (RESULTS.md · iphone-console.log · samsung.log)

| 시험 | callId | 결과 |
|---|---|---|
| S→I 음성 (I 앱 종료·잠금, 콜드 실행) | `b59087d5` | 벨·연결·종료 PASS. answered_elsewhere·call_end VoIP 생략 확인 |
| S→I 영상 | `3b1f7180` | PASS. I 종료 처리 = remote_terminal(정상) |
| **I 무응답 → 곧바로 재발신** (I 앱 완전 종료·잠금) | `5601dfce` → `286bbe1c` | **PASS.** I 자체 타이머 종료(54.11) 뒤 missed VoIP 없음 → 앱 강제 종료 없음 → 재발신 벨 정상(세션 후 1.9s). 벨 중 취소 VoIP 는 살아 있는 통화에 도착해 정상 종료(tracked_incoming_end) |
| I→S 음성·I 종료 | `47a64617` | PASS |
| S 가 I 발신을 거절 | `6d0aa12c` | PASS. 발신 iPhone 은 웹 경로로 0.46s 만에 종료. 발신자 VoIP 미발송(설계대로) |
| 정상 종료(S) → 곧바로 재발신 | `af299a0c` → `52e0c3aa` | PASS |

- **iPhone 콘솔 누적**: `dropped on the floor`·`will not be launched`·`completion_only`·`0xBAADCA11` = **0건**. 앱 종료 기록은 Owner 의 위로 쓸어 올림(user-quit) 2건뿐이다.
- **판정: A1 이 목표(무응답 후 iPhone VoIP 차단 재발 방지)를 실기기에서 달성했다.** 코드 PASS · Production 반영 · 실기기 PASS.
- **A1 과 무관하게 관찰된 것** (A1 변경 경로 밖 · 다음 단계 대상)
  1. **CALL-5 재현**: 음성 수신 통화에서 S 가 끊으면 I 가 `mediaFailed → fail_after_fulfill` 로 처리(`b59087d5`). 빨간 배너 육안 여부는 Owner 확인 대기.
  2. **CALL-3 재현**: 통화마다 iPhone 에 소리 있는 일반 알림(수신·다른 기기 받음·종료).
  3. **부재중 알림 미발송**: `5601dfce` 의 missed 알림이 `user_settings_gate` 로 skipped. 원인 NOT_PROVEN. 이 게이트는 VoIP 정책보다 먼저 실행되므로 A1 영향이 아니다.
  4. **iPhone 발신 지연(스피너)** (Owner 지적)
     - 서버 세션 생성 → 네이티브 발신 화면은 0.57~0.77s 로 측정됐다.
     - 탭 → 세션 생성 구간은 웹 로그라 미수집(NOT_PROVEN).
     - A1 은 발신 경로를 바꾸지 않았다. C-10 과 같은 구간이다.
  5. 옛 apns 행 `d0c29f5a` 는 첫 시험의 발송 실패(400/410) 뒤 대상에서 빠졌다(A3 일부 자연 해소. 다른 사용자 행은 미확인).
- **NOT_RUN**: iPhone 이 수신자로서 거절(측면 버튼). A1 거절 규칙(거절한 기기 제외)의 실기기 확인은 A2 행렬에 포함한다.

#### 4-9-1. Owner 추가 확인 항목 (2026-10-22 · 수집된 로그 재분석 · 코드 수정 없음)

**① 빨간 배너**
- Owner 확인: **시험 1 에서 뜨지 않았다.**
- 로그상으로는 `b59087d5` 가 `fail_after_fulfill` 로 끝났다.
- 앱의 음성 화면이 잠금 상태라 표시가 미뤄진 채(`ios_native_voice_ui_deferred_locked` 6회) 통화가 끝났으므로, 배너가 그려질 화면이 없었던 것으로 보인다(NOT_PROVEN).
- → CALL-5 는 「잠금 해제 상태에서 상대가 끊을 때」 재현해야 한다(A5 검증 항목).

**② 통화 뒤 남는 iPhone 알림 (Owner 지적 확인)**
- 원인 1 · 서버: 통화 이벤트마다 소리 있는 일반 알림을 따로 보낸다. 통화 알림은 `apns-collapse-id` 를 쓰지 않으므로(`lib/push/dispatch/apns-sender.ts` `collapseId: !isCallPush(...) ? … : null`) 이벤트마다 **별도 알림**으로 쌓인다.
  - 종료류 본문은 제목 「통화」 + 빈 본문이다.
- 원인 2 · 앱: 통화가 끝난 뒤 통화 알림을 지우는 코드가 없다. 웹의 알림 제거는 방 읽음(`removeDeliveredNotificationsForRoomRead`)·로그아웃에만 있다.
- 콘솔 기록 (`Adding` = 알림 센터 추가, `Withdrawing` = 회수)

| 통화 | 남은 알림 (회수 시각) |
|---|---|
| `b59087d5` 음성 | 다른 기기 받음 `0357` 21:24:18 · 종료 `74C8` 21:24:31 → 2분 뒤 다음 통화 때 시스템이 회수(21:26:30) |
| `3b1f7180` 영상 | 종료 `F4A1` 21:26:46 (앱 화면이 앞이라 배너는 없고 알림 센터에만 추가) → 남음 |
| `286bbe1c` 취소 | 수신 `4C88` 21:29:10 (3분 뒤 앱이 1건 제거) · 취소 `EA16` 21:29:18 → 남음 |
| `6d0aa12c` 거절당한 발신 | 거절 `81D7` 21:32:56 → 남음 |
| `af299a0c`·`52e0c3aa` 발신 | 종료 `F564`·`D501` → 남음 |

- 수신 알림 중 일부(`1EB9`·`FC4B`·`3E15`)는 추가 직후 시스템이 회수했다. 회수 조건은 NOT_PROVEN.
- **A4 설계 보정 필요**: A1 이후 종료류 VoIP 가 생략되므로, 이전 안의 「VoIP 가 sent 인 설치는 일반 알림 생략」 규칙으로는 종료 알림이 **사라지지 않는다.**
  - A4 는 kind 별로 정해야 한다: VoIP 를 등록한 iOS 설치에는 수신·취소·거절·종료·다른 기기 받음 일반 알림을 보내지 않고, 부재중만 보낸다.
  - 앱 쪽의 통화 알림 정리는 A4 와 별도 항목으로 둔다.

**③ 통화 화면(앱)과 CallKit 화면**

| 상황 | 로그로 확인된 표시 |
|---|---|
| 잠금 상태 음성 수신 (`b59087d5`) | CallKit 잠금 화면만 표시. 앱 음성 화면은 잠금 동안 계속 보류(deferred_locked)되고, 통화가 끝날 때까지 한 번도 표시되지 않음 |
| 잠금 상태 영상 수신 (`3b1f7180`) | CallKit 으로 받은 뒤, 잠금 해제(21:26:32.9) 순간 앱 영상 화면이 떠오름(`device_unlocked_video_ui_flush`) |
| iPhone 발신 (`47a64617` 등) | 앱 음성 화면 + CallKit 발신 보고(`reportOutgoingCall`). 시스템 통화 표시와 앱 화면이 함께 존재 |

**④ Owner 스크린샷으로 특정 (2026-10-22): 잠금 해제·홈 화면 수신 시 CallKit 배너 ① 아래에 뜨는 「음성 통화 · q테스트1님의 전화」 배너 ②**
- **정체**: 서버가 VoIP 와 별도로 보내는 **수신 일반 알림**(`call_ringing` · `apns` · 소리 있음)이다.
  - 앱 모달이나 CallKit 화면이 아니다.
  - 제목·본문이 `send-community-messenger-incoming-call-push.ts` 의 수신 알림 문구와 같다.
- **기록 대조**: 매 수신마다 DB 에 `call_ringing` `apns` sent 가 있고, iPhone 콘솔에 `[com.dibay.app] Adding notification … shouldPresentAlert: 1 hasSound: 1` 이 있다.
  - 예: `b59087d5` → `1EB9` 21:24:10.6 · `3b1f7180` → `8F16` 21:26:23.8 · `286bbe1c` → `4C88` 21:29:10.5. VoIP 수신 후 약 1초 뒤다.
- **분류**: CALL-3 의 수신 부분. A1 과 무관하게 이전부터 있던 동작이다.
- **수정 = A4** (보정안)
  - VoIP 를 등록한 iOS 설치(같은 `device_id` 에 활성 `voip_apns`)에는 통화 일반 알림 중 수신·취소·거절·종료·다른 기기 받음을 보내지 않는다. 부재중만 보낸다.
  - 단, 그 설치의 수신 VoIP 발송이 실패하면 수신 알림을 대체로 보낸다. 이를 위해 디스패치 순서를 `voip_apns` 먼저로 바꿔야 한다(지금은 `last_seen_at` 순).
- **A3 와의 관계**: `w테스트1` 의 옛 apns 행 `d0c29f5a` 는 시험 1 의 발송 실패로 13:24:11Z 에 비활성화됐다. 활성 iOS apns 행은 지금 1개다(`b73d1dff`).
  - VoIP 가 없는 iOS 행(옛 설치·iPad)은 A4 규칙 밖이라 계속 알림을 받는다. 다른 사용자의 옛 행 정리는 A3 가 맡는다.
- **배너 ① 과 앱 화면의 관계**: 잠금 해제 상태의 CallKit 수신 배너 ① 은 iOS 표준이다. ① 에서 받은 뒤 앱 화면 전환·종료 후 화면 잔존 여부는 A2·A5 행렬에서 화면 녹화로 확인한다.

**⑤ CALL-5 재현 (Owner 스크린샷 · 잠금 해제 상태, 21:46 PHT)**
- **callId**: `0bcf0759` · `6ddde228` (S→I 음성, 연결 후 3초·1.6초 만에 S 가 끊음, 서버 `ended_by_caller`)
- **증상**: iPhone 통화 화면(통화 중 00:03) 위에 「통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.」 빨간 배너가 뜬다.
- **Samsung logcat** (`.tmp/a1-verify-2026-10-22/samsung-2146.log`): `end_tapped` 21:46:18.246 → `after_agora_leave` 18.258(정상 퇴장 = 상대에게 QUIT) → end PATCH → 서버 종료 18.633.
- **iPhone 콘솔**: 이 시각에는 수집을 멈춘 뒤라 없다(NOT_PROVEN).
  - 같은 경로가 시험 1(`b59087d5`) 콘솔에 남아 있다: `cleanup reason=mediaFailed → fail_after_fulfill`.
  - 코드 근거: `NativeVoiceIncomingCallCoordinator.swift:376-393` 는 퇴장 사유와 상관없이 실패로 처리하고, `NativeCallInAppNotice.swift:89-97,139` 가 이를 「통화를 시작하지 못했습니다」로 분류한다.
- **A1 영향 없음**
  - A1 은 이 통화의 `call_end` VoIP 를 생략했을 뿐이다(`ios_voip_call_ended_media_owned`). iPhone 은 그 전에 미디어 퇴장으로 이미 실패 처리했다.
  - A1 이전 실기기(REPORT A4 `527c59ed`)에서도 같은 배너가 확인됐다.
- **수정 = A5** (§4-7 A5~A7): 연결 후 QUIT → 정상 종료(발신 코디네이터와 같은 규칙), 연결 후 DROPPED → 「통화 연결이 끊어졌습니다」.

### 4-10. 통화 UI 통일 (Owner 요구 2026-10-22 · 설계 전 정리 · 구현 승인 전)
**요구**: 수신 CallKit 배너와 앱 통화 화면을 구분하거나, 정해진 앱 형태의 UI 로 Android(APK)·iOS 를 똑같이 맞춘다.

**바꿀 수 없는 것 (Apple 규칙 · iOS 13+)**
- 앱이 꺼짐·백그라운드일 때 오는 전화는 VoIP 푸시로만 받을 수 있다. 앱은 받는 즉시 CallKit 에 보고해야 하고, 보고하지 않으면 iOS 가 VoIP 를 차단한다. 이는 CALL-1 과 같은 원인이다.
- CallKit 수신 화면의 모양은 iOS 가 정한다.
  - 잠금 상태: 전체 화면
  - 잠금 해제: 상단 배너 ①
- 배치·색·버튼은 앱이 바꿀 수 없다. **CallKit 배너를 앱이 만든 화면으로 대체하는 안은 채택하지 않는다.**

**iOS 에서 바꿀 수 있는 것**

| 항목 | 현재 (`CallKitProvider.swift:35-45,570-573`) | 바꿀 수 있는 범위 |
|---|---|---|
| 앱 이름 | `DIBAY` (배너 「DIBAY 음성 통화」) | 문구 |
| 아이콘 | 컬러 `AppIcon` 을 그대로 template 으로 사용 | 단색 template 전용 로고 (CallKit 은 단색 마스크로 그림) |
| 발신자 표시 | 상대 이름 | 이름·부가 표시 |
| 벨소리 | 관리자 설정 번들 또는 시스템 기본 | 번들 사운드 |
| 앱 통화 화면 (받은 뒤·발신·종료) | 앱 자체 화면 (`NativeVoiceCallViewController`, 영상 VC) | **전부 변경 가능** → Android 와 같은 디자인으로 맞출 대상 |
| 같이 뜨는 배너 ② | 서버 수신 일반 알림 | A4 로 제거 → 수신 표시는 ① 하나 |

**Android 현재 구조** (`NativeVoiceCallNotification.java:218-231`, `IncomingCallActivity`, `NativeVoiceCallActivity`)
- 잠금 상태: 전체 화면 수신(앱 자체 Activity, 변경 가능).
- 잠금 해제: 시스템 헤드업 알림 + 「수락·거절」 버튼.
- 받은 뒤: 앱 자체 통화 화면(변경 가능).

**Owner 확정 (2026-10-22): 기준 = iOS CallKit 수신 화면. 수신 표시(배너·잠금 전체 화면)를 CallKit 과 일관된 UI 로 맞춘다.**
- iOS CallKit 은 바꿀 수 없으므로 **기준(정답 화면)**으로 삼는다. Android 수신 표시를 그에 맞춘다.
- iOS 쪽은 CallKit 이 허용하는 항목(이름 문구·단색 로고·발신자 표시)과 중복 배너 ② 제거(A4)만 한다.

| 화면 | iOS (기준, 시스템) | Android 현재 | Android 목표 |
|---|---|---|---|
| 잠금 해제 수신 | 상단 배너: 왼쪽 원형 프로필 · 「DIBAY 음성 통화」 작은 글씨 · 상대 이름 굵게 · 오른쪽 **빨강 원형 거절 · 파랑/초록 원형 수락** 아이콘 버튼 | 헤드업 알림 `BigTextStyle` · 제목=상대 이름 · 본문=종류 · **글자 버튼 「수락」「거절」(수락이 왼쪽)** · 앱 색 채움(`setColorized`) (`NativeVoiceCallNotification.java:206-232`) | `NotificationCompat.CallStyle.forIncomingCall`(원형 거절·수락 아이콘, 거절 왼쪽·수락 오른쪽, 프로필 `Person`) — 구성·순서를 CallKit 배너와 동일하게 |
| 잠금 수신 | CallKit 전체 화면: 상단 이름·「DIBAY 음성 통화」, 하단 거절·수락(또는 밀어서 받기) | 앱 전체 화면(`IncomingCallActivity` / `NativeVoiceCallActivity`) | 같은 정보 배치(이름·종류·하단 원형 거절/수락)로 재구성 |
| 영상 수신 | 「DIBAY 영상 통화」 | 종류 문구만 다름 | 문구·아이콘 규칙 동일 |
| 앱 화면이 앞일 때 수신 | CallKit 배너 | 헤드업 | 위와 동일(앱 안 별도 수신 모달 없음 — 확인 항목) |

- **선행 확인**(기기 기준선): Samsung(Android 16)의 실제 헤드업·잠금 전체 화면 캡처와 iPhone CallKit 배너·잠금 화면 캡처를 나란히 놓는다. 앱이 앞일 때 웹 쪽 수신 모달이 따로 뜨는지도 확인한다.
- **Android 위험 (설계 문서에 포함)**
  - `CallStyle` 은 Android 12 이상에서 원형 버튼으로 그려진다. 그 미만(minSdk 24~30)은 일반 액션 버튼으로 대체된다.
  - Android 14 이상은 전체 화면 알림 권한(`USE_FULL_SCREEN_INTENT`) 상태에 따라 잠금 화면 표시가 달라진다.
  - 수락·거절 PendingIntent 경로(`acceptActivityIntent`·`declineIntent`)는 바꾸지 않는다. **표시만 바꾼다** — 통화 동작 회귀를 막기 위해서다.

**기기 기준선 (2026-10-22 21:54~21:58 PHT)**
- 자료: `.tmp/incoming-ui-baseline-2026-10-22/` (Samsung 자동 캡처 · iPhone Owner 스크린샷 · 양쪽 로그)

| 상황 | iPhone (CallKit · 기준) | Samsung 현재 |
|---|---|---|
| 잠금 해제·홈 화면 | 검정 알약 모양 상단 배너: 왼쪽 원형 프로필(+작은 DIBAY 로고), 「DIBAY 음성 통화」 회색 작은 글씨, 상대 이름 굵게, 오른쪽 **빨강 원형 거절 · 파랑 원형 수락(체크)** — 그 아래 **중복 일반 알림 배너 ②** 「음성 통화 · q테스트1님의 전화」 | 흰 헤드업 알림: DIBAY 앱 아이콘, 「w테스트1 · 오후 9:54」, 「DiBay 음성 통화」, **글자 버튼 「수락 \| 거절」(수락 왼쪽)** (`ffd69f38`, 21:55:01) |
| 잠금 | 어두운 회색 전체 화면: 상단 작은 DIBAY 로고 + 「DIBAY 음성 통화…」, 상대 이름 큰 글씨, **프로필 없음**, 하단 「나중에 알림」, **「밀어서 통화하기」 슬라이더** (거절 버튼 없음 = iOS 표준) | 진한 초록 그라데이션 전체 화면: 큰 원형 이니셜 프로필 「W」, 이름, 「음성 통화 수신」, 하단 **빨강 원형 거절(왼쪽) · 초록 원형 수락(오른쪽)** (`61405b41`, 21:55:27) |
| 첫 통화 (`9fa6b0e5`, 21:54:38) | — | 잠금 해제 상태였지만 헤드업 대신 위와 같은 **초록 전체 화면**이 떴다(앱이 앞에 있었는지는 NOT_PROVEN) |
| 표기 | 「DIBAY」 | 「DiBay」(헤드업) / 「DIBAY」(상태 표시줄) — **표기 불일치** |

- **차이 요약**
  1. 잠금 해제 수신: iOS 는 원형 아이콘 버튼(거절 왼쪽)이고, Android 는 글자 버튼(수락 왼쪽)으로 **순서가 반대**다.
  2. 잠금 수신: iOS 는 회색·슬라이더·프로필 없음이고, Android 는 초록·원형 버튼 2개·프로필 있음으로 **색·조작 방식이 모두 다르다.**
  3. 앱 이름 표기가 「DIBAY」 / 「DiBay」 로 섞여 있다.
  4. iPhone 에만 중복 일반 알림 ②가 있다(A4).
- **iOS 잠금 화면 제약**: 잠금 상태 CallKit 은 「밀어서 통화하기」 + 거절 버튼 없음이 iOS 표준이고 바꿀 수 없다. 따라서 「완전히 같은 모양」은 불가능하다.
- **Android 맞춤 목표** (설계 확정 대상)
  - 잠금 해제: `CallStyle` 원형 버튼, 거절 왼쪽·수락 오른쪽, 프로필, 「DIBAY 음성 통화」 문구.
  - 잠금: 색은 CallKit 과 같은 어두운 무채색, 정보 배치는 「작은 로고+DIBAY 음성 통화 → 이름 → (프로필)」, 하단은 거절·수락 원형 버튼 유지.
    - Android 에는 시스템 슬라이더가 없고, 거절 버튼을 없애면 기능이 줄어들므로 유지한다.
  - 표기는 「DIBAY」로 통일한다.

**통화 뒤 잠금 화면에 「통화」 알림이 남는 이유 (Owner 3번째 스크린샷, `9941ff68` 취소 통화)**
- 화면에 보인 것
  - 「통화」(빈 본문) = 서버의 **취소 일반 알림** (`call_cancel` `apns` sent)
  - 「음성 통화 · q테스트1님의 전화」 = **수신 일반 알림** (`call_ringing` `apns` sent)
  - 알림 센터 「통화」 2개 = 이전 통화들의 같은 알림
- 원인은 §4-9-1 ②와 같다: 서버가 VoIP 와 별도로 통화 이벤트마다 일반 알림을 보낸다 + 묶음(collapse)이 없다 + 앱이 정리하지 않는다.
- 해결은 A4(VoIP 등록 iPhone 에는 부재중만 일반 알림) + 통화 알림 정리 항목이다.

**진행 조건**
- 이 작업은 네이티브 통화 UI 변경이다. 통화 변경 규정(증거·영향·승인·단독 반영·실기기 행렬)을 적용하고, 생명주기 수정(A2·A5)과 **다른 커밋·다른 빌드**로 한다.
- 순서: A2·A5(동작 결함) PASS 뒤 UI 통일. 동작과 UI 를 섞으면 회귀 원인을 가를 수 없다.
- 설계 전 준비
  1. 현재 화면 기준선: Android·iPhone 각각 수신(잠금·해제)·발신·통화 중·종료 화면 캡처
  2. 기준 = iOS CallKit (Owner 확정)
  3. Android 수신 표시 명세 1장 → Owner 승인 → 구현 (Android 단독 빌드)

### 4-11. 확정 수정안·순서 (2026-10-22 · 실기기 확인 결함만 · §4-6 순서를 대체)
- **근거**: 운영 DB 기준 활성 iOS apns 행은 1개(`w테스트1` `b73d1dff`)이고 VoIP 행도 있다. 옛 설치 행이 없으므로 A3(DB) 는 지금 필요 없다 → **보류.**

| 순서 | 결함 (실기기 증거) | 수정 | 종류 |
|---|---|---|---|
| **1. A4** | iPhone 수신 배너 ② 중복 · 통화 뒤 「통화」 알림 잔존 (스크린샷 2장 · `9941ff68` 등) | `push-payload-types.ts` 의 `apns` 정책: 같은 `device_id` 에 활성 `voip_apns` 가 있는 iOS 설치에는 `incoming_call`·`call_canceled`·`call_rejected`·`call_ended`·`call_answered_elsewhere` 일반 알림을 보내지 않음 · `missed_call` 은 유지. `dispatch-push-for-user.ts`: 대상 정렬 `voip_apns` 먼저 + 그 설치의 수신 VoIP 가 실패하면 수신 일반 알림 대체 발송 | 웹 (재빌드 없음) |
| **2. A5** | iPhone 음성 수신 중 상대가 끊으면 빨간 배너 (`0bcf0759`·`6ddde228` 스크린샷) | `NativeVoiceIncomingCallCoordinator.swift:376-393`: 연결 후 `remote_offline=0`(QUIT) → `reportCallEnded(.remoteEnded)` 정상 종료(배너 없음). 그 외 사유 → 「통화 연결이 끊어졌습니다」. 발신 코디네이터 `:126-141` 과 같은 규칙 | iOS 1.2 (8) |
| **3. A2** | 경합 시 iOS VoIP 차단 재발 가능 (§4-3 남는 위험 3건) | §4-5 그대로 | iOS 1.2 (9) |
| **4. 수신 UI** | Android 수신 표시가 CallKit 과 다름 (기준선 표) | 잠금 해제: `NotificationCompat.CallStyle.forIncomingCall` (거절 왼쪽·수락 오른쪽 원형, 발신자 `Person`, 문구 「DIBAY 음성 통화」/「DIBAY 영상 통화」). 잠금: `IncomingCallActivity`·`NativeVoiceCallActivity` 수신 화면을 CallKit 잠금 화면 배치(상단 작은 로고+「DIBAY 음성 통화」 → 이름 → 하단 원형 거절·수락)·어두운 무채색으로. 표기 「DIBAY」 통일. 수락·거절 PendingIntent 경로는 변경 없음 | Android 빌드 |
| **5. A1b** | 늦은 링 (코드 근거 · 실기기 미재현) | §4-4 그대로 | 웹 |

- 기존 남아 있는 iPhone 「통화」 알림은 A4 이후 새로 생기지 않는다. 이미 쌓인 것은 사용자가 지운다. 앱 쪽 정리 코드는 추가하지 않는다(원인이 서버 발송이므로).
- **측정 후 결정** (수정 안 함)
  - **iPhone 발신 스피너** (Owner 스크린샷: 「음성통화 · 통화를 시작하시겠습니까?」 확인 버튼에 스피너)
    - 코드 사실 1: 확인 버튼 스피너는 `busy={vm.outgoingDialLocked}` 이다(`MessengerOutgoingCallConfirmDialog` · 진입점 6곳 모두).
    - 코드 사실 2: 모든 진입점은 확인을 누르는 즉시 대화상자를 닫고 `startManagedDirectCall` 을 호출한다(`Phase2Header.tsx:604-606` 등). 따라서 **스피너가 보인다 = 이전 발신 시작 처리(`launchOutgoingDirectCall`)가 아직 끝나지 않은 상태에서 대화상자가 다시 열렸다**는 뜻이다. 잠금은 처리 전체가 끝나야 풀린다(`use-messenger-room-phase2-controller.ts:708,743-745`).
    - 처리 단계 (모두 순차)
      1. 네이티브 발신 가능 확인
      2. 권한 확인
      3. **GET `/calls/sessions/active`** (결과를 쓰지 않는 대기, `call-v4-actions.ts:610`)
      4. **POST `/rooms/[roomId]/calls`**: 서버에서 reconcile 3회, 종료 대기 루프(`service.ts:19214-19216`, 120ms 반복), busy 확인 4회, insert, **수신 푸시 전송 최대 2초까지 응답 대기**(`incoming-call-voip-dispatch.ts:197-228`)
      5. 네이티브 발신 가능 확인 2회(타임아웃 없음)
      6. 네이티브 시작
    - 실측
      - 서버 세션 생성 → 네이티브 발신 화면: 0.57~0.77s
      - 확인 탭 시각: 미수집 → **각 단계별 소요는 NOT_PROVEN**
    - **실측 (2026-10-22 22:12 PHT · iPhone 콘솔 + 운영 DB · 녹화 없음)**
      - 기준점: 확인 탭 직후 처리 시작 시 찍히는 첫 `lane_check_received`.

      | 경우 | callId | 처리 시작 → 서버 통화 시작 | → 통화 행 생성 | → iPhone 발신 화면 | 합계 |
      |---|---|---|---|---|---|
      | ① 한참 뒤 첫 발신 | `11b0e57c` | 22:12:23.41 → 25.83 = **2.42s** | 26.00 (0.17s) | 27.00 (1.00s) | **3.59s** |
      | ② 종료(서버 40.12) 직후 재발신 | `44a1552e` | 22:12:42.62 → 49.02 = **6.39s** | 49.66 (0.65s) | 50.44 (0.78s) | **7.82s** |

      - **가장 큰 구간은 「서버 통화 시작 이전」이다**(① 2.4s · ② 6.4s). 이 구간에는 GET `/calls/sessions/active` 1회와 POST 서버의 시작 전 단계(reconcile 3회·종료 대기 루프·busy 확인)가 들어 있다. 종료 직후 재발신에서 4초 더 길다.
      - 통화 행 생성 뒤 발신 화면까지(0.8~1.0s)에는 수신 푸시 대기가 포함된다. 삼성 FCM 발송은 26.33 / 50.05 다.
      - 구간 내부 분해(GET 대 POST 단계별)는 서버 타이밍 로그(`_callStartTimingsMs`)가 필요하다. Vercel 로그 조회는 MCP 403, CLI 는 해당 로그 미반환 → NOT_PROVEN.
    - 측정 방법(코드 수정 없음): iPhone 화면 녹화(시각 표시) + iPhone 콘솔 `ios_native_outgoing_lane_check_received`·`caller_outgoing_start` + DB `started_at`·VoIP 발송 시각을 같은 callId 로 대조한다. 「직전 통화 종료 직후 재발신」과 「한참 뒤 첫 발신」 두 경우를 잰다.
  - 부재중 알림 `user_settings_gate` 생략 (`5601dfce`): 원인 미확정

### 4-12. A4 실기기 결과 + 발신 대기 스피너 원인 실측 (2026-10-22 22:28~22:31 PHT · Production `7016303e`)

**A4 결과: PASS**
- 운영 DB 기준 4개 통화(`8cb851dc` 취소 · `7e509d24` 받기·종료 · `7de767d0`·`2660a151` 무응답)에서 iPhone 일반 알림이 모두 `ios_call_alert_callkit_owned` 로 생략됐다. 생략 대상은 수신·취소·다른 기기 받음·종료다.
- 부재중 알림만 `apns` sent 다(2건).
- Owner 육안 확인: 중복 배너 ② 와 통화 뒤 「통화」 알림이 사라졌다.

**빨간 배너**: `7e509d24`(받기 후 S 가 끊음)에서 다시 나타났다. CALL-5 이며 A5 범위이고, A4 와 무관하다.

**발신 스피너 (S→I) — Samsung WebView 콘솔 로그로 구간 분해** (`.tmp/a4-verify-2026-10-22/samsung.log`)
- 화면 동작: Samsung 은 탭 후 0.1초 안에 네이티브 「발신 준비」 화면을 띄운다. 그 안의 스피너는 서버 통화 생성 응답을 기다리는 표시다.

| 탭 시각 | 탭 → 생성 요청 시작 (GET `/calls/sessions/active`) | 생성 요청 (POST) | 서버: 요청 → 통화 시작 | 서버: 통화 시작 → 응답 | **탭 → 응답 (스피너)** |
|---|---|---|---|---|---|
| 22:28:13.59 | 0.66s | 3.28s | 1.12s | 2.16s | **3.95s** |
| 22:28:42.19 (취소 10초 뒤) | 1.50s | 4.16s | 2.20s | 1.96s | **5.66s** |
| 22:29:10.96 | 0.48s | 4.30s | 1.26s | 3.04s | **4.78s** |
| 22:29:56.32 | 0.75s | 3.76s | 1.58s | 2.18s | **4.51s** |
| 22:30:47.29 | 0.98s | **응답 없음** (4분 넘게 `create_done` 없음 · DB 세션 없음 · 직후 앱 비활성 `isActive:false`) | — | — | **멈춤** |

- **원인 1 (최대, 2.0~3.0s)**: 서버가 통화 행을 만든 뒤 **수신 푸시 발송(최대 2초 예산 + 사전 claim)이 끝날 때까지 HTTP 응답을 미룬다**(`app/api/community-messenger/rooms/[roomId]/calls/route.ts:76-78` → `incoming-call-voip-dispatch.ts:115,197-228`).
- **원인 2 (1.1~2.2s)**: 서버 통화 시작 전 단계가 순차로 실행된다. reconcile 3회(`route.ts:51`, `service.ts:19329,19331`), 종료 대기 루프, busy 확인 4회.
- **원인 3 (0.5~1.5s)**: 앱이 생성 요청 전에 결과를 쓰지 않는 GET `/calls/sessions/active` 를 한 번 더 기다린다(`call-v4-actions.ts:610`). 서버 POST 가 같은 reconcile 을 다시 한다.
- **멈춤 1건** (22:30:47): 생성 요청을 보낸 뒤 응답도 세션도 없다. 앱이 바로 비활성으로 바뀌어 요청이 끊긴 것으로 보이며, 원인은 NOT_PROVEN이다. 화면은 스피너에 머문다. 이것이 Owner 가 말한 「취소 후 다시 누르면 스피너만 돈다」와 같은 증상인지 재현으로 확인한다.

**F1 실기기 결과 (2026-10-22 22:46~22:49 PHT · Production `fb78a4c8` READY · 이후 `56c86c40` 은 통화 파일 변경 없음)**

| callId | 탭 → 생성 요청 | 생성 요청(POST) | 서버 행 생성 → 응답 | **탭 → 응답** |
|---|---|---|---|---|
| `0511ed9d` | 0.72s | 1.64s | 0.24s | **2.35s** |
| `5ccbaa6d` (취소 직후 재발신) | 0.97s | 1.50s | 0.22s | **2.48s** |
| `cdec0529` (취소 직후 재발신) | 0.66s | 3.01s | 0.23s | **3.67s** |
| `cef943a8` | 0.72s | 1.35s | 0.14s | **2.07s** |
| `0a9281a8` (취소 직후 재발신) | 0.81s | 1.91s | 0.32s | **2.73s** |

- **스피너**: 이전 3.95~5.66s → **2.07~3.67s.** 「서버 행 생성 → 응답」이 2.0~3.0s 에서 0.14~0.32s 로 줄었다. **F1 PASS.**
- **iPhone 벨**
  - VoIP 발송은 행 생성 후 0.32~0.37s 로 이전과 같다(늦어지지 않음).
  - iPhone 수신은 발송 후 0.8~0.9s 다. 첫 통화 `0511ed9d` 만 4.75s 였는데(APNs 전달 구간), 발송 시각이 바뀌지 않았으므로 F1 과는 무관하다.
  - iPhone 콘솔 `dropped`·`completion_only`·`will not be launched` = 0.
- **남은 대기**
  - 탭 → 생성 요청 0.66~0.97s 는 F2 대상이다.
  - 서버 통화 시작 전 단계는 1.03~2.54s 다(원인 2, 서버 단계별 시간 필요).

**F2 실기기 결과 (2026-10-22 23:02~23:03 PHT · `90a2078d`)**

| callId | 탭 → 생성 요청 | 생성 요청(POST) | **탭 → 응답** |
|---|---|---|---|
| `fdd35925` | **0.14s** (이전 0.48~1.50s) | 1.60s | **1.73s** |
| `73a0dd53` (종료 직후 재발신) | **0.14s** | 2.05s | **2.19s** |

- Owner 확인: 스피너가 보이지 않는다. iPhone 벨 시각은 같다. **F2 PASS.**
- 누적 효과(같은 S→I 발신): 탭 → 응답 **3.95~5.66s → 1.73~2.19s.**
- `fdd35925` 에서 빨간 배너 경로(`mediaFailed → fail_after_fulfill`)가 다시 확인됐다 → A5.

**Owner 추가 관찰 (2026-10-22 23:03 · 나중 수정안에 포함)**
- **L-CALL**: 통화가 끝난 뒤 대화 목록에 그 통화 기록(미리보기·순서)이 바로 나타나지 않고, 새로고침해야 나타난다(iPhone).
  - 서버는 종료 시 `call_stub` 를 기록한다(`call-timeline-policy.ts` terminal stub).
  - 목록 실시간 반영 경로(방 bump·목록 patch)가 통화 stub 을 반영하는지 확인이 필요하다.
  - 메신저 도메인(§2 묶음 1 「타임라인 병합·실시간」)으로 분류 → 단계 C 에서 증거 확정 후 설계.
- **L-ARCH** (Owner 스크린샷 2장, 23:06): 같은 시각 대화 목록에서 「q테스트1」(23:03 음성 통화 · 안읽음 4)과 「BK THE」 방이 사라지고 「보관된 채팅」이 4 → 6 으로 늘었다.
  - 운영 DB: 두 방 모두 `w테스트1` 의 `community_messenger_participants.is_archived = true` (`c202326f` · `bc3c3070`). 즉 **보관 처리가 실제로 저장됐다.**
  - 보관 시각 컬럼이 없어 언제·어떤 조작으로 보관됐는지는 NOT_PROVEN 이다. 스와이프 「보관」 버튼 오탭 가능성(L-1 열린 채 남음·L-3 열린 행 탭)을 포함해 재현으로 확인한다.
  - DB 는 Owner 승인 없이 되돌리지 않는다. 보관함에서 「복원」으로 되돌릴 수 있다(L-9 방 단위 archived 복원 무동작 결함 주의).
- **N-SOUND**: 통화 종료 직후 알림 소리가 1회 나지만 잠금 화면에는 남지 않는다.
  - 이 시각 iPhone 대상 비통화 푸시 발송 기록 0건, iPhone 콘솔에 앱 알림 추가 0건 → **서버 푸시가 원인이 아니다.**
  - 앱 내부 소리(종료 안내·빨간 배너·채팅 수신음 등) 중 무엇인지는 NOT_PROVEN. A5 이후 재관찰(화면 녹화 + 콘솔).

**수정안 (통화 서버·웹 · 각각 단독 커밋)**
- **F1 (원인 1)**: 통화 행 insert 직후 응답한다. 수신 푸시는 같은 순서(voip_apns 먼저)로 `after()` 에서 보낸다. 지금도 2초를 넘는 나머지는 `after()` 로 보내고 있으므로 같은 경로를 처음부터 쓰는 것이다.
  - 효과: 스피너 약 2~3s 단축.
  - 위험: 서버리스 `after()` 실행 보장에 의존한다. 이미 운영 중인 경로다.
  - 검증: 링 도착 시각이 지금(세션 후 0.3~0.6s)보다 늦어지지 않을 것.
- **F2 (원인 3)**: 생성 전 GET `/calls/sessions/active` 대기를 제거한다(서버 POST 가 같은 정리를 한다). 효과 약 0.5~1.5s.
- **원인 2**: reconcile 중복(3회 → 1회)은 서버 단계별 시간(`_callStartTimingsMs`)을 확인한 뒤 결정한다. Vercel 로그 권한이 필요하다.
- **멈춤 1건**: 재현 후 원인을 확정한다. 응답이 없는 경우 시간 제한(실패 표시)을 둘지는 증거를 본 뒤 정한다.

### 4-13. A5 실기기 결과 (2026-10-22 23:32~23:33 PHT · main `d5c53bab5` · iPhone 1.2 (8) 설치 확인)
- 설치 확인: `user_devices` 에 `c031c17f` `apns`·`voip_apns` 1.2 (8) 이 등록됐다(VoIP 23:30:51).
- `7637bd88`(잠금 해제)·`e048bba2`(잠금): S 가 끊자 iPhone 은 `ios_native_voice_incoming_remote_left reason=remote_offline=0` → `remote_terminal` → `cleanup_done reason=remote_terminal` 순으로 처리했다.
  - Owner 확인: **빨간 배너 없음.** **A5 PASS.**
  - iPhone 콘솔 `dropped`·`completion_only` = 0.
- **옛 설치 행 (A3 근거 확보)**
  - 오늘 삭제·재설치 3회로 활성 iOS apns 행 3개(`3246559e`·`181be454`·`b73d1dff`, 1.2 (7))가 남았다.
  - 통화마다 수신·다른 기기 받음·종료 알림이 이 3개로 `sent` 된다(APNs 200 · 자동 비활성화 안 됨).
  - 이 시각 iPhone 콘솔에 DIBAY 원격 알림 수신 기록은 없다 → 기기에는 전달되지 않은 것으로 보인다. 다만 행이 계속 활성으로 남아 발송이 낭비되고, 재설치가 늘수록 쌓인다.
  - → A3(`register_user_device` 에서 VoIP 를 가진 새 iOS 설치 등록 시 같은 사용자의 VoIP 없는 옛 iOS apns 행 비활성화)를 다음 DB 항목으로 올린다(Owner DB 승인 필요).
- **N-SOUND 재관찰**: Owner 는 「앱 밖(홈 화면)에서 통화 종료 후 메시지가 오고, 잠금 화면에서는 안 온다」고 했다.
  - 같은 시각 iPhone 콘솔에는 DIBAY 원격 알림 수신·알림 추가 기록이 없다. 서버 발송은 옛 행으로만 갔다.
  - 무엇이 보였는지(시스템 통화 종료 표시·앱 화면 안내 등)는 스크린샷이 필요하다(NOT_PROVEN).

### 4-14. A3 최종 설계 — 옛 iPhone 설치 기록 정리 (운영 DB 함수 변경 · **Owner 승인 전 적용 금지**)

**현재 상태 (운영 DB 읽기 전용 · 2026-10-22 23:4x PHT)**
- `register_user_device` 의 운영 본문은 저장소 `supabase/migrations/20261015140000_register_user_device_rpc.sql` 과 같다(공백 제외 md5 `98020ee7…` 일치).
- iOS 행 전체(production): apns 활성 4·비활성 10 / voip_apns 활성 1·비활성 1.
- 활성 apns 4행은 모두 `w테스트1` 이다.

| device_id | 버전 | 같은 기기 VoIP | 정리 대상 |
|---|---|---|---|
| `c031c17f` | 1.2 (8) | 있음 | 아니오 (현재 설치) |
| `3246559e` | 1.2 (7) | 없음 | **예** |
| `181be454` | 1.2 (7) | 없음 | **예** |
| `b73d1dff` | 1.2 (7) | 없음 | **예** |

- **대상 행 수: 3행 (1명).** 다른 사용자·Android·웹 푸시 행은 0행.

**왜 생기나 (증거)**
- 재설치하면 앱의 정본 기기 ID(`dibay:client_instance_id`)가 새로 생긴다.
- VoIP(PushKit) 토큰은 재설치해도 같다. 실제로 토큰 해시 `0b04b3` 가 08-01 행과 같다.
- 그래서 VoIP 등록은 `ON CONFLICT (push_provider, push_token, environment)` 로 **기존 VoIP 행의 device_id 를 새 설치로 옮긴다.**
- 반면 apns 토큰은 설치마다 바뀌어 새 행이 생긴다. 지금 함수는 「같은 device_id·같은 provider」의 다른 토큰만 비활성화하므로(`:123-131`) **옛 설치의 apns 행은 활성으로 남는다.**
- 이 행들로 통화 알림이 계속 `sent` 된다(A5 시험 `7637bd88`·`e048bba2` 에서 행마다 3건). APNs 가 200 을 돌려주므로 자동 비활성화도 되지 않는다.

**변경 (함수 1개 · 데이터 직접 수정 없음)**
- `register_user_device` 에서 upsert 직후, 기존 비활성화 문들과 같은 트랜잭션·advisory lock 안에 아래 1문을 추가한다.
- 조건: **iOS VoIP 행을 활성으로 등록할 때만** 실행한다.

```sql
  -- A3: 새 iOS 설치가 VoIP 를 등록하면, 같은 사용자의 「VoIP 없는 옛 iOS apns 행」을 비활성화(삭제 아님).
  -- VoIP 토큰은 재설치에도 같아 위 upsert 로 이 device_id 에 옮겨 오므로, 옛 설치에는 VoIP 가 남지 않는다.
  IF v_provider = 'voip_apns' AND btrim(p_platform) = 'ios' AND COALESCE(p_activate_row, true) THEN
    UPDATE public.user_devices a
       SET is_active = false,
           updated_at = v_now
     WHERE a.user_id = v_user_id
       AND a.environment = v_environment
       AND a.platform = 'ios'
       AND a.push_provider = 'apns'
       AND a.device_id IS DISTINCT FROM v_device_id
       AND a.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM public.user_devices v
          WHERE v.user_id = v_user_id
            AND v.environment = v_environment
            AND v.push_provider = 'voip_apns'
            AND v.is_active = true
            AND v.device_id = a.device_id
       );
  END IF;
```

- 새 마이그레이션 파일 1개: `CREATE OR REPLACE FUNCTION` 전체 본문 = 기존 본문 + 위 블록. 서명·권한(service_role 전용)·반환값은 불변이다.
- **기존 3행은 별도 UPDATE 로 지우지 않는다.** 그 iPhone 이 다음에 앱을 열어 VoIP 를 등록하는 순간 같은 규칙으로 비활성화된다(데이터 직접 수정 0건).

**영향**
- 바뀌는 것: VoIP 가 없는 옛 iOS apns 행이 비활성화된다 → 통화·메시지 일반 알림이 그 행으로 가지 않는다.
- 바뀌지 않는 것: Android(fcm)·웹 푸시·VoIP 행·현재 설치 apns 행, 다른 사용자 행.
- **iPad·두 번째 iPhone**: 같은 앱이면 각 기기에 자기 VoIP 행이 있으므로 유지된다.
  - 예외: VoIP 등록에 실패한 기기는 다른 기기가 VoIP 를 등록할 때 비활성화된다. 그 기기가 앱을 다시 열면 apns 재등록(`is_active=true` upsert)으로 바로 복구된다. 현재 해당 사례는 0건.
- **구 바이너리 호환**: 서버 함수만 바뀌므로 1.2 (7)·(8) 모두 같다. 재빌드는 없다.

**검증**
1. 적용 전: 대상 3행 id 를 기록한다(복구용).
2. 적용: Supabase 마이그레이션 1건(Owner 승인 후).
3. 운영 함수 본문 md5 를 새 파일과 대조한다.
4. iPhone 앱 재실행 → 3행 `is_active=false` 확인, `c031c17f` apns·voip 는 활성 유지.
5. S→I 통화 1회 → `notification_deliveries` 에 옛 3행 발송 0건, 벨 정상.

**롤백**
- 기존 본문(`20261015140000`)으로 `CREATE OR REPLACE` 를 재적용한다.
- 필요하면 기록해 둔 3행 id 를 `is_active=true` 로 되돌린다.

**A3 적용·검증 결과 (2026-10-23 00:2x PHT · main `1b62eba4` · 운영 마이그레이션 `register_user_device_ios_stale_apns`)**
1. 대상 3행 id 를 기록했다: `493c4043…` · `d62309d8…` · `54292ae0…` (커밋 메시지에 전체 id).
2. 운영 적용에 성공했다.
3. 운영 함수 본문 md5(공백 제외) `c699d354…`·길이 6089 가 main 파일과 같다. 실행 권한: anon ✗ · authenticated ✗ · service_role ✓.
4. iPhone 앱 재실행 → VoIP 재등록 시점(00:28:16)에 옛 3행이 `is_active=false` 가 됐다. 현재 설치 `c031c17f` apns·voip 는 활성이다.
5. S→I 통화 `2f2f3906`(00:28:38):
   - iPhone 대상 발송은 현재 설치 1개뿐이다(옛 행 발송 0건).
   - 수신 VoIP sent → iPhone 수신 00:28:39.9 → 받기 → S 종료 → `incoming_remote_left`(빨간 배너 경로 없음).
   - 일반 알림은 모두 `ios_call_alert_callkit_owned` 로 생략됐다.
   - iPhone 콘솔 `dropped`·`completion_only` = 0.
- **판정: A3 PASS** (코드·운영 DB 적용·실기기).

### 4-15. A2 최종 설계 — iOS 가 모든 VoIP 를 CallKit 에 보고 (iOS 1.2 (9) · **승인 전 구현 금지**)

**기준 코드**: main `1b62eba4` (A5 포함). `ios/App/App/Push/VoIPPushRegistry.swift`(511행) · `CallKitProvider.swift`(702행).

**지금 「보고 없이 완료」하는 분기 (코드 정독)**

| # | 위치 | 조건 | 들어오는 VoIP | A1 이후 서버가 보내는가 |
|---|---|---|---|---|
| W1 | `VoIPPushRegistry.swift:89-98` | 받은 기기 + CallKit 통화 살아 있음 | 다른 기기 받음 | 아니오(받은 기기 제외). 기기 ID 누락·구 서버만 |
| W2 | `:103-116` | 받은 기기 + 통화 이미 끝남 표시 | 다른 기기 받음 | 아니오 |
| S1 | `:138-151` | 받는 중~연결 상태에 늦은 취소·거절·부재중·다른 기기 받음 | 4종 | **경합 시 예**(받기 탭과 상대 취소가 1초 안에 겹칠 때) |
| T1 | `:210-225` | 맵에 없음 + 끝남 표시(`terminalSuppressed`·`endCompleted`) | 5종 | **경합 시 예**(거절 탭과 상대 취소, 30초 타이머와 수락 유예 5초) |
| L1 | `CallKitProvider.swift:200-209` + `:334-341` | 끝난 통화에 늦은 수신 VoIP | 수신 | 드묾 → 보고는 하지만 `endCompleted` 게이트 때문에 **종료 호출이 건너뛰어져 무음 수신 화면이 남는다** |

**과거에 completion-only 를 택한 이유 (계약 테스트로 잠김)**
- `55abc0d5`: 끝난 통화에 늦은 `call_ended` 가 와서 보고 → 즉시 종료하자, CallKit 수신 화면이 잠깐 **다시 나타났다**(재등장).
- 이를 막으려고 W2·T1 을 「보고 없이 완료」로 바꿨다. 잠금 테스트: `lib/community-messenger/call-authority/__tests__/ios-post-terminal-winner-suppressed-contract.test.ts` 2·3번.
- 그 결과 iOS 규칙 위반 → 앱 강제 종료 → VoIP 차단(CALL-1, REPORT A1)이 생겼다.
- **판단**: 재등장은 잠깐 보이는 화면 문제이고, 차단은 재설치 전까지 모든 전화가 막히는 문제다. A1 으로 서버 쪽 원인은 대부분 사라졌고, 남은 것은 1초 미만 경합뿐이다. 따라서 **경합 때 잠깐의 재등장은 감수하고 보고 의무를 지킨다.** 재등장이 얼마나 보이는지는 실기기에서 측정한다.

**변경 (iOS 네이티브 2파일 · 커밋 1개 · 빌드 1.2 (9))**
1. **판정 기준을 실제 CallKit 상태로** (`CallKitProvider.swift`)
   - `isCallKitCallAlive(sessionId)` 를 추가한다. `CXCallObserver().calls` 에서 이 세션 UUID(기존 결정적 UUID · 무작위 생성 금지 유지)가 `hasEnded == false` 인지 본다.
   - 메모리 Set(`terminalSuppressed`·`endCompleted`)은 판정에 쓰지 않는다. 로그·중복 종료 방지용으로만 남긴다.
2. **completion-only 분기 4개(W1·W2·S1·T1) 제거** (`VoIPPushRegistry.swift`). 규칙은 하나다.

   | CallKit 상태 | 처리 |
   |---|---|
   | 살아 있음 + 벨 중 | 기존 `reportCallEnded` 그대로 (정상 종료) |
   | 살아 있음 + 받는 중~연결(늦은 취소 등) 또는 받은 기기 | 같은 UUID 로 `reportNewIncomingCall`(무음) 호출 → iOS 가 「이미 있는 통화」 오류로 거절 → 통화는 그대로 두고 completion. **진행 중인 통화를 끊지 않는다** |
   | 살아 있지 않음(이미 끝남·처음 보는 세션) | 기존 orphan 경로 `fulfillOrphanTerminalVoipPush`(같은 UUID · 무음 보고 → 즉시 종료)로 통일 |

3. **늦은 수신 무음 화면 제거 (L1)**: `reportIncomingCall` 의 `terminalAlreadySeen` 종료는 이번 보고로 새로 만든 CallKit 통화를 끝내는 것이다. 따라서 `endCompleted` 게이트를 거치지 않고 `provider.reportCall(with:endedAt:reason:)` 을 직접 호출한다.
4. **계약 테스트 갱신**: 위 테스트 2·3번을 「completion-only 금지 · 모든 분기가 `reportNewIncomingCall` 을 거친 뒤 completion」으로 바꾼다. 1번(정리 순서)과 4번(진짜 orphan)은 유지한다. Swift 소스 정적 검사로 「`completion()` 앞에 보고 호출이 없는 분기 0개」를 잠근다.

**바뀌지 않는 것**: 정상 수신·받기·거절·종료 경로, 진행 중 통화(받는 중~연결) 유지 규칙(CUT7 #5), 무작위 UUID 금지, 서버·Android·웹.

**확인되지 않은 iOS 동작 (실기기에서 판정 · NOT_PROVEN)**
- (a) 살아 있는 UUID 로 `reportNewIncomingCall` 을 불러 오류가 나도 iOS 가 「보고함」으로 인정하는지. 인정하지 않으면 그 분기는 「무음 보고 → 즉시 종료」 전용 처리로 바꿔야 하며, 그때 다시 보고한다.
- (b) 「무음 보고 → 즉시 종료」가 화면에 얼마나 비치는지(재등장).
- (c) iPhone 「전화」 앱 최근 기록에 DIBAY 항목이 남는지. 현재 `includesCallsInRecents` 는 설정하지 않음 = 기본값 켜짐.

**검증 계획 (iOS 1.2 (9) 설치 · 같은 Production SHA · iPhone 콘솔 + 운영 DB 대조)**

| # | 시나리오 | PASS 기준 |
|---|---|---|
| V1 | 회귀 행렬 §4-8 (S↔I 음성·영상, 잠금·해제·꺼짐, 받기·거절·취소·무응답·종료·재발신) | A1~A5 결과와 같음 |
| V2 | 발신 직후 1초 안에 취소 ×10 (늦은 수신) | iPhone 에 남는 화면 0, `dropped`·`will not be launched` 0 |
| V3 | iPhone 벨 중 거절과 동시에 S 취소 ×5 (경합 T1) | 위와 같음 + 재등장 화면 육안 기록 |
| V4 | iPhone 받기 직후 S 취소 ×5 (경합 S1) | 받은 통화가 끊기지 않거나 정상 종료, 콘솔 completion_only 0 |
| V5 | 무응답 30초 전후에 S 취소 ×3 | 차단 0 · 다음 통화 정상 수신 |
| V6 | 위 전체 뒤 앱 꺼짐·잠금 상태 수신 3회 연속 | 3회 모두 벨 (차단 재발 없음) |
| V7 | iPhone 「전화」 앱 최근 기록 | DIBAY 잔여 항목 기록(있으면 별도 보고) |

- **콘솔 집계**: `completion_only`·`stale_terminal_suppressed`·`already_terminal_suppressed` = 0, `[callkit] report failed` 는 사유별로 센다(a 판정).
- **설치**: main 커밋 → `native:prepare`(iOS 8 → 9) → Xcode 덮어 설치(삭제 금지) → `user_devices` 1.2 (9)·VoIP 등록 확인.
- **복구**: 앞으로 고치는 방식만(1.2 (10)). A1 서버 보호는 유지된다. 1.2 (8) 재설치는 「경합 시 차단 가능」을 명시한 임시 사용만.

#### 4-15-1. A2 보완 (Owner 지적 2026-10-23 · 이전 판의 「진행 중 통화에 같은 UUID 재보고」 단독 의존 폐기)

**근거 (추측 없음 · 원문 확인)**
- **G1 · iOS SDK 헤더** (이 Mac 의 Xcode SDK `iPhoneOS27.0.sdk` `PushKit.framework/Headers/PKPushRegistry.h:262-312`, `PKVoIPPushMetadata.h`)
  - iOS **26.4** 부터 새 delegate 가 있다: `pushRegistry:didReceiveIncomingVoIPPushWithPayload:metadata:withCompletionHandler:`.
  - `PKVoIPPushMetadata.mustReport` 가 YES 인데 보고하지 않으면 앱이 종료된다. **NO 이면 보고하지 않아도 된다.**
  - NO 가 되는 경우(헤더 원문): 앱이 앞에 있을 때 · **앱에 이미 진행 중인 통화가 있을 때** · 네트워크 때문에 푸시가 한참 늦게 도착했을 때.
  - 헤더는 「VoIP 개발자는 이 메서드를 기존 메서드보다 우선 사용하라(mustReport NO 인 푸시를 무시하기 위해)」고 적는다.
- **G2 · Apple DTS(Kevin Elliott) 포럼 답변**
  - [thread 816211](https://developer.apple.com/forums/thread/816211): 위 내용을 확인한다. mustReport NO 면 「completion 만 호출하고 다른 동작은 필요 없다」.
  - [thread 764376](https://developer.apple.com/forums/thread/764376) (채택 답변): 기존 통화의 UUID 로 `reportNewIncomingCall` 을 부르면 시스템은 둘 중 하나로 처리한다.
    1. `callUUIDAlreadyExists` 로 실패 → **「추가 조치 필요 없음」**
    2. 새 통화로 보고 → 앱이 직접 종료
  - 그리고 「이 방식으로 통화를 숨기면서도, 기존 통화가 이미 끝난 타이밍에도 보고 누락으로 앱이 종료되지 않는다」고 적는다.
  - **단, 1번 결과(중복 오류)가 「보고 의무 충족」으로 인정된다는 명시는 이 답변에 없다** → 이전 판 설계의 약점이었다.
- **G3 · 실제 기기**: 시험 iPhone 은 **iOS 26.7.2**(23H127)이다(`ideviceinfo`). 빌드 SDK 는 iOS 27.0, 배포 최소 버전은 15.0 이다.

**확정 처리 규칙**

| 상황 | iOS 26.4 이상 (새 delegate · `mustReport` 사용) | iOS 26.4 미만 (기존 delegate) |
|---|---|---|
| 수신(`incoming_call`) | 지금과 같다: 항상 정상 보고(벨). mustReport 와 무관 | 같음 |
| 종료류 + CallKit 통화가 **벨 중**(추적됨) | 지금과 같다: `reportCallEnded` 로 그 통화 종료 | 같음 |
| 종료류 + **진행 중인 통화 있음**(받는 중·연결·받은 기기 · 다른 통화 포함) | **mustReport = NO (iOS 판정) → completion 만.** 통화를 건드리지 않는다. G1·G2 로 허용된 경로 | G2 의 기존 UUID 보고: 중복 오류 → 추가 동작 없음(통화 유지) · 새 통화로 보고되면 즉시 종료 |
| 종료류 + **이미 끝난 통화**(T1·W2) · 앱 뒤/꺼짐 | mustReport = YES → 세션 UUID 로 무음 보고 → 결과가 「새 통화」면 즉시 종료 · 「중복 오류」면 추가 동작 없음 | 같음 |
| 종료류 + 앱이 **앞에 있음** | mustReport = NO → completion 만(벨 중 추적 통화면 종료는 함) | G2 방식 |
| **통화 ID 없음** | mustReport 에 따름. YES 면 새 UUID 로 무음 보고 → 즉시 종료(맵에 저장하지 않음 → `ae486` 유령 재발신 조건 아님) | YES 와 같게 처리 |
| **같은 종료 VoIP 중복 도착** | 위 규칙 그대로(두 번째도 mustReport 로 판정) | 같음 |
| 끝난 통화에 **늦은 수신 VoIP**(L1) | 보고 결과가 「새 통화」(오류 없음) = **이번 보고로 생긴 통화**다. 종료 중복 방지 게이트(`callKitEndCompleted`)를 거치지 않고 그 UUID 를 `provider.reportCall(endedAt:)` 로 즉시 종료한 뒤 게이트에 기록한다. 오류(이미 있음)면 아무것도 하지 않는다 | 같음 |

**질문에 대한 답: 진행 중 통화에 늦은 종료 VoIP 가 오면?**
- **iOS 26.4 이상 (시험 iPhone 포함)**
  - 새 delegate 가 받은 `metadata.mustReport` 를 본다. 진행 중 통화가 있으면 iOS 가 NO 로 준다(G1 원문 「Your app already has an active call」).
  - 이때 **CallKit API 를 하나도 부르지 않고 completion 만 호출한다.**
  - 보고 의무가 없다고 iOS 가 직접 알려 준 푸시이므로 차단 사유가 아니다(G1 「not required to report」, G2).
  - 기존 통화에는 `reportNewIncomingCall`·`reportCall(endedAt:)`·`CXEndCallAction` 어느 것도 닿지 않으므로 그대로 유지된다.
- **iOS 26.4 미만**: G2 방식만 쓴다(중복 오류 = 추가 조치 없음). 이 경우의 차단 여부는 시험 기기로 검증할 수 없다(NOT_PROVEN). 운영 DB 의 활성 iOS 기기는 1대이고 iOS 26.7 이다.

**기존 기능 보호 (변경하지 않는 경로)**
- 정상 수신 보고·벨·CallKit 화면, 받기(`CXAnswerCallAction`)·거절·취소·종료·상대 종료(A5 경로)·무응답(30초 타이머)·재수신, 진행 중 통화 유지 규칙(CUT7 #5), Android, 서버(A1~A4·F1·F2) 모두 그대로다.
- **조회와 보고 사이 경합**
  - 「살아 있나」를 앱이 미리 조회해서 결정하지 않는다. 판정은 iOS 가 준 `mustReport` 와 `reportNewIncomingCall` 의 실제 반환값으로 한다(둘 다 iOS 쪽에서 원자적으로 결정).
  - 따라서 조회 직후 통화가 끝나는 경합이 생기지 않는다. 보고 순간 이미 끝났으면 「새 통화」로 돌아오고, 우리가 즉시 종료한다.
- **두 delegate 의 호출 관계**: 헤더에 명시가 없다. 두 메서드를 모두 구현하되 하나의 처리 함수로 모으고, 같은 푸시(세션 ID + kind + 1초 내)를 두 번 처리하지 않도록 막는다. 실기기에서 어느 쪽이 불리는지 로그로 확정한다(V0).
- **잠깐 비치는 화면**: 「이미 끝난 통화 + 앱 뒤」에서만 무음 보고 → 즉시 종료가 남는다(iOS 가 요구하는 경우). 그 밖의 경우(진행 중 통화·앱 앞)는 이제 화면이 비치지 않는다.

**수정 범위 (확정)**
- `ios/App/App/Push/VoIPPushRegistry.swift`: 새 delegate 추가(`@available(iOS 26.4, *)`), 기존 delegate 와 공통 처리 함수, completion-only 4분기를 위 규칙으로 교체, 중복 처리 방지.
- `ios/App/App/Push/CallKitProvider.swift`: `reportIncomingCall` 의 「이번 보고로 생긴 통화」 즉시 종료 경로(L1), 중복 오류 구분 로그.
- 계약 테스트 1개(`ios-post-terminal-winner-suppressed-contract.test.ts`) 갱신. 단독 커밋, 빌드 1.2 (9).
- A1 서버 보호와 다른 통화 수정은 건드리지 않는다. **이 보완 확인 전에는 구현·main 반영·설치를 하지 않는다.**

**검증 (V1~V7 + 추가)**
- **V0**: 모든 VoIP 마다 콘솔에 「어느 delegate · mustReport 값 · 취한 동작 · `reportNewIncomingCall` 반환값(성공/오류 코드)」을 1줄로 남긴다. 시험 전체에서 수집한다.
- **핵심 판정 3가지**
  1. 중복 UUID 보고 시 iOS 반환값(오류 코드)과 그 뒤 앱 강제 종료 여부
  2. VoIP 처리 후 `Process exited … SIGABRT`·`0xBAADCA11`·`will not be launched`·`dropped on the floor` = 0
  3. 끝난 통화 화면 잔존 0 · 진행 중 통화가 끊긴 사례 0
- 각 결과는 iPhone 콘솔·CallKit 반환값·callId·운영 DB(`notification_deliveries`)로 대조한다. PASS 전에는 A2 완료를 선언하지 않는다.

**A2 구현·로컬 검증 결과 (2026-10-23 · 작업 폴더 커밋 `ce543c816` · main 미반영 · iPhone 미설치)**
- **변경**: `VoIPPushRegistry.swift` · `CallKitProvider.swift` · 빌드 번호 8 → 9 · 계약 테스트 3개.
  - 승인 범위는 「계약 테스트 1개」였다. 같은 「보고 없이 완료」 동작을 잠근 테스트가 2개 더 있어(`call-v4-import-guard` · `ios-answered-elsewhere-callkit-mapping` AE11) 의도(무작위 UUID 금지 · 받은 기기 통화 유지)를 유지한 채 새 규칙으로 갱신했다.
- **구현 중 발견·반영**: 진행 중일 수 있는 분기(W1·S1)에 `terminalSuppressed` 표시를 남기면, A5 의 상대 종료 정리가 「이미 끝남」으로 건너뛰어 통화가 남는다(`NativeVoiceIncomingCallCoordinator.onDisconnected`). 그래서 표시는 「이미 끝난 분기」와 「이번 보고로 새로 생긴 통화」에만 남긴다.
- **iOS 컴파일**: Xcode(SDK iOS 27.0) BUILD SUCCEEDED. 바꾼 2파일 경고 0.
  - 앱 바이너리에 iOS 가 찾는 셀렉터 `pushRegistry:didReceiveIncomingVoIPPushWithPayload:metadata:withCompletionHandler:` 가 들어 있다(이름 오타로 「불리지 않는 함수」가 되지 않았음을 확인).
- **테스트**
  - 통화·푸시·알림·인증 vitest 5331 통과.
  - 실패 17은 모두 기존 실패다: 이미지 자동 저장 15 + `native-login-interrupt-marker` 2. 둘 다 변경 전 `1b62eba4` 에서도 같은 결과(localStorage 테스트 환경 문제).
  - 계약 테스트 253 통과 · `tsc -b tsconfig.test.json` 오류 0 · eslint 오류 0.
- **배포 구분**: 네이티브 — iOS 1.2 (빌드 9).
- **미검증 (실기기 필요)**: V0~V7 전부.
  - iOS 26.4 미만 경로 안전성은 NOT_PROVEN 이며 확정하지 않는다.

**A2 실기기 1차 (2026-10-23 01:07~01:11 PHT · main `ce543c816` · iPhone 1.2 (9) 설치 확인 00:59:40)**

| callId | 시험 | 결과 |
|---|---|---|
| `f5a0e1c4` · `a2fd380b` · `938e21e4` | S→I 음성 받기 → S 종료 | 벨·연결 정상, `incoming_remote_left`(빨간 배너 경로 없음) |
| `32b40566` · `251ca413` | iPhone 거절 | 정상, 거절 VoIP 는 거절한 기기에 미발송(A1) |
| `f4f8acb2` | 벨 중 S 취소 | 취소 VoIP `mustReport=NO` 로 도착 → 벨 중 추적 통화 종료(`tracked_incoming_end`, 기존 경로) |
| `28358eeb` | 무응답 | iPhone 자체 타이머 종료(01:11:25), 부재중 VoIP 미발송, 부재중 알림 1건 |

- **V0**
  - 8개 VoIP 모두 **새 콜백(`via=metadata`)** 으로 들어왔다. 기존 콜백 호출 0, 중복 처리 0.
  - mustReport: 수신 7건 중 YES 6 · **NO 1**(`938e21e4`). NO 였어도 수신은 정상 보고·벨(정상 수신 보호 확인).
  - 벨 중 취소 1건은 NO.
- **차단 지표**: 앱 종료 기록 2건은 모두 Owner 위로 쓸어 올림(`user-quit`). `SIGABRT`·`0xBAADCA11`·`dropped`·`will not be launched`·`completion_only` = 0.
- **미실행** (1차 계획 대비): S→I 영상(2) · I→S(3) · 무응답 뒤 재발신(6 후반, 01:10:50 이후 세션 없음).
  - 01:11:47 무렵 iPhone USB 연결이 끊겨 로그도 멈췄다.
- **경합 분기**(W1·W2·S1·T1)는 아직 한 번도 타지 않았다(`v0_action` 0건) → 2차 V2~V5 로 확인한다.

**A2 실기기 2차 — 중단 (2026-10-23 02:35 PHT · 운영 장애 감지)**
- **중단 원인 = 운영 DB 장애. A2(iOS) 와 무관.**
  - V4 진행 중 Samsung 통화 생성 POST 가 응답하지 않았다(02:35:16 `create_start` → 33초 뒤 사용자 포기). 직전 통화도 생성 5.6s, 종료 PATCH 실패.
  - Supabase 로그(읽기 전용)
    - 18:33Z(02:33 PHT)부터 `canceling statement due to statement timeout`(`get_cm_bootstrap_full_snapshot`·bootstrap snapshot upsert), PostgREST `Thread killed by timeout manager`.
    - 18:38Z Realtime `IncreaseConnectionPool: Too many database timeouts`·`connection not available`.
  - 이 세션의 SQL 조회도 4회 연속 연결 시간 초과. `samarket.vercel.app` 15초 무응답(02:39 PHT).
  - Supabase 관리 상태는 `ACTIVE_HEALTHY`.
  - 요청량: edge 1분당 최대 1978건(18:17Z). 상위는 `profiles`·`community_messenger_call_sessions`·`rooms`·`participants` GET 이다. 원인(부하 출처)은 NOT_PROVEN.
- **장애 전까지 확인된 A2 동작 (iPhone 콘솔 · 2차 VoIP 38건)**
  - T1(이미 끝난 통화의 종료 VoIP) 6건이 실제로 발생했다.
    - **mustReport YES 1건** (`c1f50ee3`): 무음 보고 → `result=new_call_ended`(이번 보고로 생긴 통화만 종료).
    - **NO 5건** (`1d67783c` 등): CallKit API 없이 completion.
  - L1(끝난 통화에 늦은 수신) 1건(`5a2b…`): `ios_callkit_new_report_ended` 로 종료(무음 화면 잔존 경로 해소).
  - `SIGABRT`·`0xBAADCA11`·`dropped`·`will not be launched` = 0. 앱 종료 기록은 user-quit 2건뿐이다.
  - 참고: `ios_voip_terminal_already_suppressed … reason=completion_only` 로그 문구는 기존 문구가 남은 것이다(바로 뒤에 `v0_action` 이 실제 동작을 기록). 문구 정리는 별건.
- **미완 (2차 시점)**: V4(일부)·V5·V6·V7, 1차 남은 A1~A3 결과 대조(DB 장애로 callId 대조 불가). A2 완료 선언 안 함.

**A2 실기기 3차 — V4~V7 재개 (2026-10-23 10:27~10:48 PHT · tip `c740bd0f0` ⊇ `fe2cfefff` · 웹만 · iPhone 1.2 (9) · 방 `c202326f`)**

| 항목 | callId / 근거 | 판정 |
|---|---|---|
| V4 ×5 (받기→S 종료) | `0eb75967`(40s) · `6ce66204`(56s) · `9ae3d5ee`(41s) · `3398f4f2`(23s) · `cdc4d77b`(29s) — 전부 `ended`/`ended_by_caller` · stub 초수 일치 | **PASS** |
| V5 ×3 (무응답~30s S 취소) | `0d0eca33` · `8fe6f0f8` · `a5b06e68` — `cancelled`/`canceled` · ring≈31s · ans=false | **PASS** |
| V5 후속 수신 | `16e0e073` — `call_ringing` sent · VoIP assertion · crit 0 | **PASS** |
| V6 ×3 (앱 종료·잠금·받지 않음) | `fdeb7d71` · `5db11e67` · `26c63654` — ringing sent · cancel sent · VoIP assertion · crit 0 | **PASS** |
| V7 (전화 앱 최근) | Owner 스크린샷 10:48 PHT: `q테스트1` / **DIBAY 음성 통화** 잔여(10:46 (7)·10:37 (5)·02:35 (16) 등 빨강 부재중 묶음) | **PASS** |

- **공통**: 이 구간 iPhone 콘솔 `SIGABRT`·`0xBAADCA11`·`dropped on the floor`·`will not be launched` = **0**.
- **증거 폴더**: `tmp/verify-2026-10-23-a2-v4*` · `…-a2-v5` · `…-a2-v6`.
- **A2 전체 완료 선언**: **PASS** (V0~V7 · 2026-10-23 10:59 PHT). 참고: 1차 때 적었던 S→I 영상·I→S「미실행」은 2·3차에서 채움.

**A2 실기기 3차 보충 (2026-10-23 10:51~10:59 PHT · + 2차 DB 재대조)**

| 항목 | 근거 | 판정 |
|---|---|---|
| V1 무응답 뒤 재발신 | miss `94eefbdd` cancelled 31s · 직후 recall `c903d3e5` ringing sent+cancel · crit 0 · VoIP assertion | **PASS** |
| V1 S→I 영상 | 2차 `d3e2cebe`·`d2a0512e` answered/`ended_by_callee` (영상) | **PASS** |
| V1 I→S 음성 | 2차 `194ef6f1` initiator=`edc8c2f0` answered/`ended_by_callee` 7s | **PASS** |
| V1 I→S 영상 | 3차 `74b64af1` initiator=`edc8c2f0` video · answered · connected≈19s · `ended_by_callee` (선행 cancel `8dcd6794`·`57f7fa64` 는 USB/수락 지연) | **PASS** |
| V2 DB 대조 (2차 02:22~02:35) | 빠른 취소(≤8s) 15건 · 표본 ringing+cancel sent · 2차 콘솔 차단 0과 정합 | **PASS** |
| V3 DB 대조 | T1 `c1f50ee3` · L1 `5a2b2178` · 거절 `c191253d` deliveries 정합 | **PASS** |

#### 4-15-2. A2 CI 빌드 수정 (2026-10-23 · main `7a49e8750` · Owner 승인)
- **원인**: GitHub Actions 「Native build (APK · iOS)」 ios job 이 `ce543c816` 에서 exit 65 로 실패했다. 오류는 `VoIPPushRegistry.swift:40: cannot find type 'PKVoIPPushMetadata' in scope` 였다. CI 는 Xcode 26.3(17C529)을 쓰고(워크플로 573-575행이 `Xcode_26*` 중 최신 비베타를 고름), 이 타입은 iOS 26.4 SDK 부터 있다. 로컬 Xcode 27(Swift 6.4)에서는 통과했었다.
- **수정**: 새 delegate 를 `#if compiler(>=6.3)` … `#endif` 로 감쌌다(5줄). Xcode 26.4 이상으로 빌드하면 동작이 같고, Xcode 26.3 으로 빌드하면 기존 delegate 만 들어간다.
- **검증**
  - 로컬 Xcode 27 BUILD SUCCEEDED. 바이너리에 metadata 셀렉터가 있다.
  - vitest 실패 목록이 수정 전과 같다(32건 · 통화 무관).
  - `verify:native-version-bump` PASS.
  - Xcode 26.3 빌드 PASS 는 NOT_PROVEN 이다(GitHub 결과로만 확인 가능).
- **남은 위험**: 설치·출시용 iOS 빌드는 **Xcode 26.4 이상 필수**다. CI 산출물(26.3)에는 mustReport 처리가 없으므로 배포에 쓰지 않는다. 앱 동작은 1.2 (9) 와 같아 재설치가 필요 없다.

### 4-16. 운영 DB 장애 조사 (2026-10-23 02:33 PHT~ · 읽기 전용 · 설정 변경·재시작 없음)

**현재 상태**: 이 세션의 SQL 접속은 6회 연속 「연결 시간 초과」다. 18:35:18Z(02:35:18 PHT) 이후 postgres·pgbouncer·PostgREST 로그가 0줄이다. edge 요청은 1분당 1~8건으로 줄었고(거의 전부 실패로 추정), Realtime 은 `DatabaseConnectionDown: Database pool connection lost` 를 낸다. Supabase 관리 상태는 `ACTIVE_HEALTHY` 로 남아 있다. → **DB 가 응답을 멈춘 상태**다.

**부하 출처 (edge 로그)**
- 18:10Z 이전에는 5분당 100건 안팎이었다. 18:15Z 부터 **5분당 1,900~4,200건**으로 늘었다. 요청 주체는 거의 전부 `service_role`(Vercel 서버 함수, AWS IP)이다. 브라우저 직접 요청은 미미하다.
- 18:10~18:36Z 요청에서 식별되는 사용자·방
  - `edc8c2f0`(iPhone w테스트1) 2,021건
  - `c202326f`(두 시험 계정의 1:1 방) 1,708건
  - `9259ab7d`(Samsung q테스트1) 1,581건
  - 그 밖의 id 는 각 215건 이하
  - → **부하의 대부분이 실기기 시험 중인 두 계정과 그 방**에서 나왔다.
- 같은 시각 Samsung 발신 탭은 22회였다(02:26~02:35 PHT, V2~V4).
  - 통화 1건마다 두 기기의 홈·방 화면이 다시 불러오기(bootstrap)를 하고, 서버 함수 1회가 여러 테이블을 조회한다.
  - 상위 조회: `profiles` 상태 확인 1,480 · `call_sessions` 1,020 · `rooms` 1,006 · `participants` 888.

**느린 쿼리 (서버 함수 누적 시간 기준 · 18:15~18:36Z)**

| 요청 | 건수 | 평균 | 누적 |
|---|---|---|---|
| `GET profiles` | 1,480 | 214ms | 317s |
| `POST community_messenger_bootstrap_snapshots` (upsert) | 109 | **2,478ms** | 270s |
| `POST rpc/get_cm_bootstrap_full_snapshot` | 78 | **2,920ms** | 228s |
| `POST rpc/get_chat_rooms_snapshot` | 71 | 1,324ms | 94s |
| `POST trade_chat_rooms_snapshots` | 69 | 1,253ms | 86s |
| `POST rpc/get_cm_bootstrap_critical_snapshot` | 41 | 1,415ms | 58s |

- `statement timeout`(57014) 은 **메신저 홈 전체 스냅샷 RPC 와 그 저장 upsert** 에서 났다. 18:15Z 2건 → 18:30Z 8건.
- PostgREST `Thread killed by timeout manager` 는 18:15Z 구간에 45건이다(그 전에도 5분당 1~9건이 꾸준히 있었다 → 장애 전부터 느린 요청이 있었다).

**연결 수**
- `pg_stat_activity` 는 DB 접속 불가로 조회하지 못했다(NOT_PROVEN).
- Realtime 이 18:35Z 부터 `IncreaseConnectionPool: Please increase your connection pool size`·`Too many database timeouts`·`connection not available and request was dropped from queue` 를 반복한다.
- pgbouncer 로그는 storage 관리자 연결의 정상 열고 닫음뿐이며 18:35:18Z 에 끊긴다.

**판단 (증거 범위 안)**
1. 직접 계기: 짧은 시간에 반복된 실기기 통화 시험(V2: 1초 내 취소 연속 등)이 두 기기의 홈·방 bootstrap 재조회를 연달아 일으켰다. 그중 **2~3초 걸리는 홈 전체 스냅샷 RPC·upsert 가 statement timeout 에 걸렸다.**
2. 시간 초과 → 재시도 → 동시 실행 증가로 연결이 고갈된 것으로 보인다(Realtime 연결 부족 로그). 18:35Z 이후 DB 가 응답을 멈췄다.
3. 사용자 2명 · 통화 22회에 DB 가 멈춘 것은 **부하 대비 DB 처리 여유가 매우 작다**는 뜻이다. 원인은 둘 중 하나 또는 둘 다다: 홈 전체 스냅샷의 쿼리 비용, 인스턴스 크기. 인스턴스 사양·CPU·메모리 지표는 조회 권한이 없어 NOT_PROVEN.
4. A2(iOS) 변경은 서버 쿼리를 바꾸지 않으므로 직접 원인이 아니다. 다만 시험 방식(짧은 간격 연속 통화)이 부하를 만들었다.

**필요한 조치 (Owner 권한)**
- DB 가 지금 응답하지 않는다. 복구는 Supabase 대시보드에서만 가능하다(프로젝트 재시작 또는 인스턴스 상태·지표 확인). 이 세션은 승인 없이 하지 않는다.
- 복구 뒤 원인 확정을 위해 읽기 전용으로 확인할 것: `pg_stat_statements` 상위 쿼리, `get_cm_bootstrap_full_snapshot` 실행 계획, 인스턴스 CPU·메모리 그래프.
- **(후속)** Owner 가 프로젝트를 재시작해 복구함(03:07 PHT). 근본 수정은 §4-16-1.

### 4-16-1. DB 부하 근본 수정 — 로컬 구현 상태 (2026-10-23 · Cursor · 미커밋)

**원인 확정 (재조사 없음)**: 이벤트마다 full·critical 즉시 재계산 예약 → RPC/upsert 폭증 → timeout → 연결 고갈.

**로컬 코드 (미커밋 · main 미반영)**
| 변경 | 내용 |
|---|---|
| `full-bootstrap-snapshot-cache.ts` · `cm-bootstrap-snapshot-cache.ts` | 무효화 = watermark bump + single-flight drop. **eager `schedule*Refresh` 제거** |
| `bootstrap-snapshot-invalidation.ts` | 사용자당 watermark coalesce · fence helpers · unacked(인스턴스 로컬) |
| `full-bootstrap-snapshot.ts` · `cm-bootstrap-snapshot.ts` | 홈 조회 시 1회 재계산 · fenced upsert · 응답 직전 fence · 재시도 ≤2 |
| `20270608120000_cm_bootstrap_snapshot_watermark_fence_rpc.sql` | advisory-lock watermark/upsert RPC (**ops 미적용**) |
| 테스트 5파일 | invalidate / fence / multi-instance / budget — **27 PASS** (2026-10-23 04:20 PHT 재확인) |

**커밋 분리 판정**
- **커밋 A (메신저)**: 위 스냅샷 캐시·재계산 구조. 통화 벨·CallKit·VoIP/FCM·상태 전이 코드 미변경.
- **커밋 B (통화 경로)**: **불필요.** `call_stub` append 는 full/cm invalidate 를 직접 호출하지 않음(room bump → room bootstrap 만). 메시지·읽음·peer hub 의 full 즉시 재계산은 커밋 A 의 공유 invalidate 로 제거됨. 통화 동작 변경 금지 유지.

**요청 수 (로컬 mock)**
| 시나리오 | Snapshot RPC(즉시) | watermark |
|---|---|---|
| 메시지 1 · peer 2 (RPC 미적용) | 0 | probe+upsert |
| 연속 50·100 invalidate | 0 | 각 1회 coalesce |
| RPC 적용 시 1유저 | 0 | RPC 1 · upsert 0 |

**잔여**
| | |
|---|---|
| **BLOCKED** | ops 마이그레이션 미적용 → 서버리스 전역 원자성 미완성(watermark 쓰기 실패 시 타 인스턴스가 구 스냅샷을 fresh 로 볼 수 있음) |
| **잔여 부하(범위 밖·측정만)** | `home-sync-snapshot-cache`·`room-bootstrap-snapshot-cache` 는 여전히 eager refresh. 장애 상위 4쿼리의 full/critical 과는 별 경로. 이번 커밋에 넣지 않음. |
| **NOT_PROVEN** | Production 런타임 · 실기기 · ops 적용 후 `pg_stat_*` |

**해제 조건 (Owner)** — **충족 · 실행 완료 (2026-10-23 ~04:45 PHT)**
1. ops 마이그레이션 `20270608120000` 적용 + `NOTIFY pgrst` + smoke(`written` / `skipped_stale_race`) **PASS**
2. 커밋 A main 반영: **`fe2cfefff`** (`fix(messenger): Snapshot watermark fence로 즉시 재계산·API 폭증 차단`) · `origin/main` 동일 · 네이티브 파일 없음 · `[배포 구분] 웹만`

**배포 직후 DB (읽기 · 04:45 PHT)**
| 항목 | 값 |
|---|---|
| 연결 | total 23 · active 2 · idle 20 (장애 직후 여유 42/60 대비 안정) |
| watermark RPC | 존재 · service_role EXECUTE · smoke PASS |
| `pg_stat_statements` full/critical | 누적 138 / 84 (재시작 전 구간 잔존 가능) · 신규 코드 트래픽 대비 감소는 **Production 런타임 재측정 필요** |
| Production 런타임 · 실기기 정확성 | **NOT_PROVEN** (Vercel 배포·앱 재시작 후 Owner 확인) |

다음(당시): Production SHA=`fe2cfefff` 확인 후 A2 실기기 §4-15-1 **V4~V7 재개** → **완료** (10:59 PHT).  
**현재 다음 단계 = A6 (§4-17).** A1~A5·A2 V0~V7 재구현·재감사 금지.

---

### 4-17. A6 — iPhone 음성 스피커·음소거 (CALL-6 · **Owner 승인 전 구현 금지**)

**위치 (2026-10-23 11:17 PHT):** A1~A5·A2 V0~V7 PASS 보존. 메신저 B~F·A7 미착수.  
**목표 tip 기준:** main/`origin` tip 당시 `c740bd0f0` (+ docs `359fc65cd`). 설치 iOS **1.2 (9)**.

#### 1) 결함

iPhone **음성** 통화 화면의 스피커·음소거 버튼이 **UI(chrome)만 토글**되고, Agora/오디오 세션에는 반영되지 않는다.

#### 2) 증상·원인 (코드 재확인 · 2026-10-23)

| 근거 | 내용 |
|---|---|
| UI | `NativeVoiceCallViewController.swift` `onSpeakerTapped` / `onMuteTapped` (≈237–250행): `speakerEnabledChrome`·`micMutedChrome` 토글 + `updateControlChrome`만. 엔진·오디오 세션 호출 **0** |
| 음성 엔진 | `NativeVoiceCallAgoraEngine.swift`: `muteLocalAudioStream` / `setEnableSpeakerphone` API **없음** (join/leave/RTC delegate만) |
| CallKit | `CallKitProvider.swift`: `CXSetMutedCallAction` 처리기 **0** (Start/Answer/End만) |
| 대조 — 영상 iOS | `NativeVideoCallAgoraEngine.setMicMuted` → `muteLocalAudioStream` **있음** |
| 대조 — Android 음성 | `NativeVoiceCallAgoraEngine.setSpeakerEnabled` / `setMicMuted` **있음** (정상 참고 구현) |
| 실기기 | 계획서 원문: Owner 보고만. **재측정 NOT_PROVEN** → A6 구현 전·후 실기기로 확정 |

판정: **코드 원인 확정.** 실기기 청각 재현은 구현 직전 1회 + PASS 판정 시 행렬로 닫는다.

#### 3) 수정 범위 (승인 후 · 단독)

| 파일 (예상) | 변경 |
|---|---|
| `ios/.../NativeVoiceCallAgoraEngine.swift` | `setSpeakerEnabled(_:)` · `setMicMuted(_:)` 추가 (Android/영상과 동일: Agora API, occupant guard, result==0만 성공, 로그) |
| `ios/.../NativeVoiceCallViewController.swift` | 탭 시 엔진 호출 → **성공 시에만** chrome 토글. 실패 시 chrome 유지 + 로그 |
| (선택) `DibayCallAudioSessionController` | 스피커 ON 시 `overrideOutputAudioPort(.speaker)`, OFF 시 `.none` — **외부 BT/유선은 preserve** (기존 ringback 정책과 동일). Agora `setEnableSpeakerphone`과 이중 적용 시 충돌 여부를 실측으로 확인 |
| CallKit `CXSetMutedCallAction` | **이번 A6에 넣지 않음** (별도 원인·별도 커밋). 시스템 음소거 버튼과 in-app 동기화는 A6 이후 필요 시 |

**하지 않음:** Android 음성/영상 · iOS 영상 · 웹 call-v4 · 세션 API · VoIP/FCM · A5 종료 경로 · A7 토큰.

#### 4) 영향표 (기존 정상 기능 보호)

| 기능 | 영향 | 보호 |
|---|---|---|
| S↔I 음성 발신·수신·연결·종료·재발신 (A2) | 연결 중 오디오 라우트/마이크만 | 기본 수신기·unmute 유지. 실패 시 chrome만 안 바꿈 |
| iOS 영상 음소거/카메라 | 없음 (파일 분리) | 수정 금지 |
| Android 스피커·음소거 | 없음 | 수정 금지 · 회귀 1회만 확인 |
| CallKit 수신·벨·수락 | 세션 기본 category 유지 | 연결 후 사용자 탭에만 override |
| 잠금·백그라운드·앱종료 수신 | 경로 미변경 | A2 행렬 샘플 재확인 |
| BT 헤드셋 | 강제 스피커 시 라우트 변경 가능 | 외부 라우트면 override 생략(Android/ringback과 동일 정책) |

#### 5) 롤백·복구

- 단독 iOS 네이티브 커밋. FAIL 시 **forward fix** 또는 해당 커밋만 revert (A1~A5·A2 코드로 되돌리지 않음).
- 설치: `native:prepare` 후 iOS 빌드 번호 **10** (현재 1.2 (9)). 테스트 기기만.

#### 6) 실기기 검증안 (PASS 조건)

기기: Samsung q테스트1 · iPhone w테스트1 · 방 `c202326f`. Production tip 매 시험 기록.  
행렬 (음성만 · 발신·수신 각 1회 이상):

| # | 시나리오 | PASS |
|---|---|---|
| 1 | S→I 음성 연결 후 I 스피커 ON → 수화기→스피커 청각 변화 · 로그 `speaker_toggle`/`audio_route_applied` | 청각+로그 |
| 2 | 같은 통화 스피커 OFF → 수신기 복귀 | 청각+로그 |
| 3 | I 음소거 ON → S에서 I 음성 무음 · 로그 `native_voice_mic_mute_applied muted=true` | 청각+로그 |
| 4 | 음소거 OFF → 음성 복귀 | 청각+로그 |
| 5 | I→S 음성에서도 1~4 동일 | 동일 |
| 6 | 종료 후 즉시 재발신 · 벨·연결 정상 (A2 회귀 샘플) | 연결 PASS |
| 7 | 영상 1회: 기존 마이크 토글 정상 (무회귀) | 영상 mic PASS |
| 8 | Android 음성 스피커/음소거 1회 (무회귀) | Android PASS |
| — | 치명 | `SIGABRT`·`BAADCA11`·`dropped`·`will not be launched` = 0 |

Chrome만 바뀌고 청각/로그가 없으면 **FAIL**.

#### 7) 승인 게이트

- Owner 승인(2026-10-23 11:22 PHT) → **구현 진행**.
- 구현 후: `native:prepare`(iOS **1.2 (10)**) → Xcode 설치 → 실기기 §4-17-6 → PASS 후 **A7만** 진행.

#### 8) 구현 기록 (코드 · 2026-10-23)

| 파일 | 변경 |
|---|---|
| `ios/.../NativeVoiceCallAgoraEngine.swift` | `setSpeakerEnabled(_:)` → `setEnableSpeakerphone` · `setMicMuted(callId:muted:)` → `muteLocalAudioStream` (result==0만 성공, occupant guard, 로그) |
| `ios/.../NativeVoiceCallViewController.swift` | 탭 → 엔진 성공 시에만 chrome 토글 |
| CallKit / Android / iOS 영상 / AVAudioSession override | **미변경** (계획 범위) |

- 커밋: `5bd9ee492` (+ 더블체크 로그 정정 후속). 버전은 **설치용 `native:prepare` 때** iOS만 +1 → **1.2 (10)**.

#### 9) 코드 더블 체크 (실기기 전 · 2026-10-23 11:30 PHT)

| 항목 | 결과 |
|---|---|
| Agora SDK 서명 | `AgoraRtcEngineKit.h`: `setEnableSpeakerphone:` → `Int` (0 성공) · `muteLocalAudioStream:` → `Int` (0 성공). Swift `NS_SWIFT_NAME`과 일치. **영상 iOS·Android 동일 API 사용 중** |
| 호출 시점 | 스피커: join **후** (SDK 문서). 연결 전 탭 → occupant/join 전이면 result&lt;0 또는 not_occupant → chrome 유지. 음소거: UI `micChromeEnabled`(connected만) |
| UI↔오디오 | VC는 `applied==true`일 때만 chrome. 실패 경로에서 아이콘만 바뀌는 경우 **없음** |
| 종료 직후 | `leave` 후 `engine`/`activeCallId` nil → 두 API `false` 반환 · 안전 |
| CallKit/세션 | A6가 CallKit·`DibayCallAudioSessionController` **미수정**. 라우트는 Agora `setEnableSpeakerphone`만 (Android 음성 패리티). CallKit 충돌 여부는 **실측** |
| diff 범위 | `5bd9ee492`: 계획서 + 음성 엔진/VC **2 Swift만**. Android·영상·서버·푸시·상태전이 **0** |
| 로그 정정 | 실패 시에도 `audio_route_applied`를 찍던 경로 제거 → 성공 + `isSpeakerphoneEnabled` 확인만 |

- **코드 더블 체크:** PASS (정정 포함).
- **실기기 §4-17-6 (2026-10-23 11:38 PHT):**
  - 설치: 로컬 `xcodebuild` Debug → **덮어설치** `com.dibay.app` **1.2 (10)** 확인 (`pymobiledevice3 apps query`). `native:prepare` 는 origin 미푸시(ahead)로 미실행 — 검증용 로컬 빌드.
  - S→I 음성: Samsung UI `통화 중`·`스피커`/`음소거`/`종료` 확인 (연결 증거). 종료 탭으로 종료.
  - **iPhone 스피커·음소거 실청각·`speaker_toggle`/`audio_route_applied`/`native_voice_mic_mute_applied` 로그: NOT_PROVEN** — iOS 17+ DVT/HID에 `tunneld`(sudo) 필요, 이번 세션에서 iPhone in-app 탭 자동화 불가. 아이콘만으로 PASS 금지 원칙 적용.
  - I→S · 반복 조작 · 잠금/BG · 영상·Android 회귀 행렬: **미완 (STOP)**.
  - **A6 PASS 아님.** main 반영 요청 보류. A7 금지.
  - **로컬 ahead 분해 (origin `c740bd0f0` 대비, 2026-10-23):**  
    1. `359fc65cd` docs — A2 V0~V7·§3-1 기록 (A6 코드 아님)  
    2. `5bd9ee492` A6 iOS 엔진·VC  
    3. `fc7199736` A6 로그 정정  
    4. `15a08380c` iOS 빌드 10  
    5. `7c7154d44`(+후속) docs — 더블체크·NOT_PROVEN  
    → A6 **코드**는 2~4. 1·5는 문서. 무관 제품 코드 커밋 없음. Android/서버 미포함.

#### 10) 별도 결함 (본 A6에 섞지 않음 · 대장)

| ID | 요약 | 상태 |
|---|---|---|
| SIDE-01 | Android 음성 음소거 실기기 FAIL · 원인 A/B/C 미확정 | `EVIDENCE_NEEDED` — A6 iOS와 분리 |
| SIDE-02 | 음성→영상 전환 버튼 없음 (의도적 미배선) | `DEFERRED` |

상세: `docs/audit/messenger-side-defect-ledger-2026-10-23.md`.

#### 11) 실기기 §4-17-6 진행 기록 (2026-10-23 14:27~14:31 PHT)

| # | 시나리오 | 결과 | 증거 |
|---|---|---|---|
| 설치 | iOS **1.2 (10)** 덮어설치 | PASS | `pymobiledevice3 apps query` CFBundleVersion=10 |
| 1 | S→I 음성 · 스피커 ON/OFF · 음소거 ON/OFF · **실청각** | **PASS** | 로그 `native_voice_mic_mute_applied` muted true/false result=0 · `speaker_toggle enabled=true result=0` · Owner 「모두 정상」 |
| — | 스피커 `isSpeakerphoneEnabled` | 참고 | `audio_route_applied … confirmed=false` 였으나 Owner 청각상 스피커 정상 → CallKit 조회 불일치, 기능 PASS는 청각 우선 |
| 4 | 종료 후 즉시 재발신 S→I | **PASS** | 재발신 `통화 중` 도달 |
| 2 | I→S 음성 동일 | **NOT_PROVEN** | 미실행 |
| 5 | 잠금·BG CallKit | **NOT_PROVEN** | 미실행 |
| 6 | 영상·Android 무회귀 1회 | **NOT_PROVEN** | 미실행 (Android 음소거는 SIDE-01, A6 diff 밖) |
| 7 | 종료 후 오디오 세션 정리 | **부분** | 종료 후 채팅방 복귀 확인 · leave 로그 수집 불완전 |

- **판정:** A6 **아직 전체 PASS 아님**. S→I 핵심(스피커·음소거 실청각) PASS. 잔여 2·5·6 후 Owner 승인·main.
- **main 반영:** 금지(잔여 + 미승인). **A7 금지.**

---

## 5. 메신저 설계 방향 (단계 C 에서 기준선 FAIL 로 확정 후 상세화)
1. **타임라인 병합·실시간**
   - pending·failed 행은 서버 확인(id·cid 일치) 전까지 상태를 바꾸지 않는다(M-2).
   - bump 는 프레임 단위로 버리지 않고 큐에 모아 처리한다(M-3).
   - 서버는 저장 직후 bump 를 먼저 발행하고, 푸시는 그 뒤 `after()` 로 보낸다(M-1). 이는 `docs/messenger-realtime-policy.md` 의 「서버만 bump」 계약을 유지한다.
2. **삭제·모더레이션**: 전체 삭제할 때 그 메시지를 인용한 답장 미리보기를 「삭제된 메시지」로 바꾼다(D-1). 앨범 조회에 삭제·관리자 숨김 조건을 추가한다(A-1).
3. **차단**
   - 차단 게이트를 `samarket-three-chat-pillars` 기준 community 1:1 에만 적용한다. 주문·거래 채팅은 유지한다(D1).
   - 방 숨김은 차단한 사람 쪽만 한다(D2).
   - 해제 경로 3곳 모두 같은 복원 함수를 쓴다(F-1).
4. **입력창**: 모바일에서 Enter 는 줄바꿈, 전송은 버튼만(D3). 수정 실패 시 입력 내용을 복원한다. 이모지 시트는 수정 모드와 분리한다.
5. **목록 스와이프**: 열림 상태의 단일 소유자를 정한다. 외부 탭·스크롤·cancel 때 닫는다. 열린 행이 있을 때 탭하면 먼저 닫는다. 주문 채팅에서 사장님 나가기를 막는다.
6. **친구 요청 (Owner 요구 · 기능)**: 요청 저장(DB) → 상대 기기 실시간 중앙 팝업(수락/거절) → 수락 시 양쪽 행 생성. `docs/community-messenger/friend-contact-ssot-lock.md` 의 단방향 LOCK 정책을 바꾸는 일이므로 별도 설계 문서와 DB 승인이 필요하다. 기존 중앙 팝업 셸(`MessengerFriendAddSheet` `anchor="center"`)을 재사용한다.
- 묶음마다 공통 조건: 단독 커밋·단독 반영, 관련 vitest 잠금 테스트 추가, 메신저 시나리오 M/N/O/P 중 해당 항목 실기기 PASS.

---

## 6. 이전 문서 주장 중 현재 코드와 다른 것
1. 「`call_answered_elsewhere` 는 a077795 로 수정됨」: 되돌림으로 **없어졌다.** 지금은 받은 기기에도 발송한다.
2. 계획 v2 §3-1 서버 수정(`539dfd22`): Production 에 없다.
3. 「음성만 상대 퇴장을 실패로 처리 · 발신 코디네이터도 동일 수정」: 실패 처리는 **음성 수신에만** 있다. 발신은 QUIT 를 이미 정상 처리한다.
4. 「취소·종료 VoIP 가 발신자 iPhone 에 감」: 아니다. 취소·종료는 상대에게만 간다. 발신자 기기가 받는 종료류는 거절뿐이다.
5. 「친구 추가 모달이 하단 시트」: 현재 추가 모달은 이미 **중앙 팝업**이다. 없는 것은 요청·수락 흐름이다.
6. M-13(스티커·공유 bump throw → 500): 결함 아니다. 내부에서 catch 한다.

## 7. 별건 (보고만)
- vitest `lib/community-messenger/attachment/__tests__/messenger-image-auto-save*.test.ts` 15건 실패는 기준점 `a44a9d1b` 에서도 같다. 이번 범위 밖이다.

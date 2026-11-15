# 통화 중 수신 — 재감사 · 레거시 원문 대조 · 설계안 (v3, 2026-11-15 PHT)

> 상태: **보고만 (구현·커밋·배포 없음).** 통화 변경 규정 3번 — Owner 승인 후 구현.
> 기준: DIBAY `origin/main` **`f2da2c642`**(2026-11-15 14:20 PHT) · 운영 DB 읽기 전용 · Vercel 운영 환경변수(이름·대상만, 값 미확인).
> 레거시 원문: Telegram Android `21f7d109da` · Signal Android `5e03b75f02` · WhatsApp 공식 도움말 · Apple CallKit 문서.
> 실기기: **측정 안 함 — 화면 판정은 전부 NOT_PROVEN.** 아래 PASS/FAIL 은 코드·운영 DB 판정.

## 0. 내 잘못 먼저 (v1·v2 정정)
| # | v1·v2 에 쓴 것 | 사실 (v3 확인) | 근거 |
|---|---|---|---|
| E1 | 「통화 중 발신 시 발신자(A) 기기에 『통화 중』 채팅 줄이 로컬로 추가된다」 | **틀림.** `appendLocalCallChatMessage` 는 문구만 계산하고 개발 모드 기록만 남긴다 — 화면에 아무 줄도 넣지 않는다. A 의 채팅방에도 **아무것도 안 남는다** | `lib/community-messenger/call-chat-local-append.ts:167~` (함수 끝까지 저장·표시 호출 없음) |
| E2 | v2 D7 「로컬 줄과 서버 기록 중복 방지」 | E1 때문에 **필요 없음** — 설계에서 뺀다 | 같음 |
| E3 | 웹 경합 경로 「거절」 기록(F4)을 앱 전체 결함처럼 씀 | 이 경로(`GlobalCommunityMessengerIncomingCall`)는 **Android·iOS 앱에서 안 씀**(앱은 CallV4). 데스크톱 웹 브라우저에서만, 그것도 운영 환경변수 `NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE` 이 꺼져 있을 때만 쓰임 — 값은 민감 값이라 **확인 못 함** | `components/layout/providers/CallIncomingChrome.tsx:82~95` · `lib/call/native/legacy-web-call-establishment-removed.ts` |
| E4 | v1 「Telegram 도 대기 UI 없음」까지만 | v2 에서 정정: Telegram 은 통화 중이던 사람에게 **「거절된 통화」** | §1-1 |
| E5 | 발신 경로 1곳만 봄 | 발신 진입점 **2곳**(CallV4 `call-v4-actions.ts:780` · 기존 `call-session-navigation-seed.ts:570`) — 둘 다 같은 서버 API(`rooms/[roomId]/calls`)를 부르므로 서버 수정 하나로 함께 따라감 | 코드 |

## 1. 레거시 원문 — 정확한 형태

### 1-1. Telegram Android (`DrKLO/Telegram@21f7d109da`)
| 단계 | 원문 | 동작 |
|---|---|---|
| B 기기 판정 | `MessagesController.java:20585` `if (svc != null \|\| VoIPService.callIShouldHavePutIntoIntent != null \|\| !callStateIsIdle)` | Telegram 통화 중 · 다른 Telegram 수신 처리 중 · **일반 전화 통화 중**(`TelephonyManager` 20565~20578) |
| B 기기 처리 | `20597` `req.reason = new TLRPC.TL_phoneCallDiscardReasonBusy()` → `discardCall` | **B 기기가 스스로 자동 거절**, 벨·수신 화면 없음 |
| A 화면 | `VoIPService.java:1870~1876` `dispatchStateChanged(STATE_BUSY)` · `soundPool.play(spBusyId…)` · 1.5초 후 종료 | 발신 화면 「통화 중」 + 통화 중 신호음 1.5초 |
| A 채팅방 기록 | `MessageObject.java:5786~5798` (보낸 사람·사유 Busy) | **「Outgoing Call」(발신 통화)** |
| B 채팅방 기록 | `MessageObject.java:5807~5812` `else if (call.reason instanceof TL_phoneCallDiscardReasonBusy)` → `CallMessageIncomingDeclined` | **「Declined Call」(거절된 통화)** — 부재중 아님 |
| B 알림 | `NotificationsController.java:2016~2021` 통화 기록 알림 문구는 사유와 무관하게 「Missed Call」 | 알림을 보낼지는 서버 결정. 공식 API 문서(`core.telegram.org/api/end-to-end/voice-calls`)에도 Busy 처리 설명 없음 → **NOT_PROVEN** |
| 대기 통화 | `VoIPService.onCallUpdated` 다른 통화 id 무시 · `invitingCall` 주석 처리 | **없음** |

### 1-2. Signal Android (`signalapp/Signal-Android@5e03b75f02`)
| 단계 | 원문 | 동작 |
|---|---|---|
| B 가 통화 중(발신 중·울리는 중·연결 중 모두) 새 통화 받음 | `ActiveCallActionProcessorDelegate.java:140~170` `handleReceivedOfferWhileActive` | 기존 통화 그대로 · `insertMissedCall(remotePeer…)` · 새 통화만 `terminate` |
| B 기록·알림 | `SignalCallManager.java:1148` → `CallTable.kt` `insertOneToOneCall`(Direction.INCOMING, Event.MISSED) → `messages.insertOneToOneCallLog` → `messageNotifier.updateNotification` | **B 대화방에 「부재중」 + 알림** |
| 일반 전화 통화 중 | `WebRtcActionProcessor.java:196~200` `isAnyPstnLineBusy` → `handleSendBusy` + `insertMissedCall` | 통화 중 신호 + **B 부재중** |
| A | `ActiveCallActionProcessorDelegate.java:199~203` `REMOTE_BUSY` → `receivedBusy()` · `OutgoingRinger.Type.BUSY` | 통화 중 신호음 |
| 대기 통화 | 1:1 은 항상 위 처리 | **없음** |

### 1-3. WhatsApp — 공식 도움말 「How to use call waiting」(Android·iOS)
- 통화 중 다른 WhatsApp 통화가 오면 **알림이 뜨고 기존 통화는 끊기지 않는다.**
- **「Answer」(또는 「End & Accept」) = 기존 통화 종료 + 새 통화 받기 / 「Decline」 = 새 통화 거절, 기존 통화 유지.**
- 일반 전화가 WhatsApp 통화 중 올 때도 같은 두 선택.
- 보류(hold)·무응답 시 처리: 도움말에 **없음(NOT_PROVEN)**.

### 1-4. Apple CallKit (공식 문서)
- `CXProviderConfiguration.maximumCallGroups` 기본 **2**, `maximumCallsPerCallGroup`, `CXCallUpdate.supportsHolding`(보류 가능 여부).
- DIBAY: `maximumCallsPerCallGroup = 1`(`ios/App/App/Push/CallKitProvider.swift:44`), `supportsHolding`·`supportsGrouping`·`maximumCallGroups`·`CXSetHeldCallAction` **설정 0건** → 보류·대기 처리 없음. 두 번째 통화를 CallKit 에 보고했을 때 시스템 화면 형태는 **실측 안 함(NOT_PROVEN)**.

### 1-5. 카카오톡 — 공식 문서 없음, 실측 안 함 **NOT_PROVEN**

### 1-6. 요약
| | B 채팅방 기록 | B 알림 | A 화면 | 대기 통화 | 일반 전화 중 |
|---|---|---|---|---|---|
| Telegram | 거절된 통화 | NOT_PROVEN | 통화 중 + 신호음 | 없음 | 자동 거절 |
| Signal | **부재중** | 있음 | 신호음 | 없음 | 통화 중 + 부재중 |
| WhatsApp | NOT_PROVEN | 있음(대기 알림) | NOT_PROVEN | **거절 / 종료 후 받기** | 같은 두 선택 |
| Owner 지시 | **부재중** | — | — | 확인 요청 | — |

## 2. DIBAY 현재 구현 — 줄 단위 (`f2da2c642`)

### 2-1. 발신 → 판정
1. 앱 발신: CallV4(`call-v4-actions.ts:704` `callV4CreateSession`) · 기존(`call-session-navigation-seed.ts:~545` fetch) → 둘 다 `POST /api/community-messenger/rooms/[roomId]/calls`.
2. 라우트(`app/api/community-messenger/rooms/[roomId]/calls/route.ts:74`) `reconcileUserLiveCallSessions(발신자)` → `startCommunityMessengerCallSession`(`service.ts:20496`).
3. 판정(`service.ts:20730~20800`, 1:1 방만):
   | 조건 | 결과 |
   |---|---|
   | 같은 방 살아 있는 통화(heartbeat 생존) | `caller_busy` |
   | A 가 다른 방 1:1 `ringing`/`active` | `caller_busy` |
   | **B 가 다른 방 1:1 `ringing`/`active`** (B 발신 중·울리는 중·연결 중 모두) | **`peer_busy`** |
   - 판정 테이블 `community_messenger_call_sessions` `session_mode = 'direct'` 만 봄 → **그룹 통화 참여 중인 B 는 통화 중으로 판정 안 됨**(§5).
4. `rejectStartCallPeerBusy`(20419) → `persistBusyCallAttemptForCaller`(20320): 세션 1행 `status=cancelled`·`ended_reason=peer_busy|caller_busy`·`started_at=ended_at` + `createCommunityMessengerCallLog(projectCallStub:false)`(통화 기록 1행, `caller_user_id=A`·`peer_user_id=B`). 수신 VoIP/FCM(`startIncomingCallVoipDispatchDetached`)은 **호출 안 함**(라우트 `result.ok=false` 로 반환).
5. 응답 `400 { ok:false, error:"peer_busy", busyKind, busyRecord:{sessionId, callLogId} }`.

### 2-2. A 가 보는 것
| 표면 | 현재 | 근거 |
|---|---|---|
| 발신 화면 | **안 열림** | API ok:false |
| 안내 | 앱 안 안내 1회 「상대방이 현재 통화중입니다.」(본인 통화 중이면 다른 문구) | `call-v4-actions.ts:802` · `call-session-navigation-seed.ts:605` `showCallInAppNotice` |
| 통화 중 신호음 | **없음** | `busy_tone\|BUSY_TONE\|playBusy` 0건 |
| 채팅방 | **아무것도 없음** (E1) | `call-chat-local-append.ts` |
| 통화 기록 탭 | 「통화 중」 1줄 | `service.ts:4562` 필터 통과(A=caller) · `call-log-display-type.ts:34` `remote_busy` |

### 2-3. B 에게 아무것도 안 남는 이유 (전수 7곳)
| # | 위치 | 막는 것 |
|---|---|---|
| X1 | `service.ts:20379·20414` `projectCallStub: false` | 공유 채팅방 기록 생성 안 함 |
| X2 | `call-authority/call-chat-projection-authority.ts:152` `if (input.canonical === "busy") return false` | X1 을 풀어도 투영 거부 |
| X3 | `call-callee-missed.ts:60~72` `callStubIncrementsCalleeUnread` | `missed`·발신자 취소만 B 안 읽은 수 +1 |
| X4 | `call-callee-missed.ts:40~52` `isMissedCallStubForViewer` | 앱 안 부재중 판정·수신음(`realtime/call-stub-receive-sound-policy.ts`)에서 제외 |
| X5 | `call-busy-attempt-record.ts:39` `shouldIncludeCallLogRowForViewer` (호출 `service.ts:4562`) | busy 통화 기록은 A 만 봄 |
| X6 | `call-missed-notification-authority.ts:71` `isRoomBoundMissedCallCandidate` + `:118` 제외 목록 `peer_busy`·`callee_busy` / `call-missed-bell-authority.ts:39` | 부재중 알림 판정 제외. 게다가 busy 저장 경로는 `scheduleRoomBoundMissedCallNotification`(`service.ts:1250`)을 **부르지도 않음** |
| X7 | `call-event-presentation.ts` `resolveCallEventCanonical` `if (ev === "peer_busy") return "remote_busy"` · `call-history/call-log-display-type.ts:34` | 보는 사람과 무관하게 「통화 중」 |

### 2-4. 부재중 알림이 생기면 B 기기에 어떻게 보이나 (코드 판정 · 실기 NOT_PROVEN)
| 플랫폼 | 경로 | B 가 DIBAY 통화 중일 때 |
|---|---|---|
| 공통 | `createAndDispatchNotificationEvent`(`service.ts:1316`) → `notification_events missed_call` 1행(중복 키 `missed_call:{세션}:{B}`) → 푸시 | — |
| iOS | `missed_call` 은 **VoIP 로 안 보냄**(`lib/push/dispatch/push-payload-types.ts:226`) → 일반 APNs | 앱이 앞이면 **시스템 배너 없음**: `capacitor.config.ts` 에 `presentationOptions` 없음 → Capacitor `PushNotificationsHandler.willPresent` 가 `[]` 반환. 앱 안 배너(`missed-call-event-banner.ts`)는 WebView 가 보일 때만. 잠금·백그라운드면 시스템 알림 |
| Android | FCM `missed_call` → `DibayFirebaseMessagingService.java:80~93` → 그 callId 만 정리(`IncomingCallTerminalHandler.handle`) + `MissedCallNotificationHelper` | `appVisible` = `MainActivity` onStart~onStop(`MainActivity.java:1360~1410`). 통화 화면(별도 화면)이 앞이면 MainActivity 정지 → **시스템 부재중 알림 표시**. 메신저 화면이 앞(통화는 PiP)이면 시스템 알림 생략 → 앱 안 배너 |
| 진행 중 통화 영향 | 다른 callId 의 알림이라 기존 통화 정리 경로를 타지 않음(코드 판정) | **실기 NOT_PROVEN** |
- 설치 앱 호환: `MissedCallNotificationHelper` 2026-06-15(`aaa7856eb`) 추가 → 운영 14일 활성 기기 전체(Android 1.2.5(37)~1.2.7(54) · iOS 1.2(21)~1.2.2(35))가 이미 처리 가능. 운영 14일 `missed_call` 발송 Android sent 66 · iOS sent 18.

### 2-5. 경합 경로 (서버 판정이 못 막은 경우만)
| 경로 | 동작 | 운영 30일 |
|---|---|---|
| 서버 `filterDirectIncomingRowsForPolicy`(`service.ts:1374~1405`) — B 가 live 인데 다른 ringing 이 목록에 있음 | 그 ringing 을 `missed` + `incoming_policy_superseded` → B 부재중 기록·안 읽은 수, **알림은 제외** | **0건** |
| Android `NativeVoice/VideoCallRuntime` `busy_suppressed` | 화면 안 띄움, 거절 안 보냄 | — |
| iOS `CallKitProvider.swift:118~130` `device_busy_live_call` | 무음 보고 후 종료 | — |
| 데스크톱 웹(기존 경로, E3) `GlobalCommunityMessengerIncomingCall.tsx:2077` | **`declined` + `reject`** → A 에게 「거절」 | `declined` 174건과 구별 불가 → NOT_PROVEN |
| 관리자 설정 `busy_auto_reject_enabled`(운영 값 `false`) | 위 웹 경로가 **이 값을 보지 않음** — 설정 화면은 `_quarantine` 격리 | 설정이 동작에 연결 안 됨 |

### 2-6. 운영 실측 (30일, 읽기 전용)
| 항목 | 값 |
|---|---|
| `peer_busy` / `caller_busy` | 24 / 13 (10-23 19:27 ~ 11-12 18:35 PHT) |
| `peer_busy` 판정 정확도 | 24건 모두 그 시각에 B 가 실제 다른 1:1 통화 중(연결 23 · B 발신 중 1). **오판 0** |
| B 쪽 기록 | 채팅방 기록 0 · `notification_deliveries` 0 · `notifications` 0 |
| 관련 사용자 | 발신자 5명 · 통화 중이던 사람 4명 · 방 5개 |
| 같은 사람에게 1분 안 2회 이상 | 1회(10-28 18:47:44·:54·18:48:01 — 17초에 3번) |
| `incoming_policy_superseded` | 0 |

## 3. 비교 · 판정
| # | 항목 | Telegram | Signal | WhatsApp | DIBAY | 판정 |
|---|---|---|---|---|---|---|
| C1 | B 채팅방 기록 | 거절된 통화 | 부재중 | NOT_PROVEN | 없음 | **FAIL** |
| C2 | B 알림 | NOT_PROVEN | 있음 | 있음 | 없음 | **FAIL** |
| C3 | B 통화 기록 탭 | 거절 | 부재중 | NOT_PROVEN | 없음 | **FAIL** |
| C4 | B 안 읽은 수·방 부재중 배지 | NOT_PROVEN | 있음 | NOT_PROVEN | 없음 | **FAIL** |
| C5 | A 채팅방 기록 | 발신 통화 | NOT_PROVEN | NOT_PROVEN | **없음**(E1) | 차이 |
| C6 | A 화면·신호음 | 통화 중 + 신호음 | 신호음 | NOT_PROVEN | 안내 1회, 신호음 없음 | 차이 |
| C7 | B 발신 중·울리는 중일 때 | 자동 거절 | 부재중 | — | `peer_busy`(같은 처리) | 일치 |
| C8 | B 일반 전화 통화 중 | 자동 거절 | 통화 중 + 부재중 | 두 선택 | 감지 코드 0건 | 차이 |
| C9 | 대기 통화 | 없음 | 없음 | **있음** | 없음 | Owner 결정 |
| C10 | 데스크톱 웹 경합 「거절」 | — | — | — | `declined` | FAIL(웹만) |

**충돌 보고(규정 7번)**
1. Owner 지시(B 에게 **부재중**) = **Signal**. **Telegram 은 「거절된 통화」**로 다르다. 11-13 「발신자 취소 → 수신자 부재중」은 Telegram 근거였으나 이번 건은 Telegram 을 따르면 지시와 어긋난다 → **지시(Signal) 를 따른다.**
2. 현재 동작은 승인된 E-C1 정책(2026-10-23 18:50 PHT, `docs/audit/messenger-2026-10-23-stage-e-c1-busy-record-design.md` 「B 에게 기록·알림·푸시 없음」)이다. 이번 지시가 이를 바꾼다.

## 4. 설계안

### 1단계 — B 에게 부재중 (Signal 형태) · 웹·서버만 · 앱 재빌드 없음 · 통화 단독 PR
| # | 변경 | 위치 | 막힘 |
|---|---|---|---|
| D1 | `busyKind="peer"` 일 때 `projectCallStub: true`(공유 채팅방 기록, 보낸 사람 = A). `caller` 는 `false` 그대로 | `service.ts` `persistBusyCallAttemptForCaller` 20379·20414 | X1 |
| D2 | 투영 판정: canonical `busy` 이면서 종료 사유 `peer_busy` → 허용, `caller_busy` → 거부 유지 | `call-chat-projection-authority.ts:152` (`shouldPersistCallStubProjection` 에 `endedReason` 입력 추가) | X2 |
| D3 | 부재중 단일 정의에 「`cancelled` + `peer_busy` 를 발신자가 아닌 사람이 볼 때 = 부재중」 추가. `callStubIncrementsCalleeUnread`(안 읽은 수) · `isMissedCallStubForViewer`(앱 안 배너·수신음)가 함께 따라감 | `call-callee-missed.ts` | X3·X4 |
| D4 | 문구: `peer_busy` + 보는 사람 B → `incoming_missed`(「부재중 음성/영상 통화」), A → `remote_busy`(「통화 중」). 채팅방 기록·채팅 목록 미리보기·통화 기록이 같은 함수 사용 | `call-event-presentation.ts` `resolveCallEventCanonical` · `call-history/call-log-display-type.ts:34` | X7 |
| D5 | 통화 기록 탭: `peer_busy` 는 B 에게도 보임(부재중), `caller_busy` 만 A 전용 | `call-busy-attempt-record.ts:39` | X5 |
| D6 | 부재중 알림: `isRoomBoundMissedCallCandidate`·`decideRoomBoundMissedCallNotification` 에 `cancelled`+`peer_busy` 포함(`caller_busy` 제외 유지) · 부재중 벨 판정 같은 처리 · `persistBusyCallAttemptForCaller` 끝에서 `scheduleRoomBoundMissedCallNotification` 호출(세션당 1건, 기존 중복 키) | `call-missed-notification-authority.ts:61~118` · `call-missed-bell-authority.ts:39` · `service.ts:20320~` | X6 |
| D7 | 데스크톱 웹 경합: `declined`+`reject` → `peer_busy` 종료로 봉인(A 「통화 중」·B 「부재중」) | `GlobalCommunityMessengerIncomingCall.tsx:2077` | C10 |

**결과 (적용 후 기대)**
| | A(발신자) | B(통화 중이던 사람) |
|---|---|---|
| 채팅방 | 「음성 통화 · 통화 중」 1줄 (**새로 생김** — Telegram 「발신 통화」와 같은 위치) | 「부재중 음성 통화」 1줄 |
| 안 읽은 수 | 변화 없음 | +1 |
| 알림 | 없음 | 부재중 1건(iOS 일반 APNs · Android FCM) |
| 통화 기록 탭 | 통화 중 | 부재중 |
| 안내 | 지금처럼 「상대방이 현재 통화중입니다.」 | — |

**바뀌지 않는 것:** 통화 중 판정 조건 · 세션 상태값 · 수신 VoIP/FCM 발송 · CallKit · Android 수신 화면 · 벨 · PiP · 연결 · 종료 · 네이티브 코드 · DB 스키마.
**지난 기록:** 지난 24건은 공유 기록이 없어 B 화면에 새로 생기지 않음. 소급 알림 없음(지난 데이터 소급 금지).
**위험**
- R1 짧은 시간 반복 발신 → B 부재중 알림 여러 건(운영 30일 1회, 17초 3건). 세션당 1건(기존 무응답 부재중·Signal 과 같음). 묶기는 계약에 없어 넣지 않음.
- R2 B 가 통화 중 iOS 앱이 앞이면 시스템 배너가 안 뜨고 앱 안 배너만(§2-4). 통화 화면 위에 앱 안 배너가 보이는지 NOT_PROVEN → V6 에서 측정, 안 보이면 FAIL 로 보고 후 별도 설계.
- R3 A 채팅방에 「통화 중」 줄이 새로 생김(지금은 없음) — 지시 범위의 부수 결과로 보고.
- 롤백: PR revert(웹 재배포만).

**시험 갱신(기존 고정 계약):** `call-busy-attempt-record.test.ts` · `call-callee-missed.test.ts` · `call-authority/__tests__/call-missed-notification-authority.test.ts` · `call-missed-bell-authority.test.ts` · `call-chat-projection-authority.test.ts` · `call-timeline-recency-contract.test.ts` · `call-record-copy-language.test.ts`(+ ko 스냅샷) · `incoming-call-ssot-contract.test.ts`(D7) · `room-call-by-peer.test.ts`. 신규: 역할별 문구(A 통화 중/B 부재중) · `caller_busy` 는 B 에게 안 보임 · 알림 세션당 1건 · `projectCallStub` 분기.

**실기 행렬 (통화 규정 5번 + 이번 항목 · 매 시험 Production SHA · 발신 시각·세션 생성·알림 발송 시각 DB 대조)**
| # | 상황 | 판정 기준 |
|---|---|---|
| V1 | B(Android) 음성 연결 중 ← A(iPhone) 음성 발신 | A 안내·A 방 「통화 중」 · B 통화 소리 끊김 없음 · B 시스템 부재중 알림 1건 · 끝난 뒤 B 방 「부재중」·안 읽은 수 1·통화 기록 부재중 |
| V2 | V1 역방향(B=iPhone, A=Android) | 같음 + CallKit 진행 통화 무영향 |
| V3 | 영상 통화 중 ← 영상 발신 | 「부재중 영상 통화」 |
| V4 | B 가 다른 사람에게 발신 중 | B 부재중 · B 발신 계속 |
| V5 | A 본인 통화 중 발신(`caller_busy`) | 상대에게 아무것도 안 생김 |
| V6 | B 통화 화면이 앞 / PiP + 메신저가 앞 (Android·iPhone 각각) | 어떤 표면(시스템 알림·앱 안 배너)이 보이는지 녹화로 기록 |
| V7 | 기본 행렬 무회귀 | 발신·수신·거절·벨 중 취소·취소 후 지연 푸시·무응답·종료 후 즉시 재발신 |

### 2단계 — 대기 통화 「거절 / 종료 후 받기」 (WhatsApp 형태) · **Owner 결정 필요(계획에 넣지 않음)**
Telegram·Signal 에 없고 WhatsApp 에만 있다. 넣을 경우 필요한 변경 범위:
| 변경 | 영역 |
|---|---|
| B 가 `active` 일 때만 `peer_busy` 대신 새 세션을 울림(B 가 울리는 중·발신 중이면 1단계 유지) | 서버 판정 `service.ts:20760~20800` |
| 수신자별 live 1개 제약 분리(`one_live_per_recipient` → ringing 1 + active 1), 역할 교차 확인 | **운영 DB 마이그레이션(별도 승인)** `20260917140000_caller_live_call_unique.sql` |
| Android: `busy_suppressed` 대신 대기 통화 카드(거절·종료 후 받기) · Agora 엔진 넘김 순서(기존 `end` 완료 → 새 `accept`) — 엔진 1개 점유 구조(`NativeCallEngineOwnership.java`) | 네이티브(재빌드) |
| iOS: `maximumCallsPerCallGroup`·`supportsHolding`·두 번째 CallKit 보고 처리 — 시스템 화면 형태 실측 선행 | 네이티브(재빌드) |
| 대기 화면 없는 설치 앱은 `user_devices.app_version` 으로 판별해 1단계(부재중) | 서버 |

## 5. 범위 밖 (보고만)
- C6 A 통화 중 신호음·「통화 중」 발신 화면 없음(Telegram·Signal 있음).
- C8 일반 전화 통화 중 DIBAY 수신 처리 코드 0건(`TelephonyManager`·`CXCallObserver`). Telegram 자동 거절 · Signal 부재중 · WhatsApp 두 선택.
- 그룹 통화 참여 중 1:1 수신: 판정이 `session_mode='direct'` 만 봄 → 그룹 통화 중에도 1:1 이 울릴 수 있음(코드 판정, 실기 NOT_PROVEN). 60일 그룹 통화 4건.
- 관리자 설정 `busy_auto_reject_enabled` 가 어떤 동작에도 연결되지 않음(§2-5).

## 출처
- Telegram: https://github.com/DrKLO/Telegram (commit 21f7d109da — `MessagesController.java` · `VoIPService.java` · `MessageObject.java` · `NotificationsController.java` · `res/values/strings.xml`) · https://core.telegram.org/api/end-to-end/voice-calls
- Signal: https://github.com/signalapp/Signal-Android (commit 5e03b75f02 — `service/webrtc/ActiveCallActionProcessorDelegate.java` · `WebRtcActionProcessor.java` · `SignalCallManager.java` · `database/CallTable.kt`)
- WhatsApp: https://faq.whatsapp.com/518449998779266/?locale=en_US · https://faq.whatsapp.com/692484435227181/?cms_platform=android
- Apple: https://developer.apple.com/documentation/callkit/cxproviderconfiguration/maximumcallgroups · https://developer.apple.com/documentation/callkit/cxcallupdate/supportsholding

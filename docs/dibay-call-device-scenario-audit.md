# DIBAY CallEngine 실기기 시나리오 연결 감사

**감사일:** 2026-06-22  
**범위:** 수신/발신/재다이얼/연속통화/앱안/앱밖/잠금/로컬/APK  
**원칙:** CallEngine controller 단일 구조 유지 · 분산 lifecycle rollback 금지  
**PASS 최우선:** 통화 1회 종료 후 다음 통화(재발신/재다이얼) 가능

---

## 0. 실기기 증상 ↔ 감사 결론 (요약)

| # | 증상 | 감사 결론 (구조적 원인) | 연결 상태 | P0 |
|---|------|------------------------|-----------|-----|
| 1 | 로컬→앱 수락 후 수락 화면 재등장 | stale `ringing` GET + `accepted` consumed ≠ terminal consumed + Global/CallClient 병렬 surface | **부분 연결** — 방어 코드 있으나 레이스 잔존 | FAIL |
| 2 | 로컬 서버 매우 느림 | dev HMR/RSC/API 지연 + 수락 전 polling backup | **환경 + 구조** | N/A (측정 필요) |
| 3 | APK→APK 앱안 수신 화면 2개 | Native `ForegroundIncomingCallActivity` + Global web banner (`hasNativeFsi: false` 고정) | **미연결** | FAIL |
| 4 | 1회 발신 후 통화목록 버튼 비활성 | `call-action-lock` terminal 미해제 (수정됨) + UI disabled 불균일 | **부분 수정** | 재검증 필요 |
| 5 | 로컬도 발신 버튼 비활성 | #4 동일 SSOT | **부분 수정** | 재검증 필요 |
| 6 | 전체 연결 미확인 | 발신 경로가 `outgoing_create` signal 미배선, native reject PATCH gap | **하이브리드** | 감사 완료 |

---

## 1. 전체 시나리오 매트릭스 (A–R)

**범례**

- **CE signal:** `dispatchCallEngineSignal` type
- **PATCH SSOT:** `call-engine-actions` (`runCallEnginePatchAction` / `callEngineAcceptIncoming`)
- **Bypass:** controller/orchestration 없이 직접 호출

| 시나리오 | 진입 파일 | 호출 함수 | CE signal | PATCH | route | ringtone | surface owner | lock acquire / release |
|---------|-----------|-----------|-----------|-------|-------|----------|---------------|------------------------|
| **A** 채팅방 음성 발신 | `use-messenger-room-phase2-controller.ts` | `startManagedDirectCall` → `launchOutgoingDirectCall` | **—** (`outgoing_create` 미호출) | POST `bootstrapCommunityMessengerOutgoingCallSession` | **직접** `router.replace` (tmp 셸) | **직접** `primeOutgoingRingbackWebAudio` + `call-outgoing-ringback-controller` | `web_call_screen` | `acquireCallActionLock` → terminal `releaseCallActionLock` |
| **B** 채팅방 영상 발신 | A 동일 (`kind: video`) | 동일 | **—** | 동일 | 동일 | 동일 | 동일 | 동일 |
| **C** 통화목록 재다이얼 | `MessengerCallLogsPanel.tsx` | `launchOutgoingFallback` → `launchOutgoingDirectCall` | **—** | POST bootstrap | **직접** router | **직접** ringback | `web_call_screen` | `guardInstantOutgoingCallStart` → `acquire` / terminal `release` |
| **D** 프로필/상대 발신 | `CommunityMessengerHome.tsx` / `MessengerFriendProfileSheet` | `startDirectCall` → `launchOutgoingDirectCall` | **—** | POST bootstrap | **직접** router | **직접** ringback | `web_call_screen` | `outgoingDialSyncGuardRef` + guard → lock |
| **E** 앱안 foreground 수신 | `GlobalCommunityMessengerIncomingCall.tsx` | direct ringing effect | `incoming_discovered` | — (ringing) | accept 시 `user_accept` → `replaceCallEngineRouteOnce` | `call-engine-ringtone-owner` | `web_in_app_banner` | surface lock per callId |
| **F** 앱밖 background 수신 | `IncomingCallPushDelivery.java` | `deliver` → `IncomingCallBackgroundNotifier` | Web: FCM bridge wake (**`incoming_discovered` 없음**) | native only | FGS + notification | **native** `IncomingCallRingOwner` | `native_fullscreen_intent` | native coordinator |
| **G** 잠금 FSI 수신 | `IncomingCallPushDelivery.java` | `presentLockIncoming` | Web wake only | — | `IncomingCallActivity` | native ring | `native_locked_screen` | native coordinator |
| **H** notification accept | `IncomingCallActionCoordinator.java` → `DibayFcmCallRouteHost` / `PushRouteListener` | `runNativePendingAcceptCall` | `native_accept` → `user_accept` | `callEngineAcceptIncoming` | `replaceCallEngineRouteOnce` | stop engine + native ring | `web_call_screen` | accept action lock + `setActiveCallSession` |
| **I** notification reject | `IncomingCallDeclineReceiver` → `IncomingCallActionCoordinator.handleReject` | native signal only | **`native_reject` Web 미호출** | **갭: Web PATCH 없음** | — | native stop | native dismiss | native `tryBegin` |
| **J** deep link 수신 | `DibayFcmCallRouteHost` / `PushRouteListener` / `MainActivity` | `navigate` | accept→`native_accept`; else — | accept만 | `replaceRouteOnce` or direct router | — | `web_call_screen` | route latch |
| **K** call screen 종료 | `CommunityMessengerCallClient.tsx` | `endCall` | `user_end` | `runCallEnginePatchAction(end)` | `finalizeCommunityMessengerCallTerminalExit` | controller stop | release surface | `releaseCallActionLock` + `hardClearActiveCallSession` |
| **L** 발신 중 취소 | `CommunityMessengerCallClient.tsx` | `endCall` (initiator ringing) | `user_cancel` | `runCallEnginePatchAction(cancel)` | terminal nav | stop ringback | `web_call_screen` | terminal cleanup |
| **M** 수신 거절 (배너) | `GlobalCommunityMessengerIncomingCall.tsx` | `rejectCall` → `runIncomingCallReject` | `user_reject` | `runCallEnginePatchAction(reject)` | — | stop ring | banner | reject claim lock |
| **N** 부재중 timeout | Global + CallClient | `scheduleCallEngineMissedTimeouts` | `user_missed` | `runCallEnginePatchAction(missed)` | — | stop ring | banner/screen | `markCallEngineTerminalConsumed` |
| **O** 종료 후 즉시 재발신 | C/D + guard | `guardInstantOutgoingCallStart` | **—** | 새 POST (새 callId) | 새 route | 새 ringback | 새 surface | **PASS 조건:** lock+session cleared |
| **P** 종료 후 상대 재발신 | E/H (callee) | incoming poll/FCM | `incoming_discovered` | — | accept path | ringtone owner | banner/native | 이전 callId tombstone ≠ 새 callId block |
| **Q** 같은 room 연속 통화 | A→K→A | 연속 bootstrap | per-call signals | per-call PATCH | per-call route | per-call ringback | per-call surface | terminal 후 lock release 필수 |
| **R** 다른 room 연속 통화 | Q와 동일 (roomId 변경) | 동일 | 동일 | 동일 | 동일 | 동일 | 동일 | 동일 |

### 1.1 Bypass 체크리스트 (시나리오별)

| Bypass | A–D,C,O,Q,R | E,M,N,H | F,G,I | K,L |
|--------|-------------|---------|-------|-----|
| 직접 PATCH | POST only | CE actions ✅ | **I: PATCH 누락** | CE ✅ |
| 직접 router | **✗ bypass** | accept: gate ✅ | native | finalize ✅ |
| 직접 Agora join | CallClient `callEngineActions.joinAgora` (gate, signal `agora_connected` 미경유) | — | — | — |
| 직접 ringtone | **✗ bypass** (outgoing ringback) | engine ✅ | **✗ native parallel** | stop ✅ |
| 직접 consumed storage | `incoming-call-state` + engine locks (의도된 SSOT) | ✅ | native tombstone | ✅ |
| terminal lock release | **이전 FAIL → 수정됨** | ✅ | I gap | ✅ |

---

## 2. 발신 버튼 비활성화 — 전체 추적

### 2.1 SSOT

```
isOutgoingCallStartBlocked()
  = live activeCallSession phase (dialing|ringing|connecting|active|ending)
    OR call-action-lock currentLock != null
```

`guardInstantOutgoingCallStart()` = phone verify → `getActiveCallSessionCallId()` → `isOutgoingCallStartBlocked()`

### 2.2 UI별 disabled 반영

| UI | disabled에 lock 반영 | guard on click |
|----|---------------------|----------------|
| `CommunityMessengerCallHistory` / `CallRow` | **✅** `globalRedialBlocked` | confirm → launch |
| `TradeChatCallHeaderButtons` | **✅** `useOutgoingCallBlocked` | guard |
| Room phase2 header/dot menu | `outgoingDialLocked` only (local) | guard |
| `CommunityMessengerHome.startDirectCall` | **✗** | guard + sync ref |
| `MessengerFriendProfileSheet` | **✗** | parent guard |
| `CallClient` retry | **✗** | no guard |

### 2.3 lock 생명주기

| 이벤트 | acquire | release |
|--------|---------|---------|
| bootstrap POST start | `acquireCallActionLock` | bootstrap error |
| bootstrap success | `bindCallActionLockCallId` | — |
| CallClient terminal status | — | `releaseCallActionLock("terminal")` |
| `endCall` optimistic | — | `releaseCallActionLock("terminal")` (**추가**) |
| `finalizeCommunityMessengerCallTerminalExit` | — | `releaseCallActionLock(source)` (**추가**) |
| `runCallEnginePatchAction` terminal | — | `releaseCallActionLock(terminal_*)` (**추가**) |

### 2.4 실기기 #4/#5 판정

- **확정 원인:** `finalizeCommunityMessengerCallTerminalExit`가 `hardClearActiveCallSession`만 호출하고 **`releaseCallActionLock` 누락** → `currentLock` 잔류 → `globalRedialBlocked=true`
- **잔여 리스크:** callee ringing 중 `activeCallSession` 미설정 시 발신 차단 누락 가능 (역방향 gap)
- **관측:** `[DIBAY_CALL_ENGINE] call_button_state` (acquire/release 시 자동)

### 2.5 PASS 기준 (재검증)

- [ ] terminal 후 500ms 이내 `call_button_state.disabled=false`
- [ ] cancel/reject/missed/failed 각각 후 enabled
- [ ] 같은 room / 다른 room 재발신
- [ ] 이전 callId가 새 callId block 하지 않음

---

## 3. 수신 화면 2개 / 수락 후 재등장

### 3.1 Surface 경로 (3-way)

```
FCM/Poll ─┬─ Native FSI / ForegroundIncomingCallActivity (APK)
          ├─ GlobalCommunityMessengerIncomingCall → ForegroundIncomingCallHost (web banner)
          └─ /calls/:id → CommunityMessengerCallClient → IncomingCallView
```

### 3.2 APK 앱안 2화면 (#3) — 구조적 원인

1. `GlobalCommunityMessengerIncomingCall.tsx:1905` — `incoming_discovered`에 **`hasNativeFsi: false` 하드코딩**
2. `foreground-incoming-presenter.ts` — `nativeForegroundIncomingCallId` prop **미소비** (banner suppress 없음)
3. Android `ForegroundIncomingCallActivity` + web banner **동시 표시**

**수정 방향 (패치 전 제안):** APK foreground에서 native pill active 시 `hasNativeFsi: true` 또는 banner suppress.

### 3.3 수락 후 수락 UI 재등장 (#1)

1. `markCallConsumed("accepted")`는 **`markCallEngineTerminalConsumed` 호출 안 함** (`incoming-call-state.ts:95-97`)
2. dev GET 지연 → `ringing` 재주입 → `CallClient` `IncomingCallView` 재렌더
3. 방어: `pickCallSessionSnapshotAfterFetch` active→ringing 역행 차단, `readCallConsumedReason===accepted` 시 active 승격 (**부분 적용**)
4. Global: `dismissIncomingPresenterAfterAccept`는 presenter만 — consumed/tombstone 타이밍 레이스

**수정 방향:** accept consumed 시 incoming UI render 전역 차단 강화 + `hasNativeFsi` 실값 연동.

### 3.4 Surface owner 규칙 (의도)

| Priority | Owner |
|----------|-------|
| 1 | `native_locked_screen` |
| 2 | `native_fullscreen_intent` |
| 3 | `web_call_screen` |
| 4 | `web_in_app_banner` |
| 5 | `dock_or_pip` |

`web_call_screen` owner 잡히면 banner claim 불가 (`claimCallEngineSurfaceOwner`).

**관측:** `[DIBAY_CALL_ENGINE] surface_decision`

---

## 4. 벨소리 / 링백 연결

| Phase | Incoming ringtone | Outgoing ringback |
|-------|-------------------|-------------------|
| `incoming_ringing` | `startCallEngineIncomingRingtone` (engine) / native `IncomingCallRingOwner` | — |
| `accepting/joining/connected` | stop (controller) | stop on connected |
| `outgoing_ringing` | — | **직접** `call-outgoing-ringback-controller` (signal `outgoing_ringback_start` **미배선**) |
| terminal | stop both | stop both |

**갭:** web ringtone + native ringtone 병렬 가능 (F/G vs E).  
**관측:** `[DIBAY_CALL_ENGINE] sound_state`

---

## 5. 앱밖 / 잠자기 native 연결

| 단계 | 파일 | Web PATCH | 로그 |
|------|------|-----------|------|
| FCM 수신 | `DibayFirebaseMessagingService.java` | 없음 | `incoming_ignored_consumed` |
| Delivery SSOT | `IncomingCallPushDelivery.java` | 없음 | delivery contract |
| Accept | `IncomingCallActionCoordinator.handleAccept` | Web `native_accept` | `accept_signal_sent` |
| Reject | `IncomingCallActionCoordinator.handleReject` | **없음 (갭)** | `reject_signal_sent` |
| Pending route | `MainActivity.java` | queue → WebView | `incoming_received` |
| Replay | `DibayFcmCallRouteHost` | 1회 accept PATCH | `webview_route_delivered` |

**PASS 미충족:** I(notification reject) Web PATCH gap, F/G `incoming_discovered` 미호출.

---

## 6. 통화 속도 지연

| 구간 | 로컬 dev 영향 | 구조적 지연 |
|------|--------------|------------|
| outgoing_click → session_create | RSC/API | bootstrap serial room ensure |
| push → incoming_ui | FCM dev relay | backup poll interval |
| accept_click → route | GET stale | PATCH await before route (의도) |
| call_screen → agora_join | heavy bundle | join gate single-flight |

**관측:** `[DIBAY_CALL_METRIC] call_timing` — `call-engine-audit-log.ts`

---

## 7. DB zombie session

| 항목 | 상태 |
|------|------|
| PATCH idempotent | `isIdempotentCallSessionPatch` (`call-session-transitions.ts`) |
| terminal 역전 방지 | server transition table |
| API route | `app/api/.../sessions/[sessionId]/route.ts` PATCH |
| client busy from DB | 발신 POST는 새 session — **이전 ringing DB가 client lock을 유지하지 않음** |
| zombie → button disabled | **client lock 잔류가 주원인** (DB보다 우선 확인됨) |

**PASS:** terminal 후 해당 callId DB status ∈ {ended,cancelled,rejected,missed}

---

## 8. Terminal cleanup 해제 항목

| 항목 | 해제 경로 | callId scoped |
|------|-----------|---------------|
| `call-action-lock` | finalize / endCall / engine terminal PATCH | global single |
| `activeCallSession` | `hardClearActiveCallSession` | per callId |
| `call-engine-locks` action/join/route/ring/surface | `clearCallEngineLocks` on terminal PATCH | per callId |
| `terminalConsumed` | `markCallEngineTerminalConsumed` | per callId |
| ringtone/ringback | stop functions | per callId |
| surface owner | `clearCallEngineLocks` | per callId |
| Agora join guard | `clearAgoraJoinGuard` in hardClear | per callId |
| consumed tombstone | `markCallConsumed` (TTL 120s) | per callId |

---

## 9. 미배선 / 갭 우선순위 (패치 전)

| P | 갭 | 영향 |
|---|-----|------|
| P0 | `releaseCallActionLock` terminal 누락 | 발신 버튼 영구 disabled (**수정됨, 재검증**) |
| P0 | `hasNativeFsi: false` 고정 | APK 2화면 |
| P0 | accept 후 stale ringing UI | 로컬 수락 화면 재등장 |
| P1 | `outgoing_create` / `outgoing_ringback_*` signal 미배선 | 발신 lifecycle controller 밖 |
| P1 | native notification reject Web PATCH 없음 | DB rejected 미반영 |
| P1 | F/G `incoming_discovered` 미호출 | engine phase/surface 불완전 |
| P2 | CallClient direct `callEngineActions.*` | orchestration 분산 |
| P2 | 발신 UI disabled 불균일 (Home/Room) | 연타 guard만 |

---

## 10. 실기기 재확인 순서

1. 통화 1회 voice 종료 → 통화목록 발신 버튼 즉시 enabled (`call_button_state` 로그)
2. 같은 상대 재다이얼 → POST 새 callId
3. APK foreground 수신 → surface 1개 (`surface_decision` 로그)
4. 수락 → 수락 UI 재등장 0회
5. 앱밖/잠금 수신 → native notification/FSI
6. notification accept → connected 1회 PATCH
7. 연속 통화 (same room / different room)

---

## 11. 관련 검증 명령

```bash
npx vitest run lib/community-messenger/call-engine/call-engine-device-audit-contract.test.ts
npx vitest run lib/community-messenger/call-engine
npx vitest run lib/call/__tests__/active-call-session.test.ts
```

**APK (수정 반영 시):** `cd android && ./gradlew assembleDebug`  
**경로:** `android/app/build/outputs/apk/debug/app-debug.apk`

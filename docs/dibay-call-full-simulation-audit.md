# DIBAY Call 전체 시뮬레이션 감사

**감사일:** 2026-06-22  
**커밋 기준:** `817b6c01` (`fix(cm-call): stabilize accept route and terminal cleanup`)  
**범위:** 발신/수신/벨/UI/route/cleanup/DB — **코드 수정 없음, 진단만**  
**실기기 로그:** 본 감사 세션에서 수집 안 됨 → `DEVICE QA REQUIRED`

---

## 실기기 증상 ↔ 감사 우선순위

| # | 증상 | 감사 판정 (구조) | 근거 파일 |
|---|------|------------------|-----------|
| 1 | 하단 통화 탭/진입 시 발신 화면부터 | **P0 — active recovery + DB zombie** | `CallActiveSessionRecoveryHost.tsx`, `sessions/active`, `getUserLiveDirectCallSessionId` |
| 2 | 수신 안 됨 (연쇄) | **P0 — 서버 live session busy** | `filterDirectIncomingRowsForPolicy` |
| 3 | 첫 앱안 수신 UI·벨 OK | 정상 경로 존재 | `GlobalCommunityMessengerIncomingCall` → `incoming_discovered` |
| 4 | 취소 후 재발신 시 수신 없음 | **P0 — DB ringing zombie + incoming filter** | `service.ts` L915–924 |
| 5 | 앱 재시작 후 발신/수신 불가 | **P0 — recovery + DB live** | `CallActiveSessionRecoveryHost`, `getLiveDirectCallSessionForUser` |
| 6 | 받기 후 call screen 미진입 | **P0 — route/host/accept** (로그 미수집) | `calls/[sessionId]/page.tsx`, accept pipeline |
| 7 | 전체 state 꼬임 | **클라이언트 cleanup 불완전 + 서버 zombie 병행** | 아래 §5·§6 |

---

## 1. 전체 통화 시뮬레이션 매트릭스

**범례**

- **CE:** `dispatchCallEngineSignal`
- **PATCH:** `call-engine-actions` / POST bootstrap
- **위험:** 실기기 FAIL 후보 또는 코드상 구조적 취약점

| 번호 | 시나리오 | 시작 상태 | 사용자 액션 | expected phase | expected UI | expected sound | expected route | expected DB status | expected cleanup | actual 코드 경로 | 실제 위험 지점 |
| -- | ---- | ----- | ------ | -------------- | ----------- | -------------- | -------------- | ------------------ | ---------------- | ------------ | -------- |
| A1 | 앱안 foreground 채팅방 음성 발신 | idle | 채팅 헤더 음성 | `outgoing_ringing` | tmp 발신 셸 → real id | ringback | `/calls/tmp_*` → `/calls/:id` | `ringing` INSERT | — | `launchOutgoingDirectCall` → `ensureOutgoingTempCallBootstrap` → POST bootstrap | **`outgoing_create` CE signal 미호출**; ringback bypass engine |
| A2 | 앱안 foreground 채팅방 영상 발신 | idle | 채팅 헤더 영상 | 동일 | 동일 + host 가능 | 동일 | 동일 | `ringing` | — | A1 동일 (`kind: video`) | `writeHostedActiveCallSession` 잔류 시 page null |
| A3 | 통화목록 재다이얼 | idle | 목록에서 재다이얼 | `outgoing_ringing` | 발신 셸 | ringback | tmp → real | `ringing` | — | `MessengerCallLogsPanel` → `launchOutgoingDirectCall` | `guardInstantOutgoingCallStart` + **DB live 시 blockedCallId route** |
| A4 | 하단 메뉴 통화 탭 진입 | idle | 통화 탭 탭 | idle | **통화 목록만** | 없음 | `/community-messenger?section=call_logs` | — | — | `MessengerHomeMainSections` → `MessengerCallLogsPanel` | **탭 자체는 발신 안 함**; **RecoveryHost가 parallel로 `/calls/:id` replace** ⚠️ |
| A5 | 프로필 발신 | idle | 프로필 통화 버튼 | `outgoing_ringing` | 발신 셸 | ringback | tmp → real | `ringing` | — | `CommunityMessengerHome.startDirectCall` → `launchOutgoingDirectCall` | `outgoingDialSyncGuardRef` 중복 탭 |
| B1 | 앱안 foreground 수신 UI | idle callee | (대기) | `incoming_ringing` | in-app banner 1개 | ringtone 1개 | 없음 | `ringing` | — | Global poll/RT → `foreground-incoming-presenter` → banner | native FSI flag·이중 surface (background) |
| B2 | 벨소리 시작 | B1 | — | `incoming_ringing` | banner | ringtone | — | `ringing` | — | Global effect → `incoming_discovered` → `startCallEngineIncomingRingtone` | `shouldIgnoreIncomingDiscovered` 오판 시 무음 |
| B3 | 받기 | B1 | 받기 탭 | `accepting`→`joining` | call screen | ring stop | `/calls/:id?action=accept` | `active` PATCH | incoming consumed | `user_accept` → `routeCallEngineForAccept` | **로그 미수집** — §4 |
| B4 | 거절 | B1 | 거절 | terminal | banner 닫힘 | stop | — | `rejected` | full terminal | `user_reject` → `releaseCallEngineTerminalLocalState` | — |
| B5 | 발신자 취소 | B1 ringing | (상대 cancel) | terminal | UI 제거 | stop | — | `cancelled` | full terminal | Global `remote_terminal` → `handleCallEngineRemoteTerminal` | **remote_terminal이 accept 중 race** |
| B6 | 수락 후 call screen | B3 | — | `joining` | CallScreen | — | `/calls/:id` | `active` | — | `CommunityMessengerCallClient` mount | **`hostOwnsSession` → page `null`** ⚠️ |
| B7 | Agora join | B6 active | — | `connected` | connected UI | media | — | `active` | — | `joinCallEngineAgoraOnce` | `invalid_phase` / `terminal_consumed` |
| B8 | connected 유지 | B7 | — | `connected` | 유지 5s+ | media | — | `active` | — | CallClient hydrate | stale `ringing` GET → `stale_ringing_blocked` |
| C1 | background FCM 수신 | bg | — | `incoming_ringing` | heads-up/FSI | native | — | `ringing` | — | `IncomingCallPushDelivery` | Web `incoming_discovered` 지연 |
| C2 | notification 표시 | C1 | — | — | native UI | native | — | `ringing` | — | Android notifier | — |
| C3 | notification accept | C2 | accept | `joining` | call screen | stop | deep link | `active` | — | `native_accept` → `user_accept` | WebView ready 전 pending |
| C4 | notification reject | C2 | reject | terminal | dismiss | stop | — | `rejected` | terminal | native → **`native_reject` Web PATCH 갭** | 서버 ringing zombie 가능 |
| C5 | 발신자 cancel (bg) | C2 | — | terminal | native dismiss | stop | — | `cancelled` | terminal | FCM + `remote_terminal` | — |
| C6 | WebView pending replay | cold start | — | — | — | — | deep link | — | — | `DibayFcmCallRouteHost` / `PushRouteListener` | seed/session 불일치 |
| D1 | 잠금 FSI | locked | — | `incoming_ringing` | FSI | native | — | `ringing` | — | `presentLockIncoming` | — |
| D2 | FSI accept | D1 | accept | `joining` | call screen | stop | `/calls/:id` | `active` | — | native → Web `native_accept` | — |
| D3 | FSI reject | D1 | reject | terminal | dismiss | stop | — | `rejected` | terminal | native signal | PATCH 갭 (C4) |
| D4 | FSI cancel | D1 | (상대) | terminal | dismiss | stop | — | `cancelled` | terminal | `remote_terminal` | — |
| D5 | FSI dismiss | terminal | — | idle | 없음 | 없음 | — | terminal | full | native dismiss + engine cleanup | presentation 잔류 |
| E1 | 발신 중 취소 | outgoing ringing | 취소 | terminal | 목록 복귀 | stop ringback | `?section=call_logs` | `cancelled` | **idle + canStartNewCall** | `user_cancel` → `releaseCallEngineTerminalLocalState` + `finalizeCommunityMessengerCallTerminalExit` | **navigation seed 미clear** ⚠️ |
| E2 | 수신 거절 | incoming | 거절 | terminal | banner 닫힘 | stop | call_logs | `rejected` | full | `user_reject` | — |
| E3 | 통화 중 종료 | active | 종료 | terminal | 목록 | stop | call_logs | `ended` | full | `user_end` | — |
| E4 | 상대 종료 | active | — | terminal | 종료 UI | stop | — | `ended` | full | `remote_terminal` | — |
| E5 | missed timeout | ringing | (무응답) | terminal | 없음 | stop | — | `missed` | full | `user_missed` / schedule | — |
| E6 | remote terminal | any live | — | terminal | 제거 | stop | — | terminal | full | `handleCallEngineRemoteTerminal` | **`pinCommunityMessengerCallTerminalSurfaceDismiss` 미호출** ⚠️ |
| E7 | 앱 강제 종료 복귀 | killed | 앱 재실행 | idle or resume | 목록 or call | — | recovery? | DB live? | — | `CallActiveSessionRecoveryHost` + native resume | **무조건 `/calls/:id` 복구** ⚠️ |
| F1 | 종료 후 같은 room 재발신 | terminal | 재발신 | `outgoing_ringing` | 발신 셸 | ringback | new id | new `ringing` | 이전 terminal | bootstrap POST | **DB zombie 시 reuse/peers_busy** |
| F2 | 취소 후 같은 room 재발신 | cancelled | 재발신 | 동일 | 동일 | 동일 | 동일 | new session | cleanup 완료 | 동일 | **callerLiveId reuse** (L17411) |
| F3 | 수신 취소 후 재수신 | callee idle | (상대 발신) | `incoming_ringing` | banner | ring | — | new `ringing` | — | incoming GET + RT | **viewer live DB → incoming filter 빈 배열** ⚠️ |
| F4 | 다른 room 발신 | terminal | 발신 | outgoing | 셸 | ringback | new | new | — | bootstrap | `peer_busy` if other room live in DB |
| F5 | 통화목록 재다이얼 | terminal | redial | outgoing | 셸 | ringback | new | new | — | `MessengerCallLogsPanel` | lock + DB |
| F6 | 앱 재시작 후 발신 | ? | 발신 | outgoing | 셸 or **강제 call screen** | — | recovery | DB live? | — | Recovery + launch | **증상 1·5** |
| F7 | 앱 재시작 후 수신 | ? | — | incoming | banner | ring | — | new ringing | — | incoming API | **DB live 시 수신 차단** |
| G1 | activeCallSession 잔류 | terminal 후 | — | idle | 목록 | — | — | — | null session | `releaseLocalCallSession` | mismatch id 시 clear skip (수정됨 alternateId) |
| G2 | route seed 잔류 | terminal 후 | 탭 이동 | — | **발신 셸 hydrate** | — | `/calls/:seedId` | — | seed null | `call-engine-store` navigationSeed | **`clearCallEngineNavigationSeed` terminal cleanup 미포함** ⚠️ |
| G3 | presentation host 잔류 | terminal 후 | call tab | — | page null / host blank | — | — | — | flags clear | `releaseCallEngineTerminalLocalState` → `clearCommunityCallPresentationFlags` | E6 remote만 pin 없음 |
| G4 | web_call_screen owner | accept 후 | — | joining | — | — | route | — | — | `closeIncomingSurfaceOptimistic` | banner only — OK |
| G5 | native surface 잔류 | terminal 후 | — | — | — | — | — | — | clear native | `dismissNativeForegroundIncomingUi` | best-effort |
| G6 | ringtone owner 잔류 | terminal | — | idle | — | silent | — | — | unlock | `stopCallEngineIncomingRingtone` | — |
| G7 | call-action-lock 잔류 | terminal | 발신 | — | disabled | — | — | — | lock false | `releaseCallActionLock` | — |
| G8 | DB ringing zombie | cancel 미반영 | 수신 | — | 없음 | 없음 | — | `ringing` | — | `getUserLiveDirectCallSessionId` | **incoming auto-reject loop** ⚠️ |
| G9 | DB active zombie | end 미반영 | — | active UI | call screen | — | recovery route | `active` | — | `sessions/active` | **증상 1·5·4** |
| G10 | accepted consumed 잔류 | accept 후 | stale poll | — | — | — | — | — | TTL 120s | `incoming-call-state` | incoming만 차단 (의도) |
| G11 | terminal consumed 잔류 | terminal | same callId | — | — | — | block route | — | per callId | `call-engine-locks` | **새 callId에는 영향 없음** (per-id) |

---

## 2. 하단 통화 탭 진입 시 발신 화면부터 뜨는 원인 감사

### 2.1 코드 경로 (발신 화면을 띄우는 진입점)

| 진입점 | 조건 | 동작 |
|--------|------|------|
| **`CallActiveSessionRecoveryHost`** | pathname가 `/community-messenger/calls/` **아님** + `GET /sessions/active` live 반환 | `router.replace(/calls/:id)` — **통화 탭 진입 시에도 실행** |
| **`launchOutgoingDirectCall`** | 사용자가 발신 CTA 탭 | 무조건 `tmp_*` 발신 셸 (`buildCommunityMessengerInstantOutgoingCallHref`) |
| **`applyOutgoingTempCallBootstrapResult`** | `blockedCallId` 존재 | stale callId로 `/calls/:id` 이동 |
| **`navigateBlockedOutgoingCall`** | guard 실패 + blockedCallId | `/calls/:blockedCallId` |
| **`MessengerCallLogsPanel` mount** | — | **자동 발신 없음** (목록 fetch만) |

### 2.2 route seed / presentation 잔류

| 저장소 | 키/함수 | terminal cleanup (`817b6c01`) | 위험 |
|--------|---------|--------------------------------|------|
| navigation seed | `writeCallEngineNavigationSeed` / `readCallEngineNavigationSeed` | **clear 안 함** | `hydrateCommunityMessengerCallClientSession`이 **종료된 call의 ringing 세션**으로 셸 페인트 |
| memory seed | `lastConsumedNavigationSeed` | **clear 안 함** | StrictMode·재진입 시 stale session |
| active video | `readCallEngineActiveVideoSession` | clear (terminal cleanup에 포함) | `calls/[id]/page` → `hostOwnsSession` → **null 렌더** |
| recovery suppress | `writeTerminalCallRecoverySuppress` | **`finalizeCommunityMessengerCallTerminalExit`만** | `remote_terminal` cleanup 경로는 **suppress 미설정** |
| return path | `readCallEngineReturnPath` | terminal 시 call_logs로 replace (의도) | — |

### 2.3 `calls/[sessionId]/page.tsx` 구조

```tsx
if (hostOwnsSession) {
  return null;  // dedicated page 빈 화면 — host가 CallClient 렌더해야 함
}
```

`hostOwnsSession === true` 이고 `CommunityMessengerActiveCallHost`가 해당 session을 안 그리면 **받기 후 빈 화면** (증상 6 연관).

### 2.4 PASS 기준 대비 현재

| 기준 | 현재 |
|------|------|
| 통화 탭 = 목록만 | **FAIL** — RecoveryHost가 parallel로 call route 가능 |
| live call 없으면 발신 화면 금지 | **FAIL** — DB zombie면 live로 판정 |
| terminal/consumed callId seed 금지 | **FAIL** — navigation seed 미clear |

### 2.5 권장 진단 로그 (미삽입 — 사용자 수집용)

`[DIBAY_CALL_ENTRY_AUDIT] call_tab_enter` — 통화 탭 포커스 시 수동으로 아래 값 확인:

- `route`, `getActiveCallSessionCallId()`, `readCallEngineActiveVideoSession()`, `readCallEngineNavigationSeed()`, `hostOwnsSession`, `GET /sessions/active` 응답

---

## 3. 첫 수신 후 취소 → 재발신 시 수신 없음 원인 감사

### 3.1 callId 단위 vs room/peer 단위 차단

| 레이어 | 차단 단위 | 새 callId에 영향? | 코드 |
|--------|-----------|-------------------|------|
| `terminalConsumedLocks` | **callId** | 아니오 | `call-engine-locks` |
| `accepted consumed` | **callId** | 아니오 (incoming만) | `incoming-call-state` |
| `getActiveCallSessionCallId` | 클라 live session | **예** (session 미clear) | `active-call-session` |
| `evaluateIncomingCallBusyPolicy` | **other live session id** | 예 (viewer live 잔류) | `call-state.ts` |
| **`filterDirectIncomingRowsForPolicy`** | **user-level live DB** | **예 — 서버가 새 ringing reject** | `service.ts` L915–924 |
| `userHasLiveDirectCallSessionOutsideRoom` | room 밖 live | 재발신 peer_busy | create API |

### 3.2 서버 incoming 필터 (핵심)

`getUserLiveDirectCallSessionId(user, "live")` 가 non-null이면:

1. **다른 callId의 ringing incoming을 서버에서 auto-reject** (`updateCommunityMessengerCallSession reject`)
2. incoming API는 **live row만 반환** (또는 빈 배열)

→ 클라이언트 cleanup이 완벽해도 **DB에 ringing/active zombie가 남으면 수신 불가**.

### 3.3 클라이언트 incoming_discovered 차단 (새 callId)

| 차단 | 조건 | 새 callId? |
|------|------|------------|
| `shouldIgnoreIncomingDiscovered` | accepted consumed **같은 id** | 동일 id만 |
| `isTerminalSignalBlocked` | terminal consumed **같은 id** | 동일 id만 |
| Global busy | `viewerLiveSessionId` from `getActiveCallSessionCallId` | **예** |

### 3.4 PASS 기준 대비

| 기준 | 현재 |
|------|------|
| 새 callId는 이전 id consumed에 막히지 않음 | 클라 **OK** (per-id) |
| terminal consumed는 same callId만 | **OK** |
| room/peer 차단은 실제 active만 | **FAIL** — DB zombie = pseudo-active |

---

## 4. 받기 후 accept pipeline 감사 (기기 로그 기준)

> **본 세션: 기기 logcat 미수집.** 아래는 수집 절차와 코드상 실패 분기만 기록.

### 4.1 필수 로그 순서 (`817b6c01`에 이미 존재)

```
accept_click → accept_signal_received → accept_patch_start → accept_patch_done
→ route_request → route_allowed | route_fallback
→ call_screen_mounted → agora_join_start → agora_join_success | agora_join_blocked
```

### 4.2 실패 분기 매핑

| 끊김 | 의미 | 코드상 1차 의심 |
|------|------|-----------------|
| `accept_click` 없음 | UI handler | Global banner / native bridge |
| `accept_signal_received` 없음 | dispatch | `runIncomingCallAccept` 미호출 |
| `accept_patch_start` 없음 | lock/consumed | `duplicate_accept_blocked`, `getActiveCallSessionCallId` 충돌 |
| `accept_patch_done` fail | API | PATCH 4xx / network |
| `route_request` 없음 | action 후 route 누락 | controller early return |
| `route_blocked` + no fallback | gate | `isCallEngineTerminalConsumed` (remote_terminal race) |
| `call_screen_mounted` 없음 | Next route | `hostOwnsSession` null page / recovery redirect |
| `agora_join_blocked` | phase/gate | `invalid_phase`, `terminal_consumed` |

### 4.3 보고 템플릿 (실기기 QA 후 채움)

```txt
끊긴 단계: (미수집)
직전 로그: (미수집)
다음 로그 없음: (미수집)
차단 reason: (미수집)
수정 후보: hostOwnsSession / recovery race / DB zombie — 로그로 확정 필요
```

---

## 5. terminal cleanup 실제 완료 여부 감사

### 5.1 `releaseCallEngineTerminalLocalState` (`817b6c01`) 수행 항목

| 항목 | 수행 | 비고 |
|------|------|------|
| releaseCallActionLock | ✅ | |
| hardClearActiveCallSession | ✅ | alternateId 지원 |
| clearCallEngineLocks (route/agora/surface) | ✅ | `terminalConsumedLocks`는 **유지** (per-id) |
| clearCommunityCallPresentationFlags | ✅ | |
| clearHostedActiveCallSession | ✅ | activeVideo 일치 시 |
| clearCallEngineState | ✅ | |
| syncIncomingCallRing(null) | ✅ | |
| dismissNativeForegroundIncomingUi | ✅ | async |
| clearNativeCalleeAcceptPending | ✅ | |
| markCallEngineTerminalConsumed | ✅ | |
| **clearCallEngineNavigationSeed** | ❌ | **G2** |
| **lastConsumedNavigationSeed reset** | ❌ | public clear 없음 |
| **writeTerminalCallRecoverySuppress** | ❌ | finalize 경로만 |
| **DB session terminal** | ❌ | 클라만; 서버 zombie 가능 |
| **pinCommunityMessengerCallTerminalSurfaceDismiss** | ❌ | remote_terminal 경로 |

### 5.2 post_cleanup_snapshot PASS 기준 (코드 정적 추정)

| 필드 | cancel/remote 후 기대 | 정적 판정 |
|------|----------------------|-----------|
| activeCallSession | null | ⚠️ clear 실패 시 잔류 |
| activeVideoSession | null | ✅ cleanup 포함 |
| routeSeed | null | ❌ **미clear** |
| surfaceOwner | null | ✅ |
| actionLock | false | ✅ |
| canStartNewCall | true | ⚠️ DB zombie 시 false |
| canReceiveNewCall | true | ❌ **DB live 시 서버 차단** |

로그: `[DIBAY_CALL_TERMINAL_PIPELINE] cleanup_done` / `cleanup_incomplete` — **실기기 미수집**.

---

## 6. DB 상태 감사

### 6.1 확인 API (실기기/스테이징에서 수동)

| 확인 | API |
|------|-----|
| 본인 live session | `GET /api/community-messenger/calls/sessions/active` |
| 수신 목록 | `GET /api/community-messenger/calls/sessions/incoming?directOnly=1` |
| 세션 상세 | `GET /api/community-messenger/calls/sessions/:id` |
| 발신 생성 | `POST /api/community-messenger/calls` (room) |

### 6.2 서버 live 판정 (`getUserLiveDirectCallSessionId`)

- `community_messenger_call_sessions`에서 본인 참여 direct 세션
- `status IN ('ringing','active')` 최신 1건
- stale ringing은 policy TTL로 terminal 시도 — **cancel PATCH 실패 시 zombie 잔류 가능**

### 6.3 보고 템플릿 (QA 시 채움)

```txt
이전 callId: (미확인)
DB status: (미확인)
new callId: (미확인)
create API result: (미확인)
receiver discovery result: (미확인)
peer_busy 여부: (미확인)
```

### 6.4 정적 시나리오: cancel 후 재수신 실패 메커니즘

1. 발신자 cancel → callee `remote_terminal` → 클라 cleanup
2. **발신자/수신자 DB row가 `cancelled`가 아니면** `getUserLiveDirectCallSessionId` ≠ null
3. 새 수신 ringing → `filterDirectIncomingRowsForPolicy` → **auto-reject + 빈 목록**
4. 증상: 「수신 안 됨」「재발신 후 수신 없음」

---

## 7. 방향 결정 기준 판정

### CallEngine 유지 조건

| 조건 | 판정 |
|------|------|
| accept 끊김 1~2단계 특정 | **미확정** (로그 없음) |
| terminal 잔류 항목 특정 | **확정** — navigation seed, recovery suppress, DB sync |
| 새 callId 차단 reason 특정 | **확정** — 주로 **DB live zombie**, 부차적으로 client activeSession |
| DB zombie 아님 | **기각** — 서버 경로가 증상 4·5·7과 정합 |

### 부분 롤백 조건

| 조건 | 판정 |
|------|------|
| foreground 수신/route만 legacy 안정 | **해당 없음** — recovery·DB·seed가 교차 |
| native surface만 실패 | **부분** — 현재는 연쇄 실패 |
| presentation host만 실패 | **부분** — hostOwnsSession null |

### 전면 재구성 조건

| 조건 | 판정 |
|------|------|
| accept 단계 매번 다름 | **미확정** |
| cleanup 후 잔류 5개+ | **충족** — seed, memory seed, suppress, DB, recovery |
| id 개념 혼용 | **부분** — callId=sessionId이나 recovery/bootstrap 혼선 |
| 탭 진입 무조건 발신 화면 | **충족** — RecoveryHost + DB zombie |
| 새 callId 이전 id로 차단 | **충족 (서버)** — user-level live, not consumed map |

### **종합 판정: `STRUCTURAL AUDIT FAIL` — CallEngine 단독 패치로 닫기 어려움**

- **클라이언트:** terminal cleanup ↔ recovery ↔ navigation seed **삼각 미정렬**
- **서버:** live session zombie가 incoming/create/recovery **전역 차단**
- **CallEngine 유지 가능**하나, **다음 패치는 단건 suppress가 아니라 recovery+seed+DB 동기화 묶음**이어야 함
- **전면 롤백**보다는 **CallEngine + 서버 live gate + RecoveryHost 조건 재정의**가 현실적

---

## 8. 금지 준수

- 본 감사에서 **코드·설정 수정 없음**
- 로그 삽입 없음 (사용자 요청: 수정 금지)
- 패치 미적용

---

## 9. 완료 보고 (요청 형식)

| # | 항목 | 결과 |
|---|------|------|
| 1 | 매트릭스 문서 | `docs/dibay-call-full-simulation-audit.md` (본 문서) |
| 2 | 통화 탭 → 발신 화면 원인 | **`CallActiveSessionRecoveryHost` + DB live zombie + navigation seed 잔류** (탭 자체 발신 아님) |
| 3 | 취소 후 재발신 수신 없음 | **`filterDirectIncomingRowsForPolicy` + `getUserLiveDirectCallSessionId` DB zombie** |
| 4 | accept pipeline 끊김 | **미수집** — `DEVICE QA REQUIRED` |
| 5 | terminal cleanup 잔류 | **routeSeed, recoverySuppress, DB session, lastConsumedNavigationSeed** |
| 6 | DB live/zombie | **정적 분석상 cancel/end 미반영 시 전역 차단** — API 수동 확인 필요 |
| 7 | 새 callId 차단 reason | **서버 user-level live (G8/G9)** > 클라 activeSession > (아님) terminal consumed per new id |
| 8 | 유지/롤백/재구성 | **CallEngine 유지 + 구조 정렬 필수** (전면 롤백 비권장, 단건 패치 비권장) |
| 9 | 수정 없이 감사만 | **예** |
| 10 | 다음 패치 제안 (최대 3) | 아래 §10 |

---

## 10. 다음 패치 제안 (최대 3, 미구현)

1. **Terminal ↔ Recovery ↔ Seed 동기화 묶음**  
   `releaseCallEngineTerminalLocalState`에 `clearCallEngineNavigationSeed` + `writeTerminalCallRecoverySuppress` + `lastConsumedNavigationSeed` 무효화.  
   `CallActiveSessionRecoveryHost`는 `GET /sessions/active` 결과가 terminal이거나 suppress 대상이면 **route 금지**.

2. **서버 live zombie 차단 해소**  
   cancel/end PATCH 실패 시 재시도 + `GET /sessions/active`가 stale ringing이면 `terminalStaleRingingDirectSessionsForUser` 강제.  
   incoming filter가 **다른 callId ringing을 auto-reject하기 전** live row terminal 확인.

3. **Accept 후 화면 — host/page 단일 소유 명시**  
   accept route 직전 `activeVideoSession`/`hostOwnsSession` 정합: dedicated page vs `CommunityMessengerActiveCallHost` 중 **한 경로만** CallClient 렌더.  
   `call_screen_mounted` 로그와 `hostOwnsSession` 동시 수집으로 확정.

---

## 부록: 실기기 로그 수집 명령

```bash
adb logcat -c
adb logcat | grep -E 'DIBAY_CALL_ACCEPT_PIPELINE|DIBAY_CALL_TERMINAL_PIPELINE|DIBAY_CALL_ENGINE|call_tab|active_call_resume|call_route_enter'
```

통화 탭 진입 직전·직후:

```bash
# WebView remote debugging 또는
adb logcat | grep -E 'active_session|navigationSeed|hostOwnsSession|sessions/active'
```

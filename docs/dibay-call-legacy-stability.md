# DIBAY 통화 — Legacy 안정화 기준 (2026-06)

**범위**: `CommunityMessengerCallClient` · `GlobalCommunityMessengerIncomingCall` · `CallIncomingChrome` · Android FCM/bridge  
**금지**: `components/call` 신규 runtime · `lib/call/call-store` · state-machine runtime 재도입

**GOOD_COMMIT 기준**: `7f03ad30`  
**상세 DB/UI 매핑**: [`community-messenger-call-state-machine.md`](./community-messenger-call-state-machine.md)

---

## 1. 진입·호스트 (단일 정의)

| 역할 | 모듈 |
|------|------|
| 수신 전역 | `GlobalCommunityMessengerIncomingCall` (`IncomingCallOverlay` re-export) |
| 수신 셸 | `CallIncomingChrome` → `DibayFcmCallRouteHost` · `CallActiveSessionRecoveryHost` · `CommunityMessengerActiveCallHost` |
| 통화 페이지 | `app/(main)/community-messenger/calls/[sessionId]/page.tsx` → `CommunityMessengerCallClient` |
| 발신 진입 | `buildCommunityMessengerOutgoingDialHref` / `bootstrapCommunityMessengerOutgoingCallAndNavigate` (`call-session-navigation-seed.ts`) — 표면 목록은 `outgoing-call-surfaces.ts` |
| Android FCM | `DibayFirebaseMessagingService` → `MainActivity` `dibay:call-event` / `dibay:call-route` → `dibay-fcm-call-bridge.ts` |

### 오버레이 중복 방지

- `/community-messenger/calls/*` 에서는 `hideGlobalIncomingOverlay` 로 전역 배너/풀스크린 UI 숨김
- 전역 호스트는 **벨·dedup·missed 타이머·FCM wake** 만 담당 (항상 마운트)
- `CallClient` 는 해당 라우트의 풀페이지 UI 단독

### 벨소리 중복 방지

- `call-ringtone-controller.ts` — 동일 `sessionId` incoming 중복 play 금지
- 전역 + `CallClient` 양쪽에서 play 가능하나 컨트롤러가 dedupe
- `shouldPreserveIncomingRingtoneOnCallRoute` — `/calls/:id` 진입 시 in-flight/active 벨 유지

---

## 2. 제품 상태 (idle → terminal)

문서·QA 에서 쓰는 이름. DB `status` 와 1:1이 아닐 수 있음.

| 상태 | 의미 | 대표 DB/UI |
|------|------|------------|
| **idle** | 통화 UI 없음 | 라우트 이탈 |
| **incoming** | 수신 벨 | `ringing` + callee |
| **outgoing** | 발신 대기 | `ringing` + initiator |
| **connecting** | 수락 후 Agora 조인 전 | UI `connecting` |
| **active** | 통화 중 | DB `active`, UI `connected` |
| **ending** | PATCH/시그널/hangup 처리 중 | `busy` · `directCallPatchInFlightRef` |
| **ended** | 정상 종료 | DB `ended` / `cancelled` → UI phase `ended` |
| **missed** | 부재중 (30s) | DB `missed` |
| **failed** | 미디어/토큰/ICE 실패 | `ended` + `failed_*` reason |

### 허용 action (1:1 direct)

| 현재 | 허용 PATCH | 비고 |
|------|------------|------|
| outgoing `ringing` | `cancel` (발신) | keepalive on pagehide |
| incoming `ringing` | `accept` · `reject` | 거절 시 즉시 dismiss |
| `active` | `end` | pagehide 에서 auto-end **금지** (F5 복구) |
| terminal | 없음 | `claimCallTerminalPatch` 로 중복 PATCH 차단 |

잘못된 action (`bad_action`) → 스낵바 + silent refresh, **크래시 금지**.

---

## 3. 종료·복귀

| 경로 | 동작 |
|------|------|
| 링 중 거절/취소/원격 hangup | `beginRingingCallDismiss` → `suppressTerminalView` → 즉시 `navigateBackFromCommunityMessengerCall` |
| 통화 중 정상 종료 | 터미널 요약 **~600ms** 후 자동 복귀 (`CallScreen.autoCloseMs` + `terminalDismissTimer`) |
| 실패 `failed_*` | 사용자 닫기 유지 (자동 복귀 없음 또는 2s) |
| 복귀 우선순위 | `rememberCallNavigationReturnPath` → room → chats |

`writeTerminalCallRecoverySuppress` — 종료 직후 stale session 복구·재진입 방지 (120s).

---

## 4. pagehide · background · offline

| 이벤트 | ringing | active+joined |
|--------|---------|---------------|
| `pagehide` / `beforeunload` | keepalive PATCH (`call-page-leave-patch`) | media dispose **안 함** |
| `visibilitychange` hidden | ringing 과 동일 (APK WebView) | 동일 |
| logout | `call-logout-teardown` | 전체 정리 |

---

## 5. FCM / Android

| payload | Web |
|---------|-----|
| `incoming_call` | `dibay:call-event` → 즉시 벨 + `bumpIncomingListFastSync` |
| `call_canceled` | `handleCallTerminalEvent(cancelled)` + ring stop |
| accept route | `dibay_call_pending_route` (OAuth/chat `pending_route` 와 분리) |

Foreground: WebView `dibay:call-event`  
Background/lock: `IncomingCallNotificationBuilder` + **항상** `IncomingCallActivity` (FSI 보조, 벨만 울림 방지)

---

## 6. 검증

```bash
npx tsc --noEmit
npx vitest run lib/community-messenger/__tests__/call-incoming-terminal.test.ts \
  lib/community-messenger/__tests__/incoming-call-action-guard.test.ts \
  lib/call/__tests__/call-state-busy.test.ts \
  lib/community-messenger/__tests__/call-page-leave-patch.test.ts \
  lib/community-messenger/__tests__/call-ringtone-controller.test.ts
```

수동 QA 10항목: [`community-messenger-call-mobile-e2e-checklist.md`](./community-messenger-call-mobile-e2e-checklist.md) 참고.

---

## 7. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-16 | Legacy 복구 후 안정화 문서 신설 — FCM 즉시 벨, dismiss 레이스, 종료 auto-close 600ms, visibility page-leave |
| 2026-06-16 | `DibayFcmCallRouteHost` — `dibay:call-route` 이벤트·native SharedPreferences 백업 소비(수락 후 화면 사라짐 수정) |
| 2026-06-16 | Android 잠금/슬립 — FSI 여부와 무관 `IncomingCallActivity` 직접 실행 |
| 2026-06-16 | `ensureCallMediaForUserGesture` — 수락/발신 시 OS·GUM 권한 요청; 영상 발신 GUM 프라임 |

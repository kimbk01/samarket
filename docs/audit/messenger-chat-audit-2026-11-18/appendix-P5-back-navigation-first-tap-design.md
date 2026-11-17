# P5 독립 검증 — 메신저 방 뒤로 목적지 · 첫 탭 무시 (2026-11-18 · 읽기 전용 · 코드 변경 없음)

기준 트리: 로컬 `main` HEAD `0360f85ca` (#429). 설치본 측정 기준 1.2.7(71) — `DibaySystemBackPlugin`(#423 `b8be4a7a4`)은 71 빌드 커밋 `75477368c` 의 조상임을 `git merge-base --is-ancestor` 로 확인(포함). #425 `0a42bb2f0`(드라이버 thenable 수정)은 웹 코드라 운영 웹에 따라감.
판정 표기: 코드로 확정 = **CODE-CONFIRMED**, 기기 증거 필요 = **NOT_PROVEN**.

참조 문서: `AGENTS.md`, `docs/dibay-messenger-page-navigation-android-hard-lock.md`, `docs/audit/android-system-nav-2026-11-17/final-report.md`, `docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md`, `docs/design/push-entry-back-fix-design-2026-11-13.md`(요청의 push-entry-back 문서는 `docs/audit` 가 아니라 `docs/design` 에 있음), `docs/audit/messenger-chat-full-audit-ssot-design-2026-11-18.md` §5·§6(기존 설계 D5·D6 — 이 검증의 대상).

---

## PART A — 검증

### A1. (c) 콜드 푸시 → 방 B → ◁ = HOME, 다시 ◁ = 앱 나감 — **CODE-CONFIRMED (기록 구조)**

1. 네이티브는 처음 주소를 바꾸지 않는다. WebView 는 `server.url`(origin, `/`)로 시작:
   - `MainActivity.java:1866-1870` `ensureInitialRemotePathOnce()` → `Log.i(..., "initial_remote_path defer_to_web reason=lifecycle_ssot")` — 네이티브 loadUrl 없음.
2. 알림 경로는 JS 이벤트로 전달:
   - `MainActivity.java:3464-3472` `"(function(){window.dispatchEvent(new CustomEvent('" + (callRoute ? "dibay:call-route" : "dibay:push-route") + ...` → `webView.evaluateJavascript(js, null)`.
3. 웹은 **현재 항목(`/`) 위에 push**:
   - `PushRouteListener.tsx:533-536`
     ```ts
     } else {
       // 결함 E: ...
       markLeavingByPushNavigation();
       router.push(path);
     }
     ```
   - `shouldReplaceRoute` 는 통화 수락만 참(`lib/push/push-route-policy.ts:3-8`) → 채팅 방은 push.
   - 결과 기록: `[/ (HOME), /community-messenger/rooms/B]`.
4. ◁ 1회: 사용자 활성화 없는 push 라 Chromium 이 `/` 를 건너뛰기 항목으로 표시 → `canGoBack()=false` (`push-entry-back-fix-design §1`). 대신 `markLeavingByPushNavigation()` 가 `/` 의 key 를 기록 → `isPushNavigationBackActive()` 참 → `overlay-back-stack.ts` 리스너 설치 + `setActive(true)` → 네이티브 `DibaySystemBackPlugin.java:42-47` `if (webWantsBack && hasListeners(...)) notifyListeners(...)` → JS `handleNativeBack` → `overlay-back-stack.ts:104-107` `if (pushNavigationBackActive ...) { window.history.back(); return; }` → **HOME**.
5. ◁ 2회: HOME 은 index 0 → `push-navigation-back.ts:38` `if (!cur || ... cur.index <= 0) return false` → 리스너 제거·`setActive(false)` → 네이티브 `refresh()` `enabled = webWantsBack || canGoBack` = false → 콜백 꺼짐 → Android 시스템 처리(Android 12+ 루트 Activity = 작업 뒤로 보내기) → 런처. 이것은 설계대로(S1)이며 앱 종료가 아니라 「작업 뒤로」다.

결론: (c) 의 HOME 은 버그가 아니라 **목적지 규칙 부재**다 — 「방 종류 목록」이라는 개념이 ◁ 경로 어디에도 없다. 웹 기록 = `[/, B]` 이므로 history 기반 어떤 뒤로도 HOME 으로 간다.

**추가 발견 1 (CODE-CONFIRMED): 같은 조건에서 머리글 ‹ 도 HOME 으로 간다.** 감사 문서 §5-1 은 머리글 ‹ 를 이 경로에서 측정하지 않았다.
- `history-back-fallback.ts:98-103` `canUseSafeInAppHistoryBack()` 는 `history.state.idx > 0` 을 본다. **Next App Router(16.1.7)는 `idx` 를 쓰지 않는다** — `node_modules/next/dist/client/components/app-router.js:50-57` `historyState = { ...preserveCustom ? history.state : {}, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE }`. 저장소 안에 `idx` 를 쓰는 코드도 없음(grep `pushState|replaceState` 전수). 테스트만 `replaceState({ idx: 2 })` 로 흉내 냄(`history-back-fallback-single-action.test.ts:20`).
- 따라서 Capacitor WebView(첫 문서 `document.referrer` 빈 값)에서는 항상 `history-back-fallback.ts:84-88` 의 `router.back(); pushFallbackIfStale();` 로 간다 → 콜드 푸시 `[/, B]` 에서 머리글 ‹ = HOME. 감사 §5-1 의 「코드상 머리글 ‹ 는 `history.state.idx>0` 이면 `router.back()`」 문장은 전제가 틀렸다(그 분기는 운영에서 도달 불가).
- 부수 위험: 「SINGLE-ACTION」 주석(`history-back-fallback.ts:8-13`)이 막았다고 한 「back + 280ms 감시 + push」 경합이 실제로는 **모든 앱 화면 머리글 뒤로에 살아 있다**(메인 스레드가 280ms 넘게 막히면 두 번째 이동 가능). 범위 밖 — 보고만.

### A2. (a)(b) 앱 안 이동 — **CODE-CONFIRMED (PASS 와 일치)**
- 배너는 `InAppNotificationBannerHost.tsx:126` `router.push(communityMessengerRoomHref(target.roomId, null, target.listSource))` — 사용자 탭(활성화 있음) → 이전 항목 건너뛰기 아님 → 네이티브 `canGoBack=true` → `webView.goBack()`(`DibaySystemBackPlugin.java:49-51`). (a) A→B→◁=A→◁=목록 일치.
- (b) 머리글 ‹: `CommunityMessengerRoomPhase2Header.tsx:255-257` → `requestAnimatedBack` → `MessengerRoomSwipeBackShell.tsx:207-217` `commitNavigation` → `runMessengerRoomBackNavigation` → `runHistoryBackWithFallback`(A1 의 280ms 경로) → `router.back()` → 목록. 일치.

### A3. 뒤로 판단 코드 2벌 — **CODE-CONFIRMED**
- 머리글·웹 가장자리: `messenger-room-back-navigation.ts:35-71` (`cm_return` → override → `buildMessengerRoomListBackHref`) → `history-back-fallback.ts`.
- ◁: `DibaySystemBackPlugin.java:38-58` (JS 가 원할 때만 JS, 아니면 `webView.goBack()`, 아니면 시스템) + `overlay-back-stack.ts:98-110`. 방 목적지(`resolveMessengerRoomBackNavigation`)는 ◁ 경로에서 **한 번도 호출되지 않는다**.

### A4. 오픈 그룹 머리글 replace vs ◁ — **CODE-CONFIRMED FAIL**
- 머리글(모바일): `requestAnimatedBack` → `MessengerRoomSwipeBackShell.tsx:210-213` `if (roomType === "open_group") { router.replace(SAMARKET_ROUTES.chat.messengerMeetingsHub ...) }` (= `/community-messenger?section=open_chat`, `lib/app/samarket-route-map.ts:90`).
- 머리글(분할): `CommunityMessengerRoomPhase2Header.tsx:239-241` 같은 replace. 모바일 폴백 `:263-265` 동일.
- ◁: 위 A3 — `webView.goBack()` = 이전 화면. → 같은 화면에서 ‹ 와 ◁ 목적지 다름(Android 「Up = Back」 위반, final-report E1·D2 와 같은 종류).

### A5. 분할 화면 replace vs push — **CODE-CONFIRMED FAIL (감사 N6 보정)**
- 목록 행: `community-messenger-room-forward-navigation.ts:152-155` `sameLayerRoomSwitch ? router.replace : router.push`.
- 직접 `router.push` 하는 방 진입(분할 규칙 무시): `InAppNotificationBannerHost.tsx:126`, `MessengerContactsMemberSheet.tsx:100`, `GlobalIncomingFriendRequestHost.tsx:98`, `use-messenger-room-phase2-controller.ts:2339`, `PushRouteListener.tsx:536`.
- 보정: 감사 N6 은 근거로 `forward-navigation.ts:152-155` 만 들었는데, 실제 불일치 출처는 위 5곳 직접 push 다. (참고: `cm-participant-unread-full-effects.ts:97` 는 forward-navigation 을 쓰므로 replace 규칙을 따른다.)

### A6. A↔B 반복 시 중복 기록 — **CODE-CONFIRMED (구조) / 결함 판정은 NOT_PROVEN**
- 배너는 항상 push(A5) → `[목록, A, B, A, B]`. 중복 제거 코드 없음.
- 그러나 감사 §5-1 은 (a) 를 「레거시와 같은 쌓기 PASS」로 판정했다. 레거시가 A→B→A 에서 같은 방으로 되돌아가는지(중복 제거) 측정 증거가 없다. **N5 를 「결함」으로 적은 것은 증거 없는 판정** — 레거시 실측 전에는 NOT_PROVEN 으로 두고 구현하지 않는다(아래 B 에서 제외).

### A7. reload 후 푸시 이탈 표시 유실 — **CODE-CONFIRMED FAIL**
- `push-navigation-back.ts:21` `const leftByPush = new Set<string>();` — 모듈 메모리. 문서 reload(새 배포 반영·`location.reload`) 시 비어 `isPushNavigationBackActive()` 거짓 → 콜드 푸시 방에서 ◁ = (`canGoBack=false` 이므로) 시스템 → 앱이 작업 뒤로. 설계 문서 자신이 인정: `push-entry-back-fix-design §5` 「문서가 다시 열리면 … 목록이 비어 조건 거짓 → 지금 동작(무반응)」.
- 추가: 앱 첫 항목이 방인 경우(App Link·프로세스 복원 reload) 머리글 ‹ 는 `history.length===1` → `history-back-fallback.ts:91` `router.push(fallbackHref)` → 기록 `[방, 목록]` → 목록에서 ◁ = 다시 방. **역방향 루프** (CODE-CONFIRMED, 기기 NOT_PROVEN).

### A8. (d) 첫 탭 무시

#### A8-1. 하단 탭 telRING 3건 — 후보 「메신저 탭 로그인 확인」: **코드상 조용히 버리는 경로 존재 확인 / 실제 원인 NOT_PROVEN**
`components/layout/BottomNav.tsx:801-833`:
```ts
if (commitOpts.href.includes("/community-messenger")) {
  const boot = peekAppBootProfile();
  const cached = getCurrentUser() ?? (boot?.id ? profileRowToClientProfile(boot) : null);
  if (cached?.id && isClientSignupComplete(cached)) { run(); return; }   // 동기 — 버려지지 않음
  ...
  void requireAuthAction("messenger_open", () => {
    commitBottomNavTabRoute({ ...commitOpts, deferredAfterAwait: true });
  }, { next: commitOpts.href }).then((ok) => { if (!ok) failPending(); }, failPending);
```
`lib/auth/require-auth-action.ts:160-173`:
```ts
if (isRecoveringPhase(phase) || phase === "loading") {
  const health = await ensureSessionHealthy(...);
  if (health.ok) { profile = await resolveClientProfile(); }
  else if (isRecoveringPhase(health.phase)) {
    console.info("[requireAuthAction] auth_resolution_hold", ...);
    return false;            // ← 시트 없음, 이동 없음, failPending 이 탭 표시를 되돌림 = 조용한 무시
  }
}
```
- `isRecoveringPhase` = `recovering || loading` (`dibay-session-policy.ts:62-64`). `ensureSessionHealthy` 는 네트워크 재시도 오류에서 `{ ok:false, phase:"loading" }` 을 돌려줌(`dibay-session-manager.ts:346-350`) → 그대로 hold.
- 비동기 경로에 두 번째 무시 지점: 통과해도 `deferredAfterAwait` → `main-bottom-nav-route-commit.ts:206-211` `args.deferredAfterAwait ? "bottom_nav_async" : "bottom_nav_explicit"` → 방 진입 잠금(2.5초, `cm-deep-route-navigation-lock.ts:9`) 중이면 `evaluateDeepRouteNavigationGuard` 가 `allow:false` → `blocked`(경고 로그만).
- 두 경로 모두 **프로필 캐시가 비어 있을 때만** 탄다. 캐시는 앱 부트 프로필(`run-app-boot.ts:199·487`) 또는 `resolveClientProfileFromSession`(`resolve-client-profile-session.ts:37`)이 채운다. `am kill` 후 콜드 푸시에서 방 B 는 서버 쿠키 부트스트랩으로 열리므로 클라이언트 프로필 캐시가 비어 있을 수 있다 — 통제 재시험(프로세스 유지, 캐시 있음)에서 0건인 것과 맞다. 두 번째 탭이 통과하는 것도 첫 호출이 세션 확인을 끝내 캐시를 채운다는 설명과 맞다.
- 판정: 탭 3건을 **설명할 수 있는 유일한 코드 경로**이나, 당시 logcat 이 지워져 `auth_resolution_hold`·`blocked_navigation` 로그 증거가 없다 → 원인 **NOT_PROVEN**. 이미 두 로그가 코드에 있으므로 재현 시 Capacitor 콘솔 로그만 보존하면 판별된다(아래 계측).

#### A8-2. 목록 행 2건 — 감사 §6-1 「후보 12개 중 3초 이상 뒤 탭을 막는 것 없음」은 **불완전**. 새로 찾은 경로 2개:

(i) **포인터 캡처 상실 → 탭 폐기** (CODE-CONFIRMED 경로 / 발생 NOT_PROVEN)
- 행은 누를 때 캡처: `MessengerChatListItem.tsx:751` `setPointerCapture?.(e.pointerId)`.
- 캡처를 잃으면 탭 폐기: `:1313-1316` `onLostPointerCapture={(e) => { ...; onPointerCancel(e); }}` → `forceCloseSwipeOnCancel`(`:861-885`) → `closeSwipe()` 만, 이동 없음.
- 손가락이 닿은 사이(100~200ms)에 행 DOM 이 **문서에서 빠지거나 옮겨지면** 브라우저가 `lostpointercapture` 를 보낸다. 이 목록에서 그런 일이 생기는 조건:
  - 목록 순서 변경(새 메시지·홈 동기화로 행 위로 이동 → React 가 keyed 노드를 `insertBefore` 로 이동).
  - `CommunityMessengerChatList.tsx:18·89` `VIRTUAL_THRESHOLD = 16` — 개수가 16을 넘나들면 평면 목록 ↔ 가상 목록 전환으로 행 전체 재마운트(`:131-140` vs `:146-160`).
  - 콜드 시작 직후 목록은 스냅샷 → 서버 갱신(감사 2026-11-10 §B: 채팅 탭 진입 직후 API 5~9건)으로 순서·개수가 바뀌는 시간대다 — 「콜드 직후에만, 두 번째 탭은 성공」과 맞는다.
(ii) **길게 누름 뒤 다음 탭 1회 폐기** (CODE-CONFIRMED 결정적 결함 — 단 측정 당시 길게 누름 여부 미확인)
- 길게 누름이 끝나면 훅이 `suppressNextClickRef.current = true`(`use-messenger-long-press.ts:69-74`), 행은 `tapNavigateArmedRef.current = false`(`MessengerChatListItem.tsx:661`).
- 손을 뗄 때 `:812-815` `if (!tapNavigateArmedRef.current) { releasePressedVisual(); return; }` 에서 먼저 반환 → `consumeClickSuppression()` 이 호출되지 않아 플래그가 남는다. 훅 `onPointerDown`(`:63-75`)도 플래그를 지우지 않는다.
- 다음 정상 탭: `:818` `if (longPressTriggeredRef.current || consumeClickSuppression())` → 남은 플래그 소비 → **이동 없이 반환**. 같은 행에 대해 길게 누름(메뉴) 뒤 첫 탭은 항상 무시된다.
(iii) 참고(약함): 행 `touch-pan-y`(`:1290`) — 미세 세로 이동 시 브라우저 `pointercancel` 로 탭 폐기. 모든 상황에 공통이라 「콜드 직후만」을 설명 못 함.
- 배제(코드): 딥 경로 잠금 — `room_forward` 는 항상 허용(`cm-deep-route-navigation-lock.ts:105-107`), 행 이동은 `runCommunityMessengerRoomForwardNavigation` → `guardedClientNavigate(navigate, dest, "room_forward")`(`forward-navigation.ts:157`). 방 열기 인증 게이트 없음(행 경로에 `requireAuthAction` 없음).

#### A8-3. 계측 계획 (원인 확정용 — 코드 PASS 와 별개)
1. 진단 로그 1줄(이유 코드), 웹만:
   - 행: `MessengerChatListItem` 의 모든 조기 반환에 `console.info("[cm-row-tap] dropped", { reason, roomId, msSincePointerDown })` — reason ∈ `lost_capture | pointercancel | suppressed_longpress | not_armed | swipe_open | dragging`.
   - 탭: `BottomNav.commitTabRoute` 에 `[bottom-nav-tap] path=sync|async`, `requireAuthAction` 반환 false 이유(`auth_resolution_hold | login_sheet | consent | profile`), `commitMainBottomNavRoute` blocked 이유.
2. 재현 순서(Xiaomi 동일 기기, Production SHA·빌드·PHT 기록): `adb logcat -c` 금지 → `adb logcat -v time Capacitor/Console:I chromium:I DIBAY_SYSBACK:I *:S > file` 를 먼저 켬 → `am kill com.dibay.app` → 알림 탭 → 방 → ◁ → 1초 안에 telRING 탭 ×1, 목록 첫 행 탭 ×1 → 10회 반복 + 대조(프로세스 유지) 10회.
3. 판정: 탭 무시 시점의 이유 코드가 원인. 로그 없는 무시(이유 코드 0) = 웹 이벤트가 오지 않음 → 네이티브 덮개·WebView 입력 쪽으로 범위 이동.

---

## PART B — 설계: 메신저 방 「뒤로 목적지」 단일 정의 (P5)

### B0. 계약·충돌 먼저
- 하드락 재개 조건 B 「locked navigation consumer 직접 수정」에 해당(`MessengerRoomSwipeBackShell` Room Back) → `dibay-messenger-page-navigation-android-hard-lock.md` 「Future change gate」 대로 **직접 영향 계약(Room Back 모션 LEFT→RIGHT, 1 이동·1 모션 주인)만 회귀 시험**한다. 금지 목록(`setTimeout·retry·duplicate navigation·fallback navigation`) — 아래 설계는 **1회 이동(back 또는 replace 중 하나)** 만 쓰고 280ms 폴백을 방 경로에서 제거한다.
- final-report §4 R2(「앱 첫 기록이 시작 화면이 아니면 ◁ = HOME」) 와 Owner 요구(「콜드/푸시 진입 = 방 종류 목록, HOME·종료 금지」) 는 **충돌**한다(R2 는 미구현·미승인). 이 설계는 Owner 지시(감사 D5-b ②)를 따르고 충돌을 보고한다. 목록에서의 다음 ◁ 는 기존 결함 E 경로 그대로(HOME → 나감) — F4/Android 「고정 시작 화면」과 일치.
- 통화 변경 규정: 통화 경로·`MainActivity` 통화 콜백·`IncomingCallActivity` 무변경. 방 화면(`/community-messenger/rooms/*`)에서만 동작하므로 통화 경로(`/community-messenger/calls*`)는 대상 아님.
- **네이티브 빌드 불필요**: `DibaySystemBack.setActive`(71 포함)와 구 설치본 `@capacitor/app` 리스너 경로(`overlay-back-stack.ts:46-56`)를 그대로 쓴다. capacitor.config 변경 없음.

### B1. 신규 SSOT — `lib/community-messenger/room/messenger-room-back-target.ts`
```ts
export type MessengerRoomBackTarget =
  | { kind: "history_back" }                 // 앱 안 직전 화면이 있음 → router.back() 1회 (폴백 없음)
  | { kind: "replace"; href: string };       // 직전 화면 없음/알림 진입 → 방 종류 목록으로 replace 1회

export function resolveMessengerRoomBackTarget(args: {
  roomId: string;
  roomType: string | null;                   // open_group 등
  roomDomain: "trade" | "store_order" | "community" | null; // snapshot.room.chatDomain
  searchParams: { get(k: string): string | null };
  entry: MessengerRoomEntryOrigin;           // B2
}): MessengerRoomBackTarget
```
규칙(순서 고정):
1. `entry === "in_app"` → `history_back`. (오픈 그룹·분할 포함 — 오픈 그룹 replace 특례 삭제 = D5-b ④)
2. 그 밖(`"push" | "first_entry"`) → `replace(listHref)`:
   - `cm_return` 유효 → 그 값(`sanitizeMessengerRoomReturnHref` 재사용).
   - `roomType === "open_group"` → `SAMARKET_ROUTES.chat.messengerMeetingsHub`.
   - `cm_list` 있으면 `buildMessengerRoomListBackHref`(현행), 없으면 `roomDomain` 으로 추론: trade → `/community-messenger/trade-chats`, store_order → `/community-messenger/delivery-chats`(현행 폴백과 동일), 그 외 → `/community-messenger?section=chats`.
   - **Owner 결정 필요(비워 둠)**: 매장 사장님이 주문 채팅 알림으로 들어온 경우의 목록. 계약 없음 → 현행 폴백(`delivery-chats`) 유지하고 보고.
3. `override`(`setMessengerRoomBackOverride`) 는 호출처 0곳(grep) → 삭제하거나 규칙 2의 맨 앞으로(호출처 생기면).

### B2. 진입 출처 — `lib/community-messenger/room/messenger-room-entry-origin-store.ts`
- 값: `"push" | "in_app" | "first_entry"`.
- 키: Navigation API `navigation.currentEntry.key`(Chromium WebView — 결함 E 코드가 이미 의존). 저장: `sessionStorage`(`dibay:cm-room-entry:<key>`, 상한 50 — `overlay` 표시 정리와 같은 상한 방식). **reload 유지**(A7 해결). Navigation API 없는 환경(iOS WKWebView 구버전) 키 = `${history.length}:${location.pathname}`.
- 쓰는 곳 2곳만:
  - `PushRouteListener.tsx` deliverRoute 비통화 push(현 `:535-536`) — 방 경로면 이동이 끝난 첫 `currententrychange`(없으면 방 셸 마운트 때 대기 표시 소비)에 `"push"` 기록.
  - 읽을 때 기록 없음 → `navigation.currentEntry.index === 0`(또는 `history.length === 1`) 이면 `"first_entry"`, 아니면 `"in_app"`.
- 같은 이유로 `push-navigation-back.ts` 의 `leftByPush` 도 같은 sessionStorage 로 옮긴다(A7, 비메신저 화면 결함 E 의 reload 유실 동시 해결 — 같은 원인·같은 파일 묶음).
- URL 쿼리(`cm_entry=push`)는 **쓰지 않는다**: 네이티브 ACK 가 WebView 주소와 대기 경로를 비교(`MainActivity.java:1155-1158` `webViewPathMatchesPending`, `PushRouteAckMatch.java` 「양쪽 다 쿼리면 불일치」) → 대기 경로 재전달 루프 위험, 네이티브 수정이 필요해짐.

### B3. 호출처 전부 (before → after)
| # | 파일·함수 | 지금 | 바뀐 뒤 |
|---|---|---|---|
| 1 | `MessengerRoomSwipeBackShell.tsx` `commitNavigation`(:207-217) | open_group replace / 그 외 `runMessengerRoomBackNavigation`(back+280ms 폴백) | `resolveMessengerRoomBackTarget` → `history_back` = `router.back()` 1회, `replace` = `router.replace(href,{scroll:false})` 1회. 모션은 기존 `exitWithSnapshot`/`snap-away` 그대로(1 모션 주인) |
| 2 | 같은 파일 `backPlan` useMemo(:102-110) | `resolveMessengerRoomBackNavigation` | 신규 함수(roomType·domain·entry 입력) |
| 3 | `CommunityMessengerRoomPhase2Header.tsx` `handleBack`(:225-271) | 분할·폴백에서 open_group replace + `runMessengerRoomBackNavigation` | slide host 닫기 우선(유지) → 분할/모바일 모두 신규 함수 실행 함수 1개 호출. open_group 분기 삭제 |
| 4 | `CommunityMessengerRoomClientPhase2Body.tsx`(:722-732) 「방 없음」 버튼 | 구 함수 | 신규 함수(roomType 없음 → 규칙 2 기본 목록) |
| 5 | **Android ◁ (신규)** `overlay-back-stack.ts` | 오버레이·결함 E 만 | 「페이지 뒤로 주인」 슬롯 1개 추가: `setPageBackOwner(fn \| null)`. `wanted = stack.length>0 \|\| pageOwner \|\| pushNavigationBackActive`. 처리 순서: 인트로 → 오버레이 → **pageOwner** → 결함 E → canGoBack. 리스너 1개 원칙 유지 |
| 6 | `MessengerRoomSwipeBackShell` 마운트 효과 | — | 목적지가 `replace` 일 때만 `setPageBackOwner(requestAnimatedBack)`; `history_back` 이면 등록 안 함 → ◁ 는 지금처럼 네이티브 `webView.goBack()`(S1 「받을 일이 있을 때만」 유지, B2 JS 의존 최소). 언마운트·목적지 변경 시 해제 |
| 7 | `messenger-room-back-navigation.ts` | `resolve…/run…` | 신규 함수로 위임 후 삭제(호출처 1·2·3·4 뿐 — grep 확인) |
| 8 | 분할 방 전환(A5) | 직접 push 5곳 | 공용 `messengerRoomNavigateMethod(router)`(분할 & 현재 방 경로 → replace, 아니면 push) 를 `InAppNotificationBannerHost:126`, `MessengerContactsMemberSheet:100`, `GlobalIncomingFriendRequestHost:98`, `use-messenger-room-phase2-controller:2339` 에 적용. `PushRouteListener` 는 push 유지(B2 가 출처로 처리) |

손대지 않음: `history-back-fallback.ts`(다른 화면 20여 곳 공용 — idx 사문화는 보고만), `DibaySystemBackPlugin.java`, `MainActivity`, 통화 전체, iOS 네이티브(`allowsBackForwardNavigationGestures` 는 글쓰기 작성기에서만 켜짐 — `DibayRootBridgeViewController.swift:100-108` — 방에서는 꺼진 채 유지, 방 뒤로 = 머리글 ‹·웹 가장자리 = 신규 함수).

### B4. 경로별 결과 (after)
| 경로 | ‹ / 웹 스와이프 | Android ◁ | iOS ‹·스와이프 |
|---|---|---|---|
| 목록→A→배너→B | A | A(goBack) | A |
| 콜드 푸시 → B | 방 종류 목록(replace) | 같음(pageOwner) | 같음 |
| 웜 푸시(다른 화면에서) → B | 목록 | 목록 | 목록 |
| 푸시 B → 배너 C | C→B(back)→목록(replace) | 같음 | 같음 |
| 첫 항목이 방(App Link·복원) | 목록(replace, 역루프 제거) | 같음 | 같음 |
| reload 후(콜드 푸시 방) | 목록 | 목록(sessionStorage) | 목록 |
| 오픈 그룹, 앱 안 진입 | 직전 화면(= ◁) | 직전 화면 | 직전 화면 |
| 오픈 그룹, 푸시 진입 | 모임 허브 | 모임 허브 | 모임 허브 |
| 분할 방→방(배너 포함) | 허브(기록 [허브, 방]) | 같음 | 같음 |

### B5. 첫 탭 무시 수정 (D6-e 보강)
1. 메신저 탭: `BottomNav.commitTabRoute` 의 `/community-messenger` 분기에서 `requireAuthAction` 을 **이동 앞의 문지기로 쓰지 않는다** — 세션이 `loading|recovering` 이고 캐시만 없을 때는 `run()`(동기, `bottom_nav_explicit`)으로 먼저 이동하고, 로그인 판정은 메신저 경로의 화면 게이트에 맡긴다. 비회원 확정(`terminal_guest`)일 때만 지금처럼 로그인 시트. → `auth_resolution_hold` 무음 폐기와 `bottom_nav_async` 잠금 폐기 둘 다 제거.
2. 행 (ii) 결함: `use-messenger-long-press.ts` `onPointerDown` 에서 `suppressNextClickRef.current = false` 초기화 + `MessengerChatListItem.onPointerUp` 의 길게 누름 분기에서 `consumeClickSuppression()` 을 항상 호출(단락 평가 제거).
3. 행 (i): `onLostPointerCapture` 가 「손을 떼기 전 캡처 상실 + 드래그 아님」이면 탭 후보를 유지하고 다음 `pointerup`(문서 레벨 1회 리스너)에서 이동 — 단 계측(A8-3)으로 원인 확정 후에만 적용(증거 없이 고치지 않음 · `fundamental-fixes-only`).
4. 계측 로그(A8-3 ①)는 같은 PR 에 포함.

### B6. 회귀 위험 · 같은 단계 처리
- 오버레이/시트 ◁: pageOwner 는 오버레이 **뒤** 순서 → 시트 열린 채 ◁ = 시트만 닫힘. 시험: 방 안 첨부 시트·메뉴·확인창 ◁.
- blocking 대화 상자(final-report M1): pageOwner 가 생기면 「삼킴」 오버레이 아래 페이지가 넘어가지 않는지 — 오버레이 `onBack=null` 이 먼저 소비하므로 유지. 시험 1건.
- 통화 화면 뒤로 하드락(`docs/dibay-call-minimized-surface-cta-ssot.md`): 통화 라우트에는 방 셸이 없어 pageOwner 미등록. 네이티브 통화 콜백(`MainActivity` 연결 중 콜백)은 플러그인 콜백보다 나중에 등록되어 우선 — 무변경. 방에서 통화 시작 → PiP → 방 복귀 → ◁ 1건 시험.
- 거래·주문 방: `buyerSlideHost/ownerSlideHost.closeSlide` 우선 순서 유지(헤더). ◁ 에서도 슬라이드가 오버레이 스택에 등록돼 있는지 확인 필요 — 미등록이면 pageOwner 가 슬라이드를 건너뛸 수 있음(**NOT_PROVEN, 구현 전 확인 항목**).
- 딥링크·App Link 첫 항목: `first_entry` → replace(목록) — 역루프 제거.
- Room Back 모션 하드락: replace 경로도 `exitWithSnapshot` 사용 → 1 이동·1 모션. popstate 퇴장 그림(`:238-256`)은 history_back 에서만 — 기존 그대로.
- iOS: Navigation API 없으면 slot 키 — 충돌 시 결과는 「목록」(안전한 쪽). 
- 비메신저 결함 E: `leftByPush` 저장소만 바뀜(동작 동일 + reload 유지).

### B7. 시험 (vitest)
- 신규 `messenger-room-back-target.test.ts`: 규칙 1·2 전 분기(in_app·push·first_entry × open_group·trade·store_order·cm_return·cm_list).
- `messenger-room-entry-origin-store.test.ts`: Navigation key 저장·reload 모사(모듈 재import 후 유지)·상한 50·Navigation API 없음 폴백.
- `overlay-back-stack.test.ts`/`-system-back-driver.test.ts`: pageOwner 슬롯 — 순서(오버레이>pageOwner>결함 E), 등록 시 setActive(true)·해제 시 false, 리스너 1개.
- `push-navigation-back.test.ts`: sessionStorage 이관 후 reload 유지.
- `messenger-room-back-navigation.test.ts`: 삭제 또는 신규 함수 위임 시험으로 교체.
- 헤더·셸 계약 시험: open_group replace 문자열 계약이 있으면 갱신.
- `use-messenger-long-press`·행: 길게 누름 → 다음 탭 이동됨.
- BottomNav: 캐시 없음 + `loading` → 즉시 이동(`bottom_nav_explicit`).

### B8. 실기 행렬 (Android Samsung 3버튼·Xiaomi 제스처 + iPhone, 매 항목 Production SHA·설치 버전·PHT)
B4 표 9행 × (‹ / ◁ 또는 iOS 스와이프) + 목록에서 다음 ◁(HOME→나감) + 시트 열린 채 ◁ + 통화 PiP 복귀 후 ◁ + `am kill`→콜드 푸시→◁→탭 첫 탭 10회 / 대조 10회(계측 로그 보존) + 길게 누름 뒤 첫 탭. 레거시 비교: A→B→A 쌓기(A6 판정용).

### B9. 배포·롤백
- `[배포 구분]` 웹만(네이티브·DB 무변경) — 앱 재시작. 통화 파일 무변경 → 통화 단독 규정 비해당.
- 롤백: Vercel Instant Rollback(개발 프로세스 2번) 또는 PR revert. sessionStorage 키는 이전 코드가 읽지 않아 무해.

---

## 기존 감사 설계(D5·D6)에 대한 반론 요약
1. D5-c 「웹 시작 때 목록을 아래 1칸 깔고 push(방)」은 콜드 시작 시 이동 2회(replace 목록 + push 방) = 하드락 금지 「duplicate navigation」, 목록 화면 깜빡임·RSC 2회. 위 설계는 기록을 꾸미지 않고 **뒤로 순간에 목적지만 결정**한다.
2. D5-a 「◁ 는 방 화면에서 JS 리스너 상시」는 final-report S1·B2(「받을 일이 있을 때만」, JS 멈춤 시 ◁ 무반응) 와 충돌 → 목적지가 replace 일 때만 소유.
3. D5-c 「표시를 `history.state` 에 저장」은 Next 가 다음 내부 replaceState 에서 사용자 필드를 지운다(`app-router.js:50-52` `preserveCustomHistoryState ? history.state : {}`) → sessionStorage + 항목 key.
4. N5(중복 기록)는 레거시 증거 없이 결함 판정 — 제외.
5. N6 근거 줄 오지정 — 실제는 직접 push 5곳.
6. §5-1 「머리글 ‹ = idx>0 이면 router.back()」 전제 오류 — idx 는 App Router 에 없음.
7. X1 후보 검토에서 포인터 캡처 상실·길게 누름 플래그 잔존이 빠짐.

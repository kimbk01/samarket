# Community Messenger — 카톡/텔레그램형 네비·인증·통화 계약

**목적:** 2026-06-21 rollback 사고(방·통화 진입 → `/mypage` 덮임) 재발 방지.  
**검증:** `npm run verify:cm-kakao-telegram-navigation-contract`  
**Cursor:** `.cursor/rules/cm-kakao-telegram-navigation-contract.mdc`

---

## 1. 사고 원인 (더블체크 확정)

| 순위 | 원인 | 증상 | 수정 커밋 |
|------|------|------|-----------|
| **P0** | `signupComplete = consent && @id && profile` | `DibaySignupGate`가 약관 동의만 한 사용자의 `/community-messenger/rooms/*`, `/calls/*` 를 `POST_LOGIN_PATH`(`/mypage`)로 **replace** | `b0820eba` |
| ~~P0~~ | 하단 탭 async replace 레이스 | 탭·deep route 동시 커밋 시 URL 흔들림 (mypage 덮임의 **직접 원인 아님**) | `9be75241` |
| P1 | 배너 수락 route-first (`action=accept` 라우트 선행) | 이중 PATCH·화면 튐·join 지연 | `e5dd598f` |
| P1 | ActiveCallHost stale mount | 통화 종료 후 host 가 CallClient 재마운트 → mypage bounce | `call-page-host-ownership` |

**금지 (재발):** HTML/private 경로 게이트에 `@id`·프로필을 다시 묶지 않는다.

---

## 2. 카톡/텔레그램형 4계층

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1 — Hub tabs (하단 BottomNav, /market, /philife…)   │
│   동기 replace/push · commitMainBottomNavRoute 단일 진입   │
│   microtask/setTimeout 으로 router 이동 금지              │
├─────────────────────────────────────────────────────────┤
│ Tier 2 — Stack deep routes (방·통화)                      │
│   /community-messenger/rooms/[id]  → room_forward push   │
│   /community-messenger/calls/[id]  → call_launch push    │
│   cm-deep-route-navigation-lock · guardedClientNavigate  │
├─────────────────────────────────────────────────────────┤
│ Tier 3 — Auth gates (3 layers)                           │
│   A HTML gate     → consentComplete ONLY (DibaySignupGate)│
│   B Client UI     → isClientSignupComplete = consent      │
│   C Feature/action→ @id · profile · address · phone       │
├─────────────────────────────────────────────────────────┤
│ Tier 4 — Call accept SSOT                                │
│   PATCH 1회 = incoming-call-accept-gateway               │
│   영상 1:1 → skipRouteReplace + ActiveCallHost in-place  │
│   음성 1:1 → PATCH 후 buildPostAcceptActiveCallHref      │
└─────────────────────────────────────────────────────────┘
```

### Tier 1 — Hub tabs

- **단일 커밋:** `lib/main-menu/main-bottom-nav-route-commit.ts` → `commitMainBottomNavRoute`
- **DO NOT:** `router.replace` / `router.push` 를 `setTimeout`·`queueMicrotask`·`await` 뒤로 미루기
- **Deep lock:** 방/통화 진입 중 하단 탭은 `bottom_nav_async` — lock 이 `bottom_nav_explicit` 로 풀리지 않게

### Tier 2 — Stack deep routes

- **Lock:** `lib/navigation/cm-deep-route-navigation-lock.ts`
- **Guard:** `lib/navigation/guarded-client-navigation.ts`
- **Room 진입:** `community-messenger-room-forward-navigation.ts` → `beginRoomDeepRouteNavigationLock`
- **Call 진입:** `call-session-navigation-seed.ts` → `beginCallDeepRouteNavigationLock` + `abortPendingMainBottomNavRouteCommits`
- **의미:** 허브 탭 = 같은 층 replace. 방/통화 = 스택 push — 뒤로가기는 허브로.

### Tier 3 — Auth (consent-only HTML gate)

| Layer | 모듈 | 판정 |
|-------|------|------|
| A | `DibaySignupGate`, `shouldBlockUnauthenticatedHtmlRequest` | `consentComplete` |
| B | `isClientSignupComplete` | `consentComplete` |
| C | `requireAuthAction`, `requireProfileCompletion`, onboarding paths | `@id`, profile, address |

- **SSOT:** `deriveDibaySignupStatus` → `signupComplete = consentComplete` (주석 CONTRACT 유지)
- **DO NOT:** `signupComplete = consentComplete && dibayIdComplete && profileComplete`

### Tier 4 — Call accept

- **PATCH owner:** `runIncomingCallAccept` / `acceptIncomingCallOnce` only
- **Banner 1:1:** `GlobalCommunityMessengerIncomingCall` → gateway async (route-first 금지)
- **Video in-place:** `skipRouteReplace: true` + `prewarmInPlaceDirectVideoCallHost` + `ActiveCallHost`
- **Audio route:** `buildPostAcceptActiveCallHref` (`nativeAccept=1`, no `action=accept`)
- **Host ownership:** `call-page-host-ownership.ts` — dedicated call route vs in-place host 분리

---

## 3. 수정 시 체크리스트

- [ ] auth/signup/status 변경 시 `verify:auth-session-contract` + 본 contract verify
- [ ] nav/bottom-tab 변경 시 hub **동기** 커밋 유지
- [ ] call accept 변경 시 gateway 외 PATCH 없음
- [ ] deep route HTML gate 변경 시 **consent only** 유지
- [ ] 계약 주석(`SSOT_CONTRACT`) 삭제 시 본 문서·verify 스크립트 동시 갱신

---

## 4. 변경 이력 (append-only)

| 날짜 | 요약 |
|------|------|
| 2026-06-21 | rollback 복구 후 카톡/텔레그램형 4계층 계약 문서·verify 추가 |

# P4 통화 화면 로딩 스피너 — 영향 분석 (2026-11-22 · Owner 「C1·C2만 승인」)

## 0. 근거 · 지켜야 할 규정

- **Owner 지시**: 「P4 통화 화면 영향 분석 문서 작성」(2026-11-22).
- **상위 설계**: `docs/audit/loading-spinner-network-notice-design-2026-11-22.md`
  - §3-1 · W9: 통화 화면은 P1~P3 에서 뺐고, P4 에서 통화 단독으로 다룬다.
- **AGENTS.md 통화 변경 규정**
  - 1번: 웹 통화 코드도 적용 범위다.
  - 2번: 수정 전에 「왜」를 증거로 밝힌다.
  - 3번: 영향 분석 문서 → Owner 승인 → 구현.
  - 4번: 통화만 단독 커밋한다.
  - 5번: 코드 PASS 와 실기 PASS 를 둘 다 받는다.
- **`docs/dibay-call-presentation-cross-platform-hard-lock.md`**
  - Android·iOS 통화 표시가 **HARD LOCK** 이다.
  - 「Reopen only if … Production presentation regression · locked presentation consumer change · Cap/Web presentation authority change · **Owner explicit reopen**」.
  - 통화 화면 모양을 바꾸려면 Owner 의 명시 재개방이 필요하다(§6).
- **`docs/dibay-call-minimized-surface-cta-ssot.md`**(통화 화면 밖 표면·CTA HARD LOCK)
  - 범위가 Android 1:1 연결 후 표면 6개와 그 CTA 다(§0). 아래 대상은 그 표면에 들지 않는다.

**확인 방법**
- 모두 코드(`origin/main 1d0b99bea`), 운영 Vercel 환경 변수 목록(값 미조회), 운영 DB 읽기 전용 조회로 확인했다.
- 통화 화면에서 빈 프레임이 실제로 보이는지는 **측정하지 않았다(NOT_PROVEN)**.

---

## 1. 대상 전수 (P1 기준선에 남긴 통화 항목)

### 1-1. 운영에서 쓰이는 통화 경로 (확인)

| 경로 | 운영 사용 | 근거 |
|---|---|---|
| `/community-messenger/calls-v4/[callId]` | **사용** | `components/route-transition/call-surface-transition-path.ts` 주석 「`calls-v4/**`(운영 경로)」(R3-A Owner 승인 2026-11-12). Vercel 운영에 `NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE` 이 있다(target=production, 값은 민감 정보라 읽지 않음) |
| 발신 시작 | Android·iOS 앱 → V4 세션 생성 + 네이티브 화면으로 넘김 / 웹 → V4 | `lib/community-messenger/call-session-navigation-seed.ts` `launchOutgoingDirectCall`(:803~) — `ios_native_v4`·`ios_native_v4_video`·`android_native_v4`·`v4_telegram_lane` 분기. 레거시 발신 화면 주소(`/calls/outgoing`)로 가는 분기는 V4 플래그가 꺼졌을 때만 |
| `/community-messenger/calls/[sessionId]` | V4 플래그가 켜져 있으면 `calls-v4/…`(임시 세션은 `/calls/outgoing`)로 바로 넘긴다. 그 사이 통화 골격 로딩을 보인다 | `calls/[sessionId]/page.tsx:59-67, 80-82` |
| `/community-messenger/calls-v3/[callId]` | **미사용**(V3 플래그가 운영에 없음) | Vercel 운영 환경 변수 목록에 `NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE` 없음 |
| `/community-messenger/calls/outgoing` | V4 플래그가 꺼졌을 때·임시 세션 주소로 들어올 때만 | 위 발신 분기 + `calls/[sessionId]/page.tsx:64-65` |
| `/community-messenger/calls/logs` | 화면 없음 — 서버가 메신저 홈 통화 탭으로 바로 넘긴다 | `calls/logs/page.tsx`(`redirect`) |

### 1-2. 스피너·빈 화면 지점

| # | 지점 | 지금 | 운영에서 보이나 | 근거 |
|---|---|---|---|---|
| C1 | 레거시 발신 화면 스피너 `CommunityMessengerOutgoingDialPageClient.tsx:84-87` | 테두리 링 `animate-spin`(40px 흰색) + 「통화 화면으로 이동 중」 | V4 플래그가 꺼졌거나 임시 세션 주소로 들어올 때만 | §1-1 |
| C2 | 통화 기록 다시 걸기 버튼 `CommunityMessengerCallActionButton.tsx:51` | `loading` 이면 `Loader2` 회전 | **안 보인다** — 유일한 호출처 `CommunityMessengerCallRow.tsx:341` 가 `loading` 을 넘기지 않는다(기본 false) | 호출처 전수 grep |
| C3 | `calls/loading.tsx`·`calls-v3/loading.tsx`·`calls/[sessionId]/loading.tsx` = `return null` | 서버 응답 전 그 구간이 빈다 | 미리받기한 통화 주소로 이동할 때만(P1 감사 §2-2 원리) · 실측 NOT_PROVEN | 파일 주석: 「상위 메신저 스켈레톤과 겹치지 않게」·「보라색 플레이스홀더가 겹쳐 보이지 않게」 |
| C4 | `calls-v4` 는 상위 `community-messenger/loading.tsx` → `MainSegmentPendingLoading` 이 통화 경로에서 `null`(P1) | 서버 응답 전 빈 구간 | 미리받기한 경우만 · 실측 NOT_PROVEN | P1 `MainSegmentPendingLoading.tsx` |
| C5 | `calls-v4/[callId]/page.tsx` 의 **의도된 null** | ① `source` 가 발신 표시(`isCallV4OutgoingPresentationSource`)면 Suspense fallback 이 null ② Android 앱(`isLegacyWebCallEstablishmentRemoved` = 네이티브 Android)이고 발신 표시가 아니면 화면 null | 사용 | ①은 발신 연출, ②는 네이티브 통화 화면이 화면을 맡는다(웹은 비켜 있음) |
| C6 | `calls/[sessionId]/page.tsx` 의 null | `dynamic(… loading: () => null)`(:19) · `CallV3ScreenLazy` 청크 대기 null(:40) · `hostOwnsSession` null(:85) | V4 플래그가 켜져 있으면 :80 에서 먼저 return → 앞의 둘은 운영에서 안 보인다. `hostOwnsSession` 은 통화 호스트가 이미 그리고 있어 이중 화면을 막는 의도된 null | 코드 |
| C7 | `calls-v3/[callId]/page.tsx:32` 청크 대기 null | — | 미사용(V3 꺼짐) | §1-1 |
| C8 | 웹 안내 띠(P2): 통화 화면에서는 예전 그대로(기기 `offline` 일 때 예전 문구만) | — | 사용 | P2 `WebConnectivityBanner.tsx` |
| C9 | 네이티브: 통화로 시작할 때는 시작 덮개가 없다(W6) · 통화 경로의 시작 오류 안내는 예전 그대로(P3) | — | 사용 | `MainActivity.isSplashCoverLaunch`·P3 통화 분기 |

- 통화 골격 로딩 `CommunityMessengerCallRouteLoading.tsx` 는 실제 통화 화면과 같은 모양의 스켈레톤이다(주석 「별도 스피너 화면으로 바뀌지 않아 체감 단절·이중 전환을 줄인다」). 상위 설계의 규칙 「모양을 아는 곳 = 스켈레톤 유지」에 해당 → **대상 아님**.
- 통화 화면 안(`call-v4`·`call-ui`·`call-v3`·`messenger/call`·`CommunityMessengerCallClient`)에는 회전 스피너와 글자만 있는 대기가 0건이다. `ConnectedVideoView.tsx` 의 `animate-pulse` 2곳은 상태 점(로딩 표시 아님)이다.

---

## 2. 통화 규정 2번 — 「왜」 (증거)

- 통화 화면에서 **결함으로 보고되거나 측정된 빈 화면은 없다.** 실기기 로그·운영 DB 의 통화 사건 근거도 없다.
- 그래서 P4 는 결함 수정이 아니라 **모양 통일**(스피너 단일 정의)이다.
- 규정 2번 「증거 없이 개선 목적으로 통화 경로를 바꾸지 않는다」에 따라, **운영에서 실제로 보이는 통화 동작·화면은 바꾸지 않는 안을 권고한다(§3).**

---

## 3. 권고안 (작업자 추천)

| 항목 | 권고 | 이유 |
|---|---|---|
| C1 레거시 발신 화면 스피너 | `DibaySpinner lg inverse` 로 교체(모양만, 크기 40→44px, 흰색 유지 · 문구·흐름 그대로) | 운영에서 거의 안 보이는 경로라 위험이 낮다. 스피너 단일 정의 기준선에서 빠진다 |
| C2 다시 걸기 버튼 스피너 | `DibaySpinner md current` 로 교체(모양만) | 운영에서 그려지지 않는 분기다. 단일 정의 기준선에서 빠진다 |
| C3·C4 통화 구간 null loading | **그대로** | 증거 없음(§2). 바꾸면 C5 의 의도된 null(네이티브 화면이 맡음) 위에 웹 대기 표시가 겹칠 수 있다 |
| C5·C6·C7 의도된 null | **그대로** | 네이티브 통화 화면·통화 호스트·발신 연출이 화면을 맡는다. 바꾸면 이중 화면 위험(Agora 이중 조인 주석 :48) |
| C8 웹 안내 띠 | **그대로** | 통화 화면은 자체 통화 품질 표시를 갖는다(`cm_ui_network_quality_*`) |
| C9 네이티브 | **그대로** | P3 에서 이미 통화 경로를 그대로 두었다 |

- **결과**: 구현하면 바뀌는 파일은 웹 2개 + 검사 기준선 1개다.
  - `CommunityMessengerOutgoingDialPageClient.tsx`
  - `CommunityMessengerCallActionButton.tsx`
  - `scripts/verify-loading-spinner-ssot.cjs` 의 통화 기준선 3줄 삭제
- 운영에서 보이는 통화 흐름은 바뀌지 않는다.

---

## 4. 영향 경로 (통화 규정 3번 목록)

권고안(C1·C2 모양 교체만) 기준이다.

| 경로 | 영향 | 근거 |
|---|---|---|
| 발신 시작 | 없음 — `launchOutgoingDirectCall` 무변경. C1 은 화면 그림만 바꾼다 | §1-1 |
| 세션 생성 | 없음 — API·서비스 무변경 | 변경 파일에 서버 코드 0 |
| VoIP/FCM 발송 | 없음 | 서버·`lib/push/**` 무변경 |
| iOS CallKit / Android 수신 화면 | 없음 | 네이티브 무변경 |
| 취소·거절·종료·부재중 | 없음 — C1 의 오류·뒤로 버튼 동작 무변경 | 코드 |
| 상태 폴링 | 없음 | 무변경 |
| CallKit 종료 신호 | 없음 | 무변경 |
| 통화 기록 | 없음 — C2 는 운영에서 그려지지 않는 분기 · 누름 동작(`onPress`)·비활성·흐림 무변경 | `CommunityMessengerCallRow.tsx:341` |
| 팝업(발신 확인 등) | 없음 | 무변경 |
| 통화 화면 밖 표면·CTA(HARD LOCK) | 없음 — 대상 표면 6개에 들지 않는다 | `dibay-call-minimized-surface-cta-ssot.md` §0 |

## 5. 설치된 구 바이너리 호환

- **조회**: 운영 `user_devices` 의 활성·최근 14일 기기(2026-11-22 18:05 PHT, 읽기 전용).
  - Android: 1.2.7 (80) 24 · (54) 4 · (81) 1 · 1.2.6 (39) 1
  - iOS: 1.2.6 (58) 11 · 1.2.4 (53) 5 · 1.2.5 (56) 4 · 1.2.2 (35) 4 · (34) 3 · 1.2 (22) 2 · 1.2.1 (31) 1 · 1.2.6 (59) 1 · 1.2 (27) 1
- 권고안은 **웹만** 바꾸므로 모든 설치 버전에 같이 적용된다. 네이티브 계약(브리지·CallKit·FCM 페이로드)은 바뀌지 않아 구 바이너리 호환 위험이 없다.

## 6. Owner 결정 필요 (규정상 Owner 만 할 수 있는 것)

1. **통화 표시 HARD LOCK 재개방**
   - C1(레거시 발신 화면)은 통화 화면 모양이라 `dibay-call-presentation-cross-platform-hard-lock.md` 「Owner explicit reopen」 대상이다.
   - C2(통화 탭 목록 버튼)는 통화 화면이 아니라 메신저 통화 탭이지만, 통화 규정 1번(웹 통화 코드)에 들어 함께 묻는다.
   - **작업자 추천: C1·C2 모양 교체만 승인 · C3~C9 는 그대로.**
2. 승인하지 않으면 C1·C2 는 지금처럼 검사 기준선(통화 2·관리자 1)으로 남는다. 스피너 단일 정의 검사는 그 숫자보다 늘어나는 것만 막는다.

## 7. 회귀 위험 · 롤백

- **위험**
  - C1: 스피너 크기가 40→44px 로 바뀐다(가운데 정렬 상자라 배치 영향은 작다). 동작 위험 0.
  - C2: 그려지지 않는 분기라 위험 0.
- **롤백**: PR 1개를 되돌린다(revert). 웹만 바뀌므로 Vercel Instant Rollback 으로도 복구된다.

## 8. 검증 (승인 시)

- **코드**
  - `typecheck:build`
  - 관련 vitest
  - `verify:loading-spinner-ssot`(통화 기준선 0 확인)
  - `verify:call-surface-cta-ssot`
  - `verify:call-authority-contract`
  - vitest 두 묶음을 끝까지 돌린다.
- **실기 — 통화 규정 5번 최소 행렬**: 웹만 바뀌어도 규정상 생략하지 않는다.
  - Android↔iPhone 음성·영상 발신·수신
  - 거절, 벨 중 취소, 취소 후 지연 푸시(재울림 없음)
  - 통화 중(busy), 무응답 타임아웃, 정상 종료 후 즉시 재발신
  - 테스트마다 Production SHA 와 발신·세션 생성·발송·수신 화면·연결·종료 시각(PHT)을 기록하고 운영 DB 와 대조한다.
- **C1 화면**: V4 플래그가 켜진 운영에서는 레거시 발신 화면이 보이지 않는다. 임시 세션 주소로 직접 열 때만 확인할 수 있다(실기 1회 · 앱 실행 상한 안).
- **C2 화면**: 운영에서 그려지지 않으므로 단위 테스트(렌더 결과)로만 확인한다 → 실기 NOT_PROVEN 1회 표기.
- **기기**: iPhone 실기기가 지금 연결되어 있지 않다. 행렬 시험 전에 연결이 필요하다.

## 9. 확인 못 한 것 (NOT_PROVEN)

- C3·C4 통화 구간에서 빈 프레임이 실제로 보이는지 — 측정하지 않았다.
- 운영 `NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE` 의 실제 값 — 민감 정보라 읽지 않았다. 존재·대상과 코드 주석(운영 경로)으로만 판단했다.
- 운영 `user_devices` 의 iOS 1.2.6 (59) 1대(최근 17:51 PHT) — 이 세션의 시뮬레이터 실행(17:30~17:33 PHT)과 시각이 맞지 않아 출처를 확인하지 못했다.

## 변경 이력

- 2026-11-22 작성.
- 2026-11-22 Owner 「C1·C2만 승인」 — 통화 표시 HARD LOCK 의 명시 재개방 범위 = **C1(레거시 발신 화면 스피너)·C2(다시 걸기 버튼 스피너) 모양 교체만**. C3~C9 는 그대로(재개방 아님). 구현 = 통화 단독 PR.

# 하단 탭 전체 재감사 · 네이버형 SSOT 설계안 (v2) — 2026-11-15

- 작성: Claude · 11:20~12:15 PHT
- 기준 코드: `origin/main` 3b54c1cc4 (하단 탭 관련 파일은 857e167c4 와 같다 — `git diff --stat` 0)
- 상태: **완료(2026-11-15 14:40 PHT).** S1~S3 #310 · S5 #312 · 사장님 뼈대 #314 · 첫 로딩 뼈대 #316 · 최종 점검(이 PR) 운영 반영·실기 PASS. S4 #313(네이티브) 실기만 다음 일괄 빌드 뒤. 최종 상태는 §11.
  구현 기록은 §9.
- 증거: 캡처·녹화 프레임 23개는 Owner 대화 목록·프로필이 보여 저장소에 올리지 않고 작업 PC `docs/design/bottom-nav-naver-2026-11-15/` 에만 둔다.
- v1(같은 날 11:45)을 이 문서로 대체한다. v1 은 코드 판정이 대부분이었고, 반복 회귀의 원인과 기존 계약 파일을 빠뜨렸다.

---

## 0. 작업자 잘못 먼저 (Owner 규정 6)

| # | 무엇을 | 시각(PHT) | 영향 · 조치 |
|---|---|---|---|
| E1 | 통화 시험 세션이 쓰던 **Samsung 에서 DIBAY 앱을 1회 실행**(monkey)했다. 사용 여부를 물은 직후, 답을 받기 전이었다. | 11:50 | 직전 앞 화면은 「USB 설정」. 탭·녹화·logcat 조작은 없었다. 그 세션에 즉시 알렸고 이후 Samsung 은 쓰지 않았다. 그 세션이 「시험에 영향 없었다」고 회신했다(12:15 PHT). |
| E2 | iPhone 미러링에서 DIBAY 를 다시 열자 **「메인관리자」 1:1 채팅방이 열렸다.** | 11:58 | 방이 읽음 처리됐을 수 있다. 내가 누른 것은 홈 화면의 DIBAY 아이콘 1번이다. 그 방은 대화 목록 첫 화면에 없어서, 내 탭이 목록 행에 떨어진 것인지 앱이 복귀하며 방을 연 것인지는 **확인 못 함**(§7 범위 밖 관찰). 그 뒤 방 열기 시험은 중단했다(읽음 부작용). |
| E3 | 하단 탭 아래 띠를 시험으로 눌렀더니 iOS 가 **홈 화면으로 나갔다**(시스템 홈 제스처 영역). | 11:58 | 앱 상태 변화 없음. 이 띠는 iOS 시스템 영역이라 결함 판정에서 뺐다(§3 B6). |

---

## 1. Owner 의도 (지시 원문 → 판정 기준)

| # | Owner 지시 | 이 문서의 판정 기준 |
|---|---|---|
| I1 | 반응 속도 | 손을 뗀 다음 **첫 프레임**에 선택 표시와 새 화면(보관 화면 또는 뼈대)이 함께 보인다 |
| I2 | 누르면 즉시 페이지 이동 | 서버 응답을 기다리며 이전 화면을 남기지 않는다. 처음 연 탭, 다시 연 탭, 오래 쉰 뒤에도 같다 |
| I3 | 기기 멈춤 뒤에도 잘 눌림 | 복귀 직후 첫 탭이 받아들여지고, 끝없이 기다리지 않는다 |
| I4 | 애니메이션 통일 = 네이버형 | 어디서 누르든 같은 전환이다. 네이버 실측 = 움직이는 전환 없이 즉시 교체 |
| I5 | 너무 빨라도 안 됨 | 손을 대는 순간이 아니라 **손을 뗄 때** 확정한다. 스크롤하려고 바에 닿은 손가락은 선택하지 않는다 |
| I6 | 햅틱 | 선택이 확정될 때 1회. iPhone·Android 둘 다 |
| I7 | 땜빵 금지 · SSOT | 원인별로 고치고, 결정권자를 하나로 모은다. 꺼 둔 옛 장치는 지운다. 계약·문서·테스트를 한 벌로 맞춘다 |
| I8 | 선택 모양 (Owner 결정 11-15) | **채움(선택) ↔ 외곽선(비선택)** |

---

## 2. 실측 결과

### 2-1. 측정 방법과 한계

- 장치: Owner iPhone, Mac「iPhone 미러링」. DIBAY 는 Owner 계정으로 로그인된 상태(MY 탭에 프로필 사진). 네이버도 로그인 상태다. 운영 DB 기준 최근 iOS 설치 버전은 `1.2.2 (35)`·`(36)`인데, 어느 행이 이 iPhone 인지는 확인 못 함. 하단 탭은 웹 코드라 바이너리 버전과 무관하다.
- 방법: 탭을 누른 직후 미러링 창을 연속으로 캡처했다. 캡처 간격은 수백 ms 단위로 추정하며, ms 값은 측정하지 못했다(셸 화면 녹화 권한 없음). 그래서 **두 앱 모두 같은 방법으로 찍어 「누른 뒤 몇 번째 캡처에서 바뀌는가」를 비교**했다. 100ms 이하 효과는 볼 수 없다.
- Samsung: 처음에는 다른 세션이 통화 시험에 쓰고 있었다. 12:06 PHT 에 비었다는 연락을 받고 측정했다(§2-4).

### 2-2. 네이버 (iPhone · 11:39~11:41)

| # | 항목 | 결과 | 판정 · 증거 |
|---|---|---|---|
| N1 | 누른 뒤 1번째 캡처 | **선택 표시와 새 화면이 이미 바뀌어 있음**(5회 중 5회) | PASS · 02, 04, 05 |
| N2 | 전환 연출 | 슬라이드·페이드 없음, 즉시 교체 | PASS · 02 |
| N3 | 데이터 대기 중 | 그 탭 모양의 **회색 뼈대** → 내용이 차오름. 흰 빈 화면이나 이전 화면은 보이지 않음 | PASS · 02, 04 |
| N4 | 다시 들어간 탭 | 매번 뼈대부터 다시 그리고 맨 위부터 보임 | PASS · 04, 05 |
| N5 | 선택 모양 | 선택 = 채움 아이콘(검정), 비선택 = 외곽선 아이콘 | PASS · 03 |
| N6 | 같은 탭 다시 누름 | 위쪽으로 돌아감. 새로고침 여부는 구분 못 함 | 일부만 확인 |
| N7 | 아이콘 크기·바운스 효과 | 캡처에 없음 | NOT_PROVEN(100ms 이하 측정 불가) |
| N8 | 햅틱 | 미러링은 진동을 전달하지 않음 | **NOT_PROVEN — Owner 손 확인 1회 필요** |
| N9 | 소리 | 확인 못 함 | NOT_PROVEN |

### 2-3. DIBAY (같은 iPhone · 11:49~11:58)

| # | 경우 | 누른 뒤 캡처 1·2·3 | 판정 · 증거 |
|---|---|---|---|
| D1 | DIPICK → LOUNGE(처음 연 탭) | 이전 화면 · 이전 화면 · 새 화면 | **FAIL** (네이버 N1 과 다름) · 10, 11, 12 |
| D2 | LOUNGE → HOME(이미 연 탭) | 새 화면 | PASS · 17 |
| D3 | HOME → letaRING | 새 화면 | PASS |
| D4 | letaRING → MY(처음 연 탭) | 이전 화면 · 새 화면 | **FAIL** · 13, 14 |
| D5 | MY → LOUNGE(다시 연 탭) | 새 화면 | PASS |
| D6 | LOUNGE 글 상세 → MY | **오른쪽에서 밀려 들어오는 슬라이드. 왼쪽 1/3 은 흰 빈칸**(이전 화면 없음) | **FAIL** (연출이 D2·D3 와 다르고, 흰 빈칸) · 15 |
| D7 | 7분 백그라운드 뒤 복귀 → MY 에서 LOUNGE | 이전 화면(하단 바는 이미 LOUNGE 선택) · 새 화면 | **FAIL** (같은 탭인데 D5 보다 늦음 — 캐시 만료) · 20, 21, 22 |
| D8 | 선택 모양 | 같은 채움 아이콘에 색만 그린 | I8 과 다름 · 16 |
| D9 | 복귀 뒤 탭 무반응 | 1회 시도(7분 · Wi-Fi)에서는 재현 안 됨 | **NOT_PROVEN** (재현 조건 미확보 — §5-0) |
| D10 | 채팅방 직후 2.5초 탭 거부(B3) | Owner 실제 방은 읽음 부작용 때문에 iPhone 시험 중단 | iPhone NOT_PROVEN → **Samsung 테스트 계정으로 재현(§2-4 A8)** |
| D11 | 햅틱 | 미러링으로 측정 불가 | NOT_PROVEN (코드상 iPhone 진동 없음 — B8) |

### 2-4. DIBAY Samsung (SM-M156S · Android 16 · 앱 1.2.6 (52) · 테스트 계정 q테스트1 · 12:07~12:09)

방법: 기기 안에서 `screenrecord` 로 녹화하면서 `input tap` 을 넣고, 각 프레임에서 하단 바와 본문이 바뀐 시각을 계산했다. 프레임 간격은 16~30ms 이다. 통화 세션이 기기를 비운 뒤 측정했다.

| # | 경우 | 선택 표시 바뀜 → 본문 바뀜 | 판정 · 증거 |
|---|---|---|---|
| A1 | telRING → LOUNGE(이 세션에서 처음) | **641ms 동안 본문은 이전 화면** | **FAIL** · 30, 31 |
| A2 | LOUNGE → MY | 185ms | FAIL(지연) |
| A3 | MY → HOME | 144ms | FAIL(지연) |
| A4 | HOME → LOUNGE(다시) | 312ms | FAIL(지연) |
| A5 | LOUNGE → DIPICK | 188~254ms 뒤 바뀌고, 이어서 내용이 0.5초간 차오름 | FAIL(지연) |
| A6 | DIPICK → MY(다시) | 133ms | FAIL(지연) |
| A7 | MY → telRING | 411ms | FAIL(지연) |
| A8 | 채팅방 진입 0.7초 뒤 뒤로 → 곧바로 MY | **탭이 조용히 거부됨.** 화면 그대로, 로그 `[cm-room-route-guard] blocked_navigation`(12:08:55.809). 1.6초 뒤 다시 누르자 이동 | **FAIL — B3 기기 재현** · 32 |
| A9 | 위 A8 두 번째 탭(telRING 목록 → MY) | **약 130ms 겹쳐 사라지는(cross-fade) 전환**. A1~A7 은 한 프레임에 바뀜 | **FAIL — 연출 불일치(B7)** · 33 |
| A10 | 햅틱 | 탭 7번에 진동 7번(16~21ms, usage TOUCH, 세기 LOW) 기록. **거부된 A8 첫 탭에는 진동 기록 없음** | Android 진동 있음 · iPhone 과 다름(B8) · 35 |

- 네이버 기준(첫 프레임에 새 화면)으로 보면 A1~A7 은 모두 FAIL 이다. 130~640ms 동안 「선택은 바뀌었는데 화면은 그대로」인 구간이 있다. 이 구간이 Owner 가 말한 「즉시 이동 안 됨」의 실체다.
- Samsung 에서 네이버 비교는 하지 못했다(네이버 앱 미설치 — 설치에는 Owner 계정이 필요).

**요약:** 같은 기기, 같은 계정에서도 **탭에 따라 즉시이기도 하고 늦기도 하다**(D2·D3·D5 즉시, D1·D4·D7 지연). 하위 화면에서 누르면 연출까지 달라진다(D6). Owner 가 말한 「즉시 이동이 안 됨」「애니메이션 통일 안 됨」을 기기에서 재현했다.

---

## 3. 결함 원인 (코드 · 이력 · 실기 대조)

| ID | 결함 | 실기 | 원인 (근거) |
|---|---|---|---|
| **B1** | 처음 연 탭·오래 쉰 뒤 탭은 이전 화면이 남음 | D1·D4·D7 FAIL | 화면이 바뀌는 시점이 **Next 가 새 경로를 확정할 때**뿐이다. 이미 보관 중인 허브 화면(`HubRetentionStack`, React Activity)도 `usePathname` 이 바뀌어야 보인다(`HubRetentionStack.tsx:73,97`). 경로 확정은 RSC 가 라우터 캐시에 있으면 즉시이고(D2·D3·D5), 없으면 서버 왕복을 기다린다(D1·D4). 캐시 수명은 300초(`router-cache-policy.ts:9`)라 복귀 후 재준비 작업이 끝나기 전에 누르면 늦다(D7, `bottom-nav-resume-rewarm.ts`). 기다리는 동안 이전 화면을 두는 것은 D-1 규칙이다(`AppRouteTransition.tsx:297-301`). 탭 `loading.tsx` 4개는 모두 `null` 이다. |
| **B2** | 서버 응답이 멈추면 끝없이 대기 | NOT_PROVEN | Next 16.1.7 이동 요청에 시간 제한·중단 신호가 없다(`fetch-server-response.js:96`). 기다리는 동안은 0.3초 뒤 진행 막대만 보인다(`BottomNav.tsx:883-891`). |
| **B3** | 채팅방 진입 뒤 2.5초 동안 사용자가 누른 탭을 거부 | **기기 FAIL(Samsung A8)** | 잠금 중에는 하단 탭 출처가 `bottom_nav_async` 로 바뀐다(`main-bottom-nav-route-commit.ts:198`). 그래서 「사용자 탭이면 잠금 해제」 분기(`cm-deep-route-navigation-lock.ts:99-102`)를 타지 못한다. 거부돼도 결과는 `"navigated"` 로 돌아간다(`:173` · 테스트 `route-commit-blocked.test.ts:37` 이 이 동작을 잠금). 코드상 햅틱은 pointerdown 에서 먼저 울리게 되어 있다. 하지만 Samsung A8 에서는 거부된 탭의 진동 기록이 없었다 → 「진동은 왔는데 안 넘어감」은 기기에서 확인되지 않았다. `cm-hub-navigation-contract.mdc:32`(「하단 탭을 async 로 미루기 금지」)와 반대다. |
| **B4** | 복귀 때 하단 탭 상태 초기화 없음 | NOT_PROVEN | 복귀 조정자(`lib/app-resume/app-resume-coordinator.ts`)에는 `auth`·`background` 두 레인만 있다. 하단 탭 쪽 등록은 미리받기 재준비뿐이다. 선택 대기(`pendingActiveTabId`), `pendingMenuIntent`, 키보드 숨김(+`inert`), 스크롤 숨김은 복귀 때 다시 맞추지 않는다(`use-bottom-nav-scroll-hide-behavior.ts:134-146` 은 다시 보이는 타이머 없이 숨김으로 둠). |
| **B5** | 기다림 상태 3개가 서로 다른 기준으로 풀림 | 코드 | `pendingActiveTabId` 는 경로(`BottomNav.tsx:822-829`), `pendingMenuIntent` 는 경로+쿼리(`LatestMenuNavigationContext.tsx:284-312`), 허브 전환 세션은 세대 번호로 풀린다. 이동이 막히면 하단 탭 쪽만 풀린다. |
| **B6** | 탭 위 여백을 누르면 반응 없음 | 코드 FAIL · 기기 NOT_PROVEN | 링크 높이는 48px 인데 바는 60px 이다(위 6·아래 5px). 셸은 `pointer-events:none` 이다(`app-bottom-nav.css:36,146-157`). 홈 인디케이터 띠는 iOS 시스템 제스처 영역이라 대상이 아니다(E3). |
| **B7** | 하위 화면에서 누르면 슬라이드, 허브에서 누르면 즉시, 채팅 목록에서 누르면 cross-fade | D6·A9 FAIL | 허브 전환 세션은 「출발지도 허브」일 때만 시작된다(`main-hub-transition-authority.ts:75-93`). 나머지는 폴백 슬라이드로 간다: 440ms, 배달만 120ms, 방향은 kind 별(`AppRouteTransition.tsx:705-771`). 폴백 분기는 밑그림을 깔지 않아 흰 빈칸이 생긴다(`:717-776` vs `:817`). |
| **B8** | iPhone 햅틱 없음 · 플랫폼마다 다름 | Android 진동 있음(A10) · iPhone NOT_PROVEN | 웹 진동 `navigator.vibrate(10)` + 웹 오디오 「딸깍」(920Hz·55ms, `light-tap-feedback.ts`)을 쓴다. iOS(WKWebView)는 Vibration API 를 지원하지 않는다(W3C 구현 보고서·caniuse — 실기 미확인). 네이티브 햅틱 플러그인은 없다(package.json). |
| **B9** | 손을 대는 순간 피드백(너무 빠름) | 코드 FAIL | `onPointerDown` 에서 울린다(`BottomNav.tsx:409·507·676`). 스크롤하려고 바에 닿아도 울리고, 이동이 거부돼도 울린다. |
| **B10** | 선택 모양 | D8 | 텔레그램형(11-13): 같은 채움 아이콘에 색만 바뀐다 → I8 과 다름 |
| **B11** | 채팅 탭: 프로필 캐시가 없으면 선택 표시조차 늦음 | 코드 | `await requireAuthAction` 이 이동 앞에 있다(`BottomNav.tsx:862-877`). 세션 확인은 최대 12초이고, recovering 상태면 아무 표시 없이 무시된다(`require-auth-action.ts:163-173`). |

---

## 4. 왜 고쳐도 다시 터지는가 (git 이력 · 09-15 이후 하단 탭 관련 커밋 전수)

| 반복 패턴 | 증거 (커밋) |
|---|---|
| **선택 모양이 13일 동안 5번째 바뀜** — 앞 CSS 블록을 지우지 않고 뒤에 덮어씀 | 28d47d618(그린) → cb0e6f001(브라운) → 68e4d0547(네이버 검은 사각형) → debe3df8a(텔레그램 그린) → 6e3f1aee6(MY 되돌림 + CSS 274줄 재작성) → (11-15 채움↔외곽선) |
| **전환 장치가 층층이 쌓임** — 장치는 그대로 두고 시작 시점·결과만 바꿈 | 08-16 하루에 true push → 되돌림 → COVER → 수정 4번 → 「누름 먼저 + 440ms」 · 11-10 D-1(시작을 경로 확정으로 옮김) → 같은 날 A 단계(허브↔허브 연출 없음) → 51분 뒤 판정 방식 교체 |
| **같은 증상을 다른 장치로 여러 번 고침** — 한 수정이 다음 증상을 만듦 | D-1 의 지연 → 「무반응」 → c399c7b23 1.5초 타이머 제거 + 진행 막대 |
| **20~50분 만에 되돌린 시도** | a40413237 → 24deb0549(20분, 범위 밖 연출 회귀) · 6d2f35a84 → 55aeece1f(약 50분, 사유 기록 없음) |
| **금지했던 개념을 다른 이름으로 다시 도입** | 07-26 「KeepAlive 금지」(`trade-primary-tab-transition-contract.mdc:22,29`) ↔ 11-11 `HubRetentionStack`. 검사(`verify-no-main-tab-dual-feed.cjs:28,37`)는 이름만 봐서 통과 |

**근본 원인 4가지**

1. **결정권자가 여럿이다.** 「어느 탭이 선택돼 보이나」를 7곳, 「화면이 언제 바뀌나」를 6곳, 「누름을 받아들이나」를 8곳이 정한다(§4-1). 한 곳을 고치면 다른 곳과 어긋난다.
2. **끄기만 하고 지우지 않는다.** `isCrossMainShellRouteGroup`(항상 false), `BOTTOM_NAV_ORBIT_EMPHASIS_ENABLED=false`, `abortPendingMainBottomNavRouteCommits`(no-op), `mainBottomNavRouteUsesReplace`(항상 true), `MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES`(빈 Set), 값이 안 들어가는 `pendingActiveResetTimerRef` 가 남아 있다. 계약 주석은 옛 설계를 말한다 → 다음 작업자가 틀린 그림을 보고 고친다.
3. **계약 문서끼리 충돌한다.**
   - `lib/main-menu/main-bottom-nav-interaction-contract.ts`(08-16)는 「440ms 밀기 · 원형 강조 · 숨은 허브 미리받기」라고 하는데, 셋 다 지금 코드와 다르다.
   - `MainShellTabContentTransition.tsx:27-31`은 「440ms · KeepAlive 금지」라고 한다.
   - `app-tab-navigation-root-cause-design-2026-11-10.md`는 「허브↔허브 즉시」다.
   - `dibay-app-home-ssot.md`는 네이버형, `service-brand-icon-state-ssot-design-2026-11-13.md`는 텔레그램형이다.
4. **시험이 문자열만 본다.** 대부분 `toContain`(코드·주석 글자)이라, 틀린 동작을 오히려 잠근다. 예: `cm-deep-route-navigation-lock.test.ts:17-23`(async 출처면 거부), `route-commit-blocked.test.ts:37`(거부돼도 navigated), `main-hub-switch-no-slide-contract.test.ts:21`(호출 정확히 3개), `d1-s1-live-surface.test.ts:49-53`(440ms). 기기에서 동작을 확인하는 시험은 없다.

### 4-1. 지금의 결정권자 (모두 하나로 모을 대상)

- **선택 표시:** ① `pendingActiveTabId` ② `isMainBottomNavDisplayTabActive` + sessionStorage secondaryRail ③ `isBottomNavTabActive`(다시 누름 판정) ④ `resolveMainBottomNavTabEmphasisKind` ⑤ CSS `[data-active]` 두 범위 ⑥ `syncMypageBottomNavContextFromPath` ⑦ 숨긴 허브의 고정 주소
- **화면 교체:** ① Next children + `HubRetentionStack` ② `pendingMenuIntent` ③ 허브 전환 세션 상태 기계 ④ `AppRouteTransition` 갈래들(폴백 440·traverse 1500·S1 밑그림·통화·배달 120/140·내정보 300) ⑤ `setMainShellPushAxisIntent` ⑥ hydration 전 가림
- **누름 수용:** ① hydration 전 CSS ② 스크롤 숨김 ③ 키보드 숨김 inert ④ `guardBeforeNavigate`(2번 호출) ⑤ 채팅 `requireAuthAction` ⑥ 「스크롤만」 판정(2번) ⑦ 방·통화 잠금 + async 출처 ⑧ `openInNewTab`. 햅틱은 이 판정들보다 먼저 울린다.

---

## 5. 설계 — 「하단 탭 컨트롤러」 하나

### 5-0. 원칙

1. **결정권자 1개.** 기존 계약 파일 `lib/main-menu/main-bottom-nav-interaction-contract.ts` 를 새 계약으로 **다시 쓴다**(새 파일을 따로 만들지 않는다). 상태는 클라이언트 저장소 `bottom-nav-controller` 하나가 가진다: `{ selectedTabId, targetHref, phase: idle | showing | settled | failed, startedAt }`.
   - 하단 탭 버튼 `[data-active]`, 화면 영역(보관 화면 또는 뼈대), 진행·실패 처리, 햅틱이 모두 이 상태를 **읽기만** 한다.
   - 빠지는 것: `pendingActiveTabId`, `pendingMenuIntent`(하단 탭 출처), 허브 전환 세션의 하단 탭 갈래.
2. **화면 교체는 서버를 기다리지 않는다.** 누르면 컨트롤러가 `showing` 이 되고, 같은 프레임에 그 탭의 **보관 화면**을 보이거나(있으면) **뼈대**를 그린다. Next 경로 확정은 뒤에서 따라온다(`settled`). 네이버 N1·N3 와 같은 구조다.
3. **꺼 둔 장치는 지운다.** §4 근본 원인 2의 죽은 코드, 하단 탭 출처의 폴백 슬라이드 갈래, 진행 막대, 원형 강조 CSS·분기를 지운다. 이들을 잠그던 문자열 테스트도 지운다.
4. **시험은 동작으로.** 상태 전이 단위 시험 + 브라우저 프레임 시험 + 기기 행렬(§6). 문자열 `toContain` 시험은 새로 만들지 않는다.
5. **통화·방 진입·화면 안 뒤로 버튼 전환은 바꾸지 않는다.** 하단 탭 출처만 분리한다(통화 규정 · `call-code-hands-off`).

### 5-1. 입력 · 반응 시점 (I1·I5 · B6·B9)

| 규칙 | 값 |
|---|---|
| 확정 시점 | **click(손 뗌)**. pointerdown 에서는 확정하지 않는다. 브라우저가 스크롤로 판단한 터치는 click 이 오지 않으므로 선택되지 않는다. |
| 손을 대는 동안 | 눌림 표시(투명도)만. 햅틱·소리·미리받기 커밋 없음. 미리받기 데이터 준비(`warmBottomNavTabIntent`)는 pointerdown 에 남긴다 — 화면을 바꾸지 않는 준비라 「너무 빠름」과 무관하다. |
| 연타 | 마지막 탭이 이긴다(다른 탭은 즉시 그 탭으로). 같은 탭 = 맨 위로. 일부러 늦추지 않는다. |
| 누르는 영역 | 링크 = 바 높이 60px 전체(`height:100%`, 컨테이너 위아래 여백을 링크 안으로). safe-area 띠는 iOS 시스템 영역이라 그대로 둔다. |
| 같은 탭 다시 누름 | 맨 위로(현재 규칙 유지). 햅틱 1회. |

### 5-2. 화면 교체 (I2·I4 · B1·B7)

| 경우 | 동작 |
|---|---|
| 보관 중인 허브(HOME·LOUNGE·DIPICK·MY) | 누른 프레임에 `HubRetentionStack` 이 **컨트롤러의 `targetHub`** 를 보이게 한다(지금은 `usePathname` 기준). 경로가 확정되면 같은 칸이 그대로 이어진다. |
| 처음 여는 허브 · 보관하지 않는 허브(채팅) | 누른 프레임에 **그 허브 뼈대**를 그린다. 뼈대는 각 허브 첫 화면 레이아웃(머리글·탭줄·카드 목록)과 같은 크기다. Next 경로가 확정되면 실제 화면으로 바뀐다. |
| 출발 위치 | 허브든 하위 화면(글 상세 등)이든 같다. 하단 탭 출처는 `AppRouteTransition` 의 폴백 슬라이드·kind 방향·배달 120ms 를 타지 않는다 → **0ms 즉시 교체 하나**. |
| 데이터 | 다른 탭으로 가면 그 탭의 마지막 스크롤 위치(현재 P2 규칙), 같은 탭 = 맨 위. |
| 흰 빈칸 | 뼈대 또는 보관 화면이 항상 있으므로 생기지 않는다(D-1 이 막으려던 흰 화면 문제를 다른 방식으로 해결). |
| `loading.tsx` | 바꾸지 않는다(`null` 유지 — 하위 화면 로딩에 허브 뼈대가 섞이지 않게 한 11-02 설계 §13 유지). 뼈대는 컨트롤러가 하단 탭 이동 때만 그린다. |

**D-1 계약 변경 (Owner 승인 필요):** 「이동 중 이전 화면 유지」(11-10) → 「누르는 즉시 보관 화면 또는 뼈대」.

### 5-3. 선택 표시 (I8 · B10 — Owner 결정 반영)

- 선택 = 채움, 비선택 = 외곽선. 외곽선은 지금 채움 아이콘과 같은 Phosphor 계열의 Regular 짝이다(react-icons 5.6.0 `pi`, MIT, 설치됨): `PiHouse`·`PiUsersThree`·`PiShoppingBag`·`PiMoped`·`PiChatsCircle`·`PiStorefront`.
- 그리는 곳은 `lib/brand/dibay-service-brand.ts` 하나에 outline 경로를 추가하고, `ServiceBrandIcon` 에 `variant` 를 받게 한다. 다른 화면은 기본값 채움이라 그대로다.
- 색: 선택 DIBAY 그린 / 비선택 `--sam-icon-soft`(11-13 승인값 유지 — 이번 결정은 모양만). MY = 프로필 사진 + 선택 링 그대로. 관리자 lucide 탭은 선 굵기 2 → 2.4.
- 바뀌는 순간 애니메이션 없음(N7 NOT_PROVEN 이라 새 효과를 넣지 않는다). 아이콘 재마운트 `key={isActive?"on":"off"}` 는 삭제한다.
- **CSS 정리:** `app-bottom-nav.css` 메인 하단 탭 규칙을 한 블록으로 다시 쓴다. 앞쪽에서 덮어쓰이던 블록(원형·11-03·11-09·11-13 덮개 규칙)은 지운다. 매장 사장님 바(`:not([data-app-bottom-nav])`) 블록은 모양을 바꾸지 않는다.

### 5-4. 햅틱 (I6 · B8·B9)

| 항목 | 설계 |
|---|---|
| 호출 지점 | 컨트롤러가 `showing` 으로 들어가는 순간 1번(= 확정 click). 같은 탭 맨 위로도 1번. 이동이 거부되면 없음. 컴포넌트는 햅틱을 직접 호출하지 않는다. |
| iOS | `@capacitor/haptics` 의 `selectionStart` → `selectionChanged` → `selectionEnd`. iOS 구현은 `UISelectionFeedbackGenerator`(Apple 「선택 바뀜」 표준 감각)를 쓴다(플러그인 8.0.2 Swift 원문). |
| Android | 같은 순서로 호출. Android 구현은 `selectionStart` 가 없으면 `selectionChanged` 가 진동하지 않는다(플러그인 8.0.2 `Haptics.java` 원문: `if (this.selectionStarted)`). 진동은 `VibrationEffect.createWaveform`. 실제 세기·길이는 실기에서 `dumpsys vibrator_manager` 로 확인한 뒤 확정한다. |
| 웹·데스크톱 | 없음 |
| 지금 Android 진동 | 웹 `navigator.vibrate(10)` 이 16~21ms 로 울린다(A10). 플러그인 단계(S4)에서 이 호출을 플러그인 호출로 바꾼다. S4 전까지는 S1 에서 호출 시점만 click 으로 옮긴다(iPhone 은 지금처럼 진동 없음). |
| 탭 소리(웹 오디오) | 하단 탭에서 삭제. 다른 화면 18곳의 `triggerLightTapFeedback` 은 범위 밖 — 보고만. |
| 구 바이너리 | 플러그인이 없는 설치본에서는 호출이 아무 일도 하지 않게 한다(`Capacitor.isPluginAvailable`). 웹 코드를 먼저 배포해도 안전하다. |
| 배포 | 플러그인 추가 = **네이티브 변경** → iOS·Android 빌드 번호 증가 → Owner 일괄 빌드 때 함께. |
| 네이버 기준 | N8 NOT_PROVEN. Owner 가 휴대폰에서 네이버 하단 탭 진동 유무를 1회 알려 주면 그 결과로 「켬/끔」을 확정한다(웹 단계와 무관하게 네이티브 단계 전까지만 필요). |

### 5-5. 거부·실패·복귀 (I3 · B2·B3·B4·B5·B11)

| ID | 설계 |
|---|---|
| B3 | 하단 탭 이동은 **항상 `bottom_nav_explicit`**. 사용자 탭이 잠금을 푼다는 기존 분기를 실제로 타게 한다. 방·통화 진입 출처(`room_forward`·`call_launch`) 규칙은 그대로. `commitMainBottomNavRoute` 가 거부되면 `"blocked"` 를 돌려주게 고친다. 잘못된 동작을 잠그던 테스트 2개를 바로잡는다. |
| B5 | 기다림 상태 3개 → 컨트롤러 1개. 끝나는 조건은 하나: Next 경로가 `targetHref` 로 확정 → `settled`, 거부 → `failed`(선택을 원래 탭으로 되돌림). |
| B2 | `showing` 이 **8초** 안에 `settled` 가 되지 않으면 그 이동을 **문서 이동으로 1회 전환**한다(`location.replace(targetHref)`). 8초 근거: 11-10 실측 최장 2.5초(배포 직후 문서 이동)의 3배 이상, 세션 확인 상한 12초보다 짧음. 문서 이동 전환은 컨트롤러 한 곳에서만 한다. |
| B4 | 복귀 조정자에 **`ui` 레인**(인증·idle 을 기다리지 않고 보이는 즉시 동기 실행)을 추가하고, 하단 탭 복귀 작업 1개를 등록한다. 할 일: ① 컨트롤러가 `showing` 인 채 복귀했으면 B2 감시를 다시 건다 ② 키보드 재측정 → 입력칸 포커스가 없으면 숨김·`inert` 해제 ③ 스크롤 숨김이면 다시 보이게. 새 리스너를 따로 달지 않는다(복귀 조정자가 단일 정의). |
| B11 | 채팅 탭도 먼저 `showing`(선택 + 채팅 뼈대) 하고 로그인 확인을 뒤에 한다. 비로그인으로 확정되면 `failed` → 로그인 시트 + 선택을 원래 탭으로 되돌림. |
| hydration 전 | `html:not([data-shell-hydrated])` 차단(C5)은 유지. 문서 재로드 뒤에만 해당하고, 의도된 규칙이다. |

### 5-6. 계약·문서·테스트 한 벌로

| 대상 | 처리 |
|---|---|
| `lib/main-menu/main-bottom-nav-interaction-contract.ts` | 새 계약으로 다시 씀(§5 전체). 버전 1 → 2 |
| `components/layout/MainShellTabContentTransition.tsx` 주석 | 440ms·KeepAlive 문구 삭제 → 「하단 탭 = 컨트롤러 즉시 교체」 |
| `.cursor/rules/trade-primary-tab-transition-contract.mdc` · `cm-hub-navigation-contract.mdc` | 하단 탭 문단을 새 계약 참조로 교체 |
| `docs/dibay-app-home-ssot.md` · `service-brand-icon-state-ssot-design-2026-11-13.md` | 선택 모양 줄을 「채움↔외곽선(11-15 Owner)」으로 갱신 |
| `scripts/verify-no-main-tab-dual-feed.cjs` | 이름 검사 → 「하단 탭 화면 결정권자 = 컨트롤러 1곳」 구조 검사로 |
| 삭제할 테스트 | §4 근본 원인 4의 문자열 잠금 테스트 10개 — 같은 PR 에서 동작 시험으로 대체 |
| 새 단일 문서 | `docs/bottom-nav-interaction-ssot.md` (이 설계서 §5 요약 + 결정 이력) |

---

## 6. 단계 · 영향 · 검증

| 단계 | 내용 | 바뀌는 파일 | 영향 화면·호출처 | 구분 |
|---|---|---|---|---|
| S1 | 컨트롤러 + 입력·영역·B3·B5·B11 + 선택 모양 + CSS 한 블록 + 죽은 코드 삭제 + 계약 재작성 | `main-bottom-nav-interaction-contract.ts`, `bottom-nav-controller`(신규), `BottomNav.tsx`, `main-bottom-nav-route-commit.ts`, `cm-deep-route-navigation-lock.ts`(호출 출처만), `LatestMenuNavigationContext.tsx`(하단 탭 출처 제거), `dibay-service-brand.ts`, `ServiceBrandIcon.tsx`, `MainBottomNavTabIcon(s).tsx`, `app-bottom-nav.css`, 테스트 | 메인 하단 탭(모바일·데스크톱 side-rail 같은 컴포넌트), 배달 다이얼 칩(`commitMainBottomNavRoute` 공용 — 같은 단계에서 시험) | 웹 |
| S2 | 즉시 교체: 보관 화면 intent 표시 + 허브 뼈대 5종 + 하단 탭 출처 폴백 슬라이드 삭제 + B2 감시 | `HubRetentionStack.tsx`, 뼈대 컴포넌트(신규), `AppRouteTransition.tsx`(하단 탭 출처 분기만), `main-hub-transition-authority.ts` | 5개 허브 + 하위 화면에서 탭 누름. 방 진입·통화·화면 안 뒤로·내정보 스택 전환은 손대지 않음 | 웹 |
| S3 | 복귀 `ui` 레인 + 하단 탭 복귀 작업 | `app-resume-coordinator.ts`, 키보드·스크롤 숨김 훅 | 모든 하단 탭 화면. 기존 `auth`·`background` 작업 순서는 그대로 | 웹 |
| S4 | 네이티브 햅틱 | `package.json`, `ios/`·`android/` sync, 빌드 번호 | iOS·Android 앱 | **네이티브 — Owner 일괄 빌드** |
| S5 | 매장 사장님 하단 탭(`OwnerMobileBottomNav`) 입력·햅틱을 같은 컨트롤러 규칙으로 | `OwnerMobileBottomNav.tsx` | 사장님 운영 화면. 모양(검은 사각형) 유지 | 웹 |

- S1~S3 은 같은 작업이라 **PR 1개**로 묶는다(작업 단위 병합). S4 는 네이티브라 별도, S5 는 사장님 도메인이라 별도 PR.
- 각 단계가 끝난 상태에서 화면이 깨지지 않는다. S1 에서 진행 막대를 지우면 S2 전까지 「누름 → 선택 즉시 · 화면은 Next 확정 때」가 된다. 이것은 지금과 같은 수준이고 퇴행이 아니다. 단, 운영 반영은 S1~S3 를 한 번에 한다.
- 롤백: 웹 PR 1개 되돌림. 네이티브는 웹 호출이 플러그인 유무를 확인하므로 독립.

**검증 (코드 PASS 와 실기 PASS 를 구분):**

| 구분 | 항목 |
|---|---|
| 코드 | 컨트롤러 상태 전이 단위 시험(click → showing → settled/failed/8초 문서 이동, 연타, 같은 탭, 거부 시 되돌림, 복귀 레인) · B3 출처 시험 · `typecheck:build` · 관련 vitest · eslint |
| 브라우저 | 로컬 빌드에서 프레임 계측: 누른 뒤 첫 rAF 에 `[data-active]` 와 화면 영역이 바뀌는지(보관·뼈대), 하위 화면에서 누를 때 transform 0 |
| 실기 iPhone(Owner 계정) | 5개 탭 × (처음·다시·하위 화면에서·10분 이상 복귀 뒤): 1번째 캡처에 새 화면 또는 뼈대(네이버와 같은 방법). 탭 위 여백 누름. 같은 탭 맨 위로. 선택 모양 채움↔외곽선 |
| 실기 Samsung | 위와 같음 + 햅틱 `dumpsys vibrator_manager` 기록 + 비행기 모드 복귀 직후 탭(8초 안에 이동 또는 문서 이동) |
| B3 | 테스트 계정 방으로만 시험(Owner 실제 대화 방 열지 않음) |

---

## 7. Owner 결정 · 확인 필요

1. **구현 승인** — S1~S3(웹 PR 1개) → S4(네이티브, 일괄 빌드) → S5(사장님 바).
2. **D-1 변경 승인** — 「이전 화면 유지」 → 「누르는 즉시 보관 화면·뼈대」.
3. **네이버 햅틱 유무** — 휴대폰으로 네이버 하단 탭을 눌러 진동이 오는지 1회 알려 주세요(미러링은 진동을 전달하지 않음). S4 전까지만 필요합니다.

## 8. 범위 밖 관찰 (보고만)

- Samsung A8: 대화 목록에서 방을 누른 뒤 0.5초 만에 뒤로 가자, 방 화면은 한 번도 그려지지 않았다. 대신 목록 가운데 **회색 로딩 원이 계속 돌고** 아바타 사진이 빈칸이 되었다(34). 메신저 방 진입 영역이라 이번 작업에서는 고치지 않는다.

- 복귀 시 DIBAY 가 「메인관리자」 방을 연 것으로 보이는 현상(E2) — 원인 확인 못 함. 알림 탭 진입 흐름(11-13 #259)과 관련 있는지 별도 확인 필요.
- 하단 탭 외 18곳이 웹 진동 + 웹 오디오 소리를 쓴다. iPhone 에서는 진동 없이 소리만 날 수 있다(NOT_PROVEN).
- `apk-remote-webview-perf.ts:24` 주석(「웹 Link prefetch=false」)이 실제 코드와 다르다.


## 9. 구현 기록 (S1~S3 · 2026-11-15)

| 설계 | 구현 |
|---|---|
| 결정권자 1개 | `lib/main-menu/bottom-nav-controller.ts`(상태·8초 감시·진단 기록) · `use-bottom-nav-controller.ts`(구독·경로 확정) |
| 5-1 입력 | `BottomNav.tsx` — pointerdown 은 미리받기만, 선택·햅틱은 click. `pendingActiveTabId`·1.5초 타이머·진행 막대·원형 강조 분기 삭제. 누르는 영역 = `app-bottom-nav.css` 계약 v2 블록 |
| 5-2 즉시 교체 | `HubRetentionStack.tsx`(보관 화면 즉시 표시·없으면 `BottomNavHubSkeleton`·스크롤 P2/P3) · `ConditionalAppShell.tsx`(셸을 목표 허브 기준으로) · `BottomNavShowingRouteContexts.tsx`(머리글 주소) · `AppRouteTransition.tsx`(하단 탭 출처 = 즉시 종료) · `AppScrollMemory.tsx`(이동 중 저장 안 함) |
| 5-3 선택 모양 | `dibay-service-brand.ts`(외곽선 경로) · `ServiceBrandIcon`(variant) · `MainBottomNavTabIcon`(selected) · 색 전환 애니메이션 제거 |
| 5-4 햅틱 | `triggerBottomNavSelectionFeedback`(선택 확정 1회·소리 없음·웹 진동). 네이티브는 S4 |
| 5-5 B3 | `commitMainBottomNavRoute` — 손 뗀 자리 커밋 = `bottom_nav_explicit`, 기다림 뒤 = `bottom_nav_async`, 거부 = `"blocked"` + 컨트롤러·메뉴 의도 함께 되돌림 |
| 5-5 B4 | 복귀 조정자 `ui` 레인 + `bottom-nav-resume-ui` 작업(감시 재판정·`bottom-nav-resume-signal` → 키보드 포커스 재확인·스크롤 숨김 해제) |
| 5-5 B11 | 채팅 탭 프로필 캐시 없음 → 먼저 선택·뼈대, 로그인 확인 뒤 커밋, 비회원이면 되돌림 |
| 5-6 정리 | 계약 `main-bottom-nav-interaction-contract.ts` v2 · `MainShellTabContentTransition` 주석 · html 셸 원형 표식 삭제 · 옛 동작을 잠그던 시험 정정 · 동작 시험 `bottom-nav-controller.test.ts` |

- 개발 서버 주의: Next 16.1.7 개발 모드의 `usePathname` 은 `NavigationPromisesContext` 를 먼저 읽어 주소 덮어쓰기가 먹지 않는다(운영 빌드는 PathnameContext). 머리글 덮어쓰기는 개발에서도 같게 보완했다. 보관 칸(`FrozenRouterContexts`)은 기존 그대로 — 개발 서버에서만 숨긴 내정보 비회원 문지기가 `/mypage?next=` 로 되돌리는 현상이 보일 수 있다(운영 무관, 기존 동작).
- 범위 밖 그대로: `npm run verify:delivery-dial-navigation-contract` 는 main 에서도 이미 실패(문자열 `args.replace(args.href)` 검사 — 코드는 `guardedClientNavigate(args.replace, …)`). `MainDesktopSideNav.tsx` 는 쓰는 곳이 없다.


## 10. 운영 실기 · S4 · S5 (2026-11-15 오후)

### 10-1. S1~S3 운영 실기 (PR #310 · main 7ec6f382a · Production 13:16:34 PHT)

| 기기·조건 | 항목 | 결과 |
|---|---|---|
| Samsung 앱 1.2.6(52) · q테스트1 · 앱 새로 시작 · 13:19 | 탭 6번 선택 → 화면 | 6번 모두 **같은 프레임**에 선택·화면 교체 — PASS (오전 130~640ms 지연) |
| 〃 | 햅틱 | 탭 6번 = 진동 6번(15~18ms) — PASS |
| 〃 13:21 | 채팅방 진입 1.4초 뒤 뒤로 → MY | 진동과 함께 MY 이동 — **B3 PASS** (오전 조용히 거부) |
| Samsung Chrome · 로컬 운영 빌드 · 13:00~13:18 | 바 위 스와이프 | 선택·진동 없음 — PASS |
| 〃 | 7분 백그라운드 뒤 첫 탭 | 처음 여는 탭 = 같은 프레임 뼈대, 보관 탭 = 같은 프레임 화면 — PASS |
| 〃 | LOUNGE 뼈대 | 2번 교체 → 보완 커밋 2개 뒤 1번 — PASS |
| iPhone 운영 앱 | 전 항목 | **NOT_PROVEN** — 미러링 백그라운드 조작으로 앱 재시작 불가(옛 코드 상태 확인됨). Owner 가 DIBAY 를 완전히 종료 후 다시 열면 확인 |

### 10-2. S5 사장님 하단 탭 (PR #312 · main ccc49b6d1 · Production 13:39:11 PHT)

- 구현: click 1회 햅틱(소리 없음) · pointerdown 피드백 삭제 · 같은 탭 = 맨 위로 · 하단 탭 이동은 `OwnerStackPageSlideShell` 270ms 슬라이드 생략(`owner-bottom-nav-tab-intent`) · 누르는 영역 = 투명 확장(배치 변화 없음) · 복귀 작업 공용화(`use-bottom-nav-resume-ui-task`)·사장님 스크롤 숨김 복귀 해제.
- 운영 실기(Samsung 앱 · 매장 「맛없는식당」 운영 화면 · 13:40): 탭 5번 + 탭 위 가장자리 1번 = 진동 6번 — PASS · 선택 표시 즉시 — PASS · 화면은 한 프레임에 통째로 교체(슬라이드 없음) — PASS · 탭 위 가장자리(바 위 6px 띠) = 그 탭 — PASS.
- **FAIL(충돌 보고)**: 화면 교체가 선택 표시보다 **160~830ms 늦다**(이전 화면 유지). 원인 = 사장님 탭 `prefetch={false}` — `docs/owner-hub-cold-path-contract.md` 7번 「사장님 하위 화면 RSC 선로딩 금지」(허브 체감 속도 계약). 네이버형 즉시 교체(메인 5-2)를 사장님 탭에도 하려면 이 계약을 바꾸거나 사장님 화면 뼈대를 새로 만들어야 한다 → **Owner 결정 필요**(§11).

### 10-3. S4 네이티브 햅틱 (PR #313)

- `@capacitor/haptics` ^8.0.2, `cap:sync:vercel`(Android gradle · iOS SPM · packageClassList `HapticsPlugin`). App-target 계약 PASS.
- 호출: 네이티브 앱 = `selectionStart → selectionChanged → selectionEnd`(iOS UISelectionFeedbackGenerator; Android 플러그인은 start 없이 진동하지 않음). 플러그인이 없는 설치본 = 지금처럼 웹 진동(Android)·없음(iPhone) — 먼저 배포해도 안전.
- 빌드 번호는 설치·배포용 빌드 때 `native:prepare` 가 올린다(Owner 일괄 빌드). 실기(iPhone 햅틱·Android 파형)는 그 빌드 설치 뒤 — NOT_PROVEN.

## 11. 최종 상태 (2026-11-15 14:40 PHT)

| 항목 | PR | 운영 실기 |
|---|---|---|
| 메인 하단 탭 컨트롤러·즉시 교체·채움↔외곽선·B3·복귀 재정렬 | #310 | Samsung PASS · iPhone PASS(LOUNGE·DIPICK·MY 다시) |
| 사장님 하단 탭 반응 시점·햅틱·슬라이드 제거·가장자리 | #312 | Samsung PASS |
| 사장님 탭 뼈대 신설(Owner 결정 — 미리받기 금지 계약 유지) | #314 | Samsung PASS(주문·상품·고객·관리) |
| 첫 로딩 뼈대: MY `loading.tsx` null 흰 화면 · 사장님 주문·고객·관리 「불러오는 중…」 | #316 | Samsung PASS · iPhone PASS(MY) |
| 최종 점검: 같은 경로 이동 시작 안 함 · 이동 중 다른 경로로 가면 끝 | 이 PR | 시험 PASS · 실기 NOT_PROVEN(아래) |
| 네이티브 선택 햅틱 | #313 | **NOT_PROVEN** — 다음 일괄 빌드 설치 뒤 |
| 네이버 햅틱 | — | 네이버 하단 탭 진동 없음(Owner 확인). DIBAY 햅틱은 Owner 처음 지시 「선택되는 부분의 햅틱 기능」대로 유지 |

### 11-1. 최종 점검 (오류·누락·누수·중복·병목)

| 구분 | 결과 |
|---|---|
| 오류 | **2건 발견·수정(이 PR)** — ① 사장님 탭이 쿼리만 다른 같은 경로로 갈 때 컨트롤러가 끝나지 않아 8초 뒤 문서 이동 → 같은 경로면 시작 안 함 ② 이동 중 뒤로가기 등 다른 경로로 가면 목표 뼈대 잔존·8초 뒤 누른 탭으로 문서 이동 → 경로가 바뀌면 끝 |
| 누락 | 없음(설계 5-1~5-6·S4·S5 구현). 단 S4 실기는 빌드 전이라 NOT_PROVEN |
| 누수 | 없음 — 컨트롤러 감시 타이머는 끝·실패·감시 때 해제, 복귀 신호·키보드·스크롤 구독과 복귀 작업 등록은 모두 해제 함수 반환(useEffect 정리) |
| 중복 | 이번 변경으로 생긴 중복 없음. 기존: `guardBeforeNavigate` 가 BottomNav onClick·커밋에서 2번 호출(결과 같음, 보고만) · 복귀 작업은 메인·사장님 바가 같은 id 로 등록(1개만 실행) |
| 병목 | 로컬 운영 빌드 계측: 탭 6건 첫 프레임 12~26ms · 긴 작업(longtask) 0건. 기기 녹화: 선택·화면이 같은 프레임 |

### 11-2. 범위 밖 관찰 (보고만, 고치지 않음)

- 메신저: 방 진입 직후 뒤로가기 때 `blocked_navigation` 로그 1줄(화면 정상) · 방 진입을 빨리 취소하면 목록 로딩 원이 남음(Samsung A8).
- /mypage 의 크기 0 하단 탭 복사본(사람은 누를 수 없음).
- `components/layout/MainDesktopSideNav.tsx` 는 쓰는 곳이 없다.
- `npm run verify:delivery-dial-navigation-contract` 는 main 에서도 실패(문자열 검사가 코드와 맞지 않음).

### 11-3. 남은 항목 정리 (2026-11-15 15:20 PHT · chore/bottom-nav-leftovers)

| 항목 | 원인 | 처리 |
|---|---|---|
| 쓰지 않는 `MainDesktopSideNav.tsx`·숨김 CSS | 비활성 후 파일만 남음(어디서도 import 안 함) | 파일·CSS·검사 목록에서 삭제 |
| `verify-delivery-dial-navigation-contract` 실패 | 검사가 옛 문자열 `args.replace(args.href)` 를 찾음(계약 v2 는 `guardedClientNavigate(args.replace, args.href, …)`) | 검사를 실제 코드 순서(이동 → 오버레이 닫기)로 수정, main 에서도 실패하던 것 |
| 글쓰기 시트 이탈 확인 2회 호출 | 탭 onClick 3곳 + 커밋이 각각 `guardBeforeNavigate` | 탭 클릭 진입점(`runBottomNavTabClickOrOpenNew`) 1회 · 커밋은 `guardPassed` 면 생략(배달 다이얼 등 다른 호출처는 그대로 커밋에서 1회). 새 탭 열기는 이탈이 아니라 확인하지 않음 |
| `apk-remote-webview-perf.ts` 주석 「웹 Link prefetch=false」 | 사실과 다름(비선택 허브 탭은 `shouldPrefetchMainBottomNavHref` = true) | 주석 정정 |
| /mypage 크기 0 하단 탭 복사본 | **결함 아님 — 측정 착시.** React 19.2 스트리밍 공개(`$RC`→`$RV`)가 `requestAnimationFrame` 을 기다리는데, 측정 브라우저 창이 숨김이라 rAF 가 멈춰 `div#S:0` 가 남아 있었음. rAF 1회 뒤 `S:0` 제거 확인(로컬 운영 빌드) | 코드 변경 없음. 기기 확인은 배포 뒤 |
| 콘솔 「탭 전 navigator.vibrate 차단」 | 깨끗한 새로 열기 4회(/mypage 2·/home·/philife) 0회 — 재현 안 됨 | 코드 변경 없음 |
### 11-4. #320 실기 FAIL → 원인 · 수정 (2026-11-15 15:40 PHT)

- 실기(Production `bb51c12`, Samsung 로그인 앱): 메신저 목록에서 방 누르고 0.5초 뒤 뒤로 → 목록 사진(아바타 빈칸)+가운데 로딩 원이 **약 3초** 남음 = **FAIL**. 0.9초 뒤 뒤로(방 다 열린 뒤)는 바로 목록.
- 재현·계측(Xiaomi WebView 디버거, 폭 384 로 맞춤): 방 경로 330ms → 방 마운트(진입 전 「enter」) 1113ms → 뒤로 1389ms → 복사본 제거 3359ms(3초 상한).
  방 DOM 은 마지막 popstate 리스너 시점에 이미 없음(`roomDom=false`) — React 19 가 Next 라우터의 popstate 리스너 안에서 이동을 바로 반영.
- 원인: ① 방의 popstate 리스너(`MessengerRoomSwipeBackShell`)는 Next 보다 늦게 등록 → 이벤트 도중 방이 언마운트되며 제거돼 **불리지 않음**
  ② #320 진입 중단 감시는 방 마운트 때 꺼짐(`noteRoomEntryArrived`) → 걷을 주체 없음.
  같은 원인으로 사장님·주문 하위 화면 슬라이드(`OwnerStackPageSlideShell`·`CommerceChildSlideShell`)·앱 전환 방향(`useRouteTransitionDirection`)의 「뒤로」 판정이 늦을 수 있음(나중에 마운트된 경우).
- 수정: 위 다섯 곳 popstate 를 **캡처 단계**(`lib/navigation/popstate-before-router.ts`)로 등록 — 대상(window)에서 캡처가 일반 리스너보다 먼저 불려 Next 보다 먼저, 이동 전 화면에서 실행. 시험 `lib/navigation/__tests__/popstate-before-router.test.ts`.
- 같은 유형의 다른 popstate 리스너(작성 이탈 확인·시트 닫기 등)는 레이아웃·셸에 상주해 언마운트되지 않는 곳이라 이번 수정 대상 아님 — 실기 확인 항목으로 남김.

### 11-5. #323 정정 — 캡처 단계 전제 틀림 (2026-11-15 16:10 PHT)

- **작업자 잘못**: #323 은 「window 대상에서 캡처 리스너가 먼저 불린다」는 전제로 popstate 를 캡처로 바꿨다. 실기 WebView(Chrome 156, Xiaomi)에서 등록 A(일반)→B(캡처) 후 이벤트 = `bub,cap` — **등록 순서대로** 불림. jsdom 시험만 통과했고 실기 효과 없음. 운영 `77ea2bb` 에서 Samsung 0.5초 뒤로 2회 중 1회 FAIL 재현(15:43), Xiaomi 계측(16:00): 방 마운트 직후 감시 해제 → 방 리스너는 Next 이후라 뒤로 순간 언마운트로 제거(리스너 제거가 popstate 마지막 리스너보다 먼저 기록됨) → 목록 사진 3.34초 잔존.
- **수정**: #323 캡처 변경 전부 되돌림(`popstate-before-router.ts`·시험 삭제). 진입 중 뒤로 감시 해제 시점을 **방 마운트 → 방 진입 완료**(들어오는 움직임 끝 타이머, 또는 움직임 없는 분할·축소 모션)로 옮김. 그동안의 뒤로는 탭 때 건 감시가 이동 뒤에 불려 정리한다.
- **남는 사실(기존 동작, 이번 수정 아님)**: 방이 다 열린 뒤 Android 뒤로는 방의 「밀려나는」 퇴장 그림이 불리지 않고 목록이 바로 보인다(같은 원인 — 방 리스너가 Next 이후). 사장님·주문 하위 화면 슬라이드·전환 방향 판정의 popstate 플래그도 화면이 나중에 마운트되면 Next 이후 등록 → 「뒤로」 판정이 늦을 수 있음 — 기기 미확인(NOT_PROVEN).

### 11-6. 남은 항목 — 뒤로(popstate) 선등록 단일 리스너 (2026-11-15 16:20 PHT)

- **원인(11-4·11-5 계측)**: window popstate 리스너는 등록 순서대로 불리고, Next 는 자기 리스너 안에서 이동을 화면에 바로 반영한다 → Next 이후 등록된 화면 리스너는 (1) 사라지는 화면이면 안 불림 = 방이 다 열린 뒤 Android 뒤로 때 방 퇴장 그림 미실행, (2) 남는 화면이면 바뀐 뒤 불림 = 사장님·주문 하위 화면 슬라이드·앱 전환 방향의 「뒤로」 판정이 레이아웃 효과보다 늦음(나중에 마운트된 경우).
- **수정**: `<head>` 인라인 스크립트(`POPSTATE_BEFORE_ROUTER_BOOT_SCRIPT`)가 앱 번들보다 먼저 window 에 리스너 1개를 걸고, 화면은 `subscribePopstateBeforeRouter` 로 구독 → 언제 마운트됐든 Next 보다 먼저, 이동 전 화면에서 실행. 대상 5곳: 방 퇴장(`MessengerRoomSwipeBackShell`)·방 진입 중 뒤로 감시·사장님/주문 하위 슬라이드·앱 전환 방향.
- **재현 안 됨 (보류, 추측 수정 안 함)**: 15:31 한 번 본 「하단 탭 누른 직후 뒤로 → 문서 다시 읽기」는 같은 순서 2회(앱 재시작 직후 · 방 진입/뒤로 뒤, 16:11) 재현 안 됨.
- **빌드 필요**: S4 네이티브 햅틱(#313) 실기는 다음 일괄 네이티브 빌드 후.

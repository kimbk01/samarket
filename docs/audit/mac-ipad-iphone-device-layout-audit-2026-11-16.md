# 맥·아이패드·아이폰 기기별 화면 구성 — 결함 감사와 구조 수정 계획 (2026-11-16 PHT)

- 상태: **감사·계획만. 코드 변경 0건.** 아래 단계는 각각 Owner 승인 후 구현한다.
- 기준 코드: `origin/main` `1be808e73` (읽기 전용 작업 폴더 `.claude/worktrees/mac-layout-audit`)
- 계측: 19:00 PHT 전후, Mac 외부 모니터 「Mi monitor(2)」, DIBAY 맥 앱(`com.dibay.ph`, 로그인 상태 — Owner 계정 화면 그대로), 창 1612×1111pt
- 증거 폴더: `docs/audit/mac-ipad-iphone-layout-2026-11-16-device/`
  - `owner-mac-feed.webp` — Owner 첨부 캡처 (FEED 화면)
  - `mac-dibay-1612pt-full-screen.jpg` — 작업자 캡처 (같은 창, FEED)
  - `mac-telegram-970pt.jpg` — 같은 Mac 의 Telegram 맥 앱 (970×584pt)
- 레거시 기준: Telegram-iOS `24638bc69`, Telegram macOS `4f71cdd59` 소스 (코드로 읽은 사실 — Telegram 실기 화면은 맥 앱 1장만 직접 봄)

## 0. 작업자 확인 범위 (먼저)

- 직접 본 것: Mac 앱 FEED 1화면(로그인, 1612pt 창), Telegram 맥 앱 1화면. 창 크기는 바꾸지 않았다(11-16 오전 창 크기 원복 실패 재발 방지).
- **Owner 가 말한 「크기 조정 시 깨짐」은 작업자가 창을 줄여 직접 재현하지 않았다 → NOT_PROVEN.** 아래 §2 D5 의 원인은 코드에서 확인한 분기 위치이고, 실제 깨지는 모양은 계측 전이다.
- iPad 실기·iPhone 실기는 이번에 보지 않았다 → NOT_PROVEN.

## 1. 판정표

| # | 항목 | 조건 | 판정 | 증거 |
|---|---|---|---|---|
| F1 | Mac 글자 크기 | Mac 앱, 로그인, 1612pt | **FAIL** | 본문 14px·보조 13px·캡션 12px·하단 탭 글자 10~11px(`app/design-tokens.css:42-54`, `app/app-bottom-nav.css:296,339,362`) × iPad 앱 맥 배율 0.77(11-16 실측 `horizontal-fill-device-audit-2026-11-16.md` §0: 본문 1056 CSS → 814pt) = **본문 10.8pt·보조 10pt·캡션 9.2pt·탭 글자 7.7~8.5pt**. 같은 Mac 의 Telegram 본문 13pt(`TGFont.swift:313-320` FontSize.text=13), macOS 기본 13pt(Apple HIG Typography) |
| F2 | Mac 이 「맥」으로 구분되지 않음 | 코드 | **FAIL (구조)** | Mac 의 iPad 앱 idiom 은 항상 `.pad`(Apple 문서) → `DibayDeviceClassClassifier.swift` 가 `TABLET_IPAD` 로 판정. 웹은 Mac 과 iPad 를 구분할 값이 없다. `isiOSAppOnMac` 은 통화 경로(`DibayCallPlatformCapability.swift:24`)만 읽는다 |
| F3 | 하단 탭이 창 전체 폭 | Mac 앱 FEED | **FAIL (레거시와 다름)** | 캡처: 하단 탭 5개가 1612pt 창 전체에 퍼짐. Telegram: 넓은 창에서 탭은 **목록 열 아래에만** (iPad `TelegramRootController.swift:205` tabBar=.master, Mac `MainViewController.swift:393,537` 왼쪽 열 TabBarController, Mac 캡처 왼쪽 300pt 열 아래 탭 3개) |
| F4 | 한 줄 카드가 창 전체로 늘어남 | Mac 앱 FEED | **FAIL** | 캡처: 글 카드 1장이 약 2090 CSS 폭. 제목·요약은 왼쪽, 썸네일·좋아요는 오른쪽 끝에 떨어짐, 가운데 빈 공간. Write 버튼도 오른쪽 끝. 원인: #354 `APP_MAIN_COLUMN_MAX_WIDTH_CLASS = "max-w-none"`(`lib/ui/app-content-layout.ts:17`) — 넓은 화면에서 목록을 칸으로 나누지 않고 한 열을 늘림 |
| F5 | 창 크기 조정 시 화면 구성 전환 | 코드 | **원인 확인 / 화면 NOT_PROVEN** | §2 D5 |
| F6 | 넓은 화면 목록｜상세 분할 | 코드 | **FAIL (메신저만 있음)** | 분할은 메신저만(`APP_MESSENGER_SPLIT_MIN_PX=768`). 라운지·마켓·DIPICK·MY 는 목록을 누르면 화면 전체가 상세로 바뀜. 레이아웃 판정기는 `domainLayoutActivated: false` 고정(`dibay-shell-resolver.ts`) |
| F7 | Mac 창 최소 크기 | 코드 | **FAIL** | iOS 쪽에 창 크기 제한 코드 없음(`sizeRestrictions` 검색 0건). Telegram 맥은 최소 380×550(`ApplicationContext.swift:456`) |
| F8 | iPhone | — | NOT_PROVEN | 이번 계측 없음. 코드상 휴대폰은 한 화면 쌓기 + 창 전체 하단 탭 = Telegram iPhone 과 같은 구조 |
| F9 | iPad 실기 | — | NOT_PROVEN | 기기 없음. 코드상 Mac 과 같은 `TABLET_IPAD` 경로 |

## 2. 결함 상세와 원인

### D1. Mac 글자가 작다 (F1)
- iPad 앱은 Mac 에서 77% 로 그려진다(11-16 작업자 실측: 1024·1709·3424pt 창에서 1056 CSS 열 = 814pt). Apple 문서는 Catalyst iPad 방식의 77%(17pt→13pt)만 명시하고, 「Designed for iPad」 앱에서 이를 끄는 설정은 찾지 못했다(NOT_PROVEN — 끌 수 없다는 내용은 개발자 포럼 글뿐).
- 웹 글자는 휴대폰 기준 px 로 고정돼 있고, `text-[Npx]` 직접 지정이 **650개 파일·4,083곳**이다. 화면별로 글자를 키우는 방식은 불가능하다(누락·불일치 보장).
- 결론: 글자 문제는 **한 곳(웹뷰 전체 배율)** 에서만 고칠 수 있다.

### D2. Mac 기기 종류가 없다 (F2)
- 기기 판정 SSOT(FD1)는 `PHONE_*`·`TABLET_*`·`DESKTOP_WINDOWS`·`WEB_DESKTOP` 뿐. FD1 잠금 문서에 「No Mac Catalyst guess」(`docs/dibay-device-fd1-device-class-hard-lock.md:64`).
- 그래서 Mac 은 셸·글자·창 정책을 iPad 와 따로 가질 수 없다. Owner 요구 「모바일·아이패드·맥북 분리 관리」의 첫 번째 막힘.

### D3. 셸이 기기 종류로만 정해지고 창 크기를 보지 않는다 (F3·F6)
- FD4 잠금(`docs/dibay-device-fd4-app-shell-navigation-hard-lock.md`): 「PHONE·TABLET 하단 탭」, 「폭으로 셸 선택 금지」, 「새 태블릿 레일 금지」, 「도메인 분할 비활성(FD5~FD7)」.
- Telegram 은 반대로 **창 크기**로 정한다.
  - iPad: 창 폭 >690pt 이고 높이 >650pt 면 분할(regular), 아니면 한 화면 쌓기 (`WindowContent.swift:361-366`). 왼쪽 열 = `min(max(320, W/3), W/2)` (`NavigationSplitContainer.swift:11-19`). 탭은 왼쪽 열 아래.
  - Mac: 왼쪽 열 기본 300pt, 끌어서 300 ~ (창−380), 오른쪽 대화 최소 380, 분할 진입 650pt, 90pt 아이콘만 모드(`ApplicationContext.swift:465,1229-1255`, `TGSplitView.swift:90-97,655-677`). 탭은 왼쪽 열 아래(떠 있는 탭 바, 높이 48).
  - iPhone: 항상 한 화면 쌓기, 탭 창 전체.
- 즉 레거시 구조로 가려면 **FD4 잠금 조항 3개를 Owner 가 다시 열어야** 한다(§4 충돌).

### D4. 넓은 창을 「칸」이 아니라 「늘이기」로 채운다 (F4)
- 11-16 Owner 지시(「둘 다 진행」, #354)로 본문 최대 폭을 없앴다. 그 결과 빈 띠는 없어졌지만, 목록 한 줄이 창 폭만큼 늘어나 Owner 캡처 모양이 됐다.
- Telegram 도 창을 끝까지 채우지만, **목록 열(300~1/3) + 상세 열(나머지)** 로 나눠 채운다. 한 줄을 늘이지 않는다.

### D5. 창 크기 조정 시 기준이 두 개라 섞인다 (F5)
- 셸(하단 탭)은 기기 종류로 고정, 화면 안 배치는 CSS 폭 분기로 바뀐다. 기준이 두 개라 창을 줄이면 화면 안만 바뀌고 셸은 그대로다.
- Mac 앱에서 CSS 분기가 걸리는 창 폭(×0.77):

| CSS 분기 | 쓰는 곳 | Mac 창 폭 |
|---|---|---|
| 640 (`sm`) | 거래 격자 2→3열 (`lib/posts/trade-feed-layout-classes.ts:58`) | 493pt |
| 768 | 메신저 분할 켜짐/꺼짐, 홈 「지금 우리 동네」 1→2열, MY 1→2열, 하단 탭 메신저 목록 칸 전환 (CSS `@media min-width:768` 9곳) | 591pt |
| 1024 (`lg`) | 거래 4열 | 788pt |
| 1280 (`xl`) | 거래 5열·홈 3열 | 986pt |
| 1536 (`2xl`) | 거래 6열 | 1183pt |

- 창 최소 크기 제한이 없어(F7) 폭을 계속 줄일 수 있다. 가장 큰 전환은 591pt 에서 메신저 분할이 켜지고 꺼지는 순간이다(하단 탭 위치까지 바뀜).
- 레거시는 기준이 하나(창 크기 등급)이고, 최소 창 크기가 있다.

## 3. 목표 구성 v2 — 3형태 분리 (Owner 2026-11-16 저녁 지시)

Owner 원문: 「윈도우 형태를 원하는 부분」, 「윈도우와 맥북의 경우 운영체제는 틀리지만 동일한 형태」, 「테블릿과 아이패드 … 의 정확한 분리와 구분」.
v1(§3 텔레그램 Mac 형태: 목록 열 아래 탭)은 이 지시로 **폐기**한다. Mac 은 Windows 와 같은 왼쪽 세로 메뉴 형태다.

시안(운영 CSS·Pretendard·운영 DOM 클래스 원문으로 렌더링): https://claude.ai/artifact/8qa224XkhFCsbMx3ML3d6w · 원본 `docs/audit/device-shell-mockup-2026-11-16/` (`build.mjs` 는 scratchpad, 프레임 HTML 은 폴더에 있음)

| 형태 | 기기 | 기기 판정 | 메뉴 | 창 768 미만 | 창 768 이상 | 글자 배율 | 회전·창 |
|---|---|---|---|---|---|---|---|
| 휴대폰 | Android 폰(APK)·iPhone | `PHONE_ANDROID`·`PHONE_IOS` (그대로) | 하단 탭 창 전체 | 한 화면씩 | (휴대폰은 768 넘지 않음 — 회전 세로 고정) | 1.0 | 세로 고정 (그대로) |
| 태블릿 | Android 태블릿·iPad | `TABLET_ANDROID`·`TABLET_IPAD` (그대로) | 768 미만 하단 탭 창 전체 / 768 이상 하단 탭 **목록 칸 아래** | 한 화면씩 | 목록 칸 `clamp(360,35vw,470)` \| 상세 칸 | 1.0 | 세로·가로 (그대로) |
| 데스크톱(윈도우 형태) | Windows 앱·**Mac 앱**·PC 브라우저 | `DESKTOP_WINDOWS`·**`DESKTOP_MAC`(새로)**·`WEB_DESKTOP` | 왼쪽 세로 메뉴 72 (11-07 D1 그대로) | 메뉴 72 + 한 화면씩 | 메뉴 72 \| 목록 칸 \| 상세 칸 | Windows·PC 1.0 / **Mac 1.30 (=1÷0.77)** | 창 크기 자유, Mac 최소 380×550pt |

- 형태는 **기기 종류로만** 정한다(FD4 유지 조항 「폭으로 휴대폰·태블릿·데스크톱을 바꾸지 않음」 그대로). 창 폭은 형태 **안에서** 한 화면/두 칸만 바꾼다.
- 두 칸 기준 768·목록 칸 폭은 지금 메신저 분할 계약을 그대로 쓴다(새 값 없음). Telegram 값(iOS 690pt·Android 690dp 또는 가로·Mac 650pt, 목록 320~35%)은 참고만 — 계약과 다르면 계약 우선.
- Mac 배율 1.30 근거: Mac 의 iPad 앱 77% 실측(11-16, CSS 1056→814pt). 보정 후 CSS 1px = 1pt = Windows 100%·PC 브라우저와 같은 크기 → 「동일한 형태」. Mac 창 1612pt = CSS 1612.
- HOME 은 목록-상세 구조가 아니어서 넓은 창 배치를 시안에 넣지 않았다 → Owner 결정 필요.

### 실측 근거 (19:10~19:20 PHT, 운영 `samarket.vercel.app`, 내장 브라우저, 비로그인)
- 지금 「윈도우 형태」 = PC 브라우저(`WEB_DESKTOP`, `DESKTOP_SIDE_RAIL`, html `data-shell-bottom-nav-side-rail`): 1024×768·1600×900 에서 왼쪽 세로 메뉴 72 확인. 1600 폭 정보 공유 목록은 카드 한 줄이 창 끝까지 늘어남(F4 와 같은 결함 — Windows 에도 있음).
- 글 상세(1600): 세로 메뉴 + 상세 본문 `mx-auto max-w-3xl`(768) — 상세 칸에 그대로 씀.
- 시안 계측: 태블릿 가로 1006×601 에서 목록 칸 360, 하단 탭 x=0·폭 360·높이 60(지금 메신저 분할 CSS `app-bottom-nav-shell--messenger-split-list` 그대로), 카드 제목 15px Pretendard Variable, 하단 탭 글자 10px.
- 로그인 화면(메신저 3칸 등)은 이번에 보지 않음 → NOT_PROVEN.

## 4. 승인된 설계·지시와의 충돌 (규정 7 — 고르지 않고 보고)

| # | 기존 결정 | 근거 | v2 와의 관계 |
|---|---|---|---|
| C1 | 본문 최대 폭 해제 「창 끝까지」 | Owner 11-16 「둘 다 진행」 #354 | 끝까지 채움은 같음. 카드 한 줄을 늘이지 않고 칸으로 나눔 → 카드 한 줄 폭 360~470 으로 줄어듦 |
| C2 | 태블릿 하단 탭 창 전체 | FD4 HARD LOCK | 768 이상에서 목록 칸 아래로 — 조항 해제 필요 |
| C3 | 도메인 두 칸 비활성 | FD4·FD5 잠금 | 라운지·마켓·DIPICK·MY 두 칸 — 조항 해제 필요 |
| C4 | 「No Mac Catalyst guess」 | FD1 잠금 `:64` | `isiOSAppOnMac` 은 Apple 공식 값 — 문구 해제 필요 |
| C5 | Mac = iPad 앱 → 태블릿 경로(회전·관리자 가로 고정·시작 화면 태블릿용) | `dibay-orientation-policy.ts`·`DibayRootBridgeViewController.swift:74`·`lib/launch-intro/target.ts:17` | `DESKTOP_MAC` 이 되면 이 세 경로에서 빠짐 — 같은 단계에서 처리 |

(v1 의 C5 「Windows 레일과 Mac 모양 다름」·C6 「메신저 768·목록 칸 값」 충돌은 v2 에서 없어짐 — Mac 이 Windows 형태를 따르고, 768·목록 칸은 계약 그대로 씀.)

## 5. 수정 계획 v2 (원인별, 단계마다 Owner 승인)

### S0. Owner 결정
1. C1~C4 잠금 조항 해제 여부.
2. HOME 넓은 창 배치.

### S1. Mac = 데스크톱 판정 + 세로 메뉴 (네이티브 + 웹, 한 PR · 한 반영)
- iOS `DibayDeviceClassClassifier.swift`: `ProcessInfo.processInfo.isiOSAppOnMac` → `DESKTOP_MAC` (판정은 이 파일 하나. 통화의 `DibayCallPlatformCapability` 는 손대지 않음 — 통화 규정).
- 웹 `dibay-device-class.ts`·`dibay-layout-resolver.ts`·`dibay-orientation-policy.ts`: `DESKTOP_MAC` 추가 → DESKTOP 계열 → `resolveAppShell` 이 이미 `DESKTOP_SIDE_RAIL` 을 낸다(셸 코드 변경 없음, Windows 와 같은 경로).
- 함께 처리(C5): iOS 회전 정책 `DibayAppOrientationPolicy.swift`·`DibayRootBridgeViewController.swift:74`(관리자 가로 고정 TABLET_IPAD 한정), 시작 화면 대상 `lib/launch-intro/target.ts`, 커뮤니티 스와이프 `CommunityFeed.tsx:1466`(휴대폰만 — 변화 없음 확인).
- 영향: 기기 판정 분기 전수 10파일(android 2·ios 3·web 5, 감사 시 집계) — 구현 전에 표로 확정.
- 배포 구분: 네이티브(iOS 재빌드 — Owner 일괄 빌드 때 설치).

### S2. Mac 웹뷰 배율 1.30 (네이티브만, S1 과 같은 iOS 빌드)
- **측정 먼저(M0)**: Debug 빌드에서 Mac 일 때만 `WKWebView.pageZoom = 1/0.77` → 창 1612pt 에서 `innerWidth ≈ 1612`, 본문 14px 가 14pt 로 보이는지, 입력창 16px 규칙(`globals.css:1317`)·시트·통화 화면 위치. Apple 문서로 동작 확인 못 함 → **측정 PASS 전 구현 금지**.
- iPad·iPhone 변화 0. 웹 글자 4,083곳은 건드리지 않음.

### S3. 태블릿 넓은 창 하단 탭 위치 (웹)
- 768 이상 태블릿: 모든 탭에서 하단 탭을 목록 칸 아래로 — 지금 메신저 분할 클래스 `app-bottom-nav-shell--messenger-split-list` 를 탭 공통 조건으로 일반화(로직 복제 없음). 데스크톱은 세로 메뉴라 해당 없음.
- S4 의 탭별 두 칸과 **같은 반영**(목록 칸 없이 하단 탭만 옮기면 화면이 깨짐).

### S4. 탭별 목록 | 상세 두 칸 (웹, 탭별 PR — 도메인 혼합 금지)
- 순서: LOUNGE(정보 공유·마켓·모임) → MARKET → MY(메뉴 | 하위 화면) → DIPICK(매장 목록 | 매장) → telRING(지금 있음, 데스크톱 세로 메뉴와 3칸 이미 운영) → HOME(S0 결정 후).
- 상세를 오른쪽 칸에 여는 라우팅(주소 유지·뒤로가기 = 상세 닫기·새로고침 시 두 칸 복원)은 탭마다 설계서 먼저. 거래 목록 불변조건(`docs/trade-lightweight-design.md` §9) 그대로.
- 태블릿 768 이상과 데스크톱은 같은 두 칸 컴포넌트(데스크톱은 왼쪽에 세로 메뉴만 더해짐).

### S5. Mac 창 최소 크기 380×550pt (네이티브, S1 과 같은 iOS 빌드)
- `UIWindowScene.sizeRestrictions.minimumSize` (Mac 에서만).

### S6. 검증 행렬 (반영 후, 작업자 직접 · Owner 계정 로그인)
- Mac 앱: 창 400·600·800·1000·1612pt × 5탭 + 메신저 방 + 글 상세 — 세로 메뉴·칸 폭·글자 pt 계측, Windows(또는 PC 브라우저) 같은 CSS 폭 캡처와 나란히 대조.
- Windows 앱: Owner Windows 노트북에서만 판정 가능(없으면 NOT_PROVEN).
- Xiaomi 태블릿 세로(601)·가로(1006), iPad 시뮬 세로 820·가로 1180·iPad mini 세로 744(768 미만 → 한 화면).
- Samsung·iPhone: 변화 없음 확인.

## 6. 남은 NOT_PROVEN
- 창 크기 조정 시 실제 깨지는 모양(작업자 미재현)
- iPad·iPhone 실기 화면
- `pageZoom` 이 Mac 의 iPad 앱에서 77% 를 상쇄하는지
- Telegram 판정은 소스 코드 읽기 결과(맥 1화면만 실기 확인)

## 7. v3 — 권장안 확정·회전 포함·기기 프로필 단일 정의 (Owner 2026-11-16 19:3x PHT)

Owner 원문: 「오너 결정 부분은 권장 사항을 제시하면 따르는 부분으로 하자」, 「정확한 기기별 구분과 정확한 관리가 가능한 형태로 구현」, 「테블릿 및 아이패드는 가로 회전, 세로 회전도 감안 … 정확한 ssot」.

- 시안 v2(같은 주소): https://claude.ai/artifact/8qa224XkhFCsbMx3ML3d6w — 기기 12종(지금 Mac 포함)·세로/가로·5탭 전환, 태블릿 회전 비교, 전 기기 같은 축척 한눈 보기. 화면은 운영 CSS + 운영 화면을 Playwright 로 그려 받은 DOM(비로그인·한국어, `capture.mjs`).
- **단일 정의 = `docs/audit/device-shell-mockup-2026-11-16/profiles.js`** — 구현 때 그대로 `lib/device/dibay-device-profile.ts`. 시안 화면도 이 값만 읽음.
- 권장안 확정: C1 칸으로 나눠 채움 · C2 태블릿 두 칸이면 하단 탭 목록 칸 아래 · C3 LOUNGE·MY 두 칸, HOME·DIPICK 한 화면 · C4 `DESKTOP_MAC` · 빈 상세 칸 배경만 · 회전해도 열어 둔 글 유지.
- 회전 규칙 R1~R7 (profiles.js `ROTATION_RULES`): 창 폭만 바뀜 → 768 기준 재계산 → 열린 상세 유지·다시 그리지 않음 → 하단 탭은 같은 요소 클래스만 변경 → 빈 상세 배경만 → 휴대폰 세로 고정·태블릿 자유·관리자 가로 고정 태블릿만.
- 회전 결과(시안 계측): Xiaomi 세로 601 한 화면 / 가로 1006 두 칸(목록 360) · iPad 10 세로 820·가로 1180 두 칸 · iPad mini 세로 744 한 화면 / 가로 1133 두 칸 · iPad 화면 반 나누기 590 한 화면.
- 구현 순서: S1 프로필 표 코드화(판정 분기 10곳 → 표 하나) → S2 Mac 판정·세로 메뉴 → S3 Mac 배율(측정 먼저)·창 최소 → S4 두 칸 공통 틀(LOUNGE)·회전 계약 시험 → S5 MY 두 칸 → S6 `user_devices.device_class` 기록(DB 운영 적용 승인 후) → S7 실기.
- 범위 밖으로 남김: telRING·MY·DIPICK 로그인 후 화면 캡처(시안에는 로그인 안내·구조 문구로 표시), 실기 NOT_PROVEN 전부.

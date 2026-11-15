# 가로 폭 꽉 차지 않음 — 기기별·구조 결함 감사와 설계안 (2026-11-16 PHT, v2)

- 기준 코드: `origin/main` 9a5f6a0d9
- 설치본: Android 61 / 1.2.7 (Xiaomi·Samsung `dumpsys package`)
- 계측 시각: 05:03~05:16 PHT
- 증거 폴더: `docs/audit/horizontal-fill-2026-11-16-device/`

## 0. 작업자 잘못 (먼저)

1. **v1 보고의 Mac 수치가 틀렸다.** v1 에서는 "Mac 1033 창 → 본문 832(md)"라고 썼다. 이번 실측으로 iPad 앱이 Mac 에서 **77% 배율**로 그려지는 것을 확인했다. 그래서 1024pt 창의 CSS 폭은 약 1330이고, 본문은 **1056(xl 66rem)** 이다.
   - 계측값: 1024pt 창에서 본문 814pt, 1709pt 창에서 814pt, 3424pt 창에서 815pt. 1056 × 0.77 = 813.
2. **다른 세션 실기를 방해했다.** 05:11 PHT 에 메신저 이미지·이모티콘 세션이 Xiaomi 로 시험하던 중, 확인 없이 탭 5번을 보냈다. 그 결과 키보드가 열리고 방에서 나가는 동작이 생겼다(글자 입력·전송은 없음). 그 세션에 알렸고, 끝 알림(05:15)을 받은 뒤에 다시 계측했다.
3. **Mac 앱 창 크기를 바꾸고 원래대로 되돌리지 못했다.** 원래 1024×800pt 였고, 지금은 1709×694pt(외부 모니터 왼쪽 위 4분의 1)이다. 정확한 원래 크기로 되돌리려면 osascript 보조 접근 권한이 필요한데 거부되어 있다.

## 1. 판정표

| # | 기기·조건 | 판정 | 증거 |
|---|---|---|---|
| M1 | Owner 폰: Nothing `A059P`, Android 16, 설치 1.2.7(53) | **FAIL** | 기기·버전은 운영 DB `profiles.last_device_info`·`user_devices.app_version`. 화면은 Owner 캡처 1: 상태바부터 하단 탭까지 화면 전체가 좌우 **각 37px / 578px(6.4%)** 안쪽, 픽셀 계측 |
| M2 | Samsung SM-M156S, 3버튼 내비 | PASS | `navigation_mode=0`, 로그 `DIBAY_SafeArea left=0 right=0`, 캡처 좌우 끝까지 채움 (`samsung-3button-room.png`) |
| M2' | 같은 Samsung, Owner 가 05:20 PHT 에 **스와이프 제스처로 전환** | **FAIL (재현)** | `navigation_mode=2`, 로그 `insets_px left=84 right=84` (÷2.8125 = **30 CSS px = AOSP 기본 30dp × 1.00**). 캡처 계측: 상태바·헤더·본문·입력창 모두 좌우 **각 84px** 안쪽 — 로그 값과 픽셀 단위로 일치 (`samsung-gesture.png`, `samsung-gesture-safearea-log.txt`) |
| M3 | Xiaomi 태블릿, HyperOS 제스처 | 좌우 0 (M1 결함 미재현) | `navigation_mode=2`·`force_fsg_nav_bar=1`, 로그 `left=0 right=0` |
| T1 | Xiaomi 태블릿 가로 (1340×800px, 밀도 213 → CSS 1006×601) 하단 탭 5개 화면 | **FAIL** | 아래 표 T |
| C1 | Mac 앱 (iPad 앱, `TABLET_IPAD`, 77% 배율) | **FAIL** | 창 1024/1709/3424pt 모두 본문 814pt 고정, 하단 탭만 창 전체로 퍼짐 (`mac-home-*.jpg`) |
| W1 | Windows 앱 (WebView2, `DESKTOP_WINDOWS`) | **NOT_PROVEN** | Windows 기기 없음. 이 Mac 의 Chrome 은 비로그인이라 로그인 셸을 잴 수 없었음. 코드상 데스크톱 셸 = 세로 레일 72 + 본문 1056 열. 11-07 Owner Mac Chrome 로그인 실측(같은 `DESKTOP` 셸, 1542 폭)에서 본문 279~1335, 좌우 빈 띠 확인. 이 열 토큰은 그 뒤로 바뀌지 않음(`git log`) |
| I1 | iPhone 세로·가로 | 확인 못 함 | Owner 지적 대상 아님. 계측 안 함 |

### 표 T — 태블릿 가로 실측 (캡처 픽셀 ÷ 1.331 = CSS)

| 화면 | 상단 헤더 | 본문 | 하단 탭 | 빈 띠 |
|---|---|---|---|---|
| HOME | 본문 열 안(116~1223px) | 116~1223px = **832 CSS** | 화면 전체(0~1340) | 좌우 각 87 CSS. 하단 탭만 끝까지 → 본문과 줄이 맞지 않음 |
| LOUNGE | 배경·제목은 화면 전체(제목 x=22). 2단 칩은 x=130부터 | 116~1223 = **832** | 화면 전체 | 본문 좌우 87 |
| DIPICK | 배경은 화면 전체, 안쪽 180~1159 = **736** | 배너 180~1159 = **736**(768−여백). 카테고리 판 116~1222 = 832 | 화면 전체 | 한 화면 안에 폭 기준 3개(736·832·전체) |
| telRING | 목록+대화방 116~1222 = **832** | 같음 | 목록 칸 아래만(116~595) | 좌우 87, 대화방 오른쪽도 1222 에서 끊김 |
| MY | 배경·제목은 화면 전체 | 271~1068 = **600**(40rem−좌우 20) | 화면 전체 | 좌우 각 약 203 CSS |

## 2. 구조 결함 1 — 휴대폰 좌우 빈 띠 (Android 네이티브)

### 원인 (코드·플랫폼 원문 확정)

`android/app/src/main/java/com/dibay/app/DibayWebSafeAreaBridge.java` 의 좌·우 여백 계산:

```java
EDGE_INSET_TYPES = systemBars() | systemGestures() | displayCutout();
lastLeftCss = edge.left; lastRightCss = edge.right;   // → --dibay-safe-left/right
```

- **AOSP 원문 (main):** SystemUI `navigationbar/views/NavigationBar.java:1852-1869` 는 제스처 모드일 때 `systemGestures` 의 좌·우 크기를 `EdgeBackGestureHandler.getEdgeWidthLeft/Right()`(뒤로가기 가장자리 폭)로 공급한다.
  - 기본 폭: `NavigationBarModeGesturalOverlay` `config_backGestureInset = 30dp`
  - 사용자 감도 배율: `config_backGestureInsetScales = 0.60 / 1.00 / 1.33` (`GestureNavigationSettingsObserver.getLeftSensitivity`)
  - 3버튼 모드는 0 이다.
- **Android 공식 문서 (edge-to-edge):** 시스템 제스처 인셋은 "스와이프되는 뷰를 가장자리에서 떼어 놓는" 용도다. 화면 내용 여백은 `systemBars | displayCutout` 으로 준다.
- **웹 쪽:** 이 값이 `--safe-left/right`(`app/app-shell.css:64-65`)가 되어 다음 곳에 그대로 여백으로 들어간다. 그래서 화면 전체가 줄어든다.
  - 셸 루트 `.main-shell-viewport-root`(`app-shell.css:31-32`)
  - 하단 탭(`app-bottom-nav.css:31-32`)
  - 헤더(`sector-header.css:25-26`)
  - 시트(`dibay-overlay.css:84-93`)
  - 사장님 셸(`owner-compact-shell.css`)
- **같은 결함의 하단 쪽은 이미 고쳤다:** `276c0a97f`(2026-07-28)에서 하단만 `navigationBars|displayCutout` 으로 바꿨고, 좌·우는 "legacy" 로 남겼다. 이후 이 파일 변경은 없다.

### "일부 기기"인 이유

다음 두 조건을 모두 만족하는 폰에서만 생긴다.
1. 제스처 내비게이션을 쓴다.
2. 제조사가 AOSP 처럼 뒤로가기 폭을 `systemGestures` 좌·우로 보고한다.

| 기기 | 실측 결과 |
|---|---|
| Samsung (3버튼) | 0 |
| **Samsung (스와이프 제스처)** | **좌우 84px = 30dp → 화면 좌우 각 84px 빈 띠 (재현 확정)** |
| Xiaomi HyperOS (제스처) | 0 |
| Owner Nothing (순정에 가까운 Android 16) | 빈 띠 발생 (Owner 캡처) |

Samsung 3버튼 → 제스처 전환만으로 결함이 생기고, 빈 띠 폭 = 로그 값 = AOSP 기본 뒤로가기 폭. 원인은 **실기기로 확정**이다.

### 수치 대조와 남은 증명

- Owner 캡처의 빈 띠는 화면 폭의 6.4% 이다.
  - CSS 폭이 약 470 이면 30dp(배율 1.00)와 일치한다.
  - Owner 폰의 표시 크기(밀도) 설정을 몰라 dp 값은 **NOT_PROVEN** 이다.
- 확정 증거를 얻는 방법은 둘 중 하나다. 둘 다 Owner 조작이 필요하다.
  1. Owner Nothing 폰을 USB 로 연결하면 작업자가 `adb logcat -s DIBAY_SafeArea` 로 `left/right` 를 읽는다.
  2. Samsung 을 설정 → 디스플레이 → 내비게이션 바 → 「스와이프 제스처」로 바꾸면 같은 로그·캡처로 재현한다(작업자는 기기 시스템 설정을 바꾸지 않음).
- 에뮬레이터 재현은 할 수 없다. 이 Mac 에 AVD·시스템 이미지·APK 가 없다.

### 설계안 A1 (Android 네이티브만)

| 항목 | 내용 |
|---|---|
| 바꾸는 것 | `DibayWebSafeAreaBridge.java` 좌·우 마스크를 `systemBars() \| displayCutout()` 으로 바꿈 (`systemGestures` 제거). 상단 마스크는 범위 밖이라 그대로 |
| 결과 | 제스처 모드 폰에서 `--dibay-safe-left/right = 0` → 화면 끝까지 채움 |
| 유지되는 것 | 가로 모드 노치(`displayCutout`)·옆에 붙는 3버튼 바(`systemBars`) 여백 |
| 영향 화면 | `--safe-left/right` 를 쓰는 셸·하단 탭·헤더·시트·사장님 셸 전부 (값이 0 이 될 뿐 코드는 그대로) |
| 위험 | 화면 가장자리에서 시작하는 가로 스와이프(사진 넘기기 등)가 뒤로가기와 겹칠 수 있음. 지금 Samsung·Xiaomi 사용자는 이미 이 상태 |
| 배포 구분 | **네이티브** — Android 재빌드·재설치 필요. 웹만으로는 고칠 수 없음 (값을 네이티브가 넣음) |
| 검증 | 제스처 기기에서 수정 전·후 `DIBAY_SafeArea left/right` 로그 + 캡처 좌우 끝 픽셀, 가로 모드 노치 쪽 여백 유지 |

## 3. 구조 결함 2 — 넓은 화면(태블릿 가로·Mac·Windows) 좌우 빈 띠 (웹)

### 원인 (코드 확정)

같은 화면 안에서도 폭 기준이 따로따로다.

| 층 | 정의 | 폭 |
|---|---|---|
| 셸 본문 열 | `lib/ui/app-content-layout.ts:12` `APP_MAIN_COLUMN_MAX_WIDTH_CLASS`, `ConditionalAppShell` 이 모든 본문에 적용 | 42→46→52→60→**66rem(1056)** |
| 열 복사 계산 (CSS) | `app-bottom-nav.css:101/120/127`, `messenger-home-bottom-sheet.css:73/84/90`, `app-desktop-side-nav.css:74-98` — 같은 rem 단계를 손으로 다시 적음 | 위와 같음 |
| 화면 자체 폭 | 배달 `max-w-[768px]`(파일 12곳, 27줄), 내정보 `MYPAGE_COLUMN_MAX_WIDTH_CLASS` 40rem(6파일)·`PROFILE_EDIT_BODY_CLASS`(2), 고객센터 `CUSTOMER_CENTER_READING_COLUMN_CLASS`, 이벤트 720px(3), 매장 신청 42rem, 메신저 타임라인 760px | 600~768 |
| 하단 탭 | `app-bottom-nav.css` 계약 "viewport 전폭". 메신저 분할만 목록 칸 | 화면 전체 |
| 1단 헤더 | 화면마다 다름: HOME 은 본문 열 안, LOUNGE·MY 는 화면 전체 | 섞임 |

- 메신저 분할은 `isDesktopSideRail` 일 때만 열 제한에서 빠진다. 그래서 태블릿·Mac(하단 탭)은 메신저도 832/1056 열에 갇힌다.
- Mac 앱은 iPad 앱(`userInterfaceIdiom=pad` → `TABLET_IPAD`)이라 Windows 와 달리 하단 탭이고, 77% 배율이다.

### 승인된 설계와의 충돌 (규정 7 — 고르지 않고 보고)

| 기존 결정 | 문서 | 이번 지시와의 관계 |
|---|---|---|
| 커뮤니티·거래 본문 1056 열 "읽기 폭 계약 — 현행 유지" | `windows-desktop-shell-rail-design-2026-11-07.md:24`, `messenger-desktop-wide-design-2026-11-07.md:75` | 정면 충돌 |
| 배달 `max-w-[768px]` (배민 미러링, 2026-10-30 `277b8ab95`) | 같은 문서 :24 | 충돌 |
| 내정보 본문 1열 40rem (최종 설계 §1.8) | `lib/ui/mypage-responsive-breakpoints.ts:45` | 충돌 |
| 데스크톱 헤더 안쪽을 본문 열에 맞춤(R7) | `windows-desktop-shell-rail-design` R7 | 열을 없애면 함께 바뀜 |

### 설계안 B (웹만, 빌드 없음) — 한 PR, 세 단계를 한 번에 반영

어느 단계에서 멈춰도 화면이 깨지지 않도록, B1·B2 는 같은 반영에 묶는다.

**B1 셸 폭 단일화**
- `APP_MAIN_COLUMN_MAX_WIDTH_CLASS` 를 폭 제한 없음(`max-w-none`)으로 바꾼다. 이 토큰 하나를 54개 파일(헤더 안쪽·하단 고정 바·시트 열·내정보 하위·거래 글쓰기)이 함께 쓰므로 정렬은 같이 움직인다.
- 손으로 복사한 rem 계산 3곳(`app-bottom-nav.css`·`messenger-home-bottom-sheet.css`·`app-desktop-side-nav.css`)을 같은 PR 에서 0 기준으로 바꾼다. 이 계산이 남으면 메신저 하단 탭·시트가 87px 어긋난다.
- 메신저 분할 열 해제 조건을 `isDesktopSideRail` → **"분할이 켜지는 폭(≥768)이면 기기 무관"** 으로 넓힌다. 그러면 태블릿 가로·Mac 도 목록 | 대화방이 창 전체를 쓴다.
- 휴대폰: 화면이 42rem(672)보다 좁아 원래 제한이 없었으므로 변화 없음.

**B2 하단 탭 5개 허브 넓은 배치 (B1 과 같은 PR)** — 열만 풀면 사진·카드가 창 폭만큼 커지므로 함께 정한다.

| 허브 | 넓은 화면 배치 |
|---|---|
| HOME | 서비스 입구 카드는 창 폭으로. "지금 우리 동네" 피드는 격자(`repeat(auto-fill, minmax(320px,1fr))`). 배너는 높이 고정 |
| LOUNGE (정보 공유·마켓·모임) | 피드 격자. 거래 목록은 기존 `lg:grid-cols-4` 를 auto-fill 로 확장 |
| DIPICK | `max-w-[768px]` 12곳 해제, 카테고리 격자 auto-fill, 배너는 높이 고정 |
| telRING | B1 의 분할 조건 확장만 (목록 칸 폭 계약 `clamp(360,35vw,470)` 유지) |
| MY | 40rem 1열 해제 → 카드 2열 격자 |

**B3 하위 화면 (상세·글쓰기·설정·주문 내역·이벤트)**
- 배경·헤더·구분선은 창 끝까지 깐다(빈 띠 없음).
- 글 내용의 한 줄 최대 폭을 둘지는 **Owner 결정 필요**. 계약에도 Owner 지시에도 값이 없다. 정하지 않으면 B3 는 배경만 넓히고, 내용 폭은 지금 값을 유지한다.

**바꾸지 않는 것**: 떠 있는 시트·팝업 폭(32rem·520px·560px — 화면 위에 뜨는 창이지 화면 폭이 아님), 휴대폰 화면, 통화 화면(통화 규정 — 이번 범위 밖).

| 항목 | 내용 |
|---|---|
| 배포 구분 | **웹** (main 반영 후 앱 재시작) |
| 검증 행렬 | Xiaomi 가로 · Mac 앱(1024/1709pt) · 휴대폰 세로(Samsung) 각각 하단 탭 5개 + 메신저 방 + 상품 상세·글쓰기 캡처. 판정은 좌우 끝 픽셀까지 배경 연속 + 헤더·본문·하단 탭 좌우 끝 일치. Windows 는 Owner Windows 노트북에서만 판정 가능 |

## 4. 남은 NOT_PROVEN

- Owner Nothing 폰의 실제 `left/right` 값 숫자 (원인은 Samsung 제스처 재현으로 확정, 그 폰의 dp 값만 미측정)
- Windows 앱 실화면
- iPhone·iPad 실기

## 5. 구현 (Owner 2026-11-16 「둘 다 진행」, 브랜치 `fix/horizontal-fill`)

| 항목 | 바꾼 것 |
|---|---|
| A1 | `DibayWebSafeAreaBridge.java` — 좌·우 = `systemBars \| displayCutout` (`SIDE_LAYOUT_INSET_TYPES`), 로그에 `side_mask` 추가. 상단·하단 그대로 |
| B1 | `APP_MAIN_COLUMN_MAX_WIDTH_CLASS = "max-w-none"` · 하단 탭 메신저 분할 `left: 0`+폭에 safe-left · 메신저 홈 시트 `left: safe-left` · lg/xl 복사 계산 삭제 · 데스크톱 헤더 열 맞춤(D2) 폐지 · 말풍선 760 해제를 분할 화면(≥768) 전 기기로 · 라운지·마켓 자체 66rem 해제 · 1단 헤더 행 768 해제 |
| B2 | 홈 「지금 우리 동네」 ≥768 2열·xl 3열 격자(매장 칸 한 줄) · 거래 격자 xl 5열·2xl 6열 · DIPICK 본문·헤더·메뉴판 768 해제(광고·히어로 배너만 `STORES_HOME_BANNER_MAX_CLASS` 768 — 업로드 비율 계약 유지) · MY 홈 40rem 해제 + ≥768 2열 |
| B3 | 하위 화면은 B1 으로 배경·헤더가 창 전체 폭. 내용 폭(내정보 하위 40rem·배달 하위 42rem·이벤트 720)은 Owner 결정 전이라 유지 |
| 손대지 않음 | 정보 공유 피드 목록(다른 세션 「정보 공유 게시판 빈공간 결함」 작업 중 — 목록은 창 폭 행으로 넓어짐), 사장님 셸(`owner-compact-shell`), 어드민, 떠 있는 시트·팝업, 통화 |
| 배포 구분 | 웹 + 네이티브(Android) — 웹은 main 반영 후 앱 재시작, A1 은 다음 Android 빌드 설치 후 |

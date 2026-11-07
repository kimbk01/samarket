# DIBAY Windows 데스크톱 셸 (W0)

- 설계: `docs/audit/windows-desktop-shell-design-2026-11-07.md`
- 구성: .NET 8 + WinUI 3 (Windows App SDK 1.6) + WebView2. 단일 프로젝트 MSIX.
- 하는 일 (W0):
  - 운영 웹을 창 1개로 연다.
  - 창 위치·크기를 기억한다.
  - 앱 밖 주소는 기본 브라우저로 연다.
  - 웹의 `app.info` 메시지에 버전을 답한다.
- 하지 않는 일:
  - 로그인 복귀(`dibay://`, W2)
  - Windows 알림(WNS, W3)
  - 통화(W4, 동결)
  - Store 링크(W5)
- 신원(Identity)·표시 이름은 **시험용**(`DibayDesktop.Dev`, `DIBAY (dev)`)이다. Store 이름 예약 뒤 실제 값으로 바꾼다.

## 빌드·설치 (Windows 노트북 — Mac 에서는 빌드할 수 없다)

1. **Visual Studio 2022** 를 설치한다. 아래 두 작업을 체크한다.
   - 「.NET 데스크톱 개발」
   - 「WinUI 애플리케이션 개발」 — 또는 개별 구성 요소 「Windows App SDK C# 템플릿」
2. Windows 설정 → 시스템 → 개발자용 → **개발자 모드** 를 켠다. 서명 안 된 시험 패키지를 설치하려면 필요하다.
3. 이 저장소에서 `windows/DibayDesktop/DibayDesktop.csproj` 를 연다.
4. 위쪽 도구 모음에서 다음을 고른다.
   - 구성 `Debug`
   - 플랫폼 `x64`
   - 실행 대상 `DibayDesktop (Package)`
5. **F5** 를 누른다. 빌드 → 패키지 설치 → 실행까지 한 번에 된다. 시작 메뉴에도 「DIBAY (dev)」가 생긴다.

## W0 확인 항목

| # | 항목 | 기대 |
|---|---|---|
| 1 | 첫 실행 | 1280×820 창, 운영 웹(로그인 화면 또는 홈) |
| 2 | 창 크기·위치 바꾸고 닫았다 다시 열기 | 같은 위치·크기 |
| 3 | 카카오·Apple 로그인 | 앱 창 안에서 로그인 후 홈 |
| 4 | Google 로그인 | **실패 예상** (Google 정책: 앱 안 로그인 금지) — W2 에서 해결 |
| 5 | 왼쪽 레일·메신저 3단·거래·배달 | 크롬 PC 와 같음 |
| 6 | 외부 링크(다른 사이트) | 기본 브라우저로 열림, 앱 창은 그대로 |
| 7 | 웹이 셸을 알아봄 | 화면 최상위 `.app-shell` 에 `data-dibay-host-shell="windows"` (개발자 도구 F12 — Debug 빌드만) |

## 버전

`Package.appxmanifest` 의 `Version` 은 설치·배포용 빌드를 만들 때만 올린다.
`docs/native-build-release-process.md` 에 Windows 줄을 넣는 것은 W1 이다.

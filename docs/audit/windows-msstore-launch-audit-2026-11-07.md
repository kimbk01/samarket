# DIBAY Windows (Microsoft Store) 출시 — 재감사·준비 상태·UI 수정안 (2026-11-07 PHT)

> 작성: Claude. Cursor 인수인계는 근거로 쓰지 않았고, 아래 판정은 모두 직접 확인한 증거로만 내렸다.
> 판정은 PASS / FAIL / NOT_PROVEN(확인 못 함) 세 가지다.
> 확인 조건:
> - 코드: `origin/main` `5ed73f999` (17:19 PHT)
> - 운영: `https://samarket.vercel.app` 에 curl. 배포된 SHA 는 확인하지 않았다(NOT_PROVEN).
> - 화면: Mac 의 Claude 내장 브라우저, **비로그인**, 1280×800 / 420×760
> - 정책: Microsoft Learn 원문 (Store Policies v7.20 2026-09-14, 계정 FAQ, 계정 개설 문서)
> - 코드·DB·설정은 바꾸지 않았다. 커밋·푸시·Partner Center 조작도 없다.

## 0. 인수인계 정정 (Cursor 문서와 다른 점)
| 인수인계 내용 | 직접 확인한 결과 | 판정 |
|---|---|---|
| 「창이 닫혀 있어도 Web Push 를 구독했으면 OS 알림이 온다」 | 운영 `/api/me/push/vapid-key` 응답이 `{"publicKey":null,"web_push_enabled":false}` 다. **운영에서 Web Push 가 꺼져 있어** Windows PWA 는 창을 닫으면 알림이 0건이다. 창이 열려 있어도 웹 푸시 구독 자체가 안 된다. | **FAIL** |
| 「Partner Center 회사 계정이 필요하다」 | 맞다. 하지만 **사업자가 없으면 회사 계정을 만들 수 없다**는 점을 다루지 않았다(1절). | 보완 필요 |
| 「PWA → WebView2 를 같은 상품으로 업데이트할 가능성이 높다」 | 공식 문서 근거가 없다. 계정 사이 앱 이전 문서도 없다. | NOT_PROVEN |
| 기준 main `ac130094c` | 현재 main 은 `5ed73f999`. Windows 관련 파일은 바뀌지 않았다. | 정정 |
| C-1 매니페스트 `id` 없음 | 운영 매니페스트에 `id` 가 없다. | 사실 |
| C-2 비로그인 `/sw.js` 가 307 | 운영에서 307 → `/login?reason=auth_required` 로 간다. `proxy.ts` 공개 확장자 목록에 `.js` 가 없다. | 사실 (FAIL) |

## 1. 사업자 문제 — 가장 먼저 정해야 할 것
### 1-1. 공식 원문 (직접 확인)
- 계정 FAQ: **게시자 표시 이름(publisher display name)·계정 유형(account type)·국가/지역(country/region)은 등록 후 바꿀 수 없다.** 리브랜딩 같은 큰 변경은 지원팀에 문의해야 하고, 새 계정을 만들라는 요구를 받을 수 있다.
  - 근거: learn.microsoft.com/windows/apps/publish/faq/manage-your-account
- 정책 10.14: 단체·사업자, 그리고 **자기 사업·직업과 관련해 활동하는 개인은 회사(Company) 계정**을 써야 한다. 개인 계정은 혼자 일하는 개발자에게 적합하다. 소비자가 앱 이름이나 게시자 이름을 사업체로 받아들일 만하면 회사 계정이 필요하다.
- 회사 계정 개설 조건:
  - 사업 인증: D-U-N-S 번호 또는 공식 사업 서류
  - 회사 도메인의 업무 이메일 (Gmail·Yahoo 불가)
  - 필수 실사(due diligence)
  - 등록비는 개인·회사 모두 없다.
  - 근거: …/partner-center/open-a-developer-account
- 개인 계정을 회사 계정으로 바꾸는 방법은 없다(유형 변경 불가). 계정 사이 앱 이전은 공식 절차 문서가 없고, Microsoft 직원 답변은 「지원 티켓으로 문의」뿐이다 → NOT_PROVEN.

### 1-2. Owner 상황에 대입한 판정
- Owner 상황: 한국 국적, 필리핀 거주, 사업자 없음, 필리핀에서 사업자 낼 예정. DIBAY 는 매장 수수료·광고·포인트 판매로 수익을 내는 사업이고, 이름 「DIBAY」도 브랜드다.
- 정책 10.14 대상: **회사 계정 대상**이다. 개인 계정으로 내면 정책 위반 소지가 있다.
- 지금 할 수 있는 것: 사업자가 없어 회사 계정은 **지금 만들 수 없다.**
- 개인 계정으로 먼저 내면: 유형·국가·게시자 이름을 바꿀 수 없고 이전 절차도 확인되지 않았다. 사업자를 낸 뒤 **새 계정·새 상품을 다시 만들게 된다.** 사용자 재설치와 기존 리뷰·순위 소멸이 따른다. Apple 에서 겪은 재생성과 같은 결과다.
- **결론: Microsoft 계정은 필리핀 사업자 등록 뒤에 회사 계정으로 한 번만 만든다.** 그 전에는 Partner Center 에 가입하지 않는다(이름 예약도 하지 않는다).
- 회사 계정에 들어갈 값: 국가 = 필리핀, 게시자 표시 이름 = 사업자 등록상의 이름 또는 그와 맞는 브랜드명. 셋 다 영구 값이다.
- 외국인이 필리핀에서 어떤 형태(SEC 법인 등)로 사업자를 낼 수 있는지, 그리고 D-U-N-S 발급은 이번 감사에서 확인하지 않았다 → NOT_PROVEN. 현지 전문가 확인이 필요하다.

### 1-3. 세 스토어 사이의 일관성 (Owner 결정 필요 · 충돌 보고)
| 스토어 | 현재 | 사업자를 낸 뒤 |
|---|---|---|
| Apple | 새 **개인** 계정(필리핀 주소)으로 출시 결정 (`docs/audit/ios-new-developer-account-transition-plan-2026-11-07.md`) | Apple 은 출시 후 조직 계정으로 **앱 이전 절차가 공식 문서에 있다** → 개인으로 먼저 출시해도 길이 있다 |
| Google Play | 비공개 테스트 중. 계정 유형은 이번에 확인하지 못했다 | NOT_PROVEN |
| Microsoft | 계정 없음 | **이전 절차가 공식 문서에 없다** → 처음부터 회사 계정으로 만든다 |

- 세 스토어의 게시자 이름은 같은 사업체 이름으로 맞추는 것을 권고한다.
- 회사 계정 업무 이메일에는 **회사 도메인**이 필요하다.

### 1-4. 도메인 (정책 10.1.1 · 직접 조회)
- 정책 10.1.1: 웹앱은 그 도메인의 소유자가 게시해야 한다.
- 지금 운영 주소 `samarket.vercel.app` 은 Vercel 의 하위 도메인이다. PWA 의 시작 주소가 되므로, **첫 패키지를 내기 전에 회사 도메인으로 운영 주소를 옮기는 것**이 맞다. 주소를 나중에 바꾸면 PWA 패키지를 다시 내야 하고 로그인 저장소도 달라진다.
- DNS 조회 결과 (11-07):
  - `dibay.app`: 레코드 없음
  - `dibay.com`: 판매 중인 주차 도메인(afternic)
  - `dibay.ph`·`dibay.com.ph`: 같은 IP(162.4.84.242)로 연결됨. **소유자는 확인하지 못했다(NOT_PROVEN).**

## 2. 앱 구조 — Android·iOS·Windows 를 나누는 방식
### 2-1. 현재 (코드 확인)
- Android·iOS: Capacitor 셸(`capacitor.config.ts`, `appId com.dibay.app`, `appName DIBAY`)이 운영 웹을 띄운다.
- 네이티브 영역: 푸시 FCM/APNs·VoIP, CallKit
- Windows: 전용 코드가 없다. 웹에서 `DESKTOP_WINDOWS` 기기 분류만 있다(`lib/device/dibay-device-class.ts:140`). 실제 Windows 동작은 NOT_PROVEN.
- 서버가 아는 플랫폼은 `web`·`pwa`·`android`·`ios` 뿐이다(`app/api/me/push/subscribe/route.ts:12`). `windows` 는 없다.

### 2-2. 카톡·텔레그램 같은 PC 앱이 되려면
- PWA(Edge 창)로 되는 것:
  - 시작 메뉴 등록
  - 독립 창으로 실행
- PWA 로 안 되는 것 (트레이 상주·자동 시작·통화 수신벨): 패키지에 들어간 데스크톱(full-trust) 앱이 필요하다.
  - 자동 시작: MSIX `windows.startupTask` 확장으로 된다. 사용자가 꺼도 된다. 공식 문서로 확인했다.
  - `runFullTrust`: 제한 기능이라 제출할 때 사용 사유를 적고 승인받아야 한다.
  - 트레이 아이콘을 허용하는지 명시한 문서는 찾지 못했다 → NOT_PROVEN.
- 제품 유형은 이름 예약 때 정하며 나중에 바꿀 수 없다.
  - **「MSIX or PWA app」을 선택한다.** Store 가 무료로 서명해 준다.
  - 「EXE or MSI」는 유료 코드서명 인증서가 필요하고 상품도 따로 만들어야 한다.

### 2-3. 권고 구조 (계정이 사업자 뒤로 밀렸으므로 순서를 바꾼다)
- 인수인계의 「PWA 먼저 → WebView2 로 교체」는 다음 위험이 있다.
  - 같은 상품으로 업데이트가 되는지 NOT_PROVEN
  - 사용자가 다시 로그인해야 함
  - Edge 웹푸시와 알림이 겹칠 수 있음
- 어차피 계정은 사업자를 낸 뒤에 만들 수 있다. 그래서 **첫 제출부터 WebView2 데스크톱 셸(MSIX, Capacitor 셸과 같은 역할)로 내는 것**을 권고한다. 그러면 PWA → 셸 전환 위험이 처음부터 없다.
- 셸에 필요한 변경 (각각 별도 승인 대상):
  1. 최상위 `windows/` 폴더. 웹 공통 코드는 복제하지 않는다.
  2. 알림: WNS 발송 경로 + `user_devices.platform` 에 `windows` 추가 (DB·알림·통화 규정 적용)
  3. Google 로그인: WebView2 안에서는 막힌다(Google 정책 disallowed_useragent). 시스템 브라우저로 로그인하고 앱으로 돌아오는 방식으로 바꿔야 한다 (인증 계약 변경).
  4. 웹 쪽 판정: 기존 어댑터에 `windows-shell` 어댑터를 추가한다.
- 셸이 늦어질 경우의 대안: PWA 로 먼저 출시한다. 단, 셸로 바꿀 때 같은 상품으로 업데이트되는지는 NOT_PROVEN 이라는 점을 감수해야 한다.

## 3. 준비·구현 여부 (직접 확인)
| 항목 | 상태 | 증거 |
|---|---|---|
| 매니페스트 필수 항목(name·short_name·start_url·icons) | PASS | 운영 `/manifest.webmanifest` 200 |
| 매니페스트 `id` | 없음 | 같은 응답 |
| 아이콘 | 512·180 PNG(RGB, 투명 배경 없음), purpose `any` 만 있음 | 운영 다운로드 후 `file` 명령 |
| `/sw.js` 비로그인 | **FAIL** 307 | curl |
| 운영 Web Push | **꺼짐** (VAPID 키 없음) | `/api/me/push/vapid-key` |
| `/privacy`·`/terms` 비로그인 | PASS 200 | curl |
| `windows` 플랫폼(푸시·기기·업데이트 내역) | 없음 | `subscribe/route.ts:12`, `lib/app-releases/app-release-sources.ts` (android 만) |
| 스토어 링크 | Play 만 있음. App Store·Microsoft Store 링크 없음 | `components/app-updates/AppUpdateHistoryClient.tsx:14` |
| 포인트 구매(웹) | 계좌이체·수동 확인. 정책 10.8.1 은 게임이 아닌 PC 앱의 제3자 결제를 허용한다 → 정책상 가능. 심사 결과는 NOT_PROVEN | `components/points/PointChargeForm.tsx` |
| 사용자 게시물 정책(11.12: 약관·가이드라인, 앱 안 신고, 삭제 요청 응대) | 웹 화면에서 확인하지 못함 | NOT_PROVEN |
| IARC 등급, 개인정보 URL(10.5.1) | 제출할 때 입력 | — |
| Windows 실제 동작(로그인·메신저·통화·배달) | 시험 안 함 | NOT_PROVEN |

## 4. 데스크톱 화면 UI·UX·CTA 감사 (비로그인 · Mac 내장 브라우저 · Owner 화면 아님)
| # | 결함 | 증거 | 수정안 |
|---|---|---|---|
| U-1 | 하단 탭바 5칸이 1280 폭 전체에 퍼진다(칸마다 252px). PC 앱이 아니라 늘어난 휴대폰 화면처럼 보인다. | `nav[주요 메뉴]` 0,740 1280×60 | 데스크톱(`shell-family=DESKTOP`)에서는 왼쪽 세로 내비(카톡 PC형)로 바꾼다. **현재 설계 `docs/dibay-device-fd4-app-shell-navigation-hard-lock.md` 는 「데스크톱 사이드 내비 금지·2단 화면 미적용」으로 잠겨 있어, Owner 지시와 충돌한다 → Owner 결정 필요** |
| U-2 | 탭마다 본문 폭이 다르다. 커뮤니티는 카드 폭 1024, 거래는 4열 그리드(약 1050), 배달은 더 좁은 가운데 칼럼. | 측정값·캡처 | 데스크톱 본문 최대폭 토큰 1개를 `design-tokens.css` 에 두고 모든 탭에 적용한다 |
| U-3 | 커뮤니티 헤더 제목은 화면 왼쪽 끝에 붙고 본문은 가운데에 있어 정렬이 어긋난다. | 1280 캡처 | 헤더 안쪽 폭을 본문 폭과 같게 맞춘다 |
| U-4 | 앱 이름이 4가지로 표기된다: `dibaY`(매니페스트·탭 제목), `DIBAY`(Capacitor), `DIBAY MARKET`(거래 헤더), `DiBaY - 디바이`(App Store) | 코드·화면 | Store 이름 예약(영구 값) 전에 표기 하나를 Owner 가 정하고 모든 곳을 맞춘다 |
| U-5 | 「Windows 앱 받기」 설치·다운로드 CTA 가 없다. 앱 업데이트 내역은 Play 링크만 있다. | grep | 세 스토어 링크를 한 곳(`app-release-sources`)에서 관리하고, 기기에 맞는 스토어 링크 하나만 보여준다 |
| U-6 | 알림 켜기 버튼을 누르면 운영 Web Push 가 꺼져 있어 「VAPID 없음」 오류 문구가 나오는 코드 경로가 있다 (`WebPushSettingsRow.tsx`) | 코드 경로. 로그인 화면은 보지 못함 → NOT_PROVEN | Windows 알림 방식(셸 WNS 또는 Web Push 켜기)을 정한 뒤 문구·버튼을 정리한다. 기능이 꺼져 있으면 버튼을 숨긴다 |
| U-7 | 로그인 카드(Google·카카오·Apple)는 데스크톱 가운데에 정상 표시된다. 배달은 비로그인일 때 「로그인/회원가입」 CTA 가 있다. | 캡처 | 이상 없음. 단 셸에서는 Google 버튼이 시스템 브라우저로 가야 한다(2-3) |
| U-8 | Windows 좁은 창·실제 Windows 화면 | 확인 못 함 | NOT_PROVEN — 노트북에서 확인 |

## 5. 순서 (다시 만드는 일이 없게)
1. **Owner**: 필리핀 사업자 형태 결정·등록. 회사 도메인 확보 (`dibay.ph` 소유자 확인 포함). 업무 이메일. D-U-N-S.
2. **Owner**: 앱·게시자 이름 표기 하나로 확정 (U-4).
3. **작업자 (승인 후)**:
   - C-1·C-2 수정
   - 운영 주소를 회사 도메인으로 이전 설계
   - Windows 셸 설계서 (통화·알림·인증 규정 문서 형식)
   - U-1~U-6 설계
4. **Owner**: Partner Center **회사** 계정 — 국가 필리핀, 게시자 이름 확정값 → 이름 예약 (유형 「MSIX or PWA app」) → 식별자 발급.
5. 노트북에서 셸(또는 PWA) 시험 → 승인 → Store 제출.

노트북은 4번 이전에도 쓸 수 있다. 시험 식별자로 셸이나 PWA 를 시험할 수 있지만, 필요할 때 승인을 받아 진행한다.

## 6. 진행 기록 (2026-11-07)
- 순서 3번 작업자 몫:
  - C-1·C-2 완료.
  - U-1(왼쪽 레일)·U-2·U-3(헤더·본문 정렬) 완료. PC 메신저 3단·말풍선 폭·방 진입 깜빡임도 완료.
    - 정정 (2026-11-08 후속 감사 B-14): U-2 는 **배달 탭 제외**로 완료다. 배달 탭은 768px 단일 상수(`STORES_HOME_CONTENT_COLUMN_CLASS`, 광고 위치 계약·S3-07 테스트가 의존)를 유지했고(레일 설계 R8), 넓힐지는 Owner 결정으로 남아 있다. 내정보 하위 화면 본문 40rem 은 내정보 설계 §1.8 계약이라 U-2 대상이 아니다.
  - **Windows 셸 설계서 작성** → `docs/audit/windows-desktop-shell-design-2026-11-07.md` (W0~W5, U-5·U-6 포함, 구현 0건).
- 남은 것:
  - 순서 1·2·4번(Owner)
  - 도메인 이전 설계(도메인 확정 후)
  - 설계서 단계별 승인

# 구글(Firebase Analytics)·틱톡 측정 부품 추가 — 설계 (2026-11-27 19:4x PHT)

상태: **설계만. 구현·빌드·출시 안 함. Owner 승인 전.**
목적: 유튜브(구글)·틱톡 「앱 설치」 광고가 설치를 세고 설치할 사람에게 노출되게 한다. Meta SDK(`docs/audit/meta-android-sdk-design-2026-11-27.md`, PR #667·#669)와 **한 번에 출시**(Owner 「출시 한번에」).
범위: Android·iOS 둘 다(Owner 「apk·ios 모두, 빼고 하지 말 것」).

## 1. 왜 필요한가 (공식 문서 확인)
| 회사 | 문서 문장 | 출처 |
|---|---|---|
| 구글 | 앱 캠페인 자격: 「Google Analytics for Firebase 또는 측정 파트너(MMP) 연동이 있어야 함」 | [About App campaigns](https://support.google.com/google-ads/answer/6247380) |
| 틱톡 | 「App Events SDK 를 쓰려면 TikTok 광고 계정과 TikTok App ID 가 필요」, 자동 기록 = 설치·실행·2일 재방문 | [How to integrate TikTok App Events SDK](https://ads.tiktok.com/resources/help/article/how-to-integrate-tiktok-app-events-sdk?lang=en) |

## 2. 준비 완료 (11-27 확인)
- 구글: Google Ads 197-238-6445 · Firebase `dibay-fffcd` (Google Analytics 사용 설정됨) · iOS 앱 `com.dibay.ph` 등록 · GA↔Ads 링크 생성 · Ads↔Play 승인.
- 틱톡: 광고 계정 DIBAY_adv · 이벤트 관리자 앱 2개(Android TikTok App ID 7712798538740023302 / iOS 7712800978390515713).
- 비밀값 위치(저장소 밖): `android/app/google-services.json`(기존, gitignore) · `ios/App/App/GoogleService-Info.plist`(새, git 제외) · `android/local.properties`(TIKTOK_*_ANDROID) · `ios/App/App/TikTok.local.xcconfig`(git 제외).

## 3. 버전 선택 (직접 확인)
| 부품 | 버전 | 이유 |
|---|---|---|
| Android `firebase-analytics` | **22.3.0** | 최신(24.0.0)·BoM(35.2.0)은 `firebase-messaging` 을 26.x 로 올림 → **통화 수신(FCM) 경로 변경 = 통화 규정 위반**. 현재 `firebase-messaging 24.1.0` 이 들어간 마지막 BoM 33.10.0 의 analytics = 22.3.0 → 같은 세대로 고정, 메시징은 **그대로** |
| Android TikTok | `com.github.tiktok:tiktok-business-android-sdk:1.7.1` (jitpack) + TikTok 안내 의존성(lifecycle-process·lifecycle-common-java8·installreferrer 2.2) | GitHub 최신 릴리스 1.7.1(2026-09-01), jitpack 빌드 OK 확인 |
| iOS Firebase | SPM `firebase-ios-sdk` **13.2.0** · `FirebaseAnalytics` | 최신 태그. swift-tools 6.2(=Xcode 26) — CI Xcode 26.3 과 맞음(19.x Meta 사고 재발 방지: CI 로 재확인) |
| iOS TikTok | SPM `tiktok-business-ios-sdk` **1.7.2** · `TikTokBusinessSDK` | 최신 릴리스, 소스(Obj-C) 패키지라 Xcode 버전 영향 적음 |

## 4. 바꾸는 것
| # | 파일 | 변경 |
|---|---|---|
| A1 | `android/build.gradle` | repositories 에 `maven { url 'https://jitpack.io' }` (틱톡 안내) |
| A2 | `android/app/build.gradle` | `firebase-analytics:22.3.0`, 틱톡 SDK·의존성, TikTok App ID·Secret `resValue`(local.properties, 값 없으면 빈 값) |
| A3 | `DibayApplication.onCreate` | 틱톡 `TikTokBusinessSdk.initializeSdk(new TTConfig(ctx, secret).setAppId("com.dibay.app").setTTAppId(id))` — **ID 가 비면 호출 안 함**(SDK 도 빈 ID 면 반환). Firebase Analytics 는 기존 google-services 자동 초기화로 동작(코드 없음) |
| I1 | `project.pbxproj` | SPM 2개 추가(Meta 와 같은 방식) |
| I2 | `AppDelegate` | `GoogleService-Info.plist` 가 앱 안에 **있을 때만** `FirebaseApp.configure()` (CI 처럼 파일이 없으면 생략 — 없을 때 호출하면 앱이 멈춤). 틱톡 `TikTokBusiness.initializeSdk(TikTokConfig(accessToken:appId:"6831952401",tiktokAppId:))` — 값 없으면 생략 |
| I3 | `facebook.xcconfig` 와 같은 방식으로 `tiktok.xcconfig`(+ `.example`), Info.plist 에 `$(TIKTOK_APP_ID_IOS)` 등 |
| I4 | `ios/.gitignore`·`android/.gitignore` | 새 로컬 파일 등록 |
| V | 빌드 번호 | Android 88 · iOS 68 (설치·배포용 빌드 때 1회) |

웹 코드 변경 없음. 통화·알림 코드·`firebase-messaging` 버전 **변경 없음**.

## 5. 영향과 처리
| 영향 | 처리 |
|---|---|
| 앱 시작: 부품 3개(Meta·Firebase·TikTok)가 시작 때 초기화 | 같은 시험폰에서 85/87/88 시작 시간 비교, 느려지면 출시 안 함 |
| TikTok SDK 가 앱 전체 「예외 처리기」를 감쌈(기존 처리기로 넘김 — 소스 확인) | 통화·알림 앱 동작 회귀 확인(앱 정상 실행·알림 1건) |
| TikTok SDK 자체 충돌 수집(TTSDKCrash) 포함 | 개인정보 문안에 반영 |
| 새 권한 | 빌드 후 병합 매니페스트로 실측 보고 |
| 개인정보 | 방침 공지형 개정 1회 더(구글·틱톡 추가) — 문안은 구현 PR 때 |
| Play 데이터 보안·App Store 개인정보 | Meta·구글·틱톡 함께 1회 갱신(Owner 확인) |
| jitpack 저장소 추가 | 틱톡 공식 안내 방식. 버전 고정(1.7.1) |
| iOS `GoogleService-Info.plist` 의 `IS_ANALYTICS_ENABLED=false` | 실제 수집에 영향 있는지 실기에서 Firebase DebugView 로 확인 |

## 6. 확인 (출시 전)
1. 로컬 빌드: Android·iOS, CI(main) 통과.
2. 시험폰: Meta 이벤트 관리자 · Firebase(DebugView/실시간) · TikTok 이벤트 관리자(테스트 이벤트)에 설치·실행 도착.
3. 시작 시간 비교, 기존 기능(로그인·채팅·알림) 이상 없음.

## 7. 롤백
- 코드 PR 되돌리기 + 다음 빌드. 서버 쪽: Meta 이벤트 관리자 자동 기록 끄기, TikTok 이벤트 관리자 앱 연결 해제, Firebase Analytics 수집 중지.

## 8. Owner 결정 필요
1. 이 설계 승인.
2. Android `firebase-analytics` 를 최신(24.0.0)이 아닌 **22.3.0** 으로 고정(통화 경로 보호) — 승인 시 그대로.

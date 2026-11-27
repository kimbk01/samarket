# Android 앱 Meta SDK 추가 — 설계 (2026-11-27 17:4x PHT)

상태: **설계만. 구현·빌드·출시 안 함. Owner 승인 전.**
목적: 페이스북 「앱 홍보」 광고가 **설치할 사람을 찾고(설치 최적화) 설치 수를 셀 수 있게** 한다. SDK 가 없으면 Meta 는 클릭 기준으로만 광고를 보낸다(도움말 [2083260191704068](https://www.facebook.com/business/help/2083260191704068) 원문 확인 — `docs/marketing/meta-ads-plan-v2-2026-11-27.md` §2).
범위: **Android 만.** iOS 는 별도(iOS 14+ 캠페인·SKAdNetwork 필요).

## 1. 확인한 사실 (근거)

| 항목 | 내용 | 근거 |
|---|---|---|
| 필요한 라이브러리 | `com.facebook.android:facebook-core` (Analytics 포함, 로그인·공유 없음) | [componentsdks](https://developers.facebook.com/docs/android/componentsdks) |
| 최신 버전 | **19.0.1** (2026-11-04) | Maven Central `maven-metadata.xml` 조회 |
| 함께 들어오는 것 | `facebook-bolts`, `installreferrer 2.2`, `core-ktx 1.3.2`, `kotlin-stdlib 1.8.20` 등 | 19.0.1 pom 조회 |
| Kotlin 충돌 | 없음 — 앱은 `kotlin-stdlib` 를 1.8.22 로 고정(`android/build.gradle`), SDK 요구는 1.8.20 | 위 pom · `android/variables.gradle` |
| 최소 Android | API 15 이상 → 앱 minSdk 24 로 충족 | [getting-started](https://developers.facebook.com/docs/android/getting-started) |
| 코드 없이 자동 동작 | 「앱을 열면 자동 초기화」, 자동 기록 이벤트 = **앱 설치(기기 첫 실행)·앱 실행**·인앱 구매·충돌 보고 | [getting-started](https://developers.facebook.com/docs/android/getting-started) · [자동 이벤트](https://developers.facebook.com/docs/app-events/automatic-event-collection-detail) |
| 필요한 값 | `facebook_app_id`, `facebook_client_token` (Meta 앱 등록 뒤 앱 대시보드에서 받음) | getting-started |
| 광고 ID·추가 권한 | SDK 13.0.0 부터 `AD_ID` 권한을 **자동으로 앱에 추가**. 19.0.1 AAR 매니페스트 실측: `AD_ID` + `ACCESS_ADSERVICES_ATTRIBUTION`·`ACCESS_ADSERVICES_AD_ID`·`ACCESS_ADSERVICES_CUSTOM_AUDIENCE`·`ACCESS_ADSERVICES_TOPICS` (Android 광고 측정 기능) | getting-started · AAR `AndroidManifest.xml` 직접 확인 |
| 앱 번호 없이 시작될 때 | 자동 초기화(`FacebookInitProvider.onCreate`)가 예외를 잡음 → 앱 안 멈춤 | AAR 바이트코드(javap) Exception table 직접 확인 |
| 끄는 방법 | 앱 설정 `AutoLogAppEventsEnabled=false` 또는 **이벤트 관리자에서 끄기(서버 쪽, 앱 업데이트 없이)** — 이벤트 관리자에서 끄면 코드가 켜도 꺼짐 | [gdpr-compliance](https://developers.facebook.com/docs/app-events/gdpr-compliance) |
| 한국 주의 | 「한국에서 출시하는 앱은 자동 이벤트 기록이 꺼질 수 있음」 | [getting-started-app-events-android](https://developers.facebook.com/docs/app-events/getting-started-app-events-android) |
| 도착 확인 방법 | App Ads Helper → 「Test App Events」 → 앱 실행 → 웹에 이벤트 표시 | 같은 문서 |
| 지금 개인정보처리방침 | 「제3자 광고·분석 SDK 없음」이라고 적혀 있음 | `lib/legal/dibay-privacy-policy-content.ts` 241·322행 |

## 2. 바꾸는 것

| # | 파일 | 변경 |
|---|---|---|
| 1 | `android/app/build.gradle` | `implementation 'com.facebook.android:facebook-core:19.0.1'` 추가. App ID·Client Token 은 기존 Kakao 키와 같은 방식(`local.properties`/환경변수 → `resValue`)으로 넣음 — 저장소에 값 안 올림 |
| 2 | `android/app/src/main/AndroidManifest.xml` | `<meta-data com.facebook.sdk.ApplicationId>`, `<meta-data com.facebook.sdk.ClientToken>` 2줄 |
| 3 | 빌드 번호 | 설치·배포용 빌드를 만들 때 1회 증가(`npm run native:prepare`) — 규정 그대로 |

**코드(웹·자바)는 바꾸지 않는다.** 자동 이벤트(설치·실행)만 쓴다. 가입 같은 앱 안 이벤트는 이번에 넣지 않는다(필요하면 다음 단계에서 따로 설계).

## 3. 바뀌는 동작과 영향

| 영향 | 내용 | 처리 |
|---|---|---|
| 앱 시작 | SDK 가 앱 시작 때 자동 초기화 → **시작 속도 영향 있을 수 있음(측정 전)** | 같은 Android 기기에서 SDK 전후 첫 실행 시간 비교(실행 횟수 상한 10회 안), 느려지면 출시 안 함 |
| 네트워크 | 설치·실행 시 Meta 서버로 이벤트 전송 | 운영 Supabase 호출 증가 없음 |
| 권한 | `AD_ID` + `ACCESS_ADSERVICES_*` 4개 자동 추가 | Play Console 「데이터 보안」·광고 ID 신고 갱신(Owner) |
| 앱 크기 | 의존성 추가로 증가 | 빌드 후 실측 보고 |
| 개인정보처리방침 | 「제3자 SDK 없음」 문구가 사실과 달라짐 | **출시 전** Meta SDK(설치·실행·기기 광고 ID 전송) 내용을 ko·en 에 추가 — 별도 PR(문서 도메인) + 관리자 게시 |
| 기존 설치 앱 | 구 버전은 SDK 없음 → Meta 에 안 잡힘 | 새 버전 설치·업데이트한 사람부터 집계 |
| iOS | 변경 없음 | — |
| 통화·메신저·알림 | 무관 (네이티브 통화 파일 안 건드림) | — |

## 4. 순서 (앞 단계 PASS 전에 다음 안 감)

| 단계 | 할 일 | 누가 |
|---|---|---|
| A | Meta for Developers 에 Android 앱 등록(패키지 `com.dibay.app`, 메인 액티비티 `com.dibay.app.MainActivity`) → App ID·Client Token 받기 → 광고 계정 연결 | **Owner 로그인** (작업자 화면 안내) |
| B | 개인정보처리방침 ko·en 에 Meta SDK 문구 추가 → 관리자 「법적 문서」에서 **공지형 개정**으로 게시(기존 동의 유지 — `acceptedPrivacyVersions` 구조) | 작업자 문안 + Owner 게시 승인 |
| C | SDK 추가 PR (위 2번) · 로컬 빌드 · 시험폰 설치 | 작업자 |
| D | 확인: App Ads Helper 「Test App Events」에 설치·실행 이벤트 도착 · 시작 속도 전후 비교 · 앱 기능 회귀 없음 | 작업자 (실기) |
| E | Play 「데이터 보안」 광고 ID 갱신 · Play 업데이트 출시 | **Owner 승인** |
| F | 광고 관리자에서 앱 검색 → 「광고 계정에 연결되어 있지 않음」 사라짐 확인 → 광고 방안 v4 ④·⑤ 진행 | 작업자 |

## 5. 롤백
- 앱 업데이트 없이: 이벤트 관리자에서 자동 이벤트 기록 끄기(문서 확인).
- 코드: SDK PR 되돌리기 + 다음 빌드 출시.

## 6. Owner 결정 필요
1. 이 설계 승인 (Android 네이티브 변경 · 새 버전 출시).
2. **광고 ID 수집** — SDK 기본값은 켜짐(`AD_ID` 권한 자동 추가). 측정에 꼭 필요한지는 Meta 문서에 문장이 없음 → 기본값(켜짐) 유지 여부를 Owner 가 정함.
3. A 단계 Meta 앱 등록을 Owner 계정으로 진행.

## iOS 추가 (Owner 2026-11-27 「apk·ios 모두 적용, 빼고 하지 말 것」)

| 항목 | 내용 | 근거 |
|---|---|---|
| 라이브러리 | SPM `https://github.com/facebook/facebook-ios-sdk` **19.0.1**(exactVersion), 제품 `FacebookCore`(=FBSDKCoreKit) — 기존 Kakao 와 같은 방식으로 App 타깃에 추가 | [ios getting-started](https://developers.facebook.com/docs/ios/getting-started) · 저장소 `Package.swift`·태그 직접 확인 |
| Info.plist | `FacebookAppID`·`FacebookClientToken`(= `$(FACEBOOK_APP_ID)`·`$(FACEBOOK_CLIENT_TOKEN)`, `ios/App/App/Facebook.local.xcconfig` gitignore — Kakao 방식)·`FacebookDisplayName` | 같은 문서 Step 2 |
| 초기화 | `AppDelegate` 에서 `ApplicationDelegate.shared.application(…didFinishLaunching…)` — 값이 없으면 호출 안 함 | 같은 문서 Step 3 (iOS 는 자동 초기화 문장 없음) |
| 자동 이벤트 | 앱 설치·실행 | [app-events iOS](https://developers.facebook.com/docs/app-events/getting-started-app-events-ios) |
| 넣지 않은 것 | `LSApplicationQueriesSchemes`·`fb{앱ID}` URL 스킴 — 문서상 로그인·공유 창 전용. `SKAdNetworkItems` — Meta 문서 페이지가 Audience Network(앱 안에 광고를 보여 주는 앱)용 | 같은 문서 · [SKAdNetwork](https://developers.facebook.com/docs/SKAdNetwork) |
| 추적 허용(ATT) 팝업 | **넣지 않음.** Meta 문서에 「반드시 띄워야 한다」는 문장 없음. 미동의 사용자는 Meta 「집계 이벤트 측정(AEM)」으로 측정된다고 문서에 있음. iOS 17+ 와 SDK 17+ 는 ATT 상태를 SDK 가 직접 읽음 | [advertising-tracking-enabled](https://developers.facebook.com/docs/app-events/guides/advertising-tracking-enabled) · [AEM](https://developers.facebook.com/docs/app-events/guides/aggregated-event-measurement) |
| 빌드 번호 | iOS `CURRENT_PROJECT_VERSION` 65 → 66 (4곳) | 네이티브 규정 |
| Meta 앱 | iOS 플랫폼: 번들 ID `com.dibay.ph`, iPhone Store ID 6831952401 저장(새로 고침 후 값 유지 확인) | Meta 개발자 화면 |
| App Store | 「앱 개인정보 보호」 질문지에 Meta 로 보내는 항목 신고 필요(Owner) | app-events iOS Step 7 |
| 광고 | iPhone 광고는 「iOS 14 이상 캠페인」 별도 | 최종 방안 v4 §2 |

## 진행 기록
- 11-27 18:3x PHT A 완료: Meta 개발자 계정 등록(Owner) · 앱 「DIBAY」(앱 ID 984578564333244, 비즈니스 DIBAY, 이용 사례 「광고 관리자로 앱 광고」) · Android 플랫폼(Google Play, `com.dibay.app`, `com.dibay.app.MainActivity`) 저장 · 인증된 광고 계정 1454362712907917 저장. 앱 ID·클라이언트 토큰은 `android/local.properties`(gitignore) 에만.

- 11-27 17:4x PHT C: 브랜치 `feat/meta-android-sdk` 커밋 fd3e6c455(미푸시), 워크트리 디버그 빌드 PASS · 병합 매니페스트에 Meta 설정·권한 5개 확인.
- 11-27 17:49 PHT B 게시(Owner 「문안대로 게시」): 관리자에서 privacy `2026-11-27-meta-sdk` ko(공지만, id aeb6ddc9…)·en(id 187472d8…) 게시. `required_consent_versions('ko')` 결과 privacy_accepted = [2026-11-27-meta-sdk, 2026-11-20-registration] → 기존 동의 유지 확인. `/privacy` 화면에 새 문장·시행일 11-27 표시 확인.

## 부록 B — 개인정보처리방침 추가 문안 (게시 전 Owner 확인)

위치: 관리자 게시본과 `lib/legal/dibay-privacy-policy-content.ts` 의 ko·en (9)·6·11절. **공지형 개정**으로 게시.

**한국어**
- (9) 광고·프로모션 — 「제3자 광고 SDK·분석 SDK … 확인되지 않았습니다」 문장을 교체:
  「Android 앱에는 Meta(Facebook) SDK가 포함되어 있습니다. 앱 설치·실행 사실, 기기 정보, 기기 광고 식별자(광고 ID)가 Meta로 전송되며, DIBAY 광고의 설치 성과 측정에 사용됩니다. 기기 설정에서 광고 ID를 재설정하거나 삭제할 수 있습니다.」
- 6. 처리 위탁·외부 서비스 — 항목 추가: 「Meta(Facebook): Android 앱 설치·실행 이벤트와 광고 ID를 이용한 광고 성과 측정」
- 11. 광고 및 프로모션 — 「제3자 광고 네트워크 SDK는 … 확인되지 않았습니다」를 교체: 「페이스북·인스타그램 DIBAY 광고의 설치 성과를 측정하기 위해 Android 앱에 Meta SDK를 사용합니다. DIBAY 앱 안에 다른 회사 광고를 보여 주지는 않습니다.」

**English**
- (9): "The Android app includes the Meta (Facebook) SDK. App install and launch events, device information and the device advertising ID are sent to Meta to measure installs from DIBAY ads. You can reset or delete the advertising ID in your device settings."
- 6. add: "Meta (Facebook): Android app install and launch events and the advertising ID, to measure ad performance"
- 11: "The Android app uses the Meta SDK to measure installs from DIBAY ads on Facebook and Instagram. DIBAY does not show other companies' ads inside the app."

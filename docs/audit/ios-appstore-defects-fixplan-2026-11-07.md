# DIBAY iOS 출시 결함 확정·수정안 (새 개발자 계정 경로) — 2026-11-07 PHT

> Owner 결정 (2026-11-07): **새 개발자 계정(필리핀 주소·개인)으로 출시.** 기존 계정 주소 변경은 답장 대기, 승인되어도 새 계정 경로 유지.
> 판정 근거: 직접 본 것만 — Production `ac130094c` · 운영 DB 읽기 전용 · 운영 웹(비로그인) · main 코드 · ASC(Owner 로그인, 읽기). Cursor 인수인계는 근거로 쓰지 않음.
> 이 문서는 **보고·설계**다. 구현·운영 DB 적용·제출은 하지 않았다.
> 이전 감사: `docs/audit/ios-appstore-launch-audit-2026-11-07.md`

---

## 1. 결함 판정표

### A. 재심사 전에 반드시 고칠 것 (FAIL)

| # | 결함 | Apple 근거 | 직접 본 증거 |
|---|---|---|---|
| D1 | **심사관 결제가 포인트로 지급 안 됨** — Sandbox 결제는 등록 계정 2개만, 계정당 누적 11,000P 까지만 지급. 3종(1,000+5,250+11,000=17,250P)을 다 사면 마지막 결제는 「운영팀 확인 중」으로 멈춤. 새 가입 심사관은 첫 결제부터 멈춤 | 2.1(완성도)·3.1.1 — 구매한 것이 지급돼야 함 | 마이그레이션 `20271107100000_apple_iap_topup.sql` L645~666 · 운영 DB `apple_iap_sandbox_accounts` 2건 · `apple_iap_sandbox_point_cap()` = 11000 |
| D2 | **탈퇴 시 Sign in with Apple 토큰 폐기 없음** — 네이티브 로그인이 `authorizationCode` 를 서버로 보내지만 서버는 쓰지 않음(토큰 교환·저장·폐기 0) | 계정 삭제 안내: 「Sign in with Apple REST API to revoke user tokens」 | `lib/auth/native/apple-native-session.server.ts` 에 authorizationCode 사용 없음 · 코드 전체 `auth/revoke` 0건 |
| D3 | **금칙어 0개 + 신고 미처리** — 금칙어 설정 행 자체가 없음(필터 꺼진 상태). 신고 `pending` 3건, 가장 오래된 것 10-27 | 1.2(UGC): 부적절한 내용 필터·신고 처리 | 운영 DB `admin_settings(key=community_feed_ops)` 없음 · `reports` pending 3 (10-27~10-28) |
| D4 | **공개 연락 이메일이 메일을 받을 수 없음** — `support@dibay.app`, `dibay.app` 에 NS·MX·A 레코드 없음. 개인정보처리방침·탈퇴 안내 페이지·로그인 안내·사업자 정보에 표시 | 1.2·1.5 연락처 / 5.1.1 개인정보처리방침 | `dig` 결과 없음 · `lib/legal/dibay-privacy-policy-content.ts`, `app/account/delete/AccountDeletePublicPageClient.tsx`, `components/auth/AuthLoginNotice.tsx`, `lib/i18n/catalog/ui-finish-pages.ts` |
| D5 | **「사업자 정보」 비로그인 접근 불가 + 내용 없음** — 비로그인 메뉴에 보이지만 누르면 로그인 화면(307). 값은 상호 `dibaY`·이메일뿐(대표·주소·전화 빈칸). 개인정보처리방침이 운영자 정보를 이 페이지로 미룸 | 1.5 개발자 정보 / 5.1.1 | curl `/business-info` → 307 `/login?reason=auth_required` · `/api/business-info` 응답 |
| D6 | **이용약관이 사실상 없음** — 한국어 258자·영어 501자. 운영자, 포인트(현금가치·환불), 탈퇴·데이터, 금지행위 제재·신고 처리 기한, 준거법 없음 | 1.2(UGC 약관: 부적절 콘텐츠 무관용) / 3.1 포인트 | 운영 DB `app_legal_documents(kind=terms)` 본문 |

### B. 위험 (막힐 수 있음 — 같은 작업에서 정리)

| # | 결함 | 증거 |
|---|---|---|
| D7 | 탈퇴 = 신청만 접수, 운영자 수동 삭제. 처리 기간 안내 없음. 미처리 신청 2건 | `app/api/me/leave-request/route.ts` · `account_deletion_requests` requested 2 |
| D8 | 포인트 계좌이체 충전 API 가 iOS 요청을 서버에서 막지 않음 (화면만 숨김). Cash 결제 API 는 서버에서도 막음 | `app/api/me/points/charge/route.ts` 에 `blockIosAppDigitalPurchase` 없음 |
| D9 | 네이티브: 개인정보 매니페스트(`PrivacyInfo.xcprivacy`) 없음 · 권한 문구 한국어만 · 쓰지 않는 「위치 항상 허용」 문구 | `ios/App/App` |
| D10 | 연령 등급: iOS 26 이전 9+ (앱은 만 14세 이상만 가입) | ASC 앱 정보 |

### C. 확인 못 함 (NOT_PROVEN)
- 신규 가입 → 동의 화면 실화면 (iPhone 17 Pro Max iOS 27.2, **iPad**) — 운영에 새 회원을 만들어야 해서 작업자 불가. Owner 실기 필요.
- 4.2(웹을 감싼 앱) 지적 여부 — 앱이 운영 웹을 원격으로 띄우는 구조(`server.url`). 푸시·통화·Apple 결제·Apple 로그인 등 네이티브 기능이 있어 근거는 있음.

### PASS (직접 확인)
로그인 화면(Google·카카오·Apple 동일 크기, 로그인 없이 이용) · 동의 화면 필수/선택 구분·필수 미체크 시 버튼 비활성·고정 하단(코드) · 선택 동의 미기록(DB) · 만 14세 미만 서버 거절 · iOS 에서 Cash 광고 결제 차단(화면+서버) · IAP 서명 검증(Apple Root CA G3)·번들·환경 검사 · IAP 상품 3종 이름 = 지급량 · 신고(게시글·댓글·상품·사용자·채팅방·메시지)·차단(커뮤니티·채팅·메신저) 기능 존재 · 심사 계정 `appreview01`: 정상 회원, 연령 확인·전화 인증(운영자 수동)·기본 주소(Makati) 있음.

---

## 2. 수정안 (결함별 · 한 원인 한 수정)

### D1. 심사 결제 지급 — DB 함수 1개 (원장 영역)
- 변경: 지급 함수의 Sandbox 분기를 「등록 계정만」→ **모든 회원 지급**, 계정당 누적 상한 **11,000 → 34,500P** (3종 × 2회). 원장 표기 `apple_iap_sandbox`·설명 「Apple 테스트 결제 (Sandbox)」 그대로. Production(실결제) 분기 무변경.
- 왜 안전: Sandbox 거래는 실제 App Store 고객이 만들 수 없다(심사·TestFlight·개발 빌드만). 서명 검증·번들·`APPLE_IAP_ALLOW_SANDBOX` 검사는 그대로.
- 영향: `apple_iap_*` 지급 RPC, 어드민 Apple IAP 검토·대사 화면(사유 `sandbox_account_not_allowed` 더 이상 안 생김 — 화면 문구 유지), 등록 계정 관리 화면(남김, 의미는 「표시용」).
- 검증: 마이그레이션 계약 vitest · 운영 DB 적용(별도 승인) · 새 계정 Sandbox 결제 3건 실측(원장·잔액).
- 롤백: 이전 함수 정의 재적용.

### D2. Apple 토큰 폐기 — 웹·DB (네이티브 무변경)
- 로그인 시: `api/auth/native/exchange` 에서 Apple `authorizationCode` → Apple `/auth/token`(client_secret = Sign in with Apple 키로 서명한 JWT) → **refresh_token 암호화 저장** (신규 테이블 `apple_signin_tokens`, service role 만 접근, RLS 차단). 교환 실패해도 로그인은 막지 않고 기록만.
- 탈퇴 처리 시(`lib/admin/admin-user-deletion.ts` 삭제 경로): 저장된 토큰으로 Apple `/auth/revoke` → 결과 감사 로그 → 토큰 행 삭제. 토큰 없는 기존 회원은 「토큰 없음」 기록.
- 필요 값 (새 계정 발급 후): `APPLE_SIWA_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_KEY_P8`, client_id(= 새 번들 ID). 값이 없으면 기능 꺼짐(로그인 영향 0).
- 검증: 토큰 교환·폐기 단위 테스트(모의 응답) · 새 계정 TestFlight 에서 Apple 가입 → 탈퇴 → Apple ID 설정 「Apple로 로그인 사용 중인 앱」에서 사라짐 확인.

### D3. 금칙어·신고 처리 — 데이터·운영 (코드 없음)
- 어드민 동네생활 운영 설정에 금칙어 목록 입력(한국어·영어·타갈로그 기본 욕설·혐오·성착취 단어). 목록 초안은 작업자 작성 → Owner 확인 → 어드민 저장.
- 신고 pending 3건 처리(Owner·운영자).
- 심사 메모에 「신고는 24시간 안에 검토·조치」 문장 추가.

### D4. 연락 이메일 — 코드 4곳 + 사업자 정보 데이터
- Owner 가 **실제 받는 이메일** 1개 지정 → 위 4파일의 `support@dibay.app` 교체(상수 1곳으로 모음) + 사업자 정보 이메일 갱신.
- (선택) `dibay.app` 도메인을 등록해 메일을 받게 하면 기존 주소 유지 가능 — Owner 결정.

### D5. 사업자 정보 공개 — 코드 1곳 + 데이터
- `/business-info` 를 비로그인 공개 경로에 추가(인증 가드 목록).
- 값(어드민 입력, Owner 제공): 운영자 = 개인 **BONG KI KIM**, 필리핀 연락 주소, 이메일(D4), 전화. 사업자번호 칸은 「개인 운영(사업자 등록 전)」 표기.

### D6. 이용약관 새 버전 — 데이터(어드민 게시)
- 작업자가 ko/en 초안 작성: 운영자(개인), 서비스 범위, 회원·연령(만 14세), 금지 행위·**부적절 콘텐츠 무관용·신고 24시간 내 조치·제재**, 포인트(현금 가치 없음·양도 불가·Apple 결제 환불은 Apple 정책·IAP 포인트는 디지털 서비스만), 탈퇴·데이터 보관, 책임 제한, 준거법(필리핀), 연락처.
- Owner 검토 → 어드민 게시. 기존 계약(필수 약관 개정 유형)대로 재동의 화면이 뜨는지 확인 — 회원 전체에 영향이므로 게시 시점은 Owner 결정.

### D7. 탈퇴 안내 — 웹 문구
- 신청 화면·완료 화면에 「신청 후 N일 안에 계정과 데이터가 삭제됩니다」, 어드민 목록에 경과일 표시. N 은 Owner 결정(권고 7일). 미처리 2건 처리.

### D8. 포인트 계좌이체 충전 서버 차단 — 웹 1곳
- `POST /api/me/points/charge` 에 `blockIosAppDigitalPurchase(req)` 추가(Cash 와 같은 방식). Android·웹 무영향.

### D9·D10 — 새 계정 빌드에 함께 (네이티브 일괄)
- `PrivacyInfo.xcprivacy` 추가, `en.lproj/InfoPlist.strings`, `NSLocationAlwaysAndWhenInUseUsageDescription` 제거.
- 새 앱의 연령 등급 설문을 UGC·채팅 기준으로 다시 작성.

---

## 3. 새 개발자 계정 전환 — 바뀌는 것 전부

| 영역 | 바뀌는 것 | 비고 |
|---|---|---|
| Apple (Owner) | 새 계정 등록(필리핀 주소·개인) → 유료 앱 계약·필리핀 은행·W-8BEN | 사업자 불필요 |
| Apple (작업자 안내·Owner 클릭) | App ID(Sign in with Apple·Push), 알림 확장 App ID, Services ID(웹 Apple 로그인), APNs 키, Sign in with Apple 키, 앱 등록, IAP 3종 새 상품 ID | — |
| 번들 ID | `com.dibay.app` → **권고 `com.dibay.ph`** (알림 확장 `com.dibay.ph.DibayPushServiceExtension`) | Android 는 `com.dibay.app` 그대로 |
| 앱 이름 | 기존 계정이 「DiBaY - 디바이」 점유. 반려(Rejected) 상태라 삭제 불가 → 기존 계정에서 이름을 바꿔 풀거나 새 이름 사용 | 이름 풀림 여부 NOT_PROVEN — 새 앱 등록 때 먼저 확인 |
| iOS 프로젝트 | `PRODUCT_BUNDLE_IDENTIFIER`(앱·확장), `DEVELOPMENT_TEAM`, 버전 번호 | `capacitor.config` appId 는 Android 와 공유 — Xcode 쪽만 바꿈 (cap sync 가 덮어쓰지 않는지 확인) |
| 카카오 개발자 콘솔 | iOS 번들 ID 추가 | 카카오 로그인 |
| Vercel 환경변수 | `APPLE_IAP_BUNDLE_ID`, `APPLE_NATIVE_BUNDLE_ID`/`AUTH_APPLE_NATIVE_CLIENT_ID`, `APNS_KEY_P8`·`APNS_KEY_ID`·`APNS_TEAM_ID`·`APNS_BUNDLE_ID`·`APNS_VOIP_TOPIC`, D2 키 | 교체는 새 앱 출시 시점에 한 번에 |
| Supabase Auth | 웹 Apple 로그인(Services ID·키) 새 팀으로 | 현재 설정 팀 NOT_PROVEN — 확인 필요 |
| 운영 DB | `apple_iap_products.product_id` 3행 교체(마이그레이션) | 승인 필요 |
| Apple 로그인 회원 | Apple 사용자 식별값은 팀마다 다름 → 기존 Apple 회원 3명(`11222` 06-10, `dibay_d7fc34` 심사관, `dibay_9d830a` 시험)은 새 앱에서 새 회원 | `11222` 가 시험 계정인지 Owner 확인 |
| **웹·iOS 동시 전환** | iOS 만 새 팀, 웹 Apple 로그인은 옛 팀이면 **같은 사람이 두 회원**으로 갈림 → 웹·iOS Apple 로그인을 같은 날 새 팀으로 | — |
| **통화** | APNs·VoIP 키·토픽 변경 = 통화 경로 변경 → **통화 변경 규정**(계획 문서·Owner 승인·단독 반영·실기기 행렬) | 별도 문서로 계획 |
| 기존 계정 | 그대로 둠. 기존 Build 23 설치본은 옛 번들로 계속 동작(옛 APNs 키 유지 기간 동안) | 옛 키 폐기 시점 Owner 결정 |

---

## 4. 진행 순서 (권고)

1. **지금 (계정 승인 전, 웹·DB — 새 계정과 무관)**: D1 · D2(코드, 키 없으면 꺼짐) · D4 · D5 · D7 · D8 구현 → 로컬 검증 → main 1회. D1 운영 DB 적용은 별도 승인. D3·D6 초안 작성 → Owner 확인 → 어드민 게시.
2. **새 계정 승인 후**: Apple 쪽 등록(위 표) → 통화 영향 계획 문서 승인 → iOS 번들·팀 변경 + D9 → 네이티브 빌드(Owner 일괄 빌드 규정) → TestFlight.
3. **TestFlight 실측**: Apple 가입→동의 화면(iPhone·iPad)→포인트 3종 Sandbox 결제·지급→탈퇴·토큰 폐기→통화 행렬.
4. **제출**: IAP 3종 첨부 + 심사 메모(로그인·결제·탈퇴·신고 24시간·연락처) → 제출 ID 보고.

## 5. Owner 결정·제공 필요
1. 실제 받는 연락 이메일 (D4) — 또는 `dibay.app` 도메인 등록
2. 사업자 정보에 넣을 필리핀 연락 주소·전화 (D5)
3. 탈퇴 처리 기간 N일 (D7, 권고 7일)
4. 약관 초안 검토·게시 시점 (D6), 금칙어 목록 확인 (D3), 신고 3건·탈퇴 2건 처리
5. 새 번들 ID 확정 (권고 `com.dibay.ph`), 앱 이름
6. Apple 회원 `11222` 가 시험 계정인지

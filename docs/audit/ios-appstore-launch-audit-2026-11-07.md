# DIBAY iOS 출시 — 재감사·출시 조건·개선 설계안 (2026-11-07 PHT)

> 작성: Claude (Cursor 인수인계를 근거로 쓰지 않음. 아래 PASS/FAIL 은 전부 직접 본 증거만)
> 확인 조건: Production `ac130094c` (Vercel API READY, 15:34 PHT) · ASC = Owner 로그인 Chrome 읽기 전용 · 운영 DB = `supabase db query --linked` 읽기 전용 · 코드 = main HEAD `ac130094c`
> 판정: PASS / FAIL / NOT_PROVEN(확인 못 함)

## 0. 작업자 잘못 (먼저)
1. ASC 심사 정보 입력칸을 스크립트로 읽다가 **심사 계정 비밀번호가 도구 출력에 1회 노출**됨 (ASC 화면의 비밀번호 칸이 일반 텍스트 칸). 외부 전송 없음. Owner 교체 권고.
2. Owner 로그인 직후 ASC 탭을 다시 불러와 진행 중이던 로그인을 1회 끊음.
3. ASC 판매 국가 창을 열었다가 저장 없이 이동. 저장·제출·답장 0건.

## 1. 전제 (Owner 확정)
- Apple 개발자 = Owner 개인 1인, 현재 등록 주소 **대한민국 김해**.
- **한국 사업자 낼 계획 없음.** 실제 거주 = 필리핀(13A). **출시 후 필리핀에서 사업자** 예정.
- DIBAY 대상 = **필리핀 거주 한국인·필리핀 사람**. 무료 앱 + 앱 안 포인트 결제(IAP).

## 2. 직접 확인한 현재 상태
| 항목 | 결과 | 증거 |
|---|---|---|
| 1.2 (23) | 「심사를 통과하지 못함」 Guideline 4 — 「Service consent 에서 버튼이 보이지 않음」, iPhone 17 Pro Max · iOS 27.2. 「iPad 에서도 정상 동작해야 함」 문구 포함. 답장 0, 재제출 없음 | ASC 제출 49727adb… |
| 멤버십 주소 | 대한민국 김해 (변경 반영 안 됨. 변경 요청 제출 여부는 화면으로 알 수 없음 → NOT_PROVEN) | developer.apple.com 멤버십 |
| 무료 앱 계약 | 활성 | ASC 비즈니스 |
| 유료 앱 계약 | **사용자 정보 대기 중** | ASC 비즈니스 |
| 은행 (필리핀 PHP) | **처리 중** | ASC 비즈니스 |
| 대한민국 세금 양식 | ⚠ 세금 정보 없음 | ASC 비즈니스 |
| W-8BEN · U.S. Certificate | 활성 (11-06, 주소 김해) | ASC 비즈니스 |
| 판매 국가 | **대한민국·필리핀 2곳** | ASC 가격 및 사용 가능 여부 |
| IAP 3종 | 「제출 준비 중」, 이름 1,000 / 5,250 / 11,000 = DB 지급량(보너스 포함)과 일치 | ASC + 운영 DB `point_plans` |
| 1.2 에 IAP 첨부 | 없음 | ASC 버전 화면 |
| 연령 등급 | 13+ (한국 15+), iOS 26 이전 9+ | ASC 앱 정보 |
| iPad 지원 | 켜짐 (`TARGETED_DEVICE_FAMILY = 1,2`) | pbxproj |
| 개인정보 라벨 | 16개 유형 게시됨, 처리방침 URL `/privacy` (비로그인 200) | ASC + curl |

## 3. Apple 이 요구하는 조건 (공식 원문 근거)
| 조건 | 내용 | 근거 |
|---|---|---|
| 유료 앱 계약 활성 | IAP 를 제출하려면 계약이 **활성**이어야 함. 「대기 중」= 필요한 정보 미완료로 효력 없음. 「Active (Pending User)」(효력 있음+정보 미완료) 상태도 존재 | developer.apple.com/help/app-store-connect/manage-agreements/view-agreements-status |
| 한국 거주 개발자 세금 | 「Developers based in South Korea」는 BRN(또는 고유번호) 필요. 미제출 시 「지급 지연」. 계약서(DPLA)상 「한국 스토어에서 제거 또는 지급 안 됨」 가능 | …/provide-tax-information · DPLA Schedule 2 Exhibit C §7 |
| 주소·법적 정보 변경 | 멤버십 화면에서 요청 → Apple 검증·승인. 반영 최대 2주, 새 유료 계약이 생길 수 있음 | …/updating-your-account-information · sign-and-update-agreements |
| 개인사업자 | 「sole proprietorship 는 개인으로 가입」. 조직 계정은 법인 + D-U-N-S | developer.apple.com/help/account/membership/D-U-N-S |
| 앱 이전 | 출시된 버전 1개 이상 필요. 이전 시 번들 ID 유지, Apple 로그인 사용자는 60일 안에 새 팀 식별값으로 교환 | …/transfer-an-app/app-transfer-criteria |
| 디지털 재화 | 포인트 = IAP 필수(3.1.1). 웹에서 산 포인트를 앱에서 쓰려면 같은 것을 IAP 로도 팔아야 함(3.1.3(b)). 외부 결제 유도 금지 | App Review Guidelines |
| 계정 삭제 | 앱 안에서 삭제 시작 가능해야 함. Sign in with Apple 사용 시 **REST API 로 토큰 폐기** | developer.apple.com/support/offering-account-deletion-in-your-app |
| UGC(1.2) | 신고·차단·필터·연락처 공개 | App Review Guidelines 1.2 |
| 필리핀 세금 | ASC 국가별 세금 양식 목록에 필리핀 항목 없음(추가 양식 요구 문구 미발견). 필리핀 디지털서비스 VAT(RA 12023)를 Apple 이 대신 처리하는지는 NOT_PROVEN | provide-tax-information (필리핀 항목 없음) |

### 전제에 대입한 판정
- **현재 주소(한국)는 사실과 다름.** 한국 거주자가 아니면 한국 세금 양식(BRN) 요건이 맞지 않는 상태로 계약이 진행 중이다. 한국 사업자를 내지 않는 한 이 계정 상태로는 「지급 지연·한국 스토어 제거」 위험이 계속된다.
- **주소를 필리핀으로 바로잡으면** 한국 BRN 요건 자체가 빠진다(한국 거주 개발자 대상 요건이므로). 개인 그대로 유지 가능(필리핀 사업자 없어도 개인 가입 가능). 대신 W-8BEN 등 재서명, 새 유료 계약 동의가 필요할 수 있다.
- 은행이 「처리 중」인 동안은 어느 경로든 IAP 를 심사에 낼 수 없다.

## 4. 출시 경로 — 판정과 권고

| 경로 | 가능 여부 | 장점 | 문제 |
|---|---|---|---|
| **A. 지금 계정 주소를 필리핀으로 정정 → IAP 포함 출시** | 가능 (Apple 공식 절차). 기간 NOT_PROVEN | 앱·번들·IAP·심사 이력 그대로. 사실과 맞는 상태 | Apple 응답 대기. 재서명 |
| **B. IAP 없이 먼저 무료 출시 (지금 계정)** | 가능 — 유료 계약은 「유료 앱·IAP」에만 필요 | 주소·은행 기다리지 않음 | iOS 에서 포인트 충전·사용을 **제공하지 않게** 바꿔야 함(숨김이 아니라 iOS 기능 범위에서 제외). 웹 변경 |
| C. 한국 주소 그대로 IAP 출시 | 권고 안 함 | — | 주소가 사실과 다름. BRN 없음 → 지급 지연·한국 스토어 제거 위험 |
| D. 새 개발자 계정(필리핀) | 가능하나 최후 | — | 같은 사람 개인 계정 2개 허용 NOT_PROVEN. 새 번들 ID·IAP ID·푸시·VoIP·통화 재작업·Apple 로그인 회원 영향 |
| E. 조직 계정 전환 | 지금 불가 | — | 필리핀 **법인**(SEC)+D-U-N-S 필요. DTI 개인사업자는 해당 안 됨 |
| F. 먼저 출시 후 새 계정으로 이전 | A/B 로 출시 후 가능 | 번들 ID 유지 | 필리핀 사업 구조가 정해진 뒤 판단 |

**권고 순서 (새 계정 만들지 않고 출시):**
1. 주소 정정(A)을 진행·확인한다 — Apple 문의 케이스에 「실제 거주 필리핀(13A), 개인, 한국 사업자 없음 → 법적 주소 정정 요청, 증빙 ACR I-Card」로 한 번 더 명확히 요청.
2. 기다리는 동안 **B(IAP 없는 1.x)** 로 먼저 출시할지는 Owner 결정 — 포인트가 출시 핵심 기능이 아니면 B 가 가장 빠름.
3. 주소·은행 반영 → 유료 계약 활성 → IAP 붙여 다음 버전 제출.
4. 필리핀 사업자 등록 후 필요하면 조직 계정/이전(F) 검토.
5. 판매 국가: 주소가 한국인 동안은 **한국 스토어 제외** 권고(필리핀 교민 중 한국 Apple ID 사용자는 다운로드 불가 — 이 영향은 주소 정정 후 한국 스토어를 다시 켜서 해소).

## 5. 코드·운영 결함 (재심사 전 해결 대상)
| # | 결함 | 판정 | 증거 |
|---|---|---|---|
| F1 | 심사관 Sandbox 결제 미지급 — 등록 계정 2개만, 계정당 누적 11,000P 까지만 지급. 새 가입 심사관·두 번째 구매는 「운영팀 확인 중」으로 멈춤 | FAIL | 마이그레이션 `20271107100000` L645~666, 운영 DB `apple_iap_sandbox_accounts` 2건·cap 11000 |
| F2 | 탈퇴 시 Sign in with Apple 토큰 폐기 없음 | FAIL | 코드 검색 0건 (`auth/revoke`) |
| F3 | 탈퇴 = 신청만 접수, 운영자 수동. 처리 기간 안내 없음. 미처리 2건 | 위험 | `app/api/me/leave-request`, 운영 DB `account_deletion_requests` requested 2 |
| F4 | 이용약관이 너무 짧음 (ko 258자 / en 501자) — 운영자 정보·포인트/IAP·환불·탈퇴·준거법·UGC 처리 기준 없음 | FAIL(심사·법적 위험) | 운영 DB `app_legal_documents` |
| F5 | 「사업자 정보」가 비로그인에서 로그인 화면으로 튕김(307), 내용은 상호·이메일뿐 | FAIL | curl `/business-info` 307 · `/api/business-info` |
| F6 | 공개 연락 이메일 `support@dibay.app` 도메인에 NS·MX·A 레코드 없음 → 메일 받을 수 없음 | FAIL | `dig` 결과 없음 |
| F7 | 앱 개인정보 매니페스트(`PrivacyInfo.xcprivacy`) 없음, 권한 문구 한국어만, 쓰지 않는 「위치 항상 허용」 문구 | 위험(낮음) | ios/App/App |
| F8 | 동의 화면 실화면(iPhone 17 Pro Max·**iPad**) 신규 가입 경로 | NOT_PROVEN | 운영 신규 가입 필요 — 작업자 계정 생성 불가 |
| F9 | 원격 URL 로 웹을 띄우는 구조 → 4.2(최소 기능) 지적 가능성 | 위험(NOT_PROVEN) | `capacitor.config.json` server.url |

PASS 확인: 로그인 화면(Apple 버튼 동일 크기·비로그인 이용), 동의 화면 필수/선택 구분(코드·DB), 만 14세 미만 서버 거절, iOS 에서 Cash 광고 결제 차단(UI+서버), IAP 서명 검증(Apple Root CA G3)·번들·환경 검사, 신고·차단 API 존재.

## 6. 개선 설계안 (구현은 Owner 승인 범위 확정 후 · 결함별 1원인)

### S1. 심사 Sandbox 결제 지급 (F1) — 웹·DB
- 변경: `apple_iap_*` 지급 함수의 Sandbox 분기 — 「등록 계정만」→ **Sandbox 는 모든 회원 지급**, 계정당 누적 상한 **11,000 → 34,500P**(1,000+5,250+11,000 = 17,250P × 2회). 원장에는 기존처럼 `apple_iap_sandbox` 로 구분 기록.
- 근거: Sandbox 거래는 실제 App Store 사용자가 만들 수 없음(심사·TestFlight·개발 빌드만). TestFlight 테스터는 내부 1명.
- 영향: 포인트 원장·어드민 Apple IAP 검토 화면·대사(reconciliation). 실결제(Production) 경로 무변경.
- 검증: vitest(지급 함수 계약), 운영 DB 적용은 Owner 승인 후, Sandbox 결제 1건 실측.
- 롤백: 이전 함수 정의 재적용.

### S2. 탈퇴 시 Apple 토큰 폐기 (F2) — 웹·DB, 네이티브 무변경
- 로그인: 네이티브 Apple 로그인 교환(`native-exchange`)에서 이미 받는 `authorizationCode` 를 서버가 Apple `/auth/token` 으로 교환 → **refresh_token 암호화 저장**(신규 테이블, 서비스 키만 접근).
- 탈퇴 처리 시: Apple `/auth/revoke` 호출 후 기록. 기존 Apple 회원(토큰 없음)은 처리 기록만 남김.
- 필요: Apple Sign in 키(.p8)·Key ID·Team ID 를 Vercel 환경변수로(Owner 가 developer.apple.com 키 화면에서 발급).
- 참고: 한국 거주 개발자는 Services ID 신규·수정 시 서버 알림 엔드포인트 등록 의무(2026-01-01~). 주소 정정 후에는 해당 없음.

### S3. 계정 삭제 흐름 (F3) — 웹
- 신청 즉시 「N일 안에 삭제 완료」 안내 문구 + 신청 후 로그인 차단. 운영자 처리 SLA 를 어드민 목록에 표시.
- N 값은 Owner 결정(권고 7일).

### S4. 약관·사업자 정보·연락처 (F4~F6) — 어드민 데이터 + 웹 1곳
- `/business-info` 를 비로그인 공개로 변경(코드 1곳).
- 사업자 정보: 개인 운영자 이름(BONG KI KIM)·필리핀 연락 주소·**실제 수신 가능한 이메일**·전화 — 값은 Owner 제공, 어드민에서 입력.
- 이용약관 새 버전 초안(작업자 작성 → Owner 검토 → 어드민 게시): 운영자, 서비스 범위, 포인트(현금 가치 없음·환불은 Apple 정책), UGC 무관용·신고 24시간 내 조치, 탈퇴·데이터 보관, 준거법(필리핀). 게시 시 재동의 화면이 뜨는지 기존 계약대로 확인.
- `support@dibay.app` 를 쓰려면 도메인 등록+메일 설정 필요. 아니면 실제 쓰는 주소로 교체.

### S5. 네이티브 정리 (F7) — 다음 빌드에 일괄 (Owner 네이티브 일괄 빌드 규정)
- `PrivacyInfo.xcprivacy` 추가, `en.lproj/InfoPlist.strings`, `NSLocationAlwaysAndWhenInUseUsageDescription` 제거.
- 1.2 를 Build 23 으로 재제출하면 이 항목은 다음 빌드로 미룸(업로드 차단 아님).

### S6. (B 경로 선택 시만) iOS 포인트 제외 — 웹
- iOS 앱에서 포인트 충전·포인트 사용처(피드 광고·글 홍보 등)를 **iOS 기능 범위에서 제외**, 심사 메모에 「iOS 버전은 포인트 기능 없음」 명시. 진입점 목록은 별도 조사 후 확정.
- 주소·계약 해결 후 S1 과 함께 되살림.

## 7. Owner 가 할 일 (작업자 대행 불가)
1. Apple 문의 케이스 30000006124723 답변 확인 / 주소 정정 요청을 실제로 냈는지 확인 (멤버십 화면은 여전히 김해).
2. 경로 결정: A 만 / A+B.
3. 심사 계정 비밀번호 교체 (0절).
4. S2 용 Apple 키(.p8) 발급, S4 사업자 정보 값·연락 이메일 제공.
5. 동의 화면 실기 신규 가입 확인(iPhone·iPad) — 운영 계정 생성은 Owner 만.

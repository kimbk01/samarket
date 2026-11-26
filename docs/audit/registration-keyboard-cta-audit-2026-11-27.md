# 신규 가입 — 전화번호·주소 입력 화면 키보드·버튼(CTA) 재감사와 수정안 (2026-11-27)

상태: **감사·수정안 — 구현 전, Owner 승인 대기.** 코드·DB·운영 변경 없음.
근거: Owner 2026-11-27 「신규 회원 가입시 전화 번호 입력시 키보드가 올라 오면서 확인 버튼을 가리고, 취소 버튼이 안보이고 … 정확한 버튼 형태와 ui ux cta ssot 부분의 결함을 확인해서 수정안을 보고」.
조회 조건: 코드 = `origin/main` 기준 현재 파일. 운영 사이트·운영 DB·실기기 **조회 안 함**(앱 실행 0회 · 운영 Supabase 요청 0건).
판정 표기: 코드 확인 = 파일·줄로 직접 확인 · 모사 = 실제 CSS 치수로 만든 로컬 화면(실기 아님) · 실기 = **NOT_PROVEN**(이번에 폰으로 재현하지 않음).

## 0. 먼저 — 작업자 잘못

0. **(2026-11-27 추가) 「기기별 확인 후 정확히 수정」을 구현 지시로 잘못 읽고 코드 수정을 시작했다.** Owner 지시는 「결함 확인 → 시안 보고」였다. 수정분(가입 틀·전화 단계·동의 화면·로그아웃 부품·문구 키)은 작업 폴더 `samarket-wt-regkb` 에 보관(stash)만 했고 커밋·PR·배포 없음 · 운영 영향 없음. 부분별 시안 = `registration-keyboard-cta-2026-11-27/mockup.html`(캡처 `mockup-1~4.png`).

1. **같은 종류 결함을 세 번째로 남겼다.** 동의 화면은 2026-10 애플 심사(App Review 4)에서 「버튼이 안 보임」으로 `2233d31e9`·`1cd04487c` 에서 **하단 고정 버튼(footer)** 으로 고쳤다. 그런데 2026-11-20 이후 가입 단계에 전화 단계(`RegistrationPhoneStep`)를 추가할 때 **같은 틀(`AuthGateOverlay`)을 쓰면서 footer 를 쓰지 않고**, 내정보용 `PhoneVerificationBox` 를 본문에 그대로 넣었다. 11-21·11-24·11-25 가입 감사 3번 모두 「누가 막히나(권한·경로)」만 봤고 **키보드가 열린 화면의 버튼 위치는 한 번도 확인하지 않았다**(세 감사 문서에 「키보드」 언급 0건).
2. **팝업 SSOT(2026-11-02 승인) 위반을 내가 넣었다.** 전화 단계 버튼은 팝업 표준(높이 48·반경 12·15/600·고정 하단)이 아니라 내정보 화면용 알약 버튼(높이 52·완전 둥근·17/700·본문 안)이다.
3. **11-25 감사에서 「신규 가입 흐름 실기 NOT_PROVEN」으로 남긴 부분이 그대로 Owner 에게 결함으로 나왔다.**

## 1. 가입 흐름과 화면 틀 (코드 확인)

| 단계 | 경로 | 화면 컴포넌트 | 틀 | 주 버튼 위치 |
|---|---|---|---|---|
| 1 동의 | `/auth/onboarding/terms` | `components/auth/AuthConsentForm.tsx` | `DibayOnboardingOverlayShell` → `AuthGateOverlay`(가운데 팝업) | **footer 고정** (`AuthConsentForm.tsx:313-329`) |
| 2 전화 | `/auth/onboarding/phone` | `components/auth/RegistrationPhoneStep.tsx` → `components/mypage/profile/PhoneVerificationBox.tsx` (`surface="overlay"`) | 같은 가운데 팝업 | **본문 스크롤 안** — footer 없음 (`RegistrationPhoneStep.tsx:118-174`, `PhoneVerificationBox.tsx:782-802`) |
| 3 주소 | `/auth/onboarding/address` → `/mypage/addresses?returnTo=…` | `components/auth/RegistrationAddressStep.tsx` → 주소 화면들 | 가운데 팝업 → 일반 페이지 | 팝업은 footer 고정 (`RegistrationAddressStep.tsx:55-66`) · 주소 화면은 §4 |

## 2. 전화 단계 결함 (Owner 지목 화면)

### 2-1. 키보드가 [계속] 버튼을 가린다 — **FAIL (코드 확인 · 모사 재현 · 실기 NOT_PROVEN)**

원인 3겹:

| # | 원인 | 근거 |
|---|---|---|
| P1 | [계속]이 **본문 스크롤 안**, 번호 칸 바로 아래 20px 뒤에 있다. 키보드가 열리면 팝업 높이가 줄고(보이는 높이 − 32), 포커스 보정은 **번호 칸만** 보이게 올린다 → 버튼은 팝업 아래로 잘린다. | `PhoneVerificationBox.tsx:782-802` (`mt-5` 본문 버튼) · `AuthGateOverlay.tsx:68-74`(높이만 줄임) |
| P2 | 키보드 위로 버튼을 같이 올리는 공용 장치(K-07 `data-form-keyboard-keep-visible`)가 있는데 **안 붙어 있다.** 이 장치는 `<form>` 안의 표식 버튼만 찾는데, 전화 칸은 `<form>` 도 표식도 없다. 아이디 로그인(`PasswordLoginForm.tsx:70,126`)에는 붙어 있다. | `lib/ui/form-keyboard-viewport-contract.ts:689-697` · `use-form-keyboard-focus-visibility.ts:85` |
| P3 | **iPhone**: 앱에 키보드 플러그인이 없어 키보드가 열려도 화면 높이가 줄지 않는다. 팝업은 **전체 화면 기준 가운데**에 그대로 있고 높이만 줄어 → 팝업 아래쪽 절반이 키보드 뒤로 들어간다. 팝업 위치를 「키보드 위 보이는 영역」 기준으로 옮기는 코드가 없다(`stageStyle` 미사용). | `DibayOverlayRoot.tsx:150-195` · `app/dibay-overlay.css:67-86`(fixed top0·bottom0 가운데) · `package.json`(`@capacitor/keyboard` 없음) |

그 위에 **본문이 너무 길다** — 로고 52 + 제목 + 설명 2줄 + 아이콘 원 72 + 안내 2줄 + 국가 줄 56 + 번호 줄 56 + 버튼 72 + 출구 안내 2줄·링크 = 본문 약 **655px**(모사 측정). 팝업 상한 640(키보드 닫힘)·약 450~480(키보드 열림)보다 길어 **키보드가 없어도 하단이 스크롤 밖**이다. 아이콘 원·안내는 팝업 제목·설명과 같은 말을 반복한다(내정보 「페이지」용 장식이 팝업에 그대로 들어옴).

모사 결과 (실제 CSS 값으로 만든 로컬 화면 · Chromium · 실기 아님):

| 조건 | 팝업 최대 높이 | 번호 칸 아래 | [계속] 위치 | 보이는 영역 아래 끝 | 판정 |
|---|---|---|---|---|---|
| 키보드 닫힘 360×780 | 640 | 512 | 549~601 | 690 | 보임 |
| Android 키보드(adjustResize, 높이 300 가정) 360×480 | 448 | 458 | 495~547 | 444 | **가려짐** (번호 칸도 반쯤 잘림) |
| iPhone 390×844 키보드 336 | 476 | 492 | 529~581 | 508 | **가려짐** (팝업 하단 약 150px 이 키보드 뒤) |

캡처: `docs/audit/registration-keyboard-cta-2026-11-27/sim-android.png`, `sim-ios.png`.

### 2-2. 취소(나가기) 버튼이 안 보인다 — **FAIL (코드 확인)**

- 전화 단계에는 **취소 버튼이 없다.** 나가는 길은 본문 맨 아래 작은 글자 링크 「고객센터」·「로그아웃」뿐이다(`RegistrationStepLater.tsx:16-31`, 12px 안내 2줄 아래). 본문이 길어 키보드가 없어도 스크롤해야 보이고, 키보드가 열리면 **완전히 안 보인다**.
- 하드웨어 뒤로가기는 막혀 있다(`holdHardwareBack` — `DibayOnboardingOverlayShell.tsx:41`) → 사용자는 빠져나갈 방법을 못 찾는다.
- 팝업 SSOT §3-4: 「버튼 2개 = 가로 1:1 · **취소 왼쪽 · 확정 오른쪽**」. 가입 단계의 취소 동작은 이미 정해져 있다 — Owner 2026-11-24 「건너뛰기 없음, 둘러보기는 로그아웃 뒤 비로그인으로」(`RegistrationStepLater.tsx:10-13`). 즉 **취소 = 지금의 로그아웃(확인창 포함)** 이며 새 동작이 아니다.

### 2-3. 버튼 모양이 팝업 SSOT 와 다르다 — **FAIL (코드 확인)**

| 자리 | 지금 | 팝업 SSOT (§3-3·3-4) |
|---|---|---|
| [계속]·완료 [확인] | 높이 52 · `rounded-full` · 17/700 · 본문 안 (`PhoneVerificationBox.tsx:491-492`) | 높이 48 · 반경 12 · 15/600 · **고정 하단** (`OverlayUi.btn.primary`) |
| 같은 가입 흐름 동의·주소 버튼 | 48 · 12 · 15/600 · 고정 하단 | — (전화만 다름) |
| [다시 보내기] | 글자 버튼 높이 40 · 15/600 | 글자 버튼 — 높이 48 |
| 「번호 변경」 | 높이 없음(글자 높이 약 20) · 14/600 | 누르는 영역 최소 44 |
| 오류 글자 | 13px | 캡션 12 |
| 번호·인증번호 큰 글자 | 22/700 | 제목 20/700 |

### 2-4. 인증번호(6칸) 화면 — **FAIL (코드 확인)**

- 6칸 입력이 `autoFocus` 라 화면이 바뀌자마자 키보드가 열린다(`PhoneVerificationBox.tsx:676`). 6칸 아래 [다시 보내기]·출구 링크가 같은 이유(P1·P3)로 키보드 뒤로 간다.
- 6자리를 치면 자동 확인이라 확인 버튼은 없어도 되지만(설계 2026-11-09), **취소·번호 변경**이 키보드 위에 남아야 한다.

### 2-5. 국가 선택 화면 — 경미

- 뒤로 버튼(‹)이 팝업 안 머리에 있어 동작은 맞다. 팝업 안에 또 머리를 만든 것은 SSOT 「④ 선택 시트」 형태가 아니지만 Owner 지목 결함이 아니므로 **이번 수정 범위 밖**(기록만).

## 3. 동의 단계 — 확인 결과

| 항목 | 판정 |
|---|---|
| 주 버튼 고정 하단(48·12·15/600) | 코드 PASS (`AuthConsentForm.tsx:313-329`) |
| 입력칸 | 생년월일 선택 등 — 키보드형 입력 아님, 버튼이 footer 라 가려지지 않음: 코드 PASS |
| 취소 | 본문 맨 아래 글자 링크(고객센터·탈퇴·로그아웃) — 전화 단계와 같은 문제(스크롤해야 보임). **FAIL** — 같은 수정으로 맞춘다 |
| iPhone 키보드 | 동의 화면에 글자 입력칸이 없으면 해당 없음 — 실기 NOT_PROVEN |

## 4. 주소 단계

가입 주소 단계 팝업의 [주소 등록하기] → 일반 주소 화면 4개를 지난다. 가입 관문이 이 화면들을 덮지 않는다(`profile-setup-flow.ts:67` → `isMypageAddressFlowPath`, `mypage-addresses-return-to.ts:28-34`) — 코드 PASS.

| 화면 | 입력칸 | 주 버튼 (높이·반경·글자) | 키보드 | 뒤로 |
|---|---|---|---|---|
| ① 주소 목록 `/mypage/addresses?returnTo=` | 없음 | 빈 목록 버튼 `Sam.btn` 46·4·14 (`AddressManagementClient.tsx:432-441`) · 검색 진입 52·4 | 해당 없음 | 가입 주소 팝업으로 (`:242-251`) — PASS |
| ② 검색 | 검색칸 1개 (`AddressEditorLocationSearch.tsx:57-71`) | 없음(결과 줄 누름) · 「현재 위치」 46·4·14 | 가릴 고정 버튼 없음 — PASS | 목록 |
| ③ 지도 | 없음 | 「이 위치로」 46·4·14 하단 바 (`AddressMapConfirmClient.tsx:211-222`) | 입력 없음 — 해당 없음 | 목록(주석은 「검색」, 검색이 replace 돼 실제 목록 — 경미, 범위 밖 기록) |
| ④ 상세·저장 | 상세주소 1칸 (`AddressPlatformDetailClient.tsx:522-543`) | [저장] **52·4·16·`disabled:opacity-50`** — **본문 맨 아래**(이름 선택·대표 토글 아래) (`:744-753`) | **FAIL** — 상세주소를 치는 동안 [저장]은 키보드 아래 스크롤 밖. 포커스 보정은 입력칸만 올린다(`:121-124`). 코드 주석 「키보드에 가려지지 않음」(`:663`)은 「스크롤하면 닿음」일 뿐 | 미저장 확인 후 목록 |

추가 결함 (가입 흐름에서 생김 · 코드 확인):

| # | 결함 | 근거 | 영향 |
|---|---|---|---|
| A1 | 저장 뒤 「주소 흐름 기록」(돌아갈 곳 = 가입 단계 주소)을 **다시 써 두고 지우지 않는다.** 지우는 곳은 목록 화면뿐 | `AddressEditorPageClient.tsx:285` | 가입을 마친 뒤 같은 앱 실행 안에서 내정보 › 주소를 열면 뒤로 대체 주소·주소 줄 누름이 **가입 단계 주소로** 이동 → 가입 단계 화면이 서버 판정으로 다시 튕김(완료 회원은 next 로) · 새 주소 대표 토글 기본 켜짐 |
| A2 | 저장 뒤 `replace` 만 해서 기록이 `[가입 주소 팝업, 주소 목록, 원래 화면]` 으로 남는다 | `AddressEditorPageClient.tsx:286` | 가입 완료 뒤 원래 화면에서 뒤로 → 주소 목록이 다시 나옴 |
| A3 | 버튼 3가지 모양: 가입 팝업 48·12·15 / 목록·지도 46·4·14 / 저장 52·4·16 + 비활성 투명도(앱 규칙 「불투명도 금지·회색 토큰」 위반, `samarket-components.css:173-176`) | 위 표 | 같은 가입 흐름에서 버튼이 화면마다 다름 |

판정: 주소 단계 **FAIL** — ④ 저장 버튼 키보드 가림 · A1·A2 흐름 기록 · A3 버튼 모양.

## 5. 수정안 (한 번에 · 같은 틀을 쓰는 가입 3단계 모두)

### 5-1. 원칙 — 가입 단계 화면 1가지 틀 (SSOT)

`DibayOnboardingOverlayShell` 하나만 쓰고, 다음을 **틀이 강제**한다(단계 화면이 따로 만들지 못하게):

| 자리 | 내용 |
|---|---|
| 머리 | 로고 · 제목 1줄 · 설명(14/400) |
| 본문(스크롤) | 입력칸·선택·안내 |
| **고정 하단 (footer)** | 버튼 2개 가로 1:1 — **왼쪽 [취소](보조) · 오른쪽 주 버튼** · 높이 48 · 반경 12 · 15/600 (`OverlayUi.btn.*`) · 그 아래 한 줄 「고객센터」 글자 링크 |
| 키보드 | footer 가 **항상 키보드 바로 위**에 보인다(아래 5-3) |

- [취소] = 지금 「로그아웃」과 같은 동작·같은 확인창(`LogoutActionTrigger`). 새 동작·건너뛰기 없음(Owner 11-24 유지). 문구 키 신규 `auth_reg_cancel`「가입 취소」/ "Cancel sign-up" — 확인창 문구는 기존 로그아웃 확인 그대로.
- 동의 화면의 「탈퇴」 링크는 기존대로 본문에 둔다(재동의 회원용).

### 5-2. 전화 단계 — 버튼을 footer 로

- `PhoneVerificationBox` 에 **버튼을 밖으로 내주는 방식**을 추가한다: `surface="overlay"` 일 때 [계속]·완료 [확인]을 본문에 그리지 않고 부모가 footer 에 놓을 수 있게 상태(`label`·`disabled`·`onPress`)를 넘긴다. 내정보 화면(`surface="page"`·`compact`)은 **지금 그대로**.
- 단계별 footer:
  | 화면 | 왼쪽 | 오른쪽(주) |
  |---|---|---|
  | 번호 입력 | 가입 취소 | 계속 (형식 맞을 때만 활성 — 기존 규칙) |
  | 국가 목록 | 가입 취소 | (없음 — 줄을 누르면 선택) → 버튼 1개 전폭 |
  | 인증번호 6칸 | 가입 취소 | 다시 보내기 (대기 중이면 「n초 후 다시 보내기」 비활성) |
  | 완료 | — | 확인 (기존 1.2초 자동 이동 유지) |
- 팝업 본문에서 **아이콘 원 72px·안내 반복 문구를 뺀다**(팝업 제목·설명이 이미 같은 말). 관리자 안내 문구(`guide_text`)가 있으면 설명 아래 14px 한 단락으로만. → 본문 약 655 → 약 380px, 키보드가 열려도 번호 칸 + footer 가 한 화면에 들어간다.
- 「번호 변경」 누르는 영역 44px · 오류 12px · 큰 번호 20/700 으로 팝업 글자 5단계에 맞춘다.

### 5-3. 키보드 — footer 를 키보드 위에

- `AuthGateOverlay` 가 이미 읽는 키보드 측정값(`useFormKeyboardViewport` — `keyboardOpen`·`visualViewportHeight`·`visualViewportOffsetTop`)으로 **팝업 루트의 위치를 「보이는 영역」에 맞춘다**: 키보드가 열려 있으면 루트 `top = offsetTop`, `height = visualViewportHeight`(`stageStyle`, 이미 있는 `DibayOverlayRoot` 인자). Android(adjustResize)는 값이 같아 변화 없음, **iPhone 은 팝업이 키보드 위로 올라온다**(P3 해결).
- footer 는 스크롤 밖이라 팝업이 보이는 영역 안에 있는 한 항상 보인다(P1 해결). 포커스 보정은 footer 위를 경계로 계산한다 — 기존 장치(`data-form-keyboard-footer='1'`, `use-form-keyboard-focus-visibility.ts:52-63`)를 가입 footer 에 붙인다(P2 대신 같은 효과, `<form>` 감싸기 불필요).
- 같은 틀을 쓰는 화면(로그인 필요 팝업 `AuthModal`, 동의·주소)도 함께 좋아지며 동작(열고 닫기·뒤로가기)은 바꾸지 않는다.

### 5-3b. 주소 저장 화면 — 앱 화면 SSOT 하단 고정 버튼

- [저장]을 본문 맨 아래에서 **하단 고정 바**로 옮긴다. 지도 화면이 이미 쓰는 내정보 하단 고정 버튼(`MY_STICKY_CTA_PRIMARY_BUTTON_CLASS`, `MyStickyCta`)과 같은 것 — 앱 화면(페이지) 버튼 SSOT 는 `Sam.btn`(46·4·14, `design-tokens.css`)이고, 팝업 SSOT(48·12)는 팝업에만 쓴다. 바에 `data-form-keyboard-footer='1'` + 아래 여백 `effectiveBottomInset`(키보드 높이) → 상세주소 입력 중에도 [저장]이 키보드 바로 위.
- `h-[52px] text-[16px] disabled:opacity-50` 덮어쓰기를 지워 앱 버튼 표준(회색 비활성)으로.
- 목록 빈 화면·지도 버튼은 이미 `Sam.btn` 표준 — 변경 없음.

### 5-3c. 주소 흐름 기록 (A1·A2)

- 저장 성공 때 돌아갈 곳이 **가입 단계 주소**면 흐름 기록을 쓰지 않고 지운다(가입 단계 팝업이 서버 판정으로 다음 화면을 정한다 — 기록이 필요 없음). 내정보·배달 등 다른 호출자는 지금 그대로.
- A2(뒤로 하면 주소 목록이 다시 나옴)는 **이번 수정에 넣지 않는다.** 기록을 몇 칸 되돌리는 방식은 검색·지도·저장 화면의 push/replace 조합에 따라 칸 수가 달라 안전한 방법을 코드로 확정하지 못했다(확인 못 함). 결함으로 기록만 하고, 이번 수정 실기 때 실제 뒤로 동작을 캡처해 다음 설계 근거로 쓴다.

### 5-4. 바뀌는 파일 · 영향 (설계 규정 4)

| 파일 | 변경 | 영향받는 화면 | 깨질 수 있는 것 · 같은 단계에서 처리 |
|---|---|---|---|
| `components/auth/AuthGateOverlay.tsx` | 키보드 열림 때 루트 위치를 보이는 영역에 · footer 에 `data-form-keyboard-footer` | 가입 3단계 · 로그인 필요 팝업(`AuthModal`) · 소셜 로그인 충돌 팝업 | 키보드 없는 경우 값 미적용(지금과 같음) · Android 는 같은 값 → 테스트로 고정 |
| `components/auth/DibayOnboardingOverlayShell.tsx` | footer = [취소 · 주 버튼] 2칸 고정 · 「고객센터」 한 줄 | 동의·전화·주소 | 동의 화면 주 버튼·오류 문구 위치 그대로 footer 안 |
| `components/auth/RegistrationStepLater.tsx` | 본문 출구 → footer 로 이동(문구 키 그대로) | 전화·주소 | 기존 `data-registration-step-escape` 테스트 갱신 |
| `components/auth/RegistrationPhoneStep.tsx` | `PhoneVerificationBox` 버튼 상태를 받아 footer 에 | 전화 단계 | 중복 번호 안내·빈 계정 정리 버튼은 본문 그대로 |
| `components/mypage/profile/PhoneVerificationBox.tsx` | `surface="overlay"` 일 때만 버튼 밖으로 · 아이콘·반복 안내 숨김 · 글자 크기 | 가입 전화 단계 · **내정보 전화 인증 시트**(`PhoneVerificationSheet.tsx:86`, 같은 `overlay`) | 내정보 시트도 같은 footer 방식이 필요 → 같은 PR 에서 시트 footer 에 연결(안 하면 시트에서 버튼이 사라짐) · `page`·`compact`(내정보 화면·프로필 편집)는 무변경 |
| `components/auth/AuthConsentForm.tsx` | footer 에 [가입 취소] 추가 | 동의 | 재동의 회원은 [취소] 대신 기존 출구 유지 여부 — 재동의는 이미 가입한 회원이라 「가입 취소」가 틀린 말 → 재동의일 때 왼쪽 버튼 = 「로그아웃」(같은 동작, 문구만) |
| `components/addresses/AddressPlatformDetailClient.tsx` | [저장] 하단 고정 바 · 키보드 위 · 덮어쓰기 제거 | 모든 주소 추가·수정(내정보·배달·거래 지역·가입) | 배달 목적 화면(같은 파일 다른 분기)은 무변경 · 미저장 확인 시트 그대로 |
| `components/addresses/AddressEditorPageClient.tsx` | 가입 단계로 돌아갈 때 흐름 기록 지움 | 가입 주소 저장 | 다른 returnTo 는 무변경 |
| `lib/i18n/catalog/auth-ui.ts` | `auth_reg_cancel` ko·en | — | `check:i18n-quality` |
| 테스트 | 가입 틀 footer 2버튼·순서·클래스 · 전화 단계 버튼이 footer 에 있음 · 키보드 열림 때 루트 위치 · 내정보 시트 버튼 존재 | — | — |

`[배포 구분]` 웹만 (네이티브·DB 변경 없음 — 키보드 플러그인 추가 안 함).
통화 규정 확인: 통화 코드·API·푸시 무관.

### 5-5. 검증 계획

1. 로컬: `typecheck:build`·`typecheck:test`·관련 vitest·eslint·`check:i18n-quality`·`ci:static` 1회.
2. 실기(Owner 폰 기준 · 실행 10회 이내 · 운영 Supabase 약 195건/회): 새 소셜 계정이 필요 — Android 시험폰 1대로 **신규 가입 전체**(동의 → 번호 입력 키보드 열림 캡처 → 인증번호 6칸 키보드 열림 캡처 → 주소 검색 키보드 열림 캡처 → 저장 → 원래 화면). 각 캡처에 [취소]·주 버튼이 키보드 위에 보이는지 기록. iPhone 은 Owner 폰으로 같은 항목(작업자 직접 조작 불가 → NOT_PROVEN 으로 남기고 Owner 확인 요청).
3. 내정보 › 전화 인증 시트 키보드 열림 1회(회귀 확인).

## 6. 시안 v3 구현 결과 (Owner 2026-11-27 「v3대로 구현」)

시안: `registration-keyboard-cta-2026-11-27/mockup-v3.html` (그림 `v3-1~5.png`). 앞의 §5(팝업·시트 안)는 Owner 지시로 폐기 — 가입 단계는 **팝업 없는 전체 화면**.

### 6-1. 바뀐 파일
| 파일 | 변경 |
|---|---|
| `components/auth/RegistrationPageShell.tsx` (신규, 옛 `DibayOnboardingOverlayShell` 대체) | 전체 화면 틀: 맨 위 줄 「회원가입」 · 제목·입력 위쪽 · 하단 고정 줄 [가입 취소 · 주 버튼] + 고객센터(회원탈퇴) · 화면을 보이는 영역(visualViewport)에 고정 → 키보드가 열리면 하단 줄이 키보드 바로 위 · Android ◁ 머묾 |
| `components/mypage/profile/PhoneVerificationBox.tsx` | `registration` 인자를 줄 때만 가입 배치(`renderRegistration`) — 그림 2-1~2-6·3-1~3-3. 버튼 「인증번호 받기」·「인증하기」(「확인 중…」)·「확인」은 하단 줄로(포털). 내정보 배치는 무변경 |
| `components/auth/RegistrationPhoneStep.tsx` | 새 틀 · 국가 선택 때 맨 위 줄 「‹ 국가 선택」 · 완료 때 [가입 취소] 숨김 · 중복 번호 안내(문구·동작 그대로) |
| `components/auth/AuthConsentForm.tsx` | 새 틀 · 흰 줄+구분선 · 체크 22 · 라벨 15/500 · 필수·선택 같은 칩 · [보기] 줄 오른쪽 · 회색 상자 → 12px 안내 · 생년월일 들여쓰기 30 · 재동의 회원은 맨 위 줄 「서비스 이용 동의」·왼쪽 버튼 「로그아웃」 |
| `components/auth/RegistrationAddressStep.tsx` | 새 틀 · [가입 취소 · 주소 등록하기] |
| `components/auth/RegistrationStepLater.tsx` | 본문 출구 링크 → 도움말 한 줄(`RegistrationStepHelp`) |
| `components/my/settings/LogoutContent.tsx` | `sticky_secondary` 모양 · 확인창 제목·설명 지정 |
| `components/addresses/AddressPlatformDetailClient.tsx` | 일반 주소 [저장] = 하단 고정 줄(배달 화면과 같은 `MyStickyCta`) · 반투명 비활성 제거 |
| `components/addresses/AddressEditorPageClient.tsx` | 가입 단계로 돌아갈 때 주소 흐름 기록 지움(A1) |
| `lib/i18n/catalog/auth-ui.ts` | 새 키 4개(ko·en): `auth_reg_header` 회원가입 · `auth_reg_cancel` 가입 취소 · 확인창 제목·설명 |
| `app/dev/registration-keyboard` · `components/dev/RegistrationKeyboardProofClient.tsx` · `lib/auth/guest-browse-access-policy.ts` | 기기 확인용 개발 화면(운영 빌드 404 · 기존 `/dev/*` 확인 화면과 같은 방식) |
| 테스트 | `registration-page-v3-contract.test.ts`(신규 9) · 기존 계약 3개 갱신 |

`[배포 구분]` 웹만 — 네이티브·DB 변경 없음. 통화 코드 무관.

### 6-2. 시안 그림 ↔ 기기 대조 (로컬 개발 서버 · 같은 코드 · 운영 아님)
조건: Samsung SM-M156S **Chrome**(실제 키보드, `interactive-widget=resizes-content` = 앱 adjustResize 와 같은 방식) · iPhone 17 Pro **시뮬레이터 Safari**(iOS 26.5) · 화면 폭 360(Android)·402(iPhone) · 2026-11-27 02:09~02:27 PHT. 캡처 `registration-keyboard-cta-2026-11-27/v3-device/`.

| 그림 | 내용 | Android | iPhone |
|---|---|---|---|
| 2-1 | 번호 화면 처음 · 버튼 회색 「인증번호 받기」 | 같음 (`a-21`) | 같음 (`i-21`) |
| 2-2 | 번호 입력·키보드 열림 · 번호 칸 위쪽 그대로 · 하단 줄 키보드 바로 위 · 버튼 켜짐 | 같음 (`a-22`) — 아래 차이 ① | 같음 (`i-22`) |
| 2-3 | 형식 오류 · 밑줄 빨강 · 「형식에 맞지 않습니다.」 | 같음 (`a-23`, 키보드 닫힘) | 확인 안 함 |
| 2-5 | 국가 선택 · 맨 위 줄 ‹ 국가 선택 · 하단 [가입 취소] 전폭 | 같음 (`a-25`) | 확인 안 함 |
| 2-4 · 2-6 | 발송 중 · 중복 번호 | **NOT_PROVEN** — 문자 발송 API 가 필요(확인 화면은 서버를 부르지 않음) | NOT_PROVEN |
| 3-1 | 6자리 · 키보드 열림 · 6칸 위쪽 · [인증하기] 회색 · 「n초 후 다시 보내기」 회색 | 같음 (`a-31`) | 같음 (`i-31`) |
| 3-2 | 6자리 입력 → 「확인 중…」 | 같음 (`a-32`) | 확인 안 함 |
| 3-3 · 3-4 | 인증 완료 · 가입 취소 확인창 | **NOT_PROVEN** — 완료는 실제 인증 성공 필요 · 확인창은 누르지 않음(로그아웃 동작) | NOT_PROVEN |
| 1-1 · 1-2 | 동의 첫 화면·끝까지 | 같음 (`a-11`·`a-12`) | 같음 (`i-11`) |
| 4-1 | 대표 주소 안내 | 같음 (`a-41`) | 확인 안 함 |
| 5-1 | 주소 저장 · 키보드 열림 · [저장] 키보드 바로 위 | 같음 (`a-51`) | 같음 (`i-51`) |

시안과 다른 점(작업자 판단 — 승인 필요 시 지시):
1. Chrome 에서는 주소창·자동완성 줄이 약 100px 를 차지해, 키보드가 열리면 제목이 조금 위로 밀리고(2-2) 형식 오류 줄이 하단 줄에 가린다(2-3). **앱(WebView)에는 그 줄이 없어** 시안처럼 보일 것으로 계산되지만 앱 실기는 NOT_PROVEN — 병합·배포 뒤 앱에서 확인 필요.
2. [가입 취소]는 앱 보조 버튼 표준 색(연한 회녹색 바탕 · `Sam.btn.secondaryCombo`) — 시안 그림은 흰 바탕 테두리로 그렸다.
3. 국가 이름 「한국」 — 시안 그림의 「대한민국」은 작업자 오기, 운영 문구는 「한국」.
4. 재동의(기존 회원) 맨 위 줄은 「회원가입」이 아니라 「서비스 이용 동의」(시안에 없던 경우 — 기존 회원에게 「회원가입」이 틀린 말이라 기존 문구 사용).

### 6-3. 확인 중 작업자 잘못
- 1차 확인 서버를 본 저장소 폴더에서 띄워 Tailwind 가 이 작업의 새 클래스(예 `pl-[30px]`)를 만들지 않았다 → 생년월일 들여쓰기가 안 보이는 화면을 「같음」으로 볼 뻔함. 작업 폴더 기준으로 다시 띄워 전부 다시 캡처했다(위 표는 다시 찍은 것, `a-32` 만 1차 서버 캡처).
- Samsung 에서 ◁ 키가 Chrome 을 닫아, 이어진 탭·입력 몇 번이 운영 DIBAY 앱(그 폰에 실행 중이던 q테스트1)에 들어갔다 — 홈 → 「이벤트」 화면 열림 → 홈. 저장·전송 없음, 숫자 입력은 칸 없이 버려짐. 앱 새 실행 0회. 이후 탭마다 앞 화면이 Chrome 인지 확인했다.
- 확인 화면은 운영 Supabase 를 부르는 앱 공통 호출(세션·홈 피드 등)이 로컬 서버에서 일부 나갔다(비로그인 읽기 몇십 건 수준, 정확한 수 미집계).

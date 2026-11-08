# 언어(한국어·영어) SSOT 감사 · 설계안 — 2026-11-08

- 기준: 작업 트리 HEAD `7acd866c2` (브랜치 `fix/chrome-s1-back-unify`), 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회.
- 상태: **감사·설계만**. 코드·DB 변경 없음. 실기기(ko/en 화면) 확인 안 함 → 화면 판정은 전부 **NOT_PROVEN**.
- Owner 지시(2026-11-08 원문 요지): ① 한국어·영어 외 언어는 삭제, 한국어·영어만 ② 영어가 개발자 단어이거나 길게 나오는 문제가 없도록 명확하게 ③ 언어 부분이 SSOT 가 되도록 정확히 구현 ④ 기본은 기기 언어, 설정을 바꾸면 그 언어(같은 날 1차 지시).
- 함께 보는 문서: `docs/i18n-development-rules.md`, `docs/i18n-migration-roadmap.md`. 이 문서의 1차 감사(언어 결정 경로 D1~D9)는 §3 에 그대로 포함한다.

---

## 1. 측정 결과 (숫자는 스크립트·쿼리로 확인한 값만)

### 1-1. 한국어·영어 외 언어

| 위치 | 내용 | 판정 | 처리 |
|---|---|---|---|
| `lib/i18n/config.ts` | 지원 언어 `["ko","en"]` 만 | PASS(코드) | 유지 |
| 운영 DB 언어 열 | `app_legal_documents.locale` ko5·en5, `app_platform_business_info.locale` ko1·en1, `stores_browse_snapshots.ui_lang` ko40, 다국어 열은 `_ko`/`_en` 만 | PASS(DB) | 유지 |
| Android `res/values`, `values-en` | ko·en 만 | PASS | 유지 (내용 결함은 §3 D3) |
| `lib/product-backlog/product-backlog-utils.ts:173` | `zh-CN` 날짜 분기 | **FAIL — 잔재** | 삭제 |
| `components/admin/community-messenger/AdminCommunityMessengerDetailPage.tsx:510` | 문구에서 `" · 参与 0人"` 을 지우는 `.replace` | **FAIL — 잔재 + 땜빵** | 삭제, 대신 「참여 인원 없음」 전용 키 사용 |
| `lib/jobs/form-options.ts:221` `jobs_lang_tl`(타갈로그) | 구직자가 **할 수 있는 언어** 선택지(게시글 데이터) | 앱 UI 언어 아님 | 유지 (앱 언어와 무관) |
| `permission-education.ts:69` `i管家` | Vivo 폰 실제 메뉴 이름 | 앱 UI 언어 아님 | 유지 |
| `agora-playback-routing.ts:31,36` `扬声器/耳机` | 중국 폰 오디오 장치 이름 인식용 | 기능 코드 | 유지 |

### 1-2. 번역 원본 구조

| 항목 | 값 |
|---|---|
| 키 수 | 22,950 (ko·en 같은 키 수 — `check:i18n` PASS) |
| 원본 위치 | 카탈로그 TS 140개 + `messages/ko.json`·`en.json` 608키 (`lib/i18n/messages.ts` 가 펼쳐 합침, **뒤에 오는 파일이 앞을 덮어씀**) |
| 같은 키가 2곳 이상, 값 같음 | 211 |
| **같은 키가 2곳 이상, 값 다름** | **431** (어드민 사용 314, 미사용 117) — 화면 값은 import 순서가 정함 |
| 키 사용처(정적 검색) | 고객 7,527 · 사장님 1,483 · 어드민 7,413 · 개발 23 · 동적 키 744 · **미사용 후보 5,760** (동적 조합 키 누락 가능 → 삭제 전 재확인 필요) |
| **카탈로그 밖 문구** | `fallbackEn:` 2,858줄/333파일 · `{ko:"…",en:"…"}` 인라인 1,210줄/79파일 · `lang === "en" ? …` 513줄/128파일 · `tt("한국어")` 역검색 11줄 |
| 역검색(`tt`) 모호성 | 같은 한국어 문장에 영어가 2개 이상인 경우 1,314 — `tt` 는 마지막 키를 고름 |
| 영어 없을 때 동작 | `safeTranslate` 가 **반대 언어(한국어)를 표시** (`safe-translate.ts:76-78`) |
| DB 함수 한글 문자열 | 한글 문자열을 가진 public 함수 77개(주석 포함). 예: 메신저 `삭제된 메시지`·`사진`·`파일`·`사용자`, 포인트 원장 `Apple 결제 포인트 충전`. 영어 화면 노출 여부는 함수별 **NOT_PROVEN** |

### 1-3. 영어 문구 품질 (고객·사장님 화면 기준, 어드민 별도)

| 결함 | 고객 | 사장님 | 어드민 | 예 |
|---|---|---|---|---|
| 영어 값에 한글 | 7 | 1 | 257 | `cm_ui_unread` = 「안 읽음」(메신저 방, 영어 모드), `business_phase7_279` = 「지금 주문 가능」, 계정삭제 확인어 `계정삭제` 를 영어 사용자도 입력해야 함(서버 토큰 `lib/account/account-deletion-contract.ts:9` 고정) |
| 영어에 개발자 용어 | 50 | 14 | 226 | `Supabase is not connected or store tables are missing. Apply SQL migrations.`, `Check that posts.seller_listing_state exists in Supabase`, `Historical store operations ledger`, `VoIP (calls) registered`, `Enable fallback` |
| 한국어에 개발자 용어 | 31 | 15 | 129 | `별도 API 준비 후 제공`, `데이터베이스 스키마를 먼저 업데이트`, `RPC`, `캐시`(기기 캐시와 매장 「캐시」 화폐가 같은 단어) |
| 치환값 `{x}` ko·en 불일치 | 1 | 0 | 35 | `ui_group_chat_intro` en 에만 `{id}` → 미치환으로 판정돼 **한국어로 바뀌어 표시**. 어드민은 `당일 항목 {count}건` → `Board Today Items` (키 이름을 영어로 펼친 개발자 문구) |
| 짧은 자리(탭·버튼·칩·배지)에서 영어가 한국어보다 1.4배 이상 넓고 7글자폭 이상 | 114 (고객·사장님) | | | `알림`→`Notifications`, `상품권`→`Gift certificates`, `중복 확인`→`Check availability`, `상품권 판매 신청`→`Apply to sell gift certificates` |
| 같은 한국어 용어의 영어가 제각각 | | | | 내정보 → My page 10·Profile 8·Account 8·My profile 7·My info 6 / 동네 → neighborhood 45·area 15·region 13·local 7 / 관심 → interest 10·saved 10·favorite 5·wishlist 1·like 3 / 탈퇴 → leave 6·withdraw 5·delete account 3·account deletion 2 |

### 1-4. 어드민 등록 이름의 영어 (운영 DB)

| 표 | 전체 | `name_en` 비어 있음 | 영어 모드 표시 |
|---|---|---|---|
| `community_topics` | 9 | 6 (일상생활·필리핀 뉴스·필리핀생할·질문있어요·추천·여행정보) | **한국어 그대로** — `community-topic-label-i18n.ts:31-33` 가 en 없으면 ko 이름을 씀 → FAIL |
| `categories`(거래) | 6 | 5 | `icon_key` → 카탈로그 키로 대체(코드상) — 화면 NOT_PROVEN |
| `store_categories` | 8 | 8 | slug → 카탈로그 키로 대체(코드상) — 화면 NOT_PROVEN |
| store_topics·point_plans·feed_ad_products·notification_sound_events | 35·4·4·70 | 0 | 영어 있음 |

참고(보고만): `community_topics` 이름 「필리핀생할」 오타(생활), slug `phlifee` 오타.

---

## 2. 원인

1. **문구 원본이 하나가 아니다** — 카탈로그 140 + JSON 2 + 코드 안 영어(`fallbackEn`·인라인·삼항 약 4,600줄) + DB 함수 한글 + 어드민 입력 이름. 같은 키가 다른 값으로 431번 정의돼 있고 어느 값이 이기는지는 import 순서다.
2. **영어가 비면 한국어를 보여 준다** — `safeTranslate` 반대 언어 대체, 주제 이름 ko 대체, 치환값 불일치 시 한국어 대체. 그래서 영어 모드에 한국어가 섞인다.
3. **영어 문구 규칙·검사가 없다** — 용어집·금지어·길이 기준이 없다. `check:i18n` 은 키 대칭·빈 값만 본다. 오류 상황 문구를 개발 중 안내문(테이블·마이그레이션·Supabase)으로 쓴 채 고객 화면에 남았다.
4. **언어 결정이 한 곳이 아니다** — §3 D1~D9 (기기 seed 고정, 기기 값이 계정 설정을 덮음, 폐기 열 사용, 서버 기본 ko, 헤더 미전달, 쿠키 이름 오류).

---

## 3. 언어 결정 경로 결함 (1차 감사, 그대로 유지)

| ID | 심각도 | 결함 | 근거 |
|---|---|---|---|
| D1 | 높음 | 기기 언어를 첫 실행 1회만 읽고 「사용자 선택」으로 저장·DB 업로드 → 기기 따름 상태가 운영에 0건 | `language-preference.ts` `resolveImplicitAppLanguage`, `reconcile-user-settings-language.ts`, DB `user_settings` ko96·en38·`""`0 |
| D2 | 높음 | 로그인 상태에서도 기기 저장값이 DB 를 이기고 DB 를 덮어씀(기기 간·계정 전환) | `readLoggedInExplicitAppLanguage`, `AppLanguageProvider.tsx:191-195`, `dibay-session-policy.ts:29-31` |
| D3 | 높음 | 네이티브 통화·알림 채널·권한 문구가 앱 언어를 안 따름(iOS 한국어 고정, Android 기본 한국어·영어 11/56) | `NativeVoiceCallViewController.swift:96-120`, `Info.plist:63-73`, `DibayNotificationChannelRegistry.java:32` |
| D4 | 중간 | 폐기 열 `profiles.preferred_language` 사용(채팅 목록 RPC·알림 대체), 설정과 다른 사용자 25/134 | 운영 `get_chat_rooms_snapshot`, `notification-user-language.ts` |
| D5 | 중간 | 서버 기본값 ko·DB 열 기본 `'ko'` → 설정 행 신규 생성 시 한국어 명시 선택으로 저장 | `config.ts DEFAULT_APP_LANGUAGE`, `notification-settings/route.ts`(HEAD:203) |
| D6 | 중간 | 배달 ETA·어드민 미리보기 요청에 앱 언어 미전달 | `store-delivery-api-client.ts:1031` |
| D7 | 낮음 | 스토어 9페이지가 없는 쿠키 `sam_lang`/`app_lang` 을 읽음 | `app/(main)/stores/**` |
| D8 | 낮음 | 소셜 로그인 콜백이 언어 쿠키 삭제 → 첫 화면 깜빡임 | `auth/callback/route.ts:315` |
| D9 | 낮음 | 언어 설정 화면 체크가 DB 캐시 우선 → 실제 언어와 어긋날 수 있음 | `LanguageSettingsContent.tsx:38-41` |

---

## 4. 목표 계약 (SSOT)

### 4-1. 언어 결정 — 단일 모듈 `lib/i18n/app-language-authority.ts`

| 상태 | 화면 언어 | 저장 |
|---|---|---|
| 비로그인, 선택 없음 | 기기 언어(ko 포함 → ko, 그 외 → en). **매번** 기기 값으로 계산 | 저장 안 함 |
| 비로그인, 토글로 선택 | 선택값 | 기기(localStorage+쿠키) |
| 로그인, DB 값 없음(`""`) | 기기 언어(매번 계산) | 저장 안 함 |
| 로그인, 토글로 선택 | 선택값 | DB `user_settings.preferred_language` (= 기준). 기기에는 화면 캐시 + 「미전송」 표시 |
| 로그인 상태에서 DB 와 기기 캐시가 다름 | **DB 값** (미전송 표시가 있을 때만 기기 값 업로드) | — |
| 로그아웃 | 기기 선택(비로그인 값) 유지. 계정 값은 다음 계정에 넘기지 않음 | — |

- 토글(`setLanguage`)만 「명시 선택」을 만든다. 자동 감지값은 어떤 경로로도 저장하지 않는다.
- 서버(SSR·API·알림)는 `resolveRequestLanguage(userId?, request)` 하나만 쓴다: DB 명시값 → 쿠키 명시값 → `Accept-Language` → en. 서버 상수 기본 `ko` 폐지.
- `profiles.preferred_language` 는 읽지 않는다(DB 함수 포함).
- 푸시처럼 요청이 없는 서버 경로에서 기기 따름 사용자의 언어: **Owner 결정 필요** (서버가 기기 언어를 모름. 안: 푸시 토큰 등록 시 `user_devices` 에 기기 언어 기록).

### 4-2. 문구 — 원본 1개

1. **원본 = `lib/i18n/catalog/*.ts` 만.** `messages/ko.json`·`en.json` 608키는 카탈로그로 옮기고 파일 삭제. 같은 키를 두 파일에 두면 검사 실패(현재 431+211 정리).
2. **화면 문구는 키로만.** `fallbackEn`/`fallbackKo`, 인라인 `{ko,en}`, `lang === "en" ? "…"`, `tt("한국어")` 는 신규 금지 + 기존은 도메인 순서로 이관. 이관 중에는 「현재 개수보다 늘면 실패」 기준선 검사.
3. **다른 언어로 대체 금지.** 영어 키가 없거나 치환값이 안 맞으면 **검사에서 실패**시키고, 실행 중에는 같은 언어의 공통 문장(`common_content_unavailable`)만 쓴다. 한국어를 영어 화면에, 영어를 한국어 화면에 보이지 않는다.
4. **DB 에는 화면 문장을 저장하지 않는다.** 메시지 미리보기·원장 설명 등은 종류 코드 + 값으로 저장하고, 화면에서 키로 그린다(기존 저장 행은 표시 단계에서 코드 매핑).
5. **어드민 등록 이름은 ko·en 둘 다 필수.** 저장 시 en 빈 값 거부. 영어 화면은 `name_en` → (없으면) slug 카탈로그 키 → 공통 문장. ko 이름·slug 를 그대로 펼친 영어는 쓰지 않는다.

### 4-3. 영어 문구 규칙 (`docs/i18n-ssot.md` §4 에 통합 + 검사로 강제)

- **용어집**(코드: `lib/i18n/glossary.ts`, 검사가 사용). 작업자 결정안:

| 한국어 | 영어 | 비고 |
|---|---|---|
| 내정보(허브·탭) | My page / 하단 탭 `My` | Profile=프로필, Account=계정 은 따로 |
| 동네 | Neighborhood | area·region·local 혼용 금지 |
| 관심(목록·해제) | Favorites | interest·saved·wishlist·like 혼용 금지 |
| 탈퇴 | Delete account | leave·withdraw 금지(채팅방 나가기 Leave 와 구분) |
| 상품권 | Gift certificate | |
| 매장 | Store | |
| 사장님 | Owner | |
| 후기 | Review | |
| 신고 | Report | |
| 캐시(매장 화폐) | Cash | |
| 캐시(기기 임시 데이터) | ko 「임시 데이터」 / en `Temporary data` | 매장 「캐시」와 같은 단어 금지 |

- **금지어**(고객·사장님 화면 ko/en): Supabase, migration/마이그레이션, schema/스키마, table·column/테이블·열 이름, RLS, RPC, API, JSON, UUID, payload, fallback, bootstrap, ledger(→ History/내역), slug, `.env`, 파일 경로, VoIP/FCM/Agora 같은 기술명. 오류 문구는 「무엇이 안 됐는지 + 할 수 있는 일」 한 문장, 기술 원인은 로그로만.
- **길이 기준**(영어 기준, 같은 자리 한국어도 동일 적용): 하단 탭 12자, 2단 탭·칩·배지 18자(넘치면 이름은 자르지 않고 가로 스와이프 — Owner 고정), 버튼 22자, 시트·화면 제목 40자, 토스트 80자. 키 끝말(`_tab`·`_chip`·`_badge`·`_btn`·`_cta`·`_title`)로 자리를 판정하고, 예외는 목록으로만 둔다.
- **표기**: 버튼·제목은 문장형 대문자(첫 글자만), 마침표 없음. 고유명사(DIBAY, Coin)만 대문자.

### 4-4. 검사 `npm run check:i18n-quality` (로컬 검증·CI 에 포함)

실패 조건: 두 파일 같은 키 / ko·en 치환값 불일치 / 영어 값에 한글(허용 목록 외) / 고객·사장님 키에 금지어 / 용어집 위반 / 한국어·영어 외 문자·언어 코드 / 카탈로그 밖 문구 개수가 기준선보다 증가. 경고: 길이 기준 초과(이관 완료 후 실패로 전환).

---

## 5. 단계 설계 (한 단계 = 작업 브랜치 → 검증 → main 1회)

| 단계 | 내용 | 바뀌는 파일 | 영향 화면·깨질 수 있는 것 → 같은 단계 처리 | 검증 |
|---|---|---|---|---|
| **S0** 계약·검사 | `docs/i18n-ssot.md`(본 §4, 기존 rules·roadmap 대체 링크), 용어집, `check:i18n-quality` + 현재 기준선 | docs, `scripts/`, `lib/i18n/glossary.ts` | 화면 변화 없음 | 검사 실행 결과 = §1 숫자와 일치 |
| **S1** 언어 결정 | D1·D2·D5(코드)·D6·D7·D8·D9, `app-language-authority.ts` 로 통합, Provider·설정 화면·서버 언어 함수 정리 | `lib/i18n/*`, `AppLanguageProvider`, `user-settings-store`, `reconcile-*`, 스토어 9페이지, `auth/callback`, 설정 화면 2곳, ETA 클라이언트 | 로그인/로그아웃/계정 전환/기기 2대 언어 — 단위 테스트 6경우 + 실기기 | vitest·typecheck + Android·iPhone ko/en 기기 언어·토글 행렬 |
| **S1-DB** | `user_settings.preferred_language` 기본값 `''`, `get_chat_rooms_snapshot` 이 `user_settings` 사용(D4), 기존 134행 처리(자동 seed 값인지 구분 불가 → **Owner 결정**) | `supabase/migrations` | 채팅 목록 문구 언어 | 운영 적용 **Owner 승인 후**, 적용 전후 대조 |
| **S2** 잔재·섞임 | zh-CN·参与 삭제, 영어 안 한글 8건(고객·사장님), 계정삭제 확인어 언어별(ko `계정삭제`/en `DELETE`, 서버 토큰을 언어별 상수 1곳에서), `ui_group_chat_intro` 치환값, 반대 언어 대체 제거, 주제 이름 ko 대체 제거 | catalog, `safe-translate.ts`, `community-topic-label-i18n.ts`, `account-deletion-contract.ts`·탈퇴 폼·API | 탈퇴 요청 API 계약 변경 → 폼·서버 같은 커밋 | 단위 + 영어 모드 탈퇴 화면 실기 |
| **S3** 개발자 용어 | 고객 50·사장님 14(en), 31·15(ko) 문구를 사용자 문장으로. 오류 상태는 공통 오류 문장 + 로그 | catalog, 해당 오류 분기 | 오류 화면 문구만 | 검사 금지어 0(고객·사장님) |
| **S4** 용어집 적용 | 내정보·동네·관심·탈퇴 등 혼용 일괄 통일, 짧은 자리 114건 축약 | catalog | 탭·버튼 폭 — 2단 탭 스와이프 규칙 확인 | 검사 용어집 0, 390px 폭 캡처 ko/en |
| **S5** 원본 1개 | JSON→카탈로그 통합, 중복 431/211 정리(현재 화면에 이기는 값 유지가 원칙, 값 다른 것은 표로 보고), 미사용 키 정리(동적 키 재확인 후) | catalog, `messages.ts`, `messages/*.json` 삭제 | 덮어쓰기 순서가 없어짐 → 화면 값 변동 0 확인 | 통합 전후 22,950키 값 대조 스크립트 |
| **S6** 카탈로그 밖 문구 이관 | `fallbackEn` 2,858 · 인라인 1,210 · 삼항 513 · `tt` 11 을 roadmap 도메인 순서(셸→탭→내정보→거래→채팅→매장→사장님→메신저→Philife→가입→어드민→lib)로 키 이관, 도메인별 1회 반영 | 도메인별 | 도메인별 화면 | 기준선 감소 확인 + 도메인 화면 ko/en |
| **S7** DB 문구·어드민 이름 | 어드민 이름 저장 시 en 필수(주제 6·거래 5·업종 8 빈 값 입력 — 영어 이름 데이터 입력은 Owner 승인), DB 함수의 화면 문장(메신저 미리보기·원장 설명) → 코드+키 | 어드민 폼·API, migrations | 기존 저장 행 표시 매핑 | 운영 적용 Owner 승인, 영어 모드 목록 확인 |
| **S8** 네이티브(D3) | iOS 통화·CallKit·권한 문구 지역화, Android `values-en` 56/56·기본 영어, 앱 언어 전달 브리지 | `ios/**`, `android/**` | **통화 변경 규정 적용** — 단독 계획·Owner 승인·실기기 행렬 | 통화 규정 §5 행렬 |
| **S9** 어드민 영어 | 어드민 영어 안 한글 257, 키 펼친 영어(`Board Today Items` 류)·치환 불일치 35 | admin catalog | 어드민 화면 | 검사 |

순서 근거: S0 검사가 있어야 이후 단계 숫자를 증명할 수 있고, S1 이 언어 결정을 한 곳으로 모아야 S2~S7 의 화면 확인이 의미가 있다. S8 은 통화 규정상 단독.

---

## 6. NOT_PROVEN · Owner 결정 필요

- NOT_PROVEN: 모든 화면 판정(실기기 ko/en 미확인), iOS WebView 기기 언어 전달, DB 함수 한글 문구의 영어 화면 노출 범위, 미사용 키 5,760 의 정확한 수(동적 키).
- Owner 결정 필요: ① 기존 `user_settings` 134행(자동 seed 와 사용자 선택 구분 불가) 처리 ② 기기 따름 사용자의 푸시 언어 기준 ③ 빈 영어 이름(주제 6·거래 5·업종 8) 영어 표기 확정 ④ 용어집(§4-3)은 작업자 결정안 — 바꿀 항목만 지시.

---

## 7. S0 기준선 (main `df3a81d03` 기준, `npm run check:i18n-quality`)

§1 숫자는 감사 시점 트리(`7acd866c2`, 키 22,950·카탈로그 140) 값이다. S0 검사는 최신 main(키 23,683·카탈로그 154·코드 9,466파일)에서 기준선을 만들었고, 이후 단계는 **이 기준선 숫자로** 증명한다.

| 규칙 | 기준선 | 비고 |
|---|---|---|
| duplicate-key | 344키 | 값 다른 중복 265키 전부 포함(독립 스크립트 대조) |
| placeholder-parity | 39 | 독립 스크립트와 일치 |
| hangul-in-en | 831 | 독립 스크립트와 일치 |
| foreign-script-catalog | 0 | Vivo `i管家` 허용 목록 |
| jargon-en / jargon-ko | 108 / 91 | 고객·사장님 키(사용처 미발견 키 포함, `admin_` 제외) |
| glossary | 85 | `lib/i18n/glossary.ts` |
| foreign-script-code | 3파일 5자 | 어드민 「参与 0人」 + 한국어 주석 한자 2(式·非) |
| foreign-locale-code | 1파일 2 | `product-backlog-utils.ts` zh-CN |
| non-catalog fallbackEn / 인라인 / 언어 삼항 / tt | 2,834 / 1,408 / 714 / 12 | `lib/i18n/**` 제외, 삼항은 ko·en 모두·변수명 7종 |
| length-budget(경고) | 47 | aria 제외 |

---

## 8. S2 결과 (잔재·섞임)

| 규칙 | S0 기준선 | S2 후 | 처리 |
|---|---|---|---|
| hangul-in-en (고객·사장님) | 6 | **0** | `cm_ui_unread` en 「Unread」, `business_phase7_279` ko·en 값이 서로 뒤바뀐 것 정정, 탈퇴 확인어 4키 → 언어별 상수 + `{word}` 치환 (`_ph`·`_word` 키 삭제) |
| hangul-in-en (전체) | 831 | 825 | 남은 825 는 어드민 키(S9) |
| placeholder-parity | 39 | 38 | `ui_group_chat_intro` en `{id}` → `room-ID`. 남은 38: 어드민 35(S9) + 사장님 `owner_copy_products_admin_lock_*` 3(ko 만 `{label}`, 호출부가 값을 넘김 — 화면 섞임 없음, 문구 정리는 계획 완료 후 감사) |
| foreign-script-code | 3파일 5자 | **0** | 어드민 「参与 0人」 문자열 지우기 땜빵 → 전용 표시(종류·상태·`admin_chat_calls_seconds`), 주석 한자 2자 |
| foreign-locale-code | 1파일 2 | **0** | `product-backlog-utils.ts` zh-CN 분기 삭제 |

- 실행 중 반대 언어 대체 제거: `translate`(en 없으면 ko 값), `safeTranslate`(반대 언어 키 → 반대 언어 fallback). 남는 대체는 같은 언어 공통 문장뿐.
- 커뮤니티 주제 라벨: 영어 화면에서 한국어 이름을 쓰지 않는다. 운영 DB 주제 9개 중 `name_en` 빈 6개(추천·필리핀생할·여행정보·일상생활·질문있어요·필리핀 뉴스) — 질문있어요(slug `question`)는 「Questions」, 나머지 5개는 「Topic」 으로 표시 → **FAIL(데이터)**, S7 에서 어드민 `name_en` 입력(Owner 승인) 전까지 남는다.
- 탈퇴: 공개 삭제 요청 화면 확인어가 화면 언어를 따른다(ko `계정삭제`/en `DELETE`). 서버 `POST /api/me/leave-request` 는 둘 다 허용, 오류는 코드(`confirmation_invalid`·`delete_request_save_failed`)만 — 한국어 오류 원문·DB 오류 원문을 화면에 보내지 않는다. 내정보 탈퇴(확인 시트)는 변경 없음(`계정삭제` 전송).

---

## 9. S3 결과 (개발자 용어)

| 규칙 | S2 후 | S3 후 | 비고 |
|---|---|---|---|
| jargon-en | 108 | **0** | |
| jargon-ko | 91 | **0** | |
| 고객·사장님 키(판정 기준) | 12,693 | 12,067 | 판정 정밀화로 591키를 어드민 키로 바로 분류 + 키 삭제 35 (전체 키 23,682 → 23,647) |

113키(en·ko 합집합) 처리 내역:

1. **판정 오류 40키 — 검사 정밀화(문구 변경 없음)**
   - `lib` 경유 어드민 키 34: `admin_biz_status_axis_*` 19, `admin_cm_slo_*` 9, `prod_mig_*` 6. 어드민 화면 문구라 S9 범위다.
   - 오탐 6: 사용자 안내 이메일 2(`account_delete_public_cta_email`·`account_delete_public_how_2`), `name@example.com` 1(`signup_email_placeholder`), 단위 표기 3(`owner_ads_package_daily_avg`·`post_preview_rent_car_daily`·`store_per_unit_suffix`).
2. **미사용 34키 삭제** — 코드·테스트·스크립트에서 리터럴·템플릿(`접두_${…}`) 참조 0 확인. 대부분 「API·DB 연동 후 표시」 같은 개발 단계 안내문. `business_phase7_001`(문장 조각)은 호출부를 한 문장으로 합치며 함께 삭제.
3. **사용 중 39키 — 사용자 문장으로 교체**
   - 오류 상태: 「무엇이 안 됐는지 + 할 수 있는 일」 한 문장. Supabase·마이그레이션·테이블·열 이름·`.env`·SQL 파일명을 화면에서 뺐다(예: `store_db_not_configured`, `chats_listing_save_schema_error`, `nav_messenger_migration_required`).
   - 사장님 업종 안내: 화면에 `business_type` 코드 표기를 그리던 조각 3개를 한 문장으로 합쳤다.
   - 알림 설정: SQL 파일명을 치환값으로 넘기던 것을 삭제했다.
   - 통화 화면 문구 4키(`cm_ui_media_*`, `cm_ui_call_failed_insecure_context_detail`): **카탈로그 값만** 바꿨다. 통화 코드(`lib/community-messenger/media-errors.ts` 등)는 바꾸지 않았다. 개발자용 설정 안내(Agora 키·`npm run dev:https`)는 화면에서 빠졌고, 로그로 옮기는 작업은 통화 규정상 별도 계획이 필요하다(계획 완료 후 감사).
   - 어드민 피드 긴급 3키(`feed_em_act_*`)는 고객 쪽 API(`/api/feed/emergency`)가 같은 모듈을 가져다 써서 고객 키로 판정됐다. 「Fallback」 → 「대체 피드」로 바꿨다.

---

## 10. S4 결과 (용어집·짧은 자리)

| 규칙 | S3 후 | S4 후 | 비고 |
|---|---|---|---|
| glossary | 82 | **0** | 문구 71키 통일 + 「지역·동네」 = Region and neighborhood 같은 정상 번역 11키는 규칙 정밀화(`requiredEn`)로 판정 제외 |
| length-budget | 37(경고) | **0 — 실패 규칙으로 전환** | 치환값 `{x}` = 3글자로 계산(`displayLengthForBudget`). 3키는 이 계산만으로 기준 안. 34키 축약 |

- 용어 통일: 캐시(기기) → 임시 데이터 / Temporary data(15), 내정보 → My page(15), 동네 → Neighborhood(17, 커뮤니티 피드 전환 탭 「Local」 → 「Neighborhood」), 탈퇴 → Delete account(11), 관심목록 → Favorites(3), 관심 사용자 → Favorite users(4), 관심이웃 → Following(3 + 화면 확인 중 발견 8), 상품권 gift cards → gift certificates(1), 매장 shop·merchant → Store(2).
- 관심이웃 8키는 검사가 놓친 것(금지어만 봄) — 화면 확인 중 발견해 같이 고치고, 규칙에 「Neighbor 만 쓰면 위반(Follow 있으면 허용)」을 보강.
- 390px 화면(로컬 개발 서버·비로그인): 커뮤니티 ko 「최신순 / 동네」, en 「Newest / Neighborhood」, 가로 넘침 0(scrollWidth 390). 내정보 설정 메뉴는 비로그인이라 **NOT_PROVEN**.
- 남은 것: 발견 목록 L6(상품권 Gift 100건 — Owner 결정), L7, L8.

---

## 11. S5 결과 (문구 원본 1개)

| 항목 | S4 후 | S5 후 |
|---|---|---|
| 키 (ko·en 각) | 23,647 | **22,076** (미사용 1,571 삭제) |
| duplicate-key | 344 | **0** |
| 원본 | 카탈로그 154 + `messages/*.json` 2 | **카탈로그 153** (JSON 삭제, 빈 카탈로그 3 삭제, 신규 2: `admin-console-core.ts` 406키·`app-shell-core.ts` 22키) |
| 화면 값 변동 | — | **0** — 통합 전후 `MESSAGES` 전수 대조(남은 22,076키 값 동일, 사라진 키 = 삭제 목록과 정확히 일치) |

- 중복 처리: 키마다 화면 값과 ko·en 이 같은 정의 1곳을 남기고 나머지 삭제. 값이 달랐던 239키 표 → `docs/audit/i18n-s5-duplicate-values-2026-11-08.md`.
- 미사용 판정(삭제 조건 전부 충족): 저장소 전체(최상위 파일·`contexts`·`services`·테스트·스크립트·SQL·네이티브·다른 작업 폴더 포함)에 키 이름이 단어로 0회 / 템플릿 문자열(`${…}`) 고정 조각이 키 이름에 없음 / 한국어 값이 코드 문자열로 쓰이지 않음(역검색 `tt`) / 운영 DB 코드값(알림 종류·아이콘 키 등)을 포함하지 않음.
- 판정 1차(2,109)는 `contexts/` 와 속성 접근을 놓쳐 typecheck 로 발견 → 되돌리고 2차(1,571)로 다시 실행(발견 목록 L10).
- 기존 테스트 2개가 화면에 나오지 않던 어드민 문구 4개를 기대하고 있었음 → 화면 값 기준으로 변경, 라벨 결정은 Owner(L9).
- 남은 위험: 키 이름 전체를 변수로 조합하는 코드(`t(prefix + id)` 의 prefix 가 변수)나 운영 DB 에만 있는 키는 정적 검사로 찾을 수 없다 — 이런 키가 지워졌다면 화면에 「내용을 불러올 수 없습니다」 공통 문장이 나온다(NOT_PROVEN, 실기 확인 필요).

---

## 12. S6 1단계 결과 (카탈로그 밖 문구 — 자동 이관)

| 규칙 | S5 후 | S6-1 후 | 방법 |
|---|---|---|---|
| `fallbackEn` | 2,834 | **263** | 키가 카탈로그에 있고 화면 값이 바뀌지 않는 경우만 대체 문구 삭제(치환값이 있으면 호출이 모두 넘길 때만). 2,571건 |
| 언어 삼항 | 714 | **4** | 문구 삼항 → `translateBy(lang, "key")`(원래 동작 그대로). 남은 4: 템플릿 모양이 달라 손 이관 2, 한국어 전용 접미사 「건」 2 |
| 문구 쌍 `pick(lang, "한", "En")` | (S6 신설) 341 | **272** | 같은 파일 안에서 정의가 확인된 pick 만 변환. 남은 272 는 다른 파일의 도우미(`pickCommissionCopy` 등) — 손 이관 |
| `tt("한국어")` | 12 | **10** | Provider 정의 2건은 언어 기반 코드라 제외. 10 손 이관 |
| 인라인 `{ko,en}` | 1,408 | 1,408 | 표 → 키 + 소비 코드 변경이라 손 이관(어드민 1,181) |

- 새 키 437개: `copy-shell`·`copy-trade`·`copy-store`·`copy-owner`·`copy-messenger`·`copy-auth`·`copy-admin`·`copy-lib` (`lib/i18n/catalog/`). 키 이름 = 파일 기능 폴더 접두어 + 영어 문구. 같은 ko·en 문구는 **같은 기능 접두어·`common_` 키만** 다시 씀(다른 화면 키에 묶지 않음).
- 제외: **통화 코드 23파일**(통화 규정 — 발견 목록 L11).
- 검사 정밀화: 언어 삼항은 문구일 때만 셈, 문구 쌍 규칙 신설, `components/i18n` 제외.
- 테스트: `safeT` 를 「대체 문구 반환」으로 가짜로 만든 렌더 테스트 8개 → 실제 카탈로그 번역으로. 소스 글자 계약 테스트 23개 → 소스가 쓰는 키의 카탈로그 문구까지 포함해 확인(`withCatalogCopy`). 어드민 UI 래칫은 `safeT("키")` 버튼 글자를 카탈로그로 풀어 S6 전과 같은 범위로 판정.
- **화면에 나오지 않던 대체 문구를 기대하던 테스트 3건**(어드민 「추가 검수 액션」→화면 「결정 실행」, 「이미지 변경」→「이미지 교체」, 알림 상세 「이전 방식 · 원본 연결 없음…」→「[레거시 unbound] 연결된 원본이 없습니다…」) → 화면 문구 기준으로 바꿈(L9 와 같은 유형, Owner 결정 대상).

## 13. S6 2단계 (자동 변환분)

| 규칙 | S6-1 후 | S6-2 후 | 방법 |
|---|---|---|---|
| 인라인 `{ko,en}` | 1,408 | **53** | `{ ko: "A", en: "B" }` → `catalogPair("key")`, 다른 속성이 있으면 `{ ...catalogPair("key"), tone }` (`lib/i18n/catalog-pair.ts` — 같은 모양·같은 값, 원본은 카탈로그). 남은 53 = 통화 10 + 손 이관 43 |
| 문구 쌍 | 272 | **0** | 다른 파일 도우미(`pickCommissionCopy` 등)·불리언 도우미(`label(ko, …)`) 정의를 직접 확인 후 `translateBy` |
| `fallbackEn` | 263 | 263 | 남은 것: 통화 95 + 변수 키·라벨 묶음 168 — 손 이관 |

- 새 키 1,144개(어드민 1,102 포함), 도메인 카탈로그에 덧붙임. 같은 기능 접두어·`common_` 키만 재사용.
- 테스트 도우미 `withCatalogCopy` 를 **S6 형태만**(translateBy·catalogPair·대체 문구 지운 safeT) 풀도록 좁힘 — S6 전과 같은 판정 범위(부정 단언이 빈 확인이 되지 않게, 동시에 S6 전부터 못 보던 `t("키")` 까지 넓히지 않게).
- 화면에 나오지 않던 대체 문구를 기대하던 테스트: 「홍보 0」(L14).

## 14. S6 2단계 (손 이관분) — 결과

| 규칙 | S5 후(시작) | S6 완료 | 남은 것 |
|---|---|---|---|
| `fallbackEn` | 2,834 | **236** | 통화 95(L11) · 어드민 83 · 고객·사장님 58 — 모두 **변수 키**(`as MessageKey`, DB 코드 조합 `owner_event_promo_ch_${key}` 등)라 「대체 문구가 안 쓰인다」를 정적으로 증명할 수 없음(키가 없으면 실제로 쓰임) → L15 |
| 인라인 `{ko,en}` | 1,408 | **16** | 통화 10 · 어드민 6(대시보드 단위 「건·명·곳·개」 영어 빈 값 5 = L13 유형, 조합식 1) |
| 언어 삼항 | 714 | **0** | |
| 문구 쌍 | (신설) 341 | **0** | |
| `tt("한국어")` | 12 | **0** | 메신저 타임라인 2곳은 키 이름을 역검색에 넘겨 **스크린리더 라벨이 키 이름 그대로** 나오던 결함 → `t(키, 값)` 로 고침 |

- 손 이관: 라벨 묶음 `{ key, fallbackKo, fallbackEn }` 27개(거래 필터·지원 상태 등) 죽은 대체 문구 삭제, 키 후보가 조건식·문자열 합집합 타입으로 증명되는 호출 12개, 언어 삼항 2·수량 「건」 4(L13 → `{n}건`/`{n}` 키), 템플릿 표 3, 어드민 용어 표는 일부 키가 카탈로그에 없어 되돌림(L15).
- 타입 기반 도구가 `as "키"` 형변환을 믿고 지운 2곳은 실제 후보 키(파트너 필터 7개·상품권 출처 3개)가 모두 있는지 직접 확인함 — 화면 변화 없음. 남은 코드 안 사본(튜플·표의 ko/en)도 삭제.
- 언어 이름 표 `{ ko: "한국어", en: "English" }` 는 번역이 아니라 자기 언어 표기라 허용 목록.

# DIBAY 언어(한국어·영어) SSOT — 단일 계약

> **이 문서가 언어·문구의 단일 정의다.** `docs/i18n-development-rules.md`·`docs/i18n-migration-roadmap.md` 와 충돌하면 이 문서가 우선한다.
> 근거: Owner 지시 2026-11-08 「기본은 기기 언어, 설정을 바꾸면 그 언어」「한국어·영어만, 다른 언어 삭제」「영어가 개발자 단어이거나 길게 나오지 않도록」「언어 부분이 SSOT 가 되도록」.
> 감사·단계 설계: `docs/audit/i18n-ko-en-ssot-design-2026-11-08.md` (S0~S9).
> 검사: `npm run check:i18n-quality` (CI `test:ci` 에도 포함).

---

## 1. 지원 언어

- 앱 UI 언어는 **한국어 `ko` · 영어 `en` 두 개만**. 다른 UI 언어를 추가하지 않는다.
- 기기 언어 해석: 기기 언어 목록에 한국어가 있으면 `ko`, 그 외에는 모두 `en`.
- 한국어·영어가 아닌 글자(한자·가나·태국어 등)와 언어 코드(`zh-CN`·`ja`·`fil` 등)는 화면 문구·언어 분기에 쓰지 않는다.
  - 예외(앱 UI 언어가 아님 — 검사 허용 목록에 이유와 함께 고정): 구직 글의 「할 수 있는 언어」 선택지(`jobs_lang_tl`), Vivo 폰 실제 메뉴 이름(`i管家`), 중국 폰 오디오 장치 이름 인식(`agora-playback-routing.ts`).

## 2. 언어 결정 (S1 에서 구현 — 목표 계약)

| 상태 | 화면 언어 | 저장 |
|---|---|---|
| 비로그인, 선택 없음 | 기기 언어 — **매번** 기기 값으로 계산 | 저장 안 함 |
| 비로그인, 토글로 선택 | 선택값 | 기기(localStorage + 쿠키 `samarket_signup_locale`) |
| 로그인, DB 값 없음 | 기기 언어 — 매번 계산 | 저장 안 함 |
| 로그인, 토글로 선택 | 선택값 | **DB `user_settings.preferred_language` = 기준**. 기기에는 화면 캐시 + 「미전송」 표시 |
| 로그인, DB 와 기기 캐시가 다름 | DB 값 (「미전송」 표시가 있을 때만 기기 값을 업로드) | — |
| 로그아웃·계정 전환 | 기기(비로그인) 선택값. 이전 계정 값을 다음 계정에 넘기지 않음 | — |

- 「명시 선택」은 내정보 언어 토글(`setLanguage`)만 만든다. 자동 감지한 기기 언어는 어떤 경로로도 저장하지 않는다.
- 저장 모델: `ko` | `en` | 없음(= 기기 언어). DB 임시 호환값 `""` = 없음.
- 서버(SSR·API·알림)는 언어를 한 함수로만 정한다: DB 명시값 → 쿠키 명시값 → `Accept-Language` → `en`. 서버 기본값 `ko` 는 쓰지 않는다.
- `profiles.preferred_language` 는 화면·알림·DB 함수 어디에서도 읽지 않는다.
- 클라이언트가 서버 문구를 받는 API 는 앱 언어를 요청에 실어 보낸다(헤더 또는 명시 값).

> 현재 구현과의 차이(D1~D9)는 감사 문서 §3. S1 완료 전까지 이 절은 **목표**이고 검사 대상이 아니다.

## 3. 문구 원본

1. **원본 = `lib/i18n/catalog/*.ts` 하나.** 한 키는 한 파일에만 둔다. `messages/ko.json`·`en.json` 은 S5 에서 카탈로그로 옮기고 삭제한다(그 전까지 신규 키 추가 금지).
2. **화면 문구는 키(`t("key")`)로만 만든다.** 다음은 신규 금지, 기존은 S6 에서 키로 옮긴다:
   - `fallbackEn` / `fallbackKo` 에 문장 쓰기
   - 인라인 `{ ko: "…", en: "…" }`
   - `lang === "en" ? "…" : "…"` 같은 언어 삼항
   - `tt("한국어 문장")` 역검색
3. **다른 언어로 대체하지 않는다.** 영어 화면에 한국어, 한국어 화면에 영어가 나오면 결함이다. 영어 키가 없거나 치환값이 안 맞는 경우는 검사에서 막는다.
4. **ko·en 치환값(`{name}`)은 같아야 한다.**
5. **DB 에 화면 문장을 저장하지 않는다**(메시지 미리보기·포인트 내역 설명 등). 종류 코드 + 값을 저장하고 화면에서 키로 그린다(S7).
6. **어드민이 등록하는 이름은 ko·en 둘 다 필수**(S7). 영어 화면은 `name_en` → slug 카탈로그 키 → 공통 문장 순서. 한국어 이름·slug 를 펼친 영어는 쓰지 않는다.

## 4. 문구 규칙 (고객·사장님 화면)

### 4-1. 개발자 용어 금지

화면 문구(ko·en)에 다음을 쓰지 않는다. 오류 문구는 「무엇이 안 됐는지 + 사용자가 할 수 있는 일」 한 문장으로 쓰고, 기술 원인은 로그에만 남긴다.

- 영어: Supabase, migration, schema, RLS, RPC, API, JSON, UUID, payload, fallback, bootstrap, ledger, slug, `.env`, VoIP, FCM, Agora, CallKit, PushKit, webhook, endpoint, cron, upsert, i18n, SSOT, null, undefined, backend, frontend, HTTP, DB
- 한국어: 마이그레이션, 스키마, 슬러그, 부트스트랩, 폴백, 페이로드, 원장, 엔드포인트, 웹훅 + 위 영어 기술명
- 형태: `snake_case` 식별자(테이블·열 이름), `table.column`, 앱 내부 경로(`/mypage/...`)

### 4-2. 용어집 — `lib/i18n/glossary.ts`

| 한국어 | 영어 | 쓰지 않는 영어 |
|---|---|---|
| 내정보 | My page (하단 탭은 `My`) | My info, My profile, My account, Mypage |
| 탈퇴(회원·계정) | Delete account / account deletion | withdraw, withdrawal, leave (모임·방 나가기의 Leave 는 별개) |
| 동네 | Neighborhood | area, region, local, town, district |
| 관심목록·관심 상품 | Favorites | wishlist, saved items |
| 관심 사용자 | Favorite users | starred |
| 관심이웃 | Following (neighbors you follow) | interested neighbors |
| 상품권 | Gift certificate | gift card, voucher |
| 매장 | Store | shop, merchant |
| 사장님 | Owner | boss, merchant |
| 캐시(매장 화폐) | Cash | — |
| 기기 임시 데이터 | 한국어 「임시 데이터」 / 영어 Temporary data | 한국어 「캐시」(매장 화폐와 같은 단어), 영어 cache |

용어집은 이 표와 `glossary.ts` 를 함께 바꾼다. 검사는 `glossary.ts` 를 기준으로 한다.

### 4-3. 길이 기준 (영어 기준, 같은 자리의 한국어도 같은 기준)

| 자리 (키 끝말) | 최대 글자 |
|---|---|
| 하단 탭 (`nav_bottom_*`) | 12 |
| 2단 탭·칩·배지·세그먼트 (`_tab`·`_chip`·`_badge`·`_pill`·`_segment`) | 18 — 넘치면 이름을 자르지 않고 가로 스와이프(Owner 고정) |
| 버튼 (`_btn`·`_button`·`_cta`) | 22 |
| 화면·시트 제목 (`_title`) | 40 |
| 토스트 (`_toast`) | 80 |

현재는 **경고**(검사 출력에 개수 표시). S4 완료 후 실패로 바꾼다.

### 4-4. 표기

- 버튼·제목은 첫 글자만 대문자(문장형), 끝 마침표 없음. 고유명사(DIBAY, Coin)만 대문자.
- 어드민 화면은 S9 에서 같은 규칙을 적용한다. 그 전까지 4-1·4-2 는 고객·사장님 화면 키에만 검사한다.

## 5. 검사 `npm run check:i18n-quality`

- 실행: `npm run check:i18n-quality` (vitest 1파일 — `lib/i18n/__tests__/i18n-quality.test.ts`). CI `test:ci` 에도 포함된다.
- 기준선: `lib/i18n/quality/i18n-quality-baseline.json` — S0 시점의 기존 결함 목록. **새 결함은 실패**, 기준선에 있는데 고쳐진 항목도 실패(기준선에서 지우라는 뜻 — 기준선은 줄기만 한다).
- 기준선 다시 쓰기: `npm run check:i18n-quality:baseline` — **결함을 고친 단계에서만** 실행하고, 줄어든 숫자를 커밋 메시지·보고에 적는다. 결함을 기준선에 새로 넣는 용도로 쓰지 않는다.

| 규칙 | 범위 | 판정 |
|---|---|---|
| `supported-languages` | `SUPPORTED_APP_LANGUAGES` = `["ko","en"]` | 실패 |
| `duplicate-key` | 같은 키가 카탈로그·JSON 2곳 이상 | 새 항목 실패 |
| `placeholder-parity` | ko·en 치환값 다름 | 새 항목 실패 |
| `hangul-in-en` | 영어 값에 한글 | 새 항목 실패 |
| `foreign-script-catalog` | 카탈로그 값에 한국어·영어 외 글자 | 새 항목 실패(허용 목록 제외) |
| `foreign-script-code` / `foreign-locale-code` | 코드에 다른 언어 글자·언어 코드 | 파일별 새 항목 실패(허용 목록 제외) |
| `jargon-en` / `jargon-ko` | 고객·사장님 키의 개발자 용어 | 새 항목 실패 |
| `glossary` | 용어집 「쓰지 않는 영어」 | 새 항목 실패 |
| `non-catalog-text` | 파일별 `fallbackEn`·인라인 `{ko,en}`·언어 삼항·`tt("…")` 개수 | 파일별 증가 실패 |
| `length-budget` | 4-3 기준 초과 | 경고 |

- 「고객·사장님 키」 판정: 키를 쓰는 코드가 어드민 경로(`app/admin`·`components/admin`·`app/api/admin`·`lib/admin`)에만 있으면 어드민 키, 그 외(사용처를 못 찾은 키 포함, 단 `admin_` 접두는 어드민)는 고객·사장님 키.

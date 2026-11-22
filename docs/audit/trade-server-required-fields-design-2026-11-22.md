# 거래 글 서버 필수 칸 검사 설계안 — 2026-11-22 (승인 전 · 구현 없음)

- 대상 결함: 감사 `docs/audit/trade-category-process-audit-2026-11-22.md` C7(중고차)·R6(부동산)·J6(일자리)·P8(공통). 모두 「서버가 주제별 필수 칸을 검사하지 않는다」는 결함이다.
- 기준 코드: `origin/main`. 운영 DB 는 읽기 전용으로 조회했다(17:55~18:05 PHT).
- 결론(권장): **화면과 같은 판정 함수를 서버에서 그대로 쓴다.** 1단계에서는 막지 않고 기록만 하고, 7일 동안 「막혔을 글 0건」을 확인한 뒤 2단계에서 막는다. 웹만 바꾸고 DB 변경은 없다.

---

## 1. 지금 상태 (사실)

| 검사 | 화면(`TradeWriteForm`) | 서버(`posts/create`, `owner-trade-update`) |
|---|---|---|
| 제목·내용 | 검사 | 검사 (`create/route.ts:46-47`) |
| 사진 필수 | 검사 | 검사 — 주제 구성 + 행동 규칙 (`trade-images-required.ts`) |
| 위치 | 검사 | 검사 — 고른 주소로 `trade_lgu_id` 결정 + `assertActiveTradeNationalLgu` |
| 가격 형식 | 검사 | 검사 (#566 `normalizeTradePriceForSave`) |
| **주제별 필수 칸** (차량 연식·주행거리, 부동산 유형·면적·보증금, 일자리 업종·급여 종류, 렌터카 일일요금·픽업, 환전 환율·준비물 …) | 검사 — `applyTradeBehaviorAdapter` + `validateAdaptedCompositionValues` (+ 주제별 직접 검사) | **검사 없음** |

그래서 화면을 거치지 않고 API 를 직접 부르면, 필수 칸이 빈 글이 만들어지거나 수정으로 지워진다.

## 2. 주제·모드별 필수 칸과 저장 위치 (코드에서 뽑은 값 · 시드 기준)

시드(`composition-seeds.ts`)에 행동 규칙(`behavior-adapters.ts`)을 적용해, 「보이고 필수인 칸」만 뽑았다. 운영에서는 주제에 어드민 설정(`field_composition`)이 있으면 그것이 우선한다(지금은 렌터카만 있음).

| 주제·모드 | 서버가 새로 검사할 칸 → 저장 위치 |
|---|---|
| 중고거래 | `price` → `posts.price` (나눔이면 제외) |
| 중고차 · 팝니다 | `car_trade`, `car_model`(제조사·모델), `car_year`, `mileage` → meta · `price` → 열. `has_accident` 는 참/거짓 칸이라 제외(화면과 같음) |
| 중고차 · 삽니다 | `car_trade`, `car_year`(최대 연식), `car_body_type` → meta · `price`(예산) → 열 |
| 부동산 · 판매 | `deal_type`, `estate_type`, `size_sq`, `room_count`, `bathroom_count`, `move_in_date`, `building_name` → meta · `price`(매매가) → 열 |
| 부동산 · 임대 | 위 meta 칸 + `deposit`, `monthly` → meta (매매가는 검사하지 않음) |
| 일자리 · 구인/구직 | `listing_kind`, `work_category`, `work_term` → meta · `pay_type` → meta 또는 열 |
| 렌터카 | `car_model`, `car_year`, `pickup_location` → meta · `daily_price` → meta 또는 `posts.price` (운영 어드민 설정 기준) |
| 환전 · 팝니다/삽니다 | `exchange_direction`, `from_currency`, `to_currency`, `exchange_rate_base`, `exchange_rate`, `buyer_prep` → meta · `amount` → meta 또는 `posts.price` |

**제외하는 칸 (이미 다른 검사가 있거나, 화면도 검사하지 않음)**
- 다른 검사가 이미 있음: `images`, `title`, `description`, `location`(위 1절 검사)
- 화면도 따로 검사하지 않거나 계산값: `trade_meet_spot`, `is_price_offer`, `is_free_share`, `derived`(환산액), 참/거짓 칸

## 3. 운영 데이터 영향 [DB · 최근 120일 · 삭제 안 된 글]

| 사실 | 수 | 설계에 주는 뜻 |
|---|---|---|
| 2026-10-28 이후 글 21건(중고거래 20, 중고차 1)은 사진·위치·주제 칸 모두 있음 | 21 | 지금 화면으로 만든 글은 새 검사에 걸리지 않을 것으로 보인다. **단, 1단계 기록으로 확인한다** |
| 2026-10-28 이전 글 중 사진 필수 주제인데 사진 없는 글 | 중고거래 15 · 중고차 2 · 부동산 4 · 렌터카 5 | 예전 규칙으로 만든 글. **수정을 막으면 안 된다** → 4절 「수정 규칙」 |
| `region` 이 빈 글 | 중고거래 10 (10-28 이후 7건은 모두 `trade_lgu_id` 있음) | 위치 판정은 `trade_lgu_id` 기준. 이번 검사 대상에서 위치는 제외한다(이미 검사함) |
| 부동산 임대 글 중 보증금·월세 빈 글 | 3 / 4 | 예전 글. 수정 규칙으로 보호한다 |

## 4. 설계

### 4-1. 판정 함수 하나 (화면·서버 공용)

`lib/trade/category-form/server-required-fields.ts` (새 파일, 순수 함수)
```
findMissingRequiredTradeFields({
  composition,              // loadResolvedTradeCompositionByCategoryId (어드민 설정 포함)
  meta, price, isFreeShare, columns,   // 저장될 값 (insert/patch 행 기준)
}) → string[]   // 빈 필수 칸 id
```
- 행동 규칙 문맥은 `behaviorContextFromDetailMeta(meta)`(상세와 같은 함수)에서 만든다.
- 칸별 값은 필드 정의의 저장 위치(`storage`)로 읽는다: `meta` · `combined_meta` · `column` · `meta_or_column`.
- 화면의 `validateAdaptedCompositionValues` 와 **같은 제외 목록·같은 빈 값 기준**을 쓴다.
  - 두 곳이 어긋나지 않게 제외 목록을 상수 하나로 옮기고, 화면도 그 상수를 가져다 쓴다.
- **(정정 2026-11-22 구현 중 확인)** 처음 설계의 「서버 추가 요청 0건」은 틀렸다.
  - 사진 검사는 **사진이 없을 때만** 구성을 읽는다. 그래서 필수 칸 검사는 거래 글 만들기·수정 1회마다 구성 조회 **1~2회**(주제 + 상위 주제)가 늘어난다.
  - 운영 기준 거래 글 작성은 10-28 이후 25일에 21건이므로, 늘어나는 양은 하루 1~2회 수준이다.
  - `posts/create`·`owner-trade-update` 는 요청 예산 표(`request-budget.ts`)에 없는 경로다.

### 4-2. 적용 규칙

| 경로 | 규칙 |
|---|---|
| 글 만들기 | 빈 필수 칸이 하나라도 있으면 거절 |
| 글 수정 | **이번 수정으로 새로 비게 된 칸만** 거절 = `빈 칸(수정 후) − 빈 칸(수정 전)`. 예전 규칙으로 만든 글(사진 없음·보증금 없음)은 그대로 수정할 수 있다. 거래 유형·모드를 바꿔 새로 필요해진 칸도 「수정 후에만 빈 칸」이라 거절된다 |
| 제한 단계 수정 | 지금도 meta 변경이 막혀 있어 그대로 둔다 |

### 4-3. 단계적 적용 (정상 글을 막지 않으려는 것)

| 단계 | 동작 | 끝내는 조건 |
|---|---|---|
| 1단계 (기록만) | 판정은 하되 막지 않는다. 걸린 요청마다 서버 로그 1줄(`[trade-required-fields] would_block`, 주제·칸 id·경로 — 회원 id·글 내용은 넣지 않음) | 운영 반영 후 **7일 동안 would_block 0건**. Vercel 로그를 한 번 조회해 확인한다(반복 확인 안 함) |
| 2단계 (막기) | 거절: HTTP 400, `code: "required_field_missing"`, `fields: [...]`. 문구는 i18n 키(ko·en, 받는 사람 언어) | — |

- 1단계에 걸린 요청이 있으면, 그것은 화면 판정과 서버 판정이 어긋난 것이다. 그 칸의 대응표를 고치고, 2단계로 가지 않는다.
- 화면은 이미 같은 칸을 막고 있어, 2단계에서도 정상 사용자는 이 오류를 보지 않는다. 받는 것은 API 를 직접 부르는 경우와 예전 앱 화면뿐이다.

### 4-4. 바뀌는 파일

| 파일 | 변경 |
|---|---|
| `lib/trade/category-form/server-required-fields.ts` | 새 판정 함수 |
| `components/write/trade/generic/GenericTradeWriteFields.tsx` | 제외 목록 상수를 새 파일에서 가져옴(동작 같음) |
| `app/api/posts/create/route.ts` | 사진 검사와 같은 자리에서 구성 1회 로드 → 판정 → 1단계 로그 / 2단계 거절 |
| `app/api/posts/[postId]/owner-trade-update/route.ts` | 수정 전·후 판정 차이로 적용 |
| `lib/i18n/catalog/*` | 2단계 거절 문구 키 1개(ko·en) |

- 영향받는 화면: 없음 (화면 판정은 같고, 1단계는 응답이 바뀌지 않는다).
- 회귀 위험: 2단계에서 화면에 없는 칸을 필수로 판정하면 정상 글이 막힌다 → 1단계 7일 확인으로 막는다.
- 되돌리기: 2단계를 끄는 상수 하나(`TRADE_REQUIRED_FIELDS_ENFORCE`)를 false 로 바꿔 PR 1개로 되돌린다.

## 5. 검증 계획

- **단위 테스트**
  - 주제·모드 9종 × (모두 채움 = 통과 / 칸 하나 비움 = 그 칸 id)
  - 나눔 가격 제외, 참/거짓 칸 제외
  - 수정 규칙: 예전 빈 칸은 통과, 새로 비운 칸은 거절, 모드 전환
- **계약 테스트**: 화면 판정(`validateAdaptedCompositionValues`)과 서버 판정이 같은 입력에서 같은 칸을 내는지 비교한다.
- **운영 확인 (2단계 전)**: 1단계 로그 would_block 0건(7일), Vercel 로그 1회 조회.
- **실기**: 2단계 반영 뒤, 주제별 글쓰기·수정이 지금처럼 되는지 확인한다. 운영에 보이는 글이 중고거래뿐이라 다른 주제는 시험 글이 필요하다.

## 6. Owner 결정

| 번호 | 결정할 것 | 작업자 권장 |
|---|---|---|
| S-1 | 단계적 적용(1단계 기록 7일 → 2단계 막기) | 권장 — 바로 막으면 판정이 어긋났을 때 정상 글이 막힌다 |
| S-2 | 수정 경로 규칙 「새로 비게 된 칸만 거절」 | 권장 — 예전 글(사진·보증금 없음 등)의 수정을 막지 않는다 |
| S-3 | 1단계 기록 위치 = 서버 로그(Vercel) | 권장 — 운영 Supabase 요청이 늘지 않는다(요청 예산 규정) |

# 언어(국문·영문) 전체 결함 — 전수표 + 전체 수정 설계 (2026-11-27)

> Owner 지시 원문:
> - 「가입 부터 전체적으로 기기의 언어, 각가의 언어 국문, 영문 부분을 다시 끝까지 감사 해서 … 빠진 부분은 없는지 명확히 확인 해줘」
> - 「정확한 전체적인 결함을 확인 하고 전체 설계안을 줘야지 … 잘라서 배포 규정도 안지키고」
>
> 계약:
> - `docs/i18n-ssot.md` §3-2 화면 문구는 키로만
> - §3-3 영어 화면에 한국어·한국어 화면에 영어 = 결함. 서버는 오류 코드만
> - §3-5 DB 에 화면 문장 저장 금지
> - AGENTS.md 「한 작업 = PR 1개·병합 1회」 「통화 변경 규정」
>
> 기준 코드: `origin/main` 9c5dcd6 + 브랜치 `fix/i18n-reaudit-p1`(PR #655, **병합 안 됨 · 자동 병합 해제**).
> 전수표: `docs/audit/i18n-full-reaudit-2026-11-27/inventory.md`(노출 항목 812행). 원본 판정은 같은 폴더 `result-*.tsv`(전 후보 4,172행).
> 이 문서가 앞의 「P1~P8 단계 설계」를 **대체**한다.

## 0. 작업자 잘못 (먼저 보고)

1. **1차 감사가 전수가 아니었다.**
   - 건수 상위 파일만 따라가고 「~90건」 같은 추정치를 썼다.
   - 확인 못 한 것은 「남은 위험·NOT_PROVEN」으로 넘겼다.
   - 이번에는 후보를 모두 뽑아(4,172행) 한 줄씩 판정했다(§1).
2. **배포 규정 위반.**
   - 같은 지시·같은 원인 작업을 P1~P8 로 쪼개 PR 여러 개로 설계했다(「작업 단위 병합」 위반).
   - P1 만 PR #655 로 올리고 자동 병합까지 등록했다. → **자동 병합 해제함**(11-27). #655 는 열린 채로 두고, 전체 수정을 이 PR 하나에 쌓는다. 단 통화만 규정상 예외(§4-7).
3. **1차 보고 틀린 항목.**
   - 「구매내역에 거래 상태가 한국어로 나온다」 → 틀렸다. 구매내역 카드는 그리는 화면이 없다. 같은 라벨은 **판매내역·메신저 거래 목록**에 나온다.
   - 「알림은 문제 없음」 → 틀렸다. 알림함·사장님 알림함·부재중·가격 제안에 결함이 있다(§2-4).

## 1. 전수 방법 — 빠진 곳이 없다는 근거

| 단계 | 대상 | 행 | 판정 |
|---|---|---|---|
| 1차 추출 | 관리자 밖 코드의 한국어 문자열 3,507 · JSX 한국어 17 · 화면이 서버 문장을 쓰는 형태 122 · 고객 화면 영어 글자 96 · 네이티브 한국어 34 | 3,775 | 도메인 7묶음, 모든 행 판정 |
| 2차 추출 | 1차가 놓친 서버 값 표시 형태(`x.error/message/warning/hint/reason` 를 setter·토스트·JSX 에 씀) 198 · 관리자 밖 영어 문장 199 | 397 | 모든 행 판정 |
| 공용 표시부 | 토스트·스낵바 호출 250곳의 인자 출처 | 250 | 직접 확인 — 새 결함 0 |
| 알림 | `notification_events` 쓰는 곳 전부 × 알림함·배너·푸시·사장님 알림함 | 유형 16 | §2-4 |
| 운영 DB(읽기 전용) | 관리자 등록 이름 13개 표의 영어 빈 칸 · 출시 안내 · 저장 문장 | — | §2-5 |
| 카탈로그 | ko·en 키 32,965 짝 · 빈 값 · 한국어 값이 영어 | 전부 | 키 차이 0 · 빈 값 0 · ko 값 영어 20 |

- 판정 값: EXPOSED(화면 노출) · RAW_ERROR_EXPOSED(서버 문장·영문 코드 그대로 표시) · STORED(DB 저장 뒤 다시 나옴) · SERVER_TEXT(서버 문장, 표시처 미확정) · NEED_OWNER · 무해 6종(ADMIN·DATA·LOG·DEV_ONLY·CODE_USED·FALSE_POSITIVE).
- 행 수 대조: 묶음마다 입력 행 수와 판정 행 수가 같다. 판정 못 한 행은 0이다.

## 2. 결함 총괄

### 2-1. 판정 합계 (4,172행)

| 판정 | 행 |
|---|---|
| **EXPOSED** | **610** |
| **RAW_ERROR_EXPOSED** | **83** |
| **STORED** | **87** |
| SERVER_TEXT(공통 오류 함수 등 — §4-1 에서 코드로 바꿔 닫음) | 26 |
| NEED_OWNER | 6 |
| 무해 (관리자 1,293 · 키 사용 737 · 오탐 641 · 데이터 587 · 개발 57 · 로그 46) | 3,361 |

- 결함 행은 812행(파일 235개)이다. 여기에 아래 §2-3~§2-5 가 더해진다.

### 2-2. 도메인별 (결함 행)

| 도메인 | 노출 | 서버 문장 그대로 | 저장 문장 | 기타 | 파일 |
|---|---|---|---|---|---|
| 거래 | 194 | 11 | 19 | Owner 1 | 43 |
| 필라이프·모임·신고·고객센터 | 113 | 11 | 18 | — | 32 |
| 메신저(통화 제외) | 114 | 6 | 8 | — | 36 |
| 매장·주문·사장님·라이더·상품권·광고 | 97 | 19 | 30 | 미확정 1 · Owner 4 | 58 |
| 홈·공용·그룹채팅·기타 | 40 | — | 4 | 미확정 24 · Owner 1 | 27 |
| 가입·인증·내정보 | 12 | — | 1 | 미확정 1 | 5 |
| 2차(서버 값 표시·영어 문장) | 4 | 36 | 2 | — | 30 |
| **통화·네이티브** | 36 | — | 5 | — | 10 |

화면별 상세(파일:줄·글자·화면 근거·고치는 방법)는 `inventory.md` 에 있다.

### 2-3. 카탈로그 — 한국어 값이 영어 (20키, 검사 `ko-latin-only` 기준선)

| 키 | 한국어 값 | 화면 |
|---|---|---|
| `addr_ui_kind_home/office/other/shop/store` · `addr_ui_shop_prefix` | House · Office · Input · Store · Store Address · Store · {name} | 주소 목록·장바구니 주소 행 |
| `addr_ui_preset_*` 4개 | 같은 값 | 쓰는 곳 0 → 삭제 |
| `profile_guest_name` | DIBAY Guest | 비로그인 이름 |
| `owner_bc_title`·`owner_bc_page_title`·`owner_ads_business_cash_label`·`owner_ads_confirm_cash_*`·`owner_bc_convert_title`·`owner_copy_finance_cash_ledger_partner_spend`·`finance_partner`·`finance_coin_out_meta` | Cash · Coin → Cash · Partner · Coin Out (meta) | 사장님 캐시·재무 (Coin·Cash 표기는 §5 Owner 결정) |

### 2-4. 알림 (`notification_events`)

- **새로 쓰는 행 노출 1**: 가격 제안 알림(`lib/offers/price-offers.server.ts:526,565,597`)이 언제나 한국어로 만들어진다(`offer-server-i18n.ts` = `DEFAULT_APP_LANGUAGE`). 알림함·배너·푸시 모두 한국어다.
- **새로 쓰는 행 노출 2 (통화)**: 부재중 전화(`call-missed-notification-authority.ts:177-199`)가 한국어로 저장된다. 알림함·부재중 배너·푸시가 한국어다. 운영 최근 3주에 230건 있다.
- **알림함이 저장 문장을 그대로 보여 줌**: commerce 만 meta 로 다시 그린다. 그 밖의 시스템 알림은 저장할 때의 언어로 고정된다. 언어를 바꾼 사용자와 옛 행에 다른 언어가 나온다.
  - 운영 저장 행 중 한국어 제목 6,544 / 8,927. 사람이 쓴 내용(닉네임·메시지)도 섞여 있다.
- **사장님 알림함**(`owner-notification-inbox-items.ts:137`): commerce 도 다시 그리지 않는다.

### 2-5. 운영 데이터

- 관리자 등록 이름: categories·community_topics·delivery_menus·feed_ad_products·moim_categories·notification_sound_events·point_plans·store_browse_scope_policy·store_categories·store_composition_policy_overrides·store_topics 모두 **영어 빈 칸 0**.
- **앱 업데이트 기록**: `app_releases` 8건 중 6건의 영어 안내가 비어 있다. 화면 `AppUpdateHistoryClient.tsx:59` 가 en 이 비면 ko 를 보여 준다 → 영어 화면에 한국어.
- 저장된 시스템 문장(운영, 2026-11-27 조회):

  | 항목 | 운영 행 |
  |---|---|
  | 포인트 내역 설명 한국어 | 457행 |
  | 고객센터 시작 메시지 | 7행 |
  | 채팅방 미리보기 「사진·(메시지)」 | 0행 |
  | 「DIBAY 사용자」 | 0행 |
  | 「회원」 이름 | 0행 |
  | 「Rejected by admin」 알림 | 0행 |

## 3. 원인 (결함 812행 + 알림·데이터가 모두 이 6가지 중 하나)

| # | 원인 | 대표 |
|---|---|---|
| R1 | 서버가 한국어 문장·DB 원문·영문 코드를 보내고, 화면이 그대로 보여 줌 | 거래 채팅 전송, 글쓰기·수정·삭제, 신고·차단, 필라이프 글·댓글, 사장님 상품·광고·주문, 라이더, 그룹채팅, 내정보 지역 변경 |
| R2 | 라이브러리 라벨 함수가 언어를 받지 않고 한국어 고정 | 일자리 라벨, 거래 상태 라벨, 위치 오류, 가격 단위 원·달러, 상품권 「까지」, 배달 ETA, 친구 요청 문구, 그룹방 정보 |
| R3 | DB 에 화면 문장 저장 | 채팅 미리보기·시스템 메시지, 주문 채팅 요약·결제 안내, 포인트 설명, 고객센터 시작 메시지, 외부 글 출처 문구, 영업시간 「매일」, 이벤트 버튼 이름, 알림 제목·본문 |
| R4 | 한국어 값이 영어·화면 영어 고정 | 주소 House·Office, Close·Terms·order no·review filter, 상품권 USED, Advertisement |
| R5 | 다른 언어로 대체 | 출시 안내 en 없으면 ko, 홈 공유 카드 category_name_en 없으면 ko |
| R6 | 네이티브 판정식 | iOS 시작 오류 화면이 「첫 언어 en 일 때만 영어」 |

## 4. 수정 설계 — **PR 1개(#655)에 전부**. 통화만 규정상 별도(§4-7)

### 4-1. R1 서버 오류 (같은 틀 하나)

- **공통 틀** (#655 에 이미 있음)
  - `lib/i18n/api-error-text.ts` `resolveApiErrorText`
  - 순서: 코드 → 도메인 표 키 → 상태 번호 키 → 기본 키
  - 서버 문장은 어떤 경우에도 내보내지 않는다.
- **서버**: 관리자 밖 API·라이브러리가 `error` 에 넣는 한국어 문장·DB 원문을 모두 `snake_case` 코드로 바꾼다. 값은 `params` 로 보낸다(남은 기간·최대 글자 수 등).
  - 공통 함수 `lib/http/api-route.ts`·`lib/security/rate-limit-presets.ts`·`lib/auth/server-guards.ts`·`api-session-require.ts`·`member-account-state.ts`·`handle-profile-incomplete-api-response.ts`·`store-member-policy.ts` 도 포함한다. 그래서 SERVER_TEXT 26행이 코드로 닫힌다.
- **화면**: RAW_ERROR_EXPOSED 83행과 EXPOSED 중 R1 행을 모두 `resolveApiErrorText` + 도메인 표로 바꾼다.
  - 도메인 표(코드 → 키)는 기존 매퍼를 다시 쓴다: 메신저 `getMessengerRoomActionErrorMessage`·주소 `translateUserAddressApiError`·주문 `resolveStoreOrderMutationErrorKey`·모임 `moimErrorKey`·고객센터 `supportErrorLabel`·사장님 `resolveOwnerApiErrorMessage`.
  - 새 표: 거래 글·채팅·댓글·신고·차단·필라이프 글/댓글·그룹채팅·라이더·내정보.
- **고칠 함수 4개**(모르는 문장을 그대로 돌려주던 통로):
  - `resolveOwnerApiErrorMessage`(문장 → 기본 키)
  - `resolveOwnerProductRegisterError`(apiMessage 우선 처리 삭제)
  - `formatOwnerOrderPatchErr`·`OwnerOrderRequestDecision`(모르는 코드 → 일반 실패 키, 「(code)」 붙이기 삭제)
- **금칙어**: `guardBannedWords` 는 Accept-Language 대신 코드 `content_filter_blocked` 만 화면에 쓴다(리뷰 답글·프로필 등).
- **웹 SNS 로그인 시작 실패**: JSON 원문 대신 `/login?error=<code>` 로 보낸다.
- 지금 결과: 위 함수·화면 파일 목록은 `inventory.md` 의 R1 행 전부다(파일 단위로 모두 바꾼다).

### 4-2. R2 언어를 받지 않는 라벨

- 라벨 함수에 언어(`t` 또는 `AppLanguageCode`)를 **필수 인자**로 넣고, `DEFAULT_APP_LANGUAGE` 기본값을 지운다.
  - 호출처는 타입 검사가 모두 잡는다(빠지면 빌드 실패).
- 대상:
  - `lib/jobs/job-detail-format.ts`·`job-label-keys.ts`
  - `lib/products/seller-listing-state.ts`(→ `sellerListingStateMessageKey`)
  - `lib/messenger/trade/item-status.ts`
  - `lib/map/geolocation.ts`(코드 반환)
  - `lib/format.ts`(통화 단위)
  - `format-gift-certificate-expiration.ts`
  - `store-commerce-extras.ts`·`store-delivery-eta-label.ts`
  - `format-store-order-checkout-display.ts`(이미 있는 `…I18n` 사용)
  - `community-messenger-friend-request-client.ts`
  - `use-messenger-room-phase2-room-presentation.ts`(**309-316 그룹 통화 줄 제외**)
  - `message-reply-policy.ts`·`messenger-realtime-store.ts`·`message-long-press-policy.ts`
  - `member-benefit-utils.ts`·`public-member-identity.ts`
  - `offer-server-i18n.ts`(받는 사람 언어)
  - `store-order-chat-service.ts`(DEFAULT 언어 4곳)
  - 그 밖에 `inventory.md` R2 행 전부
- JSX·aria·alt 의 한국어·영어 고정 글자는 키로 바꾼다(`DiscoverableOpenGroupCard`·`PostDetailRelatedSections`·`PostVideoEmbed`·`GroupChatRoomClient`·`features/services` 빈 화면·`DibayFullSheet`·`DibayOverlayRoot`·`PlatformEventDetailContent`·정산 aria 등).

### 4-3. R3 DB 저장 문장 — 새 행은 코드, 옛 행은 화면에서 대응

- **새로 쓰는 행**: 종류 코드 + 값만 저장하고, 화면·푸시에서 받는 사람 언어로 키로 그린다.

  | 대상 | 저장 | 화면 |
  |---|---|---|
  | 거래 채팅 미리보기·시스템 메시지 (`send/route.ts`·`messages/route.ts`·`postSellerListingChangeNotice`·`insert-seller-listing-change-system-messages`) | message type·장수·`messageKey` | 목록·말풍선이 키로 |
  | 주문 채팅 요약·결제 안내·매칭 응답 (`format-store-order-chat-summary.ts`·`store-order-chat-service.ts`·`store-order-match-ack-text.ts`) | `messageKey`+값 (함수가 이미 `messageKey` 를 받음) | 기존 messageKey 렌더 경로 |
  | 포인트 내역 설명 (`apply-community-point.ts`·`ads/apply`·`feed-ad-request-point-flow.ts`·`execute-point-reward-server.ts`) | 종류 코드+값(metadata) | `PointFinancialHistoryList` 가 키로 |
  | 고객센터 시작 메시지·삭제 메시지 (`support-case-service.ts:87,412,683`) | seed 종류·`messageKey` | `SupportTicketViews` 키 |
  | 외부 글 가져오기 출처·영상 문구 (`publish-content.ts`·`normalize.ts`) | 출처 이름·주소만 | 상세 화면이 키로 |
  | `region_label` 「동네」·영업시간 「매일」·이벤트 `cta_label` 「자세히 보기」·주문 거절 사유 「Rejected by admin」 | 빈 값/코드 | 키로 |
  | 알림 | meta 에 `messageKey`+`vars` | 알림함·사장님 알림함·배너·푸시가 키로 |

- **이미 저장된 옛 행**: DB 를 고치지 않고 화면에서 **알려진 고정 문장 → 키** 대응표로 바꿔 그린다(B3 방식).
  - 대상: 포인트 설명 457행, 고객센터 7행, 알림 옛 행.
  - 대응표는 카탈로그 ko·en 값을 거꾸로 찾는다. `{name}` 같은 변수는 정규식으로 처리한다.
  - 대응표에 없는 저장 문장은 사람이 쓴 내용으로 보고 그대로 둔다(닉네임·메시지·관리자 입력).
- **알림함**: `resolveNotificationInboxTitle/Body` 가 commerce 외 유형도 meta 로 다시 그린다. 사장님 알림함(`ownerRowToInboxItem`)에도 같은 함수를 쓴다.

### 4-4. R4 카탈로그·고정 글자

- §2-3 의 20키:
  - 주소 ko 값은 가입 주소 단계가 이미 쓰는 `addr_v2_label_*` ko 값(집·회사·…)과 같게 맞춘다.
  - en 「Input」 → 「Other」.
  - 쓰는 곳 0인 `addr_ui_preset_*` 4키는 삭제한다.
  - `profile_guest_name` ko → 「DIBAY 게스트」.
  - Coin·Cash 는 §5 결정을 따른다.
- 상품권 도장 「USED」 → 키.
- 그룹 이름 없음 「Group」 → 키.
- 「Advertisement」·「36:25 crop preview」·「CTA」·「missing」·「storeId」 → 키.

### 4-5. R5 다른 언어 대체 금지

- `AppUpdateHistoryClient.tsx:59`: en 안내가 없으면 ko 대신 「버전 {v}」 키만 보여 준다.
- 운영 6건의 `notes_en` 채우기는 데이터 변경이라 §5 승인 항목이다.
- `HomePostsSection.tsx:87`·`neighborhood/categories.ts:19-26`: `resolveCommunityTopicUILabel(language, …, slug)` 를 쓴다.

### 4-6. R6 네이티브 (같은 PR)

- `ios/App/App/DibayRootBridgeViewController.swift:846`: 판정식을 「앱 저장 언어(`dibay_app_language`) → 기기 첫 언어 ko 면 ko, 그 외 en」으로 바꾼다(`DibayNativeIntroPlugin.localized` 와 같은 식).
- `Call/` 폴더 파일은 건드리지 않는다.
- [배포 구분]에 네이티브(iOS)가 들어간다. 빌드 번호는 다음 iOS 설치·배포 빌드 때 1회 올린다(`native:prepare`). 웹 수정은 병합 즉시 반영된다.

### 4-7. 통화 — 규정상 별도 PR (Owner 지시와 규정 충돌 → 보고)

- Owner 지시: 「잘라서 하지 말라」.
- AGENTS.md 「통화 변경 규정」 4번: 「통화 변경은 **통화만** 단독 커밋·단독 main 반영 … 묶지 않는다」. 3번: 「영향 분석·계획 문서 → **Owner 승인 후** 구현」.
- 두 지시가 충돌한다. 규정이 최우선이라 통화는 #655 에 넣지 않는다. 다만 **설계는 이 문서에 함께** 둔다.
- 통화 결함 41행:
  - 통화 배너·수신 오류 배너가 서버 문장을 표시함(429)
  - 레거시 발신 경로 한국어 11곳
  - 상대 이름 「통화」·「회원 xxxxxx」
  - 웹 OS 수신 알림·통화 푸시 3종의 제목·본문
  - 부재중 알림 저장 문장
  - 그룹 통화 상태 줄
- 통화 수정 방향:
  - 서버가 받는 사람 언어 키로 푸시를 만든다.
  - 부재중은 meta(callKind·callerName)만 저장하고 키로 그린다.
  - 배너는 코드 → 키로 그린다.
  - **Android·iOS 의 「님의 전화」 이름 추출**(`IncomingCallUiCopy.java:73-95`·`IncomingCallCallerIdentity.swift:75-84`)이 한국어 본문에 기대므로, 서버 본문을 바꾸기 전에 `caller_name` 필드만 읽게 하는 순서가 필요하다(구 바이너리 호환 = `user_devices.app_version` 확인).
- Owner 승인 → 통화 단독 PR → 실기 행렬(통화 규정 5번) 순서로 진행한다.

### 4-8. 재발 방지 — 검사

`check:i18n-quality` 기준선을 이 PR 에서 **고객·사장님 결함 0** 으로 줄인다.
- `client-raw-server-error` 0
- `ko-latin-only` 0(Coin·Cash 결정에 따라 허용 목록)
- 새 규칙 `server-hangul-error`: 관리자 밖 `app/api/**`·`lib/**` 의 `jsonError("한글…")`·`error: "한글…"` 은 0이어야 한다.
- `user-hangul-literal`: 무해 판정(데이터·로그·관리자 공유) 파일만 남기고, 파일마다 이유를 허용 목록에 적는다. 그 밖의 증가는 실패다.

## 5. Owner 결정 필요 (이것 말고는 모두 규정·설계로 정함)

| # | 항목 | 근거 |
|---|---|---|
| D1 | 사장님 화면 「Coin」「Cash」를 한국어 화면에서도 영어로 둘지(용어집은 「캐시」) | 용어집 §4-2 「캐시(매장 화폐) — Cash」 ↔ 화면·카탈로그 ko 「Cash」 |
| D2 | 필리핀 번호 인증 문자 한국어 발송 | Semaphore 문서·FAQ 에 유니코드(한글) 지원·요금 기준 없음(「160 bytes = 1 credit」). 시험 문자 1건 발송 승인 시 확인 가능 |
| D3 | PWA 설치 설명 문장(한 언어만 가능) 언어 | `lib/pwa/dibay-web-app-manifest.ts:26` |
| D4 | 상품권 도안 「GIFT CERTIFICATE」「DIBAY BENEFIT」, 거래 썸네일 「IMG」 — 장식인지 문구인지 | `DibayGiftCertificateFace.tsx:341,446` · `TradeChatComposePreparingShell.tsx:38` |
| D5 | 운영 `app_releases` 6건 `notes_en` 입력(DB 데이터 변경) | 개발 프로세스 2번 — 운영 DB 변경은 Owner 승인 |
| D6 | 관리자 알림 캠페인·공지를 ko·en 두 언어로 입력받을지(지금 한 언어) | 계약에 없음 |
| D7 | 통화 별도 PR 진행 승인(§4-7) | 통화 변경 규정 3·4번 |

## 6. 바뀌는 화면 (영향 범위 — 같은 PR 에서 함께 정리)

- 가입·로그인: 웹 SNS 시작 실패.
- 내정보: 프로필·사진·지역 일괄 변경·회원 혜택·주소·포인트 내역·업데이트 기록·커뮤니티 탭·공지.
- 거래: 채팅방·채팅 목록·글쓰기·수정·삭제·상품 상세·댓글·일자리·가격 제안·판매내역·위치 시트.
- 필라이프·모임: 피드·상세·글쓰기·댓글·신고·차단·내 글·홈 공유 카드.
- 메신저: 홈·친구 요청·연락처·방 정보·답장·스티커·거래/주문 목록·그룹채팅.
- 매장·주문: 장바구니·상품 시트·배달 목록·주문 목록·다시 주문·주문 채팅·영수증 카드·매장 상세.
- 사장님: 상품·광고·팝업·쿠폰·주문·주문 채팅·정산·재무·관리 메모·알림함.
- 라이더: 홈·주문·상세.
- 공용: 시트·오버레이 닫기·하단 탭 커스텀·이벤트 상세·상품권·고객센터·알림함·알림 배너·푸시 문구.
- 네이티브: iOS 시작 오류 화면.
- 깨질 수 있는 것과 처리:
  1. 코드 표에 없는 오류는 일반 키가 된다 → 이 PR 이 각 도메인 API 오류 코드를 모두 표에 넣고, 검사 `server-hangul-error`=0 이 빠진 문장을 막는다.
  2. 저장 형식이 바뀌는 메시지·알림은 옛 행과 새 행이 섞인다 → 화면이 둘 다 그린다(대응표).
  3. 요청 수 변화 0(문구만) — `docs/request-budget-ssot.md` 영향 없음.
  4. 통화 줄 diff 0 확인(`use-messenger-room-phase2-room-presentation.ts` 309-316 등).

## 7. 검증

- **코드**: 최종 HEAD 1회
  - `typecheck:build`·`typecheck:test`·변경 파일 eslint·`test:ci` 전체
  - `check:i18n-quality`(§4-8 기준선 0)
  - `verify:call-surface-cta-ssot`
- **화면**(Owner 화면 기준: 로그인 계정·저장 주소·휴대폰):
  - §6 화면 묶음마다 ko·en 각 1회 본다.
  - 언어는 앱 안 토글로 바꾼다(다시 실행 불필요).
  - 앱 처음 실행은 Android 1대·iPhone 1대 합쳐 **10회 이하**로 계획한다. 넘으면 시작 전 승인을 받는다. 실행 횟수×195건을 보고한다.
  - 오류 화면은 운영 데이터를 바꾸지 않는 방법(입력 검증 오류·권한 없는 요청)으로만 낸다.
- **보고**: 단계 끝 1회. 코드 PASS / Production / 실기 PASS 를 구분한다.

## 8. 배포

- 모두 PR #655 한 개에 쌓는다. 검증 PASS 뒤 자동 병합을 등록한다(병합 1회 = Production 1회).
- 통화는 D7 승인 뒤 단독 PR 로 진행한다.

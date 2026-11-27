# 언어 수정(#655·#660·#662) 사후 검토 결함 — 수정안 (2026-11-27)

> Owner 지시: 「수정안 보고」 (사후 검토 최종 보고 뒤).
> 이 문서는 **수정안**이다. 구현·커밋·PR·병합은 Owner 승인 뒤에만 한다. 병합은 Owner 「병합」 지시 뒤에만 한다(`--auto` 금지).
> 근거:
> - 사후 검토 3건(오류 코드 계약 / 화면·저장 문장 / 중복·병목·누수): 결함마다 코드에서 다시 확인했다.
> - 실기기 FAIL 4건: 운영 `b1a70f8`, Samsung, 16:44 PHT.
> - 계약: `docs/i18n-ssot.md`, AGENTS.md(통화 변경 규정·개발 프로세스).

## 0. 진행 방식 (지난번 위반 재발 금지)

| 규정 | 이번 방식 |
|---|---|
| 한 작업 = PR 1개 | **통화 제외 1개(PR-A) + 통화 1개(PR-C)**. 통화는 통화 변경 규정 4번 때문에 따로 한다. #662 는 닫고, 내용은 PR-A(통화 아닌 부분)·PR-C(통화 부분)로 옮긴다. |
| 병합 | PR 을 만들고 멈춘다 → 배포 전 보고 → Owner 「병합」 뒤 병합 → 운영 sha 확인 → 실기 확인 → 최종 보고. 자동 병합 등록 없음. |
| 통화 | 이 문서 §3 이 통화 계획서다(통화 변경 규정 3번). PR-C 는 Owner 승인 뒤 구현하고, 병합은 PR-A 다음에 한다. |
| 중간 보고 | 하지 않는다. 단계 끝 1회만. |
| 운영 시험 저장 | 바꾸기 전 값을 읽어 기록 → 바꿈 → 원복 → 열 단위 대조를 보고한다. |
| 실기 횟수 | 앱 실행과 운영 화면 전체 다시 불러오기를 **합쳐** 측정 묶음당 10회 이하. 넘으면 먼저 승인을 받는다. |

## 1. 결함 목록 (모두 코드에서 확인 — 운영 반영본 기준)

| # | 분류 | 결함 | 위치 | 영향 |
|---|---|---|---|---|
| E1 | 오류 | 알림함이 사람이 쓴 댓글·답글 미리보기를 알림 문구로 바꿈 (「좋아요」 → 영어 「Like」) | `lib/notifications/resolve-commerce-notification-inbox-text.ts:19` → `notification-stored-copy.ts` `mapLegacyNotificationText` (본문에도 문구 없는 고정 틀까지 적용) | 댓글 알림 본문 |
| E2 | 오류(회귀) | 사장님 상품 등록·수정 오류 12종이 구체 안내 대신 「저장 실패」로만 나옴 — `title_too_long`·`summary_too_long`·`price_too_large`·`stock_too_large`·`invalid_price`·`invalid_stock`·`invalid_discount_percent`·`invalid_discount_for_price`·`price_required_for_discount_percent`·`invalid_category_id`·`invalid_item_type`·`title_required`, 옵션 `duplicate_option_name`·`duplicate_option_group_id` | `lib/business/owner-product-register-error.ts`(서버 `message` 를 쓰지 않게 됨) · 표 `owner-api-error-text.ts`·`owner-api-error-i18n.ts` 에 위 코드 없음 | 사장님 상품 화면 |
| E3 | 오류(회귀) | 필라이프 글쓰기·수정 사진 오류(`image_not_allowed`·`too_many_images`)가 「올리기 실패」로만 나옴 | `lib/community/community-api-error-text.ts` `COMMUNITY_POST_WRITE_ERROR_KEYS` 에 없음 | 필라이프 글쓰기 |
| E4 | 오류 | 사람이 정한 값이 문구로 바뀜: ① 닉네임이 정확히 「회원·상대·그룹·Member」이면 번역됨 ② 판매 행에서 사용자가 보낸 글 「사진」 → 「Photo」 ③ 그룹 이름·닉네임이 정확히 「새 대화」이면 키 문구(#662) | `notification-stored-copy.ts:58,79,114` `matchFallbackValue` · `components/mypage/seller/SellerTradeRow.tsx:32` → `tradeChatStoredPreviewText` · #662 `messengerRoomDefaultTitleKey` | 드묾 |
| M1 | 누락 | 실기 FAIL 4건 (#662 내용): 통화 시간 「26m 55s」(ko), 빈 방 안내·「새 대화」(en), 「문의 SC-… 종료」(en), 「ACCOUNT · mypage_customer_center」 | #662 | 메신저 목록·알림함 |
| M2 | 누락 | 서버가 한국어로 고정 저장: 그룹 기본 제목 「그룹 N명」, 「공개 그룹방」, 방 요약 「회원 xxxxxx」 (`cmServiceT` = 항상 ko) / 배달 방 `contextMeta.headline` 은 서버에서 화면 언어 전역값으로 만들어 어느 언어로 저장될지 정해지지 않음 | `lib/community-messenger/cm-service-copy.ts:5`, `group/group-room-service.ts:117,120,562`, `cm-home-list-copy.ts:233-238` → `service.ts:11797` | 영어 사용자 메신저 목록·방 |
| M3 | 누락 | 매장 목록 API 3개가 내정보 언어 대신 기기 언어(`accept-language`)로 배달비·결제수단·준비시간을 그림 | `app/api/stores/home-feed/route.ts:190`, `stores/browse:205`, `stores/[slug]/delivery-eta:116` (`detectAcceptLanguageAppLanguage`) | 내정보에서 기기와 다른 언어를 고른 사람 |
| M4 | 누락(통화) | 영어 사용자의 첫 수신 통화 푸시가 한국어 — 언어를 서버 메모리 캐시(인스턴스별 5분)에서만 찾아, 캐시가 비면 ko | `lib/push/call-push-recipient-language.ts:70-80`, `service.ts:20671-20677` | 웹 푸시·iOS VoIP 미등록 알림 |
| M5 | 누락·누수 | 관리자 밖 API 45곳이 응답 `error` 에 DB 원문을 담음(화면은 버리지만 네트워크로 나감). 그중 이번 PR 이 손댄 route 6곳 | 예: `app/api/me/posts/bulk-region/route.ts:44`, `posts/[postId]/route.ts:73`, `community-messenger/store-profile-thumbnail/route.ts:43,57`, `trade-post-thumbnail/route.ts:51`, `rooms/[roomId]/voice/route.ts:145` (전체 목록은 구현 때 grep `error: \w+\.message`) | 정보 노출 |
| M6 | 누락(잠복) | 거래 서버 필수 칸 검사 코드 `required_field_missing` 가 화면 표에 없음 — 검사를 켜면 「저장 실패」만 나옴(지금 꺼짐) | `lib/trade/category-form/server-required-fields.server.ts:36`, `TRADE_WRITE_ERROR_KEYS` | 잠복 |
| D1 | 중복 | 오류 문구 함수가 10개 넘게 따로 있음. 사장님 화면은 오류 경로가 2개(`owner-api-error-text.ts`·`owner-api-error-i18n.ts`). 모르는 코드를 번역 결과 문자열 비교로 판정(`owner-api-error-text.ts:50`). 코드 모양 검사 정규식이 9곳에 복사됨. 공통 표(`COMMON_API_ERROR_CODE_MAP`)를 쓰는 곳은 2곳뿐 | `lib/business/*`, `lib/trade/trade-api-error-text.ts`, `lib/community/community-api-error-text.ts`, `lib/reports/report-block-error-text.ts`, `lib/rider/rider-api-error-text.ts`, `lib/group-chat/group-chat-error-text.ts`, `lib/http/common-api-error-code-map.ts` | 유지보수·문구 불일치 |
| D2 | 중복 | 같은 코드에 다른 문구: `reserved_not_supported`, `phone_verification_required`(en 2종), `supabase_unconfigured`(2종), `invalid_json`(2종) | 각 도메인 표 | 같은 오류가 화면마다 다르게 보임 |
| D3 | 중복·죽은 코드 | 이번에 새로 만든 키 294개 중 23개가 기존 키와 ko·en 이 같음. 부르는 곳 0인 export 6개(`store-address-form-ui.ts` deprecated 4 · `ownerAdminLockLabelKo` · 이름만 KO 인 `PH_LOCAL_MOBILE_RULE_MESSAGE_KO`) | `lib/i18n/catalog/reaudit-*.ts` 등 | 크기·혼동 |
| B1 | 병목 | 가격 제안 알림 1건마다 받는 사람 언어 조회 2건(user_settings·user_devices)을 응답 전에 기다림. 요청 예산 파일 미갱신 | `lib/offers/price-offers.server.ts:527,569,606` | 운영 Supabase 요청·응답 시간 |
| B2 | 병목 | 알림함 옛 문장 대응이 대응되지 않는 행마다 틀 최대 462개를 차례로 비교(정규식은 1회 생성, `useMemo` 적용) | `lib/i18n/stored-text-template-match.ts:79-125` | 알림 많은 계정(측정 안 함) |
| L1 | 누수 | 오류 객체를 통째로 로그에 남겨 Postgres `details`(「Failing row contains (…)」)에 사용자가 쓴 글이 남을 수 있음 | `app/api/posts/create`, `chat/rooms/[roomId]/messages`, `lib/trade/item-trade-chat-start-core.ts` 등 | 로그 |
| R1 | 저장 호환 | DB 저장 토큰(채팅 미리보기 「사진」 등)을 카탈로그 ko 값에서 만들어, 누가 문구를 고치면 저장 토큰이 바뀌어 옛 행이 매칭 안 됨 | `lib/trade/trade-api-error-text.ts:196-201` 등 | 향후 문구 변경 시 |

메모리 누수(캐시·리스너·타이머)는 없다. 캐시 상한은 500개·5분이고, 새 effect 는 ref 만 갱신한다. 「use client」 파일이 서버 전용 모듈을 새로 가져오는 곳도 0이다.

## 2. PR-A — 통화 제외 (한 PR)

| # | 수정 | 바뀌는 파일 | 영향 화면 | 깨질 수 있는 것과 처리 |
|---|---|---|---|---|
| E1 | 옛 문장 대응을 **알림 제목과 시스템 문구 본문에만** 적용한다. 본문은 ① 치환값이 있는 틀만 대응하고 ② 댓글·답글·메시지 미리보기 행(meta.kind 가 community_comment·reply·chat 계열, 또는 meta.preview 표시)은 건너뛴다. | `notification-stored-copy.ts`, `resolve-commerce-notification-inbox-text.ts` | 알림함·사장님 알림함·배너 | 옛 시스템 본문(치환값 없는 고정 문장)은 event_type 허용 목록으로만 대응한다. 사람 글 「좋아요」「댓글」 원문 유지를 테스트로 고정 |
| E2 | 상품 오류 14개 코드 → 기존 키(`owner-product-field-limits.ts` 문구 키, 옵션 오류 키)로 표에 추가. 한도 숫자는 서버 `params` 로 받는다 | `lib/business/owner-api-error-text.ts`(통합 후 하나), `products-core.server.ts`(params) | 사장님 상품 등록·수정 | 서버가 `message` 를 계속 보내도 화면은 쓰지 않음 |
| E3 | `image_not_allowed`·`too_many_images`(+`params.max`) → 기존 `philife_write_err_image_*` 키 | `community-api-error-text.ts`, `lib/philife/post-body-images.ts`(params) | 필라이프 글쓰기·수정 | — |
| E4 | ① 대체 이름 번역은 **서버가 대체값을 넣은 행(meta 표시)**에만 한다. 새 행은 대체 이름을 빈 값으로 저장 + meta `peerFallback: true`. ② `SellerTradeRow` 는 메시지 종류가 image·system 일 때만 저장 토큰을 바꾼다. ③ 기본 방 제목은 서버가 새 행에 빈 제목을 저장하고 화면이 키로 그린다. 옛 행은 「제목 = 기본값 **그리고** 1:1 방 **그리고** 상대 이름 없음」일 때만 바꾼다 | `notification-stored-copy.ts`, `SellerTradeRow.tsx`, `service.ts:2941`, `MessengerChatListItem.tsx`, `messenger-room-last-message-placeholder.ts` | 알림함·판매내역·메신저 목록 | 옛 행 중 사람이 정한 「회원」 닉네임은 meta 가 없어 원문 유지(올바름) |
| M1 | #662 의 통화 아닌 3건(빈 방 안내·기본 제목, 옛 고객센터 알림 제목, 코드 본문)을 그대로 옮긴다 | #662 의 해당 파일 | 메신저 목록·알림함 | #662 는 닫는다 |
| M2 | 그룹 기본 제목·「공개 그룹방」·방 요약 대체 이름: 서버는 빈 값(+ 인원 수 등 값)을 저장하고 화면이 키로 그린다. 배달 방 headline: 서버는 headline 을 만들지 않고, 이미 있는 매장명·주문번호 값으로 화면이 키로 그린다 | `cm-service-copy.ts` 사용처, `group-room-service.ts`, `service.ts:11797`, `cm-home-list-copy.ts` | 메신저 목록·방 머리 | 옛 행의 「그룹 N명」은 정확한 틀(숫자+명)일 때만 화면 대응 |
| M3 | 3개 route 를 `resolveRequestAppLanguageOr("en")` 로 바꾼다. 캐시 키는 이미 언어를 포함한다 | 3개 route | 매장 홈·목록·배달 예정 시간 | 요청 수 변화 0(쿠키·헤더만 읽음) |
| M5 | 45곳 `error: x.message` → 코드 + `console.error({code, message})` | 해당 route | 없음(화면은 이미 코드 사용) | 원문을 비교하는 클라이언트를 route 마다 grep 해서 확인 |
| M6 | `required_field_missing`(+`params.field`) → 키 추가 | `TRADE_WRITE_ERROR_KEYS` | 거래 글쓰기(켤 때) | — |
| D1 | 오류 문구 함수를 `lib/i18n/api-error-text.ts` 하나로 모은다: 공통 표를 기본 단계에 넣고, 코드 모양 검사 함수(`isApiErrorCode`)를 내보내 9곳의 복사본을 바꾼다. 사장님은 `owner-api-error-i18n.ts` 를 지우고 `owner-api-error-text.ts` 표 하나로 합친다(번역 결과 비교 판정 삭제). 도메인 파일은 「코드 → 키 표」만 남긴다 | 위 파일들 + 호출처 | 오류 문구 전반(문구 결과는 같게) | 기존 표를 하나로 합친 결과가 이전 결과와 같은지 표 단위 테스트로 비교 |
| D2 | 같은 뜻 4건은 키 하나로 통일한다(문장이 더 정확한 쪽) | 각 표 | — | — |
| D3 | 중복 키 23개는 기존 키를 쓰게 하고 새 키를 삭제한다. 부르는 곳 0인 export 6개를 삭제하고 `PH_LOCAL_MOBILE_RULE_MESSAGE_KO` 이름을 정정한다 | `reaudit-*.ts`, 해당 lib | — | `check:i18n-quality` duplicate·미사용 검사 |
| B1 | 가격 제안 알림은 받는 사람 언어 조회를 하지 않는다: 알림은 meta `messageKey`+값으로 저장하고, 알림함은 이미 meta 로 그린다. 푸시는 PR-C 의 기기별 언어 방식(§3 C2)으로 보낸다. 요청 예산 파일을 그대로 확인하고 필요하면 낮춘다 | `price-offers.server.ts`, `offer-server-i18n.ts` | 가격 제안 알림 | PR-C 가 들어가기 전까지 푸시 문구는 기존(저장 문장) 그대로 |
| B2 | 치환값 없는 고정 틀은 `Map`(문장 → 키)으로 1회 찾고, 치환값 있는 틀은 첫 고정 글자로 묶어 해당 묶음만 비교한다. 100행 기준 시간을 테스트로 측정해 전·후를 보고한다 | `stored-text-template-match.ts` | 알림함 | 결과 동일 테스트 |
| L1 | 오류 객체 통째 로그 → `{code, message}` 만 남긴다(`details` 제외) | 해당 route·lib | — | — |
| R1 | 저장 토큰을 카탈로그에서 분리한 고정 상수로 둔다(현재 값과 같은 글자). 화면 문구는 키로 따로 그린다 | `trade-api-error-text.ts` 등 | — | 저장 글자 불변 테스트 |

- [배포 구분]: 웹만(예정).
- 운영 DB 변경: 없음.

## 3. PR-C — 통화 (통화 변경 규정 3번 계획서)

| # | 수정 | 바뀌는 파일 | 영향 경로 |
|---|---|---|---|
| C1 | #662 의 통화 시간 「26m 55s」 표시(한국어 화면에서 「26분 55초」) — **2026-11-13 설계 D2(한국어 화면은 옛 통화 문장 원문 유지)와 충돌. Owner 결정 필요(아래 결정 1)** | `lib/community-messenger/call-stub-room-tip.ts`, `cm-home-list-copy.ts` call_stub 갈래 | 메신저 목록 통화 미리보기 표시만 |
| C2 | 첫 통화 푸시 언어(M4): 메모리 캐시를 없앤다. 기기 대상 조회(`chat-push-facts-batch.ts` `USER_DEVICE_TARGET_SELECT_COLUMNS`)에 `app_language` 열 하나를 더해, 이미 읽는 기기 행의 언어로 **기기마다** 제목·본문을 고른다(푸시 안에 ko·en 두 벌 또는 키+값). 추가 조회 0, 신호 지연 0 | `lib/push/dispatch/*`(대상 조회·발송), `send-community-messenger-*-call-push.ts`, `call-push-recipient-language.ts` 삭제 | 수신·취소·다른 기기 받음 푸시(웹 푸시·APNs alert), 데이터 필드 불변 |
| C3 | 같은 기기별 언어 방식을 일반 알림 푸시(`notify-push-dispatcher.ts` 의 `row.title`/`row.body`)에도 쓴다: meta `messageKey` 가 있으면 기기 언어로 다시 만든다(B1 연동) | `lib/notifications/pipeline/notify-push-dispatcher.ts` | 모든 알림 푸시 |

- **구 바이너리 호환:** 데이터 필드 이름·값을 바꾸지 않는다. 구 Android(39·54)와 iOS(21)는 발신자 이름을 데이터 필드에서 먼저 읽는다(#660 계획서에서 코드 이력 확인). 화면에 보이는 alert 글자만 언어가 바뀐다.
- **회귀 위험:** 기기 행에 `app_language` 가 없으면(구 웹) 계정 설정 → en 순서로 고른다. 대상 조회 열이 하나 늘어나는 것 말고 요청 수는 같다.
- **롤백:** PR 되돌리기(Instant Rollback). 데이터 필드가 그대로라 앱 쪽 영향이 없다.
- **실기 행렬(통화 규정 5번):**
  - Android↔iPhone 음성·영상: 발신·수신·연결·종료
  - 거절, 벨 중 취소, 취소 뒤 늦은 푸시(다시 울리지 않음), 통화 중, 무응답 → 부재중, 종료 직후 재발신
  - 각 화면의 문구를 받는 사람 언어 ko·en 으로 확인
  - 구 빌드 1대(영어 계정)의 수신 이름
  - 매 시험마다 Production SHA 와 시각(PHT)을 기록한다
  - iPhone 조작은 사무실 기기 담당(Owner) 도움이 필요할 수 있다. 시작 전 1회 요청한다.
- [배포 구분]: 웹만(예정). 병합은 PR-A 다음.

## 4. 검증

- **PR 마다 최종 HEAD 에서 1회:** `typecheck:build`·`typecheck:test`·바꾼 파일 eslint·`test:ci` 전체·`check:i18n-quality`. 통화 PR 은 통화 검사 4종을 추가로 돌린다.
- **추가 테스트:**
  - E1 사람 글 원문 유지
  - E2·E3 코드 → 구체 문구
  - E4 대체 이름 조건
  - D1 표 통합 전·후 문구 동일
  - B2 100행 시간
  - C2 기기 언어별 alert·지연 0
- **실기 (PR-A 병합 뒤, Samsung·Xiaomi):** 같은 화면을 ko·en 으로 다시 본다.
  - 대상: 알림함(댓글 알림), 메신저 목록, 사장님 상품 오류(저장 안 하는 입력 검증만), 필라이프 사진 한도, 매장 목록(내정보 언어 ≠ 기기 언어), 포인트·주소·업데이트
  - 앱 실행 + 전체 다시 불러오기는 10회 이하로 한다.
  - 언어 전환 전 계정 값을 읽어 기록한다.
- **iOS 시작 오류 화면(#655, 이미 운영 반영):** 다음 iOS 빌드 때 시뮬레이터에서 오프라인 상태로 ko·en 을 확인한다.

## 5. Owner 결정 필요 (2건)

1. **C1** — 한국어 화면에서 옛 통화 기록 「26m 55s」를 「26분 55초」로 바꿀지, 2026-11-13 설계 D2 대로 원문을 유지할지.
2. **실기 통화 행렬의 iPhone 조작** — 사무실 iPhone 을 누가 조작할지(작업자는 adb 로 Android 만 조작 가능).

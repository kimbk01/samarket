# 언어(국문·영문) 재감사 결함 — 수정 설계 (2026-11-27)

> Owner 지시: 「수정 설계 진행」 (재감사 `docs/audit/i18n-full-reaudit-2026-11-27.md` 뒤).
> 계약 인용:
> - `docs/i18n-ssot.md` §3-2 「화면 문구는 키(`t("key")`)로만」
> - §3-3 「영어 화면에 한국어, 한국어 화면에 영어가 나오면 결함」 「서버 API 는 화면 문장 대신 오류 코드를 보내고, 문구는 클라이언트 카탈로그가 정한다」
> - §3-5 「DB 에 화면 문장을 저장하지 않는다 … 종류 코드 + 값을 저장하고 화면에서 키로 그린다」
> - §4-2 용어집 「캐시(매장 화폐) — Cash」
> - AGENTS.md 「서버 문구는 요청 언어로」
>
> 이 문서는 **설계**다. 구현·커밋·운영 반영은 Owner 승인 뒤 단계별로 한다.
> 기준 코드: `origin/main` 9c5dcd6be.

## 0. 설계 전 확인한 운영 데이터 (읽기 전용 · 2026-11-27 PHT)

| 항목 | 조회 결과 | 설계 반영 |
|---|---|---|
| 기본 닉네임 「DIBAY 사용자」로 저장된 `profiles` 행 | **0건** | 데이터 정리 없음. 코드만 바꾼다 |
| 영어 약관·개인정보·마케팅·매장 약관 게시본 | 모두 게시됨 | 감사 A5(영어 원문 없음) 현재 결함 아님 |
| ko·en 게시 버전 | terms·privacy·marketing·store_partner_terms 모두 같음 | 감사 A3(ko 기준 버전 계산)은 **지금 화면 결함 없음** → 이번 설계에서 빼고 위험으로만 남김(§6) |

## 1. 공통 원칙 (모든 단계)

### 1-1. 서버 오류 표시 규칙 — 결함 §2-2 의 공통 원인 제거

- 지금: 클라이언트가 `data.error ?? t(...)` 처럼 서버 문장을 먼저 보여 준다. 서버는 한국어 문장을 보낸다.
- 바꾼 뒤 서버 응답: `{ ok:false, error:"<code>", code:"<code>", params?:{…} }`.
  - 코드는 `snake_case` 영어 식별자다.
  - 바꿔 끼우는 값(남은 초, 금칙어 등)은 `params` 로 보낸다.
- 새 공통 함수 `lib/i18n/api-error-text.ts`:

  ```ts
  resolveApiErrorText({ json, status, map, fallbackKey, t })
  ```

  1. 고르는 순서: `json.code` → `json.error` 가 코드 모양일 때 → 도메인 표 `map[code]` → `t(key, params)`.
  2. 표에 없으면 상태 번호로 고른다: 401 `common_login_required` · 403 `common_forbidden` 계열 · 429 「잠시 후 다시」 · 5xx 서버 오류 키.
  3. 그래도 없으면 `fallbackKey`.
  4. **서버 문장(한글·영어 문장)은 어떤 경우에도 화면에 내보내지 않는다.** 이 점이 지금의 `resolveOwnerApiErrorMessage`(모르는 문장을 그대로 돌려줌, `lib/business/owner-api-error-i18n.ts:47`)와 다르다.
- 바꾸는 순서 — 화면이 깨지지 않게(설계 규정 4):
  - 각 단계에서 **클라이언트 표시를 공통 함수로 먼저** 바꾼다. 그 단계 도메인 API 의 한국어 문장도 **같은 PR 에서** 코드로 바꾼다.
  - 공통 함수는 서버 문장을 무시하므로, 아직 안 바뀐 API 가 있어도 화면에는 일반 오류 키가 나온다. 한국어·영문 코드가 그대로 나오지 않는다.
  - 모든 API 가 공유하는 `lib/auth/server-guards.ts` 「로그인이 필요합니다.」·「프로필을 찾을 수 없습니다.」는 **마지막 단계(P7)** 에서 코드로 바꾼다. 모든 표시처가 공통 함수로 바뀐 뒤여야 영문 코드 `login_required` 가 화면에 새지 않는다.
- 웹은 배포 즉시 모든 앱이 새 코드를 쓴다(앱은 웹을 불러옴). 그래서 구 클라이언트 호환 문제는 없다.

### 1-2. 언어를 받지 않는 라벨·저장 문장

- 라벨 함수: 언어(`t` 또는 `AppLanguageCode`)를 **필수 인자**로 바꾼다. 기본값 `DEFAULT_APP_LANGUAGE`(=ko)를 쓰지 않는다. 호출처는 같은 PR 에서 모두 고친다(타입 검사가 빠진 곳을 잡는다).
- 저장 문장: 이미 있는 `messageKey` / 메시지 종류(type) 경로로 화면에서 키로 그린다.
  - 저장 글자는 예전 행 호환용으로만 남긴다. B3 설계 `docs/audit/i18n-b3-stored-preview-design-2026-11-08.md` 와 같은 방식이다.

### 1-3. 검사 보강 — 같은 결함이 다시 생기지 않게 (P1 에 넣음)

`lib/i18n/quality/i18n-quality-rules.ts` + 기준선:

| 새 규칙 | 내용 | 판정 |
|---|---|---|
| `ko-latin-only` (키 규칙) | 고객·사장님 키의 ko 값에 한글이 없고 영어 단어가 있음 | 새 항목 실패. 브랜드(telRING·LOUNGE·DIPICK·CREW REP·DIBAY·GCash·COD 등)와 치환값만 있는 값은 허용 목록에 이유와 함께 넣는다 |
| `client-raw-server-error` (파일 규칙) | 고객·사장님 화면 파일의 `…\.error ?? t(` · `…\.error \|\| t(` · `setError(json.error…)` 형태 | 파일별 증가 실패. 단계마다 줄인다 |

- 기존 `user-hangul-literal` 기준선은 단계마다 줄어든 숫자로 다시 쓴다(§5 규칙: 고친 단계에서만).

## 2. 단계 (PR 1개 = 단계 1개, 도메인 섞지 않음)

모든 단계의 **[배포 구분]은 웹**이다(P8 만 네이티브). 운영 DB 변경은 없다.

### P1 — 공통 틀 + 가입·프로필

| 항목 | 바꾸는 곳 | 내용 |
|---|---|---|
| 공통 함수·검사 | `lib/i18n/api-error-text.ts`(신규), `i18n-quality-rules.ts`, 기준선 | §1-1·§1-3 |
| A1 기본 닉네임 | `lib/auth/post-login-profile-policy.ts:6,15`, `member-access.ts:249`, `refresh-oauth-nickname-if-legacy.ts:27,35` | 아래 참고 |
| A2 인증 문자 | `lib/auth/phone-verify-sms.ts:21-24` + 호출 API(send) | 아래 참고 |
| A4 전화 안내 문구 | `lib/auth/phone-verification-public-settings.ts:33-36`, `auth-phone-settings.ts:34` | 아래 참고 |
| S15·S16·A5 프로필 저장 | `app/api/me/profile/route.ts` 한국어 오류 → 코드, `me/profile/avatar/route.ts:43,47`(있는 code 사용), `lib/profile/updateMyProfile.ts:45` | 화면 `ProfileEditForm.tsx:465,491`, `ProfileImageField.tsx:100`, `OnboardingProfileClient.tsx:83` → 공통 함수 |

- **A1 기본 닉네임**
  - 시드 이름을 가입 요청 언어로 만든다: `translateBy(요청 언어, "profile_default_display_name")`. 요청 언어는 `resolveRequestAppLanguageOr`.
  - 옛 기본 이름 판정은 ko·en 두 값을 모두 본다.
  - 근거: 이름은 사용자가 바꾸는 프로필 값이라 「화면 문장 저장」이 아니다. 운영 행은 0건이다.
- **A2 인증 문자**
  - 문자를 요청 언어로 보낸다. ko 「[DIBAY] 인증번호: {code}」 · en 「[DIBAY] Verification code: {code}」.
  - 근거는 AGENTS.md 「서버 문구는 요청 언어로」다. ko 문구는 90byte 안이다.
- **A4 전화 안내 문구**
  - 어드민 안내 문구는 글자가 화면 언어와 맞을 때만 보여 준다. 지금은 en 만 검사하는데, 같은 규칙을 ko 에도 적용한다.
  - 맞지 않으면 기본 키 문구를 쓴다.
  - 기본 문구 「필리핀 휴대폰 번호만」은 +82 허용과 다르다. 실제 허용 국가(PH·KR)에 맞는 키 문구로 바꾼다.

- 영향받는 화면: 로그인(SNS 첫 가입), 전화 인증 단계, 내정보 프로필 수정·사진, `/onboarding/profile`. 다른 화면은 공통 함수를 아직 쓰지 않으므로 변화가 없다.
- 깨질 수 있는 것과 처리:
  - 프로필 API 를 쓰는 다른 표시처 → `rg "/api/me/profile"` 로 전부 찾아 같은 PR 에서 공통 함수로 바꾼다.
  - SMS 업체 글자 수 → 단위 테스트로 byte 를 검사한다.

### P2 — 거래

| 항목 | 바꾸는 곳 |
|---|---|
| S1·S2 채팅 전송 | `app/api/chat/rooms/[roomId]/messages/route.ts`, `app/api/chat/room/[roomId]/send/route.ts`, `lib/chat/sendChatMessage.ts:52-73`(클라 한국어 대체 문구 포함), `components/chats/ChatDetailView.tsx:1418`(서버 문장 먼저 → 공통 함수) |
| S3 거래 상태 | `app/api/posts/[postId]/seller-listing-state/route.ts`, `ChatDetailView.tsx:992`, `CommunityMessengerTradeProcessSection.tsx:247` |
| S4~S8·S17 | `posts/[postId]/owner-status`·`owner-delete`·`job-apply`·`comments`·`owner-edit`·`posts/create` 라우트 + `lib/posts/createPost.ts`, `updateTradePost.ts` + 화면 `MyProductsView.tsx:209`, `PostDetailView.tsx:976,1177`, `PostCard.tsx:713`, `TradeWriteForm.tsx:2005`, `PostCommunityCommentsSection.tsx:133`, `ProductTradeEditPageClient.tsx:62,70`, `TradeFlowBanner.tsx` |
| K1 일자리 라벨 | `lib/jobs/job-detail-format.ts`, `lib/jobs/job-label-keys.ts`(`defaultT` 제거) → `JobsExtendedDetailExtras.tsx:82,83,137,143` 가 `t` 를 넘긴다 |
| K2 거래 상태 라벨 | `lib/products/seller-listing-state.ts:22-25,64-72`(`SELLER_LISTING_LABEL` 10곳 사용) → 상태 → 키 표. 화면 `ChatProductSummary.tsx`, `PurchaseHistoryCard.tsx`, `lib/mypage/purchase-history-ui.ts` |
| 거래 채팅 미리보기 「사진」 | 저장: `chat/rooms/[roomId]/messages/route.ts:320-355`, `chat/room/[roomId]/send/route.ts:169-175`. 목록: `lib/messenger/trade/preview.ts:31` → 메시지 종류(image·개수)로 화면에서 키로 그림(이미 있는 `metadata`·type 사용). 저장 글자는 그대로 둔다(예전 행 호환) |

- 영향받는 화면: 거래 채팅방·채팅 목록(거래 탭)·상품 상세·글쓰기·수정·내 상품·구매내역·일자리 상세.
- 깨질 수 있는 것과 처리:
  - `SELLER_LISTING_LABEL` 을 문자열 비교에 쓰는 곳이 있으면 상태 값 비교로 바꾼다(10곳 전수).
  - 미리보기 「사진」을 저장 글자 비교로 판정하는 곳 → `rg '"사진"'` 전수 확인(`lib/messenger/*/preview.ts`).
- `/market` 목록 불변조건(`docs/trade-lightweight-design.md` §9)은 건드리지 않는다. 요청 수 변화 없음(문구만).

### P3 — 신고·차단·커뮤니티(필라이프)

| 항목 | 바꾸는 곳 |
|---|---|
| S9~S12 신고 | `app/api/reports/route.ts`, `app/api/community/reports/route.ts`, `lib/reports/createReport.ts`·`submitReport.ts`·`createCommunityFeed*Report.ts`·`createCommunityCommentReport.ts` + 화면 `ReportReasonModal.tsx:68`, `ReportActionSheet.tsx:77`, `CommunityDetail.tsx:453`, `PostCommunityCommentsSection.tsx:179` |
| S13 차단 | `lib/reports/request-user-block.ts:17`, `app/api/chat/rooms/[roomId]/block/route.ts:53,59`, `CommunityDetail.tsx:394` |
| S14 동네 글쓰기 | `app/api/community/neighborhood-posts/route.ts:83-173`, `PhilifeNeighborhoodWriteForm.tsx:955` |
| 삭제 실패 영문 코드 | `CommunityDetail.tsx:413`(`imported_not_deletable` 를 키로) |
| 그 밖의 표시처 | `CommunityFeed.tsx`, `CommunityMyHubClient.tsx` |

- 영향받는 화면: 신고 시트(거래·필라이프·댓글·통합)·차단 토스트·동네 글쓰기·필라이프 상세.
- 깨질 수 있는 것: 신고 API 는 거래 화면도 쓴다. 신고 표시처 4곳을 같은 PR 에서 모두 바꾼다.

### P4 — 메신저 (통화 제외)

| 항목 | 바꾸는 곳 |
|---|---|
| K3 친구 요청 실패·남은 시간 | `lib/community-messenger/community-messenger-friend-request-client.ts:30-62,230-256` → `t` 를 받는 함수로. 호출 5곳 `CommunityMessengerHome.tsx:1550`, `CommunityMessengerRoomPhase2PeerNotice.tsx:169`, `…OneToOneDotMenu.tsx:364`, `use-contacts-friend-cta.ts:62`, `use-messenger-room-phase2-controller.ts:2296` |
| K4 공개 모임 카드 | `components/community-messenger/home/DiscoverableOpenGroupCard.tsx:22-36` → 키 |
| K5 그룹방 정보 문구 | `use-messenger-room-phase2-room-presentation.ts:322-336,374` → 키 (**309-316 그룹 통화 상태는 통화 규정이라 손대지 않음**) |
| 목록 미리보기 「사진」 | `lib/messenger/general-direct/preview.ts:30`, `lib/messenger/group/preview.ts:51` → 종류 → 키 |

- 영향받는 화면: 메신저 홈·친구 요청·방 상단 안내·연락처·그룹방 정보 시트·목록 미리보기.
- 통화 경계 확인:
  - 바꾸는 파일 중 `use-messenger-room-phase2-room-presentation.ts` 는 통화 상태 줄을 함께 갖고 있다. **통화 줄(309-316)은 글자 하나도 바꾸지 않는다.**
  - PR 에서 그 줄들의 diff 가 0줄인지 확인한다(통화 변경 규정 1번).
- Realtime·bump 계약은 바꾸지 않는다(문구만).

### P5 — 매장·주문·사장님·라이더

| 항목 | 바꾸는 곳 |
|---|---|
| K6 결제 확정 시스템 메시지 | `lib/community-messenger/store-order-chat-service.ts` `appendStoreOrderMessengerPaymentCompletedLine` → 새 키 + `messageKey` 전달(함수가 이미 `messageKey` 를 받음, 769·794줄). 화면은 기존 `messageKey` 렌더 경로 사용 |
| 매장 주문 미리보기 | `lib/messenger/store-order/preview.ts:35-66` 사진·음성 분기도 `lang` 사용 |
| K7 장바구니 주소 라벨 | `lib/stores/store-address-form-ui.ts:11-12,30` → 키. 화면 `StoreCommerceCartPageClient.tsx:1768,2750`, `OwnerStoreBasicInfoForm.tsx:1125` |
| K9 「Cash」 | `OwnerCoinConvertSection.tsx:342`, `OwnerFinanceHomeCards.tsx:94` → 키. 카탈로그 ko 값 `owner_bc_title`·`owner_bc_page_title`·`owner_ads_business_cash_label`·`owner_ads_confirm_cash_*`·`owner_bc_convert_title`(「Coin → 캐시」) → 용어집대로 「캐시」 |
| E1 사장님 오류 코드 그대로 | `components/business/owner/ads/*`(OwnerEventPromotion*·OwnerPlatformPopup*·OwnerDeliveryAds*), `OwnerCareAdminNotes*` → 공통 함수 + 사장님 코드 표(`owner-api-error-i18n.ts` 표 재사용·확장). `resolveOwnerApiErrorMessage` 의 「모르는 문장 그대로」(47줄)는 공통 함수 규칙으로 바꾼다 |
| E2·E3 영어 대체·읽기 문구 | `OwnerPlatformPopupApplyView.tsx:447,705`, `OwnerPlatformPopupRequestDetailView.tsx:89,91,187`, `OwnerStoreSettlementsView.tsx:420`, `StoreCommissionLedgerParts.tsx:521` |
| 라이더 | `components/rider/Rider*Client.tsx` 서버 문장 표시 → 공통 함수 |

- 매장 정산·수수료 경계: 수수료 금액·트리거·`admin_decide_store_commission_adjustment` 는 건드리지 않는다. `StoreCommissionLedgerParts.tsx` 는 aria 문구만 바꾼다.
- 주문 상태 UI·채팅 단계 규칙(`store-order-process-model.ts` 만): K6 은 단계 정의를 바꾸지 않는다. 이미 있는 메시지에 키를 붙이는 것뿐이다.
- 영향받는 화면: 고객 주문 채팅·주문 목록 미리보기·장바구니, 사장님 캐시·광고·팝업 신청·관리 메모·정산, 라이더 화면.

### P6 — 공용 UI·주소·이벤트·상품권·고객센터

| 항목 | 바꾸는 곳 |
|---|---|
| K8 주소 종류 ko 값 | `lib/i18n/catalog/addresses-ui.ts`. ko 값을 가입 주소 단계에서 이미 쓰는 `addr_v2_label_*` 의 ko 값(집·회사 등)과 같게 맞춘다. en 「Input」은 의미가 맞는 기존 en 값(직접 입력)으로 맞춘다. 사용처 0인 `addr_ui_preset_*` 4키는 삭제 |
| E3 공용 닫기 읽기 문구 | `components/ui/dibay-overlay/DibayFullSheet.tsx:116`, `DibayOverlayRoot.tsx:171` → `common_close` 키 |
| E4 약관 제목 | `components/platform-events/PlatformEventDetailContent.tsx:111` |
| E5 그룹 이름 없음 | `app/(main)/group/[token]/GroupInviteJoinClient.tsx:203` |
| E6 상품권 도장 「USED」 | `DibayGiftCertificateFace.tsx:764` → 키 (「GIFT CERTIFICATE」「DIBAY BENEFIT」은 Owner 결정 전 그대로) |
| 고객센터 첫 메시지 | `lib/support/support-case-service.ts:412` → 저장값 확인 뒤 키 경로(B3 방식) |
| 게스트 이름 ko 「DIBAY Guest」 | `profile_guest_name` ko 값 → 한국어 (P1 `ko-latin-only` 검사로 발견) |

- 영향받는 화면: 주소 관리·장바구니 주소 행·모든 바텀시트/전체 시트(닫기 버튼 읽기 문구만)·이벤트 상세·그룹 초대·상품권·고객센터.
- 공용 오버레이는 aria-label 글자만 바꾸고 동작·스타일은 바꾸지 않는다(오버레이 계약 불변).

### P7 — 공통 401·404 마무리 + 기준선

- `lib/auth/server-guards.ts` 「로그인이 필요합니다.」 3곳·「프로필을 찾을 수 없습니다.」 → `login_required`·`profile_not_found` 코드.
- 시작 조건: P1~P6 반영 후 `client-raw-server-error` 기준선이 **0** 이어야 한다(서버 문장을 그대로 보여 주는 화면이 하나도 없음).
- 같은 PR 에서 `user-hangul-literal`·새 규칙 기준선을 줄어든 숫자로 다시 쓴다.

### P8 — iOS 시작 오류 화면 (네이티브)

- 바꾸는 곳: `ios/App/App/DibayRootBridgeViewController.swift:846`
- 내용: 언어를 「앱에 저장된 언어(`DibayAppLanguagePlugin` UserDefaults `dibay_app_language`) → 기기 첫 언어가 ko 면 ko, 그 외 en」으로 고른다. 문구는 이 파일 안 ko/en 두 벌을 그대로 둔다. `ios/App/App/Call/DibayNativeCopy.swift` 는 통화 폴더라 쓰지도 바꾸지도 않는다.
- [배포 구분] 네이티브. iOS `CURRENT_PROJECT_VERSION` 은 다음 설치·배포 빌드 때 1회 올린다(`native:prepare`). 웹 단계와 다른 PR 이다.
- 영향: 오프라인·시작 실패 때만 보이는 화면이다. 통화·CallKit 과는 무관하다(같은 파일 안 다른 함수 diff 0 확인).

## 3. 이번 설계에서 빼는 것

| 항목 | 이유 |
|---|---|
| 통화 N2~N5 (통화 푸시 제목·본문 한국어, Android 「수신 통화」, 「님의 전화」 이름 추출, 그룹 통화 상태 문구) | 통화 변경 규정 2·3번 — 실기기 로그·운영 DB 증거, 구 바이너리 호환(`user_devices.app_version`), 행렬 검증 계획을 **별도 문서**로 쓰고 Owner 승인 후 단독 PR. 서버 본문만 영어로 바꾸면 이름 추출(`IncomingCallUiCopy.java:73-95`, `IncomingCallCallerIdentity.swift:75-84`)이 깨지므로 네이티브와 순서 설계가 필요 |
| A3 동의 버전 ko 기준 계산 | 운영 ko·en 버전이 모두 같아 지금 화면 결함 없음 |
| OS 권한 창 언어(앱 선택 언어 대신 기기 언어) | OS 동작. 앱 단위 언어(Android `localeConfig`·iOS 앱별 언어) 도입은 계약에 없음 → Owner 결정 |
| 「GIFT CERTIFICATE」「DIBAY BENEFIT」 도안 글자 | 장식인지 문구인지 Owner 결정 |

## 4. 검증 (단계마다)

- **코드**: 최종 HEAD 에서 1회 —
  - `npm run typecheck:build`, `npm run typecheck:test`
  - 바꾼 파일 `eslint`
  - 관련 `vitest`(공통 함수 단위 테스트: 서버 한글·영어 문장이 절대 안 나옴, 코드 → 키, 상태 번호 → 키)
  - `npm run check:i18n-quality`, main 반영 전 `npm run test:ci`
- **화면 (Owner 화면 기준)**: 단계별 대표 화면을 ko·en 으로 1회씩 본다(로그인 계정·저장 주소·휴대폰).
  - 일부러 오류를 내야 하는 항목(신고 중복·차단 실패 등)은 운영 데이터를 바꾸지 않는 방법만 쓴다. 못 내면 NOT_PROVEN.
  - 앱 처음 실행·운영 사이트 자동화 열기는 측정 묶음당 **모든 기기 합쳐 10회 이하**(실행 횟수 × 195건을 보고서에 적음).
- **보고**: 단계 끝 1회. 원인·수정·검증·배포 SHA·남은 위험. 코드 PASS / Production / 실기 PASS 를 구분한다.

## 5. 순서·규모

```text
P1 공통 틀·가입·프로필 → P2 거래 → P3 신고·커뮤니티 → P4 메신저 → P5 매장·사장님 → P6 공용·주소 → P7 401 마무리·기준선
P8 iOS 시작 오류 (웹 단계와 독립, 다음 iOS 빌드 때)
```

- P2~P6 은 서로 독립이다(파일 겹침 없음, 각자 P1 공통 함수만 씀). P1 뒤 순서는 바꿔도 된다.
- P7 은 P1~P6 이 모두 반영된 뒤에만 한다.
- 운영 DB 적용 0건. 요청 예산(`docs/request-budget-ssot.md`) 영향 0 — 문구·표시만 바꾼다.

## 6. 남은 위험

- 공통 함수가 서버 문장을 무시하므로, 코드 표에 빠진 오류는 구체 안내 대신 일반 오류 키로 나온다. 단계마다 그 도메인 API 의 한국어 `error` 를 전수 목록으로 만들어 표에 넣는다(기준선 숫자로 확인).
- A3: 나중에 ko·en 약관 버전이 달라지면 버전 표시가 어긋난다. 그때 별도 처리한다.
- iOS WKWebView `navigator.languages` 가 앱 지원 언어로 좁혀지는지는 NOT_PROVEN(실기 확인 필요). 좁혀지면 「일본어·한국어」 순서 기기에서 ko 가 나올 수 있다 — 이번 설계 밖, 실기 확인 뒤 판단.

# 언어(국문·영문) 전체 재감사 — 가입부터 전 화면 (2026-11-27)

> **대체됨 (같은 날)** — 이 1차 감사는 표본 조사였다(전수 아님). 전수 결과·설계는 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` 와 `docs/audit/i18n-full-reaudit-2026-11-27/inventory.md` 를 본다. 이 문서의 「구매내역 거래 상태」 항목은 틀렸다(그 화면은 쓰이지 않음).

> Owner 지시 원문: 「가입 부터 전체적으로 기기의 언어, 각가의 언어 국문, 영문 부분을 다시 끝까지 감사 해서,, 정확히 영문 국문 변환이 되는지 빠진 부분은 없는지 명확히 확인 해줘」
> 기준 계약: `docs/i18n-ssot.md`. 기준 코드: **`origin/main` 9c5dcd6be** (주요 결함은 main 에서 다시 확인함).
> 판정은 모두 **코드 PASS/FAIL** 이다. 실기기·운영 화면·운영 DB 확인은 0회 → 화면 판정은 전부 **NOT_PROVEN**. 앱 실행 0회 · 운영 Supabase 추가 요청 0건.
> 작업자 실수: 감사 도중 작업 폴더가 main 보다 127커밋 뒤라는 것을 알게 됐다. 수치 1차 측정은 옛 트리에서 했고, 아래 결함은 main 에서 다시 확인했다. 검사 수치는 main 기준선(2026-11-26 18:27 PHT)으로 적었다.

## 0. 결론

- **변환 틀(언어 결정·카탈로그 짝)은 정상이다.** 기기 첫 언어 → ko/en, 토글 우선, 서버는 DB → 쿠키 → Accept-Language → en 순서. ko·en 키 수가 같고, 빈 값 0, 코드가 쓰는 키 중 카탈로그에 없는 것 0.
- **빠진 부분이 있다 → FAIL.** 영어 화면에 한국어가 나오거나 한국어 화면에 영어가 나오는 곳을 코드로 확인했다:
  - 서버가 보낸 한국어 오류 문장을 그대로 보여 주는 곳 약 25경로
  - 언어를 받지 않고 한국어로 고정된 라벨·저장 문장
  - 한국어 카탈로그 값이 영어인 것
  - 사장님 화면이 영문 오류 코드를 그대로 보여 주는 것
- 자동 검사 `check:i18n-quality` 는 통과한다. 다만 남은 결함을 **기준선(늘지만 않게 하는 목록)** 으로 들고 있다. 관리자 화면 밖 한국어 고정 문자열이 659파일 3,538건이다. 또 「한국어 값이 영어」 「영어 고정 문구」 「서버 문장 그대로 표시」는 검사가 원래 보지 않는다.

## 1. 확인 범위·방법

| 영역 | 방법 | 결과 |
|---|---|---|
| 언어 결정 | `lib/i18n/app-language-authority.ts`·`config.ts`·`AppLanguageProvider`·`app/layout.tsx` 읽기 | 코드 PASS |
| 카탈로그 ko·en 짝 | `MESSAGES` 전체 비교 스크립트 (32,965키) | 키 차이 0 · 빈 값 0 · en 에 한글 0 · **ko 값이 영어** 140건(대부분 브랜드, 결함 §2-3) |
| 코드가 쓰는 키 존재 | 9,575파일에서 `t("…")` 등 리터럴 키 추출·대조 | 없는 키 0. 템플릿 키 접두 49종은 모두 카탈로그에 있음 |
| 자동 검사 | `npm run check:i18n-quality` | PASS (기준선 안) |
| 가입·로그인·온보딩 | main 트리 화면·API·서버 오류 처리 추적 | §2-1 |
| 서버 API 한국어 | 기준선 상위 파일 → 클라이언트 표시 경로 추적 | §2-2 |
| 영어 고정 문구 | 고객·사장님 화면 1,845파일 스캔 → 렌더 확인 | §2-4 |
| 네이티브 | Android `values`/`values-ko`, iOS lproj·Swift·Java | §2-5 |

## 2. 결함 (FAIL — 코드로 확인)

### 2-1. 가입·로그인

화면 50여 개(`app/login`·`app/auth/**`·`components/auth/*`·전화 인증·동의·주소 단계)는 코드상 깨끗하다. 화면 문자열은 전부 키를 쓰고, 서버 오류는 코드 → 키로 바꾼다. 아래 항목만 결함이다.

| # | 결함 | 위치 | 보이는 것 |
|---|---|---|---|
| A1 | SNS 가입 때 이름이 없으면 기본 닉네임 「DIBAY 사용자」를 **DB 에 저장** | `lib/auth/post-login-profile-policy.ts:6,15` → `lib/auth/member-access.ts:249` | 영어 사용자 본인과 상대 화면에 「DIBAY 사용자」. 키 `profile_default_display_name`(en 「DIBAY user」)은 있지만 쓰는 곳이 없다. SSOT §3-5 위반 |
| A2 | 인증 문자가 언어와 상관없이 영어 | `lib/auth/phone-verify-sms.ts:21-24` | 한국어 사용자도 「[DIBAY] Verification code」를 받는다. 의도인지 기록 없음 → Owner 확인 |
| A3 | 필수 동의 버전을 ko 문서로만 계산 | `lib/legal/resolve-required-consent-versions.ts:84` | 영어 사용자는 en 원문을 보지만 버전 표시·저장은 ko 문서 기준이다. ko·en 버전이 다른지는 NOT_PROVEN(DB 미조회) |
| A4 | 어드민 전화 안내 문구가 영어로 적혀 있으면 ko 화면에 그대로 나옴. 기본 문구 「필리핀 번호만」이 +82 허용과 다름 | `lib/auth/phone-verification-public-settings.ts:33-36`, `auth-phone-settings.ts:34`, `phone-otp-service.ts:54` | 운영 저장값 NOT_PROVEN |
| A5 | 잔존 화면 `/onboarding/profile` 이 서버 한국어 오류를 그대로 표시 | `components/onboarding/OnboardingProfileClient.tsx:83` | 들어오는 링크가 없음 → 노출 가능성 낮음 |

- 사실(결함 아님): 로그인·가입 화면에는 언어 토글이 없다. 비로그인 사용자는 내정보(게스트)에서만 바꿀 수 있다. 첫 화면 언어는 기기 언어를 따른다.

### 2-2. 서버 한국어 문장이 영어 화면에 그대로 나오는 경로 (공통 원인)

- 공통 원인: 클라이언트가 `data.error ?? t(...)` 순서로 쓴다. 서버 문장이 있으면 그 문장이 먼저 나온다.
- 공통 401 문구 `lib/auth/server-guards.ts` 「로그인이 필요합니다.」 3곳(main 129·141·144줄 부근)도 같은 통로로 나간다.

| # | 서버 | 화면 |
|---|---|---|
| S1 | 거래 채팅 전송 `app/api/chat/rooms/[roomId]/messages/route.ts:216,236,243,287,311` | `components/chats/ChatDetailView.tsx:1418` (main 확인) |
| S2 | 거래 채팅 전송(구) `app/api/chat/room/[roomId]/send/route.ts:97-127` | `lib/chat/sendChatMessage.ts:52-73` → `ChatDetailView.tsx` |
| S3 | 거래 상태 저장 `app/api/posts/[postId]/seller-listing-state/route.ts:186-230` | `ChatDetailView.tsx:992` (main 확인), `CommunityMessengerTradeProcessSection.tsx:247` |
| S4 | 내 상품 상태 `posts/[postId]/owner-status/route.ts` | `components/mypage/products/MyProductsView.tsx:209-211` |
| S5 | 글 삭제 `posts/[postId]/owner-delete/route.ts:69,99` | `PostDetailView.tsx:976-980`, `PostCard.tsx:713` |
| S6 | 일자리 지원 `posts/[postId]/job-apply/route.ts` | `PostDetailView.tsx:1177` |
| S7 | 거래 글 등록 `posts/create/route.ts`, `lib/posts/createPost.ts:24-53` | `TradeWriteForm.tsx:2005` |
| S8 | 상품 댓글 `posts/[postId]/comments/route.ts:68,94` | `PostCommunityCommentsSection.tsx:133` |
| S9~S12 | 신고(게시글·통합·필라이프·댓글) `app/api/reports`·`app/api/community/reports`·`lib/reports/*` | `ReportReasonModal.tsx:68`, `ReportActionSheet.tsx:77`, `CommunityDetail.tsx:453`, `PostCommunityCommentsSection.tsx:179` |
| S13 | 차단 `lib/reports/request-user-block.ts:17`, `chat/rooms/[roomId]/block/route.ts` | `CommunityDetail.tsx:394` |
| S14 | 동네 글쓰기 `community/neighborhood-posts/route.ts:83-173` | `PhilifeNeighborhoodWriteForm.tsx:955` |
| S15 | 프로필 저장 `me/profile/route.ts:353,1156,1205,1226`, `lib/profile/updateMyProfile.ts:45` | `ProfileEditForm.tsx:465,491` |
| S16 | 프로필 사진 `me/profile/avatar/route.ts:43,47` | `ProfileImageField.tsx:100` |
| S17 | 상품 수정 잠금 `posts/[postId]/owner-edit/route.ts` | `ProductTradeEditPageClient.tsx:62,70` |

- 도메인별 추정치(경로 기준, 관리자·시드 약 1,388건 제외):

  | 도메인 | 확인된 노출 |
  |---|---|
  | 거래 | ~90 |
  | 메신저 | ~40 (통화 ~15 별도) |
  | 커뮤니티 | ~35 |
  | 신고·고객센터 | ~35 |
  | 내정보 | ~25 |
  | 매장 | ~6 (가능성 ~25) |

- 메신저 방 API 의 한국어 오류 100건 이상은 code → 키로 바뀌어 화면에 나오지 않는다(정상).
- 별도(한국어 아님): `CommunityDetail.tsx:413` 은 삭제 실패 때 영문 코드 `imported_not_deletable` 을 그대로 보여 준다(main 확인).

### 2-3. 언어를 받지 않는 한국어 고정 라벨·저장 문장

| # | 결함 | 위치 | 보이는 것 |
|---|---|---|---|
| K1 | 일자리 상세 라벨을 언어와 상관없이 한국어로 만듦 | `lib/jobs/job-detail-format.ts:10` (`DEFAULT_APP_LANGUAGE`=ko) → `components/jobs/JobsExtendedDetailExtras.tsx:82,83,137,143` | 영어 화면의 근무 요일·근무 시간대·구직 시간대·가능 언어가 한국어 (main 확인) |
| K2 | 거래 상태 라벨 「판매중·문의중·예약중·거래완료」 | `lib/products/seller-listing-state.ts:22-25,64-72` → `ChatProductSummary.tsx:116-150`, `PurchaseHistoryCard.tsx:81,158` | 영어 화면 거래 채팅 상단·구매내역에 한국어 (main 확인) |
| K3 | 친구 요청 실패·시간 문구(「n주 후」「n일 후」)가 한국어 전용 함수 | `lib/community-messenger/community-messenger-friend-request-client.ts:35-62,237-256` → 메신저 홈·방 안내·연락처 등 5곳 | 영어 화면에 한국어 (main 확인) |
| K4 | 공개 모임 카드 JSX 가 한국어 | `components/community-messenger/home/DiscoverableOpenGroupCard.tsx:22-36` | 메신저 홈 |
| K5 | 그룹방 정보 「허용/제한·등록됨/없음·마지막 활동 없음」 | `use-messenger-room-phase2-room-presentation.ts:322-336,374` | 그룹방 정보 시트 |
| K6 | 매장 주문 채팅 「결제·금액이 확정되었어요…」를 message_key 없이 한국어로 저장 | `lib/community-messenger/store-order-chat-service.ts` `appendStoreOrderMessengerPaymentCompletedLine` (main 확인) | 영어 사용자 주문 채팅에 한국어. 화면에서 다시 번역할 키가 없다 |
| K7 | 장바구니 영어 문구 안에 한국어 라벨이 끼어듦 | `lib/stores/store-address-form-ui.ts:11-12,30` → `StoreCommerceCartPageClient.tsx:1768,2750`, `OwnerStoreBasicInfoForm.tsx:1125` | 장바구니·사장님 기본정보 |
| K8 | 한국어 카탈로그 값이 영어 | `lib/i18n/catalog/addresses-ui.ts:70-75`. `addr_ui_kind_home` 「House」·`_office` 「Office」·`_other` 「Input」·`_shop` 「Store」·`_store` 「Store Address」·`addr_ui_shop_prefix` 「Store · {name}」 | 한국어 화면 주소 목록·장바구니 주소 행에 영어(`UserAddressDesignationTitle.tsx`·`AddressListRowBody.tsx`·`AddressPlatformDetailClient.tsx:678`). 2026-05-27 커밋 `0d27190f1` 「수정」부터. 영어로 둔 결정 기록 없음 |
| K9 | 매장 화폐가 한국어 화면에 「Cash」(용어집 ko 「캐시」) | `OwnerCoinConvertSection.tsx:342` (main 확인), `OwnerFinanceHomeCards.tsx:94`. 카탈로그 ko 값 `owner_bc_title`·`owner_bc_page_title`·`owner_ads_business_cash_label` 등도 「Cash」 | 사장님 화면 |

- 노출 가능성(화면에서 다시 번역하는지 확인 못 함 → NOT_PROVEN):
  - 거래 채팅 목록 미리보기에 「사진 N장」을 한국어로 저장(`chat/rooms/[roomId]/messages/route.ts:320-355`)
  - 매장 주문 미리보기 사진·음성 분기가 lang 무시(`lib/messenger/store-order/preview.ts:35-66`)
  - 그룹 미리보기 `lib/messenger/group/preview.ts:51`
  - 고객센터 첫 메시지 `lib/support/support-case-service.ts:412`
  - `lib/business/owner-api-error-i18n.ts:47` 는 모르는 한국어 문장을 그대로 돌려준다

### 2-4. 한국어 화면에 영어가 그대로 나오는 곳 (고객·사장님)

- 홈·거래·필라이프·내정보에는 영어 고정 문구가 없다(0건).

| # | 결함 | 위치 |
|---|---|---|
| E1 | 사장님 광고·팝업·관리 메모 화면이 서버 오류 코드(`load_failed`·`save_failed`·`submit_failed` 등)를 그대로 표시 | `components/business/owner/ads/OwnerEventPromotionDetailClient.tsx:45,87,112,148→172` (main 확인), `OwnerEventPromotionListClient.tsx`, `OwnerPlatformPopupApplyView.tsx:227-361`, `OwnerPlatformPopupRequestDetailView.tsx:48,75,89,91`, `OwnerDeliveryAdsHubView.tsx:137`, `OwnerDeliveryAdPartnerView.tsx:97,155`, `OwnerCareAdminNotesThread.tsx:45`, `OwnerCareAdminNotesList.tsx:77` |
| E2 | 이미지 대체 문구 「Advertisement」「36:25 crop preview」 | `OwnerPlatformPopupApplyView.tsx:447,705`, `OwnerPlatformPopupRequestDetailView.tsx:187` |
| E3 | 화면 읽기 문구 「order no」「review filter」「Close」 | `OwnerStoreSettlementsView.tsx:420`, `StoreCommissionLedgerParts.tsx:521`, `components/ui/dibay-overlay/DibayFullSheet.tsx:116`, `DibayOverlayRoot.tsx:171` |
| E4 | 이벤트 약관 절 제목 「Terms」 | `components/platform-events/PlatformEventDetailContent.tsx:111` |
| E5 | 그룹 초대 이름 없음 「Group」 | `app/(main)/group/[token]/GroupInviteJoinClient.tsx:203` |
| E6 | 상품권 도장 「USED」. 「GIFT CERTIFICATE」「DIBAY BENEFIT」은 장식인지 Owner 결정 필요 | `components/gift-certificate/DibayGiftCertificateFace.tsx:341,446,764` |

### 2-5. 네이티브

- 정상(코드):
  - Android 기본(영어) 123키 / ko 117키. 빠진 6개는 브랜드·패키지 값이라 정상이다.
  - Android 알림 채널·수신 화면·통화 중 알림은 `DibayNativeLocale` 을 거쳐 앱 언어 → 기기 언어 순으로 고른다.
  - iOS 권한 문구 6개가 en·ko lproj 둘 다에 있다.
  - iOS 통화 문구는 `DibayNativeCopy` 로 앱 언어 → 기기 언어 순이다.
- 결함:

| # | 결함 | 위치 |
|---|---|---|
| N1 | iOS 시작 오류 화면(오프라인 등)이 「기기 첫 언어가 en 일 때만 영어, 그 밖은 한국어」. SSOT(한국어 외 = en)와 반대이고 앱 언어 선택도 읽지 않음 → 필리핀어·일본어 기기에서 한국어. 통화 코드 아님 | `ios/**/DibayRootBridgeViewController.swift:846` (main 확인) |
| N2 | **[통화 — 보고만]** 통화 푸시 제목·본문이 항상 한국어(「영상 통화」「{name}님의 전화」, 「통화」) | `lib/push/send-community-messenger-incoming-call-push.ts:66-67`, `lib/call/call-notification.ts:40-41`, `…answered-elsewhere-push.ts:33`, `…call-canceled-push.ts:47` |
| N3 | **[통화 — 보고만]** Android 발신자 이름 없음 「수신 통화」, context 없음 「DiBay 영상/음성 통화」 고정 | `FcmPayloadResolver.java:94`, `IncomingCallUiCopy.java:10-11,67,69` |
| N4 | **[통화 — 보고만]** 발신자 이름을 한국어 본문 「님의 전화」에서 뽑아냄 → N2 를 영어로 바꾸면 이름 추출이 깨진다(같이 바꿔야 함) | `IncomingCallUiCopy.java:73-95`, `IncomingCallCallerIdentity.swift:75-84` |
| N5 | **[통화 — 보고만]** 그룹 통화 상태 문구 한국어 | `use-messenger-room-phase2-room-presentation.ts:309-316` |

- 사실: OS 권한 창(iOS·Android)은 앱에서 고른 언어가 아니라 **기기 언어**를 따른다. Android 앱 단위 언어 설정(`localeConfig`)도 없다. 결함으로 볼지는 Owner 결정이다.
- 확인 필요(NOT_PROVEN): iOS WKWebView 의 `navigator.languages` 가 기기 언어 목록 전체인지, 앱이 지원하는 언어(en·ko)로 좁혀진 값인지. 좁혀지면 일본어·한국어 순서 기기에서 ko 가 나올 수 있다 — 실기 확인 필요.

## 3. 자동 검사의 사각지대 (결함이 다시 생기는 이유)

1. 「ko 값에 한글이 없음」을 보지 않는다 → K8·K9.
2. 고객 화면의 영어 고정 문구를 보지 않는다 → §2-4.
3. 서버 `error` 문장을 클라이언트가 그대로 보여 주는 형태를 보지 않는다 → §2-2.
4. `user-hangul-literal` 3,538건은 기준선이라 늘지만 않으면 통과한다(줄지도 않음).

## 4. 남은 것 (NOT_PROVEN)

- 실기기·운영 화면: Android·iPhone ko↔en 전환, 가입 전 단계, 수신 화면, 알림 채널 이름, 권한 창.
- 운영 DB: en 약관·개인정보·마케팅 게시 여부, ko·en 버전 일치, 어드민 전화 안내 문구, `name_en` 빈 커뮤니티 주제 수.
- SNS 업체 동의 화면 언어(Google·Kakao·Apple 쪽 화면).
- 여러 줄 JSX·`lib/**` 영어 문구 전수(이번 스캔은 고객 화면 파일만).

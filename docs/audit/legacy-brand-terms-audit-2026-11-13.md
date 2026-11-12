# 레거시 타사 용어 전수 감사 (2026-11-13 · 보고만)

- 지시: 출시 전 배민·배달의민족·당근·텔레그램·페이스북·마켓플레이스·스타벅스 등 레거시 용어 참조 전수 감사, 삭제 가능 / 불가 구분 보고. **기능 변경 없음 · 이번 단계는 보고만 (수정·커밋 없음)**.
- 기준 트리: 브랜치 `fix/group-room-drawer-ssot` HEAD `a110a9309` (git 추적 파일 16,107개 전체, `git grep`).
- 검색어: 배민·배달의 민족·baemin / 당근·daangn·karrot·carrot / 텔레그램·telegram / 페이스북·facebook / 마켓플레이스·marketplace / 스타벅스·starbucks / 카톡 / 요기요·쿠팡·번개장터·중고나라·whatsapp·instagram·wechat·grab·foodpanda·shopee·lazada.
- 운영 DB: `ckdosyydvgzqwpbwuhon`(운영) **읽기 전용** 조회. 테스트 DB 미접근.
- 원본 적중 목록(줄 단위 CSV): 작업 스크래치 `hits.csv` (코드 1,199줄 / 518파일, 문서 제외).

## 0. 결론 요약

| 구분 | 건수 | 판정 |
|---|---|---|
| A. 고객 화면 노출 문구 | **0건 (코드 기준)** | 실기 화면 확인 NOT_PROVEN |
| B. 관리자 화면 노출 문구 | 12키 + 패널 1 | **삭제 가능** (문구만 교체) |
| C. 서버 오류 문구 · 공개 파일 | 2건 | **삭제 가능** |
| D. 사용처 없는 코드 문구 | 1건 | **삭제 가능** |
| E. 주석 (웹·스크립트·테스트) | 약 360줄 | **삭제 가능** (기능 영향 0) |
| F. 테스트 설명 문자열 | 약 15건 | **삭제 가능** |
| G. 파일명·변수명·CSS 토큰명·data 속성 | 파일 31개 + 식별자 약 150종 | **삭제 가능(이름 변경)** — 범위 큼, 검사 스크립트 동반 수정 |
| H. Facebook 로그인 잔재 | 코드 약 40곳 + 운영 DB 행 2·CHECK 6 | **삭제 가능 · Owner 승인 필요** (인증 코드 + 운영 DB) |
| I. 운영 DB 주석(COMMENT) | 4건 | **삭제 가능 · Owner 승인 필요** (운영 DB 변경) |
| J. 통화 코드 (웹·네이티브) | 웹 166 · 네이티브 72 | **삭제 불가(보류)** — 통화 규정·Owner 11-12 「통화 손대지 않음」 |
| K. 설정 키 · 설치 앱 호환 | env 1 · 네이티브 저장 키 2 | **삭제 불가** |
| L. 마이그레이션 파일 | 파일명 5 + 본문 | **삭제 불가** (적용 이력) |
| M. 실제 외부 연동 (레거시 아님) | 카카오·인앱 브라우저 감지 등 | **삭제 불가** (기능) |
| N. 운영 DB 사용자·운영자 콘텐츠 | 글·방·메시지·가져오기 초안 | **삭제 불가** (사용자 데이터) |
| O. 문서 (`docs/` 246 · `.cursor/` 26 · `AGENTS.md`) | 약 1,600줄 | 앱 미포함 — 기준 문서는 **불가**, 나머지 **가능** |
| P. `marketplace` 일반 영어 | 약 1,570줄 | **대상 아님** (폴더·변수명 `lib/trade/marketplace` 등, 브랜드 아님) |

요기요·쿠팡·번개장터·중고나라·wechat·grab·shopee 는 **코드 0건** (문서에만 있음).

## A. 고객 화면 노출 — 0건 (코드 기준)

- i18n 카탈로그(`lib/i18n/catalog/*`) 와 코드 안 비주석 한글 문자열 전수 확인 → 고객 화면용 키에 레거시 브랜드 문구 없음.
- 예외처럼 보이는 것: `auth_provider_continue_facebook`(「Facebook으로 계속하기」) — `components/auth/login-provider-platform-filter.ts:17` 이 Facebook 버튼을 **항상 숨김**, 서버도 `lib/auth/auth-provider-store.ts:108` 에서 항상 차단. → H 로 분류.
- 카카오톡 문구(공유·매장 신청 「카카오톡 ID」·로그인)는 **실제 연동 기능** → M.
- 판정 근거는 코드만. Owner 기기 화면 확인은 **NOT_PROVEN**.

## B. 관리자 화면 노출 문구 — 삭제 가능 (i18n 값만 교체, ko·en 함께)

| 파일:줄 | 현재 문구 |
|---|---|
| `lib/i18n/catalog/admin-member-shared.ts:550-551` | 당근형 · 제목+우측/좌측 썸네일 (피드 스킨) |
| `lib/i18n/catalog/admin-member-shared.ts:1360` | 당근형 회색 (메뉴 프리셋) |
| `lib/i18n/catalog/admin-settings.ts:259,267,685,693` | 당근 매너 온도(참고) — 배터리 정책 참고 패널 |
| `lib/trust/battery-policy-reference.ts:37` 외 · `components/admin/settings/BatteryPolicyReferencePanel.tsx` | 「당근(Daangn/Karrot) 매너 온도」 참고 섹션 본문 (`DAANGN_MANNER_TEMP_REFERENCE`) |
| `lib/i18n/catalog/admin-trade.ts:101` | 당근형 유료 광고 운영 흐름 |
| `lib/i18n/catalog/copy-admin-b4-stores.ts:358` | 배민과 같은 구조로 구성 |
| `lib/i18n/catalog/copy-admin-b4-stores.ts:409` | 배민처럼 홈 순서와 따로 |
| `lib/i18n/catalog/admin-console-core.ts:34,307` | OAuth 안내에 「페이스북/Facebook」 — H 와 함께 처리 |
| `lib/i18n/catalog/admin-console-core.ts:233,506` | 공급자 라벨 「페이스북」 — H 와 함께 처리 |
| `lib/i18n/catalog/copy-admin-b4-community.ts:154,617` | 예시 「운영자 카톡 허락」 (placeholder) |

배터리 참고 패널의 「1) 당근 매너 온도」 절은 문구 교체가 아니라 **절 삭제**가 맞음 (참고용 타사 설명).

## C. 서버 오류 문구 · 공개 파일 — 삭제 가능

- `app/api/reports/route.ts:184` — 「마이그레이션(daangn_full_trading reports)을 적용해 주세요」 (서버 안내, 코드 안 한국어 — i18n 규정 위반 상태이기도 함).
- `public/stickers/ATTRIBUTION.md:12` — 「Telegram / 카카오 / LINE 등 상용 스티커 팩」 (공개 주소로 열리는 파일).

## D. 사용처 없는 코드 문구 — 삭제 가능

- `lib/community-feed/topic-feed-skin.ts:24-30` `COMMUNITY_FEED_LIST_SKIN_LABELS` (「당근형 · …」) — 저장소 전체에서 참조 0 (관리자 화면은 i18n 키 사용).

## E. 주석 — 삭제 가능 (기능 영향 0)

웹·스크립트·테스트 주석 약 360줄 (통화 경로 주석 35줄은 J 로 제외). 대표:
- 배민: `components/stores/**`, `lib/stores/**`, `app/delivery-*.css` 「배민 미러링」「Baemin-style」.
- 당근: 거래 글쓰기·신고·모임 「당근형」「Carrot-style」, 「FB 마켓플레이스형」(`components/post/TradeDetailInlineChatCard.tsx:21`, `components/product/detail/product-detail-bottom-constants.ts:9`, `lib/ads/feed-ad-geometry.ts:114`, `lib/trade/location/trade-browse-radius.ts:4`).
- 스타벅스: `app/samarket-components.css:2091,2138,2413`, `lib/community/community-design-tokens.css:2`.
- 텔레그램·페이스북: 메신저·커뮤니티 「Telegram-style」「페이스북형」.
- 네이티브 주석 `android/app/src/main/AndroidManifest.xml:4` 「카카오톡·배민급」 — 삭제 가능하나 **네이티브 파일**이므로 다음 네이티브 일괄 빌드 때 함께.

## F. 테스트 설명 문자열 — 삭제 가능

`describe/it` 이름 약 15건 (예: `post-image-display.test.ts:33` 「페이스북형 배치」, `mypage-r4-screens.test.tsx:313` 「텔레그램형」, `messenger-delivery-room-header.test.ts:100` 시험 데이터 「스타벅스」, `trade-listing-age.test.ts:15` 「당근 단위」). 단 `scripts/verify-cm-kakao-telegram-navigation-contract.mjs:71` 은 **커밋 메시지에 「카톡/텔레그램형」 문자열이 있는지 검사**하므로 이 스크립트와 함께 정리해야 함.

## G. 파일명·식별자·CSS 토큰·data 속성 — 삭제 가능(이름 변경), 범위 큼

화면 동작 무변경이지만 import·검사 스크립트(`scripts/verify-*`)·테스트가 이름을 직접 참조 → 한 PR 에서 동반 수정 필요.

| 레거시 | 파일 | 대표 식별자 |
|---|---|---|
| 배민 (12+5 파일) | `components/stores/cart/baemin/*`(6), `components/stores/product-detail/baemin/*`(6), `lib/stores/store-baemin-cart-ui.ts`, `store-detail-baemin-presentation.ts`, `store-menu-detail-cart-baemin-presentation.ts`, `lib/design/delivery-baemin-mirror.ts` | `StoreBaemin*`, `BAEMIN_CART_*`(약 25개), `baeminAvisPattern`, `baeminMint/Purple`, `data-baemin-mirror*`(6), `dibay-stores-baemin-visual-ssot-*` |
| 당근 (4 파일) | `components/write/trade/trade-karrot-classes.ts`, `lib/reports/blockUserDaangn.ts`, `lib/reports/submitReportDaangn.ts`, `lib/types/daangn.ts` | `KARROT_PILL_*`, `variant="karrot"`, `isKarrot`, `ListMetaKarrot`, `FeedListLayoutCarrotThumb*`, `karrotMeetSpotUi`, `blockUserDaangn`, `submitReportDaangn`, `applyReportActionDaangn`, `daangnTargetType`, `admin_menu_preset_label_inactive_carrot`(i18n 키), `package.json` 스크립트 `sql:copy:community-feed-daangn` |
| 스타벅스 (5 파일, 통화 밖) | `lib/ui/address-list-starbucks-styles.ts`, `delivery-fab-christmas-starbucks-palette.ts`, `dibay-onboarding-starbucks-styles.ts`, `mypage-home-starbucks-styles.ts`, `profile-edit-starbucks-styles.ts` | `STARBUCKS_GREEN/BG`, `useStarbucksTheme`, `useStarbucksBadges`, CSS 변수 `--cm-room-starbucks-green/cream`(`app/design-tokens.css:346-552`) |
| 페이스북 | `components/stores/store-facebook-feed-tokens.ts` | — |
| 인스타그램 | `lib/chats/instagram-dm-tokens.ts` | `MypageInstagramView`, `instagramFooterBottomPx` |
| 텔레그램 (통화 밖) | `lib/chat-domain/list/__tests__/telegram-list-authority.test.ts`, `scripts/verify-telegram-list-authority.mjs`, `scripts/verify-cm-kakao-telegram-navigation-contract.mjs`, 메신저 테스트 2 | `TELEGRAM_LIST_RESTRICTED_*`(`eslint.config.mjs`), `NEXT_PUBLIC_TELEGRAM_LIST_AUTHORITY_LOG`(env 이름 — K 참고) |

`lib/ui/design-system-hard-lock.ts:19` `forbiddenBrandNotes: ["karrot-orange", "당근 주황"]` 는 **금지 색 검사용 목록**이라 지우면 검사 기능이 사라짐 → 이 1건은 **삭제 불가**(검사 목록 유지).

## H. Facebook 로그인 잔재 — 삭제 가능 · Owner 승인 필요

- 현재 상태 (운영 DB 조회, 2026-11-13): `auth_providers.facebook enabled=false`, `auth_login_settings.facebook enabled=false`, Facebook 가입자 `profiles` **0명**, `user_auth_identities` **0건**.
- 코드: `lib/auth/*`(공급자 목록·항상 차단·네이티브 교환 계약), `components/auth/OAuthLoginProviderVisuals.tsx`(`SiFacebook` 아이콘), `app/api/admin/auth-settings`·`users` 라우트, 테스트 다수, `config/image-remote-patterns.json:13` `graph.facebook.com`.
- 운영 DB: CHECK 제약 6개(`auth_login_settings_provider_check`, `auth_providers_provider_check`, `profiles_auth_provider_check`, `profiles_provider_check`, `user_auth_identities_provider_check`, `users_provider_check`)에 `'facebook'` 포함 + 설정 행 2개.
- 삭제하려면 인증 코드 변경 + 운영 DB 마이그레이션 → 개발 프로세스상 운영 DB 적용은 Owner 별도 승인 항목.

## I. 운영 DB 주석(COMMENT) — 삭제 가능 · Owner 승인 필요

| 객체 | 주석 |
|---|---|
| `chat_rooms` (테이블) | 당근형 통합 채팅방 … |
| `product_chats.trade_flow_status` | 거래 세션 상태(당근형) |
| `user_addresses.place_id` | … Baemin-style delivery addresses |
| `community_messenger_rooms.pinned_message_id` | (Telegram/Kakao pin) |
| `community_messenger_message_requests` (테이블) | … Telegram-style CM … |

운영 DB 테이블·컬럼·함수 **이름**에는 레거시 용어 **0건**, 함수 본문 **0건**.

## J. 통화 코드 — 삭제 불가(보류)

- 웹: `components/messenger/call/*`(`isStarbucks` 약 65곳, `STARBUCKS_CALL_SURFACE`), `lib/community-messenger/call-v3|v4/*`(`isCallV4TelegramLaneEnabled`, `CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT`, `call-v4-telegram-incoming-surface.ts`), 수신 배너 토큰 등 166곳.
- 네이티브: `CallV4Lane.isTelegramLaneEnabled` 약 45곳(Android), 통화 drawable 주석(Starbucks), iOS 통화 권한 주석(「텔레그램 방식」).
- 근거: AGENTS.md 「통화 변경 규정」 1항(웹·서버·네이티브 통화 코드 전부 적용) + Owner 2026-11-12 「통화는 삭제·정리 포함 손대지 않음」. 이름만 바꿔도 통화 경로 변경 → 단독 PR·영향 분석·Owner 승인·실기 행렬 필요.
- `docs/dibay-call-minimized-surface-cta-ssot.md` 는 「레거시 Telegram 실측 기준」이 **정의 자체**이므로 문서상의 Telegram 표기도 유지.

## K. 설정 키 · 설치 앱 호환 — 삭제 불가

- Vercel 환경변수 `NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE` (통화 + Vercel 설정 변경 = 별도 승인).
- 네이티브 저장 키 `v4_telegram_lane`, `dibay-call-lane.json` 의 `v4TelegramLane`(Android·iOS) — 설치된 구 바이너리가 이 키를 읽으므로 이름 변경 시 호환 깨짐.
- `NEXT_PUBLIC_TELEGRAM_LIST_AUTHORITY_LOG` — 이름 변경은 가능하나 Vercel 환경변수 동시 변경 필요(설정 변경 승인 항목). 현재 설정 여부 미확인 → NOT_PROVEN.

## L. 마이그레이션 파일 — 삭제 불가

`20260321120000_community_feed_daangn.sql`, `20260328100000_dangnae_community_sample_flags.sql`, `20260328110000_dangnae_karrot_sample_seed.sql`, `20260513204000_baemin_style_address_rebuild_fields.sql`, `20271030150000_delivery_menus_baemin_mirror.sql` 및 다른 마이그레이션 본문 주석 — 운영에 적용된 이력이라 파일명·본문 변경 금지.
- 반면 `supabase/scripts/paste-dangnae-community-sample.sql`, `supabase/scripts/SQL-적용순서.txt`, `supabase/scripts/복사-방법.txt` 는 수동 샘플용 보조 파일 → **삭제 가능**.

## M. 실제 외부 연동 — 삭제 불가 (레거시 아님)

- 카카오 로그인·카카오톡 공유·매장 신청 「카카오톡 ID」, `ios/App/App/Info.plist:60` `kakaotalk` 스킴.
- `lib/apple-iap/ios-digital-purchase-contract.ts:24` 인앱 브라우저 감지 정규식(`FBAN|Instagram|KAKAOTALK|WhatsApp` …) — 결제 경로 판정 기능.
- 커뮤니티 공유·가져오기 출처로서의 Facebook·Instagram 이름 (사용자 데이터 출처 표기).

## N. 운영 DB 사용자·운영자 콘텐츠 — 삭제 불가

5만 행 미만 public 테이블 전체 행 텍스트 검색 결과: `community_posts` 12, `posts` 1, `profiles` 1, `community_messenger_rooms` 3, `community_messenger_messages` 3, `community_operator_import_drafts` 7, 스냅샷·알림·감사 로그 테이블 다수. 모두 사용자·운영자가 작성한 내용(또는 그 캐시)이므로 정리 대상 아님. 각 행 본문은 열람하지 않음.
- 매장·카테고리·배너·팝업·관리자 설정 테이블 적중 **0건**.
- 5만 행 이상 테이블은 조회하지 않음 → **NOT_PROVEN**.

## O. 문서 — 앱에 포함되지 않음

- `docs/` 246파일, `.cursor/` 26파일, `AGENTS.md` (「당근·배민·카톡 동급 수렴」 등).
- 삭제 불가: 통화 표면 SSOT(Telegram 실측 기준), 성능 수렴 기준 문서(`docs/samarket-parity-execution-order.md` 등 — 비교 대상 자체가 정의), AGENTS.md 규정 문구 (Owner 규정 원문).
- 삭제 가능: 그 밖의 감사·설계 기록의 비교 표현. 단 이력 문서라 수정 이익이 낮음 — 출시물에 영향 없음.

## 삭제 진행 시 권장 묶음 (승인 필요 단위)

1. **PR 1 (웹, 승인 범위 내 처리 가능)**: B·C·D·E·F + G 중 비통화 파일·식별자 이름 변경 + 관련 `verify-*` 스크립트 동반 수정. 기능 무변경, 스타일·클래스 값 동일 유지.
2. **PR 2 (인증 + 운영 DB, Owner 승인 필요)**: H + I (Facebook 공급자 제거 마이그레이션 · DB 주석 교체).
3. **보류**: J·K (통화 손대지 않음 해제 시 통화 규정 절차로 별도).
4. 네이티브 주석(`AndroidManifest.xml:4`)은 다음 네이티브 일괄 빌드 PR 에 포함.

## 확인 조건

- 코드: `git grep` 전수 (추적 파일 16,107개), HEAD `a110a9309`, 2026-11-13 PHT.
- 운영 DB: `ckdosyydvgzqwpbwuhon` 읽기 전용 — 스키마 이름·함수 본문·COMMENT·CHECK 제약, 5만 행 미만 테이블 전체 행 텍스트.
- 화면 실기 확인: 하지 않음 → 고객·관리자 화면 노출 판정은 **코드 기준**, 실기는 NOT_PROVEN.

## 처리 결과 — 1번 묶음 (2026-11-13 · Owner 「1번 진행」)

브랜치 `chore/legacy-brand-terms-cleanup` (기준 main `b8379deeb`). 기능 무변경 — 이름·문구·주석만.

### 한 일
- **관리자 문구 (B)**: 피드 스킨 「당근형」→「기본형」, 메뉴 프리셋 「당근형 회색」→「중간 회색(#999999)」(키 `…inactive_carrot`→`…inactive_999`), 「당근형 유료 광고」·「배민과 같은 구조」·「배민처럼」·「운영자 카톡 허락」·「페이스북형 업데이트」 문구 교체 (ko·en). 배터리 참고 패널의 「1) 당근 매너 온도」 절 삭제 + 뒤 절 번호 1칸씩 당김 + `DAANGN_MANNER_TEMP_REFERENCE` 삭제.
- **서버 문구·공개 파일 (C)**: `app/api/reports/route.ts` 안내 문구, `public/stickers/ATTRIBUTION.md`.
- **안 쓰는 코드 (D)**: `COMMUNITY_FEED_LIST_SKIN_LABELS` 삭제.
- **주석·테스트 설명 (E·F)**: 통화 밖 주석 전부 중립 표현으로 교체 (예: 「배민 미러링」→「배달 메뉴 구성」, 「텔레그램형 전화 인증」→「단계형」, 「Telegram-style」→「messenger-standard」, 「Telegram list authority」→「Domain list authority」 — 검사 스크립트의 표식 문자열도 함께).
- **파일·식별자 (G)**: 코드 파일 34개 이름 변경 (`cart/baemin/`→`cart/sections/`, `product-detail/baemin/`→`product-detail/view/`, `*-starbucks-styles`→`*-styles`, `trade-karrot-classes`→`trade-write-classes`, `blockUserDaangn`→`request-user-block`(`requestUserBlock` — 기존 `blockUser` 와 충돌 회피), `submitReportDaangn`→`submitReport`, `lib/types/daangn`→`lib/types/trade-report`, `store-facebook-feed-tokens`→`store-feed-tokens`(`FB`→`FEED_UI`), `instagram-dm-tokens`→`chat-dm-tokens`, 텔레그램 목록 권한·허브 이동 검사 스크립트·테스트·규칙). 식별자: `StoreBaemin*`→`StoreCart*`/`StoreProductDetail*`, `BAEMIN_CART_*`→`CART_UI_*`, `data-baemin-mirror*`→`data-delivery-chrome*`, `KARROT_*`→`TRADE_WRITE_*`, `variant="karrot"`→`"trade"`, `variant="instagram"`→`"dm"`, `badgeStyle="starbucks"`→`"brand"`, `--cm-room-starbucks-*`→`--cm-room-brand-*` 등. npm 스크립트 `verify:cm-hub-navigation-contract`·`verify:domain-list-authority`·`sql:copy:community-feed` 로 이름 변경, `sql:copy:dangnae` 삭제.
- **참조 문서 이름 (O 일부)**: 코드가 경로로 가리키던 문서 6개·규칙 2개 이름 변경, 문서 안 경로 참조 갱신.
- **수동 샘플 SQL (L 일부)**: `supabase/scripts/paste-dangnae-community-sample.sql`·`SQL-적용순서.txt`·`복사-방법.txt` 삭제.

### 남긴 것 (계획대로)
- 통화 코드·네이티브·설정 키 (J·K), Facebook 로그인 잔재 (H), 운영 DB 주석 (I), 마이그레이션 (L), 실제 연동 (M), 금지 색 검사 목록 `karrot-orange` (G 예외), `AndroidManifest.xml` 주석 (네이티브 일괄 빌드 때).
- 기록용 파일: `scripts/qa/*` (과거 정리 목록), `scripts/_encoding_convert_result.json` (과거 실행 결과), `docs/` 본문 비교 표현.
- 마이그레이션 2개(`20270709120000_delivery_menus.sql`·`20271030150000_delivery_menus_baemin_mirror.sql`) 주석의 설계 문서 경로는 옛 이름 그대로 (마이그레이션 수정 금지). 새 이름: `docs/audit/delivery-master-plan-2026-10-29.md`, `docs/audit/delivery-browse-chrome-design-v6-2026-10-30.html`.

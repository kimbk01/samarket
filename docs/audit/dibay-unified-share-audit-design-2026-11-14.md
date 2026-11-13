# DIBAY 통합 공유 시스템 — 전수 감사 · 결함 · 구조 설계 (READ-ONLY, Owner 승인 대기)

- 작성: 2026-11-14 PHT · 기준 HEAD `681c8ccf7` (로컬 저장소, 다른 세션 미커밋 변경은 건드리지 않음)
- 배포 구분: **변경 없음** — 코드·DB·네이티브·설정 수정 0, 커밋·PR·병합·배포 0. 이 문서와 시안 HTML 1개만 새로 만듦(미커밋).
- 시안: `docs/design/dibay-unified-share-mockup-2026-11-14.html` (앱 원본 CSS 인라인: preflight `@layer base` + `app/design-tokens.css` + `app/dibay-overlay.css`, Pretendard 1.3.9)
- 증거 수준 표기: **코드 확인** = 파일:줄을 직접 읽음 · **NOT_PROVEN** = 실기기·운영 화면·운영 DB·실제 SNS 로 확인 안 함. 이번 작업은 지시대로 실기기 시험·운영 DB 조회를 하지 않았으므로 **모든 런타임 판정은 NOT_PROVEN** 이다. 아래 PASS/FAIL 은 「코드 기준」 판정이다.

---

## 0. 명칭 대조 (지시서 ↔ 승인 SSOT)

`lib/brand/dibay-service-brand.ts` (Owner 최종 승인 2026-11-13) 기준.

| 지시서 표기 | 승인 SSOT | 차이 |
|---|---|---|
| LATARING | **LETARING** | 철자 다름 — 문서·문구는 SSOT 의 LETARING 사용 |
| 배달 | **DIPICK** (메인 메뉴) | 지시서는 일반 명사 「배달」 사용. 라우트는 `/stores/*` |
| HOME · LOUNGE · FEED · MARKET · CREW · MY | 동일 | — |

임의 변경하지 않았다. 이 문서는 SSOT 명칭(LETARING·DIPICK)을 쓴다.

---

## A. 현재 공유 기능 전체 현황 (코드 확인)

### A-1. 도메인별 표

| # | 도메인 | 화면·위치 | 소스 | 버튼 | 현재 동작 | 링크 생성 | 수신 목적지 | 권한 검사 | 플랫폼 차이 | 판정(코드) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 앱 자체 | MY / 앱 정보 | — | **없음** | — | — | 앱 소개·설치 페이지 **없음** | — | — | **FAIL** (기능 없음) |
| 1b | 앱 초대(연락처) | LETARING 연락처 화면 「초대」 | `components/community-messenger/contacts/MessengerContactsScreen.tsx:167-172,258` | 있음 | `shareCommunityPostViaNative` 재사용(Capacitor→Web Share→복사) | `window.location.origin` (사이트 루트만) | 웹 홈(설치 안내 없음) | — | 앱 판별이 `Capacitor.isNativePlatform()` (#A-2-②) | PARTIAL |
| 2 | HOME | 홈·배너 | — | 없음 | — | — | — | — | — | 공유 필요성 낮음(설계 D 에서 제외 권장) |
| 3 | FEED 상세 | 하단 액션바 + 내 글 더보기 | `components/community/CommunityDetail.tsx:168,485,519,633` · `ui/CommunityActionBar.tsx:59` · `ui/CommunityOwnPostMoreMenu.tsx:74` · 시트 `components/community/share/CommunityShareSheet.tsx` | 있음 | 자체 시트(다른 앱으로 공유 / 링크 복사) | 절대 주소 `resolveCommunityShareSiteOrigin()` + `/community/posts/{id}` + UTM (`lib/community/share/community-share-url.ts:12,35`) | `/community/posts/[postId]` (OG 있음, 접근 화면 있음) | `community-post-access.ts:35-71` (deleted/private/blocked/not_found/login_required) | 앱 판별 문제(#A-2-②) | **PARTIAL** (가장 완성도 높음) |
| 3b | FEED 댓글 | 댓글 메뉴 「링크 복사」 | `components/community/post-detail/CommunityCommentItem.tsx:149-158` | 있음 | 복사만, 실패 무반응 | `window.location.origin+pathname+#comment-{id}` (상세 주소와 다른 기준) | 현재 경로 | — | — | PARTIAL |
| 3c | FEED 목록 카드 | — | — | 없음 | — | — | — | — | — | 해당 없음(추가 비권장) |
| 4 | MARKET 상품 상세 | 상단 아이콘 + 더보기 시트 | `components/post/PostDetailView.tsx:779-794,1243,1623,1629` · `PostDetailMoreBottomSheet.tsx:99,108` | 있음 | `navigator.share` → 복사 (`lib/trade/share-trade-listing.ts:42`) — **Capacitor Share 미사용** | `window.location.origin` + `/post/{id}` | `/post/[id]` — **OG 메타 없음** | `TradePostUnavailable` (숨김·삭제) | Android WebView 는 Web Share 미지원 가능성 → 앱에서는 복사로 떨어짐(NOT_PROVEN) | **FAIL** (미리보기 없음 + 앱 링크 미연결 + 로그인 후 복귀 차단) |
| 5 | DIPICK 매장 상세 | 상단 고정 줄 공유 아이콘 | `components/stores/StoreDetailPublic.tsx:1851-1865, 1867-1885` · `StoreDetailStickyTopRow.tsx:106-120,207` · `store-order-detail/StoreOrderStickyHeader.tsx:168-173` | 있음(같은 동작 **3벌 복사**) | `navigator.share` → `clipboard.writeText` · 둘 다 없으면 **무반응**, 오류 무시 | `window.location.href` (현재 쿼리 그대로) | `/stores/[slug]` (OG 있음, Twitter 없음) | HTML 공개, 화면은 비회원 게이트 `DeliveryViewerGuestGate.tsx:31-56` | 앱에서 복사로 떨어짐(NOT_PROVEN) | **FAIL** |
| 6 | DIPICK 메뉴 상세 | 상단 공유 | `components/stores/StoreProductPublic.tsx:369-384,674` | 있음 | 매장과 같음 | `window.location.href` | `/stores/[slug]/p/[productId]` (OG 있음) | 매장과 같음 | 같음 | PARTIAL |
| 7 | CREW 모임 | 초대 시트(권한자) | `components/moim/MoimInviteSheet.tsx:57-77` · 관리 `components/moim/manage/MoimManageInvite.tsx:34,69,77-79,151` | 권한자만 | 초대 토큰 생성 → `navigator.share` / 복사. 공유 오류 시 **무반응 return** | `window.location.origin` + `/moim/i/{token}` | `/moim/i/[token]` — **비회원이면 `/login` 으로 튕기고 원래 주소 잃음** · OG 없음 | DB 함수 `moim_invite_link_create/revoke/resolve` (만료·철회 있음) | — | **FAIL** (수신 경로) |
| 7b | CREW 공개 소개 | 모임 상세 | — | **없음** | — | — | `/moim/[moimId]` 비회원 차단 | — | — | FAIL(기능 없음) |
| 8 | LETARING 메시지 | 길게 누르기 → 공유 하위 3개 | 정책 `lib/community-messenger/message-actions/message-share-policy.ts` · 처리 `lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts:2746-2815` · UI `MessageLongPressPopover.tsx`, `MessageActionMenu.tsx:131-163` | 있음 | ① 외부 = `navigator.share` 글자만 ② 링크 복사 = 방 주소+`?msg=` ③ **「채팅방으로 공유」 = 실제 전송 아님, 클립보드에 텍스트+JSON 넣고 채팅 목록으로 이동** | `window.location.origin` + `/community-messenger/rooms/{id}?msg={msgId}` | 방 멤버만 열림(외부인에게 쓸모 없는 링크) | 거래방은 ①② 숨김, ③은 허용 | — | **FAIL** |
| 9 | LETARING 그룹방 초대 | 방 시트 「초대 링크 복사」 | `CommunityMessengerRoomPhase2RoomSheets.tsx:378-388` · controller `:2506-2515` · 서버 `lib/community-messenger/group/group-room-invite-link-service.ts:70` | 있음 | 복사만(공유 시트 없음) | 서버에서 `getSiteOrigin() \|\| "https://dibay.app"` + `/group/{token}` | `/group/[token]` — **비회원 `/login` 튕김, OG 없음, 전부 클라이언트 렌더** | DB 함수(만료·횟수·승인·철회 칼럼 있음, 앱은 기본 링크만 사용) | — | **FAIL** (수신 경로) |
| 10 | 공개 프로필 | `/u/[username]` | — | **없음** (`member_profile_share` 키만 존재·미사용) | — | — | 비회원 차단 · OG 없음 | 숨김 프로필 `notFound()` | — | 결정 필요(G-6) |
| 11 | 친구 QR | LETARING QR 탭 | `lib/community-messenger/friend-qr/friend-qr-client.ts:44` · `MyFriendQrPanel.tsx:117-121,238` | 있음 | 앱 = Capacitor Share(**올바른 앱 판별** `isCapacitorNativePlatform`), 웹 = Web Share(+QR 이미지) → 복사 | 절대 `DIBAY_PRODUCTION_SITE_ORIGIN` + `/f/{token}` | `/f/[token]` — **유일하게 App Links·Universal Links 연결된 경로** | 토큰 | — | PASS(코드) / 실기 NOT_PROVEN |
| 12 | 광고·배너 | — | — | 없음 (`ui_product_share_aria` 미사용 키) | — | — | — | — | — | 결정 필요(G-8) |
| 13 | 영수증·채팅 이미지 | 내정보 주문 영수증, 채팅 사진 저장 | `components/mypage/StoreOrderReceiptSheet.tsx:67-95` · `lib/chats/save-chat-image.ts:96-106` | 있음 | 이미지 파일 공유/다운로드 | 링크 없음 | — | 본인 데이터 | — | 범위 밖(개인 문서, 공개 공유 대상 아님) |

### A-2. 공통 기반 현황

| 항목 | 상태 (코드 확인) |
|---|---|
| ① 공통 공유 서비스 | **없음.** 「공유 또는 복사」가 FEED·MARKET·매장(3벌)·CREW(2벌)·메신저·QR 에 **각자 구현**. `lib/trade/share-trade-listing.ts` 는 주석으로 「community/store 공유 모듈 import 금지」를 명시해 의도적으로 분리됨 |
| ② 앱(네이티브) 판별 | `community-share-native.ts:10` = `Capacitor.isNativePlatform()` / `friend-qr-client.ts:26-31` = `isCapacitorNativePlatform()` (주석: 원격 `server.url` WebView 에서 전자가 web 을 돌려줄 때가 있음, PR #154). → FEED 공유가 앱에서 OS 시트를 건너뛸 수 있음 (NOT_PROVEN) |
| ③ 주소 기준(origin) | 5가지 혼재: `resolveCommunityShareSiteOrigin()`(+UTM) · `window.location.origin` · `window.location.href` · 서버 `getSiteOrigin() \|\| "https://dibay.app"` · 상수 `DIBAY_PRODUCTION_SITE_ORIGIN="https://samarket.vercel.app"`. `dibay.app` 은 다른 곳 어디에도 쓰이지 않는 도메인 |
| ④ VERCEL_URL 우선 | `community-share-url.ts:16-17`, `lib/env/runtime.ts:95-96` — `NEXT_PUBLIC_SITE_URL` 이 없으면 **배포별 임시 주소**(`*-hash.vercel.app`)가 production 상수보다 먼저 쓰임. 운영 env 값 확인 안 함 → NOT_PROVEN |
| ⑤ 카카오 공유 | `lib/community/share/community-share-kakao.ts` (SDK 2.7.4, `Kakao.Share.sendDefault`) 완성돼 있으나 **화면 호출 0**. 테스트 `lib/community/__tests__/social-interaction-cta-contracts.test.ts:31-37` 이 시트에 카카오·DIBAY 친구 항목이 **없어야** 한다고 고정 |
| ⑥ DIBAY 친구에게 보내기 | 서버 완성: `app/api/community/posts/[postId]/share/internal/route.ts` (접근·차단 양방향·분당 30회 제한) + `sendCommunityPostShareMessage` (`lib/community-messenger/service.ts:18324`) + 메시지 타입 `community_post_share` + 카드 `CommunityPostShareMessageCard.tsx`. **선택 화면 `CommunityShareTargetPicker.tsx` 는 어디에도 연결 안 됨**(위 테스트로 막힘) |
| ⑦ 공유 시트 UI | FEED 시트만 `DibayBottomSheet`(오버레이 SSOT) 사용. MARKET = 더보기 시트 행, CREW = `DibayUsableAreaSheet`, 매장·메신저 = 시트 없음. `app/community-share-sheet.css` 는 `globals.css:28` 에서 import 되지만 클래스 사용처 0(죽은 CSS, 그 안의 「하단 탭 위」 위치 규칙은 Owner 2026-11-01 폐지 규칙) |
| ⑧ 클립보드 | `@capacitor/clipboard` 미설치. `copyTextToClipboard`(execCommand 대체 포함)는 FEED 에만, 나머지는 `navigator.clipboard` 직접 |
| ⑨ 네이티브 공유 플러그인 | `@capacitor/share ^8.0.1` 설치·등록(Android `capacitor.plugins.json:16`, iOS `capacitor.config.json:29`). 앱이 「공유 받는 대상」(ACTION_SEND·Share Extension)으로 등록돼 있지 않음 — 범위 밖, 필요 시 별도 결정 |
| ⑩ 공유 분석 로그 | FEED 만 `community-share-analytics.ts` |

### A-3. 링크 수신 기반 현황

| 항목 | 상태 (코드 확인) |
|---|---|
| Android App Links | `AndroidManifest.xml:113-118` https `samarket.vercel.app` **`/f/` 만** autoVerify. `assetlinks.json` 은 `handle_all_urls` 로 경로 제한 없음(앱 쪽 필터가 제한) |
| iOS Universal Links | `App.entitlements:5-8` `applinks:samarket.vercel.app` · `public/.well-known/apple-app-site-association` **`/f/*` 만** |
| 커스텀 스킴 | `dibay://auth|chat|trade/chat|orders|community/post|call|friend` (Android 62-110, iOS `CFBundleURLTypes`). `dibay://call-v4` 는 JS·네이티브 매퍼에 있으나 intent-filter 없음(통화 영역 — 보고만) |
| JS 수신 처리 | `PushRouteListener.tsx:636-652` = `dibay://` 만, `getLaunchUrl` 미사용 · `FriendQrAppLinkListener.tsx:25-47` = https `/f/` 만 · Android 네이티브 `mapHttpsDeepLinkToAppPath`(MainActivity 2820-2834)는 모든 https 경로를 허용목록(`DibayAppRouteGuard.java:21-29`)으로 통과 |
| 네이티브↔JS 매핑 불일치 | `dibay://community/post/<id>` → Android `/philife/posts/<id>` (**없는 경로**, `MainActivity.java:3598`) vs JS `/community/posts/<id>` |
| 비회원 리다이렉트 | `proxy.ts:101-113` — `/mypage/*` 외 모든 차단 경로는 `/login?reason=…` 로 보내며 **`next` 없음** → 원래 주소 소실 |
| 비회원 공개 경로 | `lib/auth/guest-browse-access-policy.ts:29-120` — 공개: `/community/*` `/philife/*` `/post/*` `/products/*` `/market/*` `/stores/*`(화면은 클라 게이트) `/f/*`. **비공개: `/moim/*` `/group/*` `/u/*` `/shop/*`** |
| 로그인 후 복귀 | `sanitizeFreshLoginLandingPath` 거부 목록(`lib/auth/auth-route-classification.ts:8-19`)에 **`/post/` `/products/`** 포함 → MARKET 상품 링크는 로그인 후 상세로 못 돌아감(기본 `/mypage`) |
| 시작·복원 | `lifecycle-route-effects.client.ts:35-78` 마지막 화면 복원은 `hasLaunchIntent()` 일 때 건너뜀. 단 iOS 실행 중 `/f` 외 https 링크는 아무도 라우팅하지 않음 |
| OG 메타 | 있음: `/community/posts/[id]`(OG+Twitter), `/stores/[slug]`(OG), `/stores/[slug]/p/[id]`(OG). **없음: `/post/[id]`(MARKET), `/philife/[id]`, `/moim/*`, `/group/[token]`, `/u/[username]`, 루트 기본 OG, `metadataBase`** |
| robots·sitemap·기본 OG 이미지 | `app/robots.ts` `sitemap.ts` `opengraph-image.*` 모두 없음 |
| 앱 소개·설치 페이지 | 없음 |

---

## B. 레거시 비교표

증거 수준: **공개 문서** = 공식 개발자 문서 확인 · **일반 지식** = 실제 앱을 이번에 조작해 보지 않음 → 화면 위치·문구는 **NOT_PROVEN**. 레거시 UI 를 복제하지 않고 원칙만 가져온다.

| 항목 | 카카오톡 | 텔레그램 | WhatsApp | 당근 | 배민·쿠팡이츠·요기요 | OS·웹 | **DIBAY 현재** |
|---|---|---|---|---|---|---|---|
| 공유 버튼 위치 | 콘텐츠 상단·하단 아이콘 | 메시지 길게 누르기 「전달」, 링크 헤더 공유 | 메시지 길게 누르기 「전달」 | 상품 상세 상단 아이콘 (일반 지식) | 매장 상세 상단 아이콘 (일반 지식) | — | 도메인마다 다름(액션바/상단/더보기/시트) |
| 아이콘/글자/더보기 | 아이콘 | 아이콘+메뉴 글자 | 메뉴 글자 | 아이콘 | 아이콘 | — | 혼재 |
| 누르면 | 자체 친구·채팅 선택 | 자체 대화 선택(여러 개) | 자체 대화 선택(최대 5개 — 일반 지식) | 자체 시트(카카오·복사·더보기) 또는 OS 시트 (NOT_PROVEN) | OS 시트 또는 자체 시트 (NOT_PROVEN) | Android Sharesheet / iOS UIActivityViewController / Web Share API | FEED 만 자체 시트, 나머지 OS 또는 복사 |
| 대상 앱 선택 | 카카오톡 내부 | 내부 | 내부 | OS 시트 위임 | OS 시트 위임 | OS 가 결정(앱이 목록 통제 불가) | OS 위임 |
| 미리보기 | 자체 스크랩 봇이 OG 읽음(`kakaotalk-scrap` UA), 메타·썸네일 캐시 별도, 디버거로 메타만 초기화 — **공개 문서** | OG | OG, 이미지 600KB 미만·폭 300px 이상 권장 — **공개 문서** | 상품 사진·가격·지역 (일반 지식) | 매장 사진·이름 (일반 지식) | — | FEED·매장만 OG, MARKET 없음 |
| 수신 목적지 | 콘텐츠 상세 | 해당 메시지/채널 | 해당 대화 | 상품 상세(앱 있으면 앱) (일반 지식) | 매장 상세 (일반 지식) | App Links / Universal Links | 앱은 `/f/` 만 연결, 나머지 브라우저로 열림 |
| 미설치·비로그인·삭제 | 웹 미리보기·설치 안내 | 웹 미리보기(t.me) | — | 웹 상세 + 앱 열기 띠 (일반 지식) | — | — | 비로그인 시 CREW·그룹·프로필은 로그인으로 튕기고 주소 잃음 |
| 전달 출처 표시 | 표시 없음(일반 지식) | 「Forwarded from」 표시 + 숨김 설정 | 「전달됨」 표시 | — | — | — | 전달 기능 없음 |
| 실패·취소 | — | — | — | — | — | Web Share 취소 = AbortError | FEED 만 취소 구분, 나머지 무시·무반응 |

**DIBAY 에 가져올 원칙:** ① 콘텐츠 공유 = 「자체 시트(내부 친구 + 외부)」 1개, 외부 앱 목록은 OS 에 위임 ② 메시지 = 「전달하기」(내부 실제 전송, 여러 방) 와 「공유하기」(외부) 분리 ③ 미리보기 = 서버 OG 하나로 카카오·WhatsApp·Telegram·Facebook 공통 ④ 수신 = 같은 https 주소가 앱 있으면 앱, 없으면 웹 상세.

출처(공개 문서): [카카오 Developers 도구(URL 메타정보 관리)](https://developers.kakao.com/docs/tool/common) · [카카오 스크랩 점검 목록](https://devtalk.kakao.com/t/scrap-url/116202) · [OG 캐시 초기화](https://devtalk.kakao.com/t/og-open-graph/149379) · [WhatsApp link previews (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)

---

## C. 결함 목록

판정은 모두 **코드 근거**. 실기 재현은 하지 않음 → 「재현 조건」은 코드상 조건이며 실기 결과는 NOT_PROVEN.

### P0 — 보안·개인정보·잘못된 콘텐츠 접근

| ID | 결함 | 재현 조건 | 근본 원인 | 관련 파일 | 영향 | 수정 방향 |
|---|---|---|---|---|---|---|
| **SH-P0-1** | 「채팅방으로 공유」가 **원본 방 이름·방 ID·메시지 ID** 를 클립보드에 넣음 → 붙여넣으면 다른 방(또는 외부 앱)에 그대로 노출 | 그룹/1:1 방 메시지 길게 누르기 → 공유 → 채팅방으로 공유 → 다른 곳에 붙여넣기 | `buildCommunityMessengerInternalShareClipboard` 가 `방: {roomTitle}` + JSON `{sourceRoomId, messageId…}` 를 사람이 읽는 글로 생성, 파서(`parseInternalShareCardFromClipboard`)는 테스트 외 사용 0 | `lib/community-messenger/message-actions/message-internal-share-card.ts:26-53` · controller `:2792-2815` | 비공개 방 제목(예: 가족방·거래 상대 이름) 유출, 거래방에서도 허용(`canShareMessageToRoom` 은 거래방 차단 없음) | 클립보드 방식 폐기 → 서버 전달 API(설계 D-5)로 교체. 교체 전까지 이 메뉴 숨김은 **별도 승인 항목**(지금은 수정 안 함) |
| **SH-P0-2** | 메시지 「링크 복사」가 외부에서 쓸 수 있는 듯한 방 주소(`/community-messenger/rooms/{id}?msg=`)를 만듦 | 메시지 → 공유 → 링크 복사 | 멤버만 열 수 있는 비공개 방 주소를 공유 대상으로 취급 | controller `:2773-2790` | 방 ID 노출(열거 표면), 받는 사람은 열 수 없음 | 메시지 링크 복사 제거 (권장 G-4) |

### P1 — 공유 불능·목적지 오류

| ID | 결함 | 재현 조건 | 근본 원인 | 관련 파일 | 영향 | 수정 방향 |
|---|---|---|---|---|---|---|
| SH-P1-1 | 공유 링크를 눌러도 **앱이 열리지 않음**(QR 친구 `/f/` 제외) | 앱 설치 상태에서 카톡으로 받은 `/post/…` `/community/posts/…` `/stores/…` `/moim/i/…` `/group/…` 누름 | AASA·Android intent-filter 가 `/f/` 만 선언 | `public/.well-known/apple-app-site-association` · `AndroidManifest.xml:113-118` · `App.entitlements` | 모든 콘텐츠 공유가 브라우저로 열림(로그인 상태 없음) | 경로 확장 + JS 수신기 일반화(D-4). **네이티브 빌드 필요** |
| SH-P1-2 | iOS 실행 중 https 링크 수신 시 라우팅 주체 없음 | 위 경로를 Universal Links 로 열었을 때(확장 후) | `appUrlOpen` 처리기가 `dibay://` 와 `/f/` 만 처리 | `components/push/PushRouteListener.tsx:636-652` · `FriendQrAppLinkListener.tsx` | P1-1 수정 시 같이 막힘 | 공통 링크 수신기(D-4) |
| SH-P1-3 | 비회원이 CREW 초대·그룹 초대·프로필 링크를 열면 **로그인 후 원래 화면으로 못 돌아감** | 비로그인 브라우저/앱에서 `/moim/i/{token}` `/group/{token}` `/u/{name}` | `respondGuestBlocked` 가 `next` 를 버림 | `proxy.ts:101-113` | 초대 수락 흐름 끊김 | `next` 보존(안전 경로 검사 그대로) — **인증 영역, 별도 승인** |
| SH-P1-4 | MARKET 상품 링크 → 로그인 → 상세 대신 `/mypage` | 비회원이 상품 링크에서 「채팅하기」 등으로 로그인 | `FRESH_LOGIN_DENIED_PREFIXES` 에 `/post/` `/products/` | `lib/auth/auth-route-classification.ts:8-19` | 구매 문의 이탈 | 거부 사유 확인 후 상세만 허용 검토 — **인증 영역, 별도 승인** (거부 목록에 넣은 이유 기록 미확인 → NOT_PROVEN) |
| SH-P1-5 | `dibay://community/post/<id>` 가 Android 에서 없는 경로로 이동 | 네이티브 매퍼 경유 | Android 매핑 `/philife/posts/` vs JS `/community/posts/` | `MainActivity.java:3598` · `lib/platform/deep-link-routes.ts:62-65` | 404 | 매핑 통일(네이티브 빌드) |
| SH-P1-6 | 앱에서 MARKET·매장·CREW·메시지 공유가 OS 시트 대신 **복사로 떨어지거나 무반응** 가능 | Android 앱 WebView | `navigator.share` 만 사용, Capacitor Share 미사용 (Android WebView 는 Web Share 미지원 — 플랫폼 일반 지식, 실기 NOT_PROVEN) | `share-trade-listing.ts` · `StoreDetailPublic.tsx:1851` · `MoimInviteSheet.tsx:68` · controller `:2746` | 공유 실패 체감 | 공통 Platform Adapter(D-3) |
| SH-P1-7 | FEED 공유가 앱에서 OS 시트를 건너뛸 수 있음 | 원격 `server.url` WebView | `Capacitor.isNativePlatform()` 오판(PR #154 주석) | `community-share-native.ts:10` | 앱에서 Web Share/복사로 떨어짐 | `isCapacitorNativePlatform()` 로 통일 |
| SH-P1-8 | 「채팅방으로 공유」가 실제로 아무 것도 보내지 않음 | 메시지 → 채팅방으로 공유 | 서버 전달 API·선택 화면 없음 | controller `:2792-2815` | 기능명과 동작 불일치 | 전달 기능(D-5) |
| SH-P1-9 | 그룹 초대 링크 도메인이 다를 수 있음 | 서버 `getSiteOrigin()` 이 null 일 때 | 대체값 `https://dibay.app` (다른 곳 미사용 도메인) | `group-room-invite-link-service.ts:70` | 링크가 존재하지 않는 도메인일 수 있음(운영 env 미확인 → NOT_PROVEN) | 공통 URL Resolver 하나로 |
| SH-P1-10 | 매장 공유 링크에 현재 쿼리 그대로 포함 | 매장 상세에서 탭·필터 쿼리 붙은 상태로 공유 | `window.location.href` | `StoreDetailPublic.tsx:1852` 외 2곳 | 받는 사람에게 상태 쿼리 전달(민감값 포함 여부 미확인) | 정규 주소 생성 |
| SH-P1-11 | 공유 origin 이 배포별 임시 주소가 될 수 있음 | `NEXT_PUBLIC_SITE_URL` 미설정 운영 | `VERCEL_URL` 을 production 상수보다 먼저 사용 | `community-share-url.ts:16-17` · `runtime.ts:95-96` | OG `url`·canonical 이 배포마다 달라짐 → 카카오 캐시 분산·보호된 배포 주소 | 운영 env 확인 후(Owner 승인 필요 영역) 순서 정정 |

### P2 — UI/UX/CTA 불일치

| ID | 결함 | 관련 | 수정 방향 |
|---|---|---|---|
| SH-P2-1 | MARKET `/post/[id]` 에 OG 메타 없음 → 카톡 등에서 앱 기본 제목만 표시 | `app/(main)/post/[id]/page.tsx` | Preview Metadata(D-6) |
| SH-P2-2 | CREW·그룹 초대·프로필·`/philife/[id]` OG 없음, 루트 `metadataBase`·기본 OG 없음 | `app/layout.tsx:41-73` 외 | D-6 |
| SH-P2-3 | 같은 동작 이름 혼재: 공유/공유하기, 채팅방으로 공유(=복사), 초대 링크 복사 vs 초대 링크 공유 | i18n 키 목록 A-2 | CTA SSOT 6개(시안 5절) |
| SH-P2-4 | 공유 진입 UI 4종(자체 시트/더보기 행/사용 영역 시트/바로 실행) | A-1 | 공통 시트 1개 |
| SH-P2-5 | 실패 피드백 제각각(무반응·무시·알림창·토스트) | 매장·CREW·댓글 | 공통 결과 처리(복사됨 토스트 / 실패 토스트 / 취소 무반응) |
| SH-P2-6 | MARKET 상세 공유가 상단과 더보기 2곳, 구매자 주 CTA 일 때 더보기에서 숨김 | `PostDetailView.tsx:1254` | 1곳으로 |
| SH-P2-7 | 그룹 초대는 복사만(공유 시트 없음) | RoomSheets `:378-388` | 「초대하기」 시트 |
| SH-P2-8 | 그룹 초대 랜딩 「멤버」 라벨만 있고 수 미표시(보고만) | `app/(main)/group/[token]/page.tsx:204` | 범위 밖 — 보고만 |

### P3 — 편의·정리

| ID | 내용 |
|---|---|
| SH-P3-1 | 앱 소개·설치 페이지 없음(앱 공유의 착지점 없음) |
| SH-P3-2 | 죽은 코드: `community-share-kakao.ts`, `CommunityShareTargetPicker.tsx`(D 에서 재사용 예정), `app/community-share-sheet.css`, `CallStubActionPopover.tsx`(통화 — 손대지 않음), 미사용 키 `member_profile_share` `ui_product_share_aria` `cm_ui_invite_link_share_hint` |
| SH-P3-3 | robots.ts·sitemap 없음 (공유와 간접) |
| SH-P3-4 | 댓글 링크 복사 실패 무반응, 기준 주소 상세와 다름 |
| SH-P3-5 | 공유 분석은 FEED 만 |

---

## D. 통합 구조 설계

### D-0. 재사용 판단 (신규 구축 최소화)

| 기존 | 판단 |
|---|---|
| `lib/community/share/*` (URL·복사·네이티브·카카오·payload·분석·접근·메타) | **승격 재사용** → `lib/share/` 공통 계층의 출발점. FEED 전용 이름만 일반화 |
| `friend-qr-client.ts` 의 앱 판별·파일 공유 | Platform Adapter 로 흡수 |
| `share/internal` API + `sendCommunityPostShareMessage` + `community_post_share` 타입 + 카드 | Internal Forward Adapter 의 FEED 구현으로 재사용, 다른 도메인은 **같은 메시지 타입을 일반화**(아래 D-5) |
| `CommunityShareTargetPicker` · `MessengerFriendPickerScreen` · `CommunityMessengerGroupMemberPicker` | 선택 화면 1개로 통합(방+친구, 여러 개 선택) — 새 피커 만들지 않음 |
| `DibayBottomSheet` + 오버레이 클래스 | 공통 시트 그대로 사용 |
| 그룹·CREW 초대 토큰 DB(만료·철회 칼럼·함수 있음) | 그대로. 공유 링크용 **새 DB 레코드 만들지 않음** |
| `guest-browse-access-policy` · `safe-next-path` · `DibayAppRouteGuard` | 그대로 쓰되, 경로 추가·`next` 보존은 인증 영역 별도 승인 |

### D-1. 계층

```
도메인 어댑터 (콘텐츠 ID·공개 정책·표시 정보만 제공)
  app · feed · market · store(+menu) · crew(공개 소개/초대 분리) · profile(G-6) · messenger(전달)
        │ ShareTarget { kind, id, title, subtitle, imageUrl, visibility }
        ▼
공통 계층 lib/share/
  ShareTargetRegistry   kind → { canonicalPath(id), ogLoader, permission, cardRenderer, ctaKeys }
  ShareUrlResolver      절대 주소 = SITE_ORIGIN(단일) + canonicalPath  (window.location 금지, UTM 은 결정 G-9)
  SharePermissionPolicy 공유 가능? (공개/회원전용/비공개/삭제/숨김/판매완료/폐점/만료) — 서버·클라 같은 함수
  SharePayloadBuilder   OS 시트 {title,text,url} · 카카오 feed · 메신저 카드 metadata
  SharePreviewMetadata  generateMetadata 공용 빌더 (공개 필드만)
  PlatformShareAdapter  app=Capacitor Share(isCapacitorNativePlatform) / web=navigator.share / fallback=copy
                        결과 shared|cancelled|copied|failed 공통
  InternalForwardAdapter  선택한 방/친구 → 서버 API → 카드 메시지
  ShareSheet (UI)       시안 1절 — 4칸 고정 순서, 못 쓰는 칸은 제거
  ShareCta SSOT         i18n 키 6개 (시안 5절)
        ▼
수신 계층 (기존 시스템 사용, 변경은 별도 승인)
  App Links/Universal Links 경로 확장 → 공통 https 링크 수신기 → DibayAppRouteGuard 허용목록
  proxy next 보존 → login next → 상세
```

### D-2. 링크 규칙 (기존 라우트만 사용 — 새 URL 만들지 않음)

| 대상 | 정규 주소 (기존) | 비고 |
|---|---|---|
| 앱 | `/` 또는 신설 앱 소개 페이지 (G-1) | 신설은 Owner 결정 |
| FEED | `/community/posts/{id}` | 이미 OG·접근 화면 있음. 앱 내부 주 경로 `/philife/{id}` 와 다름 — 둘 다 App Links 대상에 포함 |
| MARKET | `/post/{id}` | `/products/{id}` 는 영구 리다이렉트로 유지 |
| 매장 | `/stores/{slug}` (쿼리 제거) | |
| 메뉴 | `/stores/{slug}/p/{productId}` | |
| CREW 공개 소개 | `/moim/{moimId}` | 비회원 공개 여부 G-7 |
| CREW 초대 | `/moim/i/{token}` | 토큰 = 가입 권한. 만료·철회 기존 DB |
| 그룹 초대 | `/group/{token}` | 같음 |
| 프로필 | `/u/{username}` | G-6 |
| 메시지 | **외부 링크 없음** | 전달만 |

### D-3. 공유 실행 흐름

```
[공유하기] → ShareSheet(target)
  ├ 친구에게 보내기 → 선택 화면(방+친구, ≤5) → POST /api/share/forward {kind,id,targets[]}
  │                    서버: SharePermissionPolicy 재검사 → 대상별 차단·참여 검사 → 카드 메시지 insert
  ├ 카카오톡(G-2)   → Kakao.Share.sendDefault(feed) — 실패 시 링크 복사 + 토스트
  ├ 다른 앱으로 공유 → PlatformShareAdapter → 취소=무반응, 실패=복사+토스트
  └ 링크 복사       → copy → 「링크를 복사했어요」
중복 누름: busy 동안 버튼 잠금(FEED 훅 방식 재사용)
```

### D-4. 수신 흐름 (상태별)

| 수신자 상태 | 동작 |
|---|---|
| 앱 설치+로그인 | OS 가 앱 실행 → 공통 https 수신기 → 허용목록 → `router.push(path)`. 복원(`lifecycle-route-effects`)은 `hasLaunchIntent` 로 이미 건너뜀 — https 수신 시 같은 표식 사용. **※ H-2·H-4 로 보완** |
| 앱 설치+비로그인 | 공개 콘텐츠 = 바로 상세 / 회원전용 = 로그인 → `next` 로 복귀 (P1-3·P1-4 해결 필요) |
| 앱 미설치 | 같은 주소가 웹 상세 → Android = 「앱에서 열기」 띠 / iOS = Safari 기본 앱 배너. **※ 첫 판의 「앱 있으면 같은 주소로 앱」은 iOS 에서 성립하지 않음 — H-2 로 정정** |
| 웹 브라우저 | 공개 상세(SSR + OG) |
| 삭제 | 「삭제되었거나 볼 수 없는 글이에요」 + 해당 서비스 목록 (FEED `CommunityPostAccessScreen`·MARKET `TradePostUnavailable` 패턴 통일) |
| 숨김·제재 | 삭제와 **같은 화면**(이유 비공개 — ID 존재 여부 노출 최소화) |
| 비공개 | 로그인 / 권한 없음 화면 |
| 만료·철회 초대 | 「초대 링크가 만료되었어요」 |
| 네트워크 오류 | 다시 시도 버튼, 주소 유지 |

### D-5. 메신저 전달 (InternalForwardAdapter)

- 새 서버 API 1개: 원본 `messageId` + 대상 방 목록(≤5). 서버가 **보낸 사람이 원본 방 멤버인지**·원본 메시지가 삭제·만료되지 않았는지·대상 방 전송 권한·차단을 검사하고 **복사본 메시지**를 만든다(원본 방 ID·방 이름은 저장·표시하지 않음).
- 유형별: 텍스트·사진·파일·음성·스티커 = 지원(사진·파일은 같은 저장소 객체 재참조 가능 여부 확인 필요 — NOT_PROVEN, 저장소 ACL 이 방 단위면 복사 필요) · `community_post_share` 카드 = 지원 · `system`·`call_stub`·`gift_certificate` = **불가**(통화·상품권 계약 보호).
- 거래방(`trade`) 메시지 전달: 기본 불가 권장(G-4) — 지금 정책이 외부 공유를 막는 것과 일관.
- DB: 전달 표시 칼럼 1개(예: `forwarded` boolean) 필요 여부 = G-4 결정에 따름. 원작성자 ID 저장 안 함 권장.
- **통화·푸시 영향:** 전달 메시지는 기존 `notifyCommunityMessengerMessageRecipients` 경로를 그대로 탄다(새 알림 종류 없음). `call*`·CallKit·VoIP·FCM·APNs 코드 변경 0. 다만 여러 방 동시 전달은 알림 발송이 방 수만큼 늘어남 → 분당 제한(기존 30회와 같은 수준) 필요.
- 콘텐츠 카드 일반화: `community_post_share` 를 `content_share`(kind=feed|market|store|menu|crew)로 넓히려면 **DB 체크 제약 마이그레이션** 필요(G-10). 대안 = 기존 타입명 유지 + metadata.kind 확장(제약 변경 없음, 이름만 어색).

### D-6. 미리보기 메타데이터

- `SharePreviewMetadata` 공용 빌더를 `/post/[id]`, `/philife/[id]`, `/moim/[moimId]`, `/moim/i/[token]`, `/group/[token]`, `/u/[username]`(G-6)에 적용, 루트 `metadataBase` + 기본 OG(앱 대표 이미지) 추가.
- 서버 로더는 **쿠키 없이 공개 필드만**(제목·대표 사진·가격·지역 동 단위·업종). 금지: 전화번호·정확 주소·주문·메시지·초대 대상 그룹 멤버 목록. 비공개/삭제/숨김 = `{title:"DIBAY", robots:{index:false}}`(FEED 방식).
- 초대 링크 OG = 모임/그룹 **이름과 대표 사진만**(G-7: 비공개 그룹 이름 노출 여부).
- 크롤러 접근: `proxy.ts` 가 `/moim` `/group` `/u` 를 비회원 차단 → 크롤러도 로그인으로 리다이렉트되어 미리보기 불가. 경로 공개 범위 결정 필요(G-7).
- 이미지: 절대 https, 600KB 미만 권장(WhatsApp), 카카오는 og:image 주소 바꿔야 썸네일 갱신 → 이미지 URL 에 버전 쿼리.
- `og:url` 과 이미지 도메인 일치(카카오 재스크랩 규칙) → 단일 SITE_ORIGIN 필요(P1-11).

### D-7. 보안·운영 정책

| 항목 | 정책 |
|---|---|
| 공개 구분 | ShareTargetRegistry 에 visibility(public/member/private) 고정, private 은 공유 버튼 자체를 숨김 |
| 링크=권한? | 콘텐츠 링크는 **권한을 주지 않음**(열 때마다 서버 검사). 예외 = 이미 승인된 초대 토큰(CREW·그룹)만. 새 「권한 부여 링크」 없음 |
| 차단 사용자 | 전달·친구에게 보내기 시 양방향 차단 검사(FEED API 방식), 열람은 기존 상세 정책 |
| 판매완료·중지 | MARKET 상세 그대로 열림 + 상태 배지(기존 화면) |
| 폐점·비활성 매장 | 기존 `store_not_found` 화면 |
| 만료 모임·초대 | 만료 화면 |
| ID 열거 | 숨김·삭제·없음 = 같은 화면·같은 응답(존재 여부 비노출). UUID·토큰 128bit 유지 |
| 크롤러 | 비공개 OG 금지, `robots noindex` |
| 링크 만료·철회 | 콘텐츠 링크 = 없음(삭제가 곧 철회). 초대 링크 = 기존 DB 함수(앱 UI 노출은 G-11) |
| 로그 | 공유 이벤트 = kind·채널·결과만, 대상 연락처·받는 사람 저장 안 함 |
| 스팸 | 전달·친구에게 보내기 분당 제한, 외부 공유는 제한 없음(클라이언트 동작) |
| 클립보드 내용 | 사람용 텍스트에 방 이름·내부 ID 금지(SH-P0-1) |

---

## E. 화면별 UI/UX 시안

`docs/design/dibay-unified-share-mockup-2026-11-14.html` (휴대폰 360×740 / 태블릿 가로 1024×640)

1. 공통 공유 시트 — MARKET 상품(휴대폰), FEED(카카오 제외 3칸 + 복사 토스트), DIPICK 매장(태블릿 가로, 시트 최대 32rem)
2. 공유 버튼 위치표 — 화면별 현재 vs 제안
3. 메시지 길게 누르기(답장·복사·**전달하기**·공유하기·삭제) → 전달 대상 선택(최근 채팅+친구, 여러 개) → 받은 쪽 콘텐츠 카드·삭제 카드·「전달됨」
4. 링크 수신 화면 — 삭제·숨김 / 로그인 필요(복귀) / 만료 초대 / 모바일 웹 「앱에서 열기」 띠
5. CTA 표준 6개와 현재 갈라진 키 대조

앱 전체 공유(MY 「DIBAY 공유하기」 행) · CREW 상세 「공유하기」/「초대하기」 분리는 위치표(2절)로 제시, 시트는 1번과 동일 부품.

시안 계측(브라우저, 2026-11-14): 주 버튼 배경 `rgb(11,66,26)`·글자 흰색·높이 48px·Pretendard 15px — 앱 오버레이 토큰과 같음. Windows 데스크톱 실화면은 NOT_PROVEN.

---

## F. 단계별 구현 계획 (승인 시)

| 단계 | 내용 | 영향 파일 | DB | 네이티브 빌드 | 회귀 위험 | 검증 | 롤백 |
|---|---|---|---|---|---|---|---|
| **S1 공통 기반** | `lib/share/` (Resolver·Policy·Payload·PlatformAdapter·결과 처리) — `lib/community/share/*` 승격, 앱 판별 통일, 단일 SITE_ORIGIN | `lib/share/**`, `lib/community/share/*`, `lib/env/runtime.ts`(origin 순서는 env 확인 후) | 없음 | 없음 | FEED 공유 동작 변화 | vitest(Resolver·Policy·Adapter 결과 4종), typecheck | PR revert |
| **S2 공통 시트·CTA** | ShareSheet + CTA 키 6개, 기존 FEED 시트 교체, 죽은 `community-share-sheet.css` 제거, 계약 테스트 갱신(카카오·친구 항목 허용은 G-2/G-3 결정 후) | `components/share/**`, `components/community/share/*`, `lib/i18n/catalog/*` | 없음 | 없음 | FEED 시트 모양 | i18n 품질 검사, 오버레이 SSOT 테스트 | revert |
| **S3 도메인 적용** | MARKET·매장(3벌→1)·메뉴·CREW·그룹 초대·MY 앱 공유를 공통 시트로 | `PostDetailView.tsx`, `StoreDetailPublic.tsx`, `StoreDetailStickyTopRow.tsx`, `StoreOrderStickyHeader.tsx`, `StoreProductPublic.tsx`, `MoimInviteSheet.tsx`, `MoimManageInvite.tsx`, RoomSheets, MY 메뉴 | 없음 | 없음 | 상세 머리글 배치 | 각 화면 웹 미리보기 + 실기(승인 후) | 도메인별 revert |
| **S4 미리보기 메타** | SharePreviewMetadata + 6개 라우트 + `metadataBase`·기본 OG | `app/(main)/post/[id]/page.tsx` 외, `app/layout.tsx` | 없음(읽기 로더) | 없음 | 상세 SSR 시간(로더 1회 추가 — 캐시 로더 사용) | 크롤러 UA 로 HTML 확인, 카카오 메타정보 조회 | revert |
| **S5 수신 경로** ※인증·네이티브 | (a) proxy `next` 보존 (b) 로그인 복귀 거부 목록 재검토 (c) 비회원 공개 경로 G-7 (d) AASA·intent-filter 경로 확장 + 공통 https 수신기 + Android 매핑 정정 | `proxy.ts`, `auth-route-classification.ts`, `guest-browse-access-policy.ts`, `.well-known/*`, `AndroidManifest.xml`, `MainActivity.java`, 수신기 | 없음 | **필요(Android·iOS)** | 시작·복원·푸시 라우팅·통화 진입(같은 `PushRouteListener`) | 시작 변경 규칙: iOS·Android 실기 후 배포, 다른 방 잘못 이동 회귀 행렬 | Instant Rollback(웹) / 이전 바이너리 |
| **S6 친구에게 보내기·전달** | 선택 화면 통합, 콘텐츠 카드 일반화, 메시지 전달 API, 「채팅방으로 공유」 클립보드 폐기(SH-P0-1) | `lib/community-messenger/**`, `app/api/**`, 메시지 카드 | **G-4·G-10 에 따라 마이그레이션 가능**(운영 DB 적용 별도 승인) | 없음 | 메신저 전송·알림량 | 메신저 계약 테스트, 실기 2기기 | revert + 마이그레이션 역방향 |
| **S7 통합 검증** | 아래 행렬 | — | — | — | — | 실기(Owner 승인 후) | — |

S5 는 「시작·인증·라우팅」 변경이라 다른 단계와 **분리 PR**. **정정(H-4): S5 의 Android 수신은 통화·푸시와 같은 `handleNotificationLaunchIntent`·대기 경로 슬롯을 지나므로 「통화 변경 규정」 적용 대상이다** — 영향 분석 문서·Owner 승인·단독 반영·통화 실기 행렬이 필요하다. S6 의 알림 경로는 통화 규정 적용 범위(`lib/push/**`)에 닿지 않도록 기존 메시지 알림 함수 호출만 한다.

### 검증 행렬 (전부 미실행 → NOT_PROVEN)

| 항목 | Android APK | iOS 앱 | 모바일 웹 | 데스크톱 웹 | 태블릿 |
|---|---|---|---|---|---|
| 공유 버튼 표시 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| 공유 시트 실행 / 취소 / 실패 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| 링크 복사 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| 카카오·WhatsApp·Telegram 선택 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | — | NOT_PROVEN |
| 앱 설치/미설치 수신 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | — | NOT_PROVEN |
| 로그인/비로그인 수신 + 복귀 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| 앱 종료·백그라운드·실행 중 수신 | NOT_PROVEN | NOT_PROVEN | — | — | NOT_PROVEN |
| 삭제·권한 없음·만료 화면 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| SNS 미리보기(카카오·WhatsApp·Telegram·Facebook) | NOT_PROVEN | | | | |
| 중복 클릭 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| 다른 채팅방으로 잘못 이동(복원 충돌) 회귀 | NOT_PROVEN | NOT_PROVEN | — | — | NOT_PROVEN |

---

## G. Owner 결정 사항

| ID | 결정 | 권장안 | 대안 | 장단점·영향 |
|---|---|---|---|---|
| **G-1** | 앱 공유의 착지점 | 공개 앱 소개 페이지 1개 신설(스토어 링크 2개 + OG) | 홈(`/`) 주소 공유 | 신설 = 새 라우트·문구·OG 이미지 필요 / 홈 = 설치 안내 없음 |
| **G-2** | 카카오톡 버튼 직접 노출 | 노출(카카오 키 설정·도메인 등록 확인 후) — 한국 사용자 비중 | OS 시트에 맡김(현재 계약 테스트 유지) | 직접 = 카드형 미리보기·외부 SDK 로드 / 위임 = 칸 1개 감소, 카카오 설치 시 OS 시트에 이미 보임 |
| **G-3** | WhatsApp·Telegram 별도 버튼 | 두지 않음(OS 시트) | 별도 아이콘 | OS 가 설치 여부를 처리 / 별도 = 미설치 처리·URL 스킴 유지 부담 |
| **G-4** | 메시지 전달 정책 | 전달 지원, 「전달됨」만 표시(원본 방·원작성자 비표시), 거래방 메시지 전달 불가, 메시지 링크 복사 삭제 | 텔레그램식 원작성자 표시 | 원작성자 표시 = 개인정보 노출 / 비표시 = 출처 확인 불가 |
| **G-5** | 동시 전달 수 | 5곳 | 1곳 / 10곳 | 많을수록 스팸·알림량 증가 |
| **G-6** | 공개 프로필 공유 | 지금은 안 함 | 「프로필 공유」 추가(비회원 열람 개방 필요) | 개인 노출 범위 확대 |
| **G-7** | CREW·그룹 초대·모임 소개의 비회원 공개 | 초대 랜딩만 비회원 공개(이름·사진·인원), 가입은 로그인 | 전부 로그인 필요(현재) | 공개 = SNS 미리보기 가능·로그인 후 복귀 필요 / 현재 = 미리보기 불가 |
| **G-8** | 광고·배너 공유 | 공유 대상 아님(목적지 콘텐츠의 공유 버튼을 씀) | 광고별 허용 | 광고 계약·집계 혼선 방지 |
| **G-9** | 공유 링크 UTM | 채널만(`utm_source=dibay_share&utm_medium=<kind>`) 유지 | 제거 | 카카오 캐시가 주소별로 갈림 vs 유입 분석 |
| **G-10** | 콘텐츠 카드 메시지 타입 | 기존 `community_post_share` 유지 + metadata.kind 확장(마이그레이션 없음) | `content_share` 신설(제약 변경 마이그레이션) | 무변경 = 이름 어색 / 신설 = 운영 DB 적용 승인 필요 |
| **G-11** | 그룹 초대 만료·재발급 UI | 이번 범위 밖 | 「링크 새로 만들기」 추가 | DB 함수는 이미 있음 |
| **G-12** | 운영 `NEXT_PUBLIC_SITE_URL` 확인 | Owner 가 Vercel env 값 확인 또는 확인 허락 | — | SH-P1-11·P1-9 판정이 이 값에 달림 |

---

## 남은 위험 · 확인 못 함

- 모든 런타임 동작(앱 WebView 의 Web Share 지원, 실제 SNS 미리보기, 앱 링크 열림, 로그인 복귀)은 **NOT_PROVEN** — 실기·운영 확인은 Owner 승인 후.
- `/post/` 를 로그인 복귀 거부 목록에 넣은 원래 이유를 문서에서 찾지 못함 → S5 착수 전 확인 필요.
- 메시지 사진·파일 전달 시 저장소 접근 권한(방 단위 ACL 여부) 미확인.
- 레거시 앱 화면 위치·문구는 실제 앱 조작 없이 일반 지식 — NOT_PROVEN.

---

## H. 정합성 보완 (Owner 2026-11-14 지시 — 기능 추가 없음, 설계 보완만)

### H-1. 공식 스토어 주소·앱 식별자 (확인한 값만)

| 플랫폼 | 식별자 (저장소 근거) | 공식 스토어 주소 | 확인 (2026-11-14 PHT) | 판정 |
|---|---|---|---|---|
| Android | `applicationId "com.dibay.app"` (`android/app/build.gradle:15`, versionCode 53 / 1.2.7) | `https://play.google.com/store/apps/details?id=com.dibay.app` (코드에 이미 있음: `friend-qr-contract.ts:21`, `AppUpdateHistoryClient.tsx:14`) | 공개 페이지 조회 = **HTTP 404** (gl 없음·PH·KR·US 모두, 「Not Found」) | **NOT_PROVEN** — 공개 출시 전·비공개 테스트·지역 제한 중 무엇인지 확인 못 함. 이 주소를 「설치 링크」로 쓰기 전 Owner 확인 필요(G-13) |
| iOS | `PRODUCT_BUNDLE_IDENTIFIER = com.dibay.ph` (`project.pbxproj:793,817`), 팀 `ATB959PF9V` (AASA 와 일치) | App Store ID **6831952401** 「DiBaY - 디바이」 v1.2.1 → `https://apps.apple.com/app/id6831952401` | Apple 공개 조회 API(`itunes.apple.com/lookup?bundleId=com.dibay.ph`) = PH·KR 스토어 **1건**, US 스토어 **0건** | ID·PH·KR 노출 = 확인. 국가 없는 주소의 리다이렉트 동작과 PH·KR 외 국가 = NOT_PROVEN |

- 코드에 iOS 스토어 주소 상수가 **없다**. `FriendQrWebLanding.tsx:15` 주석: 「iOS 는 App Store 주소가 정해지기 전이라(Owner 결정 대기) 스토어로 보내지 않는다」. → 위 ID 를 단일 상수로 둘지는 G-13.
- 보고만(범위 밖): `lib/app-releases/app-release-sources.ts:114` 가 iOS 조회에 Android 패키지(`bundleId=com.dibay.app`)를 써서 **iOS 조회가 항상 0건**(같은 날 같은 API 로 0건 확인).
- `assetlinks.json` 의 SHA-256 2개가 **Play 앱 서명 키**와 일치하는지 = NOT_PROVEN(구현 전 필수 확인, H-7).

### H-2. 설치 상태별 진입 — 웹은 설치 여부를 알 수 없다는 전제

웹에서 앱 설치 여부를 판별하는 표준 API 는 없다. 타이머 방식은 PR #154 에서 이미 실패(「앱 선택」 창이 떠 있는데도 스토어로 넘어감)가 기록돼 있다 → **쓰지 않는다.** 설치 여부 판단은 OS 에 맡긴다.

| 경우 | Android | iOS |
|---|---|---|
| 공유 링크를 **처음 누를 때** (카톡·문자 등) | 앱 있고 경로가 App Links 에 선언·검증됨 → OS 가 앱을 엶. 없으면 브라우저로 웹 상세 | 앱 있고 AASA 에 경로 선언 → OS 가 앱을 엶. 없으면 Safari 로 웹 상세 |
| 웹 상세에서 「앱에서 열기」 | `intent://<경로>#Intent;scheme=https;package=com.dibay.app;S.browser_fallback_url=<Play 주소>;end` — 앱 있으면 앱, 없으면 Chrome 이 Play 로 이동(설치 여부를 웹이 판단하지 않음, 친구 QR 이 이미 쓰는 방식) | **같은 도메인 안의 링크·버튼은 Universal Links 를 열지 않는다**(Apple 동작) → 첫 판 시안의 「열기」 버튼은 iOS 에서 성립하지 않음. 대신 Safari 기본 **Smart App Banner**(`<meta name="apple-itunes-app" content="app-id=6831952401, app-argument=<현재 주소>">`) — 설치돼 있으면 「열기」, 없으면 「받기」를 **OS 가** 판단해 표시. 우리 화면에는 「앱 설치하기」(App Store 주소) 글자 링크만 |
| 인앱 브라우저(카카오톡·Facebook 등) | App Links·`intent://` 동작 여부 **NOT_PROVEN** | Universal Links·Smart App Banner 모두 Safari 전용·인앱 브라우저 동작 **NOT_PROVEN** |
| 사용자가 iOS 에서 「Safari 에서 열기」를 고른 적 있음 | — | 그 도메인 Universal Links 가 꺼진 상태로 기억됨(Apple 동작) — 웹 상세로 열림(정상 대체 경로) |

### H-3. 앱 미설치 — 웹 랜딩 · 다운로드 · 설치 후 복귀 (분리 설계)

| 단계 | 설계 | 판정 |
|---|---|---|
| ① 웹 랜딩 | 공개 콘텐츠는 **바로 보여 준다**(가리는 설치 팝업 금지). 회원 전용·비공개는 기존 접근 화면 | 설계 |
| ② 다운로드 | Android = Play 주소(H-1, 공개 상태 확인 후) · iOS = App Store `id6831952401` · 데스크톱 = 두 스토어 링크 표시만 | 주소 확인 상태는 H-1 |
| ③ 설치 후 원래 콘텐츠 복귀 | **자동 복귀 = 「지원 안 함」으로 표기한다.** 설치 후 첫 실행은 일반 시작 화면. 랜딩에 「설치 후 이 링크를 다시 눌러 주세요」 안내 1줄 | 자동 복귀 검증 없음 → **가능하다고 표시하지 않음** |

**지연 딥링크(Deferred Deep Linking) 검토 — 채택 보류, 결정 G-14**

| 방법 | 가능성 | 제약 |
|---|---|---|
| Android Play Install Referrer API (Google 공식) | Play 주소에 `referrer=<원래 경로>` 를 붙이면 설치 후 첫 실행에서 앱이 1회 읽을 수 있음 | 네이티브 의존성 추가·빌드 필요, Play 를 거친 설치만, 경로 허용목록 재검증 필요, 실기 검증 전 NOT_PROVEN |
| iOS | **공식 수단 없음** | 클립보드 방식 = iOS 붙여넣기 허용 팝업(개인정보·UX 문제) · 기기 지문/IP 대조 = 부정확·개인정보 신고 대상 · 외부 유료 SDK(Branch·AppsFlyer·Airbridge) = 데이터 외부 전송·계약 |
| Firebase Dynamic Links | **사용 불가** — 2025-08-25 서비스 종료 | — |

권장: 이번 설계에서는 지연 딥링크를 넣지 않는다(iOS·Android 동작이 갈리고 iOS 는 신뢰할 방법이 없음). 필요 시 Android Install Referrer 만 별도 결정(G-14).

### H-4. 로그인·시작·복원·푸시·통화와의 영향 관계 (코드 확인)

| 시스템 | 공유 링크가 닿는 지점 | 충돌 위험 | 설계 처리 |
|---|---|---|---|
| **통화 (Android)** | https·`dibay://` VIEW 인텐트가 **푸시·통화와 같은 `MainActivity.handleNotificationLaunchIntent`**(2571~)를 지난다. 이 함수는 먼저 `dismissIncomingCallNotificationFromIntent`·`applyIncomingCallWakeFlags`·`requestDismissKeyguardForCallIntent` 를 **모든 인텐트에** 호출 | intent-filter 경로만 늘려도 통화 처리 함수를 타는 인텐트 종류가 늘어난다(호출 결과가 VIEW 인텐트에서 아무 일도 안 하는지 = NOT_PROVEN) | **S5 = 통화 변경 규정 적용**: 영향 분석 문서 → Owner 승인 → 단독 PR → 통화 실기 행렬. 함수 분리 등 코드 변경은 그 승인 뒤에만 |
| **통화·푸시 대기 경로 (Android)** | 공유 링크도 `queueNavigateWebViewToAppPath` → `persistPendingRoute` **단일 슬롯**(ROUTE_PREFS)에 저장. JS 는 `NativeIncomingCall.getPendingPushRoute` 로 읽음 | 수신 전화 수락 경로가 대기 중일 때 공유 링크가 들어오면 **마지막 값이 덮어씀** → 통화 수락 화면 이동 손실 가능(NOT_PROVEN) | 우선순위 규칙 필요: 통화 경로(`/community-messenger/calls`) 대기 중이면 공유 링크는 버리거나 뒤로 미룸 — 구현 전 필수 검증 H-7 |
| **통화 화면 (공통)** | 통화 중 앱이 공유 링크로 열리면 `router.push` 로 통화 화면을 떠남 | 최소화 표면(PiP·Dock) SSOT 에 따라 통화가 유지돼야 함 — NOT_PROVEN | 실기 행렬에 「통화 중 공유 링크 수신」 추가. 통화 코드 변경 없음 |
| **푸시** | Android = 같은 수신 함수·같은 슬롯(위). iOS = `PushRouteListener.tsx` 같은 파일의 `appUrlOpen` | 푸시 탭과 링크 동시 도착 시 순서 | 공통 https 수신기는 `PushRouteListener` 의 기존 `navigate()`·중복 방지만 재사용, 푸시 판정 로직은 수정 안 함 |
| **앱 시작 (인트로)** | `LaunchIntroRoot.tsx:106-110` `hasLaunchIntent({includeCallRoutes:true})` | Android = 슬롯에 있으면 인트로 건너뜀(정상). **iOS warm `appUrlOpen` 은 `getLaunchUrl` 에 안 잡힘** | iOS 실행 중 수신은 인트로가 이미 끝난 상태라 영향 없음. 냉시작은 `getLaunchUrl` 로 잡힘(NOT_PROVEN) |
| **직전 화면 복원** | `lifecycle-route-effects.client.ts:35-78` 냉시작 1회, `hasLaunchIntent()` 이면 건너뜀 | 냉시작 = 건너뜀(코드상). 따뜻한 복귀에서는 복원이 돌지 않음(`NAV_APPLIED_KEY` 1회) | 변경 없음. 「다른 채팅방으로 잘못 이동」 회귀를 실기 행렬로 확인 |
| **첫 진입 약관 동의** | `isLifecycleAuthSurfacePath` — 로그인·약관·온보딩 화면이면 이동 안 함 | 미동의 회원이 링크로 들어오면 약관이 먼저(정상), 동의 후 원래 콘텐츠로 돌아가는지 = NOT_PROVEN | `next` 보존과 같은 단계(S5)에서 확인 |
| **로그인** | `proxy.ts:101-113`(next 소실), `auth-route-classification.ts:8-19`(`/post/` 복귀 거부), `sanitizeNextPath` | 공유 링크 → 로그인 → 홈/내정보로 떨어짐 | S5 인증 변경 = 별도 승인. `sanitizeNextPath` 의 열린 리다이렉트 차단은 그대로 |
| **OAuth 복귀** | `OAuthReturnListener` 도 `appUrlOpen`·`getLaunchUrl` 사용, `dibay://auth` 는 공통 수신기에서 제외(현재 `PushRouteListener` 와 같음) | 같은 이벤트 이중 처리 | 공통 수신기는 `dibay://auth`·`/auth/*` 를 무시(현재 규칙 유지) |
| **친구 QR** | `/f/` 는 Android 네이티브 큐 + JS `FriendQrAppLinkListener` 둘 다 처리 | 이중 이동 가능(NOT_PROVEN, 기존 결함) | 공통 수신기 도입 시 `/f/` 를 그 안으로 합칠지는 S5 영향 분석에서 결정 |

### H-5. G-4 메시지 전달 보안 재검토 — 모순·보완

| # | 검토 | 결론 |
|---|---|---|
| 1 | 서버 검사 순서 | 보낸 사람 = 원본 방 **현재** 참가자 · 원본 메시지 삭제(`deleted_at`·`deleted_for_everyone_at`)·관리자 숨김 아님 · 대상 방마다 전송 권한·양방향 차단·읽기 전용 아님 · 분당 제한 |
| 2 | 원본 방 종류 | **거래(`trade`)·매장 주문(`store_order`) 방 메시지는 전달 불가**(주문·거래 정보). 모임 방(`owner_domain='moim'`)은 `docs/moim-ssot.md` D1 「내보내기 차단」이 내용 반출까지 뜻하는지 **확인 못 함** → Owner 결정(G-4 하위) |
| 3 | 유형 | 텍스트·사진·파일·스티커·FEED 카드 = 대상. `system`·`call_stub`(통화 HARD LOCK)·`gift_certificate`(상품권 이전 계약) = 불가. **음성 = 타인 목소리 반출 → 기본 불가 권장**(첫 판은 지원으로 적었음 — 정정) |
| 4 | 첨부 파일 권한 | 첨부 열람 규칙(`messenger-media-access.ts`): 「요청 객체가 그 메시지 행이 가리키는 객체 + 그 방 참가자」. 전달 복사본이 **같은 저장소 객체를 가리키면** 새 방 참가자도 열람 가능(규칙과 모순 없음). 그러나 **원본 「모두에게서 삭제」 시 저장소 객체를 지우는지 확인 못 함** → 지우면 전달본이 깨지고, 안 지우면 원본 삭제 후에도 전달본에 남음. 구현 전 필수 확인(H-7) |
| 5 | 출처 | 「전달됨」 표시만. 원본 방 ID·방 이름·원작성자 ID 를 **새 메시지 행·metadata 에 저장하지 않음** — SH-P0-1 재발 방지 |
| 6 | 답장·반응·고정 | 복사하지 않음(`reply_to_message_id` 가 원본 방을 가리키지 않게) |
| 7 | 알림 | 기존 메시지 알림 함수만 호출, 미리보기 문구는 기존 유형별 규칙. 통화·VoIP·FCM dispatch 변경 없음 |

### H-6. G-10 메시지 데이터 계약 재검토 — 모순 2건

1. **스냅샷 vs 열 때 검사 (첫 판 시안과 모순).** 현재 `community_post_share` 카드는 보낼 때 제목·요약·**작성자 이름**·썸네일을 metadata 에 **스냅샷**으로 저장하고(`community-share-payload.ts:113-126`), 카드는 그 값만 그린다(`CommunityPostShareMessageCard.tsx:10-31`, 조회 없음). 첫 판 시안의 「열 때 다시 권한 확인 → 회색 카드」는 현재 계약과 다르다.
   - 권장: **스냅샷 유지**(메시지마다 조회 추가 없음 — 성능 계약) + 카드를 누르면 상세 페이지가 접근 검사(삭제·숨김 화면). 스냅샷 필드는 공개 필드만(제목·대표 사진·가격·지역), **요약·작성자 이름은 저장하지 않도록 축소**(삭제 후에도 대화에 남는 양 최소화).
   - 시안 3절 「받은 쪽」을 이 기준으로 고침.
2. **타입 이름 재사용안의 부작용.** `community_post_share` 는 홈 목록 미리보기·실시간 패치·안 읽음 집계 등 **20곳 이상**에서 분기한다(`cm-home-list-copy.ts:140`, `room-list-semantic-preview.ts:76`, `delivery-chat-list-preview.ts:14` = 「게시글 공유」 문구 등). 첫 판 권장안(타입 유지 + `metadata.kind` 확장)으로 MARKET·매장 카드를 보내면 목록 미리보기가 「게시글 공유」로 **잘못 표시**된다 → 권장안 철회.
   - 수정 권장: **S6 의 콘텐츠 카드는 FEED 만(기존 타입·기존 서버 그대로)** 먼저. MARKET·매장·CREW 카드는 새 타입(예: `content_share`) + DB 제약 마이그레이션 + 위 20여 곳 미리보기·집계 동시 수정이 한 단계에 들어가야 화면이 깨지지 않음 → G-10 결정 후 별도 단계.

### H-7. 구현 전 필수 검증 항목 (모두 미실행 · NOT_PROVEN)

1. Play 공개 상태(404 원인) · `assetlinks.json` SHA-256 = Play 앱 서명 키 일치
2. App Store 국가 없는 주소(`/app/id6831952401`)의 국가별 리다이렉트, PH·KR 외 국가 노출 범위
3. 카카오톡·Facebook·LINE 인앱 브라우저에서 App Links·Universal Links·`intent://`·Smart App Banner 동작
4. Android: VIEW 인텐트가 통화 처리 3함수에서 아무 것도 바꾸지 않는지(로그) · 통화 수락 대기 중 공유 링크 도착 시 슬롯 덮어쓰기
5. 통화 중 공유 링크 수신 시 통화 유지(PiP·Dock)
6. 냉시작·백그라운드·실행 중 각각 공유 링크 → 정확한 상세 도착 · 직전 채팅방 복원이 덮지 않음
7. 미동의 회원·비회원 → 약관/로그인 → 원래 콘텐츠 복귀
8. 메시지 「모두에게서 삭제」 시 저장소 객체 삭제 여부
9. 운영 `NEXT_PUBLIC_SITE_URL` 값(G-12)
10. `/post/` 를 로그인 복귀 거부 목록에 넣은 원래 이유

### H-8. 시안 정합성 점검 결과 (보완 후)

| 항목 | 첫 판 | 보완 |
|---|---|---|
| 공유 버튼 위치 | 위치표 OK | 변경 없음 |
| 공유 대상 선택 | 전달 피커에 거래·주문 방 제외 규칙 없음 | 「거래·주문 방은 목록에 안 나옴」 명시 |
| 메시지 메뉴 「공유하기」 | CTA 표의 「공유하기」(= 공유 시트 열기)와 다른 동작(OS 시트 직행) — **CTA 모순** | 메뉴 문구 「다른 앱으로 공유」로 정정 |
| 받은 쪽 카드 | 「열 때 다시 권한 확인 → 회색 카드」 — 현재 계약과 모순 | 스냅샷 카드 유지, 누르면 삭제 화면(H-6) |
| 다운로드 안내 | 「열기」 1개 — iOS 에서 성립 안 함 | Android 띠(앱에서 열기 / Google Play) · iOS Safari 기본 배너 + 「App Store 에서 설치」 · 설치 후 자동 복귀 없음 안내 |
| 오류 화면 CTA | 「MARKET 둘러보기」「CREW 둘러보기」 제각각, 그룹 초대 만료에 CREW 표기(오류) | 1개 규칙: 오류 = 「홈으로」, 로그인 필요 = 「로그인」+「홈으로」 |
| CTA SSOT | 6개 | 다운로드용 2개 추가: 「앱에서 열기」(Android), 「앱 설치하기」(스토어) — 새 기능 아님, 다운로드 안내 문구 |

### G 표 추가 결정

| ID | 결정 | 권장안 | 대안 | 영향 |
|---|---|---|---|---|
| **G-13** | 스토어 주소 확정 | Owner 가 Play 공개 상태 확인 → Android `…details?id=com.dibay.app`, iOS `https://apps.apple.com/app/id6831952401` 을 단일 상수로 | Play 비공개면 Android 다운로드 안내 보류 | 랜딩·앱 공유·친구 QR iOS 안내 |
| **G-14** | 설치 후 자동 복귀 | 지원 안 함(안내 문구) | Android 만 Play Install Referrer(네이티브 빌드) / 외부 SDK | iOS·Android 동작 차이, 외부 데이터 전송 |
| **G-4 하위** | 모임 방 메시지 전달 · 음성 전달 | 둘 다 불가 | 허용 | moim SSOT D1 해석 |

출처: [Firebase Dynamic Links 종료(Branch)](https://branch.io/resources/blog/firebase-dynamic-links-shutting-down) · [FDL 대안 정리(AppsFlyer)](https://www.appsflyer.com/?p=364599) · Apple 공개 조회 `itunes.apple.com/lookup?bundleId=com.dibay.ph` (2026-11-14)

---

## I. 2차 설계 검토 보완 (Owner 2026-11-14 · 6개 항목 + H-7 재판정 · 기능 추가 없음)

### I-0. 먼저 보고 — 검토 전제와 Owner 결정의 충돌 (설계·구현 규정 7번)

2차 검토문은 「DIBAY 는 개발과 운영 환경을 분리한 상태」를 전제로 한다. 그러나 **2026-11-11 Owner 최종 결정으로 개발·스테이징 분리 체계는 철회**됐고(새 분리안 제안 금지), 현재 저장소 기준 웹 배포는 `main` → Production 하나뿐이다(`vercel.json` `git.deploymentEnabled`: main 만 true). 남은 분리 잔재(Vercel test 환경·`dibay-dev.vercel.app`·Firebase `.dev` 앱)는 Owner 승인 대기 상태로 남아 있다. 어느 쪽을 따를지 임의로 고르지 않고, I-5 는 **현재 사실(운영 1개 + 로컬 개발)** 기준으로 설계하고 충돌은 Owner 결정 G-16 으로 올린다.

### I-1. 공유 실패·취소·클립보드 계약

**원인 (코드 확인)**
- 자동 복사 경로 7곳: `community-share-native.ts:49`(실패 시 복사) · `community-share-kakao.ts:78,90`(SDK 실패 시 복사) · `share-trade-listing.ts:61`(Abort 외 오류 → 복사) · `StoreDetailPublic.tsx:1856-1860`(Web Share 없으면 복사) · `MoimInviteSheet.tsx:76`(Web Share 없으면 복사) · 메신저 `shareMessageExternally` controller `:2760-2766`(오류 시 복사) · 연락처 초대(FEED 함수 재사용).
- **새 결함 SH-P1-12 — 앱에서 「취소」해도 링크가 복사된다.** `@capacitor/share` 는 취소 시 Android·iOS 모두 `reject("Share canceled")`(`node_modules/@capacitor/share/android/.../SharePlugin.java:60`, `ios/.../SharePlugin.swift:63`). `tryCapacitorShare` 는 모든 reject 를 `false` 로 바꾸고(`community-share-native.ts:19-21`) → `navigator.share` 시도 → 없으면 **클립보드 덮어쓰기 + 「복사됨」 토스트**. iOS WebView 에 Web Share 가 있으면 **공유 창이 두 번** 뜰 수 있음(NOT_PROVEN).
- 「성공」의 의미: Android 는 사용자가 **앱을 고르면** resolve(`activityType` = 고른 앱 패키지, `SharePlugin.java:62-64`), iOS 는 공유 확장이 `completed` 를 돌려주면 resolve. 상대방에게 **전달됐는지는 어느 쪽도 알려주지 않는다.** 카카오 `Kakao.Share.sendDefault` 는 결과를 돌려주지 않는다.

**영향 범위:** FEED·MARKET·매장·메뉴·CREW·메시지 외부 공유·연락처 초대 — 사용자가 클립보드에 둔 다른 내용(인증번호·주소 등)이 의도 없이 지워짐.

**해결 설계 (PlatformShareAdapter 결과 계약 — 모든 도메인 공통)**

| 결과 | 판정 기준 | 화면 | 클립보드 |
|---|---|---|---|
| `cancelled` | Capacitor reject 메시지 `Share canceled` · Web Share `AbortError` | 아무 것도 안 함(시트 닫힘 유지) | **변경 없음** |
| `handed_off` (기존 `shared` 이름 변경) | Capacitor resolve · Web Share resolve · 카카오 SDK 호출 성공 | 아무 것도 안 함 — 「보냈어요」 같은 **전달 확정 문구 금지** | 변경 없음 |
| `unavailable` | 앱 아님 + Web Share 없음 · 카카오 SDK 로드 실패 | 「다른 앱으로 공유」·「카카오톡」 칸을 **처음부터 숨김**(누른 뒤 실패시키지 않음) | 변경 없음 |
| `failed` | 그 밖의 reject·예외 | 오류 토스트 1회(「공유하지 못했어요」), 공유 시트는 **열린 채** 유지 → 사용자가 「링크 복사」를 직접 고름 | 변경 없음 |
| `copied` | **「링크 복사」를 직접 눌렀을 때만** | 「링크를 복사했어요」 | 변경 |

- 한 번 누름 = 한 경로: Capacitor 를 시도한 뒤에는 `navigator.share` 로 **넘어가지 않는다**(이중 시트 방지). 앱 판별은 `isCapacitorNativePlatform()` 하나.
- 사용자 활성화: Web Share 는 탭 직후 호출돼야 하므로, 초대 토큰처럼 서버 응답이 필요한 공유는 **시트를 열 때 링크를 미리 만든다**(CREW `MoimInviteSheet.ensureLink` 는 현재 누른 뒤 생성 → iOS Safari 에서 `NotAllowedError` 가능, NOT_PROVEN).

**검증:** vitest — Adapter 결과 5종 × (Capacitor 취소/선택/오류, Web Share Abort/NotAllowed/성공, 미지원) 표 테스트, 클립보드 호출 0 단언. 실기 — Android·iOS 에서 취소 후 클립보드 내용 유지.

**남은 위험:** iOS 공유 확장 일부가 `completed=false` 로 끝나 「취소」로 분류될 수 있음(무해 — 아무 것도 안 함). 카카오 앱 미설치 시 SDK 동작은 실기 전 NOT_PROVEN.

### I-2. Android·iOS·인앱 브라우저별 앱 열기·스토어 이동

**원인:** 저장소에 인앱 브라우저(카카오톡·Facebook·LINE) 판별 코드 **없음**(전수 검색 0건). H-3 의 Android 설계는 Chrome `intent://` + Play fallback 에 기대고 있고, Play 공개 페이지는 404(H-1).

**해결 설계 — 3단 대체, 각 단은 앞 단 실패를 가정하지 않음**

| 순서 | 수단 | 성립 조건 | 실패 시 |
|---|---|---|---|
| ① 기본 | 처음 누르는 공유 링크 자체가 **검증된 App Links / Universal Links** | 앱 설치 + 경로 선언 + 서명 검증 + 링크를 연 앱이 OS 에 넘김 | 웹 상세가 열림(②) |
| ② 항상 | **웹 상세가 콘텐츠를 그대로 보여 줌**(공개 콘텐츠) — 어떤 브라우저·인앱 브라우저에서도 동작 | 공개 경로 + SSR | — (마지막 안전망) |
| ③ 선택 | 상세 안의 안내: Android = 「앱에서 열기」(`intent://` — Chrome 계열만 보장, 인앱 NOT_PROVEN) · iOS = Safari 기본 배너 · 공통 = **일반 https 스토어 링크**(「앱 설치하기」) | 스토어 링크는 **G-13 확정 후에만 표시**. Play 공개 확인 전 Android 는 스토어 링크·「없으면 Google Play 로 이동」 문구를 **표시하지 않음** | 웹 상세 유지 |

- UA 로 인앱 브라우저를 판별해 동작을 바꾸지 않는다(판별 실패 시 오동작). 「외부 브라우저로 열기」 같은 앱별 스킴은 새 기능이라 넣지 않는다.
- `intent://` 의 `browser_fallback_url` 에는 Play 주소를 넣지 않고 **현재 웹 상세 주소**를 넣는다 → 미설치·Play 비공개여도 사용자가 콘텐츠를 잃지 않음. 스토어 이동은 ③의 별도 링크로만.

**검증 (H-7 #1~3):** 카카오톡·Facebook·LINE·Chrome·Samsung Internet·Safari × 설치/미설치 × Android/iOS 행렬에서 「도착 화면」 기록. Play 공개 상태는 Owner 확인.

**남은 위험:** 인앱 브라우저가 App Links 를 넘기지 않으면 앱 설치 사용자도 웹 상세로 감(비로그인 상태) — 콘텐츠는 보이므로 기능 손상 아님, 앱 진입률만 낮음.

### I-3. 공유 콘텐츠 스냅샷 — 삭제·비공개 전환 정책

**원인:** `community_post_share` 메시지는 보낸 시점의 제목·요약·작성자 이름·썸네일·주소를 `metadata` 에 저장(`community-share-payload.ts:113-126`)하고 카드가 그 값만 그린다(`CommunityPostShareMessageCard.tsx:10-31`). 원본 삭제·비공개 후에도 채팅에 남는다. H-6 의 「필드 축소」는 노출 양만 줄일 뿐 **삭제 후 노출 자체는 해결하지 못한다**(2차 검토 지적이 맞음 — H-6 권장안 정정).

**구조적 선택지 (모두 기존 계약 근거)**

| 안 | 저장 | 표시 | 삭제·비공개 후 | 비용 |
|---|---|---|---|---|
| A 참조만 | `{kind, id}` 만 | 방을 열 때 보이는 카드들의 공개 미리보기를 **한 번에 묶어 조회**(서버 접근 검사 포함) | 「볼 수 없는 글」 카드 — 과거 제목·사진 **노출 0** | 카드가 있는 방에서 조회 1회 추가(메신저 성능 계약 확인 필요) · 오프라인 카드 빈칸 |
| B 스냅샷 + 지우기 | 지금처럼 | 지금처럼 | 원본 삭제·비공개 시 서버가 해당 카드들의 metadata 미리보기 필드를 비움 | 도메인마다 삭제 경로에 연동(트리거·DB 변경), 숨김→복구 시 되살릴 수 없음, 누락 위험 |
| C 스냅샷 유지 | 지금처럼 | 지금처럼 | 남음 — 누르면 접근 화면 | 추가 비용 0, 정책상 「남아도 된다」를 Owner 가 정해야 함 |

- 권장: **A** — 저장 데이터(ID)와 표시 데이터(조회 결과)를 분리해 「공유 당시 저장」과 「삭제 후 표시 가능」이 구조적으로 갈린다. B 는 도메인마다 삭제 경로를 다 찾아야 해 누락이 구조적으로 남는다.
- 이미 저장된 과거 스냅샷 메시지: Owner 지침(지난 데이터 채우기 불필요)에 따라 소급 정리는 하지 않고, A 채택 시 카드 표시만 새 방식으로 바꾸면 과거 메시지도 ID 로 다시 조회됨(과거 metadata 의 제목은 화면에 쓰지 않음).
- 정책 결정 필요 → **G-15**.

**검증:** 원본 삭제·숨김·비공개 전환·차단 각각 후 카드 표시(vitest: 조회 응답 → 카드 상태), 방 열기 조회 횟수 계측(메신저 성능 기준 `docs/messenger-performance-targets.md`).

**남은 위험:** A 는 메신저 hot path 에 조회를 더하므로 성능 측정 전 NOT_PROVEN.

### I-4. 다중 채팅방 전달 — 부분 성공·중복 전송

**원인 (코드 확인)**
- DB 에 이미 중복 전송 불변식이 있다: 고유 인덱스 `uq_cm_messages_room_sender_client_message_id` = `(room_id, sender_id, metadata->>'client_message_id')` (`supabase/migrations/20270414140200_wp6_chat04_client_message_id_unique_index.sql`). 일반 전송 RPC 는 같은 키가 있으면 **기존 메시지를 돌려준다**(`20260912140000_…phase2.sql:258-275`).
- 그러나 FEED 내부 공유 API(`app/api/community/posts/[postId]/share/internal/route.ts`)는 `clientMessageId` 를 **넘기지 않고**, `sendCommunityPostShareMessage`(`service.ts:18324`)는 RPC 가 아닌 **직접 insert** — 재시도 시 중복 전송 가능, 고유 인덱스 충돌(23505) 처리 코드도 없음. (운영 DB 에 인덱스가 실제 있는지 = 운영 DB 미조회 NOT_PROVEN)

**해결 설계 (기존 인덱스 재사용 — 새 DB 객체 없음)**
- 클라이언트가 「전달하기」 시트를 열 때 `forwardRequestId`(UUID) 1개 생성. 대상마다 `client_message_id = "fwd:" + forwardRequestId + ":" + targetRoomId` (결정적).
- 서버는 대상별로 **독립 처리**(하나의 트랜잭션으로 묶지 않음): 권한·차단·방 상태 검사 → insert. 고유 인덱스 충돌이면 **이미 보낸 것으로 성공 처리**(기존 메시지 반환, 알림 재발송 없음).
- 응답 = 대상별 결과 배열 `{targetId, status: sent|already_sent|forbidden|blocked|room_unavailable|failed}`.
- 화면: 전부 성공 → 시트 닫고 「전달했어요」 / 일부 실패 → 시트 유지, 실패한 대상만 표시하고 「다시 시도」(같은 `forwardRequestId` 재사용 → 성공한 방은 `already_sent`) / 권한 변경으로 거절 → 그 대상은 재시도 목록에서 제외하고 사유 표시.
- 친구 대상(1:1 방이 아직 없음): 방 생성 → 전송 순서. 방 생성도 같은 요청 재시도에서 기존 방을 재사용해야 함(현재 `share/internal` 의 친구 경로가 기존 1:1 방 재사용인지 = NOT_PROVEN, 구현 전 확인).
- 버튼 잠금은 UI 편의일 뿐, 중복 방지는 **DB 고유 인덱스가 책임**.

**검증:** vitest — 5개 중 3 성공·2 실패 → 재시도 시 3개 `already_sent`·알림 0회 추가 · 동시 2회 요청 → 메시지 1개. 운영 DB 인덱스 존재 확인(읽기 전용, Owner 허락 후).

**남은 위험:** 대상 수만큼 알림 발송 — 분당 제한 필요(기존 30회/분 수준 재사용).

### I-5. 공유 URL 과 환경

**현재 사실 (코드 확인):** 웹 배포는 main → Production 1개. 로컬 개발(`localhost`)과 `DIBAY_LOCAL_RUNTIME` 앱이 있다. 공유 origin 함수는 localhost 를 절대 내보내지 않고 production 상수로 대체한다(`community-share-url.ts:12-26`) — **로컬 개발에서 만든 공유 링크가 운영 주소로 나간다.** `VERCEL_URL` 우선 문제(SH-P1-11)도 그대로.

**해결 설계 (새 환경·분리안 제안 없음)**
- ShareUrlResolver 규칙 1개: `VERCEL_ENV === "production"` 일 때만 운영 상수 origin, **그 밖(로컬·기타)은 현재 실행 중인 origin** 을 쓰고 「다른 앱으로 공유」·「카카오톡」 칸을 숨김(링크 복사만 — 개발자 본인용). → 개발용 주소가 외부로 나가지 않고, 운영 링크는 항상 운영으로.
- `VERCEL_URL`(배포별 주소)은 공유 origin 후보에서 제외.
- 「개발 앱에서 운영 DB 비공개 콘텐츠를 연다」 문제: 공유 링크는 권한을 주지 않으므로(D-7) 어떤 빌드로 열어도 **서버 접근 검사**가 같다. 공유 기능이 새로 만드는 위험은 없음.

**검증:** vitest — env 조합(production / preview / development / 미설정)별 origin·노출 칸.

**남은 위험·충돌:** 검토문의 「개발 환경 분리」 전제와 Owner 11-11 결정 충돌 → G-16.

### I-6. Android 공유 링크 ↔ 통화 수신 대기 경로

**원인 (코드 확인 — `MainActivity.java`)**
- 대기 경로는 **1칸**: 필드 `pendingAppPath`(279) + 디스크 `persistPendingRoute`(2841) + 보관 60초 `PENDING_ROUTE_TTL_MS`(215). 쓰는 곳 = 일반 큐 `queueNavigateWebViewToAppPath`(2872-2897) 및 **통화 수락이 직접 쓰는 564·2977 줄**.
- 큐 함수는 통화 보호 검사(`suppressNativeOwnedCallRouteReplayIfNeeded`, `CallV4Lane.shouldSuppressV3CallReplay`) 뒤 **무조건 덮어쓴다**(2885-2887). → 통화 수락 경로가 웹에 전달되기 전(60초 안) 공유 링크가 오면 **통화 경로가 사라진다.** 반대로 공유 경로가 대기 중에 통화가 오면 통화가 덮어씀(정상).
- **이미 존재하는 위험:** `/f/`(친구 QR)가 지금도 같은 https 경로로 이 큐를 탄다 — 공유 확장 전에도 열려 있는 경로(실제 발생 여부 NOT_PROVEN).

**해결 설계 (판단: 「우선순위 + 뒤로 미루기」 대신 「버림」)**
- 2차 검토의 질문(밀린 링크를 언제 처리하나·오래된 링크가 나중에 실행되나)에 대한 구조적 답: **미루지 않는다.** 통화 경로가 대기 중이거나 통화가 진행 중이면 들어온 콘텐츠 링크는 **버리고 로그만 남긴다.** 사용자는 통화 후 링크를 다시 누른다. → 늦게 실행되는 오래된 링크가 구조적으로 존재하지 않음.
- 통화 경로가 없을 때의 콘텐츠 링크는 지금처럼 1칸·60초.
- 이 판정은 통화 경로 판별 함수(이미 있는 `isCalleeAcceptCallRoute`·`CallV4Lane.isV4CalleeAcceptCallRoute`·`isCallPreviewRoute`)만 재사용 — 통화 처리 자체는 바꾸지 않는다. 그러나 **수정 위치가 통화 수신 파일(`MainActivity.java`)이므로 통화 변경 규정 전 항목 적용**: 영향 분석 문서 → Owner 승인 → 단독 PR·단독 main → 최소 통화 행렬 + 「통화 수락 대기 중 링크 수신」「통화 중 링크 수신」 → 실기 PASS 전 다음 단계 금지.
- 대안(네이티브 무변경): Android 앱 링크 경로를 **확장하지 않는다** — 콘텐츠 링크는 웹 상세(I-2 ②)로만 열림. 통화 위험 0, 대신 Android 설치 사용자도 앱으로 바로 안 열림.

**검증:** 기기 로그(`[push-route] pending_route_saved` / 버림 로그)로 판정 — 수신 전화 울림 중·수락 직후 10초 안·통화 중 각각 링크 수신, 통화 연결·화면 유지 확인. 시험마다 로그 파일 보존.

**남은 위험:** `/f/` 기존 위험은 공유 확장과 무관하게 지금도 있음 → 통화 규정상 「증거 없이 고치지 않음」 — 실기 재현 후 별도 판단(보고만).

### I-7. UI·UX·CTA SSOT · 설치 후 콘텐츠 접근 흐름 재확인

| 확인 | 결과 |
|---|---|
| CTA | 9개(공유하기·친구에게 보내기·다른 앱으로 공유·링크 복사·전달하기·초대하기·앱에서 열기·앱 설치하기·홈으로) 유지. I-1 로 「공유 실패 → 자동 복사」 문구 제거, 전달 확정 문구 금지 추가 |
| 시안 수정 | ① Android 띠의 「앱이 없으면 Google Play 로 이동해요」 삭제(G-13 전 약속 금지) ② 전달 부분 성공 화면 추가 ③ 받은 카드 = 안 A 기준(삭제 시 과거 제목·사진 없음) |
| 플랫폼별 검증 | 시안은 브라우저 계측만(버튼 48px·44px, 색·글꼴) — Android·iOS·태블릿·Windows 실화면 NOT_PROVEN |
| 설치 후 접근 | 미설치 → 웹 상세(콘텐츠 보임) → 「앱 설치하기」(G-13 후) → 설치 → **일반 시작 화면**(자동 복귀 없음, G-14) → 사용자가 링크 재탭 → ①(App Links) 성공 시 앱 상세 / 실패 시 웹 상세. 로그인 필요 콘텐츠는 S5 로그인 복귀 승인 전까지 로그인 후 원래 화면 복귀 **안 됨** |

### I-8. 구현 승인 가능 여부

| 단계 | 판정 | 근거 |
|---|---|---|
| S1 공통 기반 (Resolver I-5 · 결과 계약 I-1 · 앱 판별 통일) | **PASS** | 웹 코드만, 네이티브·DB·인증·통화 무관, vitest 로 계약 검증 가능 |
| S2 공통 시트·CTA | **PASS** (카카오 칸 제외 상태로) | 카카오 칸은 G-2 후 추가 |
| S3 도메인 적용(버튼·시트 교체) | **PASS** (코드) / 실기 NOT_PROVEN | 공유 실행만 바뀜, 수신·통화 무관 |
| S4 OG — `/post`·`/philife`·루트 기본 OG | **PASS** | 공개 경로, 읽기 로더 |
| S4 OG — `/moim`·`/group`·`/u` | **BLOCKED** | G-7(비회원·크롤러 공개 여부) 미결 |
| S5a 로그인 `next` 보존·복귀 | **NOT_PROVEN** | `/post/` 거부 이유 미확인, 약관 동의 흐름 실기 미확인 |
| S5b iOS Universal Links 경로 확장 + JS https 수신기 | **NOT_PROVEN** | 인앱 브라우저·통화 중 수신(PiP 유지) 미검증, 네이티브 빌드 필요 |
| S5c Android App Links 경로 확장 | **BLOCKED** | I-6 통화 대기 슬롯 — 통화 규정 승인·실기 PASS 전 금지 |
| 웹 랜딩 스토어 안내 — iOS | **PASS** (ID 6831952401 확인) / 인앱 동작 NOT_PROVEN | |
| 웹 랜딩 스토어 안내 — Android | **BLOCKED** | Play 404 — G-13 |
| S6 내부 전달·친구에게 보내기 | **BLOCKED** | G-4·G-10·G-15 미결, 첨부 수명주기(H-7 #8)·친구 방 재사용 미확인 |
| 메시지 「채팅방으로 공유」 클립보드 노출(SH-P0-1) | 보고만 | 고치는 것(메뉴 숨김 등) 자체가 별도 승인 항목 |
| 설치 후 자동 복귀 | **해당 없음** | 「지원 안 함」으로 설계(G-14) |

**종합:** 「공유 실행」 쪽(S1~S4 공개분)은 기존 통화·채팅·인증을 건드리지 않고 구현 가능(PASS). 「링크 수신」(S5)과 「내부 전달」(S6)은 BLOCKED/NOT_PROVEN — 통합 공유 기능 전체가 「정확한 도착」까지 보장된다고 지금 판정할 수 없다.

### I-9. Owner 정책 결정 (실제 정책만 · 이번 추가분 굵게)

| ID | 결정 | 권장안 |
|---|---|---|
| G-2 | 카카오톡 칸 직접 노출 | 노출(키·도메인 확인 후) |
| G-4 | 전달 출처 표시 · 거래·주문·모임 방 · 음성 | 「전달됨」만 · 셋 다 불가 |
| G-7 | 초대·모임 소개·프로필 비회원 공개 | 초대 랜딩만 공개 |
| G-10 | 콘텐츠 카드 메시지 타입 | FEED 기존 타입 유지, 다른 도메인은 새 타입(마이그레이션) |
| G-13 | Play 공개 상태 확인 · 스토어 주소 상수 | Owner 확인 |
| **G-15** | 원본 삭제·비공개 후 채팅 카드에 과거 제목·사진이 남아도 되는가 | **안 남음(안 A: ID 만 저장, 표시는 조회)** |
| **G-16** | 공유 URL 환경 기준 — 검토문 「개발·운영 분리」 전제 vs 11-11 분리 철회 | **현재 사실 기준(운영 1개 + 로컬), 운영 외에서는 외부 공유 칸 숨김** |
| **G-17** | Android 앱 링크 확장 방식 | **통화 규정 절차로 「통화 대기 중 콘텐츠 링크 버림」 구현 후 확장** / 대안: Android 는 확장하지 않음(웹 상세로만) |

---

## J. 3차 검토 반영 — 최종 보완 확인 (2026-11-14 PHT · Owner 정책 G-2·4·7·10·13·15·16·17 반영)

S1~S4 = 설계 방향만 조건부 승인(구현·커밋·PR 승인 아님). S5·S6 = BLOCKED/NOT_PROVEN 유지.

### J-0. 제 작업 보고 (먼저)
- 운영 DB(`ckdosyydvgzqwpbwuhon`)를 **SELECT 3건**으로 조회했다(인덱스 정의 1, 함수 본문 검사 2, 시각 1). 읽기 전용 세션 옵션(`default_transaction_read_only`)을 걸었으나 **풀러가 적용하지 않음**(`show` 결과 `off`) — 실행 문장은 모두 SELECT 이며 데이터·스키마 변경 없음.
- Supabase 는 프로젝트 **목록만** 조회했고, 테스트 DB(`dibay-reset-qa`)에는 접속·조회하지 않았다.

### J-1. G-16 — 실제 연결 상태 (READ-ONLY 조회, 2026-11-14)

| 대상 | 조회 결과 | 공유 설계 반영 |
|---|---|---|
| GitHub | main 보호: 필수 검사 `ci-ok`, 관리자 포함(`gh api …/branches/main/protection`). 원격에 `dev` 브랜치 없음(작업·백업 브랜치만) | 영향 없음 |
| Vercel 배포 | `vercel.json` main 만 배포. 운영 = `samarket.vercel.app` → `dpl_477Nf9ZkJdb2onMRrBQNzvidZC3u`(11-13 13:56 PHT). **커스텀 도메인 0개**(`vercel domains ls`). `dibay-dev.vercel.app` 없음. 과거 Preview 배포 주소(`samarket-git-…`, 25~26일 전)는 남아 있음 | 공유 origin 은 운영 상수만. Preview 주소는 후보에서 제외(이미 설계) |
| Vercel env | `NEXT_PUBLIC_SITE_URL` = **Production 에만** 설정(`https://samarket.v…`, 값 앞부분만 표시됨). `NEXT_PUBLIC_SUPABASE_URL` = Development·Preview·Production **같은 값 1개** + 특정 Preview 브랜치 1개. 사용자 지정 환경 `test` 가 APNs 3개 변수에 남아 있음. **`NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` 없음** | ① 운영에서는 SH-P1-11(`VERCEL_URL` 우선) **발생 안 함**, 그룹 초대 `dibay.app` 대체값도 운영에서는 안 쓰임(단, `dibay.app` 은 우리 도메인이 아님 — 대체값 자체는 제거 대상) ② Preview·로컬도 **운영 DB** 를 본다 → 「개발 환경 공유 링크」는 운영 데이터를 가리킴 → I-5 규칙(운영 외에서는 외부 공유 칸 숨김) 유지 ③ 카카오 JS 키 미등록 → G-2 활성화 차단 조건 |
| Supabase | 활성 프로젝트: `ckdosyydvgzqwpbwuhon`(운영, `.env.local`·운영 앱이 사용) · `dibay-reset-qa`(테스트, 미접속) · `ph-super-app-db`(INACTIVE) | 공유는 운영 DB 하나만 전제 |

판정: G-16 적용 기준 = **운영 1개(웹·DB) + 같은 DB 를 보는 로컬·Preview**. 외부 공유가 운영 데이터를 잘못 노출하지 않는 근거는 「링크는 권한을 주지 않고, 열 때 서버가 검사」(D-7) + 「운영 외 실행에서는 외부 공유 칸 숨김」(I-5). → 설계 **PASS**, 동작 NOT_PROVEN.

### J-2. 다중 전달 — 고유 인덱스 · 동시 요청 · 알림 중복

| 확인 | 근거 | 판정 |
|---|---|---|
| 고유 인덱스 운영 적용 | 운영 `pg_indexes`: `uq_cm_messages_room_sender_client_message_id` = `UNIQUE (room_id, sender_id, metadata->>'client_message_id') WHERE client_message_id 있음` | **PASS** (운영 스키마 조회) |
| 동시 요청 중복 방지 | 운영 함수 `dibay_append_room_message_atomic` 본문에 `unique_violation` 처리·`deduped` 반환 존재(마이그레이션 `20270414140100…:231-258` = 「동시 2중 제출 → 먼저 커밋된 행을 deduped 성공으로 반환」) | **PASS** (스키마·함수 정의) / 실제 동시 요청 실행 NOT_PROVEN |
| 알림 중복 방지 | 서비스가 `deduped` 이면 알림·배지 무효화를 다시 하지 않음(`service.ts:17357-17361`, `18041-18042`) | **PASS** (코드) |
| 현재 FEED 내부 공유 경로 | `sendCommunityPostShareMessage` 는 위 함수를 쓰지 않고 **직접 insert**, 라우트는 `clientMessageId` 를 안 넘김 → 재시도 중복 가능, 충돌 처리 없음 | **FAIL(기존)** — 전달 구현 시 이 경로도 위 함수로 통일해야 함 |
| 보고만 | 운영에 같은 정의의 **비고유 인덱스** `community_messenger_messages_room_sender_client_msg_id_idx` 가 함께 남아 있음(중복 인덱스 정리 마이그레이션 `20270708150200` 의 대상) | 범위 밖 |

### J-3. ID 참조 카드(G-15) — 묶음 조회·캐시·권한·DB 호출량

설계(새 API 없음):
- 방 진입 API 수 한도 `maxApisOnRoomEnter ok 3`(`lib/community-messenger/monitoring/thresholds.ts`)을 지키기 위해 **새 API 를 만들지 않는다.** 기존 방 메시지 응답(bootstrap·messages)을 만드는 서버에서, 그 페이지에 카드 메시지가 **있을 때만** 카드 대상 ID 를 모아 `in (…)` **1회** 조회 + 서버 접근 검사(삭제·숨김·비공개·차단) → 공개 미리보기만 붙여 보냄.
- 카드가 없는 페이지 = DB 호출 **0 추가**. 카드가 있는 페이지 = 종류별 1회(FEED 만이면 1회).
- 실시간 수신(bump v2 메시지 스냅샷)에는 미리보기가 없음 → 카드는 자리 표시로 그렸다가 **이미 있는 HTTP 정합 단계**(Community 메신저 방 메시지 기본 계약)에서 채움 — 클라이언트 추가 요청 없음.
- 캐시: 서버 응답 단위로만(별도 캐시 저장소 없음). 클라이언트 메시지 캐시는 미리보기를 함께 보관하되, 방을 다시 열면 서버가 다시 검사 → 그 사이 삭제되면 다음 정합에서 「볼 수 없는 글」로 바뀜.
- 권한 재검사 기준 = 보는 사람(viewer). 차단 관계면 「볼 수 없는 글」.

| 확인 | 판정 |
|---|---|
| 기존 계약(진입 API 수·서버만 bump 발행·HTTP 정합)과 모순 없음 | **PASS** (설계·코드 대조) |
| 방 진입 p95(`roomBootstrap` 목표 500ms)·응답 크기 영향 | **NOT_PROVEN** — 측정 안 함 |
| 묶음 접근 검사 함수 | **없음** — 현재 접근 검사(`community-post-access.ts`)는 1건 단위. 묶음 버전은 새로 만들어야 함(DB 함수 없이 서버 코드로 가능 여부 = 구현 설계 때 확인) |
| 종합 | **BLOCKED** (S6 소속 · 성능 측정 전 채택 불가 — Owner 조건 「성능 계약 충족」) |

### J-4. Android 통화 판별 정확성 · `/f/` · 통화 중 링크 수신

코드상 「통화 중」을 알려 주는 곳이 **하나가 아니다**:

| 상태 | 근거(Android) |
|---|---|
| 수신 울림 | `ForegroundIncomingCallRegistry.getActiveCallId()`, `IncomingCallActivity` |
| 수락 경로 대기 | `pendingAppPath` 가 통화 경로(`isCalleeAcceptCallRoute`·`CallV4Lane.isV4CalleeAcceptCallRoute`·`isCallPreviewRoute`) |
| 연결 중(네이티브) | `call/DibayActiveCallSessionManager.isConnected()`·`getPhase()` (프로세스 메모리 값 — 앱 프로세스가 재시작되면 사라짐) |
| WebView(v3) 통화 | 네이티브가 직접 들고 있는 상태 값 확인 못 함 |

| 확인 | 판정 |
|---|---|
| 「통화 대기·진행 중」 하나의 판별 기준 존재 | **BLOCKED** — 단일 기준 없음. 여러 상태를 합치는 판별을 새로 정의해야 하고, 그 자체가 통화 코드 변경(통화 규정 3번 문서·승인 필요) |
| `/f/` 영향 | 현재 `/f/` 는 ① 네이티브가 1칸 대기 경로에 저장(통화 경로 덮어쓰기 가능) ② JS `FriendQrAppLinkListener` 가 따로 `router.push` — 두 번 이동 가능. 버림 규칙을 넣으면 **통화 중 QR 친구 링크도 버려짐**(동작 변경). 기존 위험 실제 발생 = **NOT_PROVEN** |
| 통화 중 링크 수신 시 화면·통화 유지 | `MainActivity` 가 VIEW 인텐트로 앞으로 오면 네이티브 통화 화면(`NativeVideoCallActivity` 등)이 PiP·Dock 로 바뀌는지, WebView 통화 화면에서 `router.push` 시 통화가 유지되는지 — **NOT_PROVEN** (실기 필요, 이번 작업에서 기기 조작 안 함) |

G-17 은 「설계 방향만 승인」 상태로 둔다. 구현 착수 조건: ① 통화 상태 단일 판별 정의 문서 ② 통화 규정 3번 영향 분석·Owner 승인 ③ 통화 실기 행렬 + 「울림 중·수락 직후·연결 중·PiP 중 링크 수신」.

### J-5. SH-P0-1 최소 수정안 (승인 시 · 지금은 수정 안 함)

- 최소안: `lib/community-messenger/message-actions/message-share-policy.ts` 의 `canShareMessageToRoom` 이 항상 `false` 를 돌려주게 한다(1개 함수). 테스트 `message-long-press-policy.test.ts:83`(거래방에서 `true` 기대) 갱신.
- 영향(코드 확인 — `MessageLongPressPopover.tsx:248-251`, `message-long-press-policy.ts:10,49`):
  - 일반·그룹 방: 공유 하위 메뉴가 「외부 공유」「링크 복사」 2개로 줄어듦.
  - **거래방: 공유 항목 자체가 사라짐**(거래방은 외부 공유·링크 복사가 이미 막혀 있어 남는 항목 0 → `canShareMessage` false).
  - 복사·답장·수정·고정·신고·차단·삭제·반응·사진 저장: 다른 정책 함수라 **영향 없음**.
  - `call_stub` 길게 누르기 메뉴: 공유 하위 항목만 줄어듦. 통화 파일 변경 없음.
  - 클립보드 카드 함수(`message-internal-share-card.ts`)·`shareMessageToOtherRoom` 은 호출되지 않는 코드로 남음 — 지우지 않음(최소 수정, S6 에서 정리).
- 대안(비권장): 클립보드 문구에서 방 이름·JSON 만 빼기 — 「복사」와 같은 결과가 되어 기능 이름과 동작 불일치가 남음.
- 판정: 수정안 **PASS(설계, 웹 1파일·네이티브·DB 무관)** / 실행은 Owner 별도 승인. SH-P0-2(메시지 링크 복사 = 비공개 방 주소)는 G-4 결정에 명시돼 있지 않아 이번 최소안에 넣지 않음.

### J-6. 남은 기술 차단 조건 (최종)

| # | 차단 조건 | 막는 단계 |
|---|---|---|
| T-1 | 카카오 JS 키 운영 env 미등록 · 카카오 콘솔 도메인 등록 미확인 | 카카오 칸(G-2) |
| T-2 | Play 공개 페이지 404 | Android 설치 안내(G-13) |
| T-3 | 통화 상태 단일 판별 기준 없음 · 1칸 대기 경로 | S5c Android App Links, `/f/` 정리 |
| T-4 | 묶음 접근 검사 함수 없음 · 방 진입 성능 미측정 | S6 ID 참조 카드(G-15) |
| T-5 | FEED 내부 공유가 직접 insert(중복 방지 함수 미사용) | S6 |
| T-6 | 첨부 저장소 객체 삭제 수명주기 미확인(H-7 #8) | S6 사진·파일 전달 |
| T-7 | `/post/` 로그인 복귀 거부 이유 미확인 · 인앱 브라우저 앱 링크 동작 미확인 | S5a·S5b |
| T-8 | 새 콘텐츠 카드 타입 DB 마이그레이션 미승인(G-10) | S6 MARKET·매장·CREW 카드 |

### J-7. Owner 추가 결정 필요 (정책만)

| ID | 결정 |
|---|---|
| G-18 | SH-P0-1 최소안(「채팅방으로 공유」 메뉴 끄기, 거래방은 공유 항목 사라짐) 을 S6 과 별도로 먼저 반영할지 |
| G-19 | SH-P0-2 메시지 「링크 복사」(비공개 방 주소) 를 끌지 — G-4 에 포함되지 않음 |
| G-20 | 통화 중 들어온 QR 친구 링크(`/f/`)도 버림 규칙에 포함할지 |

---

## K. Owner 결정 반영 기록 (2026-11-14 PHT)

| ID | 결정 | 반영 상태 |
|---|---|---|
| G-18 | 승인 — 「채팅방으로 공유」 끔 | PR #270 (자동 병합 등록, 병합·운영 반영 전) |
| G-19 | 승인 — 메시지 「링크 복사」 끔 | PR #270 같은 PR 에 추가. 꺼진 하위 행은 그리지 않도록 함께 정정 |
| G-20 | 승인 — **통화 대기·진행 중 들어온 QR 친구 링크(`/f/`)도 버림 규칙에 포함** | **설계 반영만.** G-17 은 「설계 방향만 승인」 상태이므로 구현 없음. J-4 의 착수 조건(통화 상태 단일 판별 정의 문서 · 통화 규정 3번 영향 분석·Owner 승인 · 통화 실기 행렬)이 그대로 적용되고, `/f/` 는 그 실기 행렬에 「울림 중·수락 직후·연결 중·PiP 중 QR 링크 수신 → 버림·통화 유지」 항목으로 포함한다. 버림 후 사용자 안내 문구는 추가하지 않는다(새 기능 아님 — 통화 후 QR 을 다시 스캔) |

G-20 반영으로 `/f/` 의 기존 이중 이동(네이티브 대기 경로 + JS `FriendQrAppLinkListener`)도 S5c 구현 때 같은 판별을 거치도록 설계 대상에 포함한다 — 이 역시 통화 규정 승인 전에는 손대지 않는다.

---

## L. 실기 결과 (2026-11-14 02:33~02:38 PHT · Claude 직접 · 운영)

- 운영 배포: `samarket.vercel.app` → `dpl_G6fmaDkw3qmS6TRP2Mc9gNRNtaZn` (02:28 PHT 생성, main #278·#279 포함). #280(S5 로그인 복귀)은 실기 시점 미병합.
- 기기: Samsung SM-M156S (Android, DIBAY 1.2.6 (52), 시험 계정 로그인) · iOS 시뮬레이터 iPhone 17 Pro (iOS 26.5, Safari). 다른 세션에 기기 사용 여부 확인 후 진행(사용 안 함 회신).
- 캡처: `docs/audit/dibay-unified-share-2026-11-14-device/01~09`

| # | 항목 | 조건 | 결과 | 증거 |
|---|---|---|---|---|
| 1 | MARKET 상세 「공유하기」 → 통합 시트 | Android 앱·로그인 | **PASS** — 기기 맨 아래 시트, 미리보기(사진·김밥·₱500 · Manila City), 「다른 앱으로 공유」·「링크 복사」 | 01 |
| 2 | 「다른 앱으로 공유」 → OS 공유 창 | 같음 | **PASS** — Android 공유 창, 주소 `https://samarket.vercel.app/post/724be3d0…`(운영 정규 주소). 예전 「공유 창 없이 바로 복사」 해소 | 02 |
| 3 | OS 공유 창 취소 | 같음 | **PASS** — 시트 유지, 「복사했어요」 토스트 없음(취소 2.3초 뒤 캡처) | 03 |
| 4 | 「링크 복사」 | 같음 | **PASS** — 시트 닫힘 + 「링크를 복사했어요」 + Android 「복사했어요.」 | 04 |
| 5 | MY → 앱 설정 「dibaY 공유하기」 | 같음 | **PASS** — 버전 정보 바로 위 행 | 05 |
| 6 | 앱 공유 시트 | 같음 | **PASS** — 앱 아이콘·dibaY·소개 문구 미리보기 | 06 |
| 7 | 앱 공유 → OS 공유 창 | 같음 | **PASS(화면)** — 「텍스트 공유」 소개 문구 표시. 주소 포함은 Capacitor 원본 코드(`text + " " + url`)로 확인 — 받는 쪽 실제 수신은 NOT_PROVEN | 07 |
| 8 | `/download` | Android Chrome | **PASS** — Android 라 설치 버튼 없이 「웹에서 둘러보기」만(G-13 Play 보류) | 08 |
| 9 | `/download` | iOS Safari(시뮬레이터) | **PASS(버튼)** — 「앱 설치하기 · App Store」+「웹에서 둘러보기」. Safari 기본 앱 배너는 시뮬레이터에서 안 보임 → NOT_PROVEN | 09 |
| 10 | 초대 랜딩 비회원 | 운영, 쿠키 없는 요청 | **PASS(코드·응답)** — `/group/<없는 토큰>` 200 + noindex. 브라우저(Chrome)는 로그인 상태라 기존 로그인 화면이 보임 | — |

실기 중 제 실수: 상품 상세에서 하단 탭이 없는 줄 모르고 MY 위치를 눌러 다른 상품(찐빵) 상세가 1회 열림 — 그 글 조회 수 +1 가능.

NOT_PROVEN 그대로: 카카오·WhatsApp 실제 미리보기(메시지 전송이 필요해 하지 않음) · iOS 앱 공유 시트 · 유효 초대의 비회원 카드 · 로그인 후 복귀(#280 병합 후, 시험 계정 로그아웃 필요) · 태블릿.

---

## M. S6 내부 전달 — 1단계 (2026-11-14 · Owner 「S6 내부 전달 진행」)

### 차단 조건 재확인 → 처리

| 조건 | 확인 (코드·운영 스키마) | 처리 |
|---|---|---|
| T-5 FEED 내부 공유 직접 insert | 그대로 | 전달은 `dibay_append_room_message_atomic`(고유 인덱스·deduped·알림 1회) 사용. FEED 카드 경로는 2단계 |
| T-6 첨부 수명주기 | 「모두에게서 삭제」 = `softDeleteCommunityMessengerMessageForEveryone` → `purgeMessengerMediaStoragePaths` 로 **저장 파일 삭제**. 사진 metadata 는 섬네일·미리보기·원본 3종 주소·경로 | 같은 파일을 가리키면 원본 삭제 때 전달본이 깨짐 → **사진·파일 전달은 파일 복사 설계 후(2단계)**. 1단계 = text·sticker |
| 「전달됨」 저장 | 텍스트 전용 RPC `community_messenger_send_text_message` 는 metadata 인자 없음. 범용 RPC 는 metadata·text 지원 | 범용 RPC + `metadata.forwarded=true` → **DB 변경 없음** |
| 운영 칸 | `community_messenger_rooms.owner_domain·chat_domain·summary` · `messages.deleted_for_everyone_at·is_hidden_by_admin·metadata` 존재(운영 information_schema 조회) | 원본·대상 방 판별에 사용 |
| T-4 ID 참조 카드 성능 · T-8 새 카드 타입 마이그레이션 | 미해결 | 2단계(FEED·MARKET 등 「친구에게 보내기」) |

### 1단계 구현

- 서버 `forwardCommunityMessengerMessage`(service.ts) + `POST /api/community-messenger/rooms/{대상}/messages/forward`
  - 원본: 보낸 사람이 원본 방 참가자 · 삭제·관리자 숨김 아님 · text/sticker · 원본 방 = 일반 1:1·그룹(거래·배달·모임 불가)
  - 대상: 스티커 전송과 같은 송신 가드(차단·방 상태·읽기 전용·거래 연동) + 일반·그룹 방만
  - 저장: `{ client_message_id, forwarded: true }`(+스티커 id) — 원본 방·원작성자·답장·반응 없음
  - 중복: `clientMessageId = fwd:{요청}:{대상 방}` → 고유 인덱스 deduped → 알림·bump 재발송 없음
- 화면: 길게 누르기 「전달하기」(답장 아래) → 전달 대상 시트(최근 채팅 + 친구, 최대 5곳) → 대상별 결과(보냄·보낼 수 없음·다시 시도) · 받은 말풍선 「전달됨」
- 친구 대상: 기존 `direct/start`(있으면 기존 방) 후 전달

### 남은 단계 (2단계 — 별도 진행)

1. 사진·파일 전달: 대상별 저장 파일 복사 + metadata 재구성(원본 삭제와 분리)
2. 「친구에게 보내기」 콘텐츠 카드: G-15 ID 참조 + 방 진입 성능 측정(T-4) · FEED 경로 중복 방지 함수로 통일(T-5) · MARKET 등 새 타입은 DB 마이그레이션 승인(T-8)

### M-실기. 전달 1단계 (2026-11-14 03:08~03:13 PHT · Claude 직접 · 운영)

- 배포: PR #286 병합 `0237ba5e2`(CI 전부 통과 확인) → 운영 `dpl_EsYJJSG1diF4smkN1W9sV9Nre5oa`(03:05 PHT). 전달 API 비로그인 요청 = 401(경로 존재).
- 기기: iOS 시뮬레이터 iPhone 17 Pro Max(DIBAY 앱·시험 계정·영어 화면). 시험 계정 1:1 「w테스트1」 → 같은 방으로 전달.

| 항목 | 결과 | 증거 |
|---|---|---|
| 길게 누르기 메뉴 「Forward」(답장 아래) | **PASS** | 10 |
| 대상 시트: 미리보기 · 최근 채팅 · 친구 · 「Forward (0)」 비활성 | **PASS** | 11 |
| 1곳 선택 → 「Forward (1)」 활성 | **PASS** | 12 |
| 전달 → 「Forwarded to 1」 · 새 말풍선 「Forwarded」 · Unread | **PASS** | 13 |
| 운영 DB(읽기 전용): 30분 안 forwarded 행 **1개** · metadata 키 = `client_message_id, forwarded` 뿐 · 키 접두 `fwd:` | **PASS** | 쿼리 |
| 대화 목록 최신 메시지 갱신(3:11 AM · Vggg) | **PASS** | 14 |
| 거래방 메뉴에 「Forward」 없음 | **PASS** | 15 |

NOT_PROVEN: 받는 사람 기기의 「전달됨」 표시·알림(상대 기기 미확인) · 여러 곳 동시·부분 실패·다시 시도 · 친구(대화 없는) 대상 · 스티커 · 최근 채팅 목록에 그룹방(CRYSTAL CLEAR)이 안 보인 이유(미확인) · Android(아래).

**범위 밖 결함(보고만 · 2026-11-14 정정):** Samsung(Android 1.2.6, 시험 계정 q테스트1)에서 **그룹방 「q테스트1」 1개**를 눌러도 열리지 않음(같은 줄 3회 시도). 1:1 방은 Samsung 에서 시도 안 함·iOS 그룹방도 시도 안 함 → 「대화 목록 방 전체」로 쓴 첫 보고는 과장(정정) — 로그 `[cm-room-route-guard] blocked_navigation`(lib/navigation/cm-deep-route-navigation-lock.ts) 03:09:02·03:09:23 2회. 앱 재시작 후에도 같음. 기존 이동 잠금 코드(이번 변경 없음)·잠금 내용은 Samsung WebView 디버깅 불가로 확인 못 함. 증거 16 + logcat.

**정정 2 (2026-11-14 03:2x PHT · 조사 세션 실기 결과 반영):** 열리지 않은 「q테스트1」은 **삭제된 그룹**(11-13 13:14 PHT 삭제)이 목록에 남아 있던 것. 1:1·모임 그룹·일반 그룹은 Samsung 에서 열림(PASS). `blocked_navigation` 로그는 목록 복귀 뒤 남은 진단 기록이며 **원인이 아님** — 첫 보고에서 이동 잠금을 원인처럼 쓴 것은 틀림. 원인 = 운영 DB 함수 `community_messenger_bootstrap_lite_my_rooms_bundle` 이 삭제된 방을 거르지 않음(조사 세션 보고, 수정은 DB 마이그레이션 · Owner 승인 필요).

---

## N. 머리글 공유·기기 SNS 전체 표시 — 결함·설계 (Owner 2026-11-14 04:2x PHT 지시 · 보고만, 구현 안 함)

지시 원문: 「공유 부분은 게시물의 헤더 부분에 위치하기를 원하는 부분이고, 공유되는 기기의 저장되어진 sns 가 모두 나오는 부분이길 원하는 부분이다」 · 「각각의 부분별 상단 공유 버튼의 시안을 보고해라. 중복되지 않게」
시안: `docs/design/dibay-header-share-mockup-2026-11-14.html` (앱 CSS 원문 · 머리글 실제 클래스 · 아이콘 중심 W−76/W−28·끝 W−16 브라우저 실측 일치)

### N-0. 먼저 보고 — 제 잘못 · 설계 충돌
- **제 잘못(S6-2 #287):** 내가 보낸 사진을 전달하면 「Forwarded」 글자가 흰색(`text-white/80`)으로 그려져 사진 위 밝은 배경에서 거의 안 보임. 원인 = `MessengerTimelineVirtualRow.tsx:592` 색 조건이 스티커만 빼고 사진은 빼지 않음(말풍선은 사진이면 배경 없는 media 인데 글자는 녹색 말풍선용 색). 실기 iOS 04:12 PHT FAIL.
- **설계 충돌(규정 7번):** 승인된 D-3·시안 1절 = 「공유 → 우리 시트(친구에게 보내기·카카오톡·다른 앱으로 공유·링크 복사)」. Owner 새 지시 = 「기기 SNS 가 모두 나오게」. 기기 공유 창(OS)은 설치된 SNS·복사를 이미 모두 보여 주므로(실기 N-2) 우리 시트를 거치면 한 번 더 눌러야 함. → 새 지시 기준 설계안 = 머리글 공유 → 기기 공유 창 바로. 이 경우 **카카오톡 전용 칸(G-2)은 필요 없어짐**(기기 공유 창에 카카오톡이 나옴), **「친구에게 보내기」(S6 콘텐츠 카드, 미구현)는 둘 곳이 없어짐** — Owner 결정 1개.

### N-1. 결함 (실기·코드 근거)

| ID | 판정 | 결함 | 근거(조건) | 원인 |
|---|---|---|---|---|
| HS-1 | **FAIL** | 공유를 눌러도 기기 SNS 목록이 바로 안 나옴 — 우리 시트 → 「다른 앱으로 공유」 2번 눌러야 함 | iOS 앱(시뮬, 운영 63af1033a, 로그인, 04:2x PHT) 캡처 20→19 · Android 01→02 | `DibayShareSheet` 가 중간 시트 |
| HS-2 | **FAIL** | 공유 위치가 머리글이 아님(FEED·MARKET·CREW) — 본문 아래·⋮ 메뉴·초대 시트 안 | iOS 앱 MARKET 상세: 머리글 ⋮ 뿐, 공유는 판매자 줄 아래(실측) · 코드 | 화면별 각자 배치 |
| HS-3 | **FAIL** | FEED 내 글은 공유 2곳(통계 줄 + 작성자 ⋮) | `CommunityDetail.tsx` `onShare`·`onOwnShare` (코드) | 중복 진입 |
| HS-4 | **FAIL** | MARKET 공유 위치가 글 종류·작성자에 따라 3가지(구매자 행동 줄 / 판매자 단독 줄 / community 종류는 ⋮) | `PostDetailView.tsx:363,1255,1266,1627-1640` (코드) | 조건 분기 |
| HS-5 | **FAIL** | 사진 전달본 「Forwarded」 안 보임 | N-0 | N-0 |
| HS-6 | **FAIL**(범위 밖·보고만) | 영어 화면에서 지운 메시지가 「삭제된 메시지입니다」(한국어) | iOS 앱 영어, 04:13 PHT 캡처 18 | 서버 고정 한국어 `message-reply-policy.ts:67` 외 |
| HS-7 | **FAIL**(데이터·보고만) | #291 이전 사진은 `storage_bucket=post-images` 로 잘못 저장 → 「모두에게서 삭제」 후 파일 3개 남음 | 운영 DB 조회 04:14 PHT(원본 cf94bf79… 3개 잔존) | 옛 전송 함수(#291 에서 고침). 앞으로의 사진은 정상 |
| HS-8 | NOT_PROVEN | iOS 공유 창 위 줄에 상품 제목 대신 주소만 | 캡처 19. 링크 미리보기 HTML 은 정상(크롤러 3종 og:title 김밥·₱500·사진 확인) | 확인 못 함 |
| HS-9 | NOT_PROVEN | 매장 화면에서 스크롤 머리글·위 머리글에 공유가 동시에 2개 보이는지 | 실기 안 함 | — |

### N-2. 기기 공유 창 = 기기 SNS 전체 (실측)
- Android(Samsung, 운영 앱): 링크+복사 · 최근 대화 상대 · 퀵 셰어·카카오톡·Gmail·Drive·Telegram… (캡처 02). `@capacitor/share` → Android 공유 창(OS 가 설치 앱으로 채움).
- iOS 앱(시뮬): `UIActivityViewController` — 미리 알림·더 보기·복사(시뮬에 SNS 미설치). 실제 iPhone SNS 표시 NOT_PROVEN.
- 앱이 목록을 정하지 않음(iOS 는 설치 앱 목록을 앱이 읽을 수 없음) → 「모두 나오게」 = 기기 공유 창을 바로 여는 것이 유일한 방법.

### N-3. 설계안 (화면당 1곳 · 시안 1~7절)

| 화면 | 머리글 오른쪽 | 지우는 곳 |
|---|---|---|
| FEED 글 상세 | [공유][🔔] | 통계 줄 「공유」, 내 글 ⋮ 「공유」 |
| MARKET 상세(구매자·판매자·슬라이드) | [공유][⋮] (슬라이드는 [공유]) | 행동 줄 「공유」·판매자 단독 줄, ⋮ 「공유」 |
| CREW 모임 상세(초대 권한자만) | [공유=초대 링크][⋮] | 초대 시트의 복사·공유 칸 → ⋮ 「친구 초대」(관리 화면 이동)로 |
| 매장·메뉴 상세 | 지금 그대로 | 없음 |
| 모임 글·이벤트·채팅방·메시지·MY·프로필 | 두지 않음 | — (시안 6절 이유) |

누름 동작(공통 1곳 `use-dibay-share-sheet` `openShare`): 운영 주소 + (앱 또는 Web Share) → 기기 공유 창 바로 · 취소 = 아무 것도 안 함 · 실패 = 「공유하지 못했어요」 · 둘 다 없음(데스크톱 웹) → 시트 「링크 복사」 1칸 · 운영 주소 아님 → 아이콘 안 그림. 아이콘 = 매장 머리글 모양, 크기 헤더 SSOT S5.

바뀌는 파일(웹만 · DB·네이티브·통화 0): `components/share/use-dibay-share-sheet.tsx`·`DibayShareSheet.tsx`(복사 전용 모드) · `components/community/post-detail/CommunityPostDetailHeader.tsx`·`CommunityDetail.tsx`·`CommunityPostDetailStatsActions`·`CommunityOwnPostMoreMenu`·`CommunityShareSheet.tsx`(FEED 도 공통 훅으로, 분석 로그 유지) · `components/post/PostDetailView.tsx`·`PostDetailMoreBottomSheet.tsx` · `components/moim/MoimDetailScreen.tsx`·`MoimInviteSheet.tsx` · 계약 시험(화면당 공유 1곳·머리글 위치·기기 공유 창 직접) 갱신.
영향: FEED 분석 이벤트(채널 native/copy 유지) · 머리글 아이콘 수 +1(FEED·MARKET·CREW) · 기존 「공유」 i18n 키 일부 미사용. HS-5 는 메신저 도메인이라 **별도 PR**(색 조건 1줄 + 시험).
검증(배포 후): iOS 시뮬·Samsung 에서 화면별 머리글 공유 1곳·누르면 기기 공유 창·취소·복사, 데스크톱 웹 복사 시트.

### N-4. 계획 대비 진행

| 계획 | 상태 | 근거 |
|---|---|---|
| SH-P0-1·P0-2 (채팅방으로 공유·메시지 링크 복사 끔) | 완료 #270 | 운영 반영 |
| S1 공통 기반 · S2 공통 시트 · S3 도메인(MARKET #274, 매장·메뉴·CREW·MY) · S4 링크 미리보기 | 완료 #273·#274 | MARKET 실기 PASS(L), /post OG 크롤러 PASS(N-1 HS-8 행) · 매장·메뉴·CREW 실기 NOT_PROVEN |
| G-1 앱 공유·/download | 완료 #277 | Android 실기 PASS(L) |
| G-7 초대 랜딩 공개 | 완료 #278 | 응답 PASS · 유효 초대 비회원 화면 NOT_PROVEN |
| S5a 로그인 후 복귀 | 완료 #280 | 실기 NOT_PROVEN |
| S6 글자·스티커 전달 | 완료 #286 | iOS 글자 PASS · 스티커·받는 기기 NOT_PROVEN |
| S6-2 사진·파일 전달 | 완료 #287·#291 | iOS 사진 PASS(전달·DB·원본 삭제 후 유지) · 「Forwarded」 표시 FAIL(HS-5) · 파일 NOT_PROVEN |
| S5b iOS 유니버설 링크 확장 | 안 함 | 네이티브 빌드 필요 |
| S5c Android 앱 링크 확장 | 안 함(BLOCKED) | 통화 규정(G-17) |
| G-2 카카오톡 칸 | 안 함(BLOCKED T-1) → N-0 으로 불필요 제안 | 키 없음 |
| S6 콘텐츠 카드 「친구에게 보내기」(G-15) | 안 함(BLOCKED T-4·T-8) → N-0 결정 필요 | |
| Android 설치 안내 | 안 함(BLOCKED G-13) | Play 404 |
| **새 지시: 머리글 공유·기기 공유 창 직접** | 설계·시안만(이 절) | 구현 승인 대기 |
| S7 통합 검증 행렬 | 대부분 NOT_PROVEN | 실제 iPhone·태블릿·데스크톱 미실행 |

### N-5. Owner 결정 (2026-11-14 PHT)
- 「친구에게 보내기」(S6 콘텐츠 카드·G-15) = **범위에서 뺌.** → 공유는 머리글 1곳 → 기기 공유 창 바로(N-3) 하나로 끝난다. T-4·T-8(묶음 접근 검사·카드 타입 마이그레이션)도 함께 범위 밖. 기존 FEED 서버 경로(`share/internal`·`CommunityShareTargetPicker`)는 지우지 않는다(지시 없음).
- 함께 정리되는 것: G-2 카카오톡 전용 칸은 기기 공유 창에 카카오톡이 나오므로 새 설계에서 두지 않음(N-0 제안 — 별도 지시 없으면 이대로).

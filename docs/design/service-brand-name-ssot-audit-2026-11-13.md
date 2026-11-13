# DIBAY 서비스 명칭 SSOT — 전수 감사·통합 변경 설계 (1차: 감사·설계만)

- 작성: 2026-11-13 (PHT) · 기준 코드: `origin/main` **29c9fbe58** (읽기 전용 worktree, 파일 수정·커밋 없음)
- 운영 DB: `ckdosyydvgzqwpbwuhon` **SELECT 만** (회원 PII 미조회). 테스트 DB(`dibay-test`·`dibay-reset-qa`) 미접근.
- 화면(실기·브라우저) 확인: **하지 않음** → 화면 판정은 전부 NOT_PROVEN.
- Owner 지시 원문 기준: 확정 명칭 HOME · LOUNGE(FEED·MARKET·CREW) · DIPICK · LETARING · MY. 브랜드·메뉴 자리만 영문 대문자, 기능 문구는 한글 유지, 내부 식별자·라우트·DB 이름·과거 기록 불변.

---

## 0. 결론 요약

1. **현재 서비스 이름은 한 곳에서 관리되지 않는다.** 같은 서비스가 사용자 앱·Admin·네이티브·DB 에 서로 다른 키·문자열로 흩어져 있다.
   - MARKET 하나가 「거래 / Trade / Marketplace / Market / 중고거래 / DIBAY MARKET」 6가지로 표기된다.
   - 「커뮤니티 / Community」가 어떤 곳에선 LOUNGE(하단 탭), 어떤 곳에선 FEED(게시글 상세 제목·검색 섹션)를 뜻한다. 영문에서는 정보교환(FEED)도 "Community" 다.
   - LETARING 자리에 「채팅 / Chat / 메신저 / Messenger / SAMessenger / 사마켓 메신저」가 섞여 있다.
2. **사용자 앱 하단 탭은 이미 중앙 키(`nav.*`)를 쓴다** — 내장 탭은 DB 라벨보다 `labelKey` 가 우선(`lib/main-menu/resolve-main-bottom-nav.ts:160`). 운영 DB 에 `admin_settings.main_bottom_nav` 행이 **없음**(조회 확인) → 카탈로그 값이 그대로 화면에 나온다.
3. **Admin 사이드바도 한 트리**(`components/admin/admin-menu.ts`, 라벨 `admin_menu_*`) — 사이드바·상단 탭·브레드크럼이 같은 키를 쓰므로 메뉴를 합치거나 지우지 않고 값만 바꿀 수 있다. 다만 Admin 운영 홈·도메인 대시보드·광고 노출 위치 등 **10여 개 파일이 ko/en 을 코드에 직접** 쓴다(i18n SSOT 위반 상태).
4. **카탈로그 밖 사본**이 있어 카탈로그만 바꾸면 옛 이름이 남는다: 앱 시작 스켈레톤(`lib/startup/startup-cache.ts:36-47`, 생성 HTML 3개), Android 알림 채널 이름(strings.xml), iOS 권한 문구, PWA 설명, 공유 카드 머리말, DB 상품명.
5. **통화 코드에 닿는 브랜드 자리 2곳**(수신 통화 「DiBay 음성/영상 통화」 웹·Android)은 통화 변경 규정·Owner 「통화 지금 손대지 않음」(11-12)에 따라 **이번 범위에서 제외**하고 별도 승인 항목으로 둔다.

---

## ① 전체 용어 감사표 (CHANGE)

판정 기준: 서비스 이름 자체가 메뉴·탭·제목·도메인 칩·검색 안내·채널 이름 자리에 있으면 CHANGE. 「브랜드+기능」 혼합(예: 거래 신고, 모임 목록)은 ④ 의 Owner 결정으로 분리(REVIEW).
위치 표기: 카탈로그 키는 `lib/i18n/catalog/<파일>.ts:ko줄/en줄`.

### A. 사용자 앱 — 공통·HOME·LOUNGE(FEED·MARKET·CREW)

| # | 화면·기능 | 현재 명칭 (ko / en) | 확정 명칭 | 코드 위치 | 사용처 | 사용자/Admin | 판정 |
|---|---|---|---|---|---|---|---|
| A1 | 하단 탭 1 | 홈 / Home | HOME | `nav.home` app-shell-core.ts:25/49 | bottom-nav-config.ts:302,345 → BottomNav.tsx:308 | 사용자 | CHANGE ※ 같은 키를 DIPICK 하단바 「배달 홈」 탭도 씀(delivery-bottom-nav-layout.ts:110, 원문 확인) → ④-P1 |
| A2 | 하단 탭 2 | 커뮤니티 / Community | LOUNGE | `nav.community` app-shell-core.ts:23/47 | bottom-nav-config.ts:301,346 | 사용자 | CHANGE |
| A3 | 하단 탭 fallback 상수 | "Community" | LOUNGE | bottom-nav-config.ts:346, 374 | labelKey 없을 때·Admin 기본값 | 사용자/Admin | CHANGE |
| A4 | LOUNGE 전환 탭 ① + FEED 허브 1단 제목 | 정보교환 / Community | FEED | `nav_community_switch_info` navigation.ts:4/369 | CommunityTradeTitleSwitch.tsx:24, RegionBarMainHubTier1.tsx:107 | 사용자 | CHANGE |
| A5 | LOUNGE 전환 탭 ② + MARKET 허브 1단 제목 | 거래 / Trade | MARKET | `nav_bottom_trade` navigation.ts:3/368 | CommunityTradeTitleSwitch.tsx:29, RegionBarMainHubTier1.tsx:79,107 | 사용자 | CHANGE |
| A6 | LOUNGE 전환 탭 ③ | 모임 / Groups | CREW | `moim_tab` moim-core.ts:9/203 | CommunityTradeTitleSwitch.tsx:35 | 사용자 | CHANGE |
| A7 | CREW 허브·하위 1단 제목 | 모임 / Groups | CREW | `tier1_moim` moim-core.ts:8/202 | RegionBarMainHubTier1.tsx:77, resolve-main-tier1.ts:642,645 | 사용자 | CHANGE |
| A8 | HOME 서비스 카드 | 거래 / Trade | MARKET | `home_menu_trade` home-hub.ts:7/72 | home-layout-contract.ts:85 → HomeServiceCards.tsx:72 | 사용자 | CHANGE |
| A9 | HOME 서비스 카드 | 정보교환 / Community | FEED | `home_menu_philife` home-hub.ts:9/74 | home-layout-contract.ts:89 | 사용자 | CHANGE |
| A10 | HOME 서비스 카드 | 배달 / Delivery | DIPICK | `home_menu_stores` home-hub.ts:8/73 | home-layout-contract.ts:86 | 사용자 | CHANGE |
| A11 | HOME 서비스 카드 | 채팅 / Chat | LETARING | `home_menu_chat` home-hub.ts:10/75 | home-layout-contract.ts:96 | 사용자 | CHANGE |
| A12 | 게시글 상세 1단 기본 제목 | 커뮤니티 / Community | FEED | `tier1_community` navigation.ts:353/717 | resolve-main-tier1.ts:904 | 사용자 | CHANGE |
| A13 | 게시글 상세 헤더 fallback | 커뮤니티 / Community | FEED | `community_community_label` community-ui.ts:124/427 | CommunityDetail.tsx:156, CommunityPostDetailHeader.tsx:70 | 사용자 | CHANGE |
| A14 | 거래글 상세 1단 기본 제목 | 거래 / Trade | MARKET | `tier1_trade` navigation.ts:352/716 | resolve-main-tier1.ts:887 | 사용자 | CHANGE |
| A15 | 거래글 상세 헤더 fallback | 거래 / Trade | MARKET | `trade_detail_header_fallback` trade.ts:300/735 | PostDetailView.tsx:498 | 사용자 | CHANGE |
| A16 | 판매 허브 부제 | DIBAY MARKET | MARKET | `marketplace_sell_hub_subtitle` trade.ts:158/595 | MarketplaceSellHubPage.tsx:267, resolve-main-tier1.ts:459 | 사용자 | CHANGE |
| A17 | MARKET 검색 placeholder·aria | 거래에서 물품 검색 / Search items in Marketplace | MARKET에서 물품 검색 / Search items in MARKET | `trade_search_placeholder` trade.ts:264/699 | TradeSearchPage.tsx:88, RegionBarMainHubTier1.tsx:200 | 사용자 | CHANGE |
| A18 | MARKET 검색 sr-only | DIBAY MARKET에서 검색 | MARKET에서 검색 | `marketplace_search_entry_aria` trade.ts:145/583 | MarketplaceHomeEntryChrome.tsx:23 | 사용자 | CHANGE |
| A19 | 통합 검색 placeholder | 커뮤니티, 거래, 배달, 채팅 검색 | FEED, MARKET, DIPICK, LETARING 검색 (LOUNGE 표기 여부 ④-L3) | `global_search_placeholder` common.ts:159/334 | SearchInputBar.tsx:50, GlobalSearchView.tsx:135 | 사용자 | CHANGE |
| A20 | 통합 검색 섹션 제목 | 커뮤니티 / Community | FEED | `global_search_section_community` common.ts:165/340 | GlobalSearchView.tsx:605 | 사용자 | CHANGE |
| A21 | 통합 검색 섹션 제목 | 중고거래 / Marketplace | MARKET | `global_search_section_trade` common.ts:166/341 | GlobalSearchView.tsx:639 | 사용자 | CHANGE |
| A22 | 통합 검색 더 보기 | 거래에서 더 보기 | MARKET에서 더 보기 | `global_search_trade_more` common.ts:167/342 | GlobalSearchView.tsx:679 | 사용자 | CHANGE |
| A23 | 앱 시작 스켈레톤 하단 탭 (카탈로그 밖) | 홈·커뮤니티·배달·채팅·**마이** | HOME·LOUNGE·DIPICK·LETARING·MY | lib/startup/startup-cache.ts:37-47 (원문 확인 — ko 「마이」는 지금도 「내정보」와 불일치) | local-runtime-markup.ts → 생성 HTML | 사용자(네이티브 첫 프레임) | CHANGE |
| A24 | 번들 시작 HTML (생성물) | 같음 | 같음 | android/…/assets/local-runtime/index.html:34, ios/…/public/local-runtime/index.html:34, capacitor-www/local-runtime/index.html:34 | `scripts/build-local-runtime.mjs` 재생성 | 사용자(네이티브) | CHANGE (손수정 금지·재생성, **네이티브 반영 = 앱 재빌드 필요**) |

### B. 사용자 앱 — DIPICK·LETARING·MY

| # | 화면·기능 | 현재 (ko / en) | 확정 | 코드 위치 | 사용처 | 사용자/Admin | 판정 |
|---|---|---|---|---|---|---|---|
| B1 | 하단 탭 3 | 배달 / Food | DIPICK | `nav.delivery` app-shell-core.ts:24/48 | bottom-nav-config.ts:303,347, MainDesktopSideNav.tsx:45 | 사용자 | CHANGE |
| B2 | 하단 탭 4 | 채팅 / Chat | LETARING | `nav.chat` app-shell-core.ts:22/46 | bottom-nav-config.ts:304,352 | 사용자 | CHANGE |
| B3 | 하단 탭 5 (+ DIPICK 하단바 MY) | 내정보 / My | MY | `nav.my` app-shell-core.ts:26/50 | bottom-nav-config.ts:355, delivery-bottom-nav-layout.ts:124 | 사용자 | CHANGE |
| B4 | 하단 탭 fallback 상수 | Food / Chat / My | DIPICK / LETARING / MY | bottom-nav-config.ts:347,351,355 | labelKey 없을 때 | 사용자 | CHANGE |
| B5 | /stores/browse 1단 제목 | 배달 / Delivery | DIPICK | `navigation_delivery` navigation.ts:16/381 | resolve-main-tier1.ts:272, StoresBrowseHeaderChrome.tsx:92 | 사용자 | CHANGE |
| B6 | /stores 메타 제목 | 매장 / Stores | DIPICK | `store_feed_stores_title` store-commerce-ui.ts:95/1881 | app/(main)/stores/page.tsx:17 | 사용자 | CHANGE (**새 키 분리** — 같은 키를 피드 섹션 제목 「매장」이 씀, 그쪽은 KEEP) |
| B7 | DIPICK FAB 「배달 홈」 | 배달 홈 / Delivery home | DIPICK | `store_delivery_fab_home` store-commerce-ui.ts:1064/2849 | main-bottom-nav-fab-i18n.ts:19 | 사용자 | CHANGE |
| B8 | 메신저 1단 제목 (첫 프레임) | 메신저 / Messenger | LETARING | `tier1_messenger` navigation.ts:296/660 | resolve-main-tier1.ts:545 | 사용자 | CHANGE ※ 하이드레이션 뒤 구역 라벨로 덮임(④-T1) |
| B9 | FEED 헤더에서 연 메신저 제목 | 메신저 / Messenger | LETARING | `nav_bottom_messenger` navigation.ts:7/372 | CommunityMessengerHome.tsx:3446 | 사용자 | CHANGE |
| B10 | FEED 헤더 메신저 버튼 aria | 메신저 | LETARING | `philife_messenger_aria` philife.ts:25/131 | PhilifeMessengerFromHeaderStack.tsx:133 | 사용자 | CHANGE |
| B11 | 거래채팅 버튼 (옛 브랜드) | SAMessenger에서 이 거래 열기 | LETARING에서 이 거래 열기 | `nav_messenger_open_product_trade` navigation.ts:103/468 | ChatDetailView.tsx:2185 | 사용자 | CHANGE |
| B12 | 메신저 거래 빈 상태 (위 버튼명 인용) | …SAMessenger… | 위와 맞춤 | `cm_ia_empty_trade` messenger-ia.ts:43/103 | messenger-ia-i18n.ts:86 | 사용자 | CHANGE |
| B13 | MY 1단 제목 | 내정보 / My Page | MY | `tier1_myinfo` navigation.ts:295/659 | resolve-main-tier1.ts:499,861 | 사용자 | CHANGE |
| B14 | /my 헤더 제목 | 내정보 / My page | MY | `mypage_comp_myinfo_header_title_default` mypage-components.ts:41/846 | MyPageHeader.tsx:22 | 사용자 | CHANGE |
| B15 | MY CTA | 내정보 | MY | `my_cta_account_home` my-managed-cta-labels.ts:17/38 | managed-my-section-ctas-i18n.ts:57 | 사용자 | CHANGE |
| B16 | 판매 허브 MY 링크 | 내정보 | MY | `nav_bottom_my` navigation.ts:13/378 | MarketplaceSellHubPage.tsx:196 | 사용자 | CHANGE |
| B17 | 매장 오너 사이드바 | ← 내 정보(홈) | ← MY | `store_owner_my_home_link` store-commerce-ui.ts:1586/3374 | owner-nav-registry.ts:535 | 사용자(오너) | CHANGE |
| B18 | 메시지 카드 공유 머리말 (카탈로그 밖·옛 이름) | [사마켓 메신저 · 메시지 카드] | [LETARING · 메시지 카드] | lib/community-messenger/message-actions/message-internal-share-card.ts:45 | 클립보드 공유 | 사용자 | CHANGE |

### C. 알림·네이티브·PWA

| # | 출처 | 현재 | 확정 | 위치 | 사용자/Admin | 판정 |
|---|---|---|---|---|---|---|
| C1 | 알림함 분야 탭 | 거래 / Trade | MARKET | `notif_filter_trade` my.ts:148/618 | 사용자 | CHANGE |
| C2 | 알림함 분야 탭 | 커뮤니티 / Community | LOUNGE | `notif_filter_community` my.ts:150/620 | 사용자 | CHANGE |
| C3 | 알림함 분야 탭 | 주문·배달 | DIPICK | `notif_filter_delivery` my.ts:192/662 | 사용자 | CHANGE |
| C4 | 알림함 분야 탭 | 채팅 / Chat | LETARING | `notif_filter_chat` my.ts:149/619 | 사용자 | CHANGE |
| C5 | 알림 카드 출처 배지 | 커뮤니티 | LOUNGE (FEED 여부 ④-L1) | `notif_surface_community` notifications.ts:104/439 | 사용자 | CHANGE |
| C6 | 알림 카드 출처 배지 | 채팅 (fallback) | LETARING | notifications.ts:89/424 | 사용자 | CHANGE |
| C7 | 메신저 배너 제목 (현재 사용처 0) | 메신저 | LETARING | `notify_messenger_banner_title` notifications.ts:9/344 | 사용자 | CHANGE (값만 정합) |
| C8 | 알림 설정 그룹 머리글 | 거래 / Trade | MARKET | `mypage_s11_group_trade` mypage-hub.ts:195/450 | 사용자 | CHANGE |
| C9 | 알림 설정 그룹 머리글 | 커뮤니티 / Community | LOUNGE | `mypage_s11_group_community` mypage-hub.ts:192/447 | 사용자 | CHANGE |
| C10 | Android 알림 채널 이름 (ko·en) | 채팅 메시지 / Chat messages | LETARING 메시지 | values-ko/strings.xml:76-77, values/strings.xml:88-89 | 사용자(OS 설정) | CHANGE (채널 ID 불변, 이름만) — **네이티브** |
| C11 | Android 알림 채널 이름 | 거래 알림 / Trades | MARKET 알림 | values-ko:78-79, values:90-91 | 사용자(OS) | CHANGE — 네이티브 |
| C12 | Android 알림 채널 이름 | 배달 알림 / Delivery | DIPICK 알림 | values-ko:82-83, values:94-95 | 사용자(OS) | CHANGE — 네이티브 |
| C13 | Android 알림 채널 이름 | 커뮤니티 알림 / Community | LOUNGE 알림 | values-ko:84-85, values:96-97 | 사용자(OS) | CHANGE — 네이티브 |
| C14 | PWA 설명 | 중고거래·커뮤니티·스토어·메신저 | MARKET·LOUNGE·DIPICK·LETARING | lib/pwa/dibay-web-app-manifest.ts:25 | 사용자 | CHANGE |

### D. 관리자(Admin)

| # | 관리 화면·메뉴 | 현재 (ko / en) | 확정 | 위치 (AMS = admin-member-shared.ts) | 사용처 | 판정 |
|---|---|---|---|---|---|---|
| D1 | 워크스페이스 | 배달·매장 / Delivery & stores | DIPICK | `admin_menu_delivery` AMS:927/3048 + 계약 고정 ko 리터럴 lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts:274 | admin-menu.ts:573 | CHANGE |
| D2 | 워크스페이스 | 거래 / Trade | MARKET | `admin_menu_trade` AMS:905/3026 | admin-menu.ts:860 | CHANGE |
| D3 | 워크스페이스 | 커뮤니티 / Community | LOUNGE | `admin_menu_community` AMS:913/3034 | admin-menu.ts:1013 | CHANGE |
| D4 | 워크스페이스 | 채팅 / Chat | LETARING | `admin_menu_messenger` AMS:898/3019 | admin-menu.ts:1220 | CHANGE |
| D5 | 커뮤니티 › 모임 섹션 | 모임 / Groups | CREW | `admin_menu_community_section_moim` AMS:1613/3731 | admin-menu.ts:1066 | CHANGE |
| D6 | 대시보드 메뉴 4종 | 배달·거래·커뮤니티·채팅 대시보드 (en Messenger dashboard 불일치) | DIPICK·MARKET·LOUNGE·LETARING 대시보드 | `admin_menu_delivery_dashboard` AMS:928, `admin_menu_trade_hub` :1641, `admin_community_home_title` :1610, `admin_menu_messenger_hub` :929 | admin-menu.ts:576,867,1021,1223 | CHANGE |
| D7 | 대시보드 페이지 제목 4종 | 같음 | 같음 | `admin_community_dash_title`·`admin_trade_dash_title` copy-admin-b4-community.ts:168,291; load-{delivery,messenger}-domain-dashboard.ts:79-80 / 123-124 (**코드 직접 ko/en**) | 각 대시보드 | CHANGE |
| D8 | 배달 화면 구성 | 배달 화면 구성 | DIPICK 화면 구성 | `admin_menu_delivery_screens` AMS:1538/3656 | admin-menu.ts:751 | CHANGE |
| D9 | 광고 운영 목록 | 배달 광고 운영 목록 | DIPICK 광고 운영 목록 | `admin_menu_delivery_ads_ops` ads-impl-1107-r1.ts:153/318 | admin-menu.ts:740,1593 | CHANGE |
| D10 | 광고 › 상위노출 신청 | 거래 상위노출 신청 | MARKET 상위노출 신청 | `admin_menu_ads_applications` AMS:988/3109 | admin-menu.ts:1614 | CHANGE |
| D11 | 광고 › 게시물 상위노출 | 커뮤니티 게시물 상위노출 | FEED 게시물 상위노출 | `admin_menu_ads_community_promote` ads-impl-1107-w3.ts:19/47 | admin-menu.ts:1620 | CHANGE |
| D12 | 카테고리·분류 3종 | 거래 카테고리 / 커뮤니티 카테고리 / 배달 업종 | MARKET 카테고리 / FEED 카테고리 / DIPICK 업종 | AMS:1559-1561/3677-3679 | admin-menu.ts:1818,1825,1832 | CHANGE |
| D13 | 채팅방 › 거래 칩 | 거래 / Trade | MARKET | `admin_menu_chat_rooms_trade` AMS:1580/3698 | admin-menu.ts:1251 | CHANGE |
| D14 | 운영 홈 도메인 탭·지표 띠·추이·바로가기 (코드 직접 ko/en) | 커뮤니티·거래 / 채팅 / 배달·매장 … | LOUNGE·MARKET / LETARING / DIPICK | lib/admin/metrics/registry.ts:778-791, 900-901, 954-955, 1020-1023, 1055-1058, 1082-1085, 1097, 1108-1111, 1127, 1172 | AdminDashboardPage.tsx | CHANGE |
| D15 | 도메인 상태 카드 (코드 직접) | 배달 운영·거래 운영·커뮤니티 운영·채팅(메신저) | DIPICK·MARKET·LOUNGE·LETARING | components/admin/dashboard/AdminActionCenter.tsx:141-180 | 운영 홈 | CHANGE |
| D16 | 처리 대기 카드 도메인 배지 (코드 직접) | 배달·거래·커뮤니티·채팅 | DIPICK·MARKET·LOUNGE·LETARING | lib/admin/admin-action-queue-registry.ts:92,111,202,220,257,276,312 | AdminActionQueueCardGrid.tsx:63 | CHANGE |
| D17 | 공통 도메인 셀렉트 | 거래 / 커뮤니티 / 배달 | MARKET / LOUNGE / DIPICK | `admin_list_query_trade`·`_community` copy-admin-b4-core.ts:84-85; `common_delivery` common.ts:23 (Admin 4곳만 사용) | admin-domain-scope.ts:27-31 | CHANGE |
| D18 | 광고 도메인 칩·셀렉트 | 커뮤니티·거래 | LOUNGE(FEED ④-L1)·MARKET | `admin_ads_community`·`_trade` copy-admin-b4-ads.ts:44-45, `_2` :127-128; `admin_ads_operator_domain_*` copy-admin-l25-lib.ts:102-104 | 광고 이력·노출 위치·상위노출 화면 | CHANGE |
| D19 | 광고 노출 위치 정식 이름 (노출 위치 이름 SSOT) | 배달 > 홈 > 상단 배너 등 | 앞머리 DIPICK / MARKET / LOUNGE / MY | copy-admin.ts:415-435/1218-1238 | human-placement-label.ts | CHANGE |
| D20 | 노출 위치 지도 | 거래 홈 · 피드 배너 등, 도메인 칩 `{ko:"배달"}` (코드 직접) | 앞머리 변경 | copy-admin.ts:789-799; AdminPlacementMapPanel.tsx:36,43,47,48 | 노출 위치 지도 | CHANGE |
| D21 | 배너 현황 도메인·위치 | 거래 / 커뮤니티 / 배달 | MARKET / LOUNGE / DIPICK | admin-ia-r1.ts:45-47/89-91; copy-admin-l25-lib.ts:109-120 | AdminBannersOverviewPage.tsx | CHANGE |
| D22 | 팝업 노출 위치 | 커뮤니티 / 거래 / 배달 / 배달 오너 / 마이페이지 | LOUNGE / MARKET / DIPICK / DIPICK 오너 / MY | AMS:2003-2008/4121-4126 | promotion-ownership-visibility.ts:246 | CHANGE |
| D23 | 광고 상품 카드 도메인 (코드 직접) | 커뮤니티 / 거래 / 배달 | LOUNGE / MARKET / DIPICK | lib/admin/ads-commercial/products-control-model.ts:234,282,330,369,425,481 | AdminAdsProductsCommercialView.tsx | CHANGE |
| D24 | 신고 도메인 필터 (ko 자리에 영문·테이블명) | Trade · reports 테이블 / Community · community_reports | MARKET / LOUNGE | admin.ts:184-185/2440-2441 | AdminReportFilterBar.tsx:75 | CHANGE |
| D25 | 거래 신고 범위 칩 | 커뮤니티 | LOUNGE | copy-admin-l25-trade.ts:299 | TradeReportsPage.tsx:748 | CHANGE |
| D26 | 채팅 신고 출처 | 메신저 / Messenger | LETARING | admin-chat-r1-pages.ts:52/253 | AdminChatReportQueuePage.tsx:60 | CHANGE |
| D27 | 채팅 상세 도메인 링크 | 메신저 1:1 / 메신저 그룹 / 배달·매장 주문 채팅 | LETARING 1:1 / LETARING 그룹 / DIPICK 주문 채팅 | admin-chat-r1-data.ts:35-36; AMS:493 | AdminCmRoomDomainLinksCard.tsx:24 | CHANGE |
| D28 | 메신저 방 상세 제목 | 메신저 방 상세 | LETARING 방 상세 | admin-community-messenger.ts:78/317 | AdminCommunityMessengerDetailPage.tsx:342 | CHANGE |
| D29 | 주문 채팅 링크 | 커뮤니티 메신저 운영 | LETARING 운영 | copy-admin-b4-orders.ts:12/356 | app/admin/order-chats/page.tsx:60 | CHANGE |
| D30 | 회원 상세·개요 탭 | 커뮤니티 / 거래 / 배달·주문 / 채팅·그룹 | LOUNGE / MARKET / DIPICK / LETARING | AMS:680-683; admin.ts:803-807 | member-detail-presentation.ts:214, AdminMemberOverviewPanel.tsx:297 | CHANGE |
| D31 | 앱 첫 진입 화면 대상 | 홈 / 커뮤니티 / 거래 / 배달/푸드 / 채팅 / 마이 | HOME / LOUNGE / MARKET / DIPICK / LETARING / MY | admin-settings.ts:404-408/828-832 | StartupConfigAdminPage.tsx:150 | CHANGE |
| D32 | 알림 캠페인 이동 화면 프리셋 (코드 직접) | 홈 / 중고거래 / 배달·매장 / Philife / 마이페이지 | HOME / MARKET / DIPICK / FEED / MY | lib/admin/notification-campaigns/campaign-create-form.ts:120-124 | 캠페인 작성 폼 | CHANGE |
| D33 | 데이터 초기화 도메인 (코드 직접) | 커뮤니티 / 거래(en Market) / 배달/매장 / 채팅 | LOUNGE / MARKET / DIPICK / LETARING | lib/admin/data-reset/summary.ts:30,39,48,57 | AdminDataResetPage | CHANGE |

### E. 운영 DB 화면 노출 값 (조회 결과 · 쓰기 없음)

| # | 테이블.컬럼 | 현재 값 | 확정 | 노출 확인 | 판정 |
|---|---|---|---|---|---|
| E1 | `admin_settings` key `main_bottom_nav` | **행 없음** | — | 코드 기본값 사용 | 변경 불필요 |
| E2 | `admin_settings.home_layout` 섹션 title | 8개 모두 빈 값 → 카탈로그 사용 | — | — | 변경 불필요 |
| E3 | `home_layout` 배너 3개 제목·본문 | 교민끼리 무료 채팅·영상통화 / 중고거래·일자리, 한곳에서 / 필리핀 맛집 배달, 디바이로 | — | Owner 등록 배너(광고 문안) | **KEEP**(기능 설명 문안). 브랜드 넣을지는 Owner 가 Admin 에서 직접 |
| E4 | `ad_products.name` 3행 | 필라이프 상단고정 3일/7일, 필라이프 중간삽입 5일 | FEED 상단고정 … | 회원 노출 여부 NOT_PROVEN | CHANGE (운영 DB 쓰기 = Owner 별도 승인) |
| E5 | `feed_ad_products.title_ko/en` 2행 | 커뮤니티 피드 광고 3일/7일 / Community feed ad … | FEED 광고 … | NOT_PROVEN | REVIEW(④-L1) |
| E6 | `community_sections.name` / `boards.name` / `services.name` | 동네생활(각 1), dibaY | — | 회원 화면 사용처 못 찾음 | REVIEW(④-L4) |
| E7 | `my_page_sections.title` | 거래 / 매장·주문 | MARKET / DIPICK? | 코드 기본값 lib/my/my-page-defaults.ts:15 과 같은 값 | REVIEW(④-M2) |
| E8 | `delivery_bottom_nav_items.label` 5행 | 홈·내매장·내주문·장바구니·내정보 | — | 소비 화면 없는 레거시(에이전트 확인, 본인 미검증) | REVIEW |
| E9 | `ad_products.name` 4행 (거래 …광고), `platform_ads`(무료배달), `store_composition_policy_overrides`(배달팁 할인), `categories`(중고거래·환전거래…), `community_topics`(맛집 등), `store_categories` | 기능·카테고리 이름 | — | — | KEEP |
| E10 | `app_notices`(39행 중 1행 「[시험] 배달 오픈 일정 안내」), `admin_notification_campaigns`(154행, 매칭 0), `notifications`·`notification_events`·`point_ledger`·게시글·채팅 | 과거 발송·기록 | — | — | HISTORICAL |

---

## ② 변경 대상 총계 (실제 센 값만)

**측정 범위와 한계**
- CHANGE 수는 위 ① 표의 행 수다(1행 = 1 키 또는 1 위치 묶음, ko·en 은 1행).
- KEEP·INTERNAL 은 영역별 grep 수다. 검색어·방법이 영역마다 달라 **단순 합산하지 않는다**. 여러 줄 문자열 값은 누락돼 있다.
- 「전체 조사 대상 수」를 한 숫자로 내지 않는다 — 카탈로그 값 기준 원검색 건수만 아래에 적는다.

| 구분 | 값 | 근거 |
|---|---|---|
| 카탈로그 원검색 건수 (195개 파일, 값 줄) | 커뮤니티 270 · 거래 711 · 모임 266 · 배달 624 · 채팅 601 · 메신저 102 · 피드 187 · Community 195 · Trade 316 · Delivery 338 · Chat 151 · Messenger 65 · Group 126 · Feed 71 · Meetup 19 · Market 19 · 중고거래 8 · Food 7 · 정보교환 3 · Philife 3 · 필라이프 1 · 정보방·사고팔기 0 | 단어별 독립 검색, 한 줄이 여러 단어에 중복 집계됨 |
| **CHANGE (코드)** | **89행** (사용자 앱 A 24 · B 18 · 알림·네이티브·PWA C 14 · Admin D 33) | ① 표 행 수 |
| **CHANGE (운영 DB)** | 1건 = `ad_products` 3행 (E4) | 운영 DB 조회 |
| **REVIEW** | Owner 결정 20개 묶음(④ L1-4·P1-4·T1-3·M1-3·N1-6) + DB 4건(E5-E8) | ④ |
| KEEP (사용자 LOUNGE 영역 카탈로그) | 약 330 (navigation 71·trade 52·moim-core 67·moim-screens 91·moim-manage 37·기타 44 …) | 에이전트 1 표, ±1~2 |
| KEEP (DIPICK·LETARING·MY 카탈로그) | 약 640 (community-messenger-ui 186·store-commerce-ui 135·navigation 55·mypage-components 50 …) | 에이전트 2 표 |
| KEEP (Admin 카탈로그) | admin-member-shared 172 hit 중 표 외 약 110, admin.ts 127 중 약 115 … | 에이전트 3 표 |
| INTERNAL | 사용처 0 키: LOUNGE 영역 30, DIPICK·LETARING·MY 영역 약 270, Admin 주석·도구 약 273 줄; 코드 식별자·라우트·주석 다수 | 각 에이전트 |
| HISTORICAL | DB 기록성 테이블 (E10) — 행 단위 치환 대상 아님 | 운영 DB 조회 |
| 플랫폼 영향 | Web(전부) · Android(C10-C13 strings.xml, A24 번들 HTML) · iOS(A24 번들 HTML, 권한 문구 ④-N2) · Windows/태블릿(웹과 동일 코드) | |
| Admin 영향 | D1~D33 (메뉴 트리 키 + 코드 직접 ko/en 10개 파일) | |
| DB 저장 문구 영향 | CHANGE 1건(E4, 3행) · REVIEW 4건 · 변경 불필요 2건 | 운영 DB SELECT |


---

## ③ SSOT 구현 설계

### 3-1. 기존 명칭 관리 구조
- 화면 문구는 `lib/i18n/catalog/*.ts`(ko·en 동시)가 SSOT(`docs/i18n-ssot.md`). 카탈로그 파일은 **TS 모듈**이고 `lib/i18n/messages.ts` 가 import 해 합친다. `translate(key, vars)` 는 `{name}` 치환을 지원한다(messages.ts:436-456 확인).
- 하단 탭: `BUILTIN_BOTTOM_NAV_LABEL_KEYS`(bottom-nav-config.ts:300) → `nav.*`. 내장 탭은 DB 라벨 무시.
- Admin 메뉴: `components/admin/admin-menu.ts` → `admin_menu_*`.
- 용어 검사: `lib/i18n/glossary.ts` + `check:i18n-quality` (브랜드 항목 없음).

### 3-2. 중복 정의 위치 (같은 서비스 이름이 여러 곳)
- MARKET: `nav_bottom_trade`, `nav.trade`, `header.trade`, `trade.title`, `navigation_market`, `tier1_trade`, `home_menu_trade`, `trade_detail_header_fallback`, `global_search_section_trade`, `marketplace_*`, `admin_menu_trade`, `admin_trade`, `admin_list_query_trade`, `admin_ads_trade(_2)`, registry.ts 직접 문자열 …
- LOUNGE/FEED: `nav.community`, `nav_community_switch_info`, `tier1_community`, `community_community_label`, `home_menu_philife`, `global_search_section_community`, `admin_menu_community`, `admin_ads_community(_2)` …
- 카탈로그 밖 사본: startup-cache.ts, bottom-nav-config.ts `label`, strings.xml, manifest, Admin 코드 직접 ko/en 10개 파일.

### 3-3. 중앙 관리 방식 (새 체계 만들지 않음 — i18n 카탈로그 안에서 해결)
1. **브랜드 상수 1곳**: `lib/i18n/catalog/service-brand.ts` 에 8개 상수만 둔다.
   ```ts
   export const DIBAY_SERVICE_BRAND = {
     HOME: "HOME", LOUNGE: "LOUNGE", FEED: "FEED", MARKET: "MARKET",
     CREW: "CREW", DIPICK: "DIPICK", LETARING: "LETARING", MY: "MY",
   } as const;
   ```
   ko·en 값이 같으므로(Owner 표기 규칙 1) 언어별 분기 없음.
2. **카탈로그 값이 상수를 참조**: 기존 키 이름은 그대로 두고 값만 바꾼다.
   `"nav.community": DIBAY_SERVICE_BRAND.LOUNGE`, `admin_menu_trade_hub: \`${DIBAY_SERVICE_BRAND.MARKET} 대시보드\``.
   → 호출처·키·라우트 변경 0, 이름을 다시 바꾸면 상수 1줄.
3. **Admin 코드 직접 ko/en 10개 파일**은 같은 PR 에서 카탈로그 키로 옮긴다(옮기지 않으면 상수를 import 해 같은 값을 쓰게 한다 — 키 이전은 i18n SSOT 상 필수라 이전을 기본으로 한다).
4. **공유 키 분리**(값을 바꾸면 기능 문구까지 바뀌는 키):
   - `nav.home`: DIPICK 하단바 「배달 홈」 탭용 새 키로 분리(④-P1 결정에 따름).
   - `store_feed_stores_title`: /stores 메타 제목용 새 키.
   - `admin_trade`·`admin_delivery`·`common_delivery`: 도메인 칩용 새 키로 분리, 기존 키는 기능 문구로 유지.
5. **카탈로그 밖 사본은 생성·검사로 묶는다**:
   - `startup-cache.ts` 의 `labelKo/labelEn` 을 상수 참조로 → `scripts/build-local-runtime.mjs` 로 HTML 3개 재생성.
   - Android `strings.xml` 채널 이름: 상수를 읽을 수 없으므로 **검사 스크립트**(`verify:service-brand-ssot`, CI 포함)로 strings.xml·manifest·startup-cache 값이 상수와 같은지 확인.
   - 같은 검사에 「옛 브랜드 금지 목록」(SAMessenger, 사마켓 메신저, DIBAY MARKET, Philife/필라이프 표시값) 추가.
6. **용어집**: `glossary.ts` 에 브랜드 항목 추가(FEED 자리에 Community 금지 등). `myinfo` 항목은 「하단 탭·제목 = MY」로 갱신.

### 3-4. 파일별 변경 계획 (승인 후 단계별, 각 단계 끝에 화면이 깨지지 않게)

| 단계 | 내용 | 파일 | 배포 구분 |
|---|---|---|---|
| S1 | 브랜드 상수 + 사용자 앱 카탈로그 값(A1-A22, B1-B17, C1-C9) + 공유 키 분리 + bottom-nav fallback 상수 + B18·C14 | service-brand.ts(신규), app-shell-core·navigation·moim-core·home-hub·common·trade·community-ui·philife·store-commerce-ui·messenger-ia·mypage-components·my-managed-cta-labels·my·mypage-hub·notifications.ts, bottom-nav-config.ts, delivery-bottom-nav-layout.ts, message-internal-share-card.ts, dibay-web-app-manifest.ts | 웹 |
| S2 | Admin(D1-D33): 카탈로그 값 + 코드 직접 ko/en 10개 파일 키 이전 + 계약 고정 파일·대시보드 마크업 테스트 갱신 | admin-member-shared·copy-admin*·admin*.ts, registry.ts, admin-action-queue-registry.ts, AdminActionCenter.tsx, load-*-domain-dashboard.ts, AdminPlacementMapPanel.tsx, campaign-create-form.ts, products-control-model.ts, data-reset/summary.ts, …hard-lock.ts:274 | 웹 |
| S3 | 시작 스켈레톤(A23) + 번들 HTML 재생성(A24) + Android 채널 이름(C10-C13) + 검사 스크립트·용어집 | startup-cache.ts, local-runtime 3개, strings.xml 2개, DibayNotificationChannelLabelsTest.java, glossary.ts, scripts/verify-service-brand-ssot | **네이티브** (앱 재빌드 필요, 빌드는 Owner 일괄) |
| S4 | 운영 DB(E4 등) | `ad_products.name` 3행 | **운영 DB 쓰기 — Owner 별도 승인** |

S1·S2 는 한 작업이므로 PR 1개(같은 지시·같은 원인). S3 네이티브는 같은 PR 에 넣되 빌드 번호는 빌드 시점에. 통화 브랜드(④-T2)는 어느 단계에도 넣지 않는다.

### 3-5. 테스트 계획
- 코드: `typecheck:build`, 변경 관련 vitest(하단 탭·resolve-main-tier1·i18n-quality·admin 대시보드 마크업·marketplace-ui-1-home-chrome `toBe("DIBAY MARKET")` 등 기대값 갱신), `check:i18n-quality`, 신규 `verify:service-brand-ssot`, 변경 파일 eslint, `typecheck:test`, `test:ci`.
- e2e 기대값 갱신: tests/e2e/stores-bottom-nav.spec.ts:124, member-feed-ad-banner-ui.spec.ts:245-251·519·631, revenue-final-regression-gate.spec.ts:181. `I18N_E2E_NAV_KEYS` 는 ko=en 이 되므로 「언어 전환 시 하단 탭 문구 변화」 검증은 의미가 사라짐 → 다른 키로 대체.
- 화면(코드 PASS 와 별도, 각각 증거 첨부): Android(Samsung) 세로·iOS 시뮬 세로·태블릿/Windows 가로 · 360px 폭 하단 탭 5개·6개(오너 허브) 에서 LETARING 잘림 · LOUNGE 3단 전환 탭(FEED·MARKET·CREW) 폭 · MARKET 허브 1단 「MARKET · 동네⌄」 · Admin 사이드바·운영 홈 · ko/en 각각 · 로그인 Owner 계정 기준.

### 3-6. 회귀 위험
| 위험 | 원인 | 대응 |
|---|---|---|
| 하단 탭 잘림 | 11px·ellipsis, 탭 6개 시 10.5px(app-bottom-nav.css:278-310). LETARING 8자 대문자 | 360px·6탭 실측. 잘리면 탭 라벨 전용 자간·폭 조정(S1 안에서) |
| 1단 허브 제목 폭 | 「거래」→「MARKET」 약 2배, 동네 라벨 축소 | 실측 후 동일 단계에서 처리 |
| DIPICK 하단바에 HOME 표시 | `nav.home` 공유 | 키 분리(④-P1) |
| 메신저 제목이 LETARING 으로 안 보임 | 하이드레이션 후 구역 라벨로 덮음(use-community-messenger-home-shell-effects.tsx:348) | ④-T1 결정 전에는 동작 변경 안 함 |
| Admin 계약 고정 테스트 실패 | hard-lock.ts:274·대시보드 마크업 테스트가 「배달·매장」 고정 | 같은 단계에서 갱신 |
| Android 채널 이름 | 이미 설치된 앱은 새 빌드 설치 전까지 옛 이름 유지. 채널 ID 불변이라 알림 설정·소리 영향 없음(ID 변경 금지) | 빌드 시 확인 |
| i18n 검사 | ko 값이 영문 대문자 → 현 규칙상 위반 아님(에이전트 확인). 파일별 개수 증가 규칙 영향 확인 필요 | 로컬 1회 실행 |
| 기능 회귀 | 문구만 바꾸고 키·라우트·DB·이벤트 키 불변. 통화·인증·결제·푸시 발송 로직 무변경 | 푸시는 카탈로그 제목만 영향(C1-C9 은 화면 탭) |

### 3-7. 롤백
- 웹(S1·S2): 문구만 바뀌므로 Vercel Instant Rollback 으로 즉시 복구 → 원인 수정 PR. 상수 1곳이라 되돌림 PR 도 작음.
- 네이티브(S3): 설치된 빌드 기준이라 이전 빌드 재설치. 채널 ID 미변경이라 데이터 영향 없음.
- DB(S4): 변경 전 값 백업(3행) 후 UPDATE, 되돌림 = 백업 값 UPDATE.

---

## ④ 미확정 사항 (Owner 결정 필요)

| ID | 결정 사항 | 근거 |
|---|---|---|
| L1 | 「커뮤니티」가 붙은 알림 배지·광고 도메인·상위노출 라벨을 **LOUNGE 로 할지 FEED 로 할지** (C5, D11, D18, E5, `community_top_pin_cta`) | 현재 같은 단어가 두 뜻. 알림·광고 대상은 실제로 게시글(FEED)만인지 모임 포함(LOUNGE)인지 |
| L2 | 「브랜드+기능」 메뉴의 앞머리까지 바꿀지: 거래 신고·거래 게시물·거래 상위노출·거래 문의·거래 정책, 모임 목록·모임 신고 등 6개, 커뮤니티 문의, 배달 설정·배달 통계, 커뮤니티 글쓰기·거래 글쓰기, 내 커뮤니티 활동 | 표기 규칙 2(기능 문구 한글 유지)와 규칙 4(같은 서비스 같은 이름)가 겹침 |
| L3 | 통합 검색 placeholder 에 LOUNGE 를 넣을지, 하위 FEED·MARKET 을 넣을지 | A19 |
| L4 | `community_sections`/`boards`/`services` 의 「동네생활」, MY 「내 커뮤니티 글」 부제 「커뮤니티·동네생활」 처리 | 옛 이름. 회원 노출 사용처 미확인 |
| P1 | DIPICK 하단바 「배달 홈」 탭(현재 `nav.home`=홈) 표기: DIPICK / 홈 / HOME | 공유 키 |
| P2 | 「주문」 계열(Android 「주문 알림」 채널, 알림 설정 「주문」, MY 「주문·배달」 분류, 채팅방 「배달」 배지)이 DIPICK 인지 | 스토어 주문이 DIPICK 범위인지 |
| P3 | 「DIBAY 배달이 곧 열립니다」「DIBAY 배달에서 내 매장을…」 등 문장 속 「DIBAY 배달」을 DIPICK 으로 | 사실상 서비스 이름 |
| P4 | 매장 오너 광고 지면 「배달 홈 …」 → 「DIPICK 홈 …」 | 화면 이름 |
| T1 | LETARING 허브 머리글: 지금처럼 구역 이름(대화·친구·통화)을 보일지, LETARING 을 고정할지 | 바꾸면 동작 변경(메신저 화면 셸) |
| T2 | 수신 통화 「DiBay 음성/영상 통화」·CallKit 이름·통화 푸시 「통화」에 LETARING 적용 여부 — **적용 시 통화 변경 규정 절차(증거·영향 분석·단독 커밋·실기 행렬)** 필요 | 통화 코드 hard-lock |
| T3 | 문장 속 「메신저」(오류·권한 안내 등, 약 10개 키)·「메신저 홈으로」·「메신저로 돌아가기」 버튼 | 기능 문장이지만 옛 서비스명 |
| M1 | 「내정보로」 버튼·문장 속 메뉴 경로 「내정보 › 알림 설정」(약 10개 키) → MY | 메뉴 이름이 바뀌면 경로 안내 불일치 |
| M2 | MY 섹션 「거래」「매장·주문」(코드 기본값 + DB `my_page_sections`) → MARKET / DIPICK | |
| M3 | /mypage/account 「내 정보 / My Info」 — 계정 정보(기능) 인지 MY 인지 | en 은 용어집 위반 상태 |
| N1 | 법적 문서(개인정보처리방침·마케팅 동의 본문·`app_legal_documents`) 안 서비스명 — 개정·버전 절차로 할지 | 법적 문서 |
| N2 | iOS 권한 문구 「메신저에서…」「배달·근처 서비스…」 | 네이티브·심사 문구 |
| N3 | 광고·포인트 상품 공개명(커뮤니티 상위노출·거래 상위노출·배달 매장 홍보 등, `ads-canonical-product-ssot.ts`·`promotion-products.ts`) 및 앞으로 쌓일 포인트 내역 설명 | 금융 장부 설명 문구 — 과거 행은 HISTORICAL |
| N4 | 「피드 배너」「광고 · 피드」의 「피드」(목록 사이 지면 형태)를 FEED 브랜드로 볼지 | 뜻이 다름 |
| N5 | 옛 앱 이름 정리 범위 포함 여부: Kasama(메일 footer·보낸 사람 기본값), 사마켓 회원, SAMessenger 미사용 키 | 서비스명이 아니라 앱 이름 |
| N6 | 사용처 0 중복 키(`header.*`, `navigation_*`, `nav.trade`, `marketplace_home_title` 등) — 값만 맞출지 삭제할지 | 삭제는 범위 확대 |

---

## ⑤ 최종 판정

| 항목 | 판정 | 증거 / 조건 |
|---|---|---|
| 감사 — 코드 출처 조사 (catalog·하단 탭·Admin 메뉴·카탈로그 밖 사본·네이티브·푸시·PWA) | **일부만 확인 (코드 검색)** | origin/main 29c9fbe58, 4개 영역 grep + 사용처 대조. 핵심 주장 4건(nav.home 공유·labelKey 우선·메신저 제목 덮어쓰기·startup 사본)은 원문 직접 확인. 나머지 행은 하위 조사 결과로 작성자 전수 재확인 안 함 |
| 감사 — 운영 DB 화면 노출 값 | PASS (조회 범위 내) | `ckdosyydvgzqwpbwuhon` SELECT 6회, 2026-11-13 PHT. 쓰기 0 |
| 감사 — 실제 화면 (Android·iOS·Web·Admin, Owner 로그인 상태) | **NOT_PROVEN** | 화면 확인 안 함 |
| 동적 서버 문구 (API 응답) 전수 | **NOT_PROVEN** | 문자열 grep 만, 응답 실측 없음 |
| 이메일·SMS 템플릿 | 코드상 서비스명 없음 (Kasama 옛 앱 이름만) | 코드 검색만 |
| 현재 상태 「공식 명칭 일관 사용」 | **FAIL** | ① 표 89행이 옛 명칭·불일치 |
| 변경 구현 | 미착수 (지시대로 감사·설계까지) | 코드·DB·커밋·PR 없음 |

### 작업자 보고 (먼저 적을 것)
- 이번 감사는 코드·DB 검색 기반이며 화면을 직접 본 항목은 0개다.
- ② 표의 KEEP·INTERNAL 수치는 영역마다 검색어가 달라 합계를 내지 않았다.

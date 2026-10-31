# DIBAY 하단 모달(바텀시트) 전체 감사 + 수정 계획 (2026-11-01 · Claude · 문서만, 코드 무변경)

- 기준 코드: `main` = `3d462fb05` (로컬, 미수정)
- 지시 원문(Owner): 「디바이의 전체 하단의 모달을 감사해서 첨부와 같이 하단이 비는 부분을 수정 … 정확히 하→상으로 구현되는 모든 부분을 감사해서, 사이공간이 벌어지지 않도록 … 통일된 디자인의 UI UX CTA … 버튼의 통일성 및 모바일 눌림 효과 … 전체감사 - 수정 계획 - 승인후 진행」
- 이 문서는 **감사·계획만**. 승인 전 구현하지 않는다.
- 판정 근거는 전부 코드. 실기기 화면은 Owner 첨부 1장(Samsung, 메신저 친구 요청 시트)만 봤다 → 다른 화면의 실기 상태는 **NOT_PROVEN**.

---

## 0. 결론 (먼저)

1. **첨부 화면 = FAIL.** 원인은 결함이 아니라 **설계**다. 하단 시트 89개 중 **64개가 「하단 탭 위」(`above-bottom-nav`)에 떠 있도록** 만들어져 있다. 시트 아래로 `하단 탭 높이(60px) + 기기 내비 영역(safe-bottom)`만큼 어두운 띠가 남고, 그 사이로 흐린 하단 탭이 비쳐 보인다 → 「하단이 비는」 모양.
2. 이 「탭 위」 배치는 기존 승인 설계(`MAIN_BOTTOM_NAV_SHEET_*` 계약, N-06, 마이페이지 §12)다. **오늘 Owner 지시와 충돌한다** — 아래 §2 에서 그대로 보고하고, 계획은 오늘 지시(기기 맨 아래까지 붙임)를 따른다.
3. 시트가 열려 있는 동안 하단 탭은 어차피 어두운 배경(z 1300) 아래에 있어 **누를 수 없다**. 그래서 시트가 탭을 덮어도 잃는 기능이 없다.
4. 버튼은 **두 체계가 섞여 있다**: 오버레이 버튼(`DibayOverlayButton`)은 눌림 = 진해짐 + 0.98 축소, `Sam.btn` 은 진해짐만(축소 없음). 시트 17개는 눌림 효과가 아예 없는 버튼이 있다. 오버레이 버튼의 비활성은 `opacity 0.45` 로 **Owner Q4(불투명도 처리 금지)와 어긋난다**.
5. 고칠 곳 대부분은 **공통 셸 6개**다. 개별 화면 89개를 하나씩 고치지 않는다. 웹만 바뀐다(네이티브·DB 변경 없음 → 앱 재시작만).

---

## 1. 첨부 화면 원인 (메신저 → 친구 요청 시트)

| 항목 | 내용 |
|---|---|
| 화면 | 메신저 홈 → 친구 요청 시트 (`components/community-messenger/MessengerReceivedFriendRequestsSheet.tsx:89`) |
| 셸 | `MessengerHomeBottomSheetShell` (`components/community-messenger/MessengerSheetUi.tsx`), 기본 `anchor = "above-bottom-nav"` |
| 위치 CSS | `app/messenger-home-bottom-sheet.css:8` `.messenger-home-bottom-sheet-panel { bottom: calc(var(--app-bottom-nav-height, 60px) + var(--safe-bottom)) }` |
| 결과 | 패널 하단이 화면 하단에서 `60px + Samsung 3버튼 내비 높이` 위에서 끝남. 그 아래는 어두운 배경 + 흐린 하단 탭 + 회색 시스템 내비 → 첨부의 빈 띠 |
| 기기 safe 값 | Android: `DibayWebSafeAreaBridge.java` 가 내비 높이를 `--dibay-safe-bottom` 으로 주입 (edge-to-edge). iOS: `env(safe-area-inset-bottom)`. 정의 `app/app-shell.css:63` |

같은 방식(탭 위)으로 뜨는 시트는 아래 §3 표의 **AN 64개 전부**다. 첨부 1개 화면만의 문제가 아니다.

---

## 2. 기존 설계와 Owner 지시 충돌 (규정 7 — 그대로 보고)

| 기존 승인 설계 | 위치 | 오늘 지시 |
|---|---|---|
| 하단 탭이 있는 화면의 시트는 탭 위에 띄운다 (`MAIN_BOTTOM_NAV_SHEET_*` authority) | `lib/main-menu/bottom-nav-config.ts:186-192`, `app/dibay-overlay.css:84-120`, `app/messenger-home-bottom-sheet.css` | 아래→위로 올라오는 모든 것은 기기 하단과 **사이공간 없이** |
| 탭 없는 화면은 하단에 붙이고 safe 는 패널 안 1회 (N-06) | `app/dibay-overlay.css:122-133` | 같음 (유지) |
| 메신저 방 시트는 기기 하단부터 (SPL-05) | `room-sheets-device-bottom.contract.test.ts` | 같음 (유지) |

계획은 **오늘 지시를 따른다**: 모든 하단 시트 = 기기 맨 아래(`device-bottom`), safe 영역은 패널 안쪽 흰 배경으로 채움. 하단 탭은 시트가 덮는다(z 시트 1300 > 탭 1200 — 이미 그렇다). 승인 시 위 계약 주석·테스트를 함께 고친다.

**바뀌지 않는 것**: 페이지에 붙은 고정 CTA 바(`MyStickyCta`, 상품 상세 하단 바 등)와 스낵바는 「올라오는 모달」이 아니므로 탭 위 배치를 그대로 둔다. (지시 범위 밖 — 바꾸지 않는다.)

---

## 3. 전체 목록 (사용자 화면, 89개)

약어: **AN** = 탭 위 · **DB** = 기기 하단 · **(d)** = 기본값으로 정해짐 · ✗ = 눌림 효과 없는 버튼 있음

### 3-1. 셸별 개수

| 셸 | 개수 | 위치 | safe 처리 |
|---|---|---|---|
| `DibayBottomSheet` (`components/ui/dibay-overlay/`) | 46 | AN 41 · DB 5 | 셸 CSS (탭 위면 패널 아래 20px, 탭 없으면 `max(20px, safe)`) |
| `DibayActionSheet` | 11 | AN 10 · DB 1 | 위와 같음 |
| `DibayUsableAreaSheet` (마이페이지 4 · 고객센터 1) | 5 | AN 4 · DB 1 | `effectiveBottomInset` |
| `MessengerHomeBottomSheetShell` (메신저 홈) | 12 | AN 9 · DB 3 | 화면마다 따로 `pb-[max(1rem,var(--safe-bottom))]`, **4곳 없음** |
| `StoreProductSheetShell` (매장 상품 담기) | 1 | 사용자 정의 (실제로는 0 — §4 D-4) | 담기 바 안 |
| `DibayOverlayRoot` 직접 (플랫폼 팝업 하단형) | 1 | DB | `.dibay-promo-sheet__safe-bottom` |
| `DibayFullSheet` (신고 사유) | 1 | DB | `--kb-safe-bottom` |
| 직접 만든 시트 (`fixed bottom-0` 등) | 12 | 모두 DB | 제각각, **4곳 없음** |
| **합계** | **89** | **AN 64 · DB 24 · 기타 1** | |

관리자(`components/admin/AdminFormSheet.tsx`, 18곳)는 기기 앱 화면이 아니므로 이번 범위에서 뺀다 (개수만 기록).

### 3-2. 탭 위(AN)로 떠서 첨부와 같은 빈 띠가 생기는 시트 — 64개

**DibayBottomSheet (41)**
`MyAdsPageClient.tsx:720` · `WriteSelectSheetField.tsx:85` · `HomeTradeHubFloatingBar.tsx:166` · `OfferListSellerModal.tsx:44` · `OfferModal.tsx:90` · `PostDetailMoreBottomSheet.tsx:104` · `PostListMenuBottomSheet.tsx:136` · `PostDetailSellerMoreSheet.tsx:81` · `MemberPostPromoteSheet.tsx:250` · `PhoneVerificationRequiredSheet.tsx:66` · `MarketplaceMoreBrowseSheet.tsx:171` · `MarketFilterSheet.tsx:560` · `TradeBrowseLocationSheet.tsx:155, :173` · `TradeShowcaseSection.tsx:99` · `OwnerOrderAcceptSheet.tsx:50` · `OwnerOrderRejectSheet.tsx:56` · `OwnerStoreSponsoredCreateView.tsx:871` · `OwnerBannerCreateView.tsx:1178` · `OwnerDeliveryAdPartnerView.tsx:304` · `OwnerDeliveryAdsHubView.tsx:563` · `OwnerDeliveryAdCashChargeSheet.tsx:27` · `StoreCartPreviewSheet.tsx:75` · `StoreOrderReceiptSheet.tsx:99` · `MyStoreOrderDetailView.tsx:1176` · `TradeBuyerPickerModal.tsx:31` · `PointFinancialHistoryList.tsx:147` · `PointChargeForm.tsx:222` · `MeetingReportModal.tsx:100` · `ChatDetailView.tsx:2300` · `ChatMobileAttachSheet.tsx:40` · `CommunityLocalFilterPickerSheet.tsx:45` · `CommunityShareSheet.tsx:79` · `MeetingJoinRequestModal.tsx:63` · `MessengerFriendProfileSheet.tsx:253` · `MessengerChatRoomActionSheet.tsx:149` · `MessengerChatFilterSheet.tsx:25` · `CommunityMessengerRoomPhase2MemberActionModal.tsx:82` · `BlockActionSheet.tsx:76` · `ReportActionSheet.tsx:79`

**DibayActionSheet (10)**
`MyAdsPageClient.tsx:672` · `notifications/page.tsx:224` · `ProfileImageField.tsx:198` · `OwnerNotificationList.tsx:501` · `MyStoreOrdersView.tsx:1248` · `CommunityActivityHubView.tsx:387` · `MypageCommunityPostsList.tsx:300` · `MyProductActions.tsx:119` · `RecentViewedList.tsx:277` · `MessengerNotificationCenterSheet.tsx:53`

**마이페이지 시트 (4)** — `MypageBottomSheetShell.tsx:75` 사용: `ProfileSettingsSheet` · `EditDibayIdSheet` · `EditPublicProfileSheet` · `PhoneVerificationSheet`

**메신저 홈 시트 (9)** — `CommunityMessengerHome.tsx:3848` · `MessengerNewConversationSheet.tsx:30` · `MessengerFriendsPrivacySheet.tsx:47` · **`MessengerReceivedFriendRequestsSheet.tsx:89`(첨부)** · `MessengerSearchSheet.tsx:112, :452` · `MessengerFriendRowQuickPopup.tsx:160` · `MessengerNotificationCenterSheet.tsx:330` · `MessengerRejectedRequestsSheet.tsx:80`

### 3-3. 기기 하단(DB)이지만 safe 영역 처리가 없는 시트 — 기기 내비/홈 표시줄에 버튼이 겹칠 수 있음 (8개)

| 파일 | 형태 |
|---|---|
| `components/community-messenger/room/phase2/StoreOrderBuyerRoomSheet.tsx:233` | 직접 `fixed bottom-0` |
| `components/chats/StoreOrderSellerOrderPanel.tsx:391` | 직접 `fixed inset-0 items-end` |
| `components/stores/commission/StoreCommissionLedgerTable.tsx:309` | 직접 |
| `components/business/owner/ads/OwnerPlatformPopupApplyView.tsx:845` | 직접 (`p-4` 카드) |
| `components/community-messenger/MessengerArchiveScreen.tsx:150` | 메신저 셸 DB |
| `MessengerSearchSheet.tsx:112, :452`, `MessengerFriendsPrivacySheet.tsx:47`, `CommunityMessengerHome.tsx:3848` | 메신저 셸 AN (지금은 탭 위라 안 보일 뿐, DB 로 바꾸면 같이 처리해야 함) |

### 3-4. 눌림 효과 없는 버튼이 있는 시트 — 17개

`TradeShowcaseSection.tsx:99`(링크 버튼) · `TradeFrequentPhrasesSheet.tsx:113`(직접 색 버튼) · `ChatDetailView.tsx:2300` · `OfferListSellerModal.tsx:44` · `OwnerOrderAcceptSheet.tsx:50`·`OwnerOrderRejectSheet.tsx:56`(`Biz.btnOutline` 에 눌림 없음) · `OwnerDeliveryAdCashChargeSheet.tsx:27`(보조 버튼) · `StoreOrderBuyerRoomSheet.tsx:233` · `StoreOrderSellerOrderPanel.tsx:391` · `StoreListFilterChips.tsx:107`(하단 글자 버튼) · `OAuthProviderLoginPanel.tsx:107` · `OwnerPlatformPopupApplyView.tsx:845` · `DibayPopupAd`→`.dibay-promo-cta`(`app/platform-popup.css:210`) · `MessengerNotificationCenterSheet.tsx:330` · `MessengerFriendsPrivacySheet.tsx:47` · `MessengerRejectedRequestsSheet.tsx:126` · `CommunityMessengerRoomPhase2RoomSheets.tsx:654,671,701,714,725` · (`CommunityMessengerCallClient.tsx:5698` 통화 키패드 닫기 — 통화 코드, §6 제외)

### 3-5. 버튼 체계 현황

| 체계 | 정의 | 눌림 | 비활성 |
|---|---|---|---|
| 오버레이 버튼 `DibayOverlayButton` / `OverlayUi.btn.*` | `app/dibay-overlay.css:337-417` | 진해짐 + `scale(0.98)` ✓ | **`opacity: 0.45`** ✗ (Owner Q4 위반) |
| `Sam.btn.*` / `.sam-btn*` | `app/samarket-components.css:166-366` | 진해짐/밝기만, **축소 없음** | 회색 토큰 ✓ |
| `Biz.btnOutline` | `lib/ui/biz-component-classes.ts` | **없음** ✗ | — |
| `.dibay-promo-cta` | `app/platform-popup.css:210` | **없음** ✗ | — |
| 기존 기준 (2026-10-24 §1-4, `docs/audit/messenger-2026-10-24-stage1-ui-cta-friend-spec.md:59-74`) | 높이 48px · 시트 안 버튼 반경 12px · 왼쪽 보조/오른쪽 주 · 눌림 = `--sam-primary-active` + `--overlay-press-scale` 0.98 · 비활성 = 회색 토큰(불투명도 금지) | | |

---

## 4. 같이 발견된 결함 (위치 계산)

| ID | 내용 | 근거 |
|---|---|---|
| D-1 | 64개 시트가 탭 위에 떠 하단 빈 띠 (첨부) | §1·§3-2 |
| D-2 | `DibayUsableAreaSheet` 탭 위 모드가 오프셋을 **두 번** 더함: 루트 `data-sheet-anchor`(탭+safe) + 패널 `MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS`(탭+safe) + 패널 안 safe 패딩 → 마이페이지 시트 4개가 더 높이 뜰 수 있음 | `DibayUsableAreaSheet.tsx:86,150` |
| D-3 | 기기 하단 시트 8개 safe 처리 없음 | §3-3 |
| D-4 | `StoreProductSheetShell` 의 탭 위 Tailwind 클래스는 `.dibay-overlay-root{bottom:0}`(레이어 밖 CSS)에 져서 **실제로 적용 안 됨** — 코드 의도와 동작 불일치 | `StoreProductSheetShell.tsx:23`, `app/dibay-overlay.css:62-71` |
| D-5 | 오버레이 버튼 비활성 `opacity 0.45` — Owner Q4(불투명도 금지)와 다름 | `app/dibay-overlay.css` `.dibay-overlay-btn:disabled` |
| D-6 | 통화 키패드만 `env()` 직접 사용(Android 주입값 무시) | `CommunityMessengerCallClient.tsx:5698` — 통화 코드라 §6 제외, 보고만 |

미사용 코드(보고만, 이번에 지우지 않음): `components/delivery/ui/DeliverySheet.tsx`, `components/stores/cart/StoreCommerceCartBottomSheet.tsx`, `app/community-share-sheet.css`.

---

## 5. 수정 계획 (승인 요청)

### 5-0. 고정 기준 (모든 하단 시트 공통)

| 기준 | 값 | 근거 |
|---|---|---|
| 위치 | 패널 하단 = **기기 화면 맨 아래 (`bottom: 0`)**. 하단 탭을 덮는다 | 오늘 지시 |
| 하단 여백 | 패널 안쪽 `padding-bottom: max(기존 패딩, var(--safe-bottom))` — 기기 내비/홈 표시줄 영역까지 **흰 배경**, 버튼은 그 위 | 기존 N-06 규칙을 전체로 확대 |
| 키보드 열림 | 기존 visualViewport 밴드 규칙 그대로 (`bottom = 키보드 위`, safe 안 더함, KB-02/05) | 변경 없음 |
| 최대 높이 | 기존 상한에서 「탭 높이 빼기」만 제거: DibayBottomSheet `min(82dvh, 560px)`(기존 DB 값), 메신저 홈 `88dvh`(기존 값에서 탭 제외) | 새 값 만들지 않음 |
| 모서리·핸들 | 위 24px · 핸들 40×4 (기존 오버레이 계약) | 04-DESIGN-SYSTEM |
| 태블릿 | 폭 `max-width: 32rem` 가운데, 하단은 화면에 붙음. 메신저 ≥768 분할 시트 기존 규칙 유지 | 기존 |
| 버튼 | 시트 안 버튼 = 높이 48px · 반경 12px · 왼쪽 보조/오른쪽 주 · **눌림 = 진해짐 + 0.98 축소** · 비활성 = 회색 토큰 | 2026-10-24 §1-4 |

### 5-1. 1단계 — 위치·safe (공통 셸 수정 → 89개 일괄 적용)

| # | 파일 | 바꾸는 것 | 영향 화면 |
|---|---|---|---|
| 1-1 | `app/dibay-overlay.css` | `[data-sheet-anchor="above-bottom-nav"]` 규칙(오비트·배달·탭 없음 변형 포함)을 `bottom: 0` + 패널 `padding-bottom: max(20px, var(--safe-bottom))` 로 통일 | DibayBottomSheet 41 · ActionSheet 10 |
| 1-2 | `DibayBottomSheet.tsx` · `DibayActionSheet.tsx` · `DibayOverlayRoot.tsx` · `lib/ui/dibay-overlay-contract.ts` | 기본 anchor = `device-bottom`. `above-bottom-nav` 값은 타입 호환용으로 남기되 동작은 `device-bottom` 과 같게 (호출부 32곳 수정 없이 따라옴) | 위와 같음 |
| 1-3 | `DibayUsableAreaSheet.tsx` · `MypageBottomSheetShell.tsx` | 이중 오프셋(D-2) 제거, `device-bottom` 동작 | 마이페이지 시트 4 |
| 1-4 | `app/messenger-home-bottom-sheet.css` · `MessengerSheetUi.tsx` | 패널 `bottom: 0` + 셸이 safe 패딩을 **한 번** 책임 → 화면별 중복 `pb-[max(1rem,var(--safe-bottom))]` 정리 | 메신저 홈 시트 12 (첨부 포함) |
| 1-5 | `StoreProductSheetShell.tsx` | 적용 안 되는 탭 위 클래스 제거(D-4), 동작 그대로 | 매장 상품 담기 1 |
| 1-6 | 직접 만든 시트 4개 (`StoreOrderBuyerRoomSheet`, `StoreOrderSellerOrderPanel`, `StoreCommissionLedgerTable`, `OwnerPlatformPopupApplyView`) | 패널에 `pb-[max(기존,var(--safe-bottom))]` 추가 | 각 1 |
| 1-7 | `lib/main-menu/bottom-nav-config.ts` | `MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS`/`MAX_H_CLASS` 를 시트에서 더 쓰지 않음 (스낵바·고정 바용 `BOTTOM_NAV_*` 는 유지) | 주석·계약 |
| 1-8 | 테스트 | `dibay-overlay-contract`, `dibay-usable-area-sheet-contract`, `main-bottom-nav-hub-clearance`, `messenger-split-bottom-nav-left-pane-contract`, `mypage-ds` 의 「탭 위」 기대값을 새 기준으로 고치고 「시트 = bottom 0 + 패널 안 safe 1회」 계약 테스트 추가 | — |

깨질 수 있는 것과 같은 단계 처리:
- 시트 윗선이 탭 높이(60px)만큼 내려감 → 상한 높이에서 탭 빼기를 제거해 보이는 내용 양은 같거나 늘어남.
- 시트 안 `fixed` 하위 요소(매장 담기 바, 시트 안 드롭다운 `PhilifeWriteTopicDropdown` z)가 탭 위 기준으로 계산돼 있는지 1단계에서 같이 확인·수정.
- 키보드 열림 규칙은 손대지 않는다(밴드가 이미 `bottom:auto`).

### 5-2. 2단계 — 버튼 통일·눌림 효과

| # | 파일 | 바꾸는 것 |
|---|---|---|
| 2-1 | `app/dibay-overlay.css` | `.dibay-overlay-btn:disabled` → 회색 토큰(`--sam-primary-disabled` 배경 + `--sam-text-muted`), opacity 제거 (D-5) |
| 2-2 | `app/samarket-components.css` | **시트·다이얼로그 안**(`.dibay-overlay-root`, 메신저 시트 루트)의 `.sam-btn*` 눌림에 `scale(var(--overlay-press-scale))` 추가 — 시트 밖 일반 화면 버튼은 이번에 바꾸지 않음 |
| 2-3 | `lib/ui/biz-component-classes.ts` | `Biz.btnOutline` 에 눌림(배경 진해짐 + 0.98) 추가 |
| 2-4 | `app/platform-popup.css` | `.dibay-promo-cta` 눌림 추가 |
| 2-5 | §3-4 의 시트 버튼 (통화 키패드 제외 16개 파일) | 직접 스타일 버튼 → `DibayOverlayButton` / `Sam.btn.*Combo` 로 교체(문구·동작 그대로), 목록 행은 기존 `active:bg` 규칙 적용 |

### 5-3. 반영·검증

- 배포 구분: **웹** (네이티브·DB 변경 없음 → main 반영 후 앱 재시작만, APK/iOS 빌드 없음).
- 작업 브랜치 `fix/bottom-sheet-device-bottom` 에서 1·2단계 구현 → 로컬 `typecheck:build` + 관련 `vitest` + 변경 파일 `eslint` + `typecheck:test` 1회 → main 에 **1회** 반영.
- 실기 확인 표 (Owner 화면 기준, Production SHA 와 함께 기록. 내가 직접 못 본 것은 NOT_PROVEN):

| 기기 | 확인 시트 |
|---|---|
| Samsung (3버튼 내비) | 메신저 친구 요청(첨부) · 메신저 검색 · 거래 필터 · 게시글 더보기 · 마이 프로필 설정 · 매장 상품 담기 · 오너 주문 수락/거절 · 키보드 열린 시트(거래 위치/글쓰기) |
| Android 제스처 내비 | 위와 같은 4개(친구 요청·거래 필터·마이 프로필·매장 담기) |
| iPhone (홈 표시줄) | 위와 같은 8개 |
| 태블릿 (≥768) | 메신저 분할 시트 · 거래 필터 · 게시글 더보기 |

각 항목 판정 = ① 시트 아래 빈 띠 없음 ② 버튼이 기기 내비/홈 표시줄에 안 겹침 ③ 버튼 눌림(축소+진해짐) ④ 키보드 열고 닫을 때 띠·겹침 없음.

---

## 6. 범위 밖 (보고만, 고치지 않음)

- 통화 키패드(`CommunityMessengerCallClient.tsx:5698`) safe·닫기 버튼 — 통화 변경 규정 대상, 별도 승인 필요.
- 관리자 `AdminFormSheet` 18곳.
- 페이지 고정 CTA 바·스낵바(올라오는 모달 아님).
- 미사용 코드 3개 삭제.

---

## 7. 구현 결과 (Owner 조건부 승인 2026-11-01 → 1·2단계 구현)

### 7-1. 위치·safe (1단계)
- `above-bottom-nav` **폐지**(호환값으로 남기지 않음): `DibayOverlayRoot.sheetAnchor`, `DibayBottomSheet`/`DibayActionSheet`/`DibayUsableAreaSheet` 의 `anchor` prop, `MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS`·`MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS`·`OVERLAY_SHEET_ABOVE_NAV` 삭제. 호출부 `anchor=` 46곳 제거. 남은 쓰임은 계약 테스트가 막는다.
- `app/dibay-overlay.css`: 탭 위 오프셋 규칙 6개(오비트·배달·키보드 리사이즈·탭 없음 변형) 삭제. `.dibay-overlay-sheet` 패딩 하단 = `max(20px, --kb-safe-bottom)` 한 번.
- 메신저 홈 시트: 기본 anchor `fit-content`(기기 하단, 내용 높이). `.messenger-home-bottom-sheet-panel { bottom: 0; max-height: 88dvh }`. safe 없던 4곳(보관함·친구 관리·검색 ×2·모임 찾기) 추가.
- 마이페이지 시트 이중 오프셋(D-2) 제거. 매장 상품 담기 셸의 안 먹히던 클래스(D-4) 제거. 장바구니 미리보기는 담기 바가 safe 를 가지므로 패널 safe 끔(이중 방지).
- 직접 만든 시트 4개 safe 추가: 주문 진행(구매자)·판매자 주문 패널·수수료 상세·팝업 광고 신청 확인(하단 카드 → 하단 붙은 시트).
- 그대로 둔 것: 키보드 밴드 규칙, 토스트·스낵바·고정 CTA 바의 탭 위 위치, z(시트 1300 > 탭 1200).

### 7-2. 버튼 (2단계)
- 오버레이 버튼 비활성 `opacity .45` → 회색 토큰(D-5). 작은 글자 행동 `.dibay-overlay-text-action`(44px·눌림), 보조+위험 글자 `secondaryDanger` 추가.
- 시트·다이얼로그(`[role="dialog"]`) 안 `Sam.btn` 눌림 0.98 축소. 시트 밖 화면 버튼은 그대로.
- `Biz.btnPrimary/Lg/btnOutline` 눌림 0.98 + 회색 비활성. `.dibay-promo-cta` 눌림.
- 결함 17곳 중 16곳 수정(통화 키패드 제외). 클릭 핸들러·disabled 조건·로딩 문구는 그대로, 클래스만 교체.

### 7-3. 범위 밖·충돌 (보고만)
- 통화 키패드(`CommunityMessengerCallClient.tsx:5698`) — 통화 규정 대상.
- 매장 목록 필터 시트(배민 미러 설계 v6: 위 모서리 14px·하단 분할 글자 버튼)는 기존 승인 디자인이라 **눌림만** 추가. 12px·표준 버튼으로 바꿀지는 Owner 결정 필요(설계 충돌).
- 거래 자주 쓰는 문구 시트의 문구 행 「수정·삭제」 작은 버튼은 눌림만 추가, 44px 터치 미적용(행 레이아웃 변경 필요).
- 미사용 코드 `StoreCommerceCartBottomSheet`(footer safe + 패널 safe 이중 — 호출처 없음), `DeliverySheet`, `app/community-share-sheet.css`.

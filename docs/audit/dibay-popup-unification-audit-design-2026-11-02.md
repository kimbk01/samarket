# DIBAY 팝업 UI·UX·CTA SSOT — 전수 감사(2차 재감사) · 최종 설계 (2026-11-02)

- 지시 (Owner 2026-11-02): 「기능에 영향을 주지 않고 정확한 UI·UX·CTA SSOT 가 되도록, 너의 권장 기준으로 통일된 형태의 완성도를 높일 수 있도록 끝까지 감사해서 누락·오류가 없도록 다시 감사하고 최종 설계안을 보고」.
- 범위: 디바이 앱이 띄우는 모든 팝업 — 중앙 다이얼로그·확인창·입력창, 바텀시트·액션시트·풀시트, 서랍(drawer), 팝오버·드롭다운·길게 누르기 메뉴, 상단·하단 알림 배너, 토스트, 브라우저·네이티브 확인창.
  **제외:** 광고 팝업(`components/platform-popup/*`, 글로벌 팝업 광고), 관리자(`app/admin`, `components/admin`), 개발 화면(`app/dev`).
- 방법: **코드만 읽음** (모든 결함에 파일:줄). 수정·커밋·DB 접근 없음. 실기 캡처 없음 → 기기별 화면 판정은 전부 **NOT_PROVEN**.
- 시안: `docs/audit/dibay-popup-unification-mockup-2026-11-02.html`.

---

## 0. 먼저 보고 (작업자 오류 · 정정 · 충돌)

| # | 내용 |
|---|---|
| E-1 **내 오류 정정** | 1차 보고에 「사장님 팝업광고 신청 확인 팝업이 하단 탭 아래 깔림」이라고 썼으나 **틀렸습니다.** 그 화면 `/stores/owner/ads/new/platform-popup` 은 사장님 하단 탭이 숨는 경로입니다 (`lib/business/owner-bottom-nav-eligibility.ts:18`, `:36-41`). z 80 은 다른 팝업과 쌓임 순서가 어긋나는 문제로만 남깁니다. |
| E-2 **내 오류 정정** | 1차 보고에서 「전체 업종 패널 닫기 32px」을 결함으로 셌으나, `StoresBrowsePrimaryIndustryMenuPanel` 은 **어디서도 열리지 않는 미사용 코드**입니다 (테스트에서만 참조). 실제 쓰이는 「메뉴 전체보기」는 `StoresBrowseHeaderMenuTabs.tsx:248` 입니다 (§2-F). |
| E-3 **1차 감사 누락** | 1차는 공통 컴포넌트를 **직접** 쓰는 파일만 셌습니다. 중간 래퍼(메신저 홈 시트, 내정보 시트, 로그인 게이트, 매장 상품 시트, 고객센터 시트, 거래 글쓰기 시트, 사장님 확인창)를 거쳐 여는 팝업 **64건**(사장님 확인창 33 + 래퍼 시트 31), 드롭다운 **13건**, 알림 배너 **5건**, 브라우저 `window.confirm` **1건**이 빠져 있었습니다. 이번 2차에서 전부 넣었습니다. |
| E-4 **1차 결과 재검증** | 1차 결과 표본 15건 + 2차 결과 표본 12건을 코드와 직접 대조 → **불일치 0건** (위 E-1, E-2 는 표본 밖에서 찾은 해석 오류). |
| E-5 **기존 원장 오류** | `docs/ui/dibay-overlay-inventory.md` 「110개 DONE · TODO 0」은 공통 컴포넌트로 감쌌는지만 센 것입니다. 실제 화면 규격은 §2 처럼 제각각입니다. |
| E-6 **기존 계약과 충돌** | Owner 이번 지시(「너의 권장 기준으로」)에 따라 §3 기준을 정했습니다. 그중 **기존 계약 v1.0.0 값을 바꾸는 항목**은 §3-0 표에 모두 적었습니다. |

---

## 1. 전수 집계

| 분류 | 건수 | 계약대로 | 결함 | 비고 |
|---|---|---|---|---|
| 중앙 다이얼로그 (컴포넌트) | 69 | 39 | 26 (경미 11 · 구조 15) | 해당 없음 4 |
| 사장님 확인창 `OwnerStoreAdminConfirmModal` 호출 | 33 | 30 | 3 (`\n` 무시 2 · 자식 색 1) | 2차 신규 |
| 명령형 확인창 `dibayConfirm/Alert/Prompt` | 74 호출 | — | 문구·색·제목 길이 혼선 (§2-B) | |
| 바텀시트·액션시트 (공통 직접) | 64 | 18 | 40 | 셸 6 |
| 래퍼 경유 시트·팝업 | 31 | 8 | 23 | 2차 신규 |
| 공통 미사용 자체 팝업 | 22 | 0 | 22 | 미사용 1 제외 |
| 드롭다운·팝오버·길게 누르기 | 16 | 0 | 16 | 2차 13 신규 |
| 서랍 (drawer) | 2 | 0 | 2 | 사장님 메뉴 · 그룹 서랍 |
| 상단·하단 알림 배너 | 5 (+ FAB 2) | 0 | 5 | 2차 신규 |
| 토스트 | 10 종 | — | 10 종이 모두 다름 | 2차 +3 |
| 브라우저 확인창 `window.confirm` | 1 | — | 1 | 2차 신규 |
| 네이티브 (Android Toast · 통화 안내) | 3 | — | 통화 규정 · 보고만 | |
| OS 날짜·선택 피커 (`<input type=date>`, `<select>`) | 10 + 37 파일 | — | OS 소유 · 유지 | §3-9 |
| **미사용 팝업 (호출처 없음)** | **18** | — | 삭제 대상 | §2-H |

---

## 2. 결함 목록 (위치 · 여는 곳 · 무엇이)

### 2-A. 기준 계약 자체 결함 (모든 팝업에 영향)

| # | 결함 | 근거 | 화면 증상 |
|---|---|---|---|
| C-1 | 제목·본문에 줄바꿈 규칙 없음 + 다이얼로그 스크롤 `overflow-x:hidden` | `app/dibay-overlay.css:157-164, 220-246` | 긴 ID·이메일·계좌번호·금액이 **오른쪽에서 잘림**. 한글이 음절 중간에서 끊김. `\n` 이 무시됨 → i18n 문구 9개(`business_phase7_386/389/392`, `gift_u2_*` 등)와 `ProfileEditForm.tsx:590`, `OwnerBusinessCashView.tsx:551`, `OwnerCoinWithdrawalPanel.tsx:240`(계좌번호 줄), `DeliveryAdOwnerInsufficientCashSubmitModal.tsx:55` 의 줄바꿈이 한 줄로 붙음 |
| C-2 | 눌림 효과 4종 | 버튼 0.98+진해짐 (css:326) · 위험 버튼 `brightness(.92)` (css:381) · 액션시트 행 배경+0.98 (css:438) · 메뉴 행·아이콘 버튼 배경만 (css:560, 530) · 빠른 실행 원 0.94 (css:652) | 같은 시트 안에서도 반응이 다름 |
| C-3 | 비활성 표시 혼합 (규칙 = 회색 바탕) | css:336-344 vs `quick-action:disabled{opacity:.4}` css:625 | |
| C-4 | TS 색 상수 ≠ CSS 토큰 | `lib/ui/dibay-overlay-contract.ts:17-27` (`#085C3F`, `#E53935`) vs `design-tokens.css:10,38` (`#0B421A`, `#d45252`) | 로그아웃 오류 글자만 다른 빨강 (`LogoutConfirmModal.tsx:44`) |
| C-5 | 버튼 체계 둘: 팝업 48·12 / 앱 `Sam.btn` 46·4 | css:55,297 / `design-tokens.css:172,257` | 팝업 안 `Sam.btn` 사용 **15곳** |
| C-6 | 시트 머리 4형태 | 가운데 제목(48) · 왼쪽+X `DibaySheetHeader`(2+메신저 홈 전부) · 자체 머리(4) · 제목 없음(6) | |
| C-7 | 팝업 안에서 다크모드에 바뀌는 색 사용 | `--sam-*`·`--messenger-*`·`--cm-room-*`·`--biz-*` 는 다크에서 바뀌고, 팝업 바탕은 흰색 고정 (`dibay-overlay.css:6-7` 경고) | 다크모드 폰에서 흰 바탕 위 글자가 흐려짐. `dark:` 클래스 쓰는 길게 누르기 메뉴만 통째로 검게 바뀜 |
| C-8 | 가로 안전영역 처리 없음 | `dibay-overlay.css`, `DibayOverlayRoot.tsx` | iPhone 가로에서 전폭 시트가 노치 아래 (NOT_PROVEN) |
| C-9 | 쌓임 순서(z) 기준이 지켜지지 않음 | 기준: 하단 탭 1200 · 시트/다이얼로그 1300 · 중첩 1305 (`bottom-nav-config.ts:187-189`). 실제 팝업 z: 20·25·30·40·50·55·60·70·80·94·100·118·120·130·140·200·220·1000·1010·1255·1260·1310·1400 | 일부가 탭바·시트 아래에 깔림 (§2-I) |
| C-10 | 쓰지 않는 옛 토큰·클래스 | `--sm-font-modal-*`, `.sm-modal`, `.sam-i18n-modal-*`, `.incoming-call-popup*`, `delivery-order-confirm-modal.css` | 화면 영향 없음 · 오용 위험 |

### 2-B. 중앙 다이얼로그 · 확인창

**구조 결함 15건** (버튼을 본문에 넣음 / 버튼 직접 제작 / 패널 덮어쓰기)

| 팝업 | 여는 곳 | 결함 |
|---|---|---|
| `write/WriteScreenTier1Sync.tsx:95-106` 「글쓰기 취소」 | 글쓰기 뒤로가기 | `sam-btn` 46·4 · `AppModal` 이 `className` 버림 · **확정 버튼 문구가 「취소」** |
| `gift-certificate/BuyerGiftDetailView.tsx:419, 479` | 상품권 구매 / 완료 | `<button>` 직접 (간격 8) · 금액 줄바꿈 없음 · 제목 끝 마침표 |
| `stores/cart/StoreCommerceCartCenterPopup.tsx:51` + `StoreCartOtherStoreConflictDialog.tsx:35-141` | 다른 가게 메뉴 담기 | `bg-white` · 11~14px · 배달 빨강 `#e74c3c` · 버튼이 본문 안 |
| `auth/AuthGateOverlay.tsx:85` → `AuthModal.tsx:145-161`, 온보딩 | 로그인 필요 동작 전부, 약관·@ID | 폭 448 · 반경 24 · 제목 18/600 · 비밀번호 버튼 `disabled:opacity-50`·`text-red-600` (`PasswordLoginForm.tsx:91,97`) · 다크모드 글자색 |
| `stores/advertising/DeliveryAdOwnerInsufficientCashSubmitModal.tsx:66-116` | 사장님 광고 신청 잔액 부족 | **취소가 맨 위** · CTA 2개가 같은 링크 (`:83`, `:98`) · `\n` 무시 · Cash/Coin 영문 |
| `auth/LogoutConfirmModal.tsx:35-44` | 내정보 → 로그아웃 | `#E53935` · 버튼이 본문 안 |
| `community-messenger/MessengerIncomingFriendRequestPopup.tsx:82-87` | 친구 요청 받음 (전역) | X 비활성 `opacity-40` |
| `community/CommunityDetail.tsx:697-733` | 필라이프 글 신고 | 버튼이 본문 안 · 「접수」가 빨강 |
| `community/MeetingPasswordOnlyModal.tsx:40-59` | 모임 비밀번호 | 필라이프 입력칸 · `text-sm` |
| `stores/cart/StoreCheckoutSubmitConfirmDialog.tsx:58-96` | 장바구니 → 주문 | 13px 왼쪽 정렬 · 다크 빨강 |
| `auth/AuthProviderEmailConflictModal.tsx:52` · `auth/ProfileGateAlertDialog.tsx:38` · `business/StoreBusinessBlockedModal.tsx:46` | 소셜 로그인 충돌 · 프로필 미완성 · 매장 차단 | 버튼·`<Link>` 를 본문에 직접 · 본문 100자 이상 |
| `ui/TumblerTimePickerDialog.tsx:149` | 사장님 영업시간 | `!mt-3` 덮어씀 |
| `business/owner/OwnerMenuCategoriesClient.tsx:548` | 상품 있는 카테고리 삭제 | 자식 `<select>`·글자가 `--sam-*` (다크 변화) |

**경미 11건:** `ProfileEditForm.tsx:578-590`(`\n`) · `OwnerOrderStepConfirmDialog.tsx:36` · `AndroidPlayInAppUpdateHost.tsx:347/385/394` · `CallInAppNoticeCenterDialog`(통화, 보고만) · `OwnerBusinessCashView.tsx:551` · `OwnerCoinWithdrawalPanel.tsx:240` 등 (다크 변화 색 · `\n` 무시 · 숫자 잘림).

**문구·색 혼선** (명령형 74건 포함)

| 의미 | 지금 섞인 문구 |
|---|---|
| 그만두기 | 취소 · 유지 · 계속 수정 · 계속 쓰기 · 계속 작성 · 계속 편집 · 나중에 · 닫기 |
| 버리고 나가기 | 버리기 · 나가기 · 변경 취소 후 나가기 · **취소** |
| 삭제·차단 | 삭제 · 전체 삭제 · 빼기 · 비우기 · 차단 · 차단하기 · **확인** |
| 질문 끝 | ~할까요? · ~하시겠어요? · ~하시겠습니까? |
| 영문 섞임 | "Delete" (`NotificationDeleteConfirmDialog.tsx:32`) · Cash/Coin · 한글 직접 입력 (`ChatDetailView:1714`, `PostCard:508`, `PostCommunityCommentsSection:168`, `MessengerFriendAddSheet.tsx:252,256`, `PostListByCategory.tsx:849`) |

- 위험한 행동인데 버튼이 「확인」: `ChatDetailView.tsx:1702`, `StoreOrderChrome:113`, `ChatRoomListMenu:36`, `MeetingHostControls:135/150/368`, `MeetingAlbumTab:51`, `MeetingFeedTab:144`, `MeetingPendingCard:24`, `MeetingRoomHero:119`, `PhilifeMeetingHubClient:84`, `UserBlockButton:52`, `CommunityMoreMenu:103`, `OwnerOrderRequestDecision:81` (문구 없음 → 「확인」).
- 제목(20px 굵게)에 2문장 이상: 약 17곳 (`TradeFlowBanner:216`, `MeetingHostControls:135/368`, `BlockActionSheet:36`, `MyProductActions:58`, `PostListMenuBottomSheet:125`, `MyStoreOrdersView:1264`, `business_phase7_389` 등).
- 서버 오류 원문이 제목: `StoreOrderReorderAgainButton:43`, `ChatRoomListMenu:48`, `PostCard:508`, `PostDetailView:945`.
- 같은 행동 다른 색: 「작성 중 나가기」 빨강 7곳 / 초록 3곳 (`WriteSheetFlowInner:450`, `TradeMeetSpotPickClient:895`, `WriteScreenTier1Sync:105`). 보관·철회가 빨강 (`MobileConfirmBottomSheet` 기본값 `:33`).
- `MobileConfirmBottomSheet` 는 이름과 달리 **중앙 다이얼로그** (`components/ui/MobileConfirmBottomSheet.tsx:40`).
- 버튼 3개 세로 순서 혼합: 취소 위 (`DeliveryAdOwnerInsufficientCashSubmitModal`) / 취소 아래 (`StoreCommerceCartCenterPopup`).

### 2-C. 바텀시트 · 액션시트 (공통 직접 64건)

| 결함 | 건수 | 대표 위치 |
|---|---|---|
| 팝업 버튼 아닌 직접 버튼·링크 | 29 | `TradeFrequentPhrasesSheet.tsx:132-243` · `WalletGiftFriendPicker.tsx:213` · `MessengerGiftOfferFlow.tsx:170/181/217` · `MyStoreOrderDetailView.tsx:1191` · `StoreOrderReceiptSheet.tsx:106/109` · `PhilifeNeighborhoodWriteForm.tsx:1356` · `PhilifeBodyEditor.tsx:888` |
| 버튼 높이 ≠ 48 | 46 · 44 · 40 · 36 · 32 · 24 | `TradeBrowseLocationSheet.tsx:178/192/201`(44 강제) · `MarketFilterSheet.tsx:593/612`(32) · `OwnerStoreNoticesView.tsx:391`(24) · `MypageBottomSheetShell.tsx:103`(36) |
| 계약 밖 색 | — | `#0A823E` (`delivery-ad-owner-ui-presentation.ts:73`, `DeliveryAdOwnerProductSelectCard.tsx:69-78`) · `bg-red-50` (`MeetingJoinRequestModal:150`, `MeetingReportModal:122`, `OfferModal:166`) · `text-red-600` · `#f4f3ee` (`MessengerFriendProfileSheet:294`) |
| 비활성 = 투명도 | 8 | 배너·Cash·상품권·공유 `-50` · 첨부·게시글 메뉴 `-45` · 멤버 액션 `-40` |
| 눌림 반응 없음 | 약 14 | 사장님 매장 선택 3종 · `MyAdsPageClient:741` · `MeetingReportModal:116` · `ReportReasonModal:145` · `ReportReasonSelector.tsx:22` · `WriteSelectSheetField:96` · `TradeBrowseLocationSheet:226/275` · 상품권 친구 행 · `PointChargeForm` 요금제·결제수단 · `MemberPostPromoteSheet:335` |
| 글자 크기 | 10종 | 10·11·12·13·14·15·16·17·18·20 (10·11·13·15·17 은 기준 밖) |
| 폭 덮어쓰기 | 7 | 사장님 시트 `!max-w-md` |
| 제목 없음 · 한글 직접 | — | `PostDetailMoreBottomSheet.tsx:114/135/142`, `PostListMenuBottomSheet.tsx:153-194` |

### 2-D. 래퍼 경유 팝업 (2차 신규 31건 · 결함 23)

| 래퍼 | 팝업 (여는 곳) | 결함 |
|---|---|---|
| 메신저 홈 시트 `MessengerSheetUi.tsx:32` (자체 루트, z 1300) | 친구 추가 (`CommunityMessengerHome:3760`) · 친구 관리 (`:3697`) · 받은 요청 (`MessengerHomeMainSections:440`) · 거절 목록 (`MessengerArchiveScreen:124`) · 검색 (`:3715`) · 최근 검색 액션 · 설정 (`:3815`) | 가운데 팝업 폭 420 · `--messenger-*` 색(다크 변화) · `Sam.btn` 36px 행 버튼 (`MessengerFriendRelationCta.tsx:29`) · 비활성 `opacity-40/50` (`MessengerFriendAddSheet:150`, `MessengerSheetUi:192,232`) · 검색 시트가 반경 4 로 덮어씀 (`MessengerSearchSheet.tsx:116,456`) · 11·12·13·14px · 친구 추가 제목 키가 「새 대화」(`MessengerFriendAddSheet:118`) · 하단 여백 이중 (`MessengerFriendsPrivacySheet:53`) |
| 채팅방 시트 묶음 `CommunityMessengerRoomPhase2RoomSheets.tsx:124` (자체 루트) | + 첨부 · 첨부 확인 · 스티커 · 이모지 · ⋮ 메뉴 · 그룹 서랍 · 멤버 초대 | 반경 20/4 · **hex 다수** (`CommunityMessengerAttachmentSheet.tsx:400-517`: `#191919 #6B7280 #D1D5DB #ECECEC #E5E7EB #006241`) · 버튼 44·4 · 눌림 `opacity-90` · 비활성 `opacity-40/55` (`ChatRoomMoreMenu.tsx:155,338-424`) · `text-red-600` · `Sam.btn` (`CommunityMessengerGroupMemberPicker.tsx:291`) · 최대 폭 없음 |
| 길게 누르기 `MessageLongPressPopover.tsx:293` + `MessageActionMenu.tsx:26-28` | 말풍선 길게 누르기 | **`dark:` 클래스** · neutral 팔레트 · z 220 · 반경 14 · 비활성 `opacity-45` |
| 내정보 시트 `MypageBottomSheetShell.tsx` | 프로필 설정 · DIBAY ID · 전화번호 (`/my`) | X 36px · 행 눌림 `opacity-80` (`ProfileSettingsSheet:26`) · `Sam.btn` + `opacity-45/50` (`ProfileDibayIdSection:293,367`, `PhoneVerificationBox:282-333`) |
| 매장 상품 시트 `StoreProductSheetShell.tsx:16` | 매장 메뉴 탭 → 담기 (`StoreProductAddSheet:659`, `StoreModifierPicker:806`) | 머리 16/bold neutral · 상품명 18/800 · 본문 11~17px · 수량 버튼 36 `opacity-40` · rose 배지 · 상품명 줄바꿈 없음 |
| 고객센터 `SupportSheetShell.tsx` | 고객센터 (전역) | 폭 560 · 10~12px · 말풍선 반경 4 |
| 거래 글쓰기 `TradeWriteBottomSheet.tsx:150` | + 거래 글쓰기 | × 22px 글자 (경미) |
| 사장님 서랍 `OwnerMobileOpsMenuDrawer.tsx:137` | 사장님 ☰ | **z 1000/1010 < 사장님 하단 탭 1200** (`owner-compact-shell.css:210,244`, 사장님 탭도 `.app-bottom-nav-shell` z 1200 — `OwnerMobileBottomNav.tsx:291`) · `--biz-*` 색 |
| 글쓰기 확인 `WriteSheetFlowInner.tsx:459,472` | `/write` 나가기·카테고리 변경 | **z 60** (`/write` 페이지에서) |

### 2-E. 공통 미사용 자체 팝업 (22건)

| 팝업 | 여는 곳 | 결함 |
|---|---|---|
| `room/MessengerPhotoSelectSaveSheet.tsx:90` | 채팅방 사진 저장 | 반경 4 · 최대 폭 없음(태블릿 전폭) · 핸들 없음 · `--safe-bottom` |
| `delivery/ui/DeliveryModal.tsx:80-118` | 배달 도메인 모달 전부 | 폭 384 · 반경 4 · 제목 22 · 버튼 52·4·15 |
| `stores/browse/StoreListFilterChips.tsx:105` (`delivery-baemin-mirror.ts:60-69`) | 매장 목록 필터·정렬 | 반경 14 · 폭 768 · 제목 15 회색 · 행 17px 고정 높이 66 · hex `#7E8082 #362415 #F3F5F7` |
| `business/owner/ads/OwnerPlatformPopupApplyView.tsx:846` | 사장님 팝업광고 신청 최종 확인 | 자체 루트 z 80 · 폭 448 · sm 이상 반경 4 · 흐림 없음 · 하드웨어 뒤로가기·Escape 없음 |
| `chats/StoreOrderSellerOrderPanel.tsx:391` | 주문 채팅 판매자 패널 | 폭 512 · z 60~230 |
| `stores/commission/StoreCommissionLedgerTable.tsx:309` | 수수료 원장 → 주문 상세 | **z 40** (사장님 하단 탭 1200 아래 가능) · 768~1023 전폭 |
| `MessengerIncomingGroupInvitePopup.tsx:29` + `GlobalIncomingFriendRequestHost.tsx:87` | 그룹 초대 (여러 장 쌓임) | 배경 어둡게 없음 · sm 이상 512 · z 94/118 |
| `room/phase2/StoreOrderBuyerRoomSheet.tsx:227` | 채팅방 매장 주문 | 배달 반경 4/12 · 17px |
| `PhilifeHeaderNotificationInbox.tsx:1030` | 알림 종 (≥768 팝오버) | 배달 어둡게 색 · 흐림 없음 |
| `room/message/CallStubActionPopover.tsx:107` | 통화 기록 길게 누르기 | `dark:` 8곳 · 눌림 없음 (통화 진입 버튼 동작은 잠금 · 모양만) |
| 통화 키패드 · HTTPS 안내 (`CommunityMessengerCallClient.tsx:5698, 5855`) | 통화 중 | **통화 규정 · 보고만** |

### 2-F. 드롭다운 · 팝오버 (16건, 2차 13 신규)

| 위치 | 여는 곳 | 모양 | z |
|---|---|---|---|
| `chats/ChatDetailView.tsx:1781` | 거래 채팅 ⋮ | 반경 4 · `sam-text-body` | 80 |
| `chats/ChatRoomListMenu.tsx:85` | 채팅 목록 ⋮ | `disabled:opacity-50` | 25 |
| `chats/ChatInputBar.tsx:287,467 / :380` | 첨부 + (데스크톱) / 이모지 | 반경 4 | 30 / 20 |
| `community-messenger/MessengerHomeInlineFriendSearch.tsx:196,202` | 메신저 친구 검색 결과 | 자체 어둡게 300vw | 29/30 |
| `group/GroupMentionAutocomplete.tsx:71` | @멘션 | — | 30 |
| `community/ui/CommunityMoreMenu.tsx:197-202` · `CommunityOwnPostMoreMenu.tsx:40` · `post-detail/CommunityCommentItem.tsx:197` | 필라이프 ⋯ | 반경 16 · `--cm-*` | 40/50 |
| `community/CommunityFeed.tsx:1891` | 필라이프 정렬 | 행 약 36px (최소 44 미달) | 200 |
| `meetings/MeetingRoomHero.tsx:162` | 모임 ⋮ | — | 30 |
| `mypage/purchases/PurchaseHistoryCard.tsx:165` · `sales/SalesHistoryCard.tsx:149` · `seller/SellerTradeRow.tsx:86` | 구매·판매 내역 ⋮ | — | 60 |
| `write/trade/TradeMeetSpotPickClient.tsx:788` | 거래 장소 주소 자동완성 | `max-h-52` | 130 |
| `business/owner/OwnerStoreMenuSectionPicker.tsx:108` | 사장님 메뉴 구역 선택 | — | 60 |
| `stores/browse/StoresBrowseHeaderMenuTabs.tsx:248-254` | 매장 「메뉴 전체보기」 | hex `#362415` · 15/700 | 3 |
| `home/HomeTradeHubFloatingBar.tsx:160` | 홈 거래 허브 | DibayBottomSheet 옆에 **자체 어둡게 층 중복** | 20 |

→ 대부분 바깥 `mousedown` 으로만 닫힘. Escape 는 `OwnerStoreMenuSectionPicker` 만. 모양·반경·행 높이·z 가 모두 다름.

### 2-G. 알림 배너 · 토스트 · 브라우저 확인창

**배너 (2차 신규)**

| 배너 | 여는 곳 | 모양 | 결함 |
|---|---|---|---|
| `notifications/InAppNotificationBannerHost.tsx:143` | 메신저·부재중·주문·공지 수신 (전역) | 위 · 512 · 반경 16 · 14/13 · 4초 · 위로 밀어 닫기 | `--sam-*` 색 · 누름 효과 없음 · z 50 (사장님 머리 z 55 아래 가능, `StoresOwnerStackHeader.tsx:55`) |
| `support/SupportInAppNoticeHost.tsx:50` | 고객센터 답변 | 위 · 반경 **4** · 13/13 · 4초 | 위 배너와 반경·글자 다름 |
| `layout/WebConnectivityBanner.tsx:32` | 오프라인 | 위 · 알약 · 14 | `--sam-warning` |
| `GlobalIncomingFriendRequestHost.tsx:87` | 그룹 초대 쌓임 | 탭 위 · 카드 | 배경 없음 (§2-E) |
| `resource-access-denied-flow.ts:22` | 없는 정보 접근 → 자동 이동 | 위 · 반경 4 · 13 · `neutral-900/92` · 2.4초 | z 140 (시트 아래) |

**토스트 10종**

| 토스트 | 반경 | 글자 | 시간 | z |
|---|---|---|---|---|
| `OwnerToastHost.tsx:92` | 4 | 13 | 3.2초 | 130 |
| `StoreDetailToast.tsx:28` | 12 | 13 | 2.4초 | 90 |
| `MypageToastHost.tsx:94` | 4 | 14 | 3/5초 | 60 |
| `MessengerSnackbarHost.tsx:67` | 4 | 13 | 3.2~7초 | 200 |
| 필라이프 3곳 (`CommunityDetail:739`, `CommunityMoreMenu:250`, `CommunityShareSheet:67`) | 알약 | 14 | 3.2/4/3.2초 | 120~1400 |
| 거래 목록 (`HomeProductList:1361`, `PostListByCategory:1145`) | 알약 | 14 | 2초 | **20** |
| 거래 채팅 `ChatDetailView.tsx:2387` | 0 · 전폭 | 12 | 4.2초 | 55 |
| 알림 상세 삭제 실패 `notifications/[notificationId]/page.tsx:457` | 4 | 13 | 3초 | 70 |
| 사장님 알림 오류 `OwnerNotificationList.tsx:563` | — | — | — | 70 (사장님 탭 아래) |
| 접근 불가 `resource-access-denied-flow.ts` | 4 | 13 | 2.4초 | 140 |

**브라우저 확인창:** `orders/customer-commerce/CustomerGiftWalletBody.tsx:387` — 상품권 지갑 「보낸 선물」 → 취소. 「상품권 선물을 취소할까요?」를 **브라우저 기본 확인창**으로 띄움. 앱 팝업과 모양이 완전히 다르고, Android WebView 에서는 사이트 주소가 제목으로 나올 수 있음 (NOT_PROVEN). 취소 실패 시 안내도 없음.

### 2-H. 미사용 팝업 (호출처 없음 18)

`DeliveryOrderConfirmModal` · `CancelOrderRequestModal` · `MessengerCallLogDeleteConfirmDialog` · `AddressDesignationDupConfirmModal` · `DeliverySheet` · `TradeBuyerPickerModal`(테스트가 제거 확인) · `OfferListSellerModal` · `OfferModal` · `StoreCommerceCartBottomSheet` · `StoresBrowsePrimaryIndustryMenuPanel` · `StoresBrowseHeaderPrimaryTabs` · `DibayBottomNotificationBanner` · `CommunityMessengerBellPinnedAlerts` · `CommunityShareTargetPicker` · `StoreProductOptionPicker` · `StoresHomeSearchModal`(테스트만) · `ProductDetailHeaderToolbar` · `TradeHeaderComposeButton`.
(삭제 전 동적 import·테스트 참조 재확인 필요)

### 2-I. 기기별 (APK · iOS · 태블릿) — 코드 근거, 실기 NOT_PROVEN

| # | 차이 | 근거 |
|---|---|---|
| P-1 | 태블릿에서 전폭 시트 / 512 시트 / 768 시트 / 560 시트가 섞임 | §2-C·D·E |
| P-2 | 폭 기준 9종: 280 · 320 · 384 · 400 · 420 · 448 · 512 · 560 · 768 | |
| P-3 | 640px 이상에서 가운데 팝업으로 바뀌는 시트(반경 4)와 안 바뀌는 시트 | `OwnerPlatformPopupApplyView`, `StoreOrderSellerOrderPanel`, `StoreOrderBuyerRoomSheet` |
| P-4 | 키보드 열림: 공통 시트 `--kb-safe-bottom`, 자체 시트 6종 `--safe-bottom` → 키보드 위 빈 띠 | `dibay-overlay.css:185` vs `PhotoSave:90` 등 |
| P-5 | 다크모드 폰: 길게 누르기 메뉴만 검게, 다른 팝업은 글자만 흐려짐 | C-7 |
| P-6 | iPhone 가로 노치 | C-8 |
| P-7 | 탭바·시트 아래 깔릴 수 있는 팝업: 사장님 서랍(1000/1010), 수수료 상세(40), `/write` 확인창(60), 거래 목록 토스트(20), 사장님 알림 오류 토스트(70), 수신 배너 vs 사장님 머리(50 vs 55) | §2-D·E·G |

### 2-J. 통화 (통화 변경 규정 · 보고만)

- 통화 배너·안내 색 `#00754A/#006241` ≠ 브랜드 `#0B421A` (`incoming-call-banner-tokens.ts:13-39`).
- 통화 키패드 하단 `env(safe-area-inset-bottom)` → Android WebView 0.
- 네이티브 통화 안내 시간 Android 「닫을 때까지」 / iOS 1.6초, 위 여백 `max(8dp, inset)` / `safe+8`.
- 채팅방 ⋮ 메뉴의 음성·영상 행, 발신 확인창 = 통화 진입점 → 동작·문구 잠금.
- 통화 중앙 안내는 공통 다이얼로그 사용 → §4 T1 반영 시 **모양만** 함께 바뀜 (동작 무변경). 그래서 T1 실기 확인에 통화 안내 1건 포함.

---

## 3. 최종 통일 기준 (권장 기준 · 단일 SSOT)

레거시 앱 형태(iOS 알림창·액션시트, 카카오·당근·배민의 시트·토스트)를 기준으로 하고, 색은 디바이 브랜드 토큰만 씁니다. 팝업 바탕은 항상 흰색(라이트 고정)입니다.

### 3-0. 기존 계약 v1.0.0 과 다른 값 (Owner 이번 지시로 채택 · 충돌 보고)

| 항목 | v1.0.0 | 최종 | 이유 |
|---|---|---|---|
| 팝업 버튼 글자 | 14/600 | **15/600** | 버튼 글자가 본문(16)보다 지나치게 작음. 레거시 앱 버튼 15~17 |
| 위험 버튼 눌림 | `brightness(.92)` | **진해짐 색 `color-mix(#d45252 82%, #000)` + 0.98** | 주 버튼과 같은 방식 |
| 액션시트 행 눌림 | 배경 + 0.98 | **배경만** | 전폭 행이 줄어드는 것은 레거시 앱에 없음 |
| 빠른 실행 원 | 0.94 + brightness, 비활성 opacity .4 | **0.98 + 진해짐, 비활성 회색** | 2종 규칙 |
| TS `OVERLAY_COLOR` | `#085C3F`, `#E53935` | **`#0B421A`, `#d45252`** | CSS 토큰과 일치 |
| 제목·본문 줄바꿈 | 없음 | **keep-all + anywhere + pre-line** | 넘침·잘림 해결 |

그 밖의 LOCKED 값(다이얼로그 반경 16, 시트 위 24, 버튼 반경 12, 브랜드색)은 그대로입니다.

### 3-1. 팝업 종류 7가지만 (그 밖의 형태 금지)

| 종류 | 언제 | 컴포넌트 |
|---|---|---|
| ① 확인창 | 예/아니오 결정, 버튼 1~3 | `DibayConfirmDialog` / `dibayConfirm` |
| ② 안내창 | 알림만, 버튼 1 | `DibayInfoDialog` / `dibayAlert` |
| ③ 입력창 | 짧은 입력 1~2칸 | `DibayPromptDialog` / `dibayPrompt` |
| ④ 선택 시트 | 메뉴·목록에서 고르기 | `DibayActionSheet`, `DibayBottomSheet` + `DibayMenuList` |
| ⑤ 입력 시트 | 폼·상세·작성 | `DibayBottomSheet` + `DibaySheetHeader` + 고정 하단 버튼 |
| ⑥ 팝오버 메뉴 | ⋮·⋯·길게 누르기·드롭다운 | **신규 클래스 `OverlayUi.popover*`** (위치 계산은 각자 유지) |
| ⑦ 토스트·상단 배너 | 결과 알림·수신 알림 | **신규 `DibayToastHost` 1개** + 배너 클래스 `OverlayUi.banner*` |

### 3-2. 크기

| 종류 | 휴대폰 | 태블릿 ≥768 · 가로 | 높이 |
|---|---|---|---|
| ①②③ | `min(100% − 32px, 320px)` | 320 | `min(100dvh − 32 − safe, 560)` · 본문만 스크롤 · 버튼 고정 |
| ④⑤ | 전폭 | **가운데 512** (전폭·448·560·768 금지) | 2단계만: 기본 `min(82dvh,560)` · 긴 목록 `min(88dvh,720)` |
| 서랍 | `min(280px, 88vw)` | 같음 | 전체 |
| ⑥ | `min(92vw, 280px)` | 같음 | 행 최대 7개, 넘치면 스크롤 |
| ⑦ 토스트 | `min(100% − 32px, 384px)` | 384 | 1~2줄 |
| ⑦ 상단 배너 | `min(100% − 24px, 512px)` | 512 | 최소 64 |

여백: 다이얼로그 24/20/20 · 시트 12/16/20 + 하단 `--kb-safe-bottom` 1회 · 좌우 `max(16px, --safe-left/right)`.

### 3-3. 글자 5단계 + 버튼 (그 밖의 px 금지)

| 역할 | 크기/굵기/줄높이 |
|---|---|
| 다이얼로그 제목 | 20/700/1.4 · 가운데 · **질문 한 문장만** |
| 시트 제목 | 18/600/1.4 |
| 본문 · 메뉴 행 | 16/400(행 500)/1.6 |
| 보조 본문 | 14/400/1.6 |
| 캡션 · 오류 · 시간 · 배지 | 12/400~600/1.4 |
| 버튼 | 15/600 |

줄바꿈: 제목·본문 `word-break: keep-all; overflow-wrap: anywhere; white-space: pre-line`. 시트 머리·목록 이름·배너 제목만 1줄 말줄임, 배너·토스트 본문 2줄 제한.

### 3-4. 버튼 · 칩 · 행 (CTA)

공통: 버튼 높이 48, 반경 12, 2개 = 가로 1:1 간격 12 (**취소 왼쪽 · 확정 오른쪽**), 3개 이상 = 세로 (**주 버튼 맨 위 · 취소 맨 아래 글자 버튼**).

| 역할 | 기본 | 눌림 (100ms) | 비활성 |
|---|---|---|---|
| 주 | `#0B421A` · 흰 글자 | `--sm-color-primary-active` + 0.98 | 회색 토큰 바탕 + 회색 글자 |
| 보조 | 흰 · 테두리 `#E5E7E8` · 회색 글자 | `#F5F7F6` + 0.98 | 같음 |
| 위험 | `#d45252` · 흰 글자 | `color-mix(#d45252 82%, #000)` + 0.98 | 같음 |
| 글자 | 투명 · 회색 글자 | `#F5F7F6` + 0.98 | 투명 + 회색 |
| 칩 (선택) | 높이 40 · 알약 · 14/500 · 테두리 | 0.98 + `#F5F7F6` | 회색 |
| 칩 (선택됨) | `#0B421A` · 흰 글자 | 진해짐 + 0.98 | — |
| 목록 행 · 메뉴 행 | 높이 48 · 16/500 | **배경 `#F5F7F6` 만** | 회색 글자 |
| 아이콘 버튼 (X 등) | 원 40 · 터치 44 | 배경만 | — |
| 선택 카드 (요금제·사유·상품) | 반경 12 · 테두리 | 0.98 + 배경 | 회색 |

- `opacity` 로 비활성·눌림 표시 금지. 팝업 안 `Sam.btn`/`sam-btn` 금지 (앱 화면 버튼은 그대로 46·4 유지).

### 3-5. 색 (팝업 안)

브랜드 `#0B421A` · 위험 `#d45252` · 글자 주 `--overlay-text-primary`, 보조 `--overlay-text-secondary` · 테두리 `#E5E7E8` · 눌림 `#F5F7F6` · 선택 연한 바탕 `--sm-color-primary-soft` · 오류 박스 `color-mix(#d45252 8%, #fff)` · 경고 박스 `color-mix(#d4a017 10%, #fff)` · 배경 어둡게 `rgba(0,0,0,.5)` + 흐림 4px.
**금지:** `--sam-*`·`--messenger-*`·`--cm-room-*`·`--biz-*`·`--delivery-*` 색, `dark:`, Tailwind 팔레트색, 직접 hex.

### 3-6. 시트 머리 2종

- ④ 선택 시트: 핸들 + 가운데 제목 18/600, X 없음, 바깥 누르면 닫힘.
- ⑤ 입력 시트: 핸들 + `DibaySheetHeader` (왼쪽 제목 + X 40/터치 44) + 하단 버튼 고정.
- 제목 없는 시트 금지 (화면에 안 보여도 `aria-label` 필수).

### 3-7. 쌓임 순서 (z) — 5단계만

| 층 | z | 대상 |
|---|---|---|
| 페이지 안 드롭다운 | 페이지 상대 | ⑥ (단, 탭바를 덮어야 하는 위치면 1300) |
| 하단 탭 · FAB | 1200 · 1255 | (현행 유지) |
| 시트 · 다이얼로그 · 서랍 · 배너 | **1300** | ①~⑤, 서랍, 상단 배너 |
| 중첩 (시트 위 확인창) | **1305** | |
| 토스트 | **1310** | ⑦ 토스트 (항상 맨 위) |

통화 화면 z 는 통화 규정으로 별도.

### 3-8. 문구·CTA 표준

| 의미 | 문구 | 색 |
|---|---|---|
| 그만두기 | **취소** · 작성 중 나가기 확인에서만 **계속 작성** | 보조 |
| 작성 중 나가기 | **나가기** | 위험 |
| 되돌릴 수 없는 행동 | 동사: **삭제 · 차단 · 나가기 · 주문 취소 · 거절 · 탈퇴 요청** (「확인」 금지) | 위험 |
| 되돌릴 수 있는 행동 | 동사: 보관 · 숨기기 · 해제 · 변경 · 읽음 | 주 |
| 안내만 | **확인** | 주 |
| 신고 접수 | **신고** | 주 |
| 질문 끝 | **~할까요?** | — |
| 서버 오류 | 제목 「처리하지 못했어요」 + 원문은 캡션 | — |
| 금액·포인트 단위 | 한글 문장 안 Cash·Coin·Point 는 상품명이므로 유지, 영문 단독 문장 금지 | — |

### 3-9. OS 피커 · 브라우저 확인창

- 날짜·시간·`<select>` 의 **열린 목록은 OS 기본 유지** (레거시 앱도 OS 피커 사용). 누르는 칸만 입력칸 기준(48·12·16px).
- `window.confirm/alert/prompt` 앱 사용 **0** — 공급자 미연결 대비 대체용(`DibayAppDialogProvider.tsx:184-206`)만 남김.

### 3-10. 토스트 · 상단 배너

- 토스트: 탭바 위 `calc(탭 높이 + 12px + safe)`(탭 없는 화면 `16px + safe`) · 반경 12 · 14/500 · `rgba(17,17,17,.92)` 흰 글자 · 성공/오류는 왼쪽 아이콘만 다름 · **3초 (행동 버튼 있으면 5초)** · z 1310 · 1개씩 줄 세움.
- 상단 배너: `top: safe + 8` · 반경 16 · 흰 바탕 · 그림자 elevation-2 · 제목 14/600 1줄 · 본문 14 2줄 · 4초 · 위로 밀어 닫기 유지 · z 1300. (통화 배너 제외)

---

## 4. 최종 수정 설계 — 기능 무영향 원칙

### 4-0. 기능 보존 규칙 (모든 단계 공통)

1. **트랙 T (모양만)**: CSS 클래스·토큰·문구 표시만 바꿉니다. 다음은 **바꾸지 않습니다**: `open/onClose/onConfirm` 등 핸들러, 열고 닫는 조건, 타이머, API 호출, 라우팅, 포털 위치, 루트 컴포넌트, 하드웨어 뒤로가기 등록, 스크롤 잠금, 포커스, 키보드 밴드 처리, 애니메이션 시간, `data-*` 속성(테스트·CSS 훅), i18n **기존 키 값**.
2. **루트 교체 금지 목록** (교체하면 동작이 바뀜 → 클래스만 교체): 메신저 홈 시트(자체 키보드 밴드·3가지 위치), 채팅방 시트 묶음(`activeSheet` 공용 컨테이너·뒤로가기 `:120`), 길게 누르기(메시지 옆 위치 계산), 사장님 서랍(포커스 가두기·`inert`·270ms), 거래 글쓰기 시트(520ms 닫힘 후 이동), 고객센터(자체 `pushState`), 로그인 게이트(키보드 최대 높이), 내정보 시트(끌어서 닫기), 매장 상품 시트(이중 포털·항상 열림).
3. **트랙 B (동작이 바뀌는 결함 수정)**: z 순서, 배경 추가, `window.confirm` 교체, 토스트 시간 통일, 미사용 삭제, 이중 뒤로가기. 결함이므로 고치되, 바뀌는 동작을 항목마다 적고 **트랙 T 와 섞지 않고 따로 반영**합니다.
4. 문구는 기존 i18n 키를 고치지 않고 **새 표준 키를 추가**해 팝업 호출처만 바꿉니다 (같은 키를 쓰는 다른 화면 보호).
5. 통화 파일(`call*`, `call-ui`, `call-v3/v4`, `CallInAppNotice*`, 네이티브 통화)은 어느 단계에도 넣지 않습니다.

### 4-1. 단계

| 단계 | 트랙 | 파일 | 바뀌는 것 | 영향 화면 | 깨질 수 있는 것 → 같은 단계 처리 |
|---|---|---|---|---|---|
| **T1 기준** | T | `app/dibay-overlay.css`, `lib/ui/dibay-overlay-contract.ts` (+ 테스트 기대값), `components/ui/MobileConfirmBottomSheet.tsx`·호출 26곳 (tone 명시), `LogoutConfirmModal.tsx` | §3-0 전부 · 신규 클래스 `popover*`·`banner*`·`chip*`·`selectCard*` 추가 (아직 미사용) | 공통 팝업 전부 (통화 중앙 안내 모양 포함) | 줄바꿈으로 제목이 2줄 → 본문 스크롤로 흡수 · 버튼 15px 로 긴 문구 2줄 → 버튼 문구 8자 규칙(§3-8) · `dibay-overlay-contract.test.ts` 갱신 |
| **T2 다이얼로그** | T | §2-B 구조 15 + 경미 11 + 문구·색 혼선 호출처 + 사장님 확인창 3 | 본문 안 버튼 → `actions` · 직접 버튼 제거 · 폭·반경 덮어쓰기 제거 · 다크 변화 색 → overlay 토큰 · 문구·tone 표준 · 버튼 3개 순서 | 글쓰기·상품권·장바구니·로그인·사장님 광고·필라이프 신고·모임·로그아웃·업데이트 | 로그인 게이트 폭 448→320: 소셜 버튼 4개 세로라 폭 축소 OK, 키보드 최대 높이 변수 유지 · 「Cash 잔액 부족」 같은 링크 2개는 **모양만** 바꾸고 링크 결함은 B5 로 |
| **T3 시트** | T | §2-C 결함 40 + §2-D 래퍼 23 (클래스만) | 버튼 → `DibayOverlayButton` · 행 → 행 클래스 · 칩·선택 카드 클래스 · 글자 5단계 · 색 토큰 · 폭 512 · 머리 2종 | 사장님 광고·주문·배너·공지 · 거래 필터·위치·문구·선택 · 상품권 · 주문 상세·영수증 · 필라이프 작성 · 게시글 메뉴 · 메신저 홈 시트 · 채팅방 시트 · 내정보 시트 · 매장 상품 시트 · 고객센터 | 칩 32→40 으로 필터 줄 늘어남 → 가로 스크롤 유지 · 메신저 방 시트 = 뷰포트 계약 대상 → `docs/community-messenger-mobile-room-viewport.md` §7 기록 · 매장 상품 시트 하단 담기 바(`store-commerce-bottom-action-bar.ts`)는 페이지와 공용 → 시트 안에서만 클래스 분기 |
| **T4 자체 팝업·드롭다운·배너** | T | §2-E 22(통화 제외 20) · §2-F 16 · §2-G 배너 4 | 루트 유지 + 패널·행·버튼 클래스만 교체 · `dark:` 제거 · 전폭 시트 512 제한 · `--safe-bottom` → `--kb-safe-bottom` · 가로 safe | 채팅방 · 배달 전체 · 매장 목록 · 사장님 · 필라이프 · 메신저 검색 · 내역 ⋮ · 수신 배너 | 배달 모달 규칙(`delivery-components.css:868,938,1494-1530`)을 같은 단계에서 삭제 · 매장 필터 mirror 상수는 다른 화면 공용 여부 확인 후 시트 전용 상수로 분리 |
| **B1 쌓임 순서** | B | `owner-compact-shell.css:210,244` · `StoreCommissionLedgerTable.tsx:309` · `WriteSheetFlowInner.tsx:459,472` · `PostListByCategory`/`HomeProductList` 토스트 · `OwnerNotificationList.tsx:563` · 수신 배너 · 길게 누르기 · 드롭다운 | §3-7 로 z 조정 | 사장님 서랍이 탭을 덮음 · `/write` 확인창이 위로 | **동작 변화:** 서랍이 탭바를 덮어 탭 누르기가 막힘 (의도) |
| **B2 배경·닫기** | B | 그룹 초대 · `OwnerPlatformPopupApplyView` · `HomeTradeHubFloatingBar.tsx:160` | 그룹 초대에 배경 어둡게 · 사장님 광고 확인에 뒤로가기·Escape · 홈 허브 중복 배경 제거 | 메신저 홈 · 사장님 광고 · 홈 | **동작 변화:** 그룹 초대 중 뒤 화면 누르기 막힘 |
| **B3 브라우저 확인창** | B | `CustomerGiftWalletBody.tsx:387` | `window.confirm` → `dibayConfirm` (같은 문구, 위험 tone, 「선물 취소」) | 상품권 지갑 | 동기 → 비동기: 이미 `async` 블록 안이라 흐름 동일 |
| **B4 토스트 통일** | B | 신규 `DibayToastHost` · 기존 10종 | §3-10 | 토스트 쓰는 모든 화면 | **동작 변화:** 표시 시간이 2~7초 → 3/5초 · 메신저 행동 버튼(되돌리기) 유지 · 매장 상세 오프셋 유지 |
| **B5 개별 결함** | B | `DeliveryAdOwnerInsufficientCashSubmitModal.tsx:83,98` (두 버튼 같은 링크) · `SupportModalHost.tsx:696-714` (이중 뒤로가기) · 서버 오류 제목 4곳 | 링크 분리 · 뒤로가기 1회 · 오류 표기 | 사장님 광고 · 고객센터 | 링크 분리 대상 주소는 계약 문서 확인 후 (없으면 「Owner 결정 필요」) |
| **C 정리** | — | 미사용 18 · 옛 CSS · 원장 재작성 | 삭제 · `docs/ui/dibay-overlay-inventory.md` 를 이 문서 기준으로 다시 작성 | 없음 | 삭제 전 `grep` 0 · 동적 import · 테스트 참조 정리 |

### 4-2. 검증 (단계마다)

- 코드: `npm run typecheck:build` · 관련 vitest (`components/ui/dibay-overlay/__tests__`, `lib/ui/__tests__`, 변경 컴포넌트 테스트) · 변경 파일 eslint · 문구 변경 시 `verify:i18n` 계열.
- 기능 무영향 확인: 단계 diff 에 핸들러·조건·타이머·API·라우팅 변경이 없는지 리뷰 (트랙 T). 트랙 B 는 바뀐 동작만 있는지 확인.
- 실기 (Production SHA 기록, PHT 시각): Android 폰(설치 버전 `user_devices.app_version` 확인) · iPhone · 태블릿 세로/가로 · 다크모드 폰 1대. 단계별 대표 팝업 캡처 → 크기 · 글자 · 버튼 색·눌림 · 긴 문구 줄바꿈 · 키보드 열림 · 탭바 겹침. T1 에는 통화 중앙 안내 1건 포함(모양만).
- 배포 구분: 전 단계 **웹** (네이티브·DB 변경 없음 → 앱 재빌드 불필요, 배포 후 앱 재시작).

---

## 5. 판정 요약

| 항목 | 판정 |
|---|---|
| 팝업 전수 목록·위치 (코드) | 2차까지 확인 · 1차 누락 약 83건 추가 · 내 오류 2건 정정 (§0) |
| 크기·글자·버튼·눌림 통일 | **FAIL** — 폭 9종 · 글자 11종 · 버튼 높이 8종 · 반경 8종 · 눌림 7종 · z 22종 · 토스트 10종 |
| 행 밖으로 벗어남·줄바꿈 | **FAIL (코드)** — C-1 |
| 다크모드 폰 | **FAIL (코드)** — C-7 |
| APK · iOS · 태블릿 실기 화면 | **NOT_PROVEN** |
| 기존 원장 「110 DONE」 | 사실과 다름 → C 단계에서 재작성 |
| 통화 화면 | 보고만 (통화 규정) |

---

## 7. 구현 결과 (2026-11-02 · main 반영 · 웹만)

| 단계 | SHA | 비고 |
|---|---|---|
| T1 기준 | `91349921d` | §3-0 전부 + 공용 부품 클래스 |
| T2 다이얼로그 | `081b85f3f` | 구조 15 · 경미 11 · 문구·CTA (신규 키 `popup_*`, 기존 키 값 변경 0) · 「오류 글자 회색」 숨은 결함 8곳 정정 |
| T3 시트 | `be5d808aa` | 74 파일 · 페이지 공용 부품 `surface="overlay"` 분기 · 경고색 `--overlay-warning` 추가 |
| T4 자체 팝업 | `5491d1b10` | 39 파일 · X 버튼 44 · **T2 작업자 결함 정정**(사장님 확인창 `#ffffff` → 토큰, owner-ui-token-ratchet) |
| B | `ffc1e1094` | B1 z · B2 사장님 팝업광고 뒤로가기 · B3 `window.confirm` 0 · B4 토스트 13곳 1종 |
| C | (C 커밋) | 미사용 14개 삭제 · 옛 CSS/토큰 · 원장 `docs/ui/dibay-overlay-inventory.md` 재작성 |

**설계와 다르게 결정한 것 (코드 확인 후)**
- §3-7 토스트 z 1310 → **1320** (Auth gate 가 1310). 상단 배너 1300 → **1270** (통화 화면 1280 아래 유지 — 기존 설계 메모).
- 사장님 서랍 1300 대신 **1290/1291** (공통 다이얼로그 1300 아래).
- B2 그룹 초대 배경 · 홈 허브 중복 배경 · 알림함 딤 · B5 고객센터 이중 뒤로가기 → **철회** (결함 아님, 원장 §4).
- B5 Cash 부족 두 버튼 같은 주소 → **Owner 결정 필요** (분리할 주소 없음).
- 채팅방 시트 하단 safe → 키보드 계약 K-01 문자열 유지.
- 메신저 친구 추가 가운데 팝업 420 유지.

**판정:** 코드 PASS (각 단계 typecheck·vitest·eslint·i18n·계약 검사). Production·실기(Android·iPhone·태블릿·다크모드) = **NOT_PROVEN** — Owner 실기 확인 필요.

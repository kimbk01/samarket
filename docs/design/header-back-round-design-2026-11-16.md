# 헤더 뒤로가기 — 원형 테두리 · 눌림 · 소리 전수 감사·설계 (2026-11-16)

- 기준: `origin/main dcdd8aed0` (조사 시작 986eff108, 사이 변경은 뒤로 관련 파일 없음 — 시안 CSS 는 dcdd8aed0 원문)
- 시안: `docs/design/header-back-round-mockup-2026-11-16.html` (앱 CSS 원문 + 제안 CSS 1블록, 눌러 보기·소리 포함)
- 실기 캡처: `docs/design/header-back-round-2026-11-16/01-now-samsung-chatroom-header.png` (Samsung SM-M156S, 메신저 1:1 방, 06:07 PHT)
- 상태: Owner 「기본값대로 구현」(2026-11-16) → 구현 PR `feat/header-back-round` (§5 충돌 항목은 모두 기본값)

## 0. Owner 지시 원문

> 「디바이의 헤더 뒤로가기 부분을 전체 감사 해서, 지금은 뚜렷한 구분이 없는 부분이다, 원형 테두리에 뒤로 가기를 정확한 버튼 눌림과 사운드가 들어 가는 부분을 원하는 부분이다, 뒤로가기를 전수 감사 해서 위내용을 위한 설계안과 시안을 보고 해라」
> 「< 표시가 상하 좌우의 중앙에 위치 하는 부분을 정확히 해줘야 하는 부분이다」

요구 4가지: **R1 원형 테두리 · R2 정확한 눌림 · R3 소리 · R4 ‹ 상하좌우 정중앙.**

---

## 1. 감사 결과 요약

| # | 항목 | 지금 | 판정 |
|---|---|---|---|
| A1 | 버튼 구분(테두리·바탕) | 공용 `.sector-header-back` = 테두리 0 · 바탕 투명 · 4px 모서리. ‹ 글자만 보임 (실기 캡처) | **FAIL** (지시: 원형 테두리) |
| A2 | 눌림 | 공용 = `:active` 때 4px 네모에 금색 14% 바탕 140ms. 손가락에 가려 거의 안 보임. 메신저 방 헤더만 36px 원 바탕이 눌릴 때 나타남 | **FAIL** (지시: 정확한 눌림) |
| A3 | 소리 | 헤더 뒤로·닫기 **0곳** (전수). 앱의 「딸깍」 코드는 있으나 CTA·FAB·전화 인증 등에서만 씀 | **FAIL** |
| A4 | ‹ 정중앙 | 글자 ‹(U+2039)는 글꼴이 위치를 정함 — 실측 **Mac Chrome 왼쪽 1.19·아래 3.50px**, **Samsung 실기 왼쪽 0.98·아래 2.53px** | **FAIL** |
| A5 | 모양 종류 | ‹ 글자 · SVG 꺾쇠(`M15 6 9 12l6 6`) · SVG(`M15 5l-7 7 7 7`) · lucide `ChevronLeft` · 「‹ 뒤로」 글자 pill — **5종** | 불일치 |
| A6 | 크기 종류 | 48(공용·줄 안) · 40(줄 밖 기본) · 36(배달 `!h/!w`) · 44(h-11) · 48+36원(방 헤더) — **5종** | 불일치 |

### 1-1. ‹ 중심 실측 (A4)

방법: 잉크(실제로 칠해진 픽셀) 상자의 중심 − 원(터치 상자) 중심. + = 오른쪽·아래.

| 모양 | 환경 | 잉크 크기 | 가로 | 세로 | 판정 |
|---|---|---|---|---|---|
| 지금 ‹ 글자 | Mac Chrome 배율 8 (SF) | 7.6×12.3 | −1.19 | +3.50 | FAIL |
| 지금 ‹ 글자 | Samsung SM-M156S 운영 앱 캡처 (줄 52·터치 x4 기준) | 6.4×12.8 | −0.98 | +2.53 | FAIL |
| 바꾼 뒤 SVG 꺾쇠 | Mac Chrome 배율 2·3·8 | 7.5×13 | 0.00 | 0.00 | PASS (코드·시안) |
| 바꾼 뒤 SVG 꺾쇠 · 누른 상태 0.9배 | Mac Chrome 배율 8 | 6.75×11.75 | 0.00 | 0.00 | PASS (코드·시안) |
| 바꾼 뒤 SVG 꺾쇠 | Mac Chrome 배율 2.8125 (Samsung 배율) | 7.8×13.2 | +0.36 | −0.18 | 기기 화소 1개(0.36px) 이내 — 화소 반올림 |
| 바꾼 뒤 SVG 꺾쇠 | Android·iPhone 실기 | — | — | — | NOT_PROVEN (구현 후 같은 방법) |

- iPhone 의 지금 ‹ 위치는 재지 않음 → NOT_PROVEN. 글꼴(SF)이 Mac 과 같아 Mac 값과 비슷할 것이나 판정에 쓰지 않는다.
- Samsung 값은 줄 아래 구분선(y=260 기기 화소)에서 줄 높이 52 를 거꾸로 잡아 계산했다(터치 상자 x4·줄 52 는 헤더 SSOT 값). 측정 스크립트: 작업 폴더 밖 임시(보존 안 함).

---

## 2. 전수표 (origin/main, 저장소 전체 `git grep`)

### 2-A. 공용 부품 `AppBackButton`(=`SectorHeaderBackButton`) — 1곳 고치면 모두 바뀜

| 파일:줄 | 화면 | 지금 크기 |
|---|---|---|
| `components/layout/sector-header/DefaultHeader.tsx:43·149·206` | `DefaultHeader`·`DetailHeader`·`SearchHeader` 래퍼 | 48/24 |
| `components/layout/RegionBar.tsx:184` (DetailHeader 경유) | 메인 1단 하위 화면 전부 — 경로 표 `lib/layout/resolve-main-tier1.ts` backHref 79곳 | 48/24 |
| `components/my/MySubpageHeader.tsx:179` · `components/mypage/ds/MyScreen.tsx:119` | 내정보 하위 | 48/24 |
| `components/layout/TradePrimaryColumnStickyAppBar.tsx:59` | `/philife/my` | 48/24 |
| `components/stores/chrome/DeliverySubpageHeader.tsx:37` | 매장 정보·신고·장바구니·리뷰(✕) | 48/24 |
| `components/community-messenger/CommunityMessengerHome.tsx:3459` · `components/trade/TradeHistoryStackPanel.tsx:50` | 메신저 스택 · 거래내역 패널 | 48/24 |
| `components/delivery/search/DeliverySearchHeader.tsx:27` · `components/trade/search/TradeSearchPage.tsx:73` | 배달 검색 · 거래 검색 | 48/24 |
| `components/addresses/AddressEditorPageClient.tsx:71` · `AddressManagementClient.tsx:587` · `components/map/AddressSelectClient.tsx:440·457` | 주소 | 48/24 |
| `components/community/post-detail/CommunityPostDetailHeader.tsx:76` · `components/post/PostDetailView.tsx:544·574` | FEED 글 · 거래 글 상세 | 48/24 |
| `components/my/edit/ui/ProfileEditHeader.tsx:37` | 프로필 편집 | 48/24 |
| `components/chats/StoreOrderBuyerChatTop.tsx:368` | 구매자 매장 주문 채팅 (배달 헤더 파일) | 48/24 |
| `components/stores/browse/StoresBrowseHeaderChrome.tsx:101` | `/stores/browse/*` (배달 헤더 파일) | 48/24 |
| `components/stores/home/hub/StoresGreenFixedHeaderChrome.tsx:86` | 사장님 주소 진입 (배달 헤더 파일) | **36** (`!h/!w`) |
| `components/business/owner/OwnerMobileAdminHeader.tsx:119·176` · `StoresOwnerStackHeader.tsx:66·69` | 사장님 헤더 (배달 헤더 파일) | 40 (`h-9 rounded-full` 은 층 밖 CSS 에 져서 무효 — 추정) |
| `components/community-messenger/MessengerSplitTopBar.tsx:50·76` | 메신저 분할(≥768) | 48 (`--touch`) |
| `components/write/WriteScreenTier1Sync.tsx:66·82` | 글쓰기 | ✕ (close) |
| `components/chats/ChatDetailView.tsx:2046` · `components/group-chat/GroupChatRoomClient.tsx:194` | 운영 미도달 화면 | 48/24 |
| **[관리자]** `components/admin/AdminPageHeader.tsx:55` | 관리자 상단 (backHref 있는 46곳) | 48 (`--touch`) |
| **[헤더 아님]** `components/category/CategoryListLayout.tsx:371` · `app/(main)/write/[categoryId]/page.tsx:108` · `components/products/ProductTradeEditPageClient.tsx:150` · `app/(main)/post/[id]/error.tsx:38` | 오류·빈 화면 본문 | 40 |

### 2-B. 자체 마크업 뒤로 ‹ (공용 부품 미사용 9곳)

| 파일:줄 | 화면 | 모양 / 크기 | 원형 | 설계 처리 |
|---|---|---|---|---|
| `components/search/global/GlobalSearchView.tsx:79` | `/search` | ‹ 글자 / `sector-header-back` 직접 | ✗ | 공용 부품으로 교체 |
| `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx:338` | 메신저 방 | ‹ 글자 / 48 + **36 원 바탕(눌릴 때만)** | 눌림만 | 공용 부품으로 교체(✕ 일 때 제외 — §4) |
| `components/community-messenger/room/MessengerSplitRoomEntryFrame.tsx:66` | 분할 방 진입 프레임(장식, 못 누름) | ‹ / 48+36 | 눌림만 | 같은 모양(SVG+원)만 맞춤, 소리 없음(누를 수 없음) |
| `components/community-messenger/call-history/CommunityMessengerCallPeerDetailPanel.tsx:133` | 통화기록 상세 | ‹ / 44 원 | O | 공용 부품으로 교체 (통화 발신 버튼은 손대지 않음) |
| `components/business/owner/OwnerStoreOrderChatSlidePanel.tsx:205` | 사장님 주문 채팅 패널 | ‹ / 40 원 | O | 공용 부품으로 교체 |
| `components/stores/StoreDetailBackRow.tsx:89` | 매장·상품 상세 (배달 헤더 파일) | SVG `M15 6 9 12l6 6` / 36(줄 안 48 추정) · 히어로 위 유리 버튼 | 유리만 O | 흰 헤더 상태 = 공용 원형. **히어로 유리 버튼은 유지**(§5 충돌 2) |
| `components/mypage/profile/PhoneVerificationBox.tsx:540` | 전화 인증 국가 목록 | SVG 20 / 44 | ✗ | 공용 부품으로 교체 |
| `components/support/SupportTicketViews.tsx:76` | 고객센터 문의 모달 | lucide ChevronLeft / 48 | ✗ | 공용 부품으로 교체 |
| `components/messenger/call/CallHeader.tsx:43` | 통화 화면 | 「‹ 뒤로」 pill | O | **제외** — 통화 코드(통화 변경 규정·Owner 「통화 지금 손대지 않음」) |

### 2-C. 헤더 닫기 ✕ (참고 — 이번 범위 아님)

`AppBackButton variant="close"`(글쓰기·리뷰·만남 장소 등) + 자체 마크업 15곳(`BuyerStoreOrderChatSlidePanel:244`, `BuyerStoreOrderReviewSlidePanel:107`, `PhilifeWriteComposerChrome:77`, `DibayImageViewer:567`, `EndedCallView`(통화) 등). 지시는 「뒤로가기」 → **✕ 를 원형으로 바꿀지는 Owner 결정 필요** (설계는 ✕ 를 지금 모양 그대로 둔다).

### 2-D. 소리·진동 자산

| 자산 | 위치 | 쓰는 곳 |
|---|---|---|
| 「딸깍」 소리 + 진동 | `lib/ui/light-tap-feedback.ts` `triggerInteractionFeedback("light")` — Web Audio 사인 920Hz · 55ms · 음량 0.07, `navigator.vibrate(10)`. 터치(`pointer: coarse`)에서만 | 글쓰기 CTA·FAB·전화 인증·주소·제출 버튼 등 21파일 |
| 하단 탭 선택 햅틱 | 같은 파일 `triggerBottomNavSelectionFeedback()` — 네이티브 `@capacitor/haptics`, 소리 없음, **손을 뗀 순간 1회** | 하단 탭 |
| 사용자 「버튼 소리 끄기」 설정 | **없음** (알림 소리 설정만 있음) | — |

### 2-E. 집계

| 구분 | 수 |
|---|---|
| 공용 부품 직접 호출 | 22파일 27곳 (관리자 1·본문 4 포함) |
| 래퍼(`DetailHeader`·`SearchHeader`) 경유 | 10곳 (RegionBar 경로 79곳 포함) |
| 자체 마크업 뒤로 | 9곳 9파일 |
| 헤더 뒤로·닫기 중 소리·진동 | **0곳** |
| 하드웨어 뒤로(Android)·가장자리 스와이프(iOS) | 버튼 경로를 거치지 않음 → 소리 없음 유지 (`lib/ui/overlay-back-stack.ts`, `MainActivity.java:1459`, `DibayBackSwipePlugin.swift`) |

---

## 3. 설계

### R1. 원형 테두리 — 공용 클래스 `sector-header-back--round`

| 항목 | 값 | 근거 |
|---|---|---|
| 터치 | 48×48 @x4 (그대로) | 헤더 SSOT S4 |
| 원 | **36×36**, 버튼(터치 상자) 가운데 — 버튼 크기는 화면마다 그대로(48·44·40·36) (화면 x10~46, 중심 x28) | 메신저 방 헤더가 이미 쓰는 눌림 원 36(`CM_ROOM_HEADER_TOUCH_FACE`, 헤더 SSOT 4단계) — 같은 크기로 통일 |
| 테두리 | 1px · 버튼 글자색(currentColor) 22% — 화면마다 따로 값 없음 | 5개 도메인 바탕(#F3F5F3·#E3F1E7·#FDEEDC·#E3EDFB·#EFEAF6) 모두에서 보임 — 시안 §2 |
| 채움 | 흰색 72% | 도메인 바탕 위에서 버튼이 떠 보이게 |
| 그리는 방법 | `::before` 한 겹 (버튼 크기·격자 계산 `--sector-header-side` 무변경) | 제목 위치·대칭 격자 영향 0 |

CSS 원문은 시안 파일의 「★ 제안 CSS」 블록 그대로 `app/sector-header.css` 에 넣는다.

### R4. ‹ 정중앙 — 글자 대신 SVG 꺾쇠 `.app-back-chevron`

- `AppBackIcon` 을 `<svg viewBox="0 0 24 24"><path d="M14.75 6.5 9.25 12l5.5 5.5"/></svg>` (획 2 · 끝·꺾임 둥글게)로 바꾼다.
- 좌표로 정한다: 잉크 x 8.25~15.75, y 5.5~18.5 → **중심 (12, 12) = 24 상자 중심 = 원 중심.** 글꼴과 무관하므로 Android·iPhone·Windows 가 같다.
- 크기 7.5×13 은 지금 ‹ 잉크(Mac 7.6×12.3 · Samsung 6.4×12.8)와 비슷하게 맞춘 값.
- 기존 `.sector-header-back svg path { stroke-width: 2.2 }` 는 원형에서 2 로 덮는다.
- 눌림 축소(0.9배)도 중심 기준이라 눌린 상태에서도 0.00 (실측).
- 시험: SVG 경로 좌표로 잉크 상자 중심 = (12,12) 를 고정하는 계약 시험.

### R2. 정확한 눌림

| 순간 | 동작 | 이유 |
|---|---|---|
| 손가락이 닿는 순간 (`pointerdown`) | `data-pressed` 붙임 → 원 채움 ‹ 색 16%, 테두리 45%, 원과 ‹ 0.9배, **70ms** | `:active` 만으로는 iOS WebView·빠른 탭에서 눌림이 안 보이거나 늦다. 닿는 즉시 표시 |
| 손을 뗌 / 밀려서 취소 / 밖으로 나감 | `data-pressed` 제거 → 180ms 로 돌아옴 | |
| 이동 | 지금처럼 `click` 에서 (지연 추가 없음) | 눌림을 보이려고 이동을 늦추지 않는다 |
| 움직임 줄이기 설정 | 크기 변화 없이 색만 | |

### R3. 소리 — 앱 기존 「딸깍」 그대로

| 항목 | 설계 |
|---|---|
| 소리 | **새 소리를 만들지 않고** `triggerInteractionFeedback("light", ev)` 를 부른다 (920Hz 55ms + Android 진동 10ms). 앱 안 버튼 소리 1종으로 통일 |
| 시점 | 손을 떼서 눌림이 확정될 때(`click`) 1회 — 하단 탭 계약 v2(Owner 2026-11-15 「손을 뗀 순간 1회」)와 같은 시점. 스크롤로 취소되면 소리 없음 |
| 연타 | 700ms 안 연타는 소리 1회 (`AppBackButton` 연타 잠금 `BACK_PRESS_LOCK_RELEASE_MS` 와 같은 값, 모든 원형 버튼 공통) |
| 이탈 확인(`interceptBack`) | 눌림은 확정됐으므로 소리 1회 후 확인 창 |
| 터치만 | 기존 함수 규칙대로 마우스(PC·관리자 데스크톱)에서는 없음 |
| 통화 중 | **소리 없음** — 통화 중에 WebView 가 오디오를 내면 iOS 에서 앱 오디오 설정이 바뀔 수 있다는 보고가 있음(아래 자료). 통화 상태는 `readOwnLiveCall()` 로 **읽기만** 하고 통화 코드는 바꾸지 않는다. 이 판정 모듈은 통화 저장소 전체를 끌어오므로 정적으로 가져오지 않고 누르는 순간(pointerdown) 불러 둔다 — 아직 못 불러왔으면 소리 없음(통화 보호 쪽) |
| 하드웨어 뒤로·가장자리 스와이프 | 소리 없음 (지시 = 헤더 버튼) |
| 네이티브 | 변경 없음 → **웹만 배포**, 구 바이너리에서도 동작 |

자료(공식 문서 아님 · 실기로 확인할 항목):
- [WebKit 167788 — WKWebView 가 앱 오디오 설정을 따르지 않음](https://bugs.webkit.org/show_bug.cgi?id=167788)
- [WebKit 205599 — AudioContext 를 닫으면 앱 네이티브 오디오가 끊김](https://bugs.webkit.org/show_bug.cgi?id=205599)
- [Apple 포럼 — RTC 통화 중 WebView 오디오](https://developer.apple.com/forums/thread/794645)

---

## 4. 바뀌는 파일·영향

| 파일 | 변경 | 영향받는 화면 | 깨질 수 있는 것 → 같은 단계 처리 |
|---|---|---|---|
| `app/sector-header.css` | `--round` 규칙·`.app-back-chevron` 추가 | 공용 부품 전부 | 기존 4px `:hover/:active` 와 겹침 → 원형에서 투명 처리(제안 CSS 포함) |
| `components/navigation/AppBackButton.tsx` | `variant="back"` 에 `--round` + SVG + `data-pressed` + 소리. `close` 는 그대로 | §2-A 전부 (관리자·본문 4곳 포함) | 본문 4곳(오류·빈 화면)도 원형이 됨 — 같은 부품이라 통일, 보고 |
| `lib/ui/app-back-glyph.ts` | SVG 경로 상수 | — | ‹ 글자를 쓰는 다른 곳(`AppBackIcon` 직접 사용) 전수 교체 |
| §2-B 8파일 | 자체 버튼 → `AppBackButton` | 검색·메신저 방·통화기록 상세·사장님 패널·매장 상세·전화 인증·고객센터 | 메신저 방 헤더: 📞·⋯ 버튼과 상수 공유 → **뒤로만** 바꾸고 📞 onClick·상수 무변경. 통화기록 상세: 발신 버튼 무변경 |
| 계약 시험 | 새 `header-back-round-contract.test.ts` (모든 진입 파일이 공용 부품·`--round`·SVG 사용, 소리 호출, 정중앙 좌표) · 기존 `sector-header-back-unify`·`room-header-dot-menu-with-call.contract`·`messenger-split-room-entry-frame.contract` 갱신 | — | |

---

## 5. 충돌·Owner 결정 필요 (임의로 고르지 않음)

| # | 충돌 | 내용 | 설계 기본값 |
|---|---|---|---|
| 1 | 헤더 SSOT **S3 왼쪽 시작선 x=16** | 원(36)을 터치 상자 가운데 두면 보이는 첫 요소가 **x=10** 이 된다. x=16 을 지키려면 원 중심을 x=34 로 옮겨야 하고, 그러면 대화방 S11 아바타(x=52)·제목 위치가 함께 밀린다 | 원 중심 x=28 (‹·제목·아바타 위치 무변경). 대화방에서 원 끝(46)과 아바타(52) 사이 6px — 시안 §2 채팅 색 |
| 2 | 배달 헤더 계약 (2026-11-02 「배달 헤더 계약 파기 금지」) | 계약 문서(§7-1)에 뒤로 **모양** 규정은 없고 「뒤로 = 140ms 이동」만 있다. 계약 시험은 `--touch` 클래스 금지만 한다 → 원형은 계약 위반 아님으로 판단. 단 매장 히어로 위 **유리 버튼**(흰 테두리·검정 반투명)은 배달 매장 헤더 계약(§WP6 「배너 위 투명 + 흰 아이콘」)에 속함 | 배달 흰 헤더 = 원형 적용, 히어로 유리 버튼 = 유지 |
| 3 | 닫기 ✕ | 같은 부품의 `close` 와 자체 ✕ 15곳 | 지금 모양 유지 |
| 4 | 기기 무음·진동 모드에서 소리 | 기존 「딸깍」은 Android 에서 미디어 음량으로 나서 무음 모드에서도 날 수 있음(추정, 실기 NOT_PROVEN). iPhone 무음 스위치 동작도 NOT_PROVEN | 기존 함수 동작 그대로(다른 버튼과 같게). 실기에서 확인 후 보고 |
| 5 | 사용자 「버튼 소리 끄기」 설정 | 지금 없음 | 만들지 않음 |

---

## 6. 구현 단계 (승인 후 · PR 1개)

1. 공용 부품·CSS·SVG·소리 (§2-A 자동 적용)
2. 자체 마크업 8곳을 공용 부품으로 (§2-B, CallHeader 제외)
3. 계약 시험·기존 시험 갱신 → 로컬 검증 1회 → PR·자동 병합 (배포 구분: **웹**, 앱 재시작만)

## 7. 실기 확인 항목 (배포 후 작업자)

| # | 항목 | 방법 |
|---|---|---|
| V1 | ‹ 정중앙 (가로·세로 0 ± 기기 화소 1개) | Samsung·Xiaomi·iPhone 캡처 픽셀 분석 (§1-1 과 같은 방법) |
| V2 | 원 테두리 5개 도메인에서 보임 | 각 도메인 하위 화면 캡처 |
| V3 | 누르는 즉시 눌림 | 화면 녹화 프레임 (닿은 프레임에 원 진해짐) |
| V4 | 떼면 소리 1회 · 연타 1회 · 스크롤 취소 무음 | 녹음 + 녹화 |
| V5 | 통화 중 뒤로 누름 → 소리 없음, 통화 소리 끊김 없음 | 통화 연결 상태에서 메신저 방 ‹ |
| V6 | 무음·진동 모드 | Android 무음, iPhone 무음 스위치 |
| V7 | 대표 화면 (메신저 방·FEED 글·거래 글·매장 상세·내정보 설정·검색·관리자) | Owner 계정·실폰 |

---

## 8. 구현 (2026-11-16)

| 파일 | 내용 |
|---|---|
| `app/sector-header.css` | `.sector-header-back--round` (원 `::before`·눌림·SVG 꺾쇠 24·획 2·버튼 바탕 끔) |
| `components/navigation/HeaderBackRoundButton.tsx` | 원형 버튼 부품 + `AppBackChevronIcon` |
| `lib/ui/header-back-press-feedback.ts` | 눌림(`data-pressed`)·소리(기존 「딸깍」, 700ms 연타 1회, 통화 중 없음) |
| `lib/ui/app-back-glyph.ts` · `lib/ui/sector-header-classes.ts` | 꺾쇠 좌표·클래스 상수 |
| `components/navigation/AppBackButton.tsx` | 뒤로 = 원형(3갈래 모두 눌림·소리), 닫기 ✕ 무변경, `AppBackIcon`(글자 ‹)은 `CallHeader` 전용으로 남김 |
| 자체 마크업 7곳 + 장식 1곳 | §2-B 처리대로. `CallHeader` 무변경 |
| 시험 | `lib/layout/__tests__/header-back-round-contract.test.ts` 신규, `messenger-split-room-entry-frame.contract` 갱신 |

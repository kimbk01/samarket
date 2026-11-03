# 매장 사장님(오너) 감사·설계안 (2026-11-03 · 승인 대기)

> 상태: **설계안만**, 구현 없음. 커밋·푸시·배포 없음.
> 확인 조건: 코드 기준 `origin/main` `d0695ac95` (worktree `samarket-owner-audit`) · 03:01 PHT.
> 화면 확인: 사장님 계정으로 화면을 보지 못함. 내장 브라우저 375px 의 로그인 계정에는 매장이 없어 `/stores/owner` 에서 「매장 신청」 화면만 나옴. 그래서 아래 모든 화면 판정은 **NOT_PROVEN**, 코드 판정만 있음.

## 0. 작업자 잘못 (먼저 보고)

| 무엇 | 결과 |
|---|---|
| 구현 지시가 없었는데 1번(하단 바)·2번(FAB 「매장」 확인창)을 코드로 구현함. 계약 테스트 3개도 고침 | Owner 지시로 전부 되돌림. 작업 폴더 변경 0, 커밋·푸시 0, 운영 영향 0 |
| 2번 「FAB」을 배달 홈의 FAB 「매장」 항목으로 해석함 | Owner 정정: FAB 은 **없애는 방향**. 아래 §2 를 그 방향으로 다시 씀 |

---

## 1. 하단 저장·취소 바(CTA) — 앱 하단 탭 기준 크기·배경

### 1-1. 현재 상태와 결함 (코드)

| ID | 결함 | 근거 |
|---|---|---|
| C-1 | 탭 위에 뜨는 바의 위치가 `bottom: 68px`(탭 60 + 간격 8)로 고정됨. 사장님 탭 실제 높이는 60 + 홈 원 돌출 17.6px(`--delivery-home-overhang` = 2.75rem×0.4)라서 **바 아래쪽 약 9.6px 가 탭 띠·홈 원에 가려짐**. 바 위치가 같은 파일의 탭 실제 높이 토큰 `--owner-bottom-nav-footprint` 를 쓰지 않음 | `lib/business/owner-admin-form-keyboard.ts:32-33` · `app/app-bottom-nav.css:38-41,384-387` · `app/owner-compact-shell.css:42-45` · 대상 화면 `/coupons` 생성, `/ads/[campaignId]` |
| C-2 (OA-01) | 탭이 숨겨진 광고 만들기 3화면에서도 바를 68px 위에 띄움. **바 아래 68px 가 빈 띠** | `OwnerBannerCreateView.tsx:116` · `OwnerStoreSponsoredCreateView.tsx:123` · `OwnerPlatformPopupApplyView.tsx:89-90` · 숨김 판정 `owner-bottom-nav-eligibility.ts:13-21,35-40` |
| C-3 (OA-21) | 탭은 스크롤하면 숨는데 바는 68px 위에 남음 → 빈 띠 | `BusinessAdminShell.tsx:950` (`scrollHideEnabled`) · `OwnerStoreCouponCreatePanel.tsx:62` · `OwnerDeliveryAdDetailView.tsx:113` |
| C-4 | 바 폭이 탭과 다름. 탭은 화면 전체 폭인데, 바는 좌우 8px 안쪽 + 태블릿 최대 42/48rem | `owner-admin-footer-actions.ts:33-34` · `owner-compact-shell.css:190-201` |
| C-5 | 바 배경(`bg-sam-surface` 흰색 95%)과 취소 버튼(흰색)이 탭 배경(크림 `#FFFCFC`)과 거의 같은 색 → 탭과 구분이 안 됨 | `owner-admin-footer-actions.ts:13-14,43` · `app/app-bottom-nav.css:3` |
| C-6 (OA-04) | 바 버튼에 눌림 표시 없음. 비활성은 신청 화면만 회색 토큰, 나머지는 `opacity-50` | `owner-admin-footer-actions.ts:40-46` · `BusinessApplyForm.tsx:625` |
| C-7 (OA-02) | 배너·스폰서 광고 신청 바는 공용 바를 안 씀(세로 쌓기·48px·바 안 안내 문구) | `OwnerBannerCreateView.tsx:1125-1160` · `OwnerStoreSponsoredCreateView.tsx:820-855` |
| C-8 | 상품 등록·수정은 고정 바가 아니라 폼 맨 끝 버튼 | `OwnerProductForm.tsx:1144-1165` |

버튼 높이는 이미 60px = 탭 높이로 같음 (`BOTTOM_NAV_SHELL.heightClass`).

### 1-2. 설계

| 항목 | 변경 |
|---|---|
| 크기 | 바 = 탭과 같은 **높이 60px + 아래 안전영역**, **화면 전체 폭**(좌우 안전영역만). PC(≥1280)는 지금처럼 사이드바 오른쪽 |
| 위치 | 탭이 떠 있을 때: 탭 실제 높이(60 + 홈 원 돌출) 바로 위, 간격 없음. 탭이 숨는 화면: 화면 맨 아래(탭 자리). 판정은 「사장님 탭이 실제로 떠 있나」(`owner-bottom-nav-occupancy`) 하나로 함 → C-1·C-2 해결 |
| 스크롤 숨김 | 하단 바가 있는 화면은 탭 스크롤 숨김을 끔 → C-3 해결 |
| 배경 | 바 배경 = 옅은 브랜드 그린 `--sam-primary-soft`, 취소 = 그 배경 + 그린 글자, 저장 = 그린 바탕 + 흰 글자. 탭(크림)과 바로 구분됨 |
| 눌림·비활성 | 공용 버튼에 눌림(밝기 낮춤)·비활성 회색 토큰을 넣어 모든 화면을 신청 화면과 같게 맞춤 |
| 같이 맞출 화면 | 공용 바 사용 8화면(신청·기본 정보·매장 설정·메뉴 카테고리·쿠폰·광고 상세·팝업 신청·광고 만들기). 배너·스폰서 신청 바(C-7)는 공용 바로 바꾸고, 바 안의 「Cash에서 결제」 문구는 바 위 본문으로 옮김 |
| 바뀌는 파일 | `lib/business/owner-admin-footer-actions.ts`, `owner-admin-form-keyboard.ts`, `use-owner-admin-form-keyboard.ts`, `app/owner-compact-shell.css`, 광고 신청 2화면, 사장님 탭 스크롤 숨김 판정 |
| 깨질 수 있는 것 | 고객센터 FAB 위치(바를 기준으로 비킴 — 같은 클래스 유지라 그대로), 키보드 열림 시 바 위치(`html[data-kb-open]` 규칙 유지), 바 높이를 가정한 본문 아래 여백 |

**계약 충돌 (Owner 확인)**: 배달 광고 계약 테스트가 「68px · 간격 8px」을 고정함 (`lib/stores/advertising/__tests__/delivery-ad-recovery-p3-p4-contracts.test.ts:96-98`, `keyboard-root-policy.test.ts:103`, `owner-admin-form-keyboard.test.ts:34`). 이번 지시(탭 기준 크기·배경으로 구분)와 다름 → 승인하시면 이 3개 테스트를 새 기준으로 바꿈.
C-8(상품 폼)은 셸 규칙상 「화면별 UX 허용」이라 이번 설계에 넣지 않음 — 고정 바로 바꿀지 Owner 결정.

---

## 2. 하단 「홈」 FAB 제거 → 「매장으로 이동합니다」 확인 후 매장으로

### 2-1. 현재 (코드)

- 사장님 하단 탭 가운데 「홈」(`OwnerMobileBottomNav.tsx:117-197`):
  - 운영 홈(`/stores/owner`)이 아닌 화면에서 누르면 → 운영 홈으로 이동 (`owner-home-hub-navigation.ts:19-47`)
  - 운영 홈에서 누르면 → 원형 다이얼(FAB) 열림 (`DeliveryDomainSwitcherOverlay`, 커뮤니티·거래·배달·메신저 칩, `includeOpsCenter=false`)
- 고객 배달 홈(`/stores`)의 오른쪽 FAB(`MainBottomNavFabSector.tsx`)에도 승인 매장주에게 「매장」 항목이 자동으로 붙음 (`main-bottom-nav-fab-store-admin.ts:76-91`) → 운영 홈으로 바로 이동, 확인창 없음.

### 2-2. 설계 (사장님 하단 탭)

| 항목 | 변경 |
|---|---|
| 홈 누름 | 다이얼(FAB) **제거**. 어느 화면에서 눌러도 확인창 「매장으로 이동합니다」 [취소] [확인] |
| 확인 | 그 사장님의 **배달 매장 화면**(고객이 보는 `/stores/{slug}`)으로 이동 — Owner 확정 2026-11-03. 현재 선택 매장 `selectedRow` 의 `slug` 사용 (셸이 이미 넘김 `BusinessAdminShell.tsx:945-951`). `slug` 가 없으면(미승인·미생성) 확인창 대신 이동 불가 안내 |
| 취소·배경·뒤로가기 | 창만 닫힘 (팝업 SSOT A1 과 같음) |
| 확인창 | `OwnerStoreAdminConfirmModal` (사장님 공용 확인창, 셸 규칙 §6). 문구는 Owner 지시 그대로 「매장으로 이동합니다」 — 팝업 문구 표준(「~할까요?」)과 다르지만 Owner 지정 문구를 따름 |
| 홈 원 표시 | 선택 상태(그린)는 지금처럼 운영 홈일 때만 |
| 지울 코드 | 사장님 탭의 다이얼 마운트·열림 상태(`OwnerMobileBottomNav.tsx:229,281-291,354-362`), `includeOpsCenter=false` 분기(`delivery-domain-switcher-slots.ts`) — 고객 배달 홈 다이얼은 그대로 |
| 영향 | 사장님 화면에서 다이얼로 커뮤니티·거래·배달·메신저로 바로 가던 길이 없어짐 → 남는 출구는 헤더 ‹ 뒤로. 운영 홈으로 가는 하단 탭 길도 없어짐 → 운영 홈은 헤더 ‹ / 메뉴(드로어)로 감 |
| 바뀌는 파일 | `components/stores/owner/OwnerMobileBottomNav.tsx`, `lib/delivery/owner/owner-home-hub-navigation.ts`(+테스트), i18n 문구 키 1개 |

**Owner 확정 (2026-11-03)**: 「매장」= 해당 매장 오너의 **배달 매장**(`/stores/{slug}`). 운영 화면 → 배달 매장 이동 시 화면 전환은 코드상 메인 셸 애니메이션 없음(`computeRouteTransitionEnterKind` = none, 사장님 셸은 빠져나가며 사라짐) — 전환 모양은 실기 확인 필요(NOT_PROVEN).

고객 배달 홈 FAB(장바구니·주문내역·주문채팅·매장)는 **고객 배달 화면 계약**(`docs/main-bottom-nav-fab-sector-contract.md`) 영역이라 이번 설계에 넣지 않음. 이것도 없애실 거면 따로 지시 부탁드립니다.

---

## 3. 「홈 선택 후 넘어갈 때 두 번 이동」 원인

**판정: NOT_PROVEN** — 사장님 계정·폰에서 재현하지 못함(재현 화면·로그 없음). 코드로 확인한 것만 적음.

| 경로 | 코드 확인 결과 |
|---|---|
| 사장님 탭 「홈」 → 운영 홈 | `router.push` 1회. 화면 전환 애니메이션 1회(왼→오 270ms, `OwnerStackPageSlideShell`). 메인 셸 애니메이션은 꺼짐(`shouldSuppressOwnerStackMainShellSlide`). 두 번 이동하는 코드는 **찾지 못함** |
| 고객 배달 홈 FAB 「매장」·다이얼 「운영센터」 → 운영 홈 | ① `app/(main)/stores/loading.tsx` 가 `null` 을 그림 → 이동 즉시 **빈 화면이 먼저 밀려 들어오고**(메인 셸 오→왼 440ms) 그 다음 운영 홈이 그려짐. 사용자 눈에는 「두 번 이동」으로 보일 수 있는 가장 유력한 후보. ② 사장님 헤더는 본문 밖(BodyPortal)이라 헤더가 먼저 뜨고 본문만 밀려 들어옴 |
| `storeId` 없는 주소로 운영 화면 진입 | 셸이 주소에 `storeId` 를 붙여 `router.replace` 한 번 더 함(`BusinessAdminShell.tsx:334-345`) → 진짜로 이동이 2번. `storeId` 없이 들어오는 곳: 신청 완료 후 `router.push("/stores/owner")`(`apply/page.tsx:259`), 매장 설정·상품 수정·단계 게이트의 `href="/stores/owner"` 링크, 정산 `OwnerRoutes.hub()` |

원인을 특정하려면: Owner 폰에서 **어느 화면에서 어느 「홈」을 눌렀는지** 1건이면 위 3개 중 하나로 좁혀짐. 확인 후 그 원인 하나만 고치는 설계를 따로 올림.

---

## 4. 사장님 화면 전체 감사 (코드 · 결함 21 + 작업자 추가 3)

결함 없음: `window.confirm/alert` 0 · `href="#"` 0 · 동작 없는 버튼 0 · `Biz.btn*` 0 · `rounded-xl/lg/md` 0 · 확인창 19곳 모두 중복 실행 방지(`busy`) 있음 · 사장님 화면 i18n 키 227개 모두 있음.

| ID | 화면 | 결함 | 근거 | 등급 |
|---|---|---|---|---|
| OA-08 | 운영 홈 | 홈 카드에서 노출·주문받기 토글로 바로 변경됨. E 설계 「토글은 `/settings` 한 곳만」과 다름. 이전 감사 K:156 「해결」 판정과 코드가 충돌 (작업자 확인: `OwnerHomeStoreStatusCard.tsx:74,84`) | E §3 | P2 · Owner 결정 |
| OA-09 | 운영 상태·재무·고객 응대 | 개발자용 문구가 사장님 화면에 그대로 나옴: 「가짜 승인 요청 버튼은 없습니다」(작업자 확인 `OwnerStoreOpsStatusBody.tsx:94-100`), 「Admin과 같은 재무 데이터·흐름입니다」, 「미읽음·대기 건수만 실제 데이터로 표시합니다」 | `OwnerStoreFinanceView.tsx:262-266` · `OwnerCustomerCareHubView.tsx:208-213` | P2 |
| OA-10 | 재무·고객 응대·광고 9화면 | 전역 헤더 제목 아래에 본문 제목·설명이 또 있음(제목 2번) | `OwnerStoreFinanceView.tsx:256` 외 10곳 | P2 |
| OA-03 | 광고 전 화면 | 버튼 색 `#0A823E` — 브랜드 그린 `#0B421A` 와 다름 (작업자 확인 `delivery-ad-owner-ui-presentation.ts:73`) | AGENTS UI 토큰 | P2 |
| OA-13 | 팝업 광고 신청 | 최종 확인창을 직접 만든 div(z-1300)로 띄움 | `OwnerPlatformPopupApplyView.tsx:859-912` | P2 |
| OA-14 | 상품 수정 | 관리자 잠금·반려 안내가 한국어 고정 → 영어 사용자도 한국어 | `OwnerProductForm.tsx:770-779` | P2 |
| C-1~C-7 | 하단 바 | §1 | — | P2 |
| OA-11 | 배너·공지·리뷰·정산·매장 관리·운영 상태 | 섹션 첫 줄 안내 문단(설명 금지 규칙을 `<p>` 로 우회). 매장 관리 「매장 정보 편집 위치」는 제목만 있고 내용 빈 섹션 | `OwnerStoreSettingsContent.tsx:54-60,76-79` 외 | P3 |
| OA-12 | 섹션 카드 | 쓰지 않는 설명 슬롯 `subtitle` 이 남아 있음 | `OwnerStoreAdminDashSection.tsx:7-12,62-69` | P3 |
| OA-05·06·07 | 목록 버튼·매장 관리·리뷰·문의·상품권 | 눌림 표시 없음 / 눌림 스타일 8종 이상 섞임(배경·밝기·크기 0.98/0.99·투명도 90/85/80) | `owner-admin-list-ui.ts:6-10` · `owner-cta-classes.ts:17-20` 외 | P3 |
| OA-15 | 재무·홈·정산·팝업 | 카탈로그 키 없이 화면에 한/영 직접 씀(`ownerUiCopy` 12파일) | `owner-ui-copy.ts:3-6` | P3 |
| OA-16 | `/profile` 이름 | 「영업·배달 설정」 / 「매장 설정」 / 「매장 설정 (영업시간·배달)」 3가지 | `owner-nav-registry.ts:284-287` 외 | P3 |
| OA-17 | 팝업 신청 바 | 취소 `<Link>` 글자 세로 정렬이 옆 버튼과 다를 수 있음 | `OwnerPlatformPopupApplyView.tsx:817-826` | P3 |
| OA-18 | 쿠폰·Cash·Coin·배너·공지 | 저장 성공 알림이 공통 토스트가 아님 / 배너·공지 성공 표시 못 찾음 | `OwnerStoreCouponsView.tsx:177` 외 | P3 |
| OA-19 | 공지 | 다시 불러오기 실패 시 기존 목록을 비움 | `OwnerStoreNoticesView.tsx:107-108,115-116` | P3 |
| OA-20 | 상품 허브·영업시간·미리보기 | 화면 칩·버튼 `rounded-full` (4px 규칙) | `OwnerProductsHubClient.tsx:88,97` 외 | P3 |
| W-1 | 매장 설정 폼 | 주석 글자 깨짐 `?? ????` | `OwnerStoreProfileForm.tsx:180,192,213` | P3 |
| W-2 | 매장 없는 계정 `/stores/owner` | 진한 그린 바탕 위 큰 제목이 갈색·붉은 글자라 잘 안 읽힘 — 운영 375px·비사장님 계정에서 직접 봄 | 화면 캡처(본 세션) | P3 |

확인 못 한 것: 모든 항목의 사장님 폰 화면, PC 사이드바·상태 화면 4종 적용 여부, 서버 쪽 CTA 기준(중복 방지 키·권한 검사), 배너·공지 저장 성공 흐름 전체, 「라벨+건수 2행」 검사 스크립트 실행.

---

## 5. 승인 요청 (단계별)

| 단계 | 내용 | 배포 구분 |
|---|---|---|
| S-A | §1 하단 바: 크기·위치·배경·눌림 + C-2·C-3·C-7 + 계약 테스트 3개 갱신 | 웹 |
| S-B | §2 사장님 홈 FAB 제거 + 「매장으로 이동합니다」 확인창 → 배달 매장 `/stores/{slug}` | 웹 |
| S-C | §3 두 번 이동 — 재현 경로 받은 뒤 원인 1개만 수정 설계 | 웹 |
| S-D | §4 P2 (OA-09·10·03·13·14) — OA-08 은 Owner 결정 후 | 웹 |
| S-E | §4 P3 묶음 | 웹 |

각 단계: 로컬 검증 1회 → 작업 브랜치 → main 1회 반영 → 사장님 폰 확인 전까지 화면 판정 NOT_PROVEN.

---

## 6. 반영 기록 — S-A·S-B (Owner 「S-A·S-B 진행」 2026-11-03)

| 항목 | 상태 |
|---|---|
| main 반영 | `c9102a705` (웹만 — 앱 재시작으로 반영) |
| 로컬 검증 | typecheck:build·typecheck:test PASS · 변경 파일 eslint PASS · vitest 446파일 중 445 PASS · verify: design-system·owner-admin-scroll-shell·owner-fab-header·owner-mobile-stacked-label-count·support-fab·owner-badge-boundary PASS |
| 기존 실패(이 변경과 무관, 변경 전 main 에서도 같은 실패) | `store-cart-w2-context-and-key.test.tsx` 9건(localStorage `clear` 없음) · `verify:delivery-dial-navigation-contract`(commitMainBottomNavRoute 순서) |
| 설계와 다른 점 | §2 「지울 코드」 중 `includeOpsCenter` 옵션(`delivery-domain-switcher-slots.ts`·`DeliveryDomainSwitcherOverlay.tsx`)은 배달 다이얼 계약 파일이라 남김 — 사장님 탭이 더 이상 쓰지 않음 |
| Production·사장님 폰 화면 | NOT_PROVEN (사장님 계정 화면 확인 수단 없음) |

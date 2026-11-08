# DIBAY 앱 홈 — 단일 정의 (2026-11-09 · Owner 「구현 시작」 · 홈 설계안·시안 v11)

## 1. 경로·하단 탭

| 항목 | 정의 | 코드 |
|---|---|---|
| 앱 홈 | `/` · `/home` (Cold Boot 별칭, HTTP redirect 금지) | `app/(main)/page.tsx`, `app/(main)/home/page.tsx` → `HomeSurface` |
| 판정 | `isHomeSurfacePath` · `resolveMainSurface` = `home` · keep-alive hub `home` | `lib/layout/resolve-main-surface.ts` |
| 커뮤니티 홈 | `/philife` · `/community` (`COMMUNITY_HOME_SURFACE_PATHS`) | 같은 파일 |
| 하단 탭 | 홈(`/home`) · 커뮤니티(`/philife`) · 배달 · 채팅 · 내정보 | `lib/main-menu/bottom-nav-config.ts` `BOTTOM_NAV_ITEMS` |
| 거래 | 하단 탭 없음 — 커뮤니티 안 탭. `/market`·`/post`… 에서 하단 「커뮤니티」가 켜짐. 화면 판정은 `trade` 그대로(크롬·전환) | `isBottomNavTabActive` · `isMainBottomNavHubEmphasisTab` |
| 정보교환 ↔ 거래 | 커뮤니티·거래 1단 제목 자리 = `CommunityTradeTitleSwitch`. 거래 본문·2단 탭은 그대로 | `components/layout/RegionBarMainHubTier1.tsx` |
| 예전 저장 하단 탭 | `home`=`/market`·TRADE·거래 아이콘 저장값은 코드 기본값으로 되돌림 | `resolve-main-bottom-nav.ts` `mergeRow` |
| 시작 화면 기본값 | `home` (어드민 「시작 화면」에 「홈」 추가) | `lib/startup/initial-app-surface.ts` |

## 2. 홈 구성 (어드민)

- 어드민 `/admin/menus/home-layout` (조회 전원 · 저장 `settings`). API `GET/PUT /api/admin/home-layout`, 공개 `GET /api/home/layout`.
- 저장: `admin_settings` 키 `home_layout`. 읽은 판(`updated_at`)과 다르면 **409** 로 멈춤. 저장 시 캐시 태그 `home-layout` 무효화.
- 모양·기본값·검증: `lib/home/home-layout-contract.ts`. 메뉴는 카탈로그 안에서만(주소 직접 입력 없음). 모임 없음.
- 칸: 서비스 입구(앞 2개 큰 카드) · 작은 바로가기 · 로그인 안내(비로그인만) · 상단 배너 · 지금 진행 중(로그인만) · 주제판(추천·동네소식·거래·배달).

## 3. 비로그인

- 홈·정보교환·거래 읽기 가능 (`guest-browse-access-policy.ts` 에 홈 추가).
- 개인 기능은 기존 `requireAuthAction` 로그인 시트 (채팅 `messenger_open` · 관심목록 `trade_favorite` · 주문내역 `delivery_order` · 주소 `address_save`).
- 배달: **기존 규정 S-07 유지** — 비로그인은 로그인 안내 (`delivery-viewer-gate.ts`, Owner 2026-11-09 「기존 규정을 지켜라」).

## 4. 당겨서 새로고침

- 공통 엔진·슬롯·문구 그대로: `home-pull-refresh-store.ts` + `HomePullRefreshHost` + 1단 아래 `DibayPtrSlot tone="onBrand" bg-signature`.
- 새로고침 = 홈 구성 다시 받기 + 진행 중·열린 주제판 다시 부르기.
- 띠 광고(ptr_reveal): 노출 화면 「홈」(`HOME`) 추가 — `/admin/ptr-reveal-ads`. 팝업 「전체」에도 HOME 포함.

## 5. 하단 탭 모양 (네이버형)

- 흰 반투명 바·경계선·그림자, 검은 아이콘, 선택 = 검은 둥근 사각형 + 흰 아이콘, 「내정보」 = 프로필 사진(`avatar_url`, 없으면 기본 그림), 빨간 숫자 배지. orbit 강조 끔.
- 예전 「선택 강조 = 브라운」(Owner 2026-11-03)을 덮어쓴다 — 아래 §6 충돌 참고.

## 6. 미결·충돌 (Owner 결정)

| 항목 | 상태 |
|---|---|
| 상단·중간 배너 출처 | **보류** — 재감사 R3(2026-11-03)로 어드민 배너는 마이페이지 전용(`mypage_top`)이 되었고, 광고 표면 SSOT(2026-11-04)가 배너 규칙을 정한다. 홈 배너를 어느 체계로 만들지 결정 전까지 칸을 접는다(COLLAPSE_SLOT). |
| 하단 선택 강조 | 네이버형(검은 사각형) 구현. 2026-11-03 「브라운」·S4 「브랜드 그린 원」과 다름. |
| 카드 모서리 | 디자인 규칙 4px(`rounded-ui-rect`) 유지. 시안의 16px 은 미적용. |
| 「지금 진행 중」 거래 약속 | 데이터 출처 없음 — 배달 주문만 표시. |
| 주제판 「배달」 매장 목록 | 배달 목록 API 가 업종·저장 주소 필수 — 1차는 배달 홈 바로가기. |
| DB | `20271109120100_platform_popup_surface_home.sql` 운영 적용 = Owner 승인 후. 적용 전 HOME 선택 저장은 DB 검사에서 거절됨. |
| 네이티브 첫 화면(local runtime) | 앱 안 HTML 은 다음 네이티브 빌드 때 새 탭 순서로 바뀜(그 전엔 웹이 한 번 열린 뒤 저장된 새 순서 사용). |

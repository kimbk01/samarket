/**
 * CONTRACT v2 — 메인 하단 탭 상호작용 단일 정의 (Owner 2026-11-15 승인 S1~S3 · 「네이버형」).
 * 설계·실측: `docs/design/bottom-nav-naver-ssot-audit-design-2026-11-15.md`.
 * 이 문서가 하단 탭 반응·선택 표시·화면 교체·햅틱·복귀의 유일한 기준이다. 옛 440ms 밀기·COVER·원형 강조·진행 막대 계약은 폐기.
 *
 * 결정권자 1개 = 하단 탭 컨트롤러 `lib/main-menu/bottom-nav-controller.ts` (`idle` | `showing`).
 * - BottomNav `[data-active]` · HubRetentionStack(보관 화면/뼈대) · ConditionalAppShell(셸 머리글·본문 열) 이 이 상태를 읽기만 한다.
 *
 * 1. 입력·반응 시점
 *    - 확정 = 손 뗄 때(click) 1회. pointerdown 은 「준비」(미리받기 데이터)만 — 선택·햅틱·이동 없음. 바 위에서 시작한 스크롤은 선택되지 않는다.
 *    - 마지막 탭이 이긴다(일부러 늦추지 않음). 같은 탭 다시 누름 = 맨 위로 + 햅틱 1회.
 *    - 누르는 영역 = 바 높이 60px 전체(`app/app-bottom-nav.css` 계약 v2 블록).
 * 2. 화면 교체 = 즉시, 어디서 누르든 같다
 *    - 손 뗀 프레임에 목표 허브가 보관돼 있으면 그 화면(`HubRetentionStack`), 아니면 그 허브 뼈대(`BottomNavHubSkeleton`).
 *      이전 화면을 남기지 않고 흰 빈칸도 없다. Next 경로 확정은 뒤에서 따라온다(`settleBottomNavForLocation`).
 *    - 전환 연출 없음: 허브·상세·메신저 어디서 누르든 `AppRouteTransition` 은 하단 탭 출처를 즉시 끝낸다(슬라이드·kind 방향·배달 120ms 미사용).
 *    - 스크롤: 다른 탭 = 그 탭 마지막 위치(P2), 같은 탭 = 맨 위(P3). 이동 중에는 `AppScrollMemory` 가 저장하지 않는다.
 *    - 이력 = replace(`BOTTOM_NAV_HISTORY_MODE`). 단일 커밋 = `commitMainBottomNavRoute`.
 * 3. 선택 모양 = 채움(선택) ↔ 외곽선(비선택) 서비스 아이콘 26px, 색 선택 DIBAY 그린 · 비선택 회색, 바뀌는 순간 애니메이션 없음.
 * 4. 햅틱 = 선택이 확정될 때 1회(`triggerBottomNavSelectionFeedback`). 거부된 탭은 울리지 않는다. 소리 없음.
 *    지금 = 웹 진동(Android). 네이티브 선택 햅틱(iOS 포함)은 S4(@capacitor/haptics, 네이티브 빌드)에서 같은 함수 안으로.
 * 5. 거부·실패·멈춤
 *    - 사용자가 손 뗀 자리에서 바로 나가는 커밋 = `bottom_nav_explicit`(방·통화 진입 잠금을 푼다). 기다림 뒤 실행(채팅 로그인 확인 뒤) = `bottom_nav_async`.
 *    - 거부 = 결과 "blocked" + 컨트롤러·메뉴 의도를 함께 되돌림(원래 탭).
 *    - `showing` 이 8초 안에 확정되지 않으면 문서 이동으로 1회 전환(Next 이동 요청에 시간 제한이 없음).
 *    - 채팅 탭: 프로필 캐시가 없어도 먼저 선택·뼈대를 보이고 로그인 확인을 뒤에 한다. 비회원이면 되돌림.
 * 6. 복귀 = 복귀 조정자 `ui` 레인(보이는 즉시): 멈춤 감시 재판정 + 키보드·스크롤 숨김 다시 맞춤(`bottom-nav-resume-signal`).
 *
 * DO NOT: 하단 탭 선택 표시를 다른 상태(로컬 state·타이머)로 다시 만들기 · pointerdown 에서 선택·햅틱 · 하단 탭 출처에 슬라이드 ·
 *   진행 막대·원형 강조 부활 · COVER/TRUE PUSH/dual-panel · 커밋을 microtask·setTimeout 으로 미루기.
 *
 * 매장 사장님 하단 탭(`OwnerMobileBottomNav`, S5 2026-11-15): 같은 반응 시점(click 1회)·햅틱·누르는 영역(바 전체, 투명 확장)·
 *   복귀 작업(`use-bottom-nav-resume-ui-task`)·전환 0ms(`owner-bottom-nav-tab-intent` → `OwnerStackPageSlideShell` 슬라이드 생략).
 *   같은 탭 다시 누름 = 맨 위로. 모양(검은 사각형 선택·홈 원)은 바꾸지 않는다.
 *
 * 배달 다이얼 셸(아래 7~9)은 기존 규칙 그대로 — 같은 단일 커밋(`commitMainBottomNavRoute`)을 쓰되 컨트롤러는 쓰지 않는다.
 * 7. **다이얼 있는 배달 5탭 셸** (`isDeliveryBottomNavRail`)
 *    - **홈 짧은 탭** → 도메인 다이얼 열기/닫기 (`runDeliveryHomeHubShortTap`) — 이동 없음
 *    - **다이얼 칩** → `runDeliveryDialItemNavigation` → `commitMainBottomNavRoute` 즉시 이동
 * 8. **배달 홈 롱프레스** → 해당 도메인 실홈 `/stores` (`runDeliveryHomeHubLongPress`)
 * 9. 탭 이동 주소 = `resolveMainBottomNavTabTapHref` 단일 href.
 *
 * DO NOT: 홈 짧은 탭으로 `/stores` push · 다이얼 칩 Link+preventDefault · tab.href 분기 복제.
 * VERIFY: `lib/main-menu/__tests__/bottom-nav-controller.test.ts` · `main-bottom-nav-route-commit*.test.ts`
 */
export const MAIN_BOTTOM_NAV_INTERACTION_CONTRACT_VERSION = 2 as const;

/** 배달 소비자 5탭 + `DeliveryDomainSwitcherOverlay` 가 붙는 레일 */
export function isMainBottomNavDeliveryDialShell(rail: string): boolean {
  return rail === "stores";
}

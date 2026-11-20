import { MainAppProviders } from "@/components/layout/MainAppProviders";
import { CommunityWriteEditorRolloutProvider } from "@/lib/philife/write-editor/write-editor-rollout-context";
import { resolveCommunityWriteEditorRollout } from "@/lib/philife/write-editor/write-editor-flag";
import { MessengerRoomRouteEntryMountProbe } from "@/components/community-messenger/room/MessengerRoomRouteEntryMountProbe";
import { MessengerContactsHeartbeat } from "@/components/community-messenger/contacts/MessengerContactsHeartbeat";

/**
 * 인증 게이트는 `proxy.ts` 단일 경로에서 처리(getClaims/getUser·세션 갱신·Set-Cookie).
 * Provider·클라이언트 셸은 `MainAppProviders` 에 모아 두고, 여기서는 서버 레이아웃만 유지한다.
 *
 * Boot P0 — bottom nav·trade chip 서버 await 제거: HTML TTFB 를 막지 않고
 * 클라 `BOTTOM_NAV_ITEMS` seed + `useTradeTabs` client fetch 로 보강한다.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /** 라운지 글쓰기 편집기 판정(서버 env) — 글쓰기 화면·시트가 판정 요청 없이 바로 새 편집기를 연다 */
    <CommunityWriteEditorRolloutProvider rollout={resolveCommunityWriteEditorRollout(process.env.COMMUNITY_WYSIWYG_EDITOR)}>
    <MainAppProviders initialMainBottomNavItems={null} initialTradeTabCategories={null}>
      <MessengerRoomRouteEntryMountProbe stage="layout" />
      {/* 연락처 앱 시작 처리 (SSOT v5 S7·#19) — 동의한 회원만 8초 뒤 유휴 시간에 엔진 지연 로드 */}
      <MessengerContactsHeartbeat />
      {children}
    </MainAppProviders>
    </CommunityWriteEditorRolloutProvider>
  );
}

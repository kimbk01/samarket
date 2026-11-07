import "@/app/messenger-view-transitions.css";
import "@/app/messenger-presentation.css";
import "@/app/messenger-home-bottom-sheet.css";
import "@/app/delivery-chat-room.css";
import { CommunityMessengerGuestGate } from "@/components/community-messenger/CommunityMessengerGuestGate";
import { MessengerResponsiveShell } from "@/components/community-messenger/MessengerResponsiveShell";
import { MessengerSplitChromeProvider } from "@/components/community-messenger/MessengerSplitChromeContext";
import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";
import { CommunityMessengerRoomClientPrefetch } from "@/components/community-messenger/CommunityMessengerRoomClientPrefetch";
import { CommunityMessengerRoomRouteChunkWarmHubVisible } from "@/components/community-messenger/CommunityMessengerRoomRouteChunkWarmHubVisible";
import { MessengerSnackbarHost } from "@/components/community-messenger/MessengerSnackbarHost";
import { CallInAppNoticeHost } from "@/components/community-messenger/CallInAppNoticeHost";
import { IosMicPreaskOnMessengerEntry } from "@/components/community-messenger/IosMicPreaskOnMessengerEntry";
import { CommunityMessengerPresenceRuntimeChrome } from "@/components/layout/providers/CommunityMessengerPresenceRuntimeChrome";
import { MessengerBootstrapEarlyWarm } from "@/components/community-messenger/MessengerBootstrapEarlyWarm";
import { CommunityMessengerBootstrapCacheSyncHost } from "@/lib/community-messenger/home/CommunityMessengerBootstrapCacheSyncHost";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerPresenceRuntimeChrome />
      <CommunityMessengerBootstrapCacheSyncHost />
      <MessengerBootstrapEarlyWarm />
      <CommunityMessengerRoomClientPrefetch />
      <CommunityMessengerRoomRouteChunkWarmHubVisible />
      <CommunityMessengerMediaPreflight />
      <CallInAppNoticeHost />
      <MessengerSnackbarHost />
      <div className="sam-domain-shell sam-messenger-vt-root flex min-h-0 min-w-0 flex-1 flex-col">
        <CommunityMessengerGuestGate>
          {/* iOS 앱 회원 — 첫 진입 시 마이크 권한 미리 묻기 (통화 수락 순간 권한창·20초/3초 거절 방지) */}
          <IosMicPreaskOnMessengerEntry />
          <MessengerSplitChromeProvider>
            <MessengerResponsiveShell>{children}</MessengerResponsiveShell>
          </MessengerSplitChromeProvider>
        </CommunityMessengerGuestGate>
      </div>
    </>
  );
}

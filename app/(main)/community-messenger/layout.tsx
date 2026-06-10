import "@/app/messenger-view-transitions.css";
import "@/app/messenger-home-bottom-sheet.css";
import "@/app/delivery-chat-room.css";
import { CommunityMessengerGuestGate } from "@/components/community-messenger/CommunityMessengerGuestGate";
import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";
import { CommunityMessengerRoomClientPrefetch } from "@/components/community-messenger/CommunityMessengerRoomClientPrefetch";
import { MessengerSnackbarHost } from "@/components/community-messenger/MessengerSnackbarHost";
import { CommunityMessengerPresenceRuntimeChrome } from "@/components/layout/providers/CommunityMessengerPresenceRuntimeChrome";
import { MessengerBootstrapEarlyWarm } from "@/components/community-messenger/MessengerBootstrapEarlyWarm";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerPresenceRuntimeChrome />
      <MessengerBootstrapEarlyWarm />
      <CommunityMessengerRoomClientPrefetch />
      <CommunityMessengerMediaPreflight />
      <MessengerSnackbarHost />
      <div className="sam-domain-shell sam-messenger-vt-root">
        <CommunityMessengerGuestGate>{children}</CommunityMessengerGuestGate>
      </div>
    </>
  );
}

import "@/app/messenger-view-transitions.css";
import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";
import { CommunityMessengerRoomClientPrefetch } from "@/components/community-messenger/CommunityMessengerRoomClientPrefetch";
import { MessengerSnackbarHost } from "@/components/community-messenger/MessengerSnackbarHost";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerRoomClientPrefetch />
      <CommunityMessengerMediaPreflight />
      <MessengerSnackbarHost />
      <div className="sam-domain-shell sam-messenger-vt-root">{children}</div>
    </>
  );
}

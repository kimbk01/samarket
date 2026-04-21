import "@/app/community-messenger-line-skin.css";
import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";
import { CommunityMessengerRoomClientPrefetch } from "@/components/community-messenger/CommunityMessengerRoomClientPrefetch";
import { MessengerSnackbarHost } from "@/components/community-messenger/MessengerSnackbarHost";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerRoomClientPrefetch />
      <CommunityMessengerMediaPreflight />
      <MessengerSnackbarHost />
      <div data-cm-ui="line" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
    </>
  );
}

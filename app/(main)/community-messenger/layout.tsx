import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";
import { CommunityMessengerRoomClientPrefetch } from "@/components/community-messenger/CommunityMessengerRoomClientPrefetch";
import { MessengerSnackbarHost } from "@/components/community-messenger/MessengerSnackbarHost";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerRoomClientPrefetch />
      <CommunityMessengerMediaPreflight />
      <MessengerSnackbarHost />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app text-sam-fg">
        {children}
      </div>
    </>
  );
}

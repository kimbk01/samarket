import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";
import { MessengerSnackbarHost } from "@/components/community-messenger/MessengerSnackbarHost";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerMediaPreflight />
      <MessengerSnackbarHost />
      {children}
    </>
  );
}

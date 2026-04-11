import { CommunityMessengerMediaPreflight } from "@/components/community-messenger/CommunityMessengerMediaPreflight";

export default function CommunityMessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityMessengerMediaPreflight />
      {children}
    </>
  );
}

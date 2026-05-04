import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

/** 배달 묶음 세그먼트 전환 시 인박스 전체 목록이 잠깐 보이지 않도록 즉시 스켈레톤 유지 */
export default function DeliveryChatsLoading() {
  return <CommunityMessengerHomeShellSkeleton />;
}

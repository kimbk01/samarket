import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";

/**
 * 세그먼트 청크 로드·하이드레이션 동안 흰 화면 대신 통화 connecting 골격을 유지한다.
 */
export default function CommunityMessengerCallSegmentLoading() {
  return <CommunityMessengerCallRouteLoading />;
}

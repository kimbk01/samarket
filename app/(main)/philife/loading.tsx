import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

/** 하단 탭으로 /philife 진입 시 RSC 경계에서 즉시 골격 표시 */
export default function PhilifeLoading() {
  return <MainFeedRouteLoading rows={5} />;
}

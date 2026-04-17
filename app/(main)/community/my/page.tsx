import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

export default function CommunityMyPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <CommunityMyPageBody />
    </Suspense>
  );
}

async function CommunityMyPageBody() {
  return redirect("/philife/my");
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

interface Props {
  params: Promise<{ postId: string }>;
}

/** 레거시 `/community/:postId` → `/philife/:postId` */
export default function CommunityNeighborhoodPostPage({ params }: Props) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <CommunityNeighborhoodPostPageBody params={params} />
    </Suspense>
  );
}

async function CommunityNeighborhoodPostPageBody({ params }: Props) {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!seg) return redirect("/philife");
  return redirect(`/philife/${encodeURIComponent(seg)}`);
}

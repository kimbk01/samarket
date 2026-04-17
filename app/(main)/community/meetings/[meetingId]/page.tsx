import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string }>;
}

export default function CommunityMeetingPage({ params }: Props) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <CommunityMeetingPageBody params={params} />
    </Suspense>
  );
}

async function CommunityMeetingPageBody({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim();
  if (!id) return redirect("/philife");
  return redirect(philifeAppPaths.meeting(id));
}

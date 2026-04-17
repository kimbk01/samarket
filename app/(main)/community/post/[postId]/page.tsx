import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

interface Props {
  params: Promise<{ postId: string }>;
}

/** 호환: /community/post/:id → /philife/:id (당근형 단일 경로) */
export default function CommunityLegacyPostAliasPage({ params }: Props) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <CommunityLegacyPostAliasPageBody params={params} />
    </Suspense>
  );
}

async function CommunityLegacyPostAliasPageBody({ params }: Props) {
  const { postId } = await params;
  const id = postId?.trim();
  if (!id) return notFound();

  const canonical = await resolveCanonicalCommunityPostId(id);
  if (!canonical) return notFound();
  return redirect(`/philife/${canonical}`);
}

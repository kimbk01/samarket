import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { WriteForm } from "@/components/community/WriteForm";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildLoginPath } from "@/lib/auth/safe-next-path";
import { isSameUserId } from "@/lib/auth/same-user-id";
import { isCommunityImportedOrigin } from "@/lib/community/community-post-origin";
import { getNeighborhoodPostDetail } from "@/lib/neighborhood/queries";
import { isUuidString } from "@/lib/shared/uuid-string";
import { philifeAppPaths } from "@domain/philife/paths";

interface PhilifeWritePageProps {
  searchParams: Promise<{
    category?: string;
    edit?: string;
  }>;
}

export default function PhilifeWritePage({ searchParams }: PhilifeWritePageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifeWritePageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function PhilifeWritePageBody({ searchParams }: PhilifeWritePageProps) {
  const { category, edit } = await searchParams;
  if (category?.trim().toLowerCase() === "meetup") {
    /** 모임 UX는 Philife meetup 글쓰기가 아닌 메신저 `open_chat`·오픈그룹 시트로 통일 */
    redirect("/community-messenger?section=open_chat&open=public-group-find");
  }

  const editId = edit?.trim() ?? "";
  if (editId) {
    if (!isUuidString(editId)) {
      redirect(philifeAppPaths.home);
    }
    const viewerId = await getOptionalAuthenticatedUserId();
    if (!viewerId) {
      redirect(buildLoginPath(`${philifeAppPaths.write}?edit=${editId}`));
    }
    const post = await getNeighborhoodPostDetail(editId, { viewerUserId: viewerId });
    if (!post) {
      redirect(philifeAppPaths.home);
    }
    if (!isSameUserId(viewerId, post.author_id) || isCommunityImportedOrigin(post.origin_kind) || post.is_meetup) {
      redirect(philifeAppPaths.post(post.id));
    }
    return (
      <WriteForm
        editPostId={post.id}
        initialCategory={post.category}
        initialTitle={post.title}
        initialContent={post.content}
        initialImages={post.images}
      />
    );
  }

  return <WriteForm initialCategory={category} />;
}

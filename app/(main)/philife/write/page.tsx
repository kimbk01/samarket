import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PhilifeWriteSkeleton } from "@/components/community/PhilifeRouteSkeletons";
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

/** 스켈레톤 소유자 = 이 Suspense 하나(세그먼트 `philife/loading.tsx` 는 중립). 글쓰기 폼 구조와 같은 골격. */
export default function PhilifeWritePage({ searchParams }: PhilifeWritePageProps) {
  return (
    <Suspense fallback={<PhilifeWriteSkeleton />}>
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
        initialContentBlocks={post.origin_kind === "imported" ? null : (post.content_blocks ?? null)}
        initialTopicName={post.category_label}
      />
    );
  }

  return <WriteForm initialCategory={category} />;
}

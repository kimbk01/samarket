import Link from "next/link";
import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { Detail } from "@/components/community/Detail";
import { CommunityPostAccessScreen } from "@/components/community/share/CommunityPostAccessScreen";
import { resolveCommunityPostDetailAccess } from "@/lib/community/share/community-post-access";
import { philifeAppPaths } from "@/lib/philife/paths";
import { isUuidString } from "@/lib/shared/uuid-string";

type Props = {
  postId: string;
};

export async function CommunityPostDetailPageBody({ postId }: Props) {
  const seg = postId?.trim() ?? "";
  if (!seg || !isUuidString(seg)) notFound();

  const viewerId = await getOptionalAuthenticatedUserId();
  const access = await resolveCommunityPostDetailAccess(seg, viewerId);

  if (access.reason !== "ok" || !access.post) {
    return (
      <CommunityPostAccessScreen
        reason={access.reason}
        canonicalPath={`/community/posts/${encodeURIComponent(seg)}`}
      />
    );
  }

  const post = access.post;
  const t0 = performance.now();

  return (
    <Detail
      post={post}
      initialRouteTotalMs={Math.round(performance.now() - t0)}
      similarPosts={[]}
    />
  );
}

export function CommunityPostDetailBackLink() {
  return (
    <Link href={philifeAppPaths.home} className="text-[var(--cm-primary)] underline">
      {/* i18n via parent if needed */}
    </Link>
  );
}

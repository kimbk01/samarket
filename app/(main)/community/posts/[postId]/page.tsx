import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { CommunityPostDetailPageBody } from "@/components/community/CommunityPostDetailPage";
import { buildCommunityPostPageMetadata } from "@/lib/community/share/community-post-metadata";
import { resolveCommunityPostDetailAccess } from "@/lib/community/share/community-post-access";
import { isUuidString } from "@/lib/shared/uuid-string";

interface Props {
  params: Promise<{ postId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!isUuidString(seg)) return { title: "DIBAY" };

  const viewerId = await getOptionalAuthenticatedUserId();
  const access = await resolveCommunityPostDetailAccess(seg, viewerId);
  if (access.reason !== "ok" || !access.post) {
    return { title: "DIBAY", robots: { index: false, follow: false } };
  }
  return buildCommunityPostPageMetadata(access.post);
}

/** canonical 공유·OG 진입 — `/community/posts/:postId` */
export default async function CommunityPostsCanonicalPage({ params }: Props) {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!isUuidString(seg)) notFound();
  return <CommunityPostDetailPageBody postId={seg} />;
}

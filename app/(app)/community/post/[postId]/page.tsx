import { notFound, redirect } from "next/navigation";
import { CommunityPostDetailClient } from "@/components/community/CommunityPostDetailClient";
import {
  getCommunityPostDetail,
  listCommunityPostComments,
  resolveCanonicalCommunityPostId,
} from "@/lib/community-feed/queries";

interface Props {
  params: Promise<{ postId: string }>;
}

export default async function CommunityPostPage({ params }: Props) {
  const { postId } = await params;
  const id = postId?.trim();
  if (!id) notFound();

  const canonical = await resolveCanonicalCommunityPostId(id);
  if (!canonical) notFound();
  if (canonical !== id) {
    redirect(`/community/post/${canonical}`);
  }

  const [post, comments] = await Promise.all([
    getCommunityPostDetail(canonical),
    listCommunityPostComments(canonical),
  ]);
  if (!post) notFound();

  return <CommunityPostDetailClient post={post} initialComments={comments} />;
}

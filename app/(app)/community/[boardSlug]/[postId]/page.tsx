import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ postId: string }>;
}

/** 레거시 /community/free/:id → 피드 상세 */
export default async function LegacyCommunityPostRoute({ params }: Props) {
  const { postId } = await params;
  const id = postId?.trim();
  if (!id) redirect("/community");
  redirect(`/community/post/${id}`);
}

import { MoimPostDetailScreen } from "@/components/moim/MoimPostDetailScreen";

export default async function MoimPostPage({ params }: { params: Promise<{ moimId: string; postId: string }> }) {
  const { moimId, postId } = await params;
  return <MoimPostDetailScreen moimId={moimId} postId={postId} />;
}

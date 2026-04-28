import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ postId: string }>;
}

/** 레거시 `/community/:postId` → `/philife/:postId` */
export default async function CommunityNeighborhoodPostPage({ params }: Props) {
  return <CommunityNeighborhoodPostPageBody params={params} />;
}

async function CommunityNeighborhoodPostPageBody({ params }: Props) {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!seg) return redirect("/philife");
  return redirect(`/philife/${encodeURIComponent(seg)}`);
}

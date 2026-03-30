import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ postId: string }>;
}

/** 레거시 `/community/:postId` → `/philife/:postId` */
export default async function CommunityNeighborhoodPostPage({ params }: Props) {
  const { postId } = await params;
  const seg = postId?.trim() ?? "";
  if (!seg) redirect("/philife");
  redirect(`/philife/${encodeURIComponent(seg)}`);
}

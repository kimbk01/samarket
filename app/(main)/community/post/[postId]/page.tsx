import { notFound, redirect } from "next/navigation";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";

interface Props {
  params: Promise<{ postId: string }>;
}

/** 호환: /community/post/:id → /philife/:id (당근형 단일 경로) */
export default async function CommunityLegacyPostAliasPage({ params }: Props) {
  return <CommunityLegacyPostAliasPageBody params={params} />;
}

async function CommunityLegacyPostAliasPageBody({ params }: Props) {
  const { postId } = await params;
  const id = postId?.trim();
  if (!id) return notFound();

  const canonical = await resolveCanonicalCommunityPostId(id);
  if (!canonical) return notFound();
  return redirect(`/philife/${canonical}`);
}

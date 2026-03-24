import { CommunityWriteFormClient } from "@/components/community/CommunityWriteFormClient";
import { listTopicsForSectionSlug } from "@/lib/community-feed/queries";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";

interface Props {
  searchParams: Promise<{ section?: string }>;
}

export default async function CommunityWritePage({ searchParams }: Props) {
  const sp = await searchParams;
  const section = normalizeSectionSlug(sp.section);
  const topics = await listTopicsForSectionSlug(section);
  return <CommunityWriteFormClient sectionSlug={section} topics={topics} />;
}

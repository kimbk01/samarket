import { notFound } from "next/navigation";
import { findMypageMobileSection } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageSectionMenuClient } from "@/components/mypage/MyPageSectionMenuClient";

export default async function MypageSectionListPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: raw } = await params;
  const section = findMypageMobileSection(raw);
  if (!section) notFound();

  return <MyPageSectionMenuClient section={section} />;
}

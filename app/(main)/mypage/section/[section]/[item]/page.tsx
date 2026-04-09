import { notFound } from "next/navigation";
import { findMypageMobileItem } from "@/lib/mypage/mypage-mobile-nav-registry";
import { loadMypageServer } from "@/lib/my/load-mypage-server";
import { MyPageItemRouteClient } from "@/components/mypage/MyPageItemRouteClient";

export const dynamic = "force-dynamic";

export default async function MypageSectionItemPage({
  params,
}: {
  params: Promise<{ section: string; item: string }>;
}) {
  const { section: s, item: i } = await params;
  const meta = findMypageMobileItem(s, i);
  if (!meta) notFound();

  const initialMyPageData = await loadMypageServer();

  return (
    <MyPageItemRouteClient initialMyPageData={initialMyPageData} section={s} item={i} itemLabel={meta.label} />
  );
}

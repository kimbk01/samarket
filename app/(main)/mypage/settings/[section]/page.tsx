import { redirect } from "next/navigation";

const SECTION_REDIRECTS: Record<string, string> = {
  account: "/mypage?tab=account&section=basic",
  notifications: "/mypage?tab=messenger&section=alerts",
  "quiet-hours": "/mypage?tab=messenger&section=alerts",
  "order-notifications": "/mypage?tab=messenger&section=alerts",
  following: "/mypage?tab=settings&section=users",
  "blocked-users": "/mypage?tab=settings&section=users",
  "hidden-users": "/mypage?tab=settings&section=users",
  autoplay: "/mypage?tab=settings&section=service",
  "region-bulk": "/mypage?tab=settings&section=region-language",
  chat: "/mypage?tab=settings&section=service",
  preferences: "/mypage?tab=settings&section=service",
  notice: "/mypage?tab=settings&section=support",
  country: "/mypage?tab=settings&section=region-language",
  language: "/mypage?tab=settings&section=region-language",
  cache: "/mypage?tab=settings&section=system",
  version: "/mypage?tab=settings&section=system",
  leave: "/mypage?tab=settings&section=system",
};

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  redirect(SECTION_REDIRECTS[section] ?? "/mypage?tab=settings&section=service");
}

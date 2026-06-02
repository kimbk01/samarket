import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

const SECTION_REDIRECTS: Record<string, string> = {
  account: "/mypage/section/account/account-info",
  notifications: "/mypage/section/settings/notifications",
  "quiet-hours": "/mypage/section/settings/notifications",
  "order-notifications": "/mypage/section/settings/notifications",
  following: "/mypage/section/account/favorite-users",
  "blocked-users": "/mypage/section/account/blocked-users",
  "hidden-users": "/mypage/section/account/hidden-users",
  autoplay: "/mypage/section/settings/video-autoplay",
  "region-bulk": "/mypage/section/settings/region",
  chat: "/mypage/section/settings/chat-settings",
  preferences: "/mypage/section/settings/personalization",
  notice: "/mypage/section/settings/notices",
  notices: "/mypage/section/settings/notices",
  country: "/mypage/section/settings/country",
  language: "/mypage/section/settings/language",
  cache: "/mypage/section/settings/cache",
  version: "/mypage/section/settings/version",
  leave: "/mypage/section/settings/leave",
  permissions: "/mypage/section/settings/device-permissions",
  "device-permissions": "/mypage/section/settings/device-permissions",
};

export default function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <SettingsSectionPageBody params={params} />
    </Suspense>
  );
}

async function SettingsSectionPageBody({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return redirect(SECTION_REDIRECTS[section] ?? "/mypage/section/settings/chat-settings");
}

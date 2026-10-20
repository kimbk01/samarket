import { redirect } from "next/navigation";

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
  notice: "/mypage/customer-center/notice",
  notices: "/mypage/customer-center/notice",
  country: "/mypage/section/settings/country",
  language: "/mypage/section/settings/language",
  cache: "/mypage/section/settings/cache",
  version: "/mypage/section/settings/version",
  leave: "/mypage/section/settings/leave",
  permissions: "/mypage/section/settings/device-permissions",
  "device-permissions": "/mypage/section/settings/device-permissions",
};

/** 레거시 설정 경로 — 항상 리다이렉트. Suspense 밖에서 실행해 실제 HTTP 리다이렉트(대체 스켈레톤 노출 없음). */
export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return redirect(SECTION_REDIRECTS[section] ?? "/mypage/section/settings/chat-settings");
}

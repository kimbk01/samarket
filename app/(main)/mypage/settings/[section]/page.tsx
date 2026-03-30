import { redirect } from "next/navigation";

const SECTION_REDIRECTS: Record<string, string> = {
  account: "/my/settings/account",
  notifications: "/my/settings/notifications",
  "quiet-hours": "/my/settings/notifications",
  following: "/my/settings/favorite-users",
  "hidden-users": "/my/settings/hidden-users",
  autoplay: "/my/settings/video-autoplay",
  "region-bulk": "/my/settings/bulk-region-change",
  chat: "/my/settings/chat",
  preferences: "/my/settings/personalization",
  notice: "/my/settings/notices",
  country: "/my/settings/country",
  language: "/my/settings/language",
  cache: "/my/settings/cache",
  version: "/my/settings/version",
  leave: "/my/settings/leave",
};

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  redirect(SECTION_REDIRECTS[section] ?? "/my/settings");
}

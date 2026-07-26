import { redirect } from "next/navigation";

/** Legacy `/my/recent-viewed` — canonical `/mypage/recent-viewed`. */
export default function MyRecentViewedLegacyRedirectPage() {
  redirect("/mypage/recent-viewed");
}

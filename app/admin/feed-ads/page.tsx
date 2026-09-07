import { redirect } from "next/navigation";

/** Feed execution list → 노출 관리 */
export default function AdminFeedAdsRedirectPage() {
  redirect("/admin/advertising/operations");
}

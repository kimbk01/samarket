import { redirect } from "next/navigation";

/** Community promote queue → 상위노출 관리 */
export default function AdminCommunityPromotionsRedirectPage() {
  redirect("/admin/advertising/boosts");
}

import { redirect } from "next/navigation";

/** Legacy Point exposure list → 광고 이력 */
export default function AdminPromotedItemsRedirectPage() {
  redirect("/admin/advertising/history");
}

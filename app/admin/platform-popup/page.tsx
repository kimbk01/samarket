import { redirect } from "next/navigation";

/** Popup hub → 노출 관리 (detail routes under /admin/platform-popup/* stay) */
export default function AdminPlatformPopupRedirectPage() {
  redirect("/admin/advertising/operations");
}

import { redirect } from "next/navigation";

/** Residual path — canonical MyPage CMS create is /admin/my/banners/create. */
export default function AdminBannerCreateRedirect() {
  redirect("/admin/my/banners/create");
}

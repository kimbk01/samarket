import { redirect } from "next/navigation";
import { MYPAGE_DOMAIN_ROOT_PATH } from "@/lib/mypage/mypage-authority-contract";

/** Slice 2 Authority: legacy `/my/logout` → Member hub (no push confirm). */
export default function LogoutPage() {
  redirect(MYPAGE_DOMAIN_ROOT_PATH);
}

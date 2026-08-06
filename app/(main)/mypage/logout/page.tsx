import { redirect } from "next/navigation";
import { MYPAGE_DOMAIN_ROOT_PATH } from "@/lib/mypage/mypage-authority-contract";

/**
 * Slice 2 Authority: logout confirm must be modal, not a push confirm page.
 * Legacy deep links land on Member hub; open logout from Danger CTA there.
 */
export default function MypageLogoutPage() {
  redirect(MYPAGE_DOMAIN_ROOT_PATH);
}

import { redirect } from "next/navigation";
import { MYPAGE_HOME_ACCOUNT_LEAVE_HREF } from "@/lib/mypage/mypage-home-hub-links";

/** Slice 6: parallel delete-request → leave SSOT */
export default function AccountDeleteRequestPage() {
  redirect(MYPAGE_HOME_ACCOUNT_LEAVE_HREF);
}

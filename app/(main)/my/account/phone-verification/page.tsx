import { redirect } from "next/navigation";
import { MYPAGE_REQUIRED_PHONE_HREF } from "@/lib/mypage/mypage-profile-routes";

export default function MyPhoneVerificationRedirectPage() {
  redirect(MYPAGE_REQUIRED_PHONE_HREF);
}

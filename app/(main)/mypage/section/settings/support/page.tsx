import { redirect } from "next/navigation";
import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";

/** Legacy stub — hard route so Capacitor WebView / CDP get a real navigation target. */
export default function LegacyMypageSupportRedirectPage() {
  redirect(CUSTOMER_CENTER_HREF);
}

import { redirect } from "next/navigation";

/** Legacy list bridge → Notice board. */
export default function LegacySettingsNoticesPage() {
  redirect("/mypage/customer-center/notice");
}

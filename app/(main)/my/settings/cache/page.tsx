import { redirect } from "next/navigation";
import { buildMyPageHref } from "@/components/mypage/mypage-nav";

export default function CachePage() {
  redirect(buildMyPageHref("settings", "system"));
}

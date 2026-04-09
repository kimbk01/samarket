import { redirect } from "next/navigation";
import { buildMyPageHref } from "@/components/mypage/mypage-nav";

export default function CountryPage() {
  redirect(buildMyPageHref("settings", "region-language"));
}

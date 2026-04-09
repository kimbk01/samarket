import { redirect } from "next/navigation";
import { buildMyPageHref } from "@/components/mypage/mypage-nav";

export default function BulkRegionChangePage() {
  redirect(buildMyPageHref("settings", "region-language"));
}

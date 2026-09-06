import { redirect } from "next/navigation";

/** MERGE: post-ads is not a parallel Ads mutation surface — use Promote / Feed queues. */
export default function AdminPostAdsPage() {
  redirect("/admin/ad-applications?domain=trade");
}

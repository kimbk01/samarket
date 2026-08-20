import { redirect } from "next/navigation";

export default function AdminCommunityPromotionsPage() {
  redirect("/admin/ad-applications?domain=community");
}

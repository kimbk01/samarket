import { redirect } from "next/navigation";

/** MERGE: legacy ad-products catalog → Feed Ad products (canonical price SSOT for Feed Banner). */
export default function AdminAdProductsPage() {
  redirect("/admin/feed-ad-products");
}

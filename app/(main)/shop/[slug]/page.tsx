import { redirect } from "next/navigation";
import { parseSlug } from "@/lib/validate-params";

export default async function ShopSlugRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: raw } = await params;
  const slug = parseSlug(raw);
  if (!slug) {
    redirect("/");
  }
  redirect(`/stores/${encodeURIComponent(slug)}`);
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { StoresBrowsePrimaryView } from "@/components/stores/browse/StoresBrowsePrimaryView";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

interface PageProps {
  params: Promise<{ primary: string }>;
  searchParams: Promise<{ sub?: string }>;
}

type TaxonomyJson = {
  ok?: boolean;
  categories?: { id: string; name: string; slug: string }[];
  topics?: { name: string; slug: string; store_category_id: string }[];
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { primary } = await params;
  const sp = await searchParams;
  const sub = typeof sp.sub === "string" ? sp.sub.trim().toLowerCase() : "";
  const p = typeof primary === "string" ? primary.trim().toLowerCase() : "";
  if (!p) return { title: "매장 둘러보기" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: "매장 둘러보기" };
  const base = `${proto}://${host}`;

  let primaryName = p;
  let subName: string | null = null;

  try {
    const res = await fetch(`${base}/api/stores/taxonomy`, { cache: "no-store" });
    const json = (await res.json()) as TaxonomyJson;
    if (json?.ok && Array.isArray(json.categories)) {
      const cat = json.categories.find((c) => (c.slug ?? "").toLowerCase() === p);
      if (cat?.name) primaryName = cat.name;
      if (sub && cat?.id && Array.isArray(json.topics)) {
        const topic = json.topics.find(
          (t) =>
            (t.slug ?? "").toLowerCase() === sub && String(t.store_category_id) === String(cat.id)
        );
        if (topic?.name) subName = topic.name;
      }
    }
  } catch {
    /* slug 그대로 */
  }

  const label = subName ? `${primaryName} · ${subName}` : primaryName;
  const description = subName
    ? `${subName} ${primaryName} 매장을 동네 기준으로 찾아보세요.`
    : `${primaryName} 업종 매장을 동네 기준으로 찾아보세요.`;

  const path = sub
    ? `/stores/browse/${encodeURIComponent(p)}?sub=${encodeURIComponent(sub)}`
    : `/stores/browse/${encodeURIComponent(p)}`;

  return {
    title: `${label} 매장`,
    description: description.slice(0, 160),
    alternates: { canonical: `${base}${path}` },
  };
}

export default async function StoresBrowsePrimaryPage({ params, searchParams }: PageProps) {
  const { primary } = await params;
  const sp = await searchParams;
  const sub = typeof sp.sub === "string" && sp.sub.trim() ? sp.sub.trim().toLowerCase() : null;
  const safePrimary = typeof primary === "string" ? primary.trim().toLowerCase() : "";

  return (
    <div className={`${APP_MAIN_GUTTER_X_CLASS} py-3`}>
      <StoresBrowsePrimaryView primarySlug={safePrimary} initialSubSlug={sub} />
    </div>
  );
}

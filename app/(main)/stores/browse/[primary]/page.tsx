import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { DeliveryBrowseRouteBridge } from "@/components/delivery/presentation/DeliveryBrowseRouteBridge";

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
  const h = await headers();
  const cookieStore = await cookies();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get("sam_lang")?.value ?? cookieStore.get("app_lang")?.value,
    acceptLanguage: h.get("accept-language"),
  });
  const metaDefaultTitle = safeTranslate(lang, "store_browse_meta_default", {
    fallbackKo: "매장 둘러보기",
    fallbackEn: "Browse stores",
  });
  if (!p) return { title: metaDefaultTitle };

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: metaDefaultTitle };
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
    ? safeTranslate(lang, "store_browse_meta_desc_sub", {
        vars: { sub: subName, primary: primaryName },
        fallbackKo: `${subName} ${primaryName} 매장을 동네 기준으로 찾아보세요.`,
        fallbackEn: `Find ${subName} ${primaryName} stores near you.`,
      })
    : safeTranslate(lang, "store_browse_meta_desc_primary", {
        vars: { primary: primaryName },
        fallbackKo: `${primaryName} 업종 매장을 동네 기준으로 찾아보세요.`,
        fallbackEn: `Find ${primaryName} stores near you.`,
      });

  const path = `/stores/browse/${encodeURIComponent(p)}?sub=${encodeURIComponent(sub || "all")}`;

  return {
    title: safeTranslate(lang, "store_browse_meta_title_suffix", {
      vars: { label },
      fallbackKo: `${label} 매장`,
      fallbackEn: `${label} stores`,
    }),
    description: description.slice(0, 160),
    alternates: { canonical: `${base}${path}` },
  };
}

export default function StoresBrowsePrimaryPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <StoresBrowsePrimaryPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StoresBrowsePrimaryPageBody({ params, searchParams }: PageProps) {
  const { primary } = await params;
  const sp = await searchParams;
  const sub = typeof sp.sub === "string" && sp.sub.trim() ? sp.sub.trim().toLowerCase() : null;
  const safePrimary = typeof primary === "string" ? primary.trim().toLowerCase() : "";

  /** ARCH B: route identity only — BrowseSurface lives in DeliveryPresentationShell. */
  return (
    <DeliveryBrowseRouteBridge primarySlug={safePrimary} initialSubSlug={sub} />
  );
}

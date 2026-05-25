import type { Metadata } from "next";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { StoreReviewsPageClient } from "@/components/stores/StoreReviewsPageClient";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(typeof slug === "string" ? slug : "").trim();
  const h = await headers();
  const cookieStore = await cookies();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get("sam_lang")?.value ?? cookieStore.get("app_lang")?.value,
    acceptLanguage: h.get("accept-language"),
  });
  const fallbackReviewsTitle = safeTranslate(lang, "store_meta_reviews_title", {
    fallbackKo: "리뷰",
    fallbackEn: "Reviews",
  });
  const fallbackStoreName = safeTranslate(lang, "store_fallback_name", {
    fallbackKo: "매장",
    fallbackEn: "Store",
  });
  if (!decoded) return { title: fallbackReviewsTitle };

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: fallbackReviewsTitle };

  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/${encodeURIComponent(decoded)}`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    const json = (await res.json()) as { ok?: boolean; store?: { store_name?: string } };
    if (!json?.ok || !json.store) return { title: fallbackReviewsTitle };
    return { title: `${fallbackReviewsTitle} · ${String(json.store.store_name ?? fallbackStoreName)}` };
  } catch {
    return { title: fallbackReviewsTitle };
  }
}

export default function StoreReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={6} />}>
      <StoreReviewsPageBody params={params} />
    </Suspense>
  );
}

async function StoreReviewsPageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return <StoreReviewsPageClient slug={safe} />;
}

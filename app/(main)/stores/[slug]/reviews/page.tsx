import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { StoreReviewsPageClient } from "@/components/stores/StoreReviewsPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(typeof slug === "string" ? slug : "").trim();
  if (!decoded) return { title: "리뷰" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: "리뷰" };

  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/${encodeURIComponent(decoded)}`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    const json = (await res.json()) as { ok?: boolean; store?: { store_name?: string } };
    if (!json?.ok || !json.store) return { title: "리뷰" };
    return { title: `리뷰 · ${String(json.store.store_name ?? "매장")}` };
  } catch {
    return { title: "리뷰" };
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

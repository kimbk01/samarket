import type { Metadata } from "next";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { StoreDetailInfoPublic } from "@/components/stores/StoreDetailInfoPublic";
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
  const fallbackInfoTitle = safeTranslate(lang, "store_meta_store_info_title", {
    fallbackKo: "가게정보",
    fallbackEn: "Store info",
  });
  const fallbackStoreName = safeTranslate(lang, "store_fallback_name", {
    fallbackKo: "매장",
    fallbackEn: "Store",
  });
  if (!decoded) return { title: fallbackInfoTitle };

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
  if (!host) return { title: fallbackInfoTitle };

  const base = `${proto}://${host}`;
  try {
    const res = await fetch(`${base}/api/stores/${encodeURIComponent(decoded)}`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    const json = (await res.json()) as { ok?: boolean; store?: { store_name?: string } };
    if (!json?.ok || !json.store) return { title: fallbackInfoTitle };
    return { title: `${fallbackInfoTitle} · ${String(json.store.store_name ?? fallbackStoreName)}` };
  } catch {
    return { title: fallbackInfoTitle };
  }
}

export default function StoreInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <StoreInfoPageBody params={params} />
    </Suspense>
  );
}

async function StoreInfoPageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return <StoreDetailInfoPublic slug={safe} />;
}

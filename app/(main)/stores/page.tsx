import type { Metadata } from "next";
import { cookies, headers } from "next/headers";import { Suspense } from "react";
import { StoresHub } from "@/components/stores/StoresHub";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const cookieStore = await cookies();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get("sam_lang")?.value ?? cookieStore.get("app_lang")?.value,
    acceptLanguage: h.get("accept-language"),
  });
  return {
    title: safeTranslate(lang, "store_feed_stores_title", { fallbackKo: "매장", fallbackEn: "Stores" }),
    description: safeTranslate(lang, "store_stores_page_meta_description", {
      fallbackKo: "동네 매장을 지역·검색·업종별로 찾고, 메뉴·상품을 주문해 보세요.",
      fallbackEn: "Find neighborhood stores by area, search, and category — order food and products.",
    }),
  };
}

export default function StoresPage() {
  return (
    <div className={`delivery-ui ${DeliveryTheme.page} min-h-0`}>
      <Suspense fallback={null}>
        <StoresHub />
      </Suspense>
    </div>
  );
}

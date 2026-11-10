import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { StoresHub } from "@/components/stores/StoresHub";
import { DeliveryTheme } from "@/lib/design/delivery-theme";
import { APP_LANGUAGE_COOKIE } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const cookieStore = await cookies();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get(APP_LANGUAGE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  });
  return {
    title: safeTranslate(lang, "store_feed_stores_title"),
    description: safeTranslate(lang, "store_stores_page_meta_description"),
  };
}

/**
 * CONTRACT — `/stores` 단일 client hub (`StoresHub` → `StoresHomeHub`).
 * Cold Boot / Bottom Tab: `(main)` layout 유지 — `(stores)` route group remount 금지.
 * DO NOT: legacy SSR initial shell / category seed.
 */
export default function StoresPage() {
  return (
    <div
      className={`delivery-ui ${DeliveryTheme.page} min-h-0`}
      data-stores-layout-profile="stores-hub"
    >
      <StoresHub />
    </div>
  );
}

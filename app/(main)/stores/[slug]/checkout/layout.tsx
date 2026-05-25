import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const h = await headers();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get("sam_lang")?.value ?? cookieStore.get("app_lang")?.value,
    acceptLanguage: h.get("accept-language"),
  });
  return {
    title: safeTranslate(lang, "store_meta_checkout_title", {
      fallbackKo: "주문서",
      fallbackEn: "Checkout",
    }),
  };
}

export default function StoreCheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}

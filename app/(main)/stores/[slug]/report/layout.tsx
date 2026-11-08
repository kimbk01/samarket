import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { APP_LANGUAGE_COOKIE } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const h = await headers();
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get(APP_LANGUAGE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  });
  return {
    title: safeTranslate(lang, "store_meta_report_title"),
    description: safeTranslate(lang, "store_meta_report_desc"),
  };
}

export default function StoreReportLayout({ children }: { children: ReactNode }) {
  return children;
}

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
    title: safeTranslate(lang, "store_meta_report_title", {
      fallbackKo: "매장·상품 신고",
      fallbackEn: "Report store or item",
    }),
    description: safeTranslate(lang, "store_meta_report_desc", {
      fallbackKo: "매장 또는 상품에 대한 신고를 접수합니다.",
      fallbackEn: "Submit a report about a store or product.",
    }),
  };
}

export default function StoreReportLayout({ children }: { children: ReactNode }) {
  return children;
}

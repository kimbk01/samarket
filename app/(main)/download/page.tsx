import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/brand/app-display-name";
import { DIBAY_APP_ICON_512_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { APP_LANGUAGE_COOKIE } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { DIBAY_APP_LANDING_PATH, DIBAY_IOS_APP_STORE_ID } from "@/lib/share/app-store-links";
import { resolveShareSiteOrigin } from "@/lib/share/share-url";
import { AppDownloadLanding } from "./AppDownloadLanding";

/**
 * 앱 공유 착지 페이지 (Owner G-1 2026-11-14) — 「DIBAY 공유하기」 링크가 여는 공개 화면.
 * - 링크 미리보기 = 앱 이름 · 소개 · 앱 아이콘.
 * - iOS Safari 기본 앱 배너(`apple-itunes-app`): 설치돼 있으면 「열기」, 없으면 「받기」를 iOS 가 판단 (§H-2).
 *   웹에서 설치 여부를 직접 판별하지 않는다.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [h, cookieStore] = await Promise.all([headers(), cookies()]);
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get(APP_LANGUAGE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  });
  const description = safeTranslate(lang, "share_app_desc");
  const origin = resolveShareSiteOrigin();
  const url = `${origin}${DIBAY_APP_LANDING_PATH}`;
  const image = `${origin}${dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}`;
  return {
    title: APP_PRODUCT_DISPLAY_NAME,
    description,
    openGraph: {
      type: "website",
      siteName: APP_PRODUCT_DISPLAY_NAME,
      title: APP_PRODUCT_DISPLAY_NAME,
      description,
      url,
      images: [{ url: image, width: 512, height: 512 }],
    },
    twitter: { card: "summary", title: APP_PRODUCT_DISPLAY_NAME, description, images: [image] },
    alternates: { canonical: url },
    other: { "apple-itunes-app": `app-id=${DIBAY_IOS_APP_STORE_ID}` },
  };
}

export default function AppDownloadPage() {
  return <AppDownloadLanding />;
}

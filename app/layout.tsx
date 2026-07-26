import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { cookies, headers } from "next/headers";
import { AppBootProvider } from "@/components/app/AppBootProvider";
import { DibayStartupIntroController } from "@/components/app/DibayStartupIntro";
import { OAuthReturnListener } from "@/components/auth/OAuthReturnListener";
import { CapacitorNativeMarkerBootstrap } from "@/components/platform/CapacitorNativeMarkerBootstrap";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
import { AppLanguageProvider } from "@/components/i18n/AppLanguageProvider";
import { AppTitle } from "@/components/layout/AppTitle";
import { CallIncomingChromeRoot } from "@/components/layout/providers/CallIncomingChromeRoot";
import { DeferredMainShellMessengerParticipantBridge } from "@/components/layout/DeferredMainShellMessengerParticipantBridge";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/brand/app-display-name";
import {
  DIBAY_APP_ICON_180_PATH,
  DIBAY_APP_ICON_512_PATH,
  DIBAY_FAVICON_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";
import {
  DIBAY_STARTUP_INTRO_DOM_ID,
  STARTUP_HANDOFF_SESSION_KEY,
  STARTUP_SESSION_KEY,
} from "@/lib/startup/startup-constants";
import { STARTUP_CONFIG_LOCAL_STORAGE_KEY } from "@/lib/startup/startup-config";
import { buildStartupIntroMarkup } from "@/lib/startup/startup-shell-markup";
import { APP_LANGUAGE_COOKIE, type AppLanguageCode } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-noto-sans-kr",
  display: "swap",
  /** 본문은 Pretendard Variable 우선 — Noto 선로딩이 미사용 preload 경고를 자주 낸다 */
  preload: false,
});

export const metadata: Metadata = {
  title: APP_PRODUCT_DISPLAY_NAME,
  description: `${APP_PRODUCT_DISPLAY_NAME} marketplace`,
  applicationName: APP_PRODUCT_DISPLAY_NAME,
  icons: {
    icon: [
      { url: dibayBrandAssetUrl(DIBAY_FAVICON_PATH), sizes: "any" },
      {
        url: dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH),
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: [
      {
        url: dibayBrandAssetUrl(DIBAY_APP_ICON_180_PATH),
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: APP_PRODUCT_DISPLAY_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

/** 모바일·태블릿 웹뷰/PWA 대비 — 반응형 레이아웃·노치 영역 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /** Android Chrome 등: 가상 키보드 시 레이아웃 뷰포트가 줄어들어 채팅 입력·flex 높이와 맞기 쉬움 */
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B421A" },
    { media: "(prefers-color-scheme: dark)", color: "#0B421A" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const langCookie = jar.get(APP_LANGUAGE_COOKIE)?.value;
  const hdr = await headers();
  const acceptLanguage = hdr.get("accept-language");
  const initialLanguage: AppLanguageCode = resolveServerInitialLanguage({
    cookieValue: langCookie ?? null,
    acceptLanguage,
  });

  const forwardedHost = hdr.get("x-forwarded-host");
  const host = (forwardedHost ?? hdr.get("host") ?? "").split(",")[0]?.trim() ?? "";
  const forwardedProto = hdr.get("x-forwarded-proto");
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim() || "https"
      : "https";
  const appOrigin = host ? `${proto}://${host}` : "";

  const introLogoSrc = dibayBrandAssetUrl(DIBAY_APP_ICON_180_PATH);
  const introMarkup = buildStartupIntroMarkup({ logoSrc: introLogoSrc });

  return (
    <html lang={initialLanguage} suppressHydrationWarning>
      <head>
        {appOrigin ? <link rel="preconnect" href={appOrigin} /> : null}
      </head>
      <body className={`${notoSansKr.variable} font-sans antialiased`} suppressHydrationWarning>
        {/* Single Startup Intro — same source as Local Boot Shell. Handoff skips second intro. */}
        <div dangerouslySetInnerHTML={{ __html: introMarkup }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var id=${JSON.stringify(DIBAY_STARTUP_INTRO_DOM_ID)};var sk=${JSON.stringify(STARTUP_SESSION_KEY)};var hk=${JSON.stringify(STARTUP_HANDOFF_SESSION_KEY)};var ck=${JSON.stringify(STARTUP_CONFIG_LOCAL_STORAGE_KEY)};var el=document.getElementById(id);if(!el)return;if(sessionStorage.getItem(hk)==="1"){sessionStorage.removeItem(hk);sessionStorage.setItem(sk,"1");el.setAttribute("data-ready","1");el.setAttribute("hidden","");el.setAttribute("aria-hidden","true");return;}if(sessionStorage.getItem(sk)==="1"){el.setAttribute("data-ready","1");el.setAttribute("hidden","");return;}var raw=localStorage.getItem(ck);if(!raw)return;var c=JSON.parse(raw);if(!c||typeof c!=="object")return;var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var bg=dark?(c.backgroundColorDark||"#12161d"):(c.backgroundColor||"#FFFCFC");if(c.forceDisable===true||c.enabled===false){el.setAttribute("data-ready","1");el.setAttribute("hidden","");return;}el.style.background=bg;var logo=el.querySelector(".dibay-startup-logo");if(logo){var src=dark&&c.darkLogoUrl?String(c.darkLogoUrl):(c.logoUrl?String(c.logoUrl):null);if(src)logo.setAttribute("src",src);}var wm=el.querySelector(".dibay-startup-wordmark");if(wm){if(c.wordmark)wm.textContent=String(c.wordmark);wm.style.display=c.showWordmark===false?"none":"";}var sub=el.querySelector(".dibay-startup-subtitle");if(sub){var t=(c.subtitle&&String(c.subtitle).trim())||"";sub.textContent=t;sub.style.display=t?"":"none";}var sp=el.querySelector(".dibay-startup-spinner");if(sp){sp.style.display=c.showSpinner===false?"none":"";}}catch(e){}})();`,
          }}
        />
        <AppLanguageProvider initialLanguage={initialLanguage}>
          <AppBootProvider>
            <DibayStartupIntroController />
            <AppTitle />
            <SupabaseAuthSync />
            <CapacitorNativeMarkerBootstrap />
            <OAuthReturnListener />
            <CallIncomingChromeRoot />
            <DeferredMainShellMessengerParticipantBridge regionBarInLayout={true} />
            {children}
          </AppBootProvider>
        </AppLanguageProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { cookies, headers } from "next/headers";
import { AppBootProvider } from "@/components/app/AppBootProvider";
import { DibayColdBootIntroController } from "@/components/app/DibayColdBootIntro";
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
  COLD_BOOT_SESSION_KEY,
  DIBAY_COLD_BOOT_INTRO_DOM_ID,
} from "@/lib/app-boot/cold-boot-constants";
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

  return (
    <html lang={initialLanguage} suppressHydrationWarning>
      <head>
        {appOrigin ? <link rel="preconnect" href={appOrigin} /> : null}
      </head>
      <body className={`${notoSansKr.variable} font-sans antialiased`} suppressHydrationWarning>
        {/* First HTML intro — paints before React; hide on shellReady / warm session. */}
        <div
          id={DIBAY_COLD_BOOT_INTRO_DOM_ID}
          data-dibay-cold-boot-intro="1"
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            background: "#FFFCFC",
            pointerEvents: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- first-HTML cold intro; Thumbnail/Image would delay paint */}
          <img
            className="dibay-cold-boot-logo"
            src={introLogoSrc}
            alt=""
            width={72}
            height={72}
            decoding="async"
            fetchPriority="high"
            style={{ width: 72, height: 72, objectFit: "contain" }}
          />
          <p className="dibay-cold-boot-wordmark" style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: "#0B421A" }}>
            DIBAY
          </p>
          <div
            className="dibay-cold-boot-spinner"
            style={{
              width: 22,
              height: 22,
              borderRadius: 9999,
              border: "2px solid rgba(11,66,26,0.22)",
              borderTopColor: "#0B421A",
            }}
          />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(sessionStorage.getItem(${JSON.stringify(COLD_BOOT_SESSION_KEY)})==="1"){var el=document.getElementById(${JSON.stringify(DIBAY_COLD_BOOT_INTRO_DOM_ID)});if(el){el.setAttribute("data-ready","1");el.setAttribute("hidden","");}}}catch(e){}})();`,
          }}
        />
        <AppLanguageProvider initialLanguage={initialLanguage}>
          <AppBootProvider>
            <DibayColdBootIntroController />
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

import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { cookies, headers } from "next/headers";
import { AppBootProvider } from "@/components/app/AppBootProvider";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
import { AppLanguageProvider } from "@/components/i18n/AppLanguageProvider";
import { AppTitle } from "@/components/layout/AppTitle";
import { CallIncomingChrome } from "@/components/layout/providers/CallIncomingChrome";
import { MainShellMessengerParticipantBridge } from "@/components/layout/MainShellMessengerParticipantBridge";
import {
  APP_LANGUAGE_COOKIE,
  DEFAULT_APP_LANGUAGE,
  normalizeAppLanguage,
  type AppLanguageCode,
} from "@/lib/i18n/config";
import { APP_PRODUCT_DISPLAY_NAME } from "@/lib/brand/app-display-name";
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
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
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
    { media: "(prefers-color-scheme: light)", color: "#1C8DB8" },
    { media: "(prefers-color-scheme: dark)", color: "#1C8DB8" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const langCookie = jar.get(APP_LANGUAGE_COOKIE)?.value;
  const initialLanguage: AppLanguageCode = normalizeAppLanguage(langCookie ?? DEFAULT_APP_LANGUAGE);

  const hdr = await headers();
  const forwardedHost = hdr.get("x-forwarded-host");
  const host = (forwardedHost ?? hdr.get("host") ?? "").split(",")[0]?.trim() ?? "";
  const forwardedProto = hdr.get("x-forwarded-proto");
  const proto =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim() || "https"
      : "https";
  const appOrigin = host ? `${proto}://${host}` : "";

  return (
    <html lang={initialLanguage} suppressHydrationWarning>
      <head>
        {appOrigin ? <link rel="preconnect" href={appOrigin} /> : null}
      </head>
      <body className={`${notoSansKr.variable} font-sans antialiased`} suppressHydrationWarning>
        <AppLanguageProvider initialLanguage={initialLanguage}>
          <AppBootProvider>
            <AppTitle />
            <SupabaseAuthSync />
            <CallIncomingChrome />
            <MainShellMessengerParticipantBridge regionBarInLayout={true} />
            {children}
          </AppBootProvider>
        </AppLanguageProvider>
      </body>
    </html>
  );
}

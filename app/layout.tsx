import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
import { AppLanguageProvider } from "@/components/i18n/AppLanguageProvider";
import { MockAuthProvider } from "@/components/mock-auth/MockAuthProvider";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAMarket",
  description:
    "필리핀 거주 한국인을 위한 중고거래·커뮤니티·스토어 주문·채팅 플랫폼",
  applicationName: "SAMarket",
  appleWebApp: {
    capable: true,
    title: "SAMarket",
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
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7360f2" },
    { media: "(prefers-color-scheme: dark)", color: "#624bef" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${notoSansKr.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <MockAuthProvider>
          <AppLanguageProvider>
            <SupabaseAuthSync />
            {children}
          </AppLanguageProvider>
        </MockAuthProvider>
      </body>
    </html>
  );
}

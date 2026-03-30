import type { Metadata, Viewport } from "next";
import { Roboto, Noto_Sans_KR, Roboto_Mono } from "next/font/google";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
import { MockAuthProvider } from "@/components/mock-auth/MockAuthProvider";
import "./globals.css";

/** 인스타그램 웹과 유사: 시스템 산세리프 + Roboto(변수) + Noto Sans KR — 전역 스택은 `globals.css` */
const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-roboto",
  display: "swap",
});

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

const robotoMono = Roboto_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAMarket",
  description:
    "필리핀 거주 한국인을 위한 중고거래·커뮤니티·스토어 주문·채팅 플랫폼",
};

/** 모바일·태블릿 웹뷰/PWA 대비 — 반응형 레이아웃·노치 영역 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${roboto.variable} ${notoSansKr.variable} ${robotoMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <MockAuthProvider>
          <SupabaseAuthSync />
          {children}
        </MockAuthProvider>
      </body>
    </html>
  );
}

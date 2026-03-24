import type { Metadata } from "next";
import { Roboto, Noto_Sans_KR, Roboto_Mono } from "next/font/google";
import { SupabaseAuthSync } from "@/components/auth/SupabaseAuthSync";
import { MockAuthProvider } from "@/components/mock-auth/MockAuthProvider";
import "./globals.css";

/** Apple: San Francisco(-apple-system). 그 외: Roboto. 한글: Noto Sans KR(글자 단위 폴백) */
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${roboto.variable} ${notoSansKr.variable} ${robotoMono.variable} antialiased`}
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

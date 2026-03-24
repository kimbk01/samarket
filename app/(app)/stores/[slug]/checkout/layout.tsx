import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "주문서",
};

export default function StoreCheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}

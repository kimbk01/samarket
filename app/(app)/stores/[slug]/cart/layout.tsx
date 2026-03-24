import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "장바구니",
};

export default function StoreCartLayout({ children }: { children: ReactNode }) {
  return children;
}

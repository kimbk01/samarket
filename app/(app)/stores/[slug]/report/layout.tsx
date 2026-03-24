import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "매장·상품 신고",
  description: "매장 또는 상품에 대한 신고를 접수합니다.",
};

export default function StoreReportLayout({ children }: { children: ReactNode }) {
  return children;
}

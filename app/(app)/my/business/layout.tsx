"use client";

import { usePathname } from "next/navigation";
import { StoreBusinessGuard } from "@/components/business/StoreBusinessGuard";

export default function MyBusinessLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isApply = pathname?.startsWith("/my/business/apply") ?? false;
  const isProfile = pathname?.startsWith("/my/business/profile") ?? false;

  if (isApply || isProfile) {
    return <div className="min-h-screen bg-gray-50 pb-4">{children}</div>;
  }

  return <StoreBusinessGuard>{children}</StoreBusinessGuard>;
}

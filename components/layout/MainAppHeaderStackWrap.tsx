"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const PhilifeMessengerFromHeaderStack = dynamic(
  () =>
    import("@/components/philife/PhilifeMessengerFromHeaderStack").then(
      (m) => m.PhilifeMessengerFromHeaderStack
    ),
  { ssr: false }
);
const TradeHistoryFromHeaderStack = dynamic(
  () =>
    import("@/components/trade/TradeHistoryFromHeaderStack").then((m) => m.TradeHistoryFromHeaderStack),
  { ssr: false }
);

function isStoresHubRootPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? "";
  return p === "/stores" || p === "/stores/";
}

/**
 * `/stores` 홈 — 헤더 메신저·거래내역 풀스택 UI 미사용 → 래퍼 청크를 첫 진입에서 제외.
 */
export function MainAppHeaderStackWrap({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (isStoresHubRootPath(pathname)) {
    return <>{children}</>;
  }
  return (
    <PhilifeMessengerFromHeaderStack>
      <TradeHistoryFromHeaderStack>{children}</TradeHistoryFromHeaderStack>
    </PhilifeMessengerFromHeaderStack>
  );
}

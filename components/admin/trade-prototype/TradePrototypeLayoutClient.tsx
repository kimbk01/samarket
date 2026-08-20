"use client";

import { TradePrototypeShell } from "@/components/admin/trade-prototype/trade-prototype-ui";

export function TradePrototypeLayoutClient({ children }: { children: React.ReactNode }) {
  return <TradePrototypeShell>{children}</TradePrototypeShell>;
}

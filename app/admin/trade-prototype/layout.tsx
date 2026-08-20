import { TradePrototypeLayoutClient } from "@/components/admin/trade-prototype/TradePrototypeLayoutClient";

export const dynamic = "force-dynamic";

export default function TradePrototypeLayout({ children }: { children: React.ReactNode }) {
  return <TradePrototypeLayoutClient>{children}</TradePrototypeLayoutClient>;
}

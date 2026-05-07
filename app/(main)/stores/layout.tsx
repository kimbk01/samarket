import { StoresDeliveryLayoutShell } from "@/components/delivery/navigation/StoresDeliveryLayoutShell";
import { loadDeliveryBottomNavItemsServerCached } from "@/lib/delivery/load-delivery-bottom-nav-items-server";

export default async function StoresLayout({ children }: { children: React.ReactNode }) {
  const { items: initialItems } = await loadDeliveryBottomNavItemsServerCached();
  return <StoresDeliveryLayoutShell initialItems={initialItems}>{children}</StoresDeliveryLayoutShell>;
}

import { DeliveryBottomNav } from "@/components/delivery/navigation/DeliveryBottomNav";
import { loadDeliveryBottomNavItemsServerCached } from "@/lib/delivery/load-delivery-bottom-nav-items-server";

export default async function StoresLayout({ children }: { children: React.ReactNode }) {
  const { items: initialItems } = await loadDeliveryBottomNavItemsServerCached();
  return (
    <div className="sam-domain-shell pb-[calc(56px+env(safe-area-inset-bottom,0px))]">
      {children}
      <DeliveryBottomNav initialItems={initialItems} />
    </div>
  );
}

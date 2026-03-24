import { RestaurantDeliveryCartProvider } from "@/contexts/RestaurantDeliveryCartContext";

export default function StoresLayout({ children }: { children: React.ReactNode }) {
  return <RestaurantDeliveryCartProvider>{children}</RestaurantDeliveryCartProvider>;
}

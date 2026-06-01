import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Building2,
  ClipboardCheck,
  ExternalLink,
  Image,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Package,
  Sparkles,
  Settings,
  Settings2,
  Truck,
  Wallet,
} from "lucide-react";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav";

const ID_ICON: Record<BusinessAdminNavItemId, LucideIcon> = {
  dashboard: LayoutDashboard,
  basic_info: Building2,
  store_settings: Settings,
  inquiries: MessageCircle,
  delivery_orders: Truck,
  delivery_ops: Settings2,
  products: Package,
  categories: LayoutGrid,
  banners: Image,
  notices: Megaphone,
  ops_review: ClipboardCheck,
  public_store: ExternalLink,
  settlements: Wallet,
  store_points: Wallet,
  ads: Sparkles,
  notifications: Bell,
};

const FALLBACK = LayoutGrid;

export function resolveOwnerHubMenuIcon(id: BusinessAdminNavItemId): LucideIcon {
  return ID_ICON[id] ?? FALLBACK;
}

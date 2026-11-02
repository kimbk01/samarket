import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ExternalLink,
  Image,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Package,
  PackagePlus,
  ReceiptText,
  Sparkles,
  Settings2,
  Star,
  TicketPercent,
  Gift,
  Headphones,
  UserRound,
  Users,
  Volume2,
  Wallet,
} from "lucide-react";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav";

/**
 * 메뉴 아이콘 표 1개 — 하단 탭(`owner-mobile-bottom-nav-layout.ts`)과 같은 아이콘, 같은 그룹 안 겹침 0 (R2 2026-11-03).
 * 주문 ClipboardList · 상품 Package · 고객 Users · 관리(매장 관리) Settings2
 */
const ID_ICON: Record<BusinessAdminNavItemId, LucideIcon> = {
  dashboard: LayoutDashboard,
  basic_info: Building2,
  store_settings: Clock,
  customer_care: Users,
  order_chats: MessageSquare,
  customer_center: Headphones,
  inquiries: MessageCircle,
  delivery_orders: ClipboardList,
  delivery_ops: Activity,
  products: Package,
  product_new: PackagePlus,
  categories: LayoutGrid,
  banners: Image,
  notices: Megaphone,
  reviews: Star,
  ops_review: ClipboardCheck,
  public_store: ExternalLink,
  settlements: ReceiptText,
  finance: Wallet,
  ads: Sparkles,
  coupons: TicketPercent,
  gift_certificates: Gift,
  notifications: Bell,
  notification_settings: Volume2,
  store_manage: Settings2,
  product_edit: Package,
  ads_event: Sparkles,
  apply: ClipboardCheck,
  my: UserRound,
};

const FALLBACK = LayoutGrid;

export function resolveOwnerHubMenuIcon(id: BusinessAdminNavItemId): LucideIcon {
  return ID_ICON[id] ?? FALLBACK;
}

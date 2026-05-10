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
  Settings2,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from "lucide-react";

const LABEL_ICON: Record<string, LucideIcon> = {
  대시보드: LayoutDashboard,
  "채팅 · 문의": MessageCircle,
  "배달 주문": Truck,
  "배달 운영 설정": Settings2,
  "상품 등록": Package,
  카테고리: LayoutGrid,
  "배너 관리": Image,
  "공지 관리": Megaphone,
  "기본 정보": Building2,
  "매장 프로필": Store,
  "운영 · 심사": ClipboardCheck,
  "공개 매장 페이지": ExternalLink,
  "정산 내역": Wallet,
  "광고 · 프로모션": Megaphone,
  "알림 · 운영": Bell,
};

const FALLBACK = LayoutGrid;

export function resolveOwnerHubMenuIcon(label: string): LucideIcon {
  const key = label.trim();
  return LABEL_ICON[key] ?? FALLBACK;
}

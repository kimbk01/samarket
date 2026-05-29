"use client";

import type { ReactNode } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  EllipsisVertical,
  EyeOff,
  Globe,
  Hand,
  Heart,
  HelpCircle,
  Info,
  Languages,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package,
  PlayCircle,
  ReceiptText,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  UserRound,
  Users,
  UserX,
} from "lucide-react";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import type { MypageHomeMenuIconId } from "@/lib/mypage/mypage-home-menu-config";

const ICON_CLASS = "h-[18px] w-[18px]";

export function renderMypageHomeMenuIcon(icon: MypageHomeMenuIconId | "languages"): ReactNode {
  const stroke = { strokeWidth: 2 as const };
  switch (icon) {
    case "package":
      return <Package className={ICON_CLASS} {...stroke} />;
    case "heart":
      return <Heart className={ICON_CLASS} {...stroke} />;
    case "receipt-text":
      return <ReceiptText className={ICON_CLASS} {...stroke} />;
    case "book-open":
      return <BookOpen className={ICON_CLASS} {...stroke} />;
    case "message-circle":
      return <MessageCircle className={ICON_CLASS} {...stroke} />;
    case "store":
      return <Store className={ICON_CLASS} {...stroke} />;
    case "shopping-bag":
      return <ShoppingBag className={ICON_CLASS} {...stroke} />;
    case "truck":
      return <Truck className={ICON_CLASS} {...stroke} />;
    case "address-pin":
      return <AddressKindHeadPin kind="general" className={`${ICON_CLASS} [&_svg]:h-[18px] [&_svg]:w-[15px]`} />;
    case "credit-card":
      return <CreditCard className={ICON_CLASS} {...stroke} />;
    case "shield":
      return <Shield className={ICON_CLASS} {...stroke} />;
    case "bell":
      return <Bell className={ICON_CLASS} {...stroke} />;
    case "globe":
      return <Globe className={ICON_CLASS} {...stroke} />;
    case "settings":
      return <Settings className={ICON_CLASS} {...stroke} />;
    case "help-circle":
      return <HelpCircle className={ICON_CLASS} {...stroke} />;
    case "user-round":
      return <UserRound className={ICON_CLASS} {...stroke} />;
    case "calendar-days":
      return <CalendarDays className={ICON_CLASS} {...stroke} />;
    case "users":
      return <Users className={ICON_CLASS} {...stroke} />;
    case "user-block":
      return <UserX className={ICON_CLASS} {...stroke} />;
    case "eye-off":
      return <EyeOff className={ICON_CLASS} {...stroke} />;
    case "play-circle":
      return <PlayCircle className={ICON_CLASS} {...stroke} />;
    case "map-pin":
      return <MapPin className={ICON_CLASS} {...stroke} />;
    case "message-square":
      return <MessageSquare className={ICON_CLASS} {...stroke} />;
    case "ellipsis-vertical":
      return <EllipsisVertical className={ICON_CLASS} {...stroke} />;
    case "trash-2":
      return <Trash2 className={ICON_CLASS} {...stroke} />;
    case "info":
      return <Info className={ICON_CLASS} {...stroke} />;
    case "hand":
      return <Hand className={ICON_CLASS} {...stroke} />;
    case "languages":
      return <Languages className={ICON_CLASS} {...stroke} />;
    default:
      return null;
  }
}

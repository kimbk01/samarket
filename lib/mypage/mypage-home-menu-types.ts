import type { MessageKey } from "@/lib/i18n/messages";

/** Lucide icon ids used on mypage home menu rows */
export type MypageHomeMenuIconId =
  | "package"
  | "heart"
  | "receipt-text"
  | "book-open"
  | "message-circle"
  | "store"
  | "shopping-bag"
  | "truck"
  | "address-pin"
  | "credit-card"
  | "shield"
  | "bell"
  | "globe"
  | "settings"
  | "help-circle"
  | "user-round"
  | "calendar-days"
  | "users"
  | "user-block"
  | "eye-off"
  | "play-circle"
  | "map-pin"
  | "message-square"
  | "ellipsis-vertical"
  | "trash-2"
  | "info"
  | "hand";

export type MypageHomeLinkMenuItem = {
  kind?: "link";
  href: string;
  titleKey: MessageKey;
  icon: MypageHomeMenuIconId;
  tone?: "default" | "danger";
};

export type MypageHomeAddressMenuItem = {
  kind: "addresses";
  titleKey: MessageKey;
  icon: "address-pin";
};

export type MypageHomeLanguageMenuItem = {
  kind: "language-toggle";
  icon: "languages";
};

export type MypageHomeMenuItemConfig =
  | MypageHomeLinkMenuItem
  | MypageHomeAddressMenuItem
  | MypageHomeLanguageMenuItem;

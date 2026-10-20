import type { MessageKey } from "@/lib/i18n/messages";
import type { MypageSummaryCountKey } from "@/lib/mypage/mypage-summary-types";

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
  | "hand"
  | "phone"
  | "languages"
  | "history"
  | "star"
  | "messages-square"
  | "file-text"
  | "lock"
  | "building"
  | "sliders"
  | "message-question"
  | "coins"
  | "ticket"
  | "gift"
  | "megaphone"
  | "wallet"
  | "badge-percent";

/**
 * 오른쪽 값 출처 — `GET /api/me/mypage-summary` 필드(최종 설계 §2.2) 또는 클라 SSOT.
 * 값 출처가 없는 행은 chevron 만.
 */
export type MypageHomeRowValueSource =
  | { kind: "summary-count"; field: MypageSummaryCountKey; format: "selling" | "pending" | "active" | "count" | "sheets" }
  | { kind: "summary-points" }
  | { kind: "trade-chat-unread" }
  | { kind: "address-public-label" }
  | { kind: "installed-version" };

export type MypageHomeLinkMenuItem = {
  kind?: "link";
  href: string;
  titleKey: MessageKey;
  icon: MypageHomeMenuIconId;
  tone?: "default" | "danger";
  valueSource?: MypageHomeRowValueSource;
  /** 기존 testid 보존용 */
  testId?: string;
};

export type MypageHomeAddressMenuItem = {
  kind: "addresses";
  titleKey: MessageKey;
  icon: "address-pin";
  valueSource?: MypageHomeRowValueSource;
};

export type MypageHomeLanguageMenuItem = {
  kind: "language-toggle";
  icon: "languages";
};

export type MypageHomeMenuItemConfig =
  | MypageHomeLinkMenuItem
  | MypageHomeAddressMenuItem
  | MypageHomeLanguageMenuItem;

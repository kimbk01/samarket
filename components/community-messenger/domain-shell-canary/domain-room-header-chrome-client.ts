/**
 * Client-side Domain Room Header chrome helpers (Presentation layer).
 * Must NOT live under lib/community-messenger → @/lib/messenger (Phase6 wiring 0).
 * Server Factory remains in lib/messenger/contracts/domain-room-header-chrome.ts
 */
import type { MessageKey } from "@/lib/i18n/messages";

export type DomainRoomHeaderSecondary =
  | { mode: "none" }
  | { mode: "plain"; text: string }
  | { mode: "i18n"; key: MessageKey; vars?: Readonly<Record<string, string | number>> }
  | { mode: "member_count"; count: number };

export type DomainRoomProfileKind = "user" | "group" | "listing" | "store" | "customer";
export type DomainRoomIdentityKind =
  | "user"
  | "group"
  | "listing_seller_counterparty"
  | "store"
  | "customer";

export type DomainRoomHeaderChrome = Readonly<{
  roomTypeLabelKey: MessageKey;
  roomTypeLabelVars?: Readonly<Record<string, string | number>>;
  headerSecondary: DomainRoomHeaderSecondary;
  showMemberCountSuffix: boolean;
  memberCountForSuffix: number | null;
  profileKind: DomainRoomProfileKind;
  identityKind: DomainRoomIdentityKind;
  forbidsGeneralDirectChrome: boolean;
}>;

export function resolveDomainRoomHeaderSecondaryText(
  secondary: DomainRoomHeaderSecondary,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string | null {
  if (secondary.mode === "none") return null;
  if (secondary.mode === "plain") return secondary.text.trim() || null;
  if (secondary.mode === "member_count") {
    return String(Math.max(0, Math.floor(secondary.count)));
  }
  if (secondary.mode === "i18n") {
    return t(secondary.key, secondary.vars ? { ...secondary.vars } : undefined);
  }
  return null;
}

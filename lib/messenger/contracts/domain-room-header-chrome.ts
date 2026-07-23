/**
 * Domain Room Header Chrome — supplied ONLY by Domain Header Factory.
 * UI must translate keys / render slots; must not re-infer Domain from roomType.
 *
 * CONTRACT:
 * - general_peer may use General 1:1 chrome
 * - group / trade / buyer_store / owner_buyer_peer MUST set forbidsGeneralDirectChrome
 * - never map Trade/SO to nav_messenger_direct_room
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

export type DomainRoomHeaderChromeInput =
  | { kind: "general_peer" }
  | {
      kind: "group";
      memberCount: number;
      /** open_group → open label; else private */
      groupSubtype?: "open" | "private" | "private_group" | "open_group" | string | null;
    }
  | {
      kind: "trade";
      /** Room Header primary is counterparty — peerLabel kept for diagnostics only */
      peerLabel: string | null;
      /** Product line under peer name (Room secondary / list primary elsewhere) */
      productTitle: string | null;
    }
  | {
      kind: "buyer_store";
      orderId: string | null;
      orderStatusLabel?: string | null;
    }
  | {
      kind: "owner_buyer_peer";
      orderId: string | null;
      orderStatusLabel?: string | null;
    };

function isOpenGroupSubtype(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "open" || s === "open_group";
}

function shortOrderNo(orderId: string | null | undefined): string | null {
  const id = orderId?.trim() ?? "";
  if (!id) return null;
  if (id.length <= 10) return id;
  return id.slice(-8);
}

/**
 * Domain Header Factory → Room chrome slots.
 * Discriminated on header.kind only (Presentation contract), not chatDomain reinference.
 */
export function composeDomainRoomHeaderChrome(
  input: DomainRoomHeaderChromeInput
): DomainRoomHeaderChrome {
  switch (input.kind) {
    case "general_peer":
      return {
        roomTypeLabelKey: "nav_messenger_direct_room",
        headerSecondary: { mode: "none" },
        showMemberCountSuffix: false,
        memberCountForSuffix: null,
        profileKind: "user",
        identityKind: "user",
        forbidsGeneralDirectChrome: false,
      };
    case "group": {
      const count = Math.max(0, Math.floor(Number(input.memberCount) || 0));
      return {
        roomTypeLabelKey: isOpenGroupSubtype(input.groupSubtype)
          ? "nav_messenger_open_group"
          : "nav_messenger_private_group",
        headerSecondary: { mode: "member_count", count },
        showMemberCountSuffix: count > 0,
        memberCountForSuffix: count > 0 ? count : null,
        profileKind: "group",
        identityKind: "group",
        forbidsGeneralDirectChrome: true,
      };
    }
    case "trade": {
      const product = input.productTitle?.trim() || "";
      return {
        roomTypeLabelKey: "nav_trade_chat_label",
        // Room Header primary = counterparty (user avatar). Product is secondary context.
        headerSecondary: product ? { mode: "plain", text: product } : { mode: "none" },
        showMemberCountSuffix: false,
        memberCountForSuffix: null,
        profileKind: "user",
        identityKind: "listing_seller_counterparty",
        forbidsGeneralDirectChrome: true,
      };
    }
    case "buyer_store": {
      const orderNo = shortOrderNo(input.orderId);
      const status = input.orderStatusLabel?.trim() || "";
      let headerSecondary: DomainRoomHeaderSecondary = { mode: "none" };
      if (orderNo) {
        headerSecondary = {
          mode: "i18n",
          key: "store_messenger_list_order_no",
          vars: { orderNo },
        };
      } else if (status) {
        headerSecondary = { mode: "plain", text: status };
      }
      return {
        roomTypeLabelKey: "nav_chat_order",
        headerSecondary,
        showMemberCountSuffix: false,
        memberCountForSuffix: null,
        profileKind: "store",
        identityKind: "store",
        forbidsGeneralDirectChrome: true,
      };
    }
    case "owner_buyer_peer": {
      const orderNo = shortOrderNo(input.orderId);
      const status = input.orderStatusLabel?.trim() || "";
      let headerSecondary: DomainRoomHeaderSecondary = { mode: "none" };
      if (orderNo) {
        headerSecondary = {
          mode: "i18n",
          key: "store_messenger_list_order_no",
          vars: { orderNo },
        };
      } else if (status) {
        headerSecondary = { mode: "plain", text: status };
      }
      return {
        roomTypeLabelKey: "nav_chat_order",
        headerSecondary,
        showMemberCountSuffix: false,
        memberCountForSuffix: null,
        profileKind: "customer",
        identityKind: "customer",
        forbidsGeneralDirectChrome: true,
      };
    }
    default: {
      const _exhaustive: never = input;
      void _exhaustive;
      throw new Error("dibay_domain_room_header_chrome_unknown_kind");
    }
  }
}

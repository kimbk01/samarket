import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import type {
  MessengerChatInboxFilter,
  MessengerChatKindFilter,
  MessengerChatListChip,
  MessengerChatSubFilter,
  MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

export function messengerChatListChipLabelI18n(chip: MessengerChatListChip): string {
  switch (chip) {
    case "all":
      return translateCmUi("cm_ia_chip_all");
    case "unread":
      return translateCmUi("cm_ia_chip_unread");
    case "pinned":
      return translateCmUi("cm_ia_chip_pinned");
    case "direct":
      return translateCmUi("cm_ia_chip_direct");
    case "private_group":
      return translateCmUi("cm_ia_chip_group");
    case "trade":
      return translateCmUi("cm_ia_chip_trade");
    case "delivery":
      return translateCmUi("cm_ia_chip_delivery");
    default:
      return translateCmUi("cm_ia_chip_all");
  }
}

export function messengerSectionLabelI18n(section: MessengerMainSection): string {
  switch (section) {
    case "friends":
      return translateCmUi("cm_ia_section_friends");
    case "chats":
      return translateCmUi("cm_ia_section_chats");
    case "open_chat":
      return translateCmUi("cm_ia_section_open_chat");
    case "archive":
      return translateCmUi("cm_ia_section_archive");
    case "call_logs":
      return translateCmUi("cm_ia_section_call_logs");
    default:
      return translateCmUi("cm_ia_section_chats");
  }
}

export function messengerChatInboxFilterLabelI18n(filter: MessengerChatInboxFilter): string {
  switch (filter) {
    case "all":
      return translateCmUi("cm_ia_chip_all");
    case "unread":
      return translateCmUi("cm_ia_chip_unread");
    case "pinned":
      return translateCmUi("cm_ia_chip_pinned");
    default:
      return translateCmUi("cm_ia_chip_all");
  }
}

export function messengerChatKindFilterLabelI18n(filter: MessengerChatKindFilter): string {
  switch (filter) {
    case "all":
      return translateCmUi("cm_ia_chip_all");
    case "direct":
      return translateCmUi("cm_ia_chip_direct");
    case "private_group":
      return translateCmUi("cm_ia_chip_group");
    case "trade":
      return translateCmUi("cm_ia_chip_trade");
    case "delivery":
      return translateCmUi("cm_ia_chip_delivery");
    default:
      return translateCmUi("cm_ia_chip_all");
  }
}

export function messengerChatSubFilterLabelI18n(filter: MessengerChatSubFilter): string {
  if (filter === "unread" || filter === "pinned" || filter === "all") {
    return messengerChatInboxFilterLabelI18n(filter as MessengerChatInboxFilter);
  }
  return messengerChatKindFilterLabelI18n(filter as MessengerChatKindFilter);
}

export function messengerChatListEmptyMessageI18n(kind: MessengerChatKindFilter): string {
  if (kind === "trade") return translateCmUi("cm_ia_empty_trade");
  if (kind === "delivery") return translateCmUi("cm_ia_empty_delivery");
  return translateCmUi("cm_ia_empty_default");
}

export function messengerChatListEmptyMessageForChipI18n(chip: MessengerChatListChip): string {
  if (chip === "trade" || chip === "delivery") {
    const kind = chip === "trade" ? "trade" : "delivery";
    return messengerChatListEmptyMessageI18n(kind);
  }
  if (chip === "unread") return translateCmUi("cm_ia_empty_unread");
  if (chip === "pinned") return translateCmUi("cm_ia_empty_pinned");
  if (chip === "direct") return translateCmUi("cm_ia_empty_direct");
  if (chip === "private_group") return translateCmUi("cm_ia_empty_group");
  if (chip === "all") return translateCmUi("cm_ia_empty_all");
  return messengerChatListEmptyMessageI18n("all");
}

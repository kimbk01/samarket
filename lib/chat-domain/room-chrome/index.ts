export {
  planDomainRoomEntry,
  type DomainRoomEntryPlan,
  type DomainRoomEntryRequest,
} from "@/lib/chat-domain/room-chrome/domain-room-entry";

export {
  planDomainRoomChrome,
  type DomainRoomChromePlan,
  type DomainRoomChromeSlots,
} from "@/lib/chat-domain/room-chrome/domain-room-chrome";

export {
  buildDomainRoomDockModel,
  buildDomainRoomHeaderModel,
  type DomainRoomDockModel,
  type DomainRoomHeaderModel,
} from "@/lib/chat-domain/room-chrome/domain-room-header-dock";

export {
  PHASE_I_ROOM_CHROME_REMOVE_CANDIDATES,
  PHASE_I_TARGET_SINGLE_CHROME,
  PHASE_J_DELETED_CHROME,
} from "@/lib/chat-domain/room-chrome/phase-i-remove-prep";

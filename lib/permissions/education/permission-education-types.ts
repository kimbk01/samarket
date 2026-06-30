import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";

export type PermissionCapabilityItemId =
  | "notifications"
  | "lock_screen_incoming"
  | "full_screen_intent"
  | "battery"
  | "microphone"
  | "camera";

export type PermissionCapabilityItem = {
  id: PermissionCapabilityItemId;
  pass: boolean;
  labelKey: MessageKey;
  detailKey?: MessageKey;
};

export type PermissionCapabilitySummary = {
  items: PermissionCapabilityItem[];
  overallReady: boolean;
  receiveReady: boolean;
  lockScreenIncomingReady: boolean;
  lockScreenBlockReason?: string | null;
  manufacturer?: string | null;
  syncedAt: number;
};

export type PermissionEducationCallFlow = "outgoing" | "incoming";

export type PermissionEducationTier =
  | "call_voice"
  | "call_video"
  | "lock_screen_fsi"
  | "battery_restricted";

export type PermissionEducationContext =
  | { tier: "call_voice" | "call_video"; flow: PermissionEducationCallFlow; kind: CommunityMessengerCallKind }
  | { tier: "lock_screen_fsi" }
  | { tier: "battery_restricted" };

export type PermissionEducationChoice = "allow" | "settings" | "later";

export type PermissionEducationResult = { proceed: boolean };

export type OemGuideBrand = "samsung" | "xiaomi" | "oppo" | "vivo" | "oneplus" | "generic";

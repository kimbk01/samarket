import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export type PermissionEducationCallFlow = "outgoing" | "incoming";

export type PermissionEducationContext = {
  tier: "call_voice" | "call_video";
  flow: PermissionEducationCallFlow;
  kind: CommunityMessengerCallKind;
};

export type PermissionEducationChoice = "settings" | "later";

export type PermissionEducationResult = { proceed: boolean };

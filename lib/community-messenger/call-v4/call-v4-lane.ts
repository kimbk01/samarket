import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";

export type DibayCallLane = "legacy" | "v3" | "v4";

/** Active call lane — V4 wins over V3 when both env flags are set (misconfig guard). */
export function resolveDibayCallLane(): DibayCallLane {
  if (isCallV4TelegramLaneEnabled()) return "v4";
  if (isDibayCallV3SafeLaneEnabled()) return "v3";
  return "legacy";
}

export function assertDibayCallLaneExclusive(): void {
  if (isCallV4TelegramLaneEnabled() && isDibayCallV3SafeLaneEnabled()) {
    console.warn(
      "[DIBAY_CALL_V4]",
      "lane_misconfig_both_v3_v4",
      "V4 Telegram Lane takes precedence; disable NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE"
    );
  }
}

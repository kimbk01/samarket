import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  FeedEmergencyActionType,
  FeedSectionOverrideKey,
} from "@/lib/types/feed-emergency";

function feT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const SECTION_KEYS: Record<FeedSectionOverrideKey, MessageKey> = {
  recommended: "feed_em_sec_recommended",
  local_latest: "feed_em_sec_local_latest",
  bumped: "feed_em_sec_bumped",
  sponsored: "feed_em_sec_sponsored",
  premium_shops: "feed_em_sec_premium_shops",
  recent_based: "feed_em_sec_recent_based",
  category_based: "feed_em_sec_category_based",
  interest_based: "feed_em_sec_interest_based",
};

const ACTION_KEYS: Record<FeedEmergencyActionType, MessageKey> = {
  enable_kill_switch: "feed_em_act_enable_kill",
  disable_kill_switch: "feed_em_act_disable_kill",
  enable_fallback: "feed_em_act_enable_fallback",
  disable_fallback: "feed_em_act_disable_fallback",
  disable_section: "feed_em_act_disable_section",
  enable_section: "feed_em_act_enable_section",
  auto_fallback: "feed_em_act_auto_fallback",
  rollback_to_previous: "feed_em_act_rollback",
};

export function getFeedSectionOverrideLabel(key: FeedSectionOverrideKey): string {
  return feT(SECTION_KEYS[key]);
}

export function getFeedEmergencyActionLabel(actionType: FeedEmergencyActionType): string {
  const k = ACTION_KEYS[actionType];
  return k ? feT(k) : actionType;
}

export function getFeedEmergencyDefaultNoticeText(): string {
  return feT("feed_em_notice_default");
}

export function getFeedEmergencyShortNoticeText(): string {
  return feT("feed_em_notice_short");
}

/** @deprecated `getFeedSectionOverrideLabel` 사용 */
export function buildSectionOverrideLabels(): Record<FeedSectionOverrideKey, string> {
  return Object.fromEntries(
    (Object.keys(SECTION_KEYS) as FeedSectionOverrideKey[]).map((k) => [
      k,
      getFeedSectionOverrideLabel(k),
    ])
  ) as Record<FeedSectionOverrideKey, string>;
}

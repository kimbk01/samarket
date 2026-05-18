import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { PersonalizedSectionKey } from "@/lib/types/personalized-feed";

function feedT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

export const PERSONALIZED_FEED_REASON_KEYS = {
  category_match: "feed_reason_category_match",
  recent_view_similar: "feed_reason_recent_view_similar",
  recent_favorite_similar: "feed_reason_recent_favorite_similar",
  recent_chat_similar: "feed_reason_recent_chat_similar",
  interest_match: "feed_reason_interest_match",
  nearby_popular: "feed_reason_nearby_popular",
  premium: "feed_reason_premium",
  business: "feed_reason_business",
} as const satisfies Record<string, MessageKey>;

export function personalizedFeedReasonLabel(reasonKey: keyof typeof PERSONALIZED_FEED_REASON_KEYS): string {
  return feedT(PERSONALIZED_FEED_REASON_KEYS[reasonKey]);
}

const SECTION_FALLBACK_KEYS: Record<PersonalizedSectionKey, MessageKey> = {
  category_based: "feed_reason_category_match",
  interest_based: "feed_reason_interest_match",
  recent_view_based: "feed_reason_recent_view_similar",
  recent_favorite_based: "feed_reason_recent_favorite_similar",
  recent_chat_based: "feed_reason_recent_chat_similar",
};

export function personalizedFeedSectionFallbackLabel(sectionKey: PersonalizedSectionKey): string {
  return feedT(SECTION_FALLBACK_KEYS[sectionKey]);
}

export function personalizedFeedLogNote(): string {
  return feedT("feed_log_note_generated");
}

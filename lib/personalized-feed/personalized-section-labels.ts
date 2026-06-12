import type { PersonalizedSectionKey } from "@/lib/types/personalized-feed";

export const PERSONALIZED_SECTION_LABELS: Record<PersonalizedSectionKey, string> = {
  category_based: "카테고리별 추천",
  interest_based: "관심 카테고리 추천",
  recent_view_based: "최근 본 상품과 비슷해요",
  recent_favorite_based: "찜한 상품과 비슷해요",
  recent_chat_based: "최근 대화한 상품과 비슷해요",
};

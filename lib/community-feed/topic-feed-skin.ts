/** DB community_topics.feed_list_skin 값과 동기화 */
export const COMMUNITY_FEED_LIST_SKINS = [
  "compact_media",
  "text_primary",
  "location_pin",
  "hashtags_below",
] as const;

export type CommunityFeedListSkin = (typeof COMMUNITY_FEED_LIST_SKINS)[number];

const SKIN_SET = new Set<string>(COMMUNITY_FEED_LIST_SKINS);

export function isCommunityFeedListSkin(s: unknown): s is CommunityFeedListSkin {
  return typeof s === "string" && SKIN_SET.has(s);
}

export function normalizeCommunityFeedListSkin(raw: unknown): CommunityFeedListSkin {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (SKIN_SET.has(s)) return s as CommunityFeedListSkin;
  return "compact_media";
}

export const COMMUNITY_FEED_LIST_SKIN_LABELS: Record<CommunityFeedListSkin, string> = {
  compact_media: "당근형 · 제목+우측 썸네일",
  text_primary: "텍스트 중심 · 썸네일 숨김",
  location_pin: "장소 강조 · 핀+장소(모임장소/지역)",
  hashtags_below: "태그 줄 · 본문 #해시태그 미리보기",
};

/** 본문에서 #태그 추출 (목록 미리보기용, 최대 n개) */
export function extractHashtagPreview(text: string, max = 5): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const re = /#([\p{L}\p{N}_-]{1,32})/gu;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while (out.length < max && (m = re.exec(t)) !== null) {
    const tag = m[1]!.toLowerCase();
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(`#${m[1]}`);
  }
  return out;
}

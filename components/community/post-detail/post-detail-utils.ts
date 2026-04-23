import { extractHashtagPreview } from "@/lib/community-feed/topic-feed-skin";
import { stripMeetupPostMetaFromContent } from "@/lib/neighborhood/meeting-post-content";

export function extractPostDetailHashtagsForDisplay(
  title: string,
  content: string,
  isMeetup: boolean,
  max = 8
): string[] {
  const body = isMeetup ? stripMeetupPostMetaFromContent(content) : content;
  return extractHashtagPreview(`${title || ""}\n${body || ""}`.replace(/\0/g, ""), max);
}

const SAVED_KEY = "philife:post-saved:";

export function isPostSavedLocal(postId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SAVED_KEY + postId) === "1";
  } catch {
    return false;
  }
}

export function setPostSavedLocal(postId: string, saved: boolean) {
  try {
    if (saved) window.localStorage.setItem(SAVED_KEY + postId, "1");
    else window.localStorage.removeItem(SAVED_KEY + postId);
  } catch {
    /* ignore */
  }
}

const ALERT_TAG_KEY = "philife:interest-tags:";

export function getInterestTagsLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const t = window.localStorage.getItem(ALERT_TAG_KEY);
    if (!t) return [];
    const j = JSON.parse(t) as string[];
    return Array.isArray(j) ? j.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addInterestTagLocal(tag: string) {
  const t = tag.replace(/^#/, "").trim();
  if (!t) return;
  try {
    const cur = new Set(getInterestTagsLocal().map((x) => x.toLowerCase()));
    if (cur.has(t.toLowerCase())) return;
    cur.add(t);
    window.localStorage.setItem(ALERT_TAG_KEY, JSON.stringify([...cur]));
  } catch {
    /* ignore */
  }
}

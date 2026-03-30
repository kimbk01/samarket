import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import {
  isPhilifeGeneralOnlyTopicSlug,
  qualifiesForPhilifeMeetupWriterTopic,
} from "@/lib/neighborhood/philife-topic-slug-rules";

/** 동네 피드에 연결된 섹션(`admin_settings` 또는 기본 dongnae)과 주제의 섹션이 같은지 */
export function topicBelongsToPhilifeNeighborhoodSection(
  sectionSlug: string | null | undefined,
  philifeNeighborhoodSectionSlug: string
): boolean {
  const p = normalizeSectionSlug(philifeNeighborhoodSectionSlug);
  if (!p) return false;
  return normalizeSectionSlug(sectionSlug) === p;
}

/** 어드민 「모임」 탭 목록 = 이 조건과 동일해야 앱 드롭다운과 1:1 */
export function qualifiesForPhilifeMeetupAdminList(
  allowMeetup: boolean,
  topicSlug: string,
  sectionSlug: string | null | undefined,
  philifeNeighborhoodSectionSlug: string
): boolean {
  return (
    topicBelongsToPhilifeNeighborhoodSection(sectionSlug, philifeNeighborhoodSectionSlug) &&
    qualifiesForPhilifeMeetupWriterTopic(allowMeetup, topicSlug)
  );
}

/** 어드민 「일반 게시판」 탭 — 동일 섹션에서 모임 목록에 안 나가는 주제만 */
export function qualifiesForPhilifeGeneralAdminList(
  allowMeetup: boolean,
  topicSlug: string,
  sectionSlug: string | null | undefined,
  philifeNeighborhoodSectionSlug: string
): boolean {
  if (!topicBelongsToPhilifeNeighborhoodSection(sectionSlug, philifeNeighborhoodSectionSlug)) return false;
  return !allowMeetup || isPhilifeGeneralOnlyTopicSlug(topicSlug);
}

export type MeetupFeedTopicRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

/** 필라이프 동네 피드 섹션의 모임 전용 피드 주제 — 어드민 「모임」 탭·`/api/philife/meetup-feed-topics`와 동일 집합 */
export async function listMeetupFeedTopicsPublic(
  sb: SupabaseClient<any>
): Promise<MeetupFeedTopicRow[]> {
  const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  const { data: sec } = await sb
    .from("community_sections")
    .select("id")
    .eq("slug", sectionSlug)
    .eq("is_active", true)
    .maybeSingle();
  const sid = (sec as { id?: string } | null)?.id;
  if (!sid) return [];

  const { data, error } = await sb
    .from("community_topics")
    .select("id, name, slug, sort_order")
    .eq("section_id", sid)
    .eq("allow_meetup", true)
    .eq("is_active", true)
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) return [];
  const rows = (data as { id: string; name: string; slug: string; sort_order: number }[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    slug: String(r.slug ?? ""),
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
  }));
  return rows.filter((r) => qualifiesForPhilifeMeetupWriterTopic(true, r.slug));
}

/** 모임 작성 시 선택한 피드 주제 검증 */
export async function resolveMeetupFeedTopicBySlug(
  sb: SupabaseClient<any>,
  rawSlug: string,
  opts?: { sectionId?: string }
): Promise<{ topicId: string; topicSlug: string; name: string } | null> {
  const slug = normalizeFeedSlug(rawSlug) || normalizeFeedSlug("meetup");
  if (isPhilifeGeneralOnlyTopicSlug(slug)) return null;

  let sid = opts?.sectionId?.trim();
  if (!sid) {
    const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
    const { data: sec } = await sb
      .from("community_sections")
      .select("id")
      .eq("slug", sectionSlug)
      .eq("is_active", true)
      .maybeSingle();
    sid = (sec as { id?: string } | null)?.id;
  }
  if (!sid) return null;

  const { data: topic } = await sb
    .from("community_topics")
    .select("id, slug, name")
    .eq("section_id", sid)
    .eq("slug", slug)
    .eq("allow_meetup", true)
    .eq("is_active", true)
    .eq("is_visible", true)
    .maybeSingle();

  const t = topic as { id?: string; slug?: string; name?: string } | null;
  if (!t?.id) return null;
  return {
    topicId: String(t.id),
    topicSlug: String(t.slug ?? slug),
    name: String(t.name ?? slug),
  };
}

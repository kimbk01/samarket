/**
 * 커뮤니티 피드 상단 — 공지·관리자 고정 (설계 §F-5-2 · M10). 순수 함수 (서버·클라이언트 공용).
 * 노출 순서: 공지·고정 > 유료 홍보 > 일반. 만료는 조회 조건(시각 비교)으로 처리 — 크론 없음.
 * - 전체 피드: 노출 기간 중인 공지 전부 + scope='feed' 고정
 * - 카테고리 피드: 그 카테고리 공지 + 그 카테고리 scope='topic' 고정
 */

export type CommunityFeedTopRowFields = {
  id?: unknown;
  topic_slug?: unknown;
  is_notice?: unknown;
  notice_starts_at?: unknown;
  notice_ends_at?: unknown;
  pinned_at?: unknown;
  pinned_until?: unknown;
  pin_scope?: unknown;
  pin_rank?: unknown;
  published_at?: unknown;
  created_at?: unknown;
};

/** 피드 상단 후보만 읽는 select 꼬리 (메인 피드 select 에 붙인다) */
export const COMMUNITY_FEED_TOP_SELECT_TAIL =
  ", is_notice, notice_starts_at, notice_ends_at, pinned_at, pinned_until, pin_scope, pin_rank";

/** 상단 후보 조회 필터 (PostgREST or) — 고정됐거나, 아직 끝나지 않은 공지 */
export function communityFeedTopCandidatesOrFilter(nowIso: string): string {
  const ts = nowIso.replace(/"/g, "");
  return `pinned_at.not.is.null,and(is_notice.is.true,or(notice_ends_at.is.null,notice_ends_at.gt."${ts}"))`;
}

function ms(v: unknown): number | null {
  if (v == null || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

export function isCommunityPinActive(row: CommunityFeedTopRowFields, nowMs: number): boolean {
  if (ms(row.pinned_at) == null) return false;
  const until = ms(row.pinned_until);
  return until == null || until > nowMs;
}

export function isCommunityNoticeLive(row: CommunityFeedTopRowFields, nowMs: number): boolean {
  if (row.is_notice !== true) return false;
  const s = ms(row.notice_starts_at);
  const e = ms(row.notice_ends_at);
  return (s == null || s <= nowMs) && (e == null || e > nowMs);
}

/** 예약 공지 — 시작 전에는 일반 목록에도 보이지 않는다 */
export function isCommunityNoticeScheduled(row: CommunityFeedTopRowFields, nowMs: number): boolean {
  if (row.is_notice !== true) return false;
  const s = ms(row.notice_starts_at);
  return s != null && s > nowMs;
}

function slug(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * 상단에 올릴 행 (정렬 포함).
 * @param filterTopicSlug 카테고리 피드면 slug, 전체 피드면 null/"" (모임 피드 'meetup' 은 상단 없음)
 */
export function selectCommunityFeedTopRows<T extends CommunityFeedTopRowFields>(
  rows: T[],
  opts: { filterTopicSlug?: string | null; nowMs: number }
): T[] {
  const filter = slug(opts.filterTopicSlug);
  if (filter === "meetup") return [];
  const picked: Array<{ row: T; notice: boolean; pinned: boolean }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id || seen.has(id)) continue;
    const notice = isCommunityNoticeLive(row, opts.nowMs);
    const pinActive = isCommunityPinActive(row, opts.nowMs);
    let pinned = false;
    if (pinActive) {
      if (!filter) pinned = row.pin_scope === "feed";
      else pinned = row.pin_scope === "topic" && slug(row.topic_slug) === filter;
    }
    const noticeHere = notice && (!filter || slug(row.topic_slug) === filter);
    if (!noticeHere && !pinned) continue;
    seen.add(id);
    picked.push({ row, notice: noticeHere, pinned });
  }
  const time = (r: T) => ms(r.published_at) ?? ms(r.created_at) ?? 0;
  picked.sort((a, b) => {
    if (a.notice !== b.notice) return a.notice ? -1 : 1;
    const ra = a.pinned ? Number(a.row.pin_rank ?? 0) || 0 : 0;
    const rb = b.pinned ? Number(b.row.pin_rank ?? 0) || 0 : 0;
    if (ra !== rb) return ra - rb;
    return time(b.row) - time(a.row);
  });
  return picked.map((p) => p.row);
}

/** 상단 행의 배지 판정 (선택된 범위 기준) */
export function communityFeedTopBadges(
  row: CommunityFeedTopRowFields,
  opts: { filterTopicSlug?: string | null; nowMs: number }
): { isNotice: boolean; isPinned: boolean } {
  const filter = slug(opts.filterTopicSlug);
  const isNotice = isCommunityNoticeLive(row, opts.nowMs);
  const pinActive = isCommunityPinActive(row, opts.nowMs);
  const isPinned =
    pinActive && (!filter ? row.pin_scope === "feed" : row.pin_scope === "topic" && slug(row.topic_slug) === filter);
  return { isNotice, isPinned };
}

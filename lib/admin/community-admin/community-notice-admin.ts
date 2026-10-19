/**
 * 커뮤니티 피드 공지 (설계 §F-5-2 · M10) — 서버 공용 상수·검증. 공지 = community_posts(origin_kind='admin', is_notice).
 */
export const COMMUNITY_NOTICE_AUTHOR_NAME = "DIBAY 운영팀";

export const COMMUNITY_NOTICE_LIST_SELECT =
  "id, user_id, origin_kind, display_author_name, title, summary, status, topic_id, topic_slug, " +
  "is_notice, notice_starts_at, notice_ends_at, pinned_at, pinned_until, pinned_by, pin_scope, pin_rank, pin_reason, " +
  "view_count, comment_count, created_at, published_at, updated_at";

function toIsoOrNull(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return { ok: false };
  return { ok: true, value: new Date(t).toISOString() };
}

/** PHT 입력은 화면에서 ISO(UTC)로 바꿔 보낸다. 종료는 시작 이후여야 한다. */
export function parseNoticeWindow(
  startsRaw: unknown,
  endsRaw: unknown
): { ok: true; startsAt: string | null; endsAt: string | null } | { ok: false; error: string } {
  const s = toIsoOrNull(startsRaw);
  if (!s.ok) return { ok: false, error: "invalid_starts_at" };
  const e = toIsoOrNull(endsRaw);
  if (!e.ok) return { ok: false, error: "invalid_ends_at" };
  if (s.value && e.value && Date.parse(e.value) <= Date.parse(s.value)) {
    return { ok: false, error: "invalid_notice_window" };
  }
  return { ok: true, startsAt: s.value, endsAt: e.value };
}

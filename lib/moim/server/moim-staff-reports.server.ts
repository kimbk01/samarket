import "server-only";

import type { SupabaseServer } from "@/lib/chat/supabase-server";
import type { MoimStaffReportDto, MoimStaffReportTargetType } from "@/lib/moim/moim-api-types";
import { moimCanMap, type MoimAccess } from "@/lib/moim/server/moim-queries.server";

/**
 * 모임 안 신고 확인 (설계 moim §6 P13 「모임 안 처리」 · M6) — 권한 hide_post(운영진 이상)만.
 * 자기 모임의 글·댓글·사진에 대한 **열린 신고**(접수·검토 중)를 대상별로 묶어 보여 준다.
 * 신고자 정보(id·닉네임)는 읽지도 돌려주지도 않는다. 숨김은 기존 사용자 RPC(글·댓글·사진 삭제 → 운영진은 숨김)를 쓰고
 * 신고 상태는 바꾸지 않는다(플랫폼이 최종 판단).
 */

const STAFF_TARGET_TYPES: readonly MoimStaffReportTargetType[] = ["post", "comment", "album"];
/** 한 번에 읽는 열린 신고 행 상한 */
export const MOIM_STAFF_REPORT_SCAN_CAP = 500;

function excerpt(v: unknown, n = 160): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function normStatus(v: unknown): MoimStaffReportDto["status"] {
  return v === "active" || v === "hidden" || v === "deleted" ? v : "missing";
}

export async function listMoimStaffReports(
  sb: SupabaseServer,
  access: MoimAccess
): Promise<{ reports: MoimStaffReportDto[]; capped: boolean } | null> {
  if (!moimCanMap(access).hide_post) return null;
  const moimId = access.moim.id;
  const { data, error } = await sb
    .from("moim_reports")
    .select("target_type, target_id, reason_code, created_at")
    .eq("moim_id", moimId)
    .in("status", ["received", "reviewing"])
    .in("target_type", [...STAFF_TARGET_TYPES])
    .order("created_at", { ascending: false })
    .limit(MOIM_STAFF_REPORT_SCAN_CAP);
  if (error) return null;
  const rows = (data ?? []) as { target_type: MoimStaffReportTargetType; target_id: string; reason_code: string; created_at: string }[];

  const groups = new Map<string, { type: MoimStaffReportTargetType; id: string; count: number; latestAt: string; reasons: Map<string, number> }>();
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id}`;
    const g = groups.get(key) ?? { type: r.target_type, id: r.target_id, count: 0, latestAt: r.created_at, reasons: new Map() };
    g.count += 1;
    g.reasons.set(r.reason_code, (g.reasons.get(r.reason_code) ?? 0) + 1);
    if (r.created_at > g.latestAt) g.latestAt = r.created_at;
    groups.set(key, g);
  }
  const list = [...groups.values()];
  const idsOf = (t: MoimStaffReportTargetType) => list.filter((g) => g.type === t).map((g) => g.id);
  const postIds = idsOf("post");
  const commentIds = idsOf("comment");
  const albumIds = idsOf("album");

  // 모임 id 로 한 번 더 걸러 다른 모임 콘텐츠가 섞이지 않게 한다
  const [posts, comments, album] = await Promise.all([
    postIds.length
      ? sb.from("moim_posts").select("id, author_id, title, body, images, status").eq("moim_id", moimId).in("id", postIds)
      : Promise.resolve({ data: [] }),
    commentIds.length
      ? sb.from("moim_comments").select("id, post_id, author_id, body, status").eq("moim_id", moimId).in("id", commentIds)
      : Promise.resolve({ data: [] }),
    albumIds.length
      ? sb.from("moim_album_items").select("id, uploader_id, url, status").eq("moim_id", moimId).in("id", albumIds)
      : Promise.resolve({ data: [] }),
  ]);
  type PostRow = { id: string; author_id: string; title: string | null; body: string | null; images: unknown; status: string };
  type CommentRow = { id: string; post_id: string; author_id: string; body: string | null; status: string };
  type AlbumRow = { id: string; uploader_id: string; url: string; status: string };
  const postMap = new Map(((posts.data ?? []) as PostRow[]).map((x) => [x.id, x]));
  const commentMap = new Map(((comments.data ?? []) as CommentRow[]).map((x) => [x.id, x]));
  const albumMap = new Map(((album.data ?? []) as AlbumRow[]).map((x) => [x.id, x]));

  const authorIds = [
    ...[...postMap.values()].map((x) => x.author_id),
    ...[...commentMap.values()].map((x) => x.author_id),
    ...[...albumMap.values()].map((x) => x.uploader_id),
  ];
  const nickMap = new Map<string, string>();
  const uniqAuthors = [...new Set(authorIds)];
  if (uniqAuthors.length) {
    const { data: mem } = await sb.from("moim_members").select("user_id, nickname").eq("moim_id", moimId).in("user_id", uniqAuthors);
    for (const m of (mem ?? []) as { user_id: string; nickname: string }[]) nickMap.set(m.user_id, m.nickname);
  }

  const reports: MoimStaffReportDto[] = list.map((g) => {
    const base = {
      targetType: g.type,
      targetId: g.id,
      reportCount: g.count,
      reasons: [...g.reasons.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      latestAt: g.latestAt,
    };
    if (g.type === "post") {
      const p = postMap.get(g.id);
      const firstImage = Array.isArray(p?.images) ? (p?.images as unknown[]).find((x): x is string => typeof x === "string") ?? null : null;
      return {
        ...base,
        status: normStatus(p?.status),
        title: excerpt(p?.title, 80),
        excerpt: excerpt(p?.body),
        imageUrl: firstImage,
        postId: p ? p.id : null,
        authorNickname: p ? nickMap.get(p.author_id) ?? null : null,
      };
    }
    if (g.type === "comment") {
      const c = commentMap.get(g.id);
      return {
        ...base,
        status: normStatus(c?.status),
        title: null,
        excerpt: excerpt(c?.body),
        imageUrl: null,
        postId: c?.post_id ?? null,
        authorNickname: c ? nickMap.get(c.author_id) ?? null : null,
      };
    }
    const a = albumMap.get(g.id);
    return {
      ...base,
      status: normStatus(a?.status),
      title: null,
      excerpt: null,
      imageUrl: a?.url ?? null,
      postId: null,
      authorNickname: a ? nickMap.get(a.uploader_id) ?? null : null,
    };
  });
  // 숨길 수 있는 것(진행 중) 먼저 · 신고 많은 순 · 최근 순
  reports.sort(
    (a, b) =>
      Number(b.status === "active") - Number(a.status === "active") || b.reportCount - a.reportCount || b.latestAt.localeCompare(a.latestAt)
  );
  return { reports, capped: rows.length >= MOIM_STAFF_REPORT_SCAN_CAP };
}

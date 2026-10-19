/**
 * GET /api/admin/favorite-audit — 찜 기록 (거래 Admin 운영 기록 탭, 설계 v2 §F-4 · D-39)
 * 사용자 찜 목록(`/api/favorites/list` → `favorites`)과 별도로, 토글 시 쌓이는 `favorite_audit_log` 조회.
 * query: userId · postId · action · period/from/to · limit · offset (서버 페이지네이션 + 총 건수)
 */
import { NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  communityAdminUuidOrNull,
  parseCommunityAdminPage,
  parseCommunityAdminPeriodFromSearch,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;

  const { searchParams } = new URL(req.url);
  const { limit, offset } = parseCommunityAdminPage(searchParams);
  const period = parseCommunityAdminPeriodFromSearch(searchParams, { defaultPeriod: "all" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error, items: [] }, { status: 400 });
  const userId = communityAdminUuidOrNull(searchParams.get("userId"));
  const postId = communityAdminUuidOrNull(searchParams.get("postId"));
  const action = (searchParams.get("action") ?? "").trim().slice(0, 40);

  let q = sb.from("favorite_audit_log").select("id, user_id, post_id, action, created_at", { count: "exact" });
  if (userId) q = q.eq("user_id", userId);
  if (postId) q = q.eq("post_id", postId);
  if (action) q = q.eq("action", action);
  if (period.fromIso) q = q.gte("created_at", period.fromIso);
  if (period.toIso) q = q.lt("created_at", period.toIso);
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, items: [] }, { status: 500 });
  }
  const rows = (data ?? []) as { id: string; user_id: string | null; post_id: string | null; action: string; created_at: string }[];
  const postIds = [...new Set(rows.map((r) => r.post_id ?? "").filter(Boolean))];
  const [identities, posts] = await Promise.all([
    loadAdminMemberIdentityMap(sb, rows.map((r) => r.user_id ?? "")),
    postIds.length ? sb.from("posts").select("id, title").in("id", postIds) : Promise.resolve({ data: [] }),
  ]);
  const titles = new Map(((posts.data ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
  return NextResponse.json({
    ok: true,
    total: count ?? rows.length,
    limit,
    offset,
    items: rows.map((r) => ({
      ...r,
      user_label: r.user_id ? formatAdminMemberLabel(identities.get(r.user_id)) : null,
      post_title: r.post_id ? (titles.get(r.post_id) ?? null) : null,
    })),
  });
}

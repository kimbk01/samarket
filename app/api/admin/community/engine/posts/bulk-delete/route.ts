/**
 * POST /api/admin/community/engine/posts/bulk-delete
 * body: { ids: string[], reason: string } — 게시글 행 영구 삭제 (설계 O-2 · C-02).
 *
 * - 최고 관리자 전용, 사유 필수.
 * - 조건: 삭제 상태로 30일 경과 · 처리 안 된 신고 없음 · 노출 중/중지 홍보 없음 · 연결된 모임 없음.
 * - 삭제 전에 행 전체 스냅샷을 감사 기록에 남기고, 기록에 실패하면 그 글은 지우지 않는다.
 * - 사진: 글의 모든 사진 중 삭제 뒤 어디에서도 참조되지 않는 것만 저장소에서 지운다(Owner 승인 ③ 2026-10-31).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommunitySuperAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import {
  COMMUNITY_HARD_DELETE_MIN_DAYS,
  normalizeCommunityAdminReason,
} from "@/lib/admin/community-admin/community-admin-reason";
import { applyCommunityPointReclaimOnPostAdminRemove } from "@/lib/points/community-point-bridge";
import { collectCanonicalImagePublicUrls } from "@/lib/media/canonical-image-lifecycle.server";
import { parseSupabasePublicObjectUrl } from "@/lib/media/canonical-image-path";
import {
  collectCommunityPostRowImageUrls,
  findUnreferencedCommunityImages,
  removeCommunityPostImageOriginals,
} from "@/lib/community/community-post-image-gc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HardDeleteBlockReason =
  | "not_found"
  | "not_deleted"
  | "too_recent"
  | "open_reports"
  | "running_promotion"
  | "has_meeting"
  | "audit_failed"
  | "delete_failed";

function parseIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { ids?: unknown }).ids;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || !UUID_RE.test(id)) continue;
    out.push(id);
  }
  const uniq = [...new Set(out)];
  return uniq.length ? uniq : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireCommunitySuperAdmin();
  if (!gate.ok) return gate.response;
  const { sb } = gate;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const ids = parseIds(json);
  if (!ids) {
    return NextResponse.json({ ok: false, error: "ids_required" }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: "too_many", max: MAX_BATCH }, { status: 400 });
  }
  const reason = normalizeCommunityAdminReason((json as { reason?: unknown }).reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const [postsRes, reportsRes, promoRes, meetingsRes, commentCountRes] = await Promise.all([
    sb.from("community_posts").select("*").in("id", ids),
    sb
      .from("community_reports")
      .select("target_id")
      .eq("target_type", "post")
      .in("target_id", ids)
      .in("status", ["open", "reviewing"]),
    sb
      .from("point_promotion_orders")
      .select("target_id")
      .eq("domain", "community")
      .in("target_id", ids)
      .in("order_status", ["active", "paused", "pending_review"]),
    sb.from("meetings").select("post_id").in("post_id", ids),
    sb.from("community_comments").select("post_id").in("post_id", ids),
  ]);
  const firstErr = [postsRes, reportsRes, promoRes, meetingsRes, commentCountRes].find((r) => r.error);
  if (firstErr?.error) {
    return NextResponse.json({ ok: false, error: "preflight_failed" }, { status: 500 });
  }

  const openReports = new Set((reportsRes.data ?? []).map((r: { target_id: string }) => r.target_id));
  const runningPromo = new Set((promoRes.data ?? []).map((r: { target_id: string }) => r.target_id));
  const withMeeting = new Set((meetingsRes.data ?? []).map((r: { post_id: string }) => r.post_id));
  const commentCount = new Map<string, number>();
  for (const r of (commentCountRes.data ?? []) as { post_id: string }[]) {
    commentCount.set(r.post_id, (commentCount.get(r.post_id) ?? 0) + 1);
  }
  const rows = new Map(
    ((postsRes.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r])
  );
  const minAgeMs = COMMUNITY_HARD_DELETE_MIN_DAYS * 86_400_000;

  const blocked: { id: string; reason: HardDeleteBlockReason }[] = [];
  const eligible: string[] = [];
  for (const id of ids) {
    const row = rows.get(id);
    if (!row) blocked.push({ id, reason: "not_found" });
    else if (row.status !== "deleted") blocked.push({ id, reason: "not_deleted" });
    else if (Date.now() - new Date(String(row.updated_at ?? 0)).getTime() < minAgeMs)
      blocked.push({ id, reason: "too_recent" });
    else if (openReports.has(id)) blocked.push({ id, reason: "open_reports" });
    else if (runningPromo.has(id)) blocked.push({ id, reason: "running_promotion" });
    else if (withMeeting.has(id)) blocked.push({ id, reason: "has_meeting" });
    else eligible.push(id);
  }

  const deleted: string[] = [];
  for (const id of eligible) {
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: gate.userId,
      targetType: "community_post",
      targetId: id,
      action: "community_post.hard_delete",
      reason,
      before: { ...rows.get(id), comment_count_snapshot: commentCount.get(id) ?? 0 },
      after: null,
    });
    if (!audit.ok) {
      blocked.push({ id, reason: "audit_failed" });
      continue;
    }
    const { data: imageRows } = await sb
      .from("community_post_images")
      .select("image_url")
      .eq("post_id", id);
    /** 이 글의 사진 전부(첨부 표·images·대표·본문·서식 블록) — Owner 승인 ③: 등록 표에만 있던 것으로 한정하지 않는다 */
    const imageUrls = collectCanonicalImagePublicUrls([
      ...(imageRows ?? []).map((r: { image_url?: string }) => r.image_url),
      ...collectCommunityPostRowImageUrls(rows.get(id) ?? {}),
    ]);
    const { error } = await sb
      .from("community_posts")
      .delete()
      .eq("id", id)
      .eq("status", "deleted");
    if (error) {
      blocked.push({ id, reason: "delete_failed" });
      continue;
    }
    deleted.push(id);
    await applyCommunityPointReclaimOnPostAdminRemove({ postId: id });
    if (imageUrls.length > 0) {
      /** 글 삭제 뒤 참조 재확인 — 다른 글·기능에서 쓰는 사진은 지우지 않는다 */
      const originals = [
        ...new Set(
          imageUrls
            .map((u) => parseSupabasePublicObjectUrl(u))
            .filter((x): x is { bucket: "post-images"; path: string } => x?.bucket === "post-images")
            .map((x) => x.path)
        ),
      ];
      const unref = await findUnreferencedCommunityImages(sb, originals);
      if (!unref.ok) {
        console.error("[admin/community/posts/bulk-delete] reference check failed — storage kept", unref.error);
      } else if (unref.names.length > 0) {
        const removal = await removeCommunityPostImageOriginals(sb, unref.names);
        if (removal.failed.length > 0) {
          console.error("[admin/community/posts/bulk-delete] storage cleanup partial failure", removal.failed);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    deletedCount: deleted.length,
    blocked,
    minDeletedDays: COMMUNITY_HARD_DELETE_MIN_DAYS,
  });
}

import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  getAdminBannerById,
  insertBannerChangeLog,
  listBannerChangeLogs,
  removeAdminBanner,
  updateAdminBanner,
} from "@/lib/admin-banners/admin-banners-db";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { normalizeOptionalDestinationHref } from "@/lib/destination/optional-destination-href";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import { ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/operator-ux/admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  try {
    const [banner, logs] = await Promise.all([
      getAdminBannerById(sb, id),
      listBannerChangeLogs(sb, id, 50),
    ]);
    if (!banner) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, banner, logs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // G-18: 홍보 콘텐츠 쓰기 = ads 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<AdminBanner>;
  // EVT-07: link must be a valid DestinationRef (internal / event / https) — stored canonical.
  if (body.targetUrl != null) {
    const link = normalizeOptionalDestinationHref(body.targetUrl);
    if (!link.ok) {
      return NextResponse.json(
        { ok: false, error: `invalid_target_url:${link.error}` },
        { status: 400 }
      );
    }
    body.targetUrl = link.href;
  }

  try {
    const beforeBanner = await getAdminBannerById(sb, id).catch(() => null);
    const banner = await updateAdminBanner(sb, id, body);
    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", admin.userId)
      .maybeSingle();
    const nick = labelFromDisplayAndUsername(
      String(prof?.display_name ?? prof?.nickname ?? ""),
      String(prof?.username ?? "")
    );
    await insertBannerChangeLog(sb, {
      bannerId: id,
      actionType: "update",
      adminId: admin.userId,
      adminNickname: nick || "admin",
      note: "배너 수정",
    });
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "admin_banner",
      targetId: id,
      action: "banner.update",
      before: (beforeBanner as unknown as Record<string, unknown> | null) ?? null,
      after: banner as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true, banner });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

/**
 * 배너 삭제 (감사 AD-01 · Owner J-4): 노출 전 초안은 실제 삭제, 그 외는 숨김 보관 — `removeAdminBanner`.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // G-18: 홍보 콘텐츠 쓰기 = ads 키 (메뉴·CTA·API 동일 — admin-route-access.ts)
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  // 삭제 = L3 (사유 + 대상 재입력) — 화면과 같은 사유 규칙을 서버도 검증한다.
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < ADMIN_REASON_MIN_LENGTH) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  try {
    const result = await removeAdminBanner(sb, id);
    if (!result) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (result.kind === "archived") {
      await insertBannerChangeLog(sb, {
        bannerId: id,
        actionType: "hide",
        adminId: admin.userId,
        adminNickname: "admin",
        note: `배너 보관 (삭제 요청 · 게시 이력 있음) · 사유: ${reason}`,
      });
    }
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "admin_banner",
      targetId: id,
      action: result.kind === "deleted" ? "banner.delete" : "banner.archive",
      before: result.before as unknown as Record<string, unknown>,
      after: {
        reason,
        ...(result.kind === "archived" ? (result.banner as unknown as Record<string, unknown>) : {}),
      },
    });
    return NextResponse.json({ ok: true, result: result.kind });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

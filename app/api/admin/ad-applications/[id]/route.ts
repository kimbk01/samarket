import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  adminPatchPostAdInDb,
  fetchAdLogsForPostAdFromDb,
  fetchPostAdByIdForAdminFromDb,
  updatePostAdAdminNoteInDb,
} from "@/lib/ads/post-ads-supabase";
import { mapAdLogRow, mapPostAdRowToApplication } from "@/lib/ads/post-ad-application-adapter";
import { creditUserPoints } from "@/lib/points/user-point-ledger";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  action?: "confirm_payment" | "approve" | "reject" | "expire" | "save_memo";
  adminNote?: string;
  adminMemo?: string;
}

/**
 * GET /api/admin/ad-applications/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  const detail = await fetchPostAdByIdForAdminFromDb(svc, id);
  if (!detail.ok) {
    if ("notFound" in detail) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: detail.message ?? "db_failed" }, { status: 500 });
  }

  const application = mapPostAdRowToApplication({
    ...detail.row,
    durationDays: detail.durationDays,
  });

  const logsRes = await fetchAdLogsForPostAdFromDb(svc, id);
  const logs =
    logsRes.ok
      ? logsRes.logs.map((row) => mapAdLogRow(row))
      : [];

  return NextResponse.json({ ok: true, application, logs });
}

/**
 * PATCH /api/admin/ad-applications/[id]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  if (body.action === "save_memo") {
    const memo = body.adminMemo ?? body.adminNote ?? "";
    const res = await updatePostAdAdminNoteInDb(svc, id, memo);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.notFound ? "not_found" : res.error ?? "update_failed" },
        { status: res.notFound ? 404 : 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const action = body.action;
  if (!action || !["confirm_payment", "approve", "reject", "expire"].includes(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const db = await adminPatchPostAdInDb(svc, id, admin.userId, action, body.adminNote, {
    refundPoints: async ({ userId, pointCost, adProductName }) => {
      await creditUserPoints(svc, {
        userId,
        amount: pointCost,
        entryType: "ad_refund",
        relatedType: "ad_application",
        relatedId: id,
        description: `${adProductName ?? "광고"} 반려 환불`,
        actorType: "admin",
      });
    },
  });

  if (!db.ok) {
    return NextResponse.json(
      { ok: false, error: db.notFound ? "not_found" : db.error ?? "action_failed" },
      { status: db.notFound ? 404 : 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

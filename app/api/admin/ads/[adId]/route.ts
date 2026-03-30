import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { approvePostAd, rejectPostAd, updatePostAdStatus } from "@/lib/ads/mock-ad-data";
import type { AdApplyStatus } from "@/lib/ads/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { adminPatchPostAdInDb } from "@/lib/ads/post-ads-supabase";

interface PatchBody {
  action?: "approve" | "reject" | "cancel" | "expire" | "update";
  adminNote?: string;
  priority?: number;
  endAt?: string;
  status?: AdApplyStatus;
}

/**
 * PATCH /api/admin/ads/[adId]
 * 관리자: 광고 신청 상태 변경 (승인/반려/취소/만료/메모)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ adId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { adId } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { action, adminNote, priority, endAt, status } = body;
  const adminId = admin.userId;

  const svc = tryCreateSupabaseServiceClient();
  if (svc && (action === "approve" || action === "reject" || action === "cancel" || action === "expire")) {
    const db = await adminPatchPostAdInDb(svc, adId, adminId, action, adminNote);
    if (db.ok) {
      return NextResponse.json({ ok: true, source: "supabase" });
    }
    if (!db.notFound) {
      return NextResponse.json({ ok: false, error: db.error ?? "db_failed" }, { status: 400 });
    }
  }

  let result: { ok: boolean; error?: string };
  if (action === "approve") {
    result = approvePostAd(adId, adminId, adminNote);
  } else if (action === "reject") {
    result = rejectPostAd(adId, adminId, adminNote ?? "");
  } else if (action === "cancel") {
    result = updatePostAdStatus(adId, adminId, { status: "cancelled", adminNote });
  } else if (action === "expire") {
    result = updatePostAdStatus(adId, adminId, { status: "expired", adminNote });
  } else {
    result = updatePostAdStatus(adId, adminId, {
      status: status as AdApplyStatus | undefined,
      adminNote,
      priority,
      endAt,
    });
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, source: "memory" });
}

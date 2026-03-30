import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  approvePointChargeRequest,
  rejectPointChargeRequest,
  holdPointChargeRequest,
  setPointChargeRequestAdminMemo,
} from "@/lib/points/mock-point-charge-requests";

interface PatchBody {
  action: "approve" | "reject" | "hold";
  adminMemo?: string;
}

/**
 * PATCH /api/admin/point-charges/[id]
 * 관리자: 충전 신청 승인/반려/보류
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id } = await params;
  let body: Partial<PatchBody>;
  try {
    body = (await req.json()) as Partial<PatchBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { action, adminMemo } = body;
  if (adminMemo !== undefined) {
    setPointChargeRequestAdminMemo(id, adminMemo);
  }

  let result: ReturnType<typeof approvePointChargeRequest>;
  if (action === "approve") {
    result = approvePointChargeRequest(id);
  } else if (action === "reject") {
    result = rejectPointChargeRequest(id);
  } else if (action === "hold") {
    result = holdPointChargeRequest(id);
  } else if (!action && adminMemo !== undefined) {
    return NextResponse.json({ ok: true });
  } else {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  if (!result) {
    return NextResponse.json({ ok: false, error: "not_found_or_already_processed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, request: result });
}
